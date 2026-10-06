import { tenantSlug } from './tenant-config.loader';

// Silo-Isolation pro Mandant (docs/multitenant.md): eigene DB, eigener
// Bucket, eigener Redis-Namensraum — auf geteilter Infra (ein Postgres-
// Server, ein Redis, ein MinIO). Die Namen folgen aus dem Slug, damit ein
// neuer Mandant ohne weitere Konfiguration isoliert ist.
//
// DB_NAME / S3_BUCKET gelten NUR fuer den default-Mandanten (bestehender
// Haupt-Stack, dessen Volume schon eine DB unter dem .env-Namen hat). Fuer
// alle anderen werden sie ignoriert: backend/.env ist in jeden Container
// gemountet und setzt DB_NAME — sonst landete jeder Mandant in der default-DB.
export interface TenantInfra {
    database: string;
    bucket: string;
    // ioredis keyPrefix fuer REDIS_CLIENT (Settings-Cache, Throttler, Beef-State, ...)
    redisPrefix: string;
    // BullMQ-eigenes prefix — BullMQ verbietet ioredis keyPrefix auf seinen Connections.
    queuePrefix: string;
}

export function tenantInfra(slug: string = tenantSlug()): TenantInfra {
    const legacy = slug === 'default';
    return {
        // Postgres-Identifier: kein "-" ohne Quoting, daher "_".
        database: (legacy && process.env.DB_NAME) || `yb_${slug.replace(/-/g, '_')}`,
        bucket: (legacy && process.env.S3_BUCKET) || `${slug}-media`,
        redisPrefix: `${slug}:`,
        queuePrefix: `${slug}:bull`,
    };
}

export function describeTenantInfra(): string {
    const infra = tenantInfra();
    return `Mandant "${tenantSlug()}" — DB ${infra.database}, Bucket ${infra.bucket}, Redis-Prefix ${infra.redisPrefix}`;
}
