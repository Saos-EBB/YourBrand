import { Body, Controller, Get, Inject, Post, Req, ForbiddenException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import { SetupService } from './setup.service';
import { CreateOwnerDto } from './dto/create-owner.dto';

const SETUP_MAX_ATTEMPTS = 5;

@Controller('setup')
@SkipThrottle()
export class SetupController {
    constructor(
        private readonly setupService: SetupService,
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
    ) {}

    @Get('status')
    getStatus() {
        return this.setupService.getStatus();
    }

    @Post()
    async createOwner(@Body() dto: CreateOwnerDto, @Req() req: any) {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            ?? req.socket?.remoteAddress
            ?? 'unknown';

        // Permanent counter (no TTL) — same lifetime semantics as before, but now
        // shared across instances instead of reset on every process restart.
        const attempts = await this.redis.incr(`setup:attempts:${ip}`);
        if (attempts > SETUP_MAX_ATTEMPTS) {
            throw new ForbiddenException('Zu viele Setup-Versuche von dieser IP');
        }

        return this.setupService.createOwner(dto);
    }
}
