import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { encryptField } from '../../../common/crypto/crypto.helper';
import { hashShopCode } from './shop-admin.service';
import { generateUnlockCode, progressError, type ShopProgress } from './shop-fulfillment';
import { ShopCasesService } from './shop-cases.service';
import { ShopAlertService } from './shop-alert.service';

interface DigitalItem { id: string; product_id: string; fulfillment: string; quantity: number; title: string }

// Auslieferung nach der Annahme. Wird von der Admin-Entscheidung aufgerufen
// und spaeter auch von der automatischen Annahme (Schritt 5).
@Injectable()
export class ShopFulfillmentService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly cases: ShopCasesService,
        private readonly alerts: ShopAlertService,
    ) { }

    // Vor dem Abbuchen: reichen freie Keys und Bestand? Sonst gar nicht erst Geld nehmen.
    async checkAvailability(orderId: string): Promise<void> {
        await this.checkKeys(orderId);
        // Bestand NULL = unbegrenzt; gleiche Artikel in mehreren Positionen zusammenzaehlen
        const short: { title: string; stock: number; wanted: number }[] = await this.dataSource.query(
            `SELECT min(i.title) AS title, p.stock, sum(i.quantity)::int AS wanted
               FROM shop_order_items i JOIN shop_products p ON p.id = i.product_id
              WHERE i.order_id = $1 AND i.fulfillment IN ('food', 'physical') AND p.stock IS NOT NULL
              GROUP BY p.id, p.stock HAVING sum(i.quantity) > p.stock`,
            [orderId],
        );
        if (short.length) {
            throw new ConflictException(`Bestand reicht nicht: ${short.map((s) => `${s.title} (noch ${s.stock}, bestellt ${s.wanted})`).join(', ')} — Bestand erhöhen oder ablehnen`);
        }
    }

    private async checkKeys(orderId: string): Promise<void> {
        const short: { title: string; missing: number }[] = await this.dataSource.query(
            `SELECT i.title, i.quantity - (SELECT count(*)::int FROM shop_codes c
                     WHERE c.product_id = i.product_id AND c.assigned_at IS NULL AND c.revoked_at IS NULL) AS missing
               FROM shop_order_items i
              WHERE i.order_id = $1 AND i.fulfillment = 'license'`,
            [orderId],
        );
        const missing = short.filter((s) => s.missing > 0);
        if (missing.length) {
            throw new ConflictException(`Zu wenig freie Keys: ${missing.map((s) => `${s.title} (${s.missing} fehlen)`).join(', ')} — erst Keys hinzufügen`);
        }
    }

    // In der Transaktion der Annahme: Keys zuteilen, Codes erzeugen. Digitales
    // ist damit ausgeliefert, Essen/Versand starten bei "angenommen".
    async onApproved(m: EntityManager, orderId: string, deliveryMode: string): Promise<{ status: string; progress: ShopProgress | null }> {
        const items: DigitalItem[] = await m.query(
            `SELECT id, product_id, fulfillment, quantity, title FROM shop_order_items
              WHERE order_id = $1 AND fulfillment IN ('license', 'unlock') ORDER BY id`,
            [orderId],
        );
        await this.takeStock(m, orderId);
        const counts: Record<string, number> = {};
        for (const item of items) {
            counts[item.fulfillment] = (counts[item.fulfillment] ?? 0)
                + (item.fulfillment === 'license' ? await this.assignKeys(m, item) : await this.createCodes(m, item));
        }

        if (deliveryMode === 'digital') {
            await m.query(`UPDATE shop_orders SET status = 'fulfilled', fulfilled_at = now() WHERE id = $1`, [orderId]);
            await m.query(
                `INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'fulfilled', $2)`,
                [orderId, JSON.stringify({ keys: counts.license ?? 0, codes: counts.unlock ?? 0 })],
            );
            return { status: 'fulfilled', progress: null };
        }
        await m.query(`UPDATE shop_orders SET progress = 'accepted' WHERE id = $1`, [orderId]);
        return { status: 'approved', progress: 'accepted' };
    }

    // Nach dem Abbuchen darf hier nichts mehr scheitern: nie unter 0, ein Engpass
    // (zwei Kaeufer, letztes Stueck) steht im Protokoll, ein Mensch klaert ihn
    private async takeStock(m: EntityManager, orderId: string): Promise<void> {
        const result = await m.query(
            `WITH wanted AS (
                SELECT i.product_id, min(i.title) AS title, sum(i.quantity)::int AS qty FROM shop_order_items i
                 WHERE i.order_id = $1 AND i.fulfillment IN ('food', 'physical') GROUP BY i.product_id),
             before AS (
                SELECT p.id, p.stock FROM shop_products p JOIN wanted w ON w.product_id = p.id
                 WHERE p.stock IS NOT NULL FOR UPDATE OF p)
             UPDATE shop_products p SET stock = GREATEST(b.stock - w.qty, 0)
               FROM wanted w, before b
              WHERE p.id = w.product_id AND b.id = p.id
             RETURNING w.title, GREATEST(w.qty - b.stock, 0) AS short`,
            [orderId],
        );
        // UPDATE ... RETURNING liefert bei pg [rows, rowCount]
        const rows: { title: string; short: number }[] = Array.isArray(result[0]) ? result[0] : result;
        const shortages = rows.filter((r) => r.short > 0);
        if (shortages.length) {
            await m.query(
                `INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'stock_short', $2)`,
                [orderId, JSON.stringify({ items: shortages.map((s) => ({ title: s.title, missing: s.short })) })],
            );
        }
    }

    private async assignKeys(m: EntityManager, item: DigitalItem): Promise<number> {
        // SKIP LOCKED: zwei Annahmen gleichzeitig bekommen verschiedene Keys
        const rows = await m.query(
            `UPDATE shop_codes SET order_item_id = $1, assigned_at = now()
              WHERE id IN (SELECT id FROM shop_codes
                            WHERE product_id = $2 AND assigned_at IS NULL AND revoked_at IS NULL
                            ORDER BY created_at, id LIMIT $3 FOR UPDATE SKIP LOCKED)
              RETURNING id`,
            [item.id, item.product_id, item.quantity],
        );
        const assigned = (Array.isArray(rows[0]) ? rows[0] : rows).length;
        // Rollback der ganzen Annahme; nochmal Annehmen bucht dank Idempotency-Key nicht doppelt ab
        if (assigned < item.quantity) throw new ConflictException(`Keys für „${item.title}“ gerade vergeben — Keys hinzufügen und nochmal annehmen`);
        return assigned;
    }

    private async createCodes(m: EntityManager, item: DigitalItem): Promise<number> {
        for (let i = 0; i < item.quantity; i++) {
            const code = generateUnlockCode();
            await m.query(
                `INSERT INTO shop_codes (product_id, code_encrypted, code_hash, order_item_id, assigned_at)
                 VALUES ($1, $2, $3, $4, now())`,
                [item.product_id, encryptField(code), hashShopCode(code), item.id],
            );
        }
        return item.quantity;
    }

    async setProgress(adminId: string, orderId: string, next: ShopProgress, trackingNumber?: string) {
        let notMetCase: string | null = null;
        const result = await this.dataSource.transaction(async (m) => {
            const [order] = await m.query(
                'SELECT status, delivery_mode, progress, fulfilled_at FROM shop_orders WHERE id = $1 FOR UPDATE', [orderId],
            );
            if (!order) throw new NotFoundException('Bestellung nicht gefunden');
            // Teil-Erstattung (z. B. eine Pizza fehlt) haelt die Lieferung nicht auf
            const partly = order.status === 'partially_refunded' && !order.fulfilled_at;
            if (order.status !== 'approved' && !partly) throw new ConflictException('Nur angenommene Bestellungen haben einen Lieferfortschritt');
            const problem = progressError(order.delivery_mode, order.progress, next);
            if (problem) throw new BadRequestException(problem);

            const tracking = next === 'shipped' ? trackingNumber?.trim() || null : null;
            const done = next === 'delivered';
            await m.query(
                `UPDATE shop_orders SET progress = $2,
                        tracking_number = COALESCE($3, tracking_number),
                        status = CASE WHEN $4 AND status = 'approved' THEN 'fulfilled' ELSE status END,
                        fulfilled_at = CASE WHEN $4 THEN now() ELSE fulfilled_at END
                  WHERE id = $1`,
                [orderId, next, tracking, done],
            );
            await m.query(
                `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'progress', $3)`,
                [orderId, adminId, JSON.stringify({ progress: next, ...(tracking ? { tracking_number: tracking } : {}) })],
            );
            // Nicht angetroffen: ein Mensch klaert das (Annahmeverzug), daher sofort ein dringender Fall
            if (next === 'not_met') notMetCase = await this.cases.openNotMet(m, adminId, orderId);
            return { id: orderId, status: done && !partly ? 'fulfilled' : order.status, progress: next };
        });
        // erst nach dem Commit: der Alarm soll nur kommen, wenn der Fall wirklich da ist
        if (notMetCase) await this.alerts.send('not_met', { orderId, caseId: notMetCase });
        return result;
    }
}
