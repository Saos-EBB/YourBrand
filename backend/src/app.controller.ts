import { Controller, Get, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import Redis from 'ioredis';
import { AppService } from './app.service';
import { REDIS_CLIENT } from './common/redis/redis.constants';

// 'ok' wenn op innerhalb von ms fertig ist, sonst 'down'.
function check(op: () => Promise<unknown>, ms: number): Promise<'ok' | 'down'> {
  return Promise.race([
    op().then(() => 'ok' as const, () => 'down' as const),
    new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), ms)),
  ]);
}

// Haengt unter GET /api/v1 (globaler Prefix aus main.ts) — Status-Route fuer
// Healthchecks.
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // Ohne das zaehlt jeder Healthcheck gegen das globale Limit von
  // 100 Requests/60s pro IP und koennte die Quote fuer echte Nutzer aufbrauchen.
  @SkipThrottle()
  @Get()
  getStatus() {
    return this.appService.getStatus();
  }

  // Unter dem globalen Prefix ausgenommen (main.ts) — erreichbar als
  // <backend-url>/health, ungeprefixt, reiner Prozess-Alive-Check ohne
  // Rate-Limit (haeufiges Polling vom Frontend-Fallback alle 30s).
  @SkipThrottle()
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  // Readiness fuer Load Balancer und Compose-Healthcheck, ungeprefixt wie /health. Ohne DB kann die
  // Instanz nichts Sinnvolles tun → 503, damit sie keinen Traffic mehr bekommt. Ohne Redis laeuft sie
  // weiter (Cache und Rate-Limit fail-open) und meldet nur 'degraded'.
  @SkipThrottle()
  @Get('ready')
  async getReady(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([
      check(() => this.dataSource.query('SELECT 1'), 500),
      check(() => this.redis.ping(), 500),
    ]);
    if (db !== 'ok') res.status(503);
    return { status: db !== 'ok' ? 'down' : redis !== 'ok' ? 'degraded' : 'ok', db, redis };
  }
}
