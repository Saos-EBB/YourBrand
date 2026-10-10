import { randomInt } from 'crypto';

// Fortschritt bei Essen und Versand (CHECK chk_shop_progress). Digitales ist
// mit der Annahme sofort ausgeliefert und hat keinen Fortschritt.
export const SHOP_PROGRESS = ['accepted', 'preparing', 'ready', 'on_the_way', 'shipped', 'delivered', 'not_met'] as const;
export type ShopProgress = (typeof SHOP_PROGRESS)[number];
export type PhysicalMode = 'pickup' | 'delivery' | 'shipping';

export const PROGRESS_FLOW: Record<PhysicalMode, ShopProgress[]> = {
    pickup: ['accepted', 'preparing', 'ready', 'delivered'],
    delivery: ['accepted', 'preparing', 'on_the_way', 'delivered'],
    shipping: ['accepted', 'shipped', 'delivered'],
};

// "Nicht angetroffen" erst, wenn das Essen fertig bzw. unterwegs ist
const NOT_MET_FROM: Partial<Record<PhysicalMode, ShopProgress>> = { pickup: 'ready', delivery: 'on_the_way' };

// Nur vorwaerts, Schritte ueberspringen ist erlaubt (Kueche meldet direkt "fertig")
export function progressError(mode: string, current: ShopProgress | null, next: ShopProgress): string | null {
    const flow = PROGRESS_FLOW[mode as PhysicalMode];
    if (!flow) return 'Digitale Bestellungen haben keinen Lieferfortschritt';
    if (current === 'delivered' || current === 'not_met') return 'Bestellung ist schon abgeschlossen';
    if (next === 'not_met') {
        const from = NOT_MET_FROM[mode as PhysicalMode];
        if (!from) return '„Nicht angetroffen“ gibt es nur bei Essen';
        return flow.indexOf(current ?? 'accepted') >= flow.indexOf(from) ? null : `„Nicht angetroffen“ erst ab „${from}“`;
    }
    const at = flow.indexOf(next);
    if (at < 0) return `„${next}“ passt nicht zu ${mode}`;
    return at > flow.indexOf(current ?? 'accepted') ? null : 'Nur vorwärts — dieser Schritt ist schon erledigt';
}

// Freischalt-Codes: ohne 0/O/1/I, 12 Zeichen = 60 Bit
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateUnlockCode(): string {
    const chars = Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
    return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}
