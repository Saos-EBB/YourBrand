import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { decryptField } from '../../../common/crypto/crypto.helper';
import { MailService } from '../../../common/mail/mail.service';
import { AppEvents, TypedEventBus, type ShopAlertKind } from '../../shared/events/app-events';

// Dringendes zusaetzlich per Mail (Entscheidung des Users), der Rest nur in der App
const MAIL: Partial<Record<ShopAlertKind, { subject: string; text: string; path: string }>> = {
    not_met: { subject: 'Shop: Käufer nicht angetroffen', text: 'Ein dringender Fall wurde eröffnet (Frist 2 Stunden).', path: '/admin/shop/cases' },
    decide_soon: { subject: 'Shop: Entscheidung läuft bald ab', text: 'Eine angehaltene Bestellung verfällt in weniger als 30 Minuten.', path: '/admin/shop' },
    order_held: { subject: 'Shop: Bestellung angehalten', text: 'Die Risiko-Regeln haben eine Bestellung angehalten — bitte annehmen oder ablehnen.', path: '/admin/shop' },
    dispute: { subject: 'Shop: Rückbuchung', text: 'Stripe meldet eine Rückbuchung (eröffnet oder abgeschlossen).', path: '/admin/shop/cases' },
    case_overdue: { subject: 'Shop: Fall-Frist überschritten', text: 'Ein Fall wartet über seine Frist hinaus auf eine Antwort.', path: '/admin/shop/cases' },
};

// Alarme an alle Admins: Socket (shop.alert → Raum admin) und bei Dringendem Mail.
// Fehler beim Versand brechen nie die eigentliche Aktion ab.
@Injectable()
export class ShopAlertService {
    private readonly logger = new Logger(ShopAlertService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly events: TypedEventBus,
        private readonly mail: MailService,
    ) { }

    async send(kind: ShopAlertKind, ids: { orderId?: string; caseId?: string } = {}): Promise<void> {
        this.events.emit(AppEvents.shopAlert, { kind, ...ids });
        const mail = MAIL[kind];
        if (!mail) return;
        const ref = ids.orderId ? ` (Bestellung #${ids.orderId.slice(0, 8).toUpperCase()})` : '';
        try {
            const admins: { email: Buffer }[] = await this.dataSource.query(
                `SELECT email FROM users
                  WHERE role IN ('admin', 'owner') AND email IS NOT NULL AND deleted_at IS NULL AND NOT is_banned`,
            );
            const link = `${process.env.APP_URL}${mail.path}`;
            const results = await Promise.allSettled(admins.map((a) => {
                const to = decryptField(a.email);
                return to ? this.mail.sendShopAlertEmail(to, mail.subject, mail.text + ref, link) : Promise.resolve();
            }));
            const failed = results.filter((r) => r.status === 'rejected').length;
            if (failed) this.logger.warn(`Shop-Alarm ${kind}: ${failed} von ${admins.length} Mails nicht gesendet`);
        } catch (err) {
            this.logger.error(`Shop-Alarm ${kind}: ${(err as Error).message}`);
        }
    }

    // Was gerade einen Menschen braucht — Zaehler fuer Admin-Badge und Shop-Tabs
    async attention(): Promise<{ held: number; cases_open: number; urgent: number }> {
        const [row] = await this.dataSource.query(
            `SELECT (SELECT count(*)::int FROM shop_orders WHERE status = 'held') AS held,
                    (SELECT count(*)::int FROM shop_cases WHERE status = 'open') AS cases_open,
                    (SELECT count(*)::int FROM shop_cases WHERE status = 'open' AND priority = 'urgent') AS urgent`,
        );
        return row;
    }
}
