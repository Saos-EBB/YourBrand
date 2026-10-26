import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { Request } from 'express';
import { redisOr } from '../redis/redis-fail-open';
import { bannedKey } from '../redis/ban-list.service';

const USER_EXISTS_TTL_SECONDS = 15 * 60;

export function extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.split(' ')[1];
}

/**
 * Cached against Redis with a 15 min TTL instead of a SELECT EXISTS on every
 * authenticated request — this sits on the hot path of ~27 files. Accepted
 * tradeoff: a deleted user can stay "valid" for up to 15 minutes. Banned users
 * are caught immediately via the ban list (BanListService), read in the same
 * round trip.
 */
export async function userStatusCached(
    userId: string,
    redis: Redis,
    dataSource: DataSource,
): Promise<'ok' | 'missing' | 'banned'> {
    const cacheKey = `user:exists:${userId}`;
    // Redis ist hier nur Cache: faellt es aus, entscheidet die DB-Abfrage (fail-open, ohne Sperrliste).
    const [cached, banned] = await redisOr(() => redis.mget(cacheKey, bannedKey(userId)), [null, null]);
    if (banned !== null) return 'banned';
    if (cached !== null) return cached === '1' ? 'ok' : 'missing';

    const [{ exists }] = await dataSource.query(
        'SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL) AS exists',
        [userId],
    );
    await redisOr(() => redis.set(cacheKey, exists ? '1' : '0', 'EX', USER_EXISTS_TTL_SECONDS), null);
    return exists ? 'ok' : 'missing';
}
