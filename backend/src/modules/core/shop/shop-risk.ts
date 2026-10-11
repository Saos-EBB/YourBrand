// Risiko-Regeln ohne DB: Fakten rein, Gruende fuers Anhalten raus. Leer = das System nimmt an.
// Schwellen sind Systemeinstellungen (SystemSettingsService), hier nur die Standardwerte.

export const RISK_DEFAULTS = {
    shop_hold_amount_cents: 15000,
    shop_hold_new_buyer_cents: 5000,
    shop_hold_orders_per_hour: 3,
    shop_hold_card_accounts: 2,
    shop_decide_minutes_food: 30,
    shop_decide_minutes_other: 1440,
} as const;
export type RiskThresholds = { [K in keyof typeof RISK_DEFAULTS]: number };

export interface RiskFacts {
    totalCents: number;
    // abgeschlossene Bestellungen vorher (angenommen, ausgeliefert, erstattet)
    priorCompleted: number;
    // Bestellungen der letzten Stunde, diese mitgezaehlt
    ordersLastHour: number;
    // andere Konten mit derselben Karte in 30 Tagen
    otherAccountsOnCard: number;
    // Rueckbuchungen und Meldungen gegen den Kaeufer
    priorDisputesOrReports: number;
    radarLevel: string | null;
}

export type HoldReason = 'amount_high' | 'new_buyer' | 'velocity' | 'card_reuse' | 'previous_dispute' | 'radar_elevated' | 'radar_highest';

export function holdReasons(f: RiskFacts, t: RiskThresholds): HoldReason[] {
    const reasons: HoldReason[] = [];
    if (f.totalCents >= t.shop_hold_amount_cents) reasons.push('amount_high');
    if (f.priorCompleted === 0 && f.totalCents >= t.shop_hold_new_buyer_cents) reasons.push('new_buyer');
    if (f.ordersLastHour >= t.shop_hold_orders_per_hour) reasons.push('velocity');
    if (f.otherAccountsOnCard >= t.shop_hold_card_accounts) reasons.push('card_reuse');
    if (f.priorDisputesOrReports > 0) reasons.push('previous_dispute');
    if (f.radarLevel === 'elevated') reasons.push('radar_elevated');
    if (f.radarLevel === 'highest') reasons.push('radar_highest');
    return reasons;
}

// Essen wird kalt: kurze Frist; Versand/digital haben Zeit
export function decideMinutes(deliveryMode: string, t: RiskThresholds): number {
    return deliveryMode === 'pickup' || deliveryMode === 'delivery' ? t.shop_decide_minutes_food : t.shop_decide_minutes_other;
}
