import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { redisOr } from './redis-fail-open';

const PASS: ThrottlerStorageRecord = { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };

// Throttler-Zaehler in Redis, aber ohne Redis kein Totalausfall: scheitert der Zaehler, geht der Request durch.
// Ein fehlendes Rate-Limit fuer ein paar Sekunden ist billiger als eine API, die fuer jeden Request haengt.
export class FailOpenThrottlerStorage implements ThrottlerStorage {
    private readonly logger = new Logger('Throttler');
    private lastWarn = 0;

    constructor(private readonly inner: ThrottlerStorage) { }

    async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
        const record = await redisOr(() => this.inner.increment(key, ttl, limit, blockDuration, throttlerName), null);
        if (record) return record;
        if (Date.now() - this.lastWarn > 10_000) {
            this.lastWarn = Date.now();
            this.logger.warn('Rate-Limit-Speicher nicht erreichbar, Requests laufen ohne Limit');
        }
        return PASS;
    }
}
