import { generateUnlockCode, progressError } from './shop-fulfillment';

describe('progressError', () => {
    it('nur vorwaerts, ueberspringen erlaubt', () => {
        expect(progressError('pickup', 'accepted', 'preparing')).toBeNull();
        expect(progressError('pickup', 'accepted', 'ready')).toBeNull();
        expect(progressError('pickup', 'ready', 'preparing')).toMatch(/vorwärts/);
        expect(progressError('pickup', 'ready', 'ready')).toMatch(/vorwärts/);
    });

    it('Schritt muss zur Lieferart passen', () => {
        expect(progressError('pickup', 'accepted', 'on_the_way')).toMatch(/passt nicht/);
        expect(progressError('shipping', 'accepted', 'preparing')).toMatch(/passt nicht/);
        expect(progressError('shipping', 'accepted', 'shipped')).toBeNull();
        expect(progressError('digital', null, 'delivered')).toMatch(/Digitale/);
    });

    it('nicht angetroffen nur bei Essen und erst ab fertig/unterwegs', () => {
        expect(progressError('pickup', 'preparing', 'not_met')).toMatch(/erst ab/);
        expect(progressError('pickup', 'ready', 'not_met')).toBeNull();
        expect(progressError('delivery', 'on_the_way', 'not_met')).toBeNull();
        expect(progressError('shipping', 'shipped', 'not_met')).toMatch(/nur bei Essen/);
    });

    it('abgeschlossen bleibt abgeschlossen', () => {
        expect(progressError('delivery', 'delivered', 'not_met')).toMatch(/abgeschlossen/);
        expect(progressError('pickup', 'not_met', 'delivered')).toMatch(/abgeschlossen/);
    });
});

describe('generateUnlockCode', () => {
    it('XXXX-XXXX-XXXX ohne verwechselbare Zeichen, zufaellig', () => {
        const codes = Array.from({ length: 200 }, generateUnlockCode);
        for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
        expect(new Set(codes).size).toBe(200);
    });
});
