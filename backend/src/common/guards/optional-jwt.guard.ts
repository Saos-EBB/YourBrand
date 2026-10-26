import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { extractToken, userStatusCached } from './jwt-verify.helper';
import { LastActiveService } from '../last-active/last-active.service';

@Injectable()
export class OptionalJwtGuard {
    constructor(
        private readonly jwtService: JwtService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @Inject(REDIS_CLIENT)
        private readonly redis: Redis,
        private readonly lastActive: LastActiveService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const token = extractToken(request);

        if (!token) return true;

        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET,
            });

            const status = await userStatusCached(payload.sub, this.redis, this.dataSource);
            if (status !== 'ok') return true;

            request['user'] = payload;

            this.lastActive.touch(payload.sub).catch(() => {});
        } catch {
            // invalid or expired token, or user no longer exists or banned — leave req.user undefined
        }

        return true;
    }
}
