import { BadGatewayException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PaymentEvent } from '../../shared/broker/module-broker';
import { ShopAlertService } from './shop-alert.service';
import { ShopBuyerMailService } from './shop-buyer-mail.service';
import { ShopOrdersAdminService } from './shop-orders-admin.service';
import { ShopRiskService } from './shop-risk.service';
import { decideMinutes, holdReasons } from './shop-risk';

type Authorized = Extract<PaymentEvent, { type: 'authorized' }>;

// Eingang einer reservierten Bestellung: Daten aus der Zahlung speichern,
// Risiko-Regeln pruefen, dann anhalten (Mensch entscheidet) oder vom System annehmen.
@Injectable()
export class ShopIntakeService {
    private readonly logger = new Logger(ShopIntakeService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly risk: ShopRiskService,
        private readonly orders: ShopOrdersAdminService,
        private readonly alerts: ShopAlertService,
        private readonly buyerMail: ShopBuyerMailService,
    ) { }

    async onAuthorized(e: Authorized): Promise<void> {
        const orderId = e.metadata.orderId;
        const thresholds = await this.risk.thresholds();
        const outcome = await this.dataSource.transaction(async (m) => {
            const [o] = await m.query(
                'SELECT id, status, user_id, total_cents, delivery_mode FROM shop_orders WHERE id = $1 FOR UPDATE', [orderId],
            );
            // Unbekannt: kein Fehler, sonst stellt Stripe tagelang erneut zu
            if (!o) { this.logger.warn(`Reservierung fuer unbekannte Bestellung ${orderId}`); return null; }
            // Zweite Zustellung desselben Events
            if (o.status !== 'pending') return null;

            await m.query(
                `UPDATE shop_orders SET status = 'authorized', authorized_at = now(), stripe_payment_intent_id = $2,
                        card_fingerprint = $3, radar_risk = $4, buyer_email = $5, buyer_name = $6, buyer_address = $7
                  WHERE id = $1`,
                [orderId, e.paymentIntentId, e.card.fingerprint, e.risk.level, e.billing.email, e.billing.name, e.billing.address],
            );
            await m.query(
                `INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'authorized', $2)`,
                [orderId, JSON.stringify({ payment_intent: e.paymentIntentId, radar: e.risk.level, radar_score: e.risk.score })],
            );
            const reasons: string[] = holdReasons(
                await this.risk.facts(m, o, { fingerprint: e.card.fingerprint, radarLevel: e.risk.level }), thresholds,
            );
            // Reserviert ist etwas anderes als bestellt: nie automatisch annehmen
            if (e.amountCents !== o.total_cents) reasons.push('amount_mismatch');
            if (!reasons.length) return 'clean';
            await this.holdIn(m, orderId, reasons, decideMinutes(o.delivery_mode, thresholds));
            return 'held';
        });
        if (!outcome) return;
        await this.buyerMail.received(orderId);
        if (outcome === 'held') await this.alerts.send('order_held', { orderId });
        else await this.autoApprove(orderId);
    }

    // Abbuchen wie beim Menschen; klappt es nicht, entscheidet doch ein Mensch
    async autoApprove(orderId: string): Promise<void> {
        try {
            await this.orders.approveBySystem(orderId);
        } catch (err) {
            const reason = err instanceof BadGatewayException ? 'capture_failed'
                : err instanceof ConflictException && /Keys/.test((err as Error).message) ? 'keys_missing'
                    : err instanceof ConflictException ? null : 'system_error';
            // Conflict ohne Keys: schon entschieden (z. B. doppelte Zustellung) — nichts zu tun
            if (!reason) return;
            this.logger.warn(`Automatische Annahme von ${orderId}: ${(err as Error).message}`);
            await this.hold(orderId, [reason]);
        }
    }

    // Nur aus 'authorized' — eine Entscheidung, die schon gefallen ist, bleibt
    async hold(orderId: string, reasons: string[]): Promise<void> {
        const thresholds = await this.risk.thresholds();
        const held = await this.dataSource.transaction(async (m) => {
            const [o] = await m.query(`SELECT status, delivery_mode FROM shop_orders WHERE id = $1 FOR UPDATE`, [orderId]);
            if (o?.status !== 'authorized') return false;
            await this.holdIn(m, orderId, reasons, decideMinutes(o.delivery_mode, thresholds));
            return true;
        });
        if (held) await this.alerts.send('order_held', { orderId });
    }

    private async holdIn(m: { query: DataSource['query'] }, orderId: string, reasons: string[], minutes: number) {
        await m.query(
            `UPDATE shop_orders SET status = 'held', hold_reasons = $2, decide_by = now() + make_interval(mins => $3) WHERE id = $1`,
            [orderId, reasons, minutes],
        );
        await m.query(`INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'held', $2)`, [orderId, JSON.stringify({ reasons })]);
    }
}
