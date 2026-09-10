import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
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
        RedisModule,
        QueueModule,
    ],
})
export class WorkerModule { }
