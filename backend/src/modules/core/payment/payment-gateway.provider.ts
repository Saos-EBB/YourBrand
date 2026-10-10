import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleBroker, type PaymentGateway, type ReservedCheckoutInput } from '../../shared/broker/module-broker';
import { StripeService } from './stripe.service';

// Bietet Zahlung mit Reservierung ueber die Vermittlung an — andere Module
// (Shop) kennen weder Stripe noch dieses Modul
@Injectable()
export class StripePaymentGateway implements PaymentGateway, OnModuleInit {
    constructor(
        private readonly stripeService: StripeService,
        private readonly broker: ModuleBroker,
    ) { }

    onModuleInit() {
        this.broker.providePayments(this);
    }

    async createReservedCheckout(input: ReservedCheckoutInput) {
        const session = await this.stripeService.stripe.checkout.sessions.create({
            mode: 'payment',
            ui_mode: 'embedded_page' as any,
            line_items: input.lines.map((l) => ({
                quantity: l.quantity,
                price_data: { currency: 'eur', unit_amount: l.unitAmountCents, product_data: { name: l.name } },
            })),
            // nur reservieren, abgebucht wird erst bei capture()
            payment_intent_data: { capture_method: 'manual', metadata: input.metadata },
            // Rechnungsadresse fuer die Rechnung (§ 14 UStG)
            billing_address_collection: 'required',
            metadata: input.metadata,
            return_url: input.returnUrl,
        });
        return { sessionId: session.id, clientSecret: session.client_secret as string };
    }

    async capture(paymentIntentId: string, idempotencyKey: string) {
        await this.stripeService.stripe.paymentIntents.capture(paymentIntentId, {}, { idempotencyKey });
    }

    async cancel(paymentIntentId: string, idempotencyKey: string) {
        await this.stripeService.stripe.paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey });
    }
}
