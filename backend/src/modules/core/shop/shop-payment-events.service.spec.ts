import 'reflect-metadata';
import { ShopPaymentEventsService } from './shop-payment-events.service';

const META = { kind: 'shop', orderId: 'o1' };

function setup(status: string | null) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT status')) return status ? [{ status }] : [];
        return [];
    });
    const ds = { query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) };
    const broker = { handlePaymentEvents: jest.fn() };
    const intake = { onAuthorized: jest.fn(async () => undefined) };
    const refunds = { applyExternal: jest.fn(async () => undefined) };
    const cases = { openDispute: jest.fn(async () => 'c1'), noteDisputeClosed: jest.fn(async () => 'c1') };
    const alerts = { send: jest.fn(async () => undefined) };
    const buyerMail = { declined: jest.fn(async () => undefined) };
    const service = new ShopPaymentEventsService(ds as any, broker as any, intake as any, refunds as any, cases as any, alerts as any, buyerMail as any);
    const updates = () => calls.filter((c) => c.sql.startsWith('UPDATE')).map((c) => c.params);
    return { service, broker, intake, refunds, cases, alerts, buyerMail, updates };
}

describe('ShopPaymentEventsService', () => {
    it('meldet sich beim Broker fuer kind shop an', () => {
        const { service, broker } = setup('pending');
        service.onModuleInit();
        expect(broker.handlePaymentEvents).toHaveBeenCalledWith('shop', expect.any(Function));
    });

    it('Kasse abgelaufen: pending → cancelled, sonst nichts', async () => {
        const a = setup('pending');
        await a.service.handle({ type: 'checkout_expired', paymentIntentId: null, metadata: META });
        expect(a.updates()).toEqual([['o1', 'cancelled']]);
        const b = setup('approved');
        await b.service.handle({ type: 'checkout_expired', paymentIntentId: null, metadata: META });
        expect(b.updates()).toEqual([]);
    });

    it('Reservierung von Stripe aufgehoben: angehalten → expired, Kaeufer-Mail, Alarm', async () => {
        const { service, updates, buyerMail, alerts } = setup('held');
        await service.handle({ type: 'canceled', paymentIntentId: 'pi_1', metadata: META });
        expect(updates()).toEqual([['o1', 'expired']]);
        expect(buyerMail.declined).toHaveBeenCalledWith('o1', 'expired');
        expect(alerts.send).toHaveBeenCalledWith('expired', { orderId: 'o1' });
    });

    it('eigene Aufhebung (abgelehnt/verfallen) kommt zurueck: keine Aenderung, keine Mail', async () => {
        for (const st of ['rejected', 'expired']) {
            const { service, updates, buyerMail } = setup(st);
            await service.handle({ type: 'canceled', paymentIntentId: 'pi_1', metadata: META });
            expect(updates()).toEqual([]);
            expect(buyerMail.declined).not.toHaveBeenCalled();
        }
    });

    it('weiterreichen: reserviert, erstattet, Rueckbuchung', async () => {
        const { service, intake, refunds, cases, alerts } = setup('approved');
        const auth = { type: 'authorized' as const, paymentIntentId: 'pi_1', metadata: META, amountCents: 1, risk: { level: null, score: null }, card: { fingerprint: null, country: null }, billing: { name: null, email: null, address: null } };
        await service.handle(auth);
        expect(intake.onAuthorized).toHaveBeenCalledWith(auth);
        await service.handle({ type: 'refunded', paymentIntentId: 'pi_1', metadata: META, refunds: [{ id: 're_1', amountCents: 100 }] });
        expect(refunds.applyExternal).toHaveBeenCalledWith('o1', [{ id: 're_1', amountCents: 100 }]);
        await service.handle({ type: 'dispute_opened', paymentIntentId: 'pi_1', metadata: META, disputeId: 'dp_1', amountCents: 990, reason: 'fraudulent' });
        expect(cases.openDispute).toHaveBeenCalledWith('o1', 'dp_1', 'fraudulent', 990);
        await service.handle({ type: 'dispute_closed', paymentIntentId: 'pi_1', metadata: META, disputeId: 'dp_1', status: 'won' });
        expect(cases.noteDisputeClosed).toHaveBeenCalledWith('dp_1', 'won');
        expect(alerts.send.mock.calls).toEqual([['dispute', { orderId: 'o1', caseId: 'c1' }], ['dispute', { orderId: 'o1', caseId: 'c1' }]]);
    });

    it('ohne orderId: ignorieren statt werfen (sonst stellt Stripe ewig neu zu)', async () => {
        const { service, intake } = setup('pending');
        await expect(service.handle({ type: 'checkout_expired', paymentIntentId: null, metadata: { kind: 'shop' } })).resolves.toBeUndefined();
        expect(intake.onAuthorized).not.toHaveBeenCalled();
    });
});
