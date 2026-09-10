import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { MEDIA_PROCESSING_QUEUE, DEFAULT_JOB_OPTIONS } from './common/queue/queue.constants';
import { SystemSettingsService } from './modules/core/system-settings/system-settings.service';
import { SystemSetting } from './modules/core/system-settings/entities/system-setting.entity';
import { MediaUpload } from './modules/core/media/entities/media-upload.entity';
import { User } from './modules/core/auth/entities/user.entity';
import { MediaProcessor } from './modules/core/media/media.processor';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';

// Deliberately its own root module, NOT AppModule. If the worker booted
// AppModule, every @Processor provider registered in a feature module would
// also be instantiated by the API process (main.ts also boots AppModule) —
// both processes would then pull jobs off the same queues. Same entities/
// services/helpers as the API (same codebase, same src/), just a leaner,
// HTTP-free module graph: no controllers, no guards, no gateways.
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig],
            envFilePath: '.env',
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
            }),
            inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([MediaUpload, User, SystemSetting]),
        RedisModule,
        QueueModule,
        BullModule.registerQueue({ name: MEDIA_PROCESSING_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    ],
    // SystemSettingsService directly instead of importing SystemSettingsModule —
    // that module also provides SystemSettingsController/JwtGuard/OwnerGuard,
    // and JwtGuard needs JwtService (SharedJwtModule, API-only). The worker
    // has no HTTP surface, so it only needs the service itself.
    providers: [MediaProcessor, SystemSettingsService],
})
export class WorkerModule { }
