import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
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

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';


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
    SharedModule,
    RedisModule,
    CommonModule,
    AuthModule,
    MailModule,
    ProfileModule,
    ChatModule,
    NotificationsModule,
    ModerationModule,
    PaymentModule,
    AdminModule,
    MediaModule,
    GdprModule,
    SupportModule,
    SetupModule,
    CitiesModule,
    BeefModule,
    CoinModule,
    TeethModule,
    BadgeModule,
    MatchingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply globally — the middleware is cheap (decode-only, no DB call).
    // Only withRls() callers in ProfileService actually use req.rlsUserId.
    consumer.apply(RlsContextMiddleware).forRoutes('*');
  }
}