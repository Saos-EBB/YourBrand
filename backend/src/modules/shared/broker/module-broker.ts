import { Injectable } from '@nestjs/common';

// Vermittlung zwischen Feature-Modulen. Module, die pro Mandant an/aus sein
// koennen (payments, hidden, shop, …), importieren sich nie gegenseitig:
// der Anbieter meldet sich beim Start hier an (onModuleInit), der Nutzer fragt
// hier nach. Ist das Modul aus, ist niemand angemeldet — der Aufrufer bekommt
// ModuleUnavailableError statt eines Absturzes beim Start.

// Zahlung mit Reservierung (capture_method: manual), angeboten von "payments"
export interface ReservedCheckoutInput {
    lines: { name: string; unitAmountCents: number; quantity: number }[];
    metadata: Record<string, string>;
    returnUrl: string;
}

export interface PaymentGateway {
    createReservedCheckout(input: ReservedCheckoutInput): Promise<{ sessionId: string; clientSecret: string }>;
    capture(paymentIntentId: string, idempotencyKey: string): Promise<void>;
    cancel(paymentIntentId: string, idempotencyKey: string): Promise<void>;
    // Nach dem Abbuchen ganz oder teilweise zurueckzahlen
    refund(paymentIntentId: string, amountCents: number, idempotencyKey: string): Promise<{ refundId: string }>;
}

// Was bei der Zahlung passiert, ohne Stripe-Formate. "payments" uebersetzt die
// Webhooks und reicht sie an das Modul weiter, das sich fuer metadata.kind
// angemeldet hat (z. B. 'shop'). Betraege in Cent.
interface PaymentEventBase { paymentIntentId: string | null; metadata: Record<string, string> }
export type PaymentEvent =
    // Geld reserviert (capture_method manual), mit Risiko- und Rechnungsdaten
    | (PaymentEventBase & {
        type: 'authorized'; amountCents: number;
        risk: { level: string | null; score: number | null };
        card: { fingerprint: string | null; country: string | null };
        billing: { name: string | null; email: string | null; address: string | null };
    })
    // Reservierung aufgehoben (von uns oder von Stripe nach Ablauf)
    | (PaymentEventBase & { type: 'canceled' })
    // Kasse nie abgeschlossen
    | (PaymentEventBase & { type: 'checkout_expired' })
    // Alle Erstattungen der Zahlung (auch die eigenen — der Empfaenger erkennt sie an der ID)
    | (PaymentEventBase & { type: 'refunded'; refunds: { id: string; amountCents: number }[] })
    | (PaymentEventBase & { type: 'dispute_opened'; disputeId: string; amountCents: number; reason: string })
    | (PaymentEventBase & { type: 'dispute_closed'; disputeId: string; status: string });
// Wirft der Handler, antwortet der Webhook mit Fehler und Stripe stellt erneut zu
export type PaymentEventHandler = (event: PaymentEvent) => Promise<void>;

// Etwas in der App gutschreiben ("coins:500"). idempotencyKey: zweimal
// aufrufen schreibt nur einmal gut.
export type UnlockHandler = (input: { userId: string; amount: number; idempotencyKey: string }) => Promise<void>;

export class ModuleUnavailableError extends Error {
    constructor(readonly capability: string) {
        super(`Kein Modul bietet "${capability}" an`);
    }
}

@Injectable()
export class ModuleBroker {
    private paymentGateway: PaymentGateway | null = null;
    private readonly unlocks = new Map<string, UnlockHandler>();
    private readonly paymentEventHandlers = new Map<string, PaymentEventHandler>();

    providePayments(gateway: PaymentGateway): void {
        if (this.paymentGateway) throw new Error('payments ist schon angemeldet');
        this.paymentGateway = gateway;
    }

    payments(): PaymentGateway {
        if (!this.paymentGateway) throw new ModuleUnavailableError('payments');
        return this.paymentGateway;
    }

    provideUnlock(kind: string, handler: UnlockHandler): void {
        if (this.unlocks.has(kind)) throw new Error(`unlock "${kind}" ist schon angemeldet`);
        this.unlocks.set(kind, handler);
    }

    canUnlock(kind: string): boolean {
        return this.unlocks.has(kind);
    }

    async unlock(kind: string, input: { userId: string; amount: number; idempotencyKey: string }): Promise<void> {
        const handler = this.unlocks.get(kind);
        if (!handler) throw new ModuleUnavailableError(`unlock:${kind}`);
        await handler(input);
    }

    // kind = metadata.kind, mit dem das Modul seine Zahlungen anlegt
    handlePaymentEvents(kind: string, handler: PaymentEventHandler): void {
        if (this.paymentEventHandlers.has(kind)) throw new Error(`Zahlungs-Events "${kind}" sind schon angemeldet`);
        this.paymentEventHandlers.set(kind, handler);
    }

    // false: niemand angemeldet (Modul aus) — der Aufrufer behandelt das Event selbst oder ignoriert es
    async dispatchPaymentEvent(kind: string, event: PaymentEvent): Promise<boolean> {
        const handler = this.paymentEventHandlers.get(kind);
        if (!handler) return false;
        await handler(event);
        return true;
    }
}
