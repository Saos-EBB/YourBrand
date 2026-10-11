import 'reflect-metadata';
import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShopRefundService } from './shop-refund.service';

const ORDER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

type Order = { status: string; total_cents: number; refunded_cents: number; stripe_payment_intent_id: string | null };

// Attrappe: Transaktion laeuft auf derselben query-Funktion; "rolledBack" merkt sich,
// welche Aufrufe in einer fehlgeschlagenen Transaktion lagen
function setup(order: Order | null, opts: { stripeFails?: boolean; revocable?: number; redeemed?: number } = {}) {
    const committed: { sql: string; params: unknown[] }[] = [];
    let pending: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        pending.push({ sql, params });
        if (sql.startsWith('SELECT status')) return order ? [order] : [];
        if (sql.startsWith('UPDATE shop_codes')) return [Array.from({ length: opts.revocable ?? 0 }, (_, i) => ({ id: i })), opts.revocable ?? 0];
        if (sql.includes('AS redeemed')) return [{ redeemed: opts.redeemed ?? 0 }];
        return [];
    });
    const dataSource = {
        query: async (sql: string, params: unknown[] = []) => { const r = await query(sql, params); committed.push(...pending); pending = []; return r; },
        transaction: async (fn: (m: unknown) => unknown) => {
            pending = [];
            try { const r = await fn({ query }); committed.push(...pending); return r; } finally { pending = []; }
        },
    };
    const payments = {
        refund: jest.fn(async () => {
            if (opts.stripeFails) throw new Error('Charge already refunded');
            return { refundId: 're_1' };
        }),
    };
    const invoices = { enqueue: jest.fn(async () => undefined) };
    const service = new ShopRefundService(dataSource as any, { payments: () => payments } as any, invoices as any);
    const events = () => committed.filter((c) => c.sql.includes('shop_order_events'))
        .map((c) => ({ type: c.sql.includes(`'stripe_error'`) ? 'stripe_error' : 'refunded', data: JSON.parse(c.params[2] as string) }));
    return { service, payments, committed, events, invoices };
}

const paid: Order = { status: 'fulfilled', total_cents: 5000, refunded_cents: 0, stripe_payment_intent_id: 'pi_1' };

describe('ShopRefundService.refund', () => {
    it('voll erstatten: Status refunded, offene Codes gesperrt, Protokoll mit Refund-ID', async () => {
        const { service, payments, committed, events, invoices } = setup(paid, { revocable: 2, redeemed: 1 });
        await expect(service.refund(ADMIN, ORDER, 5000, '  Ware nie angekommen  ')).resolves.toEqual({
            id: ORDER, status: 'refunded', refunded_cents: 5000, revoked: 2, already_redeemed: 1,
        });
        expect(payments.refund).toHaveBeenCalledWith('pi_1', 5000, `shop-refund-${ORDER}-0-5000`);
        const update = committed.find((c) => c.sql.startsWith('UPDATE shop_orders'))!;
        expect(update.params).toEqual([ORDER, 5000, 'refunded']);
        expect(committed.find((c) => c.sql.startsWith('UPDATE shop_codes'))!.sql).toContain('redeemed_at IS NULL');
        expect(events()).toEqual([{ type: 'refunded', data: { amount_cents: 5000, note: 'Ware nie angekommen', refund_id: 're_1', revoked: 2, already_redeemed: 1 } }]);
        // Stornorechnung erst nach dem Commit
        expect(invoices.enqueue).toHaveBeenCalledWith({ kind: 'credit_note', orderId: ORDER, refundId: 're_1', amountCents: 5000 });
    });

    it('teilweise ohne Haekchen: Codes bleiben gueltig', async () => {
        const { service, committed } = setup(paid, { revocable: 2 });
        await expect(service.refund(ADMIN, ORDER, 1200, 'Eine Pizza fehlte')).resolves.toMatchObject({ status: 'partially_refunded', revoked: 0 });
        expect(committed.some((c) => c.sql.startsWith('UPDATE shop_codes'))).toBe(false);
    });

    it('teilweise mit Haekchen: Codes gesperrt', async () => {
        const { service } = setup(paid, { revocable: 1 });
        await expect(service.refund(ADMIN, ORDER, 1200, 'Code war weitergegeben', true)).resolves.toMatchObject({ revoked: 1 });
    });

    it('Rest nach Teil-Erstattung ist eine volle Erstattung; Schluessel haengt am Stand vorher', async () => {
        const { service, payments } = setup({ ...paid, status: 'partially_refunded', refunded_cents: 1200 });
        await expect(service.refund(ADMIN, ORDER, 3800, 'Rest auch zurück')).resolves.toMatchObject({ status: 'refunded', refunded_cents: 5000 });
        expect(payments.refund).toHaveBeenCalledWith('pi_1', 3800, `shop-refund-${ORDER}-1200-3800`);
    });

    it('mehr als offen: 400 ohne Stripe-Aufruf', async () => {
        const { service, payments } = setup({ ...paid, refunded_cents: 4000 });
        await expect(service.refund(ADMIN, ORDER, 1001, 'zu viel')).rejects.toBeInstanceOf(BadRequestException);
        expect(payments.refund).not.toHaveBeenCalled();
    });

    it.each(['held', 'rejected', 'refunded', 'pending'])('Status %s: 409', async (status) => {
        const { service, payments } = setup({ ...paid, status });
        await expect(service.refund(ADMIN, ORDER, 100, 'geht nicht')).rejects.toBeInstanceOf(ConflictException);
        expect(payments.refund).not.toHaveBeenCalled();
    });

    it('unbekannte Bestellung: 404', async () => {
        const { service } = setup(null);
        await expect(service.refund(ADMIN, ORDER, 100, 'gibt es nicht')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Stripe-Fehler: nichts geaendert, Fehler bleibt im Protokoll', async () => {
        const { service, committed, events, invoices } = setup(paid, { stripeFails: true });
        await expect(service.refund(ADMIN, ORDER, 5000, 'nochmal')).rejects.toBeInstanceOf(BadGatewayException);
        expect(invoices.enqueue).not.toHaveBeenCalled();
        expect(committed.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
        expect(events()).toEqual([{ type: 'stripe_error', data: { action: 'refund', message: 'Charge already refunded' } }]);
    });

    describe('applyExternal (Stripe-Dashboard)', () => {
        function ext(order: { status: string; total_cents: number; refunded_cents: number }, known: string[] = [], revocable = 0) {
            const calls: { sql: string; params: unknown[] }[] = [];
            const query = jest.fn(async (sql: string, params: unknown[] = []) => {
                calls.push({ sql, params });
                if (sql.startsWith('SELECT status')) return [order];
                if (sql.includes(`data->>'refund_id'`)) return known.map((id) => ({ id }));
                if (sql.startsWith('UPDATE shop_codes')) return [Array.from({ length: revocable }, (_, i) => ({ id: i })), revocable];
                return [];
            });
            const invoices = { enqueue: jest.fn(async () => undefined) };
            const service = new ShopRefundService({ query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) } as any, {} as any, invoices as any);
            return { service, calls, invoices };
        }

        it('neue Erstattung: verbuchen, Protokoll als extern, Stornorechnung', async () => {
            const { service, calls, invoices } = ext({ status: 'fulfilled', total_cents: 5000, refunded_cents: 0 });
            await service.applyExternal(ORDER, [{ id: 're_x', amountCents: 1200 }]);
            expect(calls.find((c) => c.sql.startsWith('UPDATE shop_orders'))!.params).toEqual([ORDER, 1200, 'partially_refunded']);
            const ev = calls.find((c) => c.sql.startsWith('INSERT INTO shop_order_events'))!;
            expect(JSON.parse(ev.params[1] as string)).toMatchObject({ amount_cents: 1200, refund_id: 're_x', external: true });
            expect(invoices.enqueue).toHaveBeenCalledWith({ kind: 'credit_note', orderId: ORDER, refundId: 're_x', amountCents: 1200 });
        });

        it('eigene Erstattung (ID schon im Protokoll): nichts doppelt', async () => {
            const { service, calls, invoices } = ext({ status: 'partially_refunded', total_cents: 5000, refunded_cents: 1200 }, ['re_1']);
            await service.applyExternal(ORDER, [{ id: 're_1', amountCents: 1200 }]);
            expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
            expect(invoices.enqueue).not.toHaveBeenCalled();
        });

        it('voll: refunded, offene Codes gesperrt; nie mehr als der Gesamtbetrag', async () => {
            const { service, calls } = ext({ status: 'partially_refunded', total_cents: 5000, refunded_cents: 4000 }, ['re_1'], 2);
            await service.applyExternal(ORDER, [{ id: 're_1', amountCents: 4000 }, { id: 're_2', amountCents: 3000 }]);
            expect(calls.find((c) => c.sql.startsWith('UPDATE shop_orders'))!.params).toEqual([ORDER, 5000, 'refunded']);
            const ev = calls.find((c) => c.sql.startsWith('INSERT INTO shop_order_events'))!;
            expect(JSON.parse(ev.params[1] as string)).toMatchObject({ amount_cents: 1000, refund_id: 're_2', revoked: 2 });
        });

        it('nicht abgebucht (z. B. angehalten): ignorieren', async () => {
            const { service, calls } = ext({ status: 'held', total_cents: 5000, refunded_cents: 0 });
            await service.applyExternal(ORDER, [{ id: 're_x', amountCents: 100 }]);
            expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
        });
    });
});
