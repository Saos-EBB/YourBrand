import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { validateCart } from './shop-checkout.service';
import type { CartProduct } from './shop-checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

const NOW = new Date('2026-10-10T12:00:00Z');
const IN_ONE_HOUR = '2026-10-10T13:00:00Z';

const product = (id: string, fulfillment: CartProduct['fulfillment'], available: number | null = null): CartProduct =>
    ({ id, sku: id, title: `Artikel ${id}`, fulfillment, price_cents: 990, vat_rate: 19, available });

const PIZZA = product('11111111-1111-4111-8111-111111111111', 'food');
const SHIRT = product('22222222-2222-4222-8222-222222222222', 'physical', 3);
const KEY = product('33333333-3333-4333-8333-333333333333', 'license', 1);
const CODE = product('44444444-4444-4444-8444-444444444444', 'unlock');

const dto = (raw: object) => plainToInstance(CheckoutDto, raw);
const items = (...ps: [CartProduct, number][]) => ps.map(([p, quantity]) => ({ productId: p.id, quantity }));
const message = (fn: () => unknown) => {
    try { fn(); return null; } catch (e: any) { return e.message as string; }
};

describe('validateCart', () => {
    it('Essen liefern: Adresse, Telefon und Wunschzeit sind Pflicht', () => {
        const base = { items: items([PIZZA, 2]), deliveryMode: 'delivery' };
        expect(message(() => validateCart(dto(base), [PIZZA], NOW))).toMatch(/Adresse/);
        expect(message(() => validateCart(dto({ ...base, deliveryAddress: 'Str 1' }), [PIZZA], NOW))).toMatch(/Telefon/);
        expect(message(() => validateCart(dto({ ...base, deliveryAddress: 'Str 1', contactPhone: '0151 1' }), [PIZZA], NOW))).toMatch(/Wunschzeit/);
        const lines = validateCart(dto({ ...base, deliveryAddress: 'Str 1', contactPhone: '0151 1', desiredAt: IN_ONE_HOUR }), [PIZZA], NOW);
        expect(lines).toEqual([{ product: PIZZA, quantity: 2 }]);
    });

    it('Wunschzeit nicht in der Vergangenheit und hoechstens 7 Tage voraus', () => {
        const base = { items: items([PIZZA, 1]), deliveryMode: 'pickup', contactName: 'Kim', contactPhone: '0151 1' };
        expect(message(() => validateCart(dto({ ...base, desiredAt: '2026-10-10T11:00:00Z' }), [PIZZA], NOW))).toMatch(/7 Tagen/);
        expect(message(() => validateCart(dto({ ...base, desiredAt: '2026-10-18T12:00:00Z' }), [PIZZA], NOW))).toMatch(/7 Tagen/);
    });

    it('digital nur mit Zustimmung zum Erloeschen des Widerrufsrechts', () => {
        const base = { items: items([CODE, 1]), deliveryMode: 'digital' };
        expect(message(() => validateCart(dto(base), [CODE], NOW))).toMatch(/Widerrufsrechts/);
        expect(validateCart(dto({ ...base, withdrawalWaiver: true }), [CODE], NOW)).toHaveLength(1);
    });

    it('eine Lieferart pro Bestellung: Essen und Merch getrennt', () => {
        const raw = { items: items([PIZZA, 1], [SHIRT, 1]), deliveryMode: 'shipping', deliveryAddress: 'Str 1' };
        expect(message(() => validateCart(dto(raw), [PIZZA, SHIRT], NOW))).toMatch(/getrennt bestellen/);
    });

    it('Bestand und freie Keys, doppelte Positionen werden zusammengezaehlt', () => {
        const shirts = { items: items([SHIRT, 2], [SHIRT, 2]), deliveryMode: 'shipping', deliveryAddress: 'Str 1' };
        expect(message(() => validateCart(dto(shirts), [SHIRT], NOW))).toMatch(/nur noch 3/);
        const keys = { items: items([KEY, 2]), deliveryMode: 'digital', withdrawalWaiver: true };
        expect(message(() => validateCart(dto(keys), [KEY], NOW))).toMatch(/nur noch 1/);
    });

    it('unbekannter oder inaktiver Artikel', () => {
        const raw = { items: items([CODE, 1]), deliveryMode: 'digital', withdrawalWaiver: true };
        expect(message(() => validateCart(dto(raw), [], NOW))).toMatch(/nicht mehr verfügbar/);
    });
});

describe('CheckoutDto', () => {
    const errors = (raw: object) => validateSync(dto(raw), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);

    it('lehnt Preise vom Client, leere Warenkoerbe und falsche Mengen ab', () => {
        expect(errors({ items: [{ productId: CODE.id, quantity: 1, price: 1 }], deliveryMode: 'digital' })).toEqual(['items']);
        expect(errors({ items: [], deliveryMode: 'digital' })).toEqual(['items']);
        expect(errors({ items: [{ productId: CODE.id, quantity: 100 }], deliveryMode: 'digital' })).toEqual(['items']);
        expect(errors({ items: items([CODE, 1]), deliveryMode: 'drone' })).toEqual(['deliveryMode']);
        expect(errors({ items: items([CODE, 1]), deliveryMode: 'digital', totalCents: 1 })).toEqual(['totalCents']);
    });
});
