import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ShopCasesService } from './shop-cases.service';
import { OpenProblemDto, ReportBuyerDto } from './dto/case.dto';

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

// Antworten nach SQL-Anfang; alle Aufrufe werden mitgeschrieben
function setup(answers: Record<string, unknown[]>) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        const key = Object.keys(answers).find((k) => sql.includes(k));
        return key ? answers[key] : [];
    });
    const ds = { query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) };
    const alerts = { send: jest.fn(async () => undefined) };
    return { service: new ShopCasesService(ds as any, alerts as any), calls, alerts };
}
const problem = { reason: 'damaged', message: 'Tasse kam kaputt an' } as OpenProblemDto;

describe('ShopCasesService', () => {
    it('Problem melden: Fall + erste Nachricht + Protokoll', async () => {
        const { service, calls } = setup({ 'SELECT status FROM shop_orders': [{ status: 'fulfilled' }], 'INSERT INTO shop_cases': [{ id: 'c1' }] });
        await expect(service.openProblem(USER, 'o1', problem)).resolves.toEqual({ id: 'c1' });
        const insert = calls.find((c) => c.sql.includes('INSERT INTO shop_cases'))!;
        expect(insert.params.slice(0, 6)).toEqual(['o1', USER, null, 'problem', 'damaged', 'normal']);
        expect(calls.some((c) => c.sql.includes("'case_opened'"))).toBe(true);
        const msg = calls.find((c) => c.sql.includes('INSERT INTO shop_case_messages'))!;
        expect(msg.params).toEqual(['c1', USER, 'Tasse kam kaputt an', false]);
    });

    it('Problem melden alarmiert das Team; Antwort des Kaeufers gibt neue Frist und alarmiert', async () => {
        const a = setup({ 'SELECT status FROM shop_orders': [{ status: 'fulfilled' }], 'INSERT INTO shop_cases': [{ id: 'c1' }] });
        await a.service.openProblem(USER, 'o1', problem);
        expect(a.alerts.send).toHaveBeenCalledWith('case_opened', { orderId: 'o1', caseId: 'c1' });
        const r = setup({ 'SELECT status FROM shop_cases': [{ status: 'waiting' }] });
        await r.service.buyerReply(USER, 'c1', 'Und jetzt?');
        const reopen = r.calls.find((c) => c.sql.includes(`SET status = 'open'`))!;
        expect(reopen.sql).toContain('last_alert_at = NULL');
        expect(reopen.params).toEqual(['c1', '24 hours']);
        expect(r.alerts.send).toHaveBeenCalledWith('case_reply', { caseId: 'c1' });
    });

    it('fremde Bestellung 404, abgebrochene Kasse 400, zweite offene Meldung 409', async () => {
        await expect(setup({}).service.openProblem(USER, 'o1', problem)).rejects.toBeInstanceOf(NotFoundException);
        await expect(setup({ 'SELECT status FROM shop_orders': [{ status: 'pending' }] }).service.openProblem(USER, 'o1', problem))
            .rejects.toBeInstanceOf(BadRequestException);
        await expect(setup({ 'SELECT status FROM shop_orders': [{ status: 'approved' }], 'FOR UPDATE': [{ id: 'c0' }] })
            .service.openProblem(USER, 'o1', problem)).rejects.toThrow(/schon eine offene/);
    });

    it('Kaeufer antwortet: Fall geht zurueck ans Team; abgeschlossen = 409', async () => {
        const { service, calls } = setup({ 'SELECT status FROM shop_cases': [{ status: 'waiting' }] });
        await service.buyerReply(USER, 'c1', ' danke ');
        expect(calls.some((c) => c.sql.includes(`SET status = 'open'`))).toBe(true);
        await expect(setup({ 'SELECT status FROM shop_cases': [{ status: 'resolved' }] }).service.buyerReply(USER, 'c1', 'x'))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('Team antwortet oeffentlich: wartet auf Kaeufer; bei Meldungen gegen Kaeufer immer intern', async () => {
        const pub = setup({ 'SELECT status, kind': [{ status: 'open', kind: 'problem' }] });
        await expect(pub.service.adminReply(ADMIN, 'c1', 'Ersatz ist unterwegs', false)).resolves.toEqual({ ok: true, internal: false });
        expect(pub.calls.some((c) => c.sql.includes(`SET status = 'waiting'`))).toBe(true);
        const rep = setup({ 'SELECT status, kind': [{ status: 'open', kind: 'report' }] });
        await expect(rep.service.adminReply(ADMIN, 'c1', 'nochmal versucht', false)).resolves.toEqual({ ok: true, internal: true });
        expect(rep.calls.some((c) => c.sql.includes(`SET status = 'waiting'`))).toBe(false);
    });

    it('Abschliessen nur einmal', async () => {
        await expect(setup({ UPDATE: [[{ id: 'c1' }], 1] }).service.resolve(ADMIN, 'c1', 'Ersatz geschickt')).resolves.toEqual({ ok: true });
        await expect(setup({ UPDATE: [[], 0] }).service.resolve(ADMIN, 'c1', 'Ersatz geschickt')).rejects.toBeInstanceOf(ConflictException);
    });

    it('Kaeufer melden: Fall gegen den Kaeufer, Notiz intern', async () => {
        const { service, calls } = setup({ 'SELECT user_id FROM shop_orders': [{ user_id: USER }], 'INSERT INTO shop_cases': [{ id: 'c2' }] });
        await service.reportBuyer(ADMIN, 'o1', { reason: 'no_show', note: 'Dritte Abholung verpasst' } as ReportBuyerDto);
        expect(calls.find((c) => c.sql.includes('INSERT INTO shop_cases'))!.params.slice(1, 4)).toEqual([ADMIN, USER, 'report']);
        expect(calls.find((c) => c.sql.includes('INSERT INTO shop_case_messages'))!.params[3]).toBe(true);
    });

    it('DTOs: Grund aus der Liste, Beschreibung mindestens 10 Zeichen', () => {
        const errs = (cls: any, raw: object) => validateSync(plainToInstance(cls, raw)).map((e) => e.property);
        expect(errs(OpenProblemDto, { reason: 'boring', message: 'zu kurz' })).toEqual(['reason', 'message']);
        expect(errs(OpenProblemDto, problem)).toEqual([]);
        expect(errs(ReportBuyerDto, { reason: 'damaged', note: 'Dritte Abholung verpasst' })).toEqual(['reason']);
    });

    it('Rueckbuchung: dringender interner Fall gegen den Kaeufer, einmal pro Dispute', async () => {
        const { service, calls } = setup({ 'SELECT user_id FROM shop_orders': [{ user_id: USER }], 'INSERT INTO shop_cases': [{ id: 'c9' }] });
        await expect(service.openDispute('o1', 'dp_1', 'fraudulent', 990)).resolves.toBe('c9');
        const insert = calls.find((c) => c.sql.includes('INSERT INTO shop_cases'))!;
        expect(insert.params.slice(0, 7)).toEqual(['o1', null, USER, 'dispute', 'fraudulent', 'urgent', '48 hours']);
        expect(calls.find((c) => c.sql.includes('stripe_dispute_id = $2'))!.params).toEqual(['c9', 'dp_1']);
        const msg = calls.find((c) => c.sql.includes('INSERT INTO shop_case_messages'))!;
        expect(msg.params[1]).toBeNull();
        expect(msg.params[3]).toBe(true);
        const again = setup({ 'WHERE stripe_dispute_id = $1': [{ id: 'c9' }] });
        await expect(again.service.openDispute('o1', 'dp_1', 'fraudulent', 990)).resolves.toBeNull();
    });

    it('Rueckbuchung geschlossen: interne Notiz mit Ausgang', async () => {
        const { service, calls } = setup({ 'WHERE stripe_dispute_id = $1': [{ id: 'c9' }] });
        await expect(service.noteDisputeClosed('dp_1', 'lost')).resolves.toBe('c9');
        expect(calls.find((c) => c.sql.includes('INSERT INTO shop_case_messages'))!.params[2]).toMatch(/verloren/);
    });

    it('Team-Antwort in einer Rueckbuchung ist immer intern', async () => {
        const { service } = setup({ 'SELECT status, kind FROM shop_cases': [{ status: 'open', kind: 'dispute' }] });
        await expect(service.adminReply(ADMIN, 'c9', 'Beweise hochgeladen', false)).resolves.toEqual({ ok: true, internal: true });
    });
});
