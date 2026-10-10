import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { decryptField } from '../../../common/crypto/crypto.helper';

const MY_ORDERS_PAGE_SIZE = 20;
// Abgebrochene Kassen (pending/cancelled) sind keine Bestellungen fuer den Kaeufer
const HIDDEN = `('pending', 'cancelled')`;
// Keys/Codes erst nach der Annahme zeigen
const DELIVERED = ['approved', 'fulfilled', 'partially_refunded'];

// Bestellungen aus Kaeufersicht: nur die eigenen
@Injectable()
export class ShopOrdersService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    async listMine(userId: string, page = 1) {
        const [items, [{ total }]] = await Promise.all([
            this.dataSource.query(
                `SELECT o.id, o.status, o.progress, o.delivery_mode, o.total_cents, o.created_at,
                        (SELECT count(*)::int FROM shop_order_items i WHERE i.order_id = o.id) AS item_count,
                        (SELECT i.title FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS first_title,
                        (SELECT i.fulfillment FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS first_fulfillment
                   FROM shop_orders o WHERE o.user_id = $1 AND o.status NOT IN ${HIDDEN}
                  ORDER BY o.created_at DESC, o.id LIMIT ${MY_ORDERS_PAGE_SIZE} OFFSET $2`,
                [userId, (page - 1) * MY_ORDERS_PAGE_SIZE],
            ),
            this.dataSource.query(
                `SELECT count(*)::int AS total FROM shop_orders WHERE user_id = $1 AND status NOT IN ${HIDDEN}`, [userId],
            ),
        ]);
        return { items, total, page, limit: MY_ORDERS_PAGE_SIZE };
    }

    async getMine(userId: string, id: string) {
        // Interne Notiz und Risiko-Gruende bleiben beim Team
        const [order] = await this.dataSource.query(
            `SELECT id, status, progress, delivery_mode, items_cents, shipping_cents, total_cents, refunded_cents,
                    contact_name, contact_phone, delivery_address, desired_at, delivery_note, tracking_number,
                    created_at, decided_at, fulfilled_at
               FROM shop_orders WHERE id = $1 AND user_id = $2`,
            [id, userId],
        );
        if (!order) throw new NotFoundException('Bestellung nicht gefunden');

        const items = await this.dataSource.query(
            `SELECT i.id, i.product_id, i.title, i.fulfillment, i.quantity, i.unit_price_cents, i.vat_rate::float AS vat_rate,
                    p.unlock_target
               FROM shop_order_items i LEFT JOIN shop_products p ON p.id = i.product_id
              WHERE i.order_id = $1 ORDER BY i.id`,
            [id],
        );
        const codes: { order_item_id: string; code_encrypted: Buffer; redeemed_at: string | null }[] =
            DELIVERED.includes(order.status)
                ? await this.dataSource.query(
                    `SELECT order_item_id, code_encrypted, redeemed_at FROM shop_codes
                      WHERE order_item_id = ANY($1) AND revoked_at IS NULL ORDER BY assigned_at, id`,
                    [items.map((i: { id: string }) => i.id)],
                )
                : [];
        return {
            ...order,
            items: items.map((i: { id: string }) => ({
                ...i,
                codes: codes.filter((c) => c.order_item_id === i.id)
                    .map((c) => ({ code: decryptField(c.code_encrypted), redeemed_at: c.redeemed_at })),
            })),
        };
    }
}
