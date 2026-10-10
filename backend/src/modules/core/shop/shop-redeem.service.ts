import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { hashShopCode } from './shop-admin.service';

// Eingabe wie der Code aussieht: "y7qz bggy vxdd" -> "Y7QZ-BGGY-VXDD"
export function normalizeUnlockCode(raw: string): string {
    const plain = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return plain.length === 12 ? `${plain.slice(0, 4)}-${plain.slice(4, 8)}-${plain.slice(8)}` : raw.trim();
}

// Nur verkaufte Codes einer laufenden Bestellung zaehlen
const VALID_ORDER = `('approved', 'fulfilled', 'partially_refunded')`;

@Injectable()
export class ShopRedeemService {
    private readonly logger = new Logger(ShopRedeemService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly broker: ModuleBroker,
    ) { }

    // Code einloesen: erst den Code fuer sich reservieren, dann ueber die
    // Vermittlung gutschreiben; klappt das nicht, wird der Code wieder frei.
    async redeem(userId: string, raw: string): Promise<{ kind: string; amount: number }> {
        const [code] = await this.dataSource.query(
            `SELECT c.id, c.redeemed_at, c.revoked_at, p.unlock_target, i.order_id, o.status AS order_status
               FROM shop_codes c
               JOIN shop_products p ON p.id = c.product_id
               LEFT JOIN shop_order_items i ON i.id = c.order_item_id
               LEFT JOIN shop_orders o ON o.id = i.order_id
              WHERE c.code_hash = $1 AND p.fulfillment = 'unlock'`,
            [hashShopCode(normalizeUnlockCode(raw))],
        );
        if (!code || !code.order_id || !code.unlock_target) throw new NotFoundException('Code nicht gefunden — bitte nochmal prüfen');
        if (code.revoked_at) throw new ConflictException('Dieser Code wurde gesperrt');
        if (code.redeemed_at) throw new ConflictException('Dieser Code wurde schon eingelöst');
        if (!VALID_ORDER.includes(`'${code.order_status}'`)) throw new ConflictException('Dieser Code ist nicht mehr gültig');

        const [kind, amountRaw] = String(code.unlock_target).split(':');
        const amount = Number(amountRaw);
        // Modul aus (z. B. Coins beim Mandanten abgeschaltet): Code bleibt unverbraucht
        if (!this.broker.canUnlock(kind)) throw new ServiceUnavailableException('Dieser Code kann gerade nicht eingelöst werden — er bleibt gültig');

        const claimed = await this.dataSource.query(
            `UPDATE shop_codes SET redeemed_by = $2, redeemed_at = now()
              WHERE id = $1 AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING id`,
            [code.id, userId],
        );
        // UPDATE ... RETURNING liefert bei pg [rows, rowCount]
        if (!(Array.isArray(claimed[0]) ? claimed[0] : claimed).length) throw new ConflictException('Dieser Code wurde schon eingelöst');

        try {
            await this.broker.unlock(kind, { userId, amount, idempotencyKey: `shop-code-${code.id}` });
        } catch (err: any) {
            this.logger.error(`Gutschrift fuer Code ${code.id} fehlgeschlagen: ${err?.message}`);
            await this.dataSource.query(
                'UPDATE shop_codes SET redeemed_by = NULL, redeemed_at = NULL WHERE id = $1 AND redeemed_by = $2', [code.id, userId],
            );
            throw new ServiceUnavailableException('Gutschrift gerade nicht möglich — der Code bleibt gültig');
        }

        await this.dataSource.query(
            `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'redeemed', $3)`,
            [code.order_id, userId, JSON.stringify({ code_id: code.id, kind, amount })],
        );
        return { kind, amount };
    }
}
