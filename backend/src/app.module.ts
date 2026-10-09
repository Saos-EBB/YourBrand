import { Module, NestModule, MiddlewareConsumer, Type } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RlsContextMiddleware } from './common/middleware/rls-context.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/core/auth/auth.module';
import { MailModule } from './common/mail/mail.module';
import { ProfileModule } from './modules/core/profile/profile.module';
import { ChatModule } from './modules/core/chat/chat.module';
import { NotificationsModule } from './modules/core/notifications/notifications.module';
import { ModerationModule } from './modules/core/moderation/moderation.module';
import { PaymentModule } from './modules/core/payment/payment.module';
import { AdminModule } from './modules/core/admin/admin.module';
import { MediaModule } from './modules/core/media/media.module';
import { GdprModule } from './modules/core/gdpr/gdpr.module';
import { CommonModule } from './common/common.module';
import { RedisModule } from './common/redis/redis.module';
import { LastActiveModule } from './common/last-active/last-active.module';
import { SharedJwtModule } from './common/auth/shared-jwt.module';
import { QueueModule } from './common/queue/queue.module';
import { REDIS_CLIENT } from './common/redis/redis.constants';
import { SupportModule } from './modules/core/support/support.module';
import { SetupModule } from './modules/core/setup/setup.module';
import { CitiesModule } from './modules/core/cities/cities.module';
import { BeefModule } from './modules/hidden/beef/beef.module';
import { CoinModule } from './modules/hidden/coin/coin.module';
import { TeethModule } from './modules/hidden/teeth/teeth.module';
import { BadgeModule } from './modules/hidden/badge/badge.module';
import { SharedModule } from './modules/shared/shared.module';
import { MatchingModule } from './modules/core/matching/matching.module';
import { BoardModule } from './modules/core/board/board.module';
import { CareModule } from './modules/core/care/care.module';
import { OrgModule } from './modules/core/care/org.module';
import { TenantModule } from './common/tenant/tenant.module';
import { FeatureGuard } from './common/tenant/feature.guard';
import { isModuleEnabled } from './common/tenant/tenant-config.loader';
import { TENANT_MODULES } from './common/tenant/tenant.types';
import type { TenantModule as TenantFeature } from './common/tenant/tenant.types';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';

// Mandanten-Module (tenants/<slug>/tenant.json): abgeschaltete werden gar
// nicht erst importiert — keine Routen, keine Gateways, keine Cron-Jobs.
// chat ist leer, weil ChatModule immer geladen bleiben muss (ChatGateway
// liefert auch Notifications/Bans, Admin nutzt ConversationsService); die
// Chat-Routen sperrt stattdessen FeatureGuard, die Chat-Events ChatGateway.
const FEATURE_MODULES: Record<TenantFeature, Type[]> = {
  chat: [],
  matching: [MatchingModule],
  payments: [PaymentModule],
  hidden: [BeefModule, CoinModule, TeethModule, BadgeModule],
  board: [BoardModule],
  caretaker: [CareModule],
  orgs: [OrgModule],
};
const enabledFeatureModules = TENANT_MODULES.flatMap((m) => (isModuleEnabled(m) ? FEATURE_MODULES[m] : []));


@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      envFilePath: '.env',
    }),
    // skipIf greift nur im Loadtest-Stack (LOADTEST_MODE=true): dort teilen sich
    // alle simulierten User dieselbe Quell-IP (der Testrunner), gegen die der
    // globale 100req/60s-Throttle sonst sofort greift. Prod/Demo unveraendert.
    // Achtung Array-Form: skipIf muss im Throttler-Objekt selbst stehen, nicht
    // als Sibling von "throttlers" (das waere nur bei der Objekt-Form gueltig)
    // — ThrottlerGuard liest bei Array-Konfiguration ausschliesslich das
    // per-Throttler skipIf, commonOptions.skipIf bleibt dabei immer leer.
    //
    // storage: ThrottlerStorageRedisService mit dem geteilten REDIS_CLIENT
    // (kein eigener Connect/Disconnect noetig, siehe deren disconnectRequired-
    // Logik) — sonst zaehlt jede Instanz ihr eigenes In-Memory-Limit und das
    // globale 100req/60s gilt effektiv pro Instanz statt pro IP.
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { ttl: 60000, limit: 100, skipIf: () => process.env.LOADTEST_MODE === 'true' },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get<number>('database.port'),
        database: configService.get('database.name'),
        username: configService.get('database.user'),
        password: configService.get('database.password'),
        extra: { max: configService.get<number>('database.poolMax') },
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: configService.get('app.nodeEnv') === 'development',
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsTableName: 'typeorm_migrations',
        migrationsRun: false,
      }),
      inject: [ConfigService],
    }),
    TenantModule,
    SharedModule,
    RedisModule,
    LastActiveModule,
    SharedJwtModule,
    QueueModule,
    CommonModule,
    AuthModule,
    MailModule,
    ProfileModule,
    ChatModule,
    NotificationsModule,
    ModerationModule,
    AdminModule,
    MediaModule,
    GdprModule,
    SupportModule,
    SetupModule,
    CitiesModule,
    ...enabledFeatureModules,
  ],
  // AppController: GET /api/v1 (Status) und GET /health (Alive-Check).
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply globally — the middleware is cheap (decode-only, no DB call).
    // Only withRls() callers in ProfileService actually use req.rlsUserId.
    consumer.apply(RlsContextMiddleware).forRoutes('*');
  }
}