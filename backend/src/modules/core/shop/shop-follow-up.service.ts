import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { ShopAlertService } from './shop-alert.service';
import { ShopBuyerMailService } from './shop-buyer-mail.service';
import { ShopIntakeService } from './shop-intake.service';

// So viele verfallene Bestellungen pro Lauf — der Rest kommt in der naechsten Minute
const EXPIRE_BATCH = 20;

// UPDATE/INSERT ... RETURNING liefert bei pg je nach Befehl [rows, rowCount] oder rows
const rowsOf = <T>(r: unknown): T[] => ((Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r) as T[]);

// Nachfass-Cron: niemand soll eine Frist verpassen.
// - reserviert, aber haengen geblieben (5 Min.): anhalten, ein Mensch entscheidet
// - angehaltene Bestellung: 30 Min. vor der Frist ein Alarm, danach verfaellt die
//   Reservierung (Stripe cancel ueber den Broker), der Kaeufer zahlt nichts
// - Fall beim Team ueber der Frist: Alarm, dann erneut alle 30 Min. (dringend) bzw. 4 Std.
@Injectable()
export class ShopFollowUpService {
    private readonly logger = new Logger(ShopFollowUpService.name);
    private running = false;

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly broker: ModuleBroker,
        private readonly alerts: ShopAlertService,
        private readonly buyerMail: ShopBuyerMailService,
        private readonly intake: ShopIntakeService,
    ) { }

    @Cron(CronExpression.EVERY_MINUTE)
    async run(): Promise<void> {
        // Stripe kann laenger brauchen als eine Minute: Laeufe nicht stapeln
        if (this.running) return;
        this.running = true;
        try {
            await this.holdStuck();
            await this.remindDecisions();
            await this.expireHeld();
            await this.alertOverdueCases();
        } catch (err) {
            this.logger.error(`Nachfass-Lauf: ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
    }

    // Reserviert, aber weder angenommen noch angehalten (Absturz zwischen Webhook und Abbuchen):
    // ein Mensch entscheidet
    async holdStuck(): Promise<void> {
        const stuck: { id: string }[] = await this.dataSource.query(
            `SELECT id FROM shop_orders WHERE status = 'authorized' AND authorized_at < now() - interval '5 minutes'`,
        );
        for (const o of stuck) await this.intake.hold(o.id, ['system_error']);
    }

    // Einmal pro Bestellung; der Eintrag im Protokoll merkt sich, dass erinnert wurde
    async remindDecisions(): Promise<void> {
        const rows = rowsOf<{ order_id: string }>(await this.dataSource.query(
            `INSERT INTO shop_order_events (order_id, type, data)
             SELECT o.id, 'reminder', '{}' FROM shop_orders o
              WHERE o.status = 'held' AND o.decide_by > now() AND o.decide_by <= now() + interval '30 minutes'
                AND NOT EXISTS (SELECT 1 FROM shop_order_events e WHERE e.order_id = o.id AND e.type = 'reminder')
             RETURNING order_id`,
        ));
        for (const r of rows) await this.alerts.send('decide_soon', { orderId: r.order_id });
    }

    async expireHeld(): Promise<void> {
        const due: { id: string; stripe_payment_intent_id: string | null }[] = await this.dataSource.query(
            `SELECT id, stripe_payment_intent_id FROM shop_orders
              WHERE status = 'held' AND decide_by <= now() ORDER BY decide_by LIMIT ${EXPIRE_BATCH}`,
        );
        for (const o of due) {
            if (o.stripe_payment_intent_id) {
                try {
                    await this.broker.payments().cancel(o.stripe_payment_intent_id, `shop-expire-${o.id}`);
                } catch (err) {
                    // Bleibt angehalten, naechste Minute nochmal; im Protokoll nur einmal
                    const message = (err as Error)?.message ?? 'unbekannt';
                    this.logger.warn(`Verfallen von Bestellung ${o.id}: ${message}`);
                    await this.dataSource.query(
                        `INSERT INTO shop_order_events (order_id, type, data)
                         SELECT $1, 'stripe_error', $2
                          WHERE NOT EXISTS (SELECT 1 FROM shop_order_events
                                             WHERE order_id = $1 AND type = 'stripe_error' AND data->>'action' = 'expire')`,
                        [o.id, JSON.stringify({ action: 'expire', message })],
                    );
                    continue;
                }
            }
            // Hat ein Admin inzwischen entschieden, bleibt seine Entscheidung
            const expired = await this.dataSource.transaction(async (m) => {
                const updated = rowsOf(await m.query(
                    `UPDATE shop_orders SET status = 'expired' WHERE id = $1 AND status = 'held' RETURNING id`, [o.id],
                ));
                if (!updated.length) return false;
                await m.query(`INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'expired', '{}')`, [o.id]);
                return true;
            });
            if (expired) {
                await this.alerts.send('expired', { orderId: o.id });
                await this.buyerMail.declined(o.id, 'expired');
            }
        }
    }

    // Nur Faelle, bei denen das Team dran ist (open). last_alert_at verhindert Dauerfeuer.
    async alertOverdueCases(): Promise<void> {
        const rows = rowsOf<{ id: string; order_id: string | null }>(await this.dataSource.query(
            `UPDATE shop_cases SET last_alert_at = now()
              WHERE status = 'open' AND due_at < now()
                AND (last_alert_at IS NULL OR last_alert_at < now() -
                     CASE priority WHEN 'urgent' THEN interval '30 minutes' WHEN 'high' THEN interval '2 hours' ELSE interval '4 hours' END)
              RETURNING id, order_id`,
        ));
        for (const c of rows) await this.alerts.send('case_overdue', { caseId: c.id, ...(c.order_id ? { orderId: c.order_id } : {}) });
    }
}
