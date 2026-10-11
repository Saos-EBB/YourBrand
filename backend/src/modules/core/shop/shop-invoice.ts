// Rechnungsbetraege ohne DB: Preise sind brutto in Cent, MwSt-Saetze 0/7/19 (%).
// Jede Summe geht auf den Cent auf — Verteilungen per groesstem Rest.

export interface VatRow { rate: number; grossCents: number; netCents: number; vatCents: number }
export interface VatBreakdown { rows: VatRow[]; grossCents: number; netCents: number; vatCents: number }

const vatOf = (grossCents: number, rate: number) => Math.round((grossCents * rate) / (100 + rate));

// total auf Gewichte verteilen, Summe exakt = total
export function distribute(total: number, weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0));
    const exact = weights.map((w) => (total * w) / sum);
    const parts = exact.map(Math.floor);
    let rest = total - parts.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const { i } of order) {
        if (rest <= 0) break;
        parts[i]++;
        rest--;
    }
    return parts;
}

function breakdown(byRate: Map<number, number>): VatBreakdown {
    const rows = [...byRate.entries()]
        .filter(([, gross]) => gross !== 0)
        .sort(([a], [b]) => b - a)
        .map(([rate, grossCents]) => {
            const vatCents = vatOf(grossCents, rate);
            return { rate, grossCents, netCents: grossCents - vatCents, vatCents };
        });
    const total = (k: keyof VatRow) => rows.reduce((s, r) => s + r[k], 0);
    return { rows, grossCents: total('grossCents'), netCents: total('netCents'), vatCents: total('vatCents') };
}

// Versand ist Nebenleistung: teilt sich auf die Saetze wie die Artikel (Aufteilung nach Entgelt)
export function vatBreakdown(lines: { grossCents: number; vatRate: number }[], shippingCents: number): VatBreakdown {
    const byRate = new Map<number, number>();
    for (const l of lines) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + l.grossCents);
    const rates = [...byRate.keys()];
    const shipping = distribute(shippingCents, rates.map((r) => byRate.get(r)!));
    rates.forEach((r, i) => byRate.set(r, byRate.get(r)! + shipping[i]));
    return breakdown(byRate);
}

// Stornorechnung ueber amountCents: anteilig wie die Originalrechnung, Betraege negativ
export function creditNoteBreakdown(original: VatBreakdown, amountCents: number): VatBreakdown {
    const parts = distribute(amountCents, original.rows.map((r) => r.grossCents));
    const b = breakdown(new Map(original.rows.map((r, i) => [r.rate, parts[i]])));
    const neg = (n: number) => (n === 0 ? 0 : -n);
    return {
        rows: b.rows.map((r) => ({ rate: r.rate, grossCents: neg(r.grossCents), netCents: neg(r.netCents), vatCents: neg(r.vatCents) })),
        grossCents: neg(b.grossCents), netCents: neg(b.netCents), vatCents: neg(b.vatCents),
    };
}

// RE-2026-000042 / ST-2026-000043 — Rechnungen und Stornos teilen sich den Zaehler pro Jahr
export function invoiceNumber(kind: 'invoice' | 'credit_note', year: number, no: number): string {
    return `${kind === 'invoice' ? 'RE' : 'ST'}-${year}-${String(no).padStart(6, '0')}`;
}

export function euro(cents: number): string {
    return `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
