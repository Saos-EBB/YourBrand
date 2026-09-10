import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

const DIRTY_SET_KEY = 'last_active:dirty';
const TS_KEY_PREFIX = 'last_active:ts:';

/**
 * Batches profiles.last_active_at writes. The JWT guards call touch() on
 * every authenticated request — a Redis write instead of a Postgres UPDATE
 * per request, which used to run unbatched on the hot path of ~27 files.
 * flush() bulk-applies the pending values once a minute.
 */
@Injectable()
export class LastActiveService {
    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) { }

    async touch(userId: string): Promise<void> {
        await this.redis.set(`${TS_KEY_PREFIX}${userId}`, Date.now().toString());
        await this.redis.sadd(DIRTY_SET_KEY, userId);
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async flush(): Promise<void> {
        const userIds = await this.redis.smembers(DIRTY_SET_KEY);
        if (userIds.length === 0) return;

        const timestamps = await Promise.all(
            userIds.map((id) => this.redis.get(`${TS_KEY_PREFIX}${id}`)),
        );

        const ids: string[] = [];
        const dates: Date[] = [];
        userIds.forEach((id, i) => {
            const ts = timestamps[i];
            if (ts) {
                ids.push(id);
                dates.push(new Date(parseInt(ts, 10)));
            }
        });
        if (ids.length === 0) return;

        await this.dataSource.query(
            `UPDATE profiles p SET last_active_at = v.ts
             FROM (SELECT unnest($1::uuid[]) AS user_id, unnest($2::timestamptz[]) AS ts) v
             WHERE p.user_id = v.user_id`,
            [ids, dates],
        );

        // Only clear what we just flushed — a touch() landing between the
        // smembers read and here just gets picked up on the next flush.
        await this.redis.srem(DIRTY_SET_KEY, ...userIds);
    }
}
