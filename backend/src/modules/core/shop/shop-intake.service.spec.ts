import 'reflect-metadata';
import { BadGatewayException, ConflictException } from '@nestjs/common';
import { ShopIntakeService } from './shop-intake.service';
import { RISK_DEFAULTS, type RiskFacts } from './shop-risk';

const META = { kind: 'shop', orderId: 'o1' };
const calm: RiskFacts = { totalCents: 2000, priorCompleted: 2, ordersLastHour: 1, otherAccountsOnCard: 0, priorDisputesOrReports: 0, radarLevel: 'normal' };
const authorized = (over: Record<string, unknown> = {}) => ({
    type: 'authorized' as const, paymentIntentId: 'pi_1', metadata: META, amountCents: 2000,
    risk: { level: 'normal', score: 12 }, card: { fingerprint: 'fp_1', country: 'DE' },
    billing: { name: 'Kim', email: 'kim@example.com', address: 'Kiezstr. 1\n10999 Berlin\nDE' }, ...over,
});

function setup(o: { status: string; total_cents?: number; delivery_mode?: string } | null, facts: Partial<RiskFacts> = {}) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT')) return o ? [{ id: 'o1', user_id: 'u1', total_cents: 2000, delivery_mode: 'shipping', ...o }] : [];
        return [];
    });
    const ds = { query, transaction: (fn: (m: unknown) => unknown) => fn({ query }) };
    const risk = { thresholds: jest.fn(async () => RISK_DEFAULTS), facts: jest.fn(async () => ({ ...calm, ...facts })) };
    const orders = { approveBySystem: jest.fn(async () => ({ status: 'approved' })) };
    const alerts = { send: jest.fn(async () => undefined) };
    const buyerMail = { received: jest.fn(async () => undefined) };
    const service = new ShopIntakeService(ds as any, risk as any, orders as any, alerts as any, buyerMail as any);
    const held = () => calls.find((c) => c.sql.includes(`status = 'held'`));
    return { service, calls, risk, orders, alerts, buyerMail, held };
}

describe('ShopIntakeService', () => {
    it('unauffaellig: Zahlungsdaten speichern, Eingang mailen, System nimmt an', async () => {
        const { service, calls, orders, buyerMail, alerts, held } = setup({ status: 'pending' });
        await service.onAuthorized(authorized());
        const upd = calls.find((c) => c.sql.includes(`status = 'authorized'`))!;
        expect(upd.params).toEqual(['o1', 'pi_1', 'fp_1', 'normal', 'kim@example.com', 'Kim', 'Kiezstr. 1\n10999 Berlin\nDE']);
        expect(held()).toBeUndefined();
        expect(buyerMail.received).toHaveBeenCalledWith('o1');
        expect(orders.approveBySystem).toHaveBeenCalledWith('o1');
        expect(alerts.send).not.toHaveBeenCalled();
    });

    it('auffaellig: anhalten mit Gruenden und Frist, Admins alarmieren, nicht annehmen', async () => {
        const { service, orders, alerts, held, buyerMail } = setup({ status: 'pending', delivery_mode: 'delivery' }, { radarLevel: 'elevated', priorCompleted: 0, totalCents: 6000 });
        await service.onAuthorized(authorized());
        expect(held()!.params).toEqual(['o1', ['new_buyer', 'radar_elevated'], 30]);
        expect(orders.approveBySystem).not.toHaveBeenCalled();
        expect(alerts.send).toHaveBeenCalledWith('order_held', { orderId: 'o1' });
        expect(buyerMail.received).toHaveBeenCalled();
    });

    it('reservierter Betrag weicht ab: immer anhalten', async () => {
        const { service, held, orders } = setup({ status: 'pending' });
        await service.onAuthorized(authorized({ amountCents: 1999 }));
        expect(held()!.params[1]).toEqual(['amount_mismatch']);
        expect(orders.approveBySystem).not.toHaveBeenCalled();
    });

    it('doppelte Zustellung oder unbekannte Bestellung: nichts passiert', async () => {
        for (const s of [setup({ status: 'authorized' }), setup(null)]) {
            await s.service.onAuthorized(authorized());
            expect(s.calls.filter((c) => !c.sql.startsWith('SELECT'))).toEqual([]);
            expect(s.buyerMail.received).not.toHaveBeenCalled();
            expect(s.orders.approveBySystem).not.toHaveBeenCalled();
        }
    });

    it.each([
        [new BadGatewayException('Stripe: down'), 'capture_failed'],
        [new ConflictException('Zu wenig freie Keys: X (1 fehlen)'), 'keys_missing'],
        [new Error('db weg'), 'system_error'],
    ])('Annahme scheitert (%s): ein Mensch entscheidet (%s)', async (err, reason) => {
        const { service, orders, held, alerts } = setup({ status: 'authorized' });
        orders.approveBySystem.mockRejectedValueOnce(err);
        await service.autoApprove('o1');
        expect(held()!.params).toEqual(['o1', [reason], 1440]);
        expect(alerts.send).toHaveBeenCalledWith('order_held', { orderId: 'o1' });
    });

    it('schon entschieden (Conflict ohne Keys): nicht anhalten', async () => {
        const { service, orders, held } = setup({ status: 'approved' });
        orders.approveBySystem.mockRejectedValueOnce(new ConflictException('Bestellung ist nicht mehr angehalten'));
        await service.autoApprove('o1');
        expect(held()).toBeUndefined();
    });

    it('hold nur aus authorized', async () => {
        const { service, held, alerts } = setup({ status: 'approved' });
        await service.hold('o1', ['system_error']);
        expect(held()).toBeUndefined();
        expect(alerts.send).not.toHaveBeenCalled();
    });
});
