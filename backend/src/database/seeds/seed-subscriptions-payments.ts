/**
 * Subscription- + Payment-Log-Seed
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/seed-subscriptions-payments.ts
 *
 * ~35% der User (zufaellig, fester Anteil aus der geforderten 30-40%-Spanne)
 * bekommen eine subscriptions-Zeile (zufaelliger plan/payment_provider,
 * started_at in der Vergangenheit, expires_at danach — lifetime bleibt ohne
 * expires_at, wie von chk_sub_lifetime_no_expiry gefordert). Nur diese User
 * bekommen 1-3 payment_logs (Betrag anhand der echten subscription_price_*-
 * System-Settings, ueberwiegend status=success). payment_logs.subscription_id
 * ist NOT NULL — ohne Subscription also keine Payment-Logs.
 *
 * Idempotent: subscriptions.provider_subscription_id = "seed-sub-<user_id>"
 * markiert Seed-Zeilen. User mit vorhandener Seed-Subscription werden
 * uebersprungen. SEED_RESET=true loescht erst payment_logs (FK RESTRICT auf
 * subscriptions), dann die Seed-Subscriptions, und baut neu auf.
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { createRng, randomInt, randomChoice, weightedChoice, seedFromString, buildBulkInsert, chunk } from './seed-shared';

const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME     ?? '',
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    synchronize: false,
    logging: false,
    extra: { options: '-c client_encoding=UTF8' },
});

const SEED_RESET = (process.env.SEED_RESET ?? 'false').toLowerCase() === 'true';

const SUBSCRIPTION_SHARE = 0.35;
const PLANS = ['monthly', 'yearly', 'lifetime'] as const;
const PROVIDERS = ['paypal', 'sepa'] as const;
// Fallback, falls migrations/_archive/020_subscription_prices.sql (System-Settings-Daten,
// nicht Teil von migrations/001_baseline.sql) noch nicht eingespielt wurde.
const DEFAULT_PRICES: Record<string, number> = {
    monthly: 9.99,
    yearly: 49.99,
    lifetime: 149.99,
};
const PLAN_DAYS: Record<string, number> = { monthly: 30, yearly: 365, lifetime: 0 };
// Keeps each INSERT under Postgres's 65535-bound-parameter-per-statement
// limit — SEED_USERS=10000+ pushes subRows/paymentRows well past that if
// inserted in one statement.
const INSERT_BATCH_SIZE = 1000;

async function main() {
    await ds.initialize();
    console.log('seed-subscriptions-payments: verbunden mit DB', process.env.DB_NAME);

    if (SEED_RESET) {
        const [deletedPayments] = await ds.query(
            `DELETE FROM payment_logs WHERE provider_tx_id LIKE 'seed-pay-%' RETURNING id`,
        );
        const [deletedSubs] = await ds.query(
            `DELETE FROM subscriptions WHERE provider_subscription_id LIKE 'seed-sub-%' RETURNING id`,
        );
        console.log(`  RESET  ${deletedPayments.length} Seed-Payment-Logs, ${deletedSubs.length} Seed-Subscriptions geloescht`);
    }

    const prices = { ...DEFAULT_PRICES };
    const priceRows: { key: string; value: string }[] = await ds.query(
        `SELECT key, value FROM system_settings WHERE key IN
            ('subscription_price_monthly', 'subscription_price_yearly', 'subscription_price_lifetime')`,
    );
    for (const row of priceRows) {
        const plan = row.key.replace('subscription_price_', '');
        prices[plan] = parseFloat(row.value);
    }

    const allUsers: { id: string; nickname: string }[] = await ds.query(
        `SELECT u.id, p.nickname FROM users u JOIN profiles p ON p.user_id = u.id ORDER BY p.nickname`,
    );
    const alreadySeeded: { user_id: string }[] = await ds.query(
        `SELECT user_id FROM subscriptions WHERE provider_subscription_id LIKE 'seed-sub-%'`,
    );
    const seededUserIds = new Set(alreadySeeded.map(r => r.user_id));
    const candidateUsers = allUsers.filter(u => !seededUserIds.has(u.id));

    if (candidateUsers.length === 0) {
        console.log(`seed-subscriptions-payments: SKIP  alle ${allUsers.length} User haben bereits eine Seed-Subscription oder wurden ausgewuerfelt`);
        await ds.destroy();
        return;
    }

    const subRows: unknown[][] = [];
    const paymentRows: unknown[][] = [];
    let subscribedCount = 0;

    for (const user of candidateUsers) {
        const rng = createRng(seedFromString(`${user.nickname}:subscription`));
        if (rng() >= SUBSCRIPTION_SHARE) continue;
        subscribedCount++;

        const plan = randomChoice(rng, PLANS);
        const provider = randomChoice(rng, PROVIDERS);
        const daysSinceStart = randomInt(rng, 1, 730);
        const startedAt = new Date(Date.now() - daysSinceStart * 86400000);
        const expiresAt = PLAN_DAYS[plan] > 0
            ? new Date(startedAt.getTime() + PLAN_DAYS[plan] * 86400000)
            : null;

        const status = weightedChoice(rng, [['active', 70], ['expired', 20], ['cancelled', 10]] as const);
        const cancelledAt = status === 'cancelled'
            ? new Date(startedAt.getTime() + randomInt(rng, 1, Math.max(1, daysSinceStart - 1)) * 86400000)
            : null;

        const subId = crypto.randomUUID();
        subRows.push([
            subId, user.id, plan, status, provider, `seed-sub-${user.id}`,
            startedAt.toISOString(), expiresAt?.toISOString() ?? null, cancelledAt?.toISOString() ?? null,
        ]);

        const paymentCount = randomInt(rng, 1, 3);
        const basePrice = prices[plan];
        for (let i = 1; i <= paymentCount; i++) {
            const amount = Math.round(basePrice * 100) / 100;
            const taxAmount = Math.round(basePrice * 0.19 * 100) / 100;
            const payStatus = weightedChoice(rng, [['success', 80], ['failed', 12], ['refunded', 8]] as const);
            const paidAt = new Date(startedAt.getTime() + randomInt(rng, 0, Math.max(0, daysSinceStart)) * 86400000);

            paymentRows.push([
                user.id, subId, amount, taxAmount, 'EUR', payStatus, `seed-pay-${user.id}-${i}`, paidAt.toISOString(),
            ]);
        }
    }

    // subscriptions + payment_logs muessen atomar zusammen entstehen — sonst
    // hinterlaesst ein Fehler eine Subscription ohne Payment-Logs, und der
    // naechste Lauf uebersieht den User (provider_subscription_id existiert ja
    // schon).
    if (subRows.length > 0) {
        await ds.transaction(async manager => {
            for (const batch of chunk(subRows, INSERT_BATCH_SIZE)) {
                const subs = buildBulkInsert(batch);
                await manager.query(
                    `INSERT INTO subscriptions
                        (id, user_id, plan, status, payment_provider, provider_subscription_id,
                         started_at, expires_at, cancelled_at)
                     VALUES ${subs.placeholders}`,
                    subs.params,
                );
            }

            for (const batch of chunk(paymentRows, INSERT_BATCH_SIZE)) {
                const payments = buildBulkInsert(batch);
                await manager.query(
                    `INSERT INTO payment_logs
                        (user_id, subscription_id, amount, tax_amount, currency, status, provider_tx_id, created_at)
                     VALUES ${payments.placeholders}`,
                    payments.params,
                );
            }
        });
    }

    await ds.destroy();
    console.log(`seed-subscriptions-payments: ${subscribedCount}/${candidateUsers.length} User bekamen eine Subscription (${paymentRows.length} Payment-Logs).`);
}

main().catch(err => {
    console.error('seed-subscriptions-payments: Fehler:', err.message);
    process.exit(1);
});
