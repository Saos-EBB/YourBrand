import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { decryptField } from '../../../common/crypto/crypto.helper';
import { MailService } from '../../../common/mail/mail.service';
import { euro } from './shop-invoice';

// Mails an den Kaeufer zum Stand der Bestellung (die Annahme bestaetigt die Rechnungs-Mail).
// Scheitert der Versand, steht es im Log — die Bestellung laeuft trotzdem weiter.
@Injectable()
export class ShopBuyerMailService {
    private readonly logger = new Logger(ShopBuyerMailService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly mail: MailService,
    ) { }

    received(orderId: string): Promise<void> {
        return this.send(orderId, (to, no, total, link) => this.mail.sendShopOrderReceivedEmail(to, no, total, link));
    }

    declined(orderId: string, reason: 'rejected' | 'expired'): Promise<void> {
        return this.send(orderId, (to, no, _total, link) => this.mail.sendShopOrderDeclinedEmail(to, no, reason, link));
    }

    private async send(orderId: string, fn: (to: string, orderNo: string, total: string, link: string) => Promise<void>): Promise<void> {
        try {
            const [o] = await this.dataSource.query(
                `SELECT o.total_cents, o.buyer_email, u.email FROM shop_orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
                [orderId],
            );
            // Stripe-Mail aus der Kasse, sonst die Konto-Mail
            const to = o?.buyer_email ?? decryptField(o?.email ?? null);
            if (!to) {
                this.logger.warn(`Bestellung ${orderId}: keine Mail-Adresse`);
                return;
            }
            await fn(to, orderId.slice(0, 8).toUpperCase(), euro(o.total_cents), `${process.env.APP_URL}/shop/orders/${orderId}`);
        } catch (err) {
            this.logger.error(`Kaeufer-Mail fuer Bestellung ${orderId}: ${(err as Error).message}`);
        }
    }
}
