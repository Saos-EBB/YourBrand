import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
    providers: [
        {
            provide: REDIS_CLIENT,
            useFactory: () =>
                new Redis({
                    host: process.env.REDIS_HOST ?? 'localhost',
                    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
                }),
        },
    ],
    exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
    constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) { }

    onModuleDestroy() {
        this.client.disconnect();
    }
}
