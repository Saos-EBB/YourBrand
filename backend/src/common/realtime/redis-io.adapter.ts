import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';
import { tenantInfra } from '../tenant/tenant-infra.helper';

// Socket.IO ueber Redis: Events an Raeume (user:<id>, Konversationen, admin, beef:<id>) erreichen Clients auf allen
// Backend-Instanzen, nicht nur auf der Instanz, die das Event ausloest (Loadtest-Audit B4). Zwei eigene Verbindungen, weil eine
// Verbindung im Subscribe-Modus nichts anderes mehr kann. Kanalpraefix mit Mandant, weil sich Tenants ein Redis teilen.
export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor?: ReturnType<typeof createAdapter>;

    constructor(app: INestApplicationContext) {
        super(app);
    }

    connectToRedis(): void {
        const options = {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        };
        const pubClient = new Redis(options);
        const subClient = pubClient.duplicate();
        this.adapterConstructor = createAdapter(pubClient, subClient, { key: `${tenantInfra().redisPrefix}socket.io` });
    }

    createIOServer(port: number, options?: ServerOptions) {
        const server = super.createIOServer(port, options);
        if (this.adapterConstructor) server.adapter(this.adapterConstructor);
        return server;
    }
}
