import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { loadtestEnabled, loadtestTokenTtlSeconds } from '../loadtest/loadtest-key';

export const bannedKey = (userId: string) => `user:banned:${userId}`;

/**
 * Sperrliste fuer schon ausgegebene Access-Tokens (Audit B13). Login und Refresh pruefen den Bann in der DB, ein vorher
 * ausgegebenes Token lief aber bis zu seinem Ablauf weiter. Der Eintrag lebt so lange wie das laengste Token, das vor
 * dem Bann ausgegeben sein kann (bei einem kuerzeren Zeit-Bann bis zu dessen Ende); die JWT-Guards lesen ihn mit dem
 * Existenz-Cache in einem Roundtrip. Redis weg: der Bann wirkt erst mit dem Token-Ablauf (wie vorher).
 */
@Injectable()
export class BanListService {
    private readonly logger = new Logger('BanList');

    constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) { }

    async ban(userId: string, until: Date | string | null): Promise<void> {
        const tokenMaxS = loadtestEnabled() ? Math.max(15 * 60, loadtestTokenTtlSeconds()) : 15 * 60;
        const untilS = until ? Math.ceil((new Date(until).getTime() - Date.now()) / 1000) : tokenMaxS;
        const ttl = Math.min(tokenMaxS, untilS);
        if (ttl <= 0) return;
        await this.redis.set(bannedKey(userId), '1', 'EX', ttl)
            .catch((err) => this.logger.warn(`${userId}: Sperrliste nicht geschrieben (${(err as Error).message})`));
    }

    async unban(userId: string): Promise<void> {
        await this.redis.del(bannedKey(userId))
            .catch((err) => this.logger.warn(`${userId}: Sperrliste nicht geloescht (${(err as Error).message})`));
    }
}
