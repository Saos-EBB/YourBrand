import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import { SystemSetting } from './entities/system-setting.entity';

const CACHE_TTL_SECONDS = 60;
// Distinguishes "checked the DB, key doesn't exist" from "not cached yet" —
// without this, every call for a key that was never set (common for
// fallback-driven settings) hit Postgres on every single request.
const MISS_SENTINEL = '__MISS__';

@Injectable()
export class SystemSettingsService {
    constructor(
        @InjectRepository(SystemSetting)
        private readonly repo: Repository<SystemSetting>,
        @Inject(REDIS_CLIENT)
        private readonly redis: Redis,
    ) { }

    private async getCached(key: string): Promise<string | null> {
        const cached = await this.redis.get(`settings:${key}`);
        if (cached !== null) return cached === MISS_SENTINEL ? null : cached;

        const setting = await this.repo.findOne({ where: { key } });
        await this.redis.set(`settings:${key}`, setting ? setting.value : MISS_SENTINEL, 'EX', CACHE_TTL_SECONDS);
        return setting ? setting.value : null;
    }

    async getNumber(key: string, fallback: number): Promise<number> {
        const value = await this.getCached(key);
        if (value === null) return fallback;
        const n = parseInt(value, 10);
        return isNaN(n) ? fallback : n;
    }

    async getString(key: string, fallback: string): Promise<string> {
        const value = await this.getCached(key);
        return value ?? fallback;
    }

    async getAll(): Promise<SystemSetting[]> {
        return this.repo.find({ order: { key: 'ASC' } });
    }

    async set(key: string, value: string, adminId: string): Promise<SystemSetting> {
        let setting = await this.repo.findOne({ where: { key } });
        if (setting) {
            setting.value      = value;
            setting.updated_by = adminId;
            setting.updated_at = new Date();
        } else {
            setting = this.repo.create({ key, value, updated_by: adminId, updated_at: new Date() });
        }
        const saved = await this.repo.save(setting);
        // Shared Redis cache — every instance sees the fresh value on its
        // next read, not just this one (unlike the old per-process Map).
        await this.redis.del(`settings:${key}`);
        return saved;
    }
}
