import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UserCoinBalance } from './entities/user-coin-balance.entity';
import { CoinTransaction } from './entities/coin-transaction.entity';

const STARTING_COINS = 100;

const COIN_PACKAGES = {
    sardine:   { coins: 100,   price: 99,   name: '🐟 Sardine — 100 Coins' },
    thunfisch: { coins: 500,   price: 399,  name: '🐟 Thunfisch — 500 Coins' },
    hai:       { coins: 2000,  price: 1299, name: '🦈 Hai — 2.000 Coins' },
    moby_dick: { coins: 10000, price: 4999, name: '🐋 Moby Dick — 10.000 Coins' },
} as const;
type CoinPackage = keyof typeof COIN_PACKAGES;

@Injectable()
export class CoinService {
    constructor(
        @InjectRepository(UserCoinBalance)
        private readonly balanceRepo: Repository<UserCoinBalance>,
        @InjectRepository(CoinTransaction)
        private readonly txRepo: Repository<CoinTransaction>,
        private readonly configService: ConfigService,
        private readonly dataSource: DataSource,
    ) { }

    private stripeClient: InstanceType<typeof Stripe> | null = null;
    private getStripe(): InstanceType<typeof Stripe> {
        if (!this.stripeClient) {
            this.stripeClient = new Stripe(
                this.configService.get<string>('STRIPE_SECRET_KEY')!,
                { apiVersion: '2026-04-22.dahlia' },
            );
        }
        return this.stripeClient;
    }

    // Mit manager laeuft alles in dessen Transaktion (eine Verbindung, gemeinsames Commit/Rollback),
    // sonst in einer eigenen. Eine eigene Transaktion innerhalb einer fremden haelt zwei Pool-Verbindungen
    // gleichzeitig und ist nicht atomar mit ihr (Loadtest-Audit B8).
    private inTransaction<T>(manager: EntityManager | undefined, fn: (m: EntityManager) => Promise<T>): Promise<T> {
        return manager ? fn(manager) : this.dataSource.transaction(fn);
    }

    // Legt beim ersten Zugriff das Konto mit Startguthaben an. Parallele erste Requests desselben Users
    // (zwei Tabs, Loadtest) duerfen sich nicht in die Quere kommen: ON CONFLICT DO NOTHING statt
    // Lesen-dann-Anlegen, und den Startbonus bucht nur der Request, dessen INSERT die Zeile angelegt hat.
    async ensureBalance(userId: string, outer?: EntityManager): Promise<void> {
        const existing = await (outer ?? this.dataSource.manager).findOne(UserCoinBalance, { where: { user_id: userId } });
        if (existing) return;
        await this.inTransaction(outer, async (manager) => {
            const inserted: unknown[] = await manager.query(
                `INSERT INTO user_coin_balance (user_id, balance)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id) DO NOTHING
                 RETURNING user_id`,
                [userId, STARTING_COINS]
            );
            if (inserted.length === 0) return;
            await manager.save(
                manager.create(CoinTransaction, {
                    user_id: userId, amount: STARTING_COINS,
                    type: 'starting_bonus', beef_id: null,
                })
            );
        });
    }

    async getBalance(userId: string): Promise<number> {
        await this.ensureBalance(userId);
        const row = await this.balanceRepo.findOne({ where: { user_id: userId } });
        return row?.balance ?? 0;
    }

    async addCoins(userId: string, amount: number, type: string, beefId?: string, idempotencyKey?: string, outer?: EntityManager): Promise<void> {
        await this.ensureBalance(userId, outer);
        await this.inTransaction(outer, async (manager) => {
            if (idempotencyKey) {
                const existing = await manager.findOne(CoinTransaction, { where: { idempotency_key: idempotencyKey } });
                if (existing) return;
            }
            await manager.query(
                `INSERT INTO user_coin_balance (user_id, balance)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id) DO UPDATE
                 SET balance = user_coin_balance.balance + $2`,
                [userId, amount]
            );
            await manager.save(
                manager.create(CoinTransaction, { user_id: userId, amount, type, beef_id: beefId ?? null, idempotency_key: idempotencyKey ?? null })
            );
        });
    }

    async spendCoins(userId: string, amount: number, type: string, beefId?: string, idempotencyKey?: string, outer?: EntityManager): Promise<void> {
        await this.ensureBalance(userId, outer);
        await this.inTransaction(outer, async (manager) => {
            if (idempotencyKey) {
                const existing = await manager.findOne(CoinTransaction, { where: { idempotency_key: idempotencyKey } });
                if (existing) return;
            }
            const rows = await manager.query<{ balance: number }[]>(
                `SELECT balance FROM user_coin_balance WHERE user_id = $1 FOR UPDATE`,
                [userId]
            );
            const current: number = rows[0]?.balance ?? 0;
            if (current < amount) throw new BadRequestException('Nicht genug Coins');
            await manager.query(
                `UPDATE user_coin_balance SET balance = balance - $1 WHERE user_id = $2`,
                [amount, userId]
            );
            await manager.save(
                manager.create(CoinTransaction, { user_id: userId, amount: -amount, type, beef_id: beefId ?? null, idempotency_key: idempotencyKey ?? null })
            );
        });
    }

    async createCoinCheckout(userId: string, pkg: CoinPackage): Promise<{ url: string }> {
        const pack = COIN_PACKAGES[pkg];
        if (!pack) throw new BadRequestException('Unbekanntes Paket');
        const stripe = this.getStripe();
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    unit_amount: pack.price,
                    product_data: { name: pack.name },
                },
                quantity: 1,
            }],
            success_url: `${this.configService.get('STRIPE_RETURN_URL')?.replace('/settings', '')}/beef?coin_success=${pkg}&session_id={CHECKOUT_SESSION_ID}&uid=${userId}`,
            cancel_url: `${this.configService.get('STRIPE_RETURN_URL')?.replace('/settings', '')}/beef`,
            metadata: { userId, package: pkg, coins: String(pack.coins) },
        });
        return { url: session.url! };
    }

    async confirmCoinPurchase(sessionId: string, userId: string): Promise<{ coins: number }> {
        const stripe = this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid')
            throw new BadRequestException('Zahlung nicht abgeschlossen');
        if (session.metadata?.userId !== userId)
            throw new ForbiddenException();

        // Idempotency: abort if already credited
        const alreadyDone = await this.txRepo.findOne({
            where: { idempotency_key: sessionId },
        });
        if (alreadyDone) return { coins: 0 };

        const coins = parseInt(session.metadata?.coins ?? '0');
        if (coins <= 0) throw new BadRequestException();

        await this.dataSource.transaction(async (manager) => {
            await manager.query(
                `INSERT INTO user_coin_balance (user_id, balance) VALUES ($1, $2)
                 ON CONFLICT (user_id) DO UPDATE SET balance = user_coin_balance.balance + $2`,
                [userId, coins]
            );
            await manager.save(manager.create(CoinTransaction, {
                user_id: userId,
                amount: coins,
                type: 'purchase' as any,
                idempotency_key: sessionId,
            }));
        });
        return { coins };
    }

    // Nur erreichbar wenn CoinTestPurchaseController gemountet ist (LOADTEST_MODE=true,
    // siehe CoinModule). Ruft denselben Schreibpfad wie confirmCoinPurchase auf
    // (addCoins -> Upsert user_coin_balance + Insert coin_transactions), ohne Stripe.
    async testPurchase(userId: string, pkg?: CoinPackage): Promise<{ coins: number; package: CoinPackage; idempotency_key: string }> {
        const packageKeys = Object.keys(COIN_PACKAGES) as CoinPackage[];
        const selected = pkg && COIN_PACKAGES[pkg] ? pkg : packageKeys[Math.floor(Math.random() * packageKeys.length)];
        const coins = COIN_PACKAGES[selected].coins;
        const idempotencyKey = `loadtest_${crypto.randomUUID()}`;

        await this.addCoins(userId, coins, 'purchase', undefined, idempotencyKey);

        return { coins, package: selected, idempotency_key: idempotencyKey };
    }
}
