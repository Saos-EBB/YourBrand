import { RISK_DEFAULTS, decideMinutes, holdReasons, type RiskFacts } from './shop-risk';

const calm: RiskFacts = { totalCents: 2000, priorCompleted: 3, ordersLastHour: 1, otherAccountsOnCard: 0, priorDisputesOrReports: 0, radarLevel: 'normal' };

describe('holdReasons', () => {
    it('unauffaellig: nichts, das System nimmt an', () => {
        expect(holdReasons(calm, RISK_DEFAULTS)).toEqual([]);
    });

    it('jede Regel an ihrer Schwelle', () => {
        expect(holdReasons({ ...calm, totalCents: 14999 }, RISK_DEFAULTS)).toEqual([]);
        expect(holdReasons({ ...calm, totalCents: 15000 }, RISK_DEFAULTS)).toEqual(['amount_high']);
        expect(holdReasons({ ...calm, priorCompleted: 0, totalCents: 4999 }, RISK_DEFAULTS)).toEqual([]);
        expect(holdReasons({ ...calm, priorCompleted: 0, totalCents: 5000 }, RISK_DEFAULTS)).toEqual(['new_buyer']);
        expect(holdReasons({ ...calm, ordersLastHour: 3 }, RISK_DEFAULTS)).toEqual(['velocity']);
        expect(holdReasons({ ...calm, otherAccountsOnCard: 2 }, RISK_DEFAULTS)).toEqual(['card_reuse']);
        expect(holdReasons({ ...calm, priorDisputesOrReports: 1 }, RISK_DEFAULTS)).toEqual(['previous_dispute']);
        expect(holdReasons({ ...calm, radarLevel: 'elevated' }, RISK_DEFAULTS)).toEqual(['radar_elevated']);
        expect(holdReasons({ ...calm, radarLevel: 'highest' }, RISK_DEFAULTS)).toEqual(['radar_highest']);
        expect(holdReasons({ ...calm, radarLevel: null }, RISK_DEFAULTS)).toEqual([]);
    });

    it('mehrere Gruende zugleich; Schwellen kommen aus den Einstellungen', () => {
        expect(holdReasons({ ...calm, totalCents: 20000, priorCompleted: 0, radarLevel: 'highest' }, RISK_DEFAULTS))
            .toEqual(['amount_high', 'new_buyer', 'radar_highest']);
        expect(holdReasons(calm, { ...RISK_DEFAULTS, shop_hold_amount_cents: 1000 })).toEqual(['amount_high']);
    });

    it('Frist: Essen kurz, sonst lang', () => {
        expect(decideMinutes('delivery', RISK_DEFAULTS)).toBe(30);
        expect(decideMinutes('pickup', RISK_DEFAULTS)).toBe(30);
        expect(decideMinutes('shipping', RISK_DEFAULTS)).toBe(1440);
        expect(decideMinutes('digital', RISK_DEFAULTS)).toBe(1440);
    });
});
