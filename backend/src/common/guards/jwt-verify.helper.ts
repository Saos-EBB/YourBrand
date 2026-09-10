import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { Request } from 'express';

const USER_EXISTS_TTL_SECONDS = 15 * 60;

export function extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.split(' ')[1];
}

/**
 * Cached against Redis with a 15 min TTL instead of a SELECT EXISTS on every
 * authenticated request — this sits on the hot path of ~27 files. Accepted
 * tradeoff: a banned/deleted user can stay "valid" for up to 15 minutes.
 */
export async function userExistsCached(
    userId: string,
    redis: Redis,
    dataSource: DataSource,
): Promise<boolean> {
    const cacheKey = `user:exists:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    const [{ exists }] = await dataSource.query(
        'SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL) AS exists',
        [userId],
    );
    await redis.set(cacheKey, exists ? '1' : '0', 'EX', USER_EXISTS_TTL_SECONDS);
    return exists;
}
