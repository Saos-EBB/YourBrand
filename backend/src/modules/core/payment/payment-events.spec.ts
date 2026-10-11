import { toPaymentEvent, type StripeLookups } from './payment-events';

const META = { kind: 'shop', orderId: 'o1' };

function stripe(over: Partial<{ charge: any; pi: any; refunds: any[] }> = {}): StripeLookups & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        charges: { retrieve: async (id) => { calls.push(`charge ${id}`); return over.charge ?? null; } },
        paymentIntents: { retrieve: async (id) => { calls.push(`pi ${id}`); return over.pi ?? { metadata: META }; } },
        refunds: { list: async (p) => { calls.push(`refunds ${p.payment_intent}`); return { data: over.refunds ?? [] }; } },
    };
}

describe('toPaymentEvent', () => {
    it('Reservierung: Radar, Karte und Rechnungsadresse aus der Charge', async () => {
        const s = stripe({
            charge: {
                outcome: { risk_level: 'elevated', risk_score: 67 },
                payment_method_details: { card: { fingerprint: 'fp_1', country: 'DE' } },
                billing_details: { name: 'Kim', email: 'kim@example.com', address: { line1: 'Kiezstr. 1', line2: null, postal_code: '10999', city: 'Berlin', country: 'DE' } },
            },
        });
        const r = await toPaymentEvent(s, { type: 'payment_intent.amount_capturable_updated', data: { object: { id: 'pi_1', metadata: META, amount: 990, amount_capturable: 990, latest_charge: 'ch_1' } } });
        expect(r).toEqual({
            kind: 'shop',
            event: {
                type: 'authorized', paymentIntentId: 'pi_1', metadata: META, amountCents: 990,
                risk: { level: 'elevated', score: 67 }, card: { fingerprint: 'fp_1', country: 'DE' },
                billing: { name: 'Kim', email: 'kim@example.com', address: 'Kiezstr. 1\n10999 Berlin\nDE' },
            },
        });
    });

    it('Abo-Zahlung ohne kind: null, nichts nachgeschlagen', async () => {
        const s = stripe();
        await expect(toPaymentEvent(s, { type: 'payment_intent.amount_capturable_updated', data: { object: { id: 'pi_1', metadata: { userId: 'u', plan: 'monthly' } } } })).resolves.toBeNull();
        await expect(toPaymentEvent(s, { type: 'checkout.session.completed', data: { object: { metadata: META } } })).resolves.toBeNull();
        expect(s.calls).toEqual([]);
    });

    it('Erstattung: Metadaten vom PaymentIntent, alle gueltigen Refunds', async () => {
        const s = stripe({ refunds: [{ id: 're_1', amount: 500, status: 'succeeded' }, { id: 're_2', amount: 100, status: 'failed' }, { id: 're_3', amount: 50, status: 'pending' }] });
        const r = await toPaymentEvent(s, { type: 'charge.refunded', data: { object: { payment_intent: 'pi_1' } } });
        expect(r?.event).toEqual({ type: 'refunded', paymentIntentId: 'pi_1', metadata: META, refunds: [{ id: 're_1', amountCents: 500 }, { id: 're_3', amountCents: 50 }] });
        expect(s.calls).toEqual(['pi pi_1', 'refunds pi_1']);
    });

    it('Rueckbuchung eroeffnet/geschlossen, abgelaufene Kasse, aufgehobene Reservierung', async () => {
        const s = stripe();
        expect((await toPaymentEvent(s, { type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_1', amount: 990, reason: 'fraudulent' } } }))?.event)
            .toEqual({ type: 'dispute_opened', paymentIntentId: 'pi_1', metadata: META, disputeId: 'dp_1', amountCents: 990, reason: 'fraudulent' });
        expect((await toPaymentEvent(s, { type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_1', status: 'lost' } } }))?.event)
            .toMatchObject({ type: 'dispute_closed', status: 'lost' });
        expect((await toPaymentEvent(s, { type: 'checkout.session.expired', data: { object: { metadata: META, payment_intent: null } } }))?.event)
            .toEqual({ type: 'checkout_expired', paymentIntentId: null, metadata: META });
        expect((await toPaymentEvent(s, { type: 'payment_intent.canceled', data: { object: { id: 'pi_1', metadata: META } } }))?.event)
            .toEqual({ type: 'canceled', paymentIntentId: 'pi_1', metadata: META });
    });
});
