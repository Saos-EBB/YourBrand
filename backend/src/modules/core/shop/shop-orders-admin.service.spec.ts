import 'reflect-metadata';
import { BadGatewayException, ConflictException } from '@nestjs/common';
import { ShopOrdersAdminService } from './shop-orders-admin.service';

const ORDER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

// Kleine Attrappe: SELECT liefert die Bestellung, UPDATE gibt [rows, count] wie pg
function setup(order: { status: string; stripe_payment_intent_id: string | null } | null, opts: { raced?: boolean; stripeFails?: boolean } = {}) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT status')) return order ? [order] : [];
        if (sql.startsWith('UPDATE')) return opts.raced ? [[], 0] : [[{ id: ORDER, status: params[1] }], 1];
        return [];
    });
    const dataSource = { query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) };
    const fail = async () => { throw new Error('Your card authorization has expired'); };
    const intents = {
        capture: jest.fn(opts.stripeFails ? fail : async () => ({})),
        cancel: jest.fn(opts.stripeFails ? fail : async () => ({})),
    };
    const fulfillment = {
        checkKeys: jest.fn(async () => undefined),
        onApproved: jest.fn(async () => ({ status: 'approved', progress: 'accepted' })),
    };
    const invoices = { enqueue: jest.fn(async () => undefined) };
    const buyerMail = { declined: jest.fn(async () => undefined) };
    const service = new ShopOrdersAdminService(dataSource as any, { payments: () => intents } as any, fulfillment as any, invoices as any, buyerMail as any);
    // Typ steht als Parameter ($3) oder als Literal im SQL ('stripe_error')
    const events = () => calls.filter((c) => c.sql.includes('shop_order_events'))
        .map((c) => (c.sql.includes(`'stripe_error'`) ? 'stripe_error' : c.params[2]));
    return { service, intents, calls, events, fulfillment, invoices, buyerMail };
}

describe('ShopOrdersAdminService.decide', () => {
    it('Annehmen bucht ab, setzt approved und schreibt das Protokoll', async () => {
        const { service, intents, calls, events, invoices } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' });
        await expect(service.approve(ADMIN, ORDER, '  passt  ')).resolves.toEqual({ id: ORDER, status: 'approved', progress: 'accepted' });
        expect(intents.capture).toHaveBeenCalledWith('pi_1', `shop-approve-${ORDER}`);
        const update = calls.find((c) => c.sql.startsWith('UPDATE'))!;
        expect(update.sql).toContain('status = $5');
        expect(update.params).toEqual([ORDER, 'approved', ADMIN, 'passt', 'held']);
        expect(events()).toEqual(['approved']);
        expect(invoices.enqueue).toHaveBeenCalledWith({ kind: 'invoice', orderId: ORDER });
    });

    it('Ablehnen gibt die Reservierung frei und speichert die Begruendung', async () => {
        const { service, intents, calls, buyerMail } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' });
        await service.reject(ADMIN, ORDER, 'Karte passt nicht zum Land');
        expect(intents.cancel).toHaveBeenCalledWith('pi_1', `shop-reject-${ORDER}`);
        expect(buyerMail.declined).toHaveBeenCalledWith(ORDER, 'rejected');
        const event = calls.find((c) => c.sql.includes('shop_order_events'))!;
        expect(JSON.parse(event.params[3] as string)).toEqual({ note: 'Karte passt nicht zum Land' });
    });

    it('zu wenig Keys: kein Abbuchen, Status bleibt', async () => {
        const { service, intents, fulfillment, calls } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' });
        fulfillment.checkKeys.mockRejectedValueOnce(new ConflictException('Zu wenig freie Keys'));
        await expect(service.approve(ADMIN, ORDER)).rejects.toThrow(/Keys/);
        expect(intents.capture).not.toHaveBeenCalled();
        expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
    });

    it('Ablehnen liefert nichts aus', async () => {
        const { service, fulfillment, invoices } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' });
        await service.reject(ADMIN, ORDER, 'Verdacht auf Betrug');
        expect(invoices.enqueue).not.toHaveBeenCalled();
        expect(fulfillment.checkKeys).not.toHaveBeenCalled();
        expect(fulfillment.onApproved).not.toHaveBeenCalled();
    });

    it('nur angehaltene Bestellungen, sonst 409 ohne Stripe-Aufruf', async () => {
        const { service, intents } = setup({ status: 'approved', stripe_payment_intent_id: 'pi_1' });
        await expect(service.approve(ADMIN, ORDER)).rejects.toBeInstanceOf(ConflictException);
        expect(intents.capture).not.toHaveBeenCalled();
    });

    it('ohne Reservierung: Annehmen geht nicht, Ablehnen schon', async () => {
        const a = setup({ status: 'held', stripe_payment_intent_id: null });
        await expect(a.service.approve(ADMIN, ORDER)).rejects.toThrow(/Keine Zahlung/);
        const r = setup({ status: 'held', stripe_payment_intent_id: null });
        await expect(r.service.reject(ADMIN, ORDER, 'kein Geld da')).resolves.toMatchObject({ status: 'rejected' });
        expect(r.intents.cancel).not.toHaveBeenCalled();
    });

    it('Stripe-Fehler: Status bleibt, Fehler steht im Protokoll', async () => {
        const { service, calls, events } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' }, { stripeFails: true });
        await expect(service.approve(ADMIN, ORDER)).rejects.toBeInstanceOf(BadGatewayException);
        expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
        expect(events()).toEqual(['stripe_error']);
    });

    it('zwei Admins gleichzeitig: der zweite bekommt 409', async () => {
        const { service } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' }, { raced: true });
        await expect(service.approve(ADMIN, ORDER)).rejects.toThrow(/schon entschieden/);
    });

    it('System nimmt an: aus authorized, ohne Admin, gleicher Idempotency-Key, Rechnung', async () => {
        const { service, intents, calls, invoices } = setup({ status: 'authorized', stripe_payment_intent_id: 'pi_1' });
        await expect(service.approveBySystem(ORDER)).resolves.toMatchObject({ status: 'approved' });
        expect(intents.capture).toHaveBeenCalledWith('pi_1', `shop-approve-${ORDER}`);
        const update = calls.find((c) => c.sql.startsWith('UPDATE'))!;
        expect(update.params).toEqual([ORDER, 'approved', null, null, 'authorized']);
        expect(invoices.enqueue).toHaveBeenCalledWith({ kind: 'invoice', orderId: ORDER });
    });

    it('System nimmt nichts an, was schon angehalten ist', async () => {
        const { service, intents } = setup({ status: 'held', stripe_payment_intent_id: 'pi_1' });
        await expect(service.approveBySystem(ORDER)).rejects.toBeInstanceOf(ConflictException);
        expect(intents.capture).not.toHaveBeenCalled();
    });
});
