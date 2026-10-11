import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RISK_DEFAULTS, type RiskFacts, type RiskThresholds } from './shop-risk';

// Sammelt die Fakten fuer die Risiko-Regeln (shop-risk.ts) und liest die Schwellen
@Injectable()
export class ShopRiskService {
    constructor(private readonly settings: SystemSettingsService) { }

    async thresholds(): Promise<RiskThresholds> {
        const keys = Object.keys(RISK_DEFAULTS) as (keyof RiskThresholds)[];
        const values = await Promise.all(keys.map((k) => this.settings.getNumber(k, RISK_DEFAULTS[k])));
        return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as RiskThresholds;
    }

    // Nach dem Setzen auf 'authorized' aufrufen — die Bestellung zaehlt dann in der letzten Stunde mit
    async facts(m: EntityManager, o: { id: string; user_id: string | null; total_cents: number },
        e: { fingerprint: string | null; radarLevel: string | null }): Promise<RiskFacts> {
        const [r] = await m.query(
            `SELECT
                (SELECT count(*) FROM shop_orders WHERE user_id = $1 AND id <> $2
                    AND status IN ('approved', 'fulfilled', 'partially_refunded', 'refunded'))::int AS prior_completed,
                (SELECT count(*) FROM shop_orders WHERE user_id = $1 AND created_at > now() - interval '1 hour'
                    AND status NOT IN ('pending', 'cancelled'))::int AS last_hour,
                (SELECT count(DISTINCT user_id) FROM shop_orders WHERE $3::text IS NOT NULL AND card_fingerprint = $3
                    AND user_id IS DISTINCT FROM $1 AND created_at > now() - interval '30 days')::int AS other_accounts,
                (SELECT count(*) FROM shop_cases WHERE against_user_id = $1 AND kind IN ('dispute', 'report', 'not_met'))::int AS disputes`,
            [o.user_id, o.id, e.fingerprint],
        );
        return {
            totalCents: o.total_cents, priorCompleted: r.prior_completed, ordersLastHour: r.last_hour,
            otherAccountsOnCard: r.other_accounts, priorDisputesOrReports: r.disputes, radarLevel: e.radarLevel,
        };
    }
}
