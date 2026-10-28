import Redis from 'ioredis';
import { redisOr } from '../../../common/redis/redis-fail-open';

// Das Deck bewertet alle Kandidaten im Radius und sortiert sie; die Kosten wachsen mit der Nutzerzahl. Darum wird die
// Rangliste (DECK_POOL Plaetze) einmal berechnet und DECK_CACHE_S je Nutzer in Redis gehalten; jeder Deck-Aufruf
// prueft daraus nur noch die naechsten Plaetze nach (geswiped, unveroeffentlicht, gesperrt). Neue Profile erscheinen
// spaetestens nach Ablauf; Aenderungen am eigenen Profil, an den Interessen und das Zuruecksetzen der Swipes
// verwerfen den Eintrag sofort.
export const DECK_POOL = 60;
export const DECK_CACHE_S = 300;

export const deckKey = (userId: string) => `deck:${userId}`;

export function dropDeck(redis: Redis | undefined, userId: string): Promise<unknown> {
    if (!redis) return Promise.resolve();
    return redisOr(() => redis.del(deckKey(userId)), 0);
}
