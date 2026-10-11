import type { PaymentEvent } from '../../shared/broker/module-broker';

// Nur was die Uebersetzung von Stripe braucht — im Test leicht zu ersetzen
export interface StripeLookups {
    charges: { retrieve(id: string): Promise<any> };
    paymentIntents: { retrieve(id: string): Promise<any> };
    refunds: { list(params: { payment_intent: string; limit: number }): Promise<{ data: any[] }> };
}

// Stripe-Event → neutrales PaymentEvent fuer das Modul aus metadata.kind.
// null: kein Modul-Event (z. B. Abo) — dann laeuft der bisherige Abo-Zweig.
export async function toPaymentEvent(stripe: StripeLookups, event: { type: string; data: { object: any } }): Promise<{ kind: string; event: PaymentEvent } | null> {
    const obj = event.data.object;
    const piId = (v: unknown): string | null => (typeof v === 'string' ? v : (v as { id?: string } | null)?.id ?? null);
    const fromIntent = async (id: string | null) => (id ? (await stripe.paymentIntents.retrieve(id)).metadata ?? {} : {});
    let metadata: Record<string, string>;
    let out: PaymentEvent;

    switch (event.type) {
        // Reservierung steht (manual capture): Risiko + Rechnungsdaten aus der Charge
        case 'payment_intent.amount_capturable_updated': {
            metadata = obj.metadata ?? {};
            if (!metadata.kind) return null;
            const chargeId = piId(obj.latest_charge);
            const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
            const b = charge?.billing_details ?? {};
            const a = b.address ?? {};
            const address = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country]
                .filter((x: string | null | undefined) => x && String(x).trim()).join('\n');
            out = {
                type: 'authorized', paymentIntentId: obj.id, metadata, amountCents: obj.amount_capturable ?? obj.amount,
                risk: { level: charge?.outcome?.risk_level ?? null, score: charge?.outcome?.risk_score ?? null },
                card: { fingerprint: charge?.payment_method_details?.card?.fingerprint ?? null, country: charge?.payment_method_details?.card?.country ?? null },
                billing: { name: b.name ?? null, email: b.email ?? null, address: address || null },
            };
            break;
        }
        case 'payment_intent.canceled':
            metadata = obj.metadata ?? {};
            out = { type: 'canceled', paymentIntentId: obj.id, metadata };
            break;
        case 'checkout.session.expired':
            metadata = obj.metadata ?? {};
            out = { type: 'checkout_expired', paymentIntentId: piId(obj.payment_intent), metadata };
            break;
        // Charges tragen die Metadaten des PaymentIntent nicht sicher — daher nachschlagen
        case 'charge.refunded': {
            const pi = piId(obj.payment_intent);
            metadata = await fromIntent(pi);
            if (!metadata.kind || !pi) return null;
            const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 100 });
            out = {
                type: 'refunded', paymentIntentId: pi, metadata,
                refunds: refunds.data.filter((r) => r.status === 'succeeded' || r.status === 'pending').map((r) => ({ id: r.id, amountCents: r.amount })),
            };
            break;
        }
        case 'charge.dispute.created':
        case 'charge.dispute.closed': {
            const pi = piId(obj.payment_intent);
            metadata = await fromIntent(pi);
            out = event.type === 'charge.dispute.created'
                ? { type: 'dispute_opened', paymentIntentId: pi, metadata, disputeId: obj.id, amountCents: obj.amount, reason: obj.reason ?? 'unknown' }
                : { type: 'dispute_closed', paymentIntentId: pi, metadata, disputeId: obj.id, status: obj.status ?? 'unknown' };
            break;
        }
        default:
            return null;
    }
    return metadata.kind ? { kind: metadata.kind, event: out } : null;
}
