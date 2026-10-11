import { creditNoteBreakdown, distribute, euro, invoiceNumber, vatBreakdown } from './shop-invoice';

describe('shop-invoice', () => {
    it('distribute: Summe stimmt immer, Rest nach groesstem Bruchteil', () => {
        expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33]);
        expect(distribute(490, [1000, 0])).toEqual([490, 0]);
        expect(distribute(7, [0, 0])).toEqual([7, 0]);
        for (const [t, w] of [[1, [3, 3]], [999, [17, 1, 5]], [0, [2, 9]]] as [number, number[]][]) {
            expect(distribute(t, w).reduce((a, b) => a + b, 0)).toBe(t);
        }
    });

    it('ein Satz: MwSt aus brutto herausgerechnet', () => {
        const b = vatBreakdown([{ grossCents: 1190, vatRate: 19 }], 0);
        expect(b).toEqual({ rows: [{ rate: 19, grossCents: 1190, netCents: 1000, vatCents: 190 }], grossCents: 1190, netCents: 1000, vatCents: 190 });
    });

    it('gemischte Saetze: Versand anteilig, Summen gehen auf', () => {
        const b = vatBreakdown([{ grossCents: 3000, vatRate: 19 }, { grossCents: 1000, vatRate: 7 }, { grossCents: 999, vatRate: 7 }], 490);
        expect(b.rows.map((r) => r.rate)).toEqual([19, 7]);
        // 490 im Verhaeltnis 3000 : 1999
        expect(b.rows[0].grossCents).toBe(3000 + 294);
        expect(b.rows[1].grossCents).toBe(1999 + 196);
        expect(b.grossCents).toBe(3000 + 1999 + 490);
        expect(b.netCents + b.vatCents).toBe(b.grossCents);
        for (const r of b.rows) expect(r.netCents + r.vatCents).toBe(r.grossCents);
    });

    it('0 %: keine Steuer', () => {
        expect(vatBreakdown([{ grossCents: 500, vatRate: 0 }], 0).vatCents).toBe(0);
    });

    it('Storno: anteilig wie die Rechnung, negativ, Summe = Erstattung', () => {
        const original = vatBreakdown([{ grossCents: 3000, vatRate: 19 }, { grossCents: 1000, vatRate: 7 }], 0);
        const c = creditNoteBreakdown(original, 1001);
        expect(c.grossCents).toBe(-1001);
        expect(c.rows.map((r) => r.grossCents)).toEqual([-751, -250]);
        expect(c.netCents + c.vatCents).toBe(-1001);
        const full = creditNoteBreakdown(original, 4000);
        expect(full.rows.map((r) => [r.rate, r.vatCents])).toEqual(original.rows.map((r) => [r.rate, -r.vatCents]));
    });

    it('Nummer und Euro-Format', () => {
        expect(invoiceNumber('invoice', 2026, 42)).toBe('RE-2026-000042');
        expect(invoiceNumber('credit_note', 2026, 43)).toBe('ST-2026-000043');
        expect(euro(123456).replace(/\s/g, ' ')).toBe('1.234,56 €');
        expect(euro(-490).replace(/\s/g, ' ')).toBe('-4,90 €');
    });
});
