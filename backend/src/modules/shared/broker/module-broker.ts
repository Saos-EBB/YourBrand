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
}
