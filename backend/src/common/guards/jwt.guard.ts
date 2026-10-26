import { Injectable, ExecutionContext, ForbiddenException, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { extractToken, userStatusCached } from './jwt-verify.helper';
import { LastActiveService } from '../last-active/last-active.service';

@Injectable()
export class JwtGuard {
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

        if (!token) throw new UnauthorizedException('Kein Token vorhanden');

        let payload: any;
        try {
            payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET,
            });
        } catch {
            throw new UnauthorizedException('Token ungültig oder abgelaufen');
        }

        const status = await userStatusCached(payload.sub, this.redis, this.dataSource);
        if (status === 'missing') throw new UnauthorizedException('User nicht gefunden');
        if (status === 'banned') throw new ForbiddenException('Ihr Account ist gesperrt');

        request['user'] = payload;

        this.lastActive.touch(payload.sub).catch(() => {});

        return true;
    }
}
