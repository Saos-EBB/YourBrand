import { tenantSlug } from './tenant-config.loader';

// Silo-Isolation pro Mandant (docs/multitenant.md): eigene DB, eigener
// Bucket, eigener Redis-Namensraum — auf geteilter Infra (ein Postgres-
// Server, ein Redis, ein MinIO). Die Namen folgen aus dem Slug, damit ein
// neuer Mandant ohne weitere Konfiguration isoliert ist.
//
// DB_NAME / S3_BUCKET gewinnen, wenn explizit gesetzt — fuer den bestehenden
// default-Stack, dessen Volume schon eine DB unter dem .env-Namen hat. Ein
// Mandanten-Container darf sie deshalb NICHT setzen, sonst teilt er sich DB
// bzw. Bucket mit dem default-Mandanten.
export interface TenantInfra {
    database: string;
    bucket: string;
    // ioredis keyPrefix fuer REDIS_CLIENT (Settings-Cache, Throttler, Beef-State, ...)
    redisPrefix: string;
    // BullMQ-eigenes prefix — BullMQ verbietet ioredis keyPrefix auf seinen Connections.
    queuePrefix: string;
}

export function tenantInfra(slug: string = tenantSlug()): TenantInfra {
    return {
        // Postgres-Identifier: kein "-" ohne Quoting, daher "_".
        database: process.env.DB_NAME || `yb_${slug.replace(/-/g, '_')}`,
        bucket: process.env.S3_BUCKET || `${slug}-media`,
        redisPrefix: `${slug}:`,
        queuePrefix: `${slug}:bull`,
    };
}

export function describeTenantInfra(): string {
    const infra = tenantInfra();
    return `Mandant "${tenantSlug()}" — DB ${infra.database}, Bucket ${infra.bucket}, Redis-Prefix ${infra.redisPrefix}`;
}
