import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModuleBroker } from '../../shared/broker/module-broker';

// Shop-Codes wie "premium:30" schalten ueber die Vermittlung Premium frei:
// amount = Tage. Mehrere Codes stapeln sich — der neue Zeitraum beginnt, wo
// das letzte befristete Premium endet. Unbefristetes Premium (lifetime,
// laufendes Abo) bleibt unberuehrt, der Code laeuft dann daneben.
@Injectable()
export class PremiumUnlockProvider implements OnModuleInit {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly broker: ModuleBroker,
    ) { }

    onModuleInit() {
        this.broker.provideUnlock('premium', (input) => this.grant(input));
    }

    async grant({ userId, amount, idempotencyKey }: { userId: string; amount: number; idempotencyKey: string }): Promise<void> {
        if (!Number.isInteger(amount) || amount < 1) throw new Error(`Ungueltige Premium-Dauer: ${amount}`);
        await this.dataSource.transaction(async (tx) => {
            // Zwei Codes desselben Users gleichzeitig: nacheinander, sonst ueberlappen die Zeitraeume
            await tx.query(`SELECT pg_advisory_xact_lock(hashtext('premium-' || $1))`, [userId]);
            const [done] = await tx.query(`SELECT 1 FROM subscriptions WHERE provider_subscription_id = $1`, [idempotencyKey]);
            if (done) return;
            await tx.query(
                `INSERT INTO subscriptions (user_id, plan, status, payment_provider, provider_subscription_id, started_at, expires_at)
                 SELECT $1, 'code', 'active', 'shop', $2, s.start, s.start + make_interval(days => $3)
                   FROM (SELECT GREATEST(now(), COALESCE(MAX(expires_at), now())) AS start
                           FROM subscriptions
                          WHERE user_id = $1 AND status = 'active' AND expires_at > now()) s`,
                [userId, idempotencyKey, amount],
            );
        });
    }
}
