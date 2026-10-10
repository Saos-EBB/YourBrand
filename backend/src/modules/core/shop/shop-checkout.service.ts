import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StripeService } from '../payment/stripe.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CheckoutDto } from './dto/checkout.dto';
import { MODES_BY_FULFILLMENT } from './shop.constants';
import type { ShopFulfillment } from './shop.constants';

export interface CartProduct {
    id: string;
    sku: string;
    title: string;
    fulfillment: ShopFulfillment;
    price_cents: number;
    vat_rate: number;
    // freie Menge: Bestand, freie Keys, oder null = unbegrenzt
    available: number | null;
}

export interface CartLine {
    product: CartProduct;
    quantity: number;
}

const MAX_DESIRED_DAYS = 7;

// Prueft den Warenkorb gegen die Artikel aus der DB und die Pflichtangaben
// der Lieferart. Wirft BadRequest mit dem ersten Problem; reine Funktion.
export function validateCart(dto: CheckoutDto, products: CartProduct[], now = new Date()): CartLine[] {
    const byId = new Map(products.map((p) => [p.id, p]));
    const quantities = new Map<string, number>();
    for (const item of dto.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

    const lines: CartLine[] = [];
    for (const [id, quantity] of quantities) {
        const product = byId.get(id);
        if (!product) throw new BadRequestException('Ein Artikel ist nicht mehr verfügbar');
        if (quantity > 99) throw new BadRequestException(`Höchstens 99 × „${product.title}“`);
        if (!MODES_BY_FULFILLMENT[product.fulfillment].includes(dto.deliveryMode)) {
            throw new BadRequestException(`„${product.title}“ passt nicht zur Lieferart ${dto.deliveryMode} — bitte getrennt bestellen`);
        }
        if (product.available !== null && product.available < quantity) {
            throw new BadRequestException(`Von „${product.title}“ sind nur noch ${product.available} da`);
        }
        lines.push({ product, quantity });
    }

    const missing = (field: string) => new BadRequestException(`Für ${dto.deliveryMode} fehlt: ${field}`);
    switch (dto.deliveryMode) {
        case 'delivery':
            if (!dto.deliveryAddress) throw missing('Adresse');
            if (!dto.contactPhone) throw missing('Telefon');
            break;
        case 'pickup':
            if (!dto.contactName) throw missing('Name');
            if (!dto.contactPhone) throw missing('Telefon');
            break;
        case 'shipping':
            if (!dto.deliveryAddress) throw missing('Lieferadresse');
            break;
        case 'digital':
            if (dto.withdrawalWaiver !== true) {
                throw new BadRequestException('Für digitale Inhalte ist die Zustimmung zum Erlöschen des Widerrufsrechts nötig');
            }
            break;
    }
    if (dto.deliveryMode === 'delivery' || dto.deliveryMode === 'pickup') {
        if (!dto.desiredAt) throw missing('Wunschzeit');
        const desired = new Date(dto.desiredAt).getTime();
        if (desired < now.getTime() || desired > now.getTime() + MAX_DESIRED_DAYS * 86_400_000) {
            throw new BadRequestException(`Wunschzeit muss in den nächsten ${MAX_DESIRED_DAYS} Tagen liegen`);
        }
    }
    return lines;
}

@Injectable()
export class ShopCheckoutService {
    private readonly logger = new Logger(ShopCheckoutService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly stripeService: StripeService,
        private readonly settings: SystemSettingsService,
    ) { }

    // Legt die Bestellung als 'pending' an und oeffnet eine Stripe-Session,
    // die nur reserviert (capture_method manual). Abgebucht wird erst bei der
    // Annahme — siehe Ablauf in migrations/007_shop.sql.
    async checkout(userId: string, dto: CheckoutDto): Promise<{ orderId: string; clientSecret: string }> {
        const [blocked] = await this.dataSource.query(
            'SELECT 1 FROM shop_user_blocks WHERE user_id = $1 AND (until IS NULL OR until > now())',
            [userId],
        );
        if (blocked) throw new ForbiddenException('Dein Konto ist für den Shop gesperrt — bitte wende dich an den Support');

        const products: CartProduct[] = await this.dataSource.query(
            `SELECT p.id, p.sku, p.title, p.fulfillment, p.price_cents, p.vat_rate::float AS vat_rate,
                    CASE WHEN p.fulfillment = 'license' THEN
                             (SELECT count(*)::int FROM shop_codes c
                               WHERE c.product_id = p.id AND c.assigned_at IS NULL AND c.revoked_at IS NULL)
                         ELSE p.stock END AS available
               FROM shop_products p WHERE p.id = ANY($1) AND p.active`,
            [dto.items.map((i) => i.productId)],
        );
        const lines = validateCart(dto, products);

        const itemsCents = lines.reduce((sum, l) => sum + l.product.price_cents * l.quantity, 0);
        const shippingCents = dto.deliveryMode === 'shipping' ? await this.settings.getNumber('shop_shipping_cents', 490) : 0;

        const orderId: string = await this.dataSource.transaction(async (tx) => {
            const [order] = await tx.query(
                `INSERT INTO shop_orders (user_id, delivery_mode, items_cents, shipping_cents, total_cents,
                        contact_name, contact_phone, delivery_address, desired_at, delivery_note, withdrawal_waiver_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                [userId, dto.deliveryMode, itemsCents, shippingCents, itemsCents + shippingCents,
                    dto.contactName ?? null, dto.contactPhone ?? null, dto.deliveryAddress ?? null,
                    dto.desiredAt ?? null, dto.deliveryNote ?? null,
                    dto.deliveryMode === 'digital' ? new Date() : null],
            );
            for (const { product, quantity } of lines) {
                await tx.query(
                    `INSERT INTO shop_order_items (order_id, product_id, sku, title, fulfillment, quantity, unit_price_cents, vat_rate)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [order.id, product.id, product.sku, product.title, product.fulfillment, quantity, product.price_cents, product.vat_rate],
                );
            }
            await tx.query(
                `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'created', $3)`,
                [order.id, userId, JSON.stringify({ items_cents: itemsCents, shipping_cents: shippingCents, delivery_mode: dto.deliveryMode })],
            );
            return order.id;
        });

        // metadata ohne userId/plan: der Abo-Zweig in PaymentService.handleWebhook ignoriert die Session
        const metadata = { kind: 'shop', orderId };
        let session;
        try {
            session = await this.stripeService.stripe.checkout.sessions.create({
                mode: 'payment',
                ui_mode: 'embedded_page' as any,
                line_items: [
                    ...lines.map(({ product, quantity }) => ({
                        quantity,
                        price_data: { currency: 'eur', unit_amount: product.price_cents, product_data: { name: product.title } },
                    })),
                    ...(shippingCents > 0 ? [{
                        quantity: 1,
                        price_data: { currency: 'eur', unit_amount: shippingCents, product_data: { name: 'Versand' } },
                    }] : []),
                ],
                payment_intent_data: { capture_method: 'manual', metadata },
                // Rechnungsadresse fuer die Rechnung (§ 14 UStG)
                billing_address_collection: 'required',
                metadata,
                return_url: `${process.env.APP_URL ?? 'http://localhost:3001'}/shop/orders/${orderId}`,
            });
        } catch (err: any) {
            this.logger.error(`Stripe-Session fuer Bestellung ${orderId} fehlgeschlagen: ${err?.message}`);
            await this.dataSource.query(`UPDATE shop_orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
            await this.dataSource.query(
                `INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'stripe_error', $2)`,
                [orderId, JSON.stringify({ message: err?.message ?? 'unbekannt' })],
            );
            throw new ServiceUnavailableException('Bezahlung gerade nicht möglich — bitte später nochmal');
        }

        await this.dataSource.query('UPDATE shop_orders SET stripe_session_id = $2 WHERE id = $1', [orderId, session.id]);
        return { orderId, clientSecret: session.client_secret as string };
    }
}
