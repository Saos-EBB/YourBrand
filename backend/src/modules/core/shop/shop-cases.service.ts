import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AdminListCasesQuery, OpenProblemDto, ReportBuyerDto } from './dto/case.dto';
import { ShopAlertService } from './shop-alert.service';

const CASE_PAGE_SIZE = 50;
// Bis wann das Team reagieren soll — der Nachfass-Cron (ShopFollowUpService) meldet sich danach
// Rueckbuchung: Stripe gibt meist 7–21 Tage fuer Beweise, das Team soll trotzdem schnell draufschauen
const DUE = { problem: '24 hours', report: '72 hours', not_met: '2 hours', dispute: '48 hours' } as const;
const PRIORITY = { problem: 'normal', report: 'normal', not_met: 'urgent', dispute: 'urgent' } as const;
// Abgebrochene Kassen sind keine Bestellung, dazu gibt es nichts zu melden
const NO_CASE_STATUS = ['pending', 'cancelled'];

// Faelle rund um Bestellungen: Kaeufer meldet ein Problem (sieht den Verlauf),
// Team meldet einen Kaeufer (nur intern), "nicht angetroffen" oeffnet selbst einen Fall.
@Injectable()
export class ShopCasesService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly alerts: ShopAlertService,
    ) { }

    // ---- Kaeufer ------------------------------------------------------------

    async openProblem(userId: string, orderId: string, dto: OpenProblemDto) {
        const [order] = await this.dataSource.query('SELECT status FROM shop_orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
        if (!order) throw new NotFoundException('Bestellung nicht gefunden');
        if (NO_CASE_STATUS.includes(order.status)) throw new BadRequestException('Zu dieser Bestellung kann man nichts melden');

        const created = await this.dataSource.transaction(async (m) => {
            // eine offene Meldung pro Bestellung reicht — weiter schreiben geht im Verlauf
            const [open] = await m.query(
                `SELECT id FROM shop_cases WHERE order_id = $1 AND opened_by = $2 AND kind = 'problem' AND status <> 'resolved' FOR UPDATE`,
                [orderId, userId],
            );
            if (open) throw new ConflictException('Es gibt schon eine offene Meldung — schreib einfach dort weiter');
            const id = await this.insertCase(m, { orderId, openedBy: userId, againstUserId: null, kind: 'problem', reason: dto.reason });
            await this.insertMessage(m, id, userId, dto.message.trim(), false);
            return { id };
        });
        await this.alerts.send('case_opened', { orderId, caseId: created.id });
        return created;
    }

    // Problem-Meldungen des Kaeufers zu einer Bestellung, ohne interne Notizen
    async buyerCases(userId: string, orderId: string) {
        const cases = await this.dataSource.query(
            `SELECT id, reason, status, created_at, resolved_at, resolution FROM shop_cases
              WHERE order_id = $1 AND opened_by = $2 AND kind = 'problem' ORDER BY created_at`,
            [orderId, userId],
        );
        if (!cases.length) return [];
        const messages = await this.dataSource.query(
            `SELECT msg.id, msg.case_id, msg.body, msg.created_at, (msg.author_id = $2) AS mine
               FROM shop_case_messages msg WHERE msg.case_id = ANY($1) AND NOT msg.internal ORDER BY msg.created_at`,
            [cases.map((c: { id: string }) => c.id), userId],
        );
        return cases.map((c: { id: string }) => ({ ...c, messages: messages.filter((x: { case_id: string }) => x.case_id === c.id) }));
    }

    async buyerReply(userId: string, caseId: string, body: string) {
        const [c] = await this.dataSource.query(
            `SELECT status FROM shop_cases WHERE id = $1 AND opened_by = $2 AND kind = 'problem'`, [caseId, userId],
        );
        if (!c) throw new NotFoundException('Meldung nicht gefunden');
        if (c.status === 'resolved') throw new ConflictException('Die Meldung ist abgeschlossen — bei Bedarf eine neue aufmachen');
        await this.dataSource.transaction(async (m) => {
            await this.insertMessage(m, caseId, userId, body.trim(), false);
            // Kaeufer hat geantwortet: wieder beim Team, mit neuer Frist
            await m.query(
                `UPDATE shop_cases SET status = 'open', due_at = now() + $2::interval, last_alert_at = NULL
                  WHERE id = $1 AND status = 'waiting'`,
                [caseId, DUE.problem],
            );
        });
        await this.alerts.send('case_reply', { caseId });
        return { ok: true };
    }

    // ---- Team -----------------------------------------------------------------

    async listCases(query: AdminListCasesQuery) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        const status = query.status ?? 'active';
        if (status === 'active') conditions.push(`c.status <> 'resolved'`);
        else if (status !== 'all') { params.push(status); conditions.push(`c.status = $${params.length}`); }
        if (query.kind) { params.push(query.kind); conditions.push(`c.kind = $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const page = query.page ?? 1;
        // Dringendes zuerst, dann was zuerst faellig ist
        const order = status === 'resolved' ? 'c.resolved_at DESC' : `CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, c.due_at`;

        const [items, [{ total }], counts] = await Promise.all([
            this.dataSource.query(
                `SELECT c.id, c.order_id, c.kind, c.reason, c.status, c.priority, c.due_at, c.created_at, c.resolved_at,
                        op.nickname AS opened_by_nickname, ag.nickname AS against_nickname,
                        (SELECT m.body FROM shop_case_messages m WHERE m.case_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                        (SELECT count(*)::int FROM shop_case_messages m WHERE m.case_id = c.id) AS message_count
                   FROM shop_cases c
                   LEFT JOIN profiles op ON op.user_id = c.opened_by
                   LEFT JOIN profiles ag ON ag.user_id = c.against_user_id
                   ${where} ORDER BY ${order}, c.id LIMIT ${CASE_PAGE_SIZE} OFFSET $${params.length + 1}`,
                [...params, (page - 1) * CASE_PAGE_SIZE],
            ),
            this.dataSource.query(`SELECT count(*)::int AS total FROM shop_cases c ${where}`, params),
            this.dataSource.query(`SELECT status, count(*)::int AS n FROM shop_cases GROUP BY status`),
        ]);
        return {
            items, total, page, limit: CASE_PAGE_SIZE,
            counts: Object.fromEntries(counts.map((r: { status: string; n: number }) => [r.status, r.n])),
        };
    }

    async getCase(id: string) {
        const [c] = await this.dataSource.query(
            `SELECT c.*, op.nickname AS opened_by_nickname, ag.nickname AS against_nickname, rs.nickname AS resolved_by_nickname,
                    o.status AS order_status, o.delivery_mode, o.total_cents, o.user_id AS buyer_id
               FROM shop_cases c
               LEFT JOIN profiles op ON op.user_id = c.opened_by
               LEFT JOIN profiles ag ON ag.user_id = c.against_user_id
               LEFT JOIN profiles rs ON rs.user_id = c.resolved_by
               LEFT JOIN shop_orders o ON o.id = c.order_id
              WHERE c.id = $1`,
            [id],
        );
        if (!c) throw new NotFoundException('Fall nicht gefunden');
        const messages = await this.dataSource.query(
            `SELECT m.id, m.body, m.internal, m.created_at, m.author_id, pr.nickname AS author_nickname,
                    (m.author_id IS NOT NULL AND m.author_id = $2) AS from_buyer
               FROM shop_case_messages m LEFT JOIN profiles pr ON pr.user_id = m.author_id
              WHERE m.case_id = $1 ORDER BY m.created_at`,
            [id, c.buyer_id],
        );
        return { ...c, messages };
    }

    // Antwort ans Team-Postfach: oeffentlich = Kaeufer sieht sie und ist dran (waiting)
    async adminReply(adminId: string, caseId: string, body: string, internal: boolean) {
        const [c] = await this.dataSource.query('SELECT status, kind FROM shop_cases WHERE id = $1', [caseId]);
        if (!c) throw new NotFoundException('Fall nicht gefunden');
        if (c.status === 'resolved') throw new ConflictException('Fall ist abgeschlossen');
        // Meldungen gegen Kaeufer und Rueckbuchungen sind intern — dort gibt es niemanden, der antwortet
        const isInternal = internal || ['report', 'not_met', 'dispute'].includes(c.kind);
        await this.dataSource.transaction(async (m) => {
            await this.insertMessage(m, caseId, adminId, body.trim(), isInternal);
            if (!isInternal) await m.query(`UPDATE shop_cases SET status = 'waiting' WHERE id = $1 AND status = 'open'`, [caseId]);
        });
        return { ok: true, internal: isInternal };
    }

    async resolve(adminId: string, caseId: string, resolution: string) {
        const rows = await this.dataSource.query(
            `UPDATE shop_cases SET status = 'resolved', resolved_by = $2, resolved_at = now(), resolution = $3
              WHERE id = $1 AND status <> 'resolved' RETURNING id`,
            [caseId, adminId, resolution.trim()],
        );
        // UPDATE ... RETURNING liefert bei pg [rows, rowCount]
        if (!(Array.isArray(rows[0]) ? rows[0] : rows).length) throw new ConflictException('Fall nicht gefunden oder schon abgeschlossen');
        return { ok: true };
    }

    async reportBuyer(adminId: string, orderId: string, dto: ReportBuyerDto) {
        const [order] = await this.dataSource.query('SELECT user_id FROM shop_orders WHERE id = $1', [orderId]);
        if (!order) throw new NotFoundException('Bestellung nicht gefunden');
        if (!order.user_id) throw new BadRequestException('Konto des Käufers ist gelöscht');
        return this.dataSource.transaction(async (m) => {
            const id = await this.insertCase(m, { orderId, openedBy: adminId, againstUserId: order.user_id, kind: 'report', reason: dto.reason });
            await this.insertMessage(m, id, adminId, dto.note.trim(), true);
            return { id };
        });
    }

    // Vom Lieferstand "nicht angetroffen" (Schritt 7) — in dessen Transaktion
    async openNotMet(m: EntityManager, adminId: string, orderId: string) {
        const [order] = await m.query('SELECT user_id FROM shop_orders WHERE id = $1', [orderId]);
        const id = await this.insertCase(m, { orderId, openedBy: adminId, againstUserId: order?.user_id ?? null, kind: 'not_met', reason: 'no_show' });
        await this.insertMessage(m, id, adminId, 'Käufer bei Lieferung/Abholung nicht angetroffen.', true);
        return id;
    }

    // Stripe meldet eine Rueckbuchung (Webhook ueber den Broker). Einmal pro Dispute.
    async openDispute(orderId: string, disputeId: string, reason: string, amountCents: number): Promise<string | null> {
        const [existing] = await this.dataSource.query('SELECT id FROM shop_cases WHERE stripe_dispute_id = $1', [disputeId]);
        if (existing) return null;
        return this.dataSource.transaction(async (m) => {
            const [order] = await m.query('SELECT user_id FROM shop_orders WHERE id = $1', [orderId]);
            if (!order) return null;
            const id = await this.insertCase(m, { orderId, openedBy: null, againstUserId: order.user_id, kind: 'dispute', reason: reason.slice(0, 30) });
            await m.query('UPDATE shop_cases SET stripe_dispute_id = $2 WHERE id = $1', [id, disputeId]);
            await this.insertMessage(m, id, null,
                `Stripe: Rückbuchung über ${(amountCents / 100).toFixed(2).replace('.', ',')} € eröffnet (Grund: ${reason}). Beweise im Stripe-Dashboard einreichen.`, true);
            return id;
        });
    }

    // Ausgang der Rueckbuchung als interne Notiz; abschliessen macht ein Mensch
    async noteDisputeClosed(disputeId: string, status: string): Promise<string | null> {
        const [c] = await this.dataSource.query('SELECT id FROM shop_cases WHERE stripe_dispute_id = $1', [disputeId]);
        if (!c) return null;
        const outcome = status === 'won' ? 'gewonnen — das Geld bleibt' : status === 'lost' ? 'verloren — das Geld ist zurückgebucht' : status;
        await this.dataSource.transaction((m) => this.insertMessage(m, c.id, null, `Stripe: Rückbuchung abgeschlossen, ${outcome}.`, true));
        return c.id;
    }

    private async insertCase(m: EntityManager, c: {
        orderId: string; openedBy: string | null; againstUserId: string | null; kind: keyof typeof DUE; reason: string;
    }): Promise<string> {
        const [row] = await m.query(
            `INSERT INTO shop_cases (order_id, opened_by, against_user_id, kind, reason, priority, due_at)
             VALUES ($1, $2, $3, $4, $5, $6, now() + $7::interval) RETURNING id`,
            [c.orderId, c.openedBy, c.againstUserId, c.kind, c.reason, PRIORITY[c.kind], DUE[c.kind]],
        );
        await m.query(
            `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'case_opened', $3)`,
            [c.orderId, c.openedBy, JSON.stringify({ case_id: row.id, kind: c.kind, reason: c.reason })],
        );
        return row.id;
    }

    // authorId null = System (Stripe)
    private async insertMessage(m: EntityManager, caseId: string, authorId: string | null, body: string, internal: boolean) {
        await m.query(
            'INSERT INTO shop_case_messages (case_id, author_id, body, internal) VALUES ($1, $2, $3, $4)',
            [caseId, authorId, body, internal],
        );
    }
}
