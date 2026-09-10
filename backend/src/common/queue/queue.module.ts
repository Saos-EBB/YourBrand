import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// Configures the shared BullMQ connection (same Redis instance as Phase 1's
// RedisModule — no new infra, just a dedicated connection object). BullMQ
// requires maxRetriesPerRequest: null on connections used for its blocking
// commands, which is why this can't just reuse REDIS_CLIENT directly.
// Imported once by AppModule (producers) and once by WorkerModule
// (consumers) — each queue itself is still registered per-module via
// BullModule.registerQueue({ name }), same convention as
// TypeOrmModule.forFeature([Entity]).
@Module({
    imports: [
        BullModule.forRootAsync({
            useFactory: () => ({
                connection: {
                    host: process.env.REDIS_HOST ?? 'localhost',
                    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
                    maxRetriesPerRequest: null,
                },
            }),
        }),
    ],
    exports: [BullModule],
})
export class QueueModule { }
