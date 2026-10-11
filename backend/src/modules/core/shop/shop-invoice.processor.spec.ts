import 'reflect-metadata';
import { ShopInvoiceProcessor, buyerOf, type ShopInvoiceJob } from './shop-invoice.processor';

// @nestjs/bullmq ist ESM, Jest laedt es nicht — fuer die Logik reichen Attrappen
jest.mock('@nestjs/bullmq', () => ({ Processor: () => () => undefined, OnWorkerEvent: () => () => undefined, WorkerHost: class { } }));
jest.mock('../../../common/crypto/crypto.helper', () => ({ decryptField: (b: Buffer | null) => (b ? b.toString() : null) }));

const SELLER = { name: 'Kiez GmbH', address: 'Kiezstraße 12, 10999 Berlin', email: 'shop@kiez.example', vatId: 'DE123456789' };
const ORDER = {
    total_cents: 3490 + 490, shipping_cents: 490, decided_at: '2026-10-11T10:00:00Z', fulfilled_at: null, desired_at: null,
    buyer_name: null, buyer_address: null, contact_name: 'Kim', delivery_address: 'Kim\nKiezstr. 1\n10999 Berlin',
};
const ITEMS = [{ title: 'Tasse', sku: 'T-1', quantity: 2, unit_price_cents: 1245, vat_rate: 19 }, { title: 'Kaffee', sku: 'K-1', quantity: 1, unit_price_cents: 1000, vat_rate: 7 }];

type State = { status?: string; invoice?: { id: string; invoice_number: string } | null; byRefund?: { id: string; invoice_number: string } | null; order?: typeof ORDER; counter?: number; pending?: unknown[] };

function setup(state: State = {}, opts: { mailFails?: boolean } = {}) {
    const calls: { sql: string; params: unknown[] }[] = [];
    let counter = state.counter ?? 0;
    let inserted = 0;
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT status FROM shop_orders')) return state.status === 'missing' ? [] : [{ status: state.status ?? 'approved' }];
        if (sql.includes(`kind = 'invoice'`) && sql.startsWith('SELECT id, invoice_number')) return state.invoice ? [state.invoice] : [];
        if (sql.includes('stripe_refund_id = $1')) return state.byRefund ? [state.byRefund] : [];
        if (sql.includes('FROM shop_orders WHERE id = $1') && sql.includes('total_cents')) return [state.order ?? ORDER];
        if (sql.includes('FROM shop_order_items')) return ITEMS;
        if (sql.includes('shop_invoice_counters')) return [{ last_no: ++counter }];
        if (sql.startsWith('INSERT INTO shop_invoices')) {
            const row = { id: `inv${++inserted}`, invoice_number: params[3] };
            if (params[1] === 'invoice') state.invoice = row as never;
            return [row];
        }
        if (sql.includes('FROM shop_invoices i JOIN shop_orders')) return state.pending ?? [];
        return [];
    });
    const ds = { query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) };
    const mail = { sendShopInvoiceEmail: jest.fn(async () => { if (opts.mailFails) throw new Error('resend down'); }) };
    const proc = new ShopInvoiceProcessor(ds as any, mail as any);
    jest.spyOn(proc as any, 'seller').mockReturnValue(SELLER);
    const inserts = () => calls.filter((c) => c.sql.startsWith('INSERT INTO shop_invoices')).map((c) => c.params);
    const run = (data: ShopInvoiceJob) => proc.process({ data } as any);
    return { proc, calls, mail, inserts, run };
}

describe('ShopInvoiceProcessor', () => {
    it('Rechnung: Nummer aus dem Jahreszaehler, PDF, Zeile, Protokoll', async () => {
        const { inserts, calls, run } = setup({ counter: 41 });
        await run({ kind: 'invoice', orderId: 'o1' });
        const [p] = inserts();
        expect(p[1]).toBe('invoice');
        expect(p[3]).toMatch(/^RE-\d{4}-000042$/);
        expect(p[4]).toBe(3980);
        expect(JSON.parse(p[6] as string)).toEqual(SELLER);
        expect((p[7] as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
        expect(calls.some((c) => c.sql.includes(`'invoice_issued'`))).toBe(true);
    });

    it('zweimal: keine zweite Rechnung, keine Nummer verbraucht', async () => {
        const { inserts, calls, run } = setup({ invoice: { id: 'i1', invoice_number: 'RE-2026-000001' } });
        await run({ kind: 'invoice', orderId: 'o1' });
        expect(inserts()).toHaveLength(0);
        expect(calls.some((c) => c.sql.includes('shop_invoice_counters'))).toBe(false);
    });

    it('nicht abgebucht: kein Beleg', async () => {
        const { inserts, mail, run } = setup({ status: 'held' });
        await run({ kind: 'invoice', orderId: 'o1' });
        expect(inserts()).toHaveLength(0);
        expect(mail.sendShopInvoiceEmail).not.toHaveBeenCalled();
    });

    it('Positionen passen nicht zur Summe: Fehler statt falscher Rechnung', async () => {
        const { run, inserts } = setup({ order: { ...ORDER, total_cents: 9999 } });
        await expect(run({ kind: 'invoice', orderId: 'o1' })).rejects.toThrow(/≠ Gesamt 9999/);
        expect(inserts()).toHaveLength(0);
    });

    it('Storno ohne Rechnung: erst Rechnung, dann Storno mit Verweis, negativ, Refund-ID', async () => {
        const { inserts, run } = setup({ counter: 0 });
        await run({ kind: 'credit_note', orderId: 'o1', refundId: 're_1', amountCents: 1000 });
        const [inv, cn] = inserts();
        expect(inv[1]).toBe('invoice');
        expect(cn[1]).toBe('credit_note');
        expect(cn[2]).toBe('inv1');
        expect(cn[3]).toMatch(/^ST-\d{4}-000002$/);
        expect(cn[4]).toBe(-1000);
        expect(cn[8]).toBe('re_1');
    });

    it('Storno zum selben Refund nochmal: nichts Neues', async () => {
        const { inserts, run } = setup({ invoice: { id: 'i1', invoice_number: 'RE-1' }, byRefund: { id: 'c1', invoice_number: 'ST-1' } });
        await run({ kind: 'credit_note', orderId: 'o1', refundId: 're_1', amountCents: 1000 });
        expect(inserts()).toHaveLength(0);
    });

    it('Versand: Stripe-Mail vor Konto-Mail, sent_at danach; ohne Adresse nichts', async () => {
        const pdf = Buffer.from('%PDF-');
        const { mail, calls, run } = setup({
            invoice: { id: 'i1', invoice_number: 'RE-1' },
            pending: [
                { id: 'i1', kind: 'invoice', invoice_number: 'RE-1', pdf, buyer_email: null, email: Buffer.from('kim@example.com') },
                { id: 'c1', kind: 'credit_note', invoice_number: 'ST-2', pdf, buyer_email: 'stripe@example.com', email: Buffer.from('kim@example.com') },
                { id: 'x', kind: 'invoice', invoice_number: 'RE-3', pdf, buyer_email: null, email: null },
            ],
        });
        await run({ kind: 'invoice', orderId: 'o1' });
        expect(mail.sendShopInvoiceEmail.mock.calls.map((c: unknown[]) => [c[0], c[3]])).toEqual([['kim@example.com', 'RE-1.pdf'], ['stripe@example.com', 'ST-2.pdf']]);
        expect(calls.filter((c) => c.sql.startsWith('UPDATE shop_invoices SET sent_at')).map((c) => c.params[0])).toEqual(['i1', 'c1']);
    });

    it('erneut senden schickt auch schon Gesendetes; Mail-Fehler -> Job scheitert (BullMQ wiederholt)', async () => {
        const { calls, run } = setup({ invoice: { id: 'i1', invoice_number: 'RE-1' } });
        await run({ kind: 'invoice', orderId: 'o1', resend: true });
        expect(calls.find((c) => c.sql.includes('sent_at IS NULL OR i.id = $2'))!.params).toEqual(['o1', 'i1']);
        const f = setup({ invoice: { id: 'i1', invoice_number: 'RE-1' }, pending: [{ id: 'i1', kind: 'invoice', invoice_number: 'RE-1', pdf: Buffer.from('x'), buyer_email: 'a@example.com', email: null }] }, { mailFails: true });
        await expect(f.run({ kind: 'invoice', orderId: 'o1' })).rejects.toThrow('resend down');
        expect(f.calls.some((c) => c.sql.startsWith('UPDATE shop_invoices SET sent_at'))).toBe(false);
    });

    it('Empfaenger: Name nicht doppelt, wenn die Adresse damit beginnt', () => {
        const base = { buyer_name: null, buyer_address: null, contact_name: 'Kim Demo', delivery_address: 'Kim Demo\nKiezstr. 1' };
        expect(buyerOf(base)).toEqual({ name: null, address: 'Kim Demo\nKiezstr. 1' });
        expect(buyerOf({ ...base, delivery_address: 'Kiezstr. 1' })).toEqual({ name: 'Kim Demo', address: 'Kiezstr. 1' });
        expect(buyerOf({ ...base, buyer_name: 'Kim Rechnung', buyer_address: 'Postfach 1' })).toEqual({ name: 'Kim Rechnung', address: 'Postfach 1' });
    });
});
