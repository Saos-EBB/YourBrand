import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModuleBroker, type PaymentEvent } from '../../shared/broker/module-broker';
import { ShopAlertService } from './shop-alert.service';
import { ShopBuyerMailService } from './shop-buyer-mail.service';
import { ShopCasesService } from './shop-cases.service';
import { ShopIntakeService } from './shop-intake.service';
import { ShopRefundService } from './shop-refund.service';

// Empfaengt die Zahlungs-Events des Shops (metadata.kind = 'shop') ueber den Broker.
// Stripe kann Events doppelt und in beliebiger Reihenfolge schicken: jeder Zweig
// prueft den Status und tut beim zweiten Mal nichts.
@Injectable()
export class ShopPaymentEventsService implements OnModuleInit {
    private readonly logger = new Logger(ShopPaymentEventsService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly broker: ModuleBroker,
        private readonly intake: ShopIntakeService,
        private readonly refunds: ShopRefundService,
        private readonly cases: ShopCasesService,
        private readonly alerts: ShopAlertService,
        private readonly buyerMail: ShopBuyerMailService,
    ) { }

    onModuleInit() {
        this.broker.handlePaymentEvents('shop', (e) => this.handle(e));
    }

    async handle(e: PaymentEvent): Promise<void> {
        const orderId = e.metadata.orderId;
        if (!orderId) { this.logger.warn(`Zahlungs-Event ${e.type} ohne orderId`); return; }
        switch (e.type) {
            case 'authorized':
                return this.intake.onAuthorized(e);
            case 'checkout_expired':
                await this.close(orderId, ['pending'], 'cancelled');
                return;
            // Reservierung aufgehoben: bei uns schon passiert (ablehnen, Frist) oder von Stripe nach 7 Tagen
            case 'canceled': {
                const was = await this.close(orderId, ['pending', 'authorized', 'held'], 'expired');
                if (was === 'authorized' || was === 'held') {
                    await this.buyerMail.declined(orderId, 'expired');
                    await this.alerts.send('expired', { orderId });
                }
                return;
            }
            case 'refunded':
                return this.refunds.applyExternal(orderId, e.refunds);
            case 'dispute_opened': {
                const caseId = await this.cases.openDispute(orderId, e.disputeId, e.reason, e.amountCents);
                if (caseId) await this.alerts.send('dispute', { orderId, caseId });
                return;
            }
            case 'dispute_closed': {
                const caseId = await this.cases.noteDisputeClosed(e.disputeId, e.status);
                if (caseId) await this.alerts.send('dispute', { orderId, caseId });
                return;
            }
        }
    }

    // pending → cancelled (Kasse abgebrochen), reserviert/angehalten → expired; liefert den alten Status
    private async close(orderId: string, from: string[], to: 'cancelled' | 'expired'): Promise<string | null> {
        return this.dataSource.transaction(async (m) => {
            const [o] = await m.query('SELECT status FROM shop_orders WHERE id = $1 FOR UPDATE', [orderId]);
            if (!o || !from.includes(o.status)) return null;
            const target = o.status === 'pending' ? 'cancelled' : to;
            await m.query('UPDATE shop_orders SET status = $2 WHERE id = $1', [orderId, target]);
            await m.query(
                `INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, $2, $3)`,
                [orderId, target, JSON.stringify({ by: 'stripe' })],
            );
            return o.status;
        });
    }
}
