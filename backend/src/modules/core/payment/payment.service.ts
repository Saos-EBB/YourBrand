import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';
import { Subscription } from './entities/subscription.entity';
import { PaymentLog } from './entities/payment-log.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { StripeService } from './stripe.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { toPaymentEvent } from './payment-events';
import { CronLockService } from '../../../common/redis/cron-lock.service';

const PRICE_IDS: Record<string, string> = {
    monthly: 'price_1TRsRsCOHQFsQZnIt9XUXTFZ',
    yearly: 'price_1TRsTFCOHQFsQZnI8DiA91Y4',
    lifetime: 'price_1TRsTfCOHQFsQZnIqxccF4AY',
};

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        @InjectRepository(PaymentLog)
        private readonly paymentLogRepository: Repository<PaymentLog>,
        private readonly stripeService: StripeService,
        private readonly notificationsService: NotificationsService,
        private readonly broker: ModuleBroker,
        private readonly cronLock: CronLockService,
    ) { }

    async getActiveSubscription(userId: string) {
        return this.subscriptionRepository.findOne({
            where: { user_id: userId, status: 'active' },
        });
    }

    async createSubscription(userId: string, dto: CreateSubscriptionDto) {
        const session = await this.stripeService.stripe.checkout.sessions.create({
            mode: dto.plan === 'lifetime' ? 'payment' : 'subscription',
            ui_mode: 'embedded_page' as any,
            line_items: [{ price: PRICE_IDS[dto.plan], quantity: 1 }],
            metadata: { userId, plan: dto.plan },
            return_url: process.env.STRIPE_RETURN_URL ?? 'http://localhost:3001/settings',
        });

        return { clientSecret: session.client_secret };
    }

    async cancelSubscription(userId: string, subscriptionId: string) {
        const subscription = await this.subscriptionRepository.findOne({
            where: { id: subscriptionId },
        });

        if (!subscription) throw new NotFoundException('Abonnement nicht gefunden');
        if (subscription.user_id !== userId) throw new ForbiddenException('Keine Berechtigung');

        subscription.status = 'cancelled';
        subscription.cancelled_at = new Date();

        const saved = await this.subscriptionRepository.save(subscription);

        if (subscription.provider_subscription_id) {
            try {
                await this.stripeService.stripe.subscriptions.cancel(
                    subscription.provider_subscription_id,
                );
            } catch (err: any) {
                console.error(
                    `[PaymentService] Stripe cancel failed for sub ${subscription.provider_subscription_id}:`,
                    err?.message,
                );
            }
        }

        return saved;
    }

    async getPaymentLogs(userId: string) {
        return this.paymentLogRepository.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    async handleWebhook(sig: string, rawBody: Buffer) {
        let event: any;

        try {
            if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET env var is not set');
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
            event = this.stripeService.stripe.webhooks.constructEvent(
                rawBody,
                sig,
                webhookSecret,
            );
        } catch (err: any) {
            throw new BadRequestException(`Webhook-Fehler: ${err.message}`);
        }

        // Zahlungen anderer Module (metadata.kind, z. B. Shop) gehen neutral ueber den Broker.
        // Wirft der Empfaenger, antwortet der Webhook mit Fehler und Stripe stellt erneut zu.
        const forModule = await toPaymentEvent(this.stripeService.stripe as any, event);
        if (forModule) {
            const handled = await this.broker.dispatchPaymentEvent(forModule.kind, forModule.event);
            return { received: true, ...(handled ? {} : { ignored: forModule.kind }) };
        }

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as any;
                const userId = session.metadata?.userId;
                const plan = session.metadata?.plan;

                if (!userId || !plan) break;

                const subscription = this.subscriptionRepository.create({
                    user_id: userId,
                    plan,
                    status: 'active',
                    payment_provider: 'stripe',
                    provider_subscription_id: (session.subscription as string) ?? null,
                    started_at: new Date(),
                });
                const savedSub = await this.subscriptionRepository.save(subscription);

                const paymentLog = this.paymentLogRepository.create({
                    user_id: userId,
                    subscription_id: savedSub.id,
                    amount: (session.amount_total ?? 0) / 100,
                    currency: (session.currency ?? 'eur').toUpperCase(),
                    status: 'success',
                    provider_tx_id: (session.payment_intent as string) ?? (session.subscription as string) ?? 'unknown',
                });
                await this.paymentLogRepository.save(paymentLog);

                await this.notificationsService.createNotification(userId, 'system', 'notifications.payment_success', undefined, undefined, {});
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as any;
                const customerId = invoice.customer as string;

                const sub = await this.subscriptionRepository.findOne({
                    where: { provider_subscription_id: invoice.subscription as string },
                });
                if (sub) {
                    await this.notificationsService.createNotification(sub.user_id, 'system', 'notifications.payment_failed', undefined, undefined, {});
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const stripeSub = event.data.object as any;

                await this.subscriptionRepository.update(
                    { provider_subscription_id: stripeSub.id },
                    { status: 'cancelled', cancelled_at: new Date() },
                );
                break;
            }
        }

        return { received: true };
    }

    @Cron('0 8 * * *')
    async handleSubscriptionExpiryCheck(): Promise<void> {
        await this.cronLock.runOnce('payment:subscription-expiry', 60 * 60_000, async () => {
            const now = new Date();
            const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

            const expiringSoon = await this.subscriptionRepository.find({
                where: { status: 'active', expires_at: Between(now, in3Days) },
            });

            for (const sub of expiringSoon) {
                await this.notificationsService.createNotification(sub.user_id, 'system', 'notifications.subscription_expiring', undefined, undefined, {});
            }

            const expired = await this.subscriptionRepository.find({
                where: { status: 'active', expires_at: LessThan(now) },
            });

            for (const sub of expired) {
                sub.status = 'expired';
                await this.subscriptionRepository.save(sub);
                await this.notificationsService.createNotification(sub.user_id, 'system', 'notifications.subscription_expired', undefined, undefined, {});
            }
        });
    }
}
