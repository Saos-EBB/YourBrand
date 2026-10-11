import { ModuleBroker, ModuleUnavailableError } from './module-broker';

describe('ModuleBroker', () => {
    it('ohne Anbieter: klarer Fehler statt Absturz', async () => {
        const broker = new ModuleBroker();
        expect(() => broker.payments()).toThrow(ModuleUnavailableError);
        expect(broker.canUnlock('coins')).toBe(false);
        await expect(broker.unlock('coins', { userId: 'u', amount: 1, idempotencyKey: 'k' })).rejects.toBeInstanceOf(ModuleUnavailableError);
    });

    it('angemeldeter Anbieter wird aufgerufen, doppelte Anmeldung ist ein Fehler', async () => {
        const broker = new ModuleBroker();
        const handler = jest.fn(async () => undefined);
        broker.provideUnlock('coins', handler);
        expect(broker.canUnlock('coins')).toBe(true);
        await broker.unlock('coins', { userId: 'u', amount: 500, idempotencyKey: 'k' });
        expect(handler).toHaveBeenCalledWith({ userId: 'u', amount: 500, idempotencyKey: 'k' });
        expect(() => broker.provideUnlock('coins', handler)).toThrow(/schon angemeldet/);
        const gw = { createReservedCheckout: jest.fn(), capture: jest.fn(), cancel: jest.fn(), refund: jest.fn() };
        broker.providePayments(gw);
        expect(broker.payments()).toBe(gw);
        expect(() => broker.providePayments(gw)).toThrow(/schon angemeldet/);
    });

    it('Zahlungs-Events gehen an das Modul, das sich fuer kind angemeldet hat', async () => {
        const broker = new ModuleBroker();
        const handler = jest.fn(async () => undefined);
        const event = { type: 'canceled' as const, paymentIntentId: 'pi_1', metadata: { kind: 'shop', orderId: 'o1' } };
        await expect(broker.dispatchPaymentEvent('shop', event)).resolves.toBe(false);
        broker.handlePaymentEvents('shop', handler);
        await expect(broker.dispatchPaymentEvent('shop', event)).resolves.toBe(true);
        expect(handler).toHaveBeenCalledWith(event);
        expect(() => broker.handlePaymentEvents('shop', handler)).toThrow(/schon angemeldet/);
    });
});
