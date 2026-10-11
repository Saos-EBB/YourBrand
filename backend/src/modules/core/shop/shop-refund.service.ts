import { BadGatewayException, BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { ShopInvoiceService } from './shop-invoice.service';

// Erstatten geht nur, wenn schon abgebucht ist
const REFUNDABLE = ['approved', 'fulfilled', 'partially_refunded'];

class PaymentFailed extends Error {
    constructor(readonly cause: unknown) { super('payment failed'); }
}

// Erstatten (ganz oder teilweise) und Shop-Sperre — beides macht nur ein Mensch, mit Begruendung
@Injectable()
export class ShopRefundService {
    private readonly logger = new Logger(ShopRefundService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly broker: ModuleBroker,
        private readonly invoices: ShopInvoiceService,
    ) { }

    // Volle Erstattung sperrt alle noch nicht eingeloesten Keys/Codes, bei
    // Teil-Erstattung nur auf Wunsch. Eingeloeste Codes bleiben (Coins sind gutgeschrieben).
    async refund(adminId: string, id: string, amountCents: number, note: string, revokeCodes = false) {
        note = note.trim();
        // in der Transaktion gesetzt (Objekt statt let: TS verfolgt Zuweisungen in Closures nicht)
        const refunded: { refundId: string | null } = { refundId: null };
        let result;
        try {
            // FOR UPDATE ueber den Stripe-Aufruf hinweg: zwei Admins erstatten nicht doppelt
            result = await this.dataSource.transaction(async (m) => {
                const [order] = await m.query(
                    'SELECT status, total_cents, refunded_cents, stripe_payment_intent_id FROM shop_orders WHERE id = $1 FOR UPDATE', [id],
                );
                if (!order) throw new NotFoundException('Bestellung nicht gefunden');
                if (!REFUNDABLE.includes(order.status)) throw new ConflictException('Nur abgebuchte Bestellungen lassen sich erstatten');
                if (!order.stripe_payment_intent_id) throw new ConflictException('Keine Zahlung zu dieser Bestellung');
                const left = order.total_cents - order.refunded_cents;
                if (amountCents > left) throw new BadRequestException(`Höchstens ${(left / 100).toFixed(2).replace('.', ',')} € sind noch offen`);
                const full = amountCents === left;

                let refundId: string;
                try {
                    // Schluessel haengt am Stand vorher: Wiederholung nach Absturz erstattet nicht nochmal
                    ({ refundId } = await this.broker.payments().refund(
                        order.stripe_payment_intent_id, amountCents, `shop-refund-${id}-${order.refunded_cents}-${amountCents}`,
                    ));
                } catch (err) {
                    throw new PaymentFailed(err);
                }

                const status = full ? 'refunded' : 'partially_refunded';
                await m.query(
                    'UPDATE shop_orders SET refunded_cents = refunded_cents + $2, status = $3 WHERE id = $1', [id, amountCents, status],
                );
                let revoked = 0;
                let redeemed = 0;
                if (full || revokeCodes) {
                    const rows = await m.query(
                        `UPDATE shop_codes SET revoked_at = now(), revoked_by = $2
                          WHERE order_item_id IN (SELECT id FROM shop_order_items WHERE order_id = $1)
                            AND revoked_at IS NULL AND redeemed_at IS NULL
                          RETURNING id`,
                        [id, adminId],
                    );
                    revoked = (Array.isArray(rows[0]) ? rows[0] : rows).length;
                    [{ redeemed }] = await m.query(
                        `SELECT count(*)::int AS redeemed FROM shop_codes
                          WHERE order_item_id IN (SELECT id FROM shop_order_items WHERE order_id = $1) AND redeemed_at IS NOT NULL`,
                        [id],
                    );
                }
                await m.query(
                    `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'refunded', $3)`,
                    [id, adminId, JSON.stringify({ amount_cents: amountCents, note, refund_id: refundId, revoked, already_redeemed: redeemed })],
                );
                refunded.refundId = refundId;
                return { id, status, refunded_cents: order.refunded_cents + amountCents, revoked, already_redeemed: redeemed };
            });
        } catch (err) {
            if (!(err instanceof PaymentFailed)) throw err;
            const message = (err.cause as Error)?.message ?? 'unbekannt';
            this.logger.error(`Erstattung fuer Bestellung ${id}: ${message}`);
            // Ausserhalb der zurueckgerollten Transaktion, damit der Fehler im Protokoll bleibt
            await this.dataSource.query(
                `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'stripe_error', $3)`,
                [id, adminId, JSON.stringify({ action: 'refund', message })],
            );
            throw new BadGatewayException(`Stripe: ${message} — nichts erstattet`);
        }
        // Stornorechnung je Erstattung (Refund-ID macht es idempotent)
        if (refunded.refundId) await this.invoices.enqueue({ kind: 'credit_note', orderId: id, refundId: refunded.refundId, amountCents });
        return result;
    }

    // Sperrt nur den Shop (nicht den Account). Nochmal sperren ersetzt die alte Sperre.
    async block(adminId: string, userId: string, reason: string, days?: number) {
        const [user] = await this.dataSource.query('SELECT 1 FROM users WHERE id = $1', [userId]);
        if (!user) throw new NotFoundException('Nutzer nicht gefunden');
        const [row] = await this.dataSource.query(
            `INSERT INTO shop_user_blocks (user_id, reason, blocked_by, until)
             VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(days => $4::int) END)
             ON CONFLICT (user_id) DO UPDATE
                SET reason = EXCLUDED.reason, blocked_by = EXCLUDED.blocked_by, until = EXCLUDED.until, created_at = now()
             RETURNING user_id, reason, until, created_at`,
            [userId, reason.trim(), adminId, days ?? null],
        );
        return row;
    }

    // Aufheben laesst die Zeile stehen (until = jetzt), damit nachvollziehbar bleibt, dass gesperrt war
    async unblock(userId: string) {
        const rows = await this.dataSource.query(
            `UPDATE shop_user_blocks SET until = now()
              WHERE user_id = $1 AND (until IS NULL OR until > now()) RETURNING user_id`,
            [userId],
        );
        if (!(Array.isArray(rows[0]) ? rows[0] : rows).length) throw new NotFoundException('Keine aktive Sperre');
        return { user_id: userId, blocked: false };
    }
}
