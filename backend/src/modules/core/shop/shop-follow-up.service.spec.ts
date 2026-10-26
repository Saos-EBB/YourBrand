import 'reflect-metadata';
import { ShopFollowUpService } from './shop-follow-up.service';
import { ShopAlertService } from './shop-alert.service';

type Answer = unknown[] | ((params: unknown[]) => unknown[]);

// Antworten nach SQL-Teilstueck, alle Aufrufe werden mitgeschrieben
function setup(answers: Record<string, Answer>, opts: { stripeFails?: boolean } = {}) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        const key = Object.keys(answers).find((k) => sql.includes(k));
        if (!key) return [];
        const a = answers[key];
        return typeof a === 'function' ? a(params) : a;
    });
    const ds = { query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) };
    const payments = { cancel: jest.fn(async () => { if (opts.stripeFails) throw new Error('No such payment_intent'); }) };
    const alerts = { send: jest.fn(async () => undefined) };
    const buyerMail = { declined: jest.fn(async () => undefined) };
    const intake = { hold: jest.fn(async () => undefined) };
    const cronLock = { runOnce: (_n: string, _g: number, fn: () => Promise<void>) => fn() };
    const service = new ShopFollowUpService(ds as any, { payments: () => payments } as any, alerts as any, buyerMail as any, intake as any, cronLock as any);
    return { service, calls, payments, alerts, buyerMail, intake };
}

describe('ShopFollowUpService', () => {
    it('erinnert 30 Min. vor der Frist, einmal pro Bestellung', async () => {
        const { service, calls, alerts } = setup({ "'reminder'": [{ order_id: 'o1' }, { order_id: 'o2' }] });
        await service.remindDecisions();
        const sql = calls[0].sql;
        expect(sql).toContain(`interval '30 minutes'`);
        expect(sql).toContain('NOT EXISTS');
        expect(alerts.send.mock.calls).toEqual([['decide_soon', { orderId: 'o1' }], ['decide_soon', { orderId: 'o2' }]]);
    });

    it('Frist abgelaufen: Reservierung aufheben, expired, Protokoll, Alarm', async () => {
        const { service, calls, payments, alerts, buyerMail } = setup({
            'SELECT id, stripe_payment_intent_id': [{ id: 'o1', stripe_payment_intent_id: 'pi_1' }],
            "SET status = 'expired'": [[{ id: 'o1' }], 1],
        });
        await service.expireHeld();
        expect(buyerMail.declined).toHaveBeenCalledWith('o1', 'expired');
        expect(payments.cancel).toHaveBeenCalledWith('pi_1', 'shop-expire-o1');
        expect(calls.find((c) => c.sql.includes("SET status = 'expired'"))!.sql).toContain(`status = 'held'`);
        expect(calls.some((c) => c.sql.includes(`'expired', '{}'`))).toBe(true);
        expect(alerts.send).toHaveBeenCalledWith('expired', { orderId: 'o1' });
    });

    it('Admin war schneller: kein expired-Eintrag, kein Alarm', async () => {
        const { service, calls, alerts } = setup({
            'SELECT id, stripe_payment_intent_id': [{ id: 'o1', stripe_payment_intent_id: 'pi_1' }],
            "SET status = 'expired'": [[], 0],
        });
        await service.expireHeld();
        expect(calls.some((c) => c.sql.includes(`'expired', '{}'`))).toBe(false);
        expect(alerts.send).not.toHaveBeenCalled();
    });

    it('Stripe-Fehler: bleibt angehalten, Fehler einmal ins Protokoll', async () => {
        const { service, calls, alerts } = setup(
            { 'SELECT id, stripe_payment_intent_id': [{ id: 'o1', stripe_payment_intent_id: 'pi_1' }] }, { stripeFails: true },
        );
        await service.expireHeld();
        expect(calls.some((c) => c.sql.includes("SET status = 'expired'"))).toBe(false);
        const err = calls.find((c) => c.sql.includes("'stripe_error'"))!;
        expect(err.sql).toContain(`data->>'action' = 'expire'`);
        expect(JSON.parse(err.params[1] as string)).toEqual({ action: 'expire', message: 'No such payment_intent' });
        expect(alerts.send).not.toHaveBeenCalled();
    });

    it('haengen gebliebene Reservierung (5 Min.) wird angehalten', async () => {
        const { service, calls, intake } = setup({ "status = 'authorized'": [{ id: 'o1' }] });
        await service.holdStuck();
        expect(calls[0].sql).toContain(`interval '5 minutes'`);
        expect(intake.hold).toHaveBeenCalledWith('o1', ['system_error']);
    });

    it('ueberfaellige Faelle: nur open, mit Pause je nach Dringlichkeit', async () => {
        const { service, calls, alerts } = setup({ 'UPDATE shop_cases': [[{ id: 'c1', order_id: 'o1' }, { id: 'c2', order_id: null }], 2] });
        await service.alertOverdueCases();
        expect(calls[0].sql).toContain(`status = 'open' AND due_at < now()`);
        expect(calls[0].sql).toContain(`WHEN 'urgent' THEN interval '30 minutes'`);
        expect(alerts.send.mock.calls).toEqual([['case_overdue', { caseId: 'c1', orderId: 'o1' }], ['case_overdue', { caseId: 'c2' }]]);
    });

    it('ein Fehler im Lauf bricht nichts ab, Laeufe stapeln sich nicht', async () => {
        const { service, payments } = setup({ "'reminder'": () => { throw new Error('db weg'); } });
        await expect(service.run()).resolves.toBeUndefined();
        expect(payments.cancel).not.toHaveBeenCalled();
    });
});

describe('ShopAlertService', () => {
    function alertSetup(mailFails = false) {
        const emit = jest.fn();
        const sendShopAlertEmail = jest.fn(async () => { if (mailFails) throw new Error('resend down'); });
        const ds = { query: jest.fn(async (_sql: string) => [{ email: null }]) };
        const service = new ShopAlertService(ds as any, { emit } as any, { sendShopAlertEmail } as any);
        return { service, emit, sendShopAlertEmail, ds };
    }

    it('normale Alarme nur per Socket', async () => {
        const { service, emit, ds } = alertSetup();
        await service.send('case_opened', { orderId: 'o1', caseId: 'c1' });
        expect(emit).toHaveBeenCalledWith('shop.alert', { kind: 'case_opened', orderId: 'o1', caseId: 'c1' });
        expect(ds.query).not.toHaveBeenCalled();
    });

    it('dringende auch per Mail; Mail-Fehler bricht nichts ab', async () => {
        const { service, ds } = alertSetup(true);
        await expect(service.send('not_met', { orderId: 'o1' })).resolves.toBeUndefined();
        expect(ds.query.mock.calls[0][0]).toContain(`role IN ('admin', 'owner')`);
    });
});
