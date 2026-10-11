import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { AdminListOrdersQuery } from './dto/admin-order.dto';
import { ShopFulfillmentService } from './shop-fulfillment.service';
import { ShopInvoiceService } from './shop-invoice.service';
import { ShopBuyerMailService } from './shop-buyer-mail.service';

const ORDER_PAGE_SIZE = 50;

// Was ein Mensch entscheiden kann: nur angehaltene Bestellungen. Unauffaellige
// nimmt das System selbst an (Schritt 5).
const DECIDABLE = 'held';

@Injectable()
export class ShopOrdersAdminService {
    private readonly logger = new Logger(ShopOrdersAdminService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly broker: ModuleBroker,
        private readonly fulfillment: ShopFulfillmentService,
        private readonly invoices: ShopInvoiceService,
        private readonly buyerMail: ShopBuyerMailService,
    ) { }

    async listOrders(query: AdminListOrdersQuery) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (query.q?.trim()) {
            const q = query.q.trim();
            params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
            const like = `$${params.length}`;
            params.push(`${q.toLowerCase().replace(/[^0-9a-f-]/g, '')}%`);
            conditions.push(`(o.id::text LIKE $${params.length} OR o.buyer_email ILIKE ${like}
                OR o.contact_name ILIKE ${like} OR o.buyer_name ILIKE ${like} OR pr.nickname ILIKE ${like})`);
        }
        const status = query.status ?? DECIDABLE;
        if (status !== 'all') { params.push(status); conditions.push(`o.status = $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        // Angehaltene: was zuerst ablaeuft, steht oben
        const order = status === DECIDABLE ? 'o.decide_by ASC NULLS LAST, o.created_at' : 'o.created_at DESC';
        const page = query.page ?? 1;
        const from = 'FROM shop_orders o LEFT JOIN profiles pr ON pr.user_id = o.user_id';

        const [items, [{ total }], counts] = await Promise.all([
            this.dataSource.query(
                `SELECT o.id, o.status, o.progress, o.delivery_mode, o.total_cents, o.currency, o.created_at, o.decide_by,
                        o.hold_reasons, o.radar_risk, COALESCE(o.buyer_name, o.contact_name) AS buyer_name,
                        pr.nickname,
                        (SELECT count(*)::int FROM shop_order_items i WHERE i.order_id = o.id) AS item_count,
                        (SELECT i.title FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS first_title
                   ${from} ${where}
                  ORDER BY ${order}, o.id LIMIT ${ORDER_PAGE_SIZE} OFFSET $${params.length + 1}`,
                [...params, (page - 1) * ORDER_PAGE_SIZE],
            ),
            this.dataSource.query(`SELECT count(*)::int AS total ${from} ${where}`, params),
            this.dataSource.query(`SELECT status, count(*)::int AS n FROM shop_orders GROUP BY status`),
        ]);
        return {
            items, total, page, limit: ORDER_PAGE_SIZE,
            counts: Object.fromEntries(counts.map((c: { status: string; n: number }) => [c.status, c.n])),
        };
    }

    async getOrder(id: string) {
        const [order] = await this.dataSource.query(
            `SELECT o.*, pr.nickname, dp.nickname AS decided_by_nickname
               FROM shop_orders o
               LEFT JOIN profiles pr ON pr.user_id = o.user_id
               LEFT JOIN profiles dp ON dp.user_id = o.decided_by
              WHERE o.id = $1`,
            [id],
        );
        if (!order) throw new NotFoundException('Bestellung nicht gefunden');

        const [items, events, [history], cases, [block], invoices] = await Promise.all([
            this.dataSource.query(
                `SELECT i.id, i.product_id, i.sku, i.title, i.fulfillment, i.quantity, i.unit_price_cents, i.vat_rate::float AS vat_rate,
                        (SELECT count(*)::int FROM shop_codes c WHERE c.order_item_id = i.id) AS codes_assigned
                   FROM shop_order_items i WHERE i.order_id = $1 ORDER BY i.id`,
                [id],
            ),
            this.dataSource.query(
                `SELECT e.id::text AS id, e.type, e.data, e.created_at, e.actor_id, pr.nickname AS actor_nickname
                   FROM shop_order_events e LEFT JOIN profiles pr ON pr.user_id = e.actor_id
                  WHERE e.order_id = $1 ORDER BY e.id`,
                [id],
            ),
            // Vorgeschichte des Kaeufers: hilft beim Entscheiden
            order.user_id
                ? this.dataSource.query(
                    `SELECT count(*) FILTER (WHERE status IN ('approved', 'fulfilled'))::int AS completed,
                            count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                            count(*) FILTER (WHERE status IN ('refunded', 'partially_refunded'))::int AS refunded,
                            (SELECT count(*)::int FROM shop_cases c WHERE c.against_user_id = $1 AND c.kind IN ('report', 'not_met')) AS reports
                       FROM shop_orders WHERE user_id = $1 AND id <> $2`,
                    [order.user_id, id],
                )
                : Promise.resolve([null]),
            this.dataSource.query(
                `SELECT id, kind, reason, status, priority, created_at FROM shop_cases WHERE order_id = $1 ORDER BY created_at`, [id],
            ),
            order.user_id
                ? this.dataSource.query(
                    `SELECT b.reason, b.until, b.created_at, pr.nickname AS blocked_by_nickname
                       FROM shop_user_blocks b LEFT JOIN profiles pr ON pr.user_id = b.blocked_by
                      WHERE b.user_id = $1 AND (b.until IS NULL OR b.until > now())`,
                    [order.user_id],
                )
                : Promise.resolve([null]),
            this.invoices.listForOrder(id),
        ]);
        return { ...order, items, events, buyer_history: history, cases, buyer_block: block ?? null, invoices };
    }

    // Annehmen = Vertrag: reservierten Betrag abbuchen
    approve(adminId: string, id: string, note?: string) {
        return this.decide(adminId, id, 'approved', note?.trim() || null, async (pi) => {
            await this.broker.payments().capture(pi, `shop-approve-${id}`);
        });
    }

    // Ablehnen = Reservierung freigeben, es fliesst kein Geld
    async reject(adminId: string, id: string, note: string) {
        const result = await this.decide(adminId, id, 'rejected', note.trim(), async (pi) => {
            await this.broker.payments().cancel(pi, `shop-reject-${id}`);
        });
        await this.buyerMail.declined(id, 'rejected');
        return result;
    }

    // Unauffaellig nach den Risiko-Regeln: das System nimmt an (decided_by NULL).
    // Gleicher Weg wie beim Menschen, nur aus 'authorized' statt 'held'.
    approveBySystem(id: string) {
        return this.decide(null, id, 'approved', null, async (pi) => {
            await this.broker.payments().capture(pi, `shop-approve-${id}`);
        }, 'authorized');
    }

    private async decide(
        adminId: string | null, id: string, status: 'approved' | 'rejected', note: string | null,
        stripeCall: (paymentIntentId: string) => Promise<void>,
        from: 'held' | 'authorized' = DECIDABLE,
    ) {
        const [order] = await this.dataSource.query(
            'SELECT status, delivery_mode, stripe_payment_intent_id FROM shop_orders WHERE id = $1', [id],
        );
        if (!order) throw new NotFoundException('Bestellung nicht gefunden');
        if (order.status !== from) throw new ConflictException('Bestellung ist nicht mehr angehalten — Seite neu laden');
        // Ohne Reservierung gibt es nichts abzubuchen; Ablehnen geht trotzdem
        if (!order.stripe_payment_intent_id && status === 'approved') {
            throw new ConflictException('Keine Zahlung reserviert — Annehmen nicht möglich');
        }
        if (status === 'approved') await this.fulfillment.checkAvailability(id);

        if (order.stripe_payment_intent_id) {
            try {
                await stripeCall(order.stripe_payment_intent_id);
            } catch (err: any) {
                this.logger.error(`Stripe bei ${status} fuer Bestellung ${id}: ${err?.message}`);
                await this.dataSource.query(
                    `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'stripe_error', $3)`,
                    [id, adminId, JSON.stringify({ action: status, message: err?.message ?? 'unbekannt' })],
                );
                throw new BadGatewayException(`Stripe: ${err?.message ?? 'Fehler'} — Status unverändert`);
            }
        }

        // Nur von 'held' aus — wer zuerst kommt, entscheidet
        const result = await this.dataSource.transaction(async (m) => {
            const updated = await m.query(
                `UPDATE shop_orders SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
                  WHERE id = $1 AND status = $5 RETURNING id, status, decided_at`,
                [id, status, adminId, note, from],
            );
            // UPDATE ... RETURNING liefert bei pg [rows, rowCount]
            const row = (Array.isArray(updated[0]) ? updated[0] : updated)[0];
            if (!row) throw new ConflictException('Bestellung wurde gerade schon entschieden');
            await m.query(
                `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, $3, $4)`,
                [id, adminId, status, JSON.stringify(note ? { note } : {})],
            );
            if (status === 'rejected') return { ...row, progress: null };
            return { ...row, ...(await this.fulfillment.onApproved(m, id, order.delivery_mode)) };
        });
        // Annahme = Vertrag + abgebucht: Rechnung (erzeugt und versendet der Worker)
        if (status === 'approved') await this.invoices.enqueue({ kind: 'invoice', orderId: id });
        return result;
    }
}
