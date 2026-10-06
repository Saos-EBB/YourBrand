/**
 * Einmal-Init eines Mandanten (Service "init" in docker-compose.tenant.yml,
 * laeuft vor backend/worker): prueft tenant.json, legt die Mandanten-DB auf
 * dem geteilten Postgres an und spielt das Schema ein, legt den Bucket auf
 * dem geteilten MinIO an. Idempotent — jeder Neustart darf es erneut laufen.
 *
 * Schema = migrations/001_baseline.sql + alle weiteren migrations/NNN_*.sql
 * (wie db/Dockerfile fuer die Haupt-DB). Eingespielte Dateien merkt sich
 * tenant_schema_migrations: ein abgebrochener Lauf setzt beim naechsten
 * Start fort, neue Migrationen landen beim naechsten Init automatisch in
 * jeder Mandanten-DB. Eine DB mit Schema, aber ohne diese Tabelle (nicht von
 * hier angelegt), wird nicht angefasst.
 *
 * Namen kommen aus tenant-infra.helper.ts, also dieselben wie im Backend.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { loadTenantConfig } from '../common/tenant/tenant-config.loader';
import { tenantInfra } from '../common/tenant/tenant-infra.helper';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

function pgClient(database: string): Client {
    return new Client({
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database,
    });
}

async function ensureDatabase(database: string): Promise<void> {
    // CREATE DATABASE kennt keine Parameter — der Name stammt aus dem
    // validierten Slug, hier trotzdem nochmal hart geprueft.
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) throw new Error(`Ungueltiger DB-Name: ${database}`);

    const admin = pgClient('postgres');
    await admin.connect();
    try {
        const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
        if (rowCount) {
            console.log(`[tenant-init] DB ${database} vorhanden`);
        } else {
            await admin.query(`CREATE DATABASE "${database}"`);
            console.log(`[tenant-init] DB ${database} angelegt`);
        }
    } finally {
        await admin.end();
    }

    await applyMigrations(database);
}

// Ohne $$-Funktionskoerper: Statement fuer Statement (autocommit) — ein
// Multi-Statement-Query laeuft als implizite Transaktion, und CREATE INDEX
// CONCURRENTLY (003) ist darin verboten. Die Baseline (pg_dump, mit
// Funktionen) laeuft am Stueck; sie enthaelt kein CONCURRENTLY.
function statementsOf(sql: string): string[] {
    if (sql.includes('$$')) return [sql];
    return sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((stmt) => stmt.trim())
        .filter(Boolean);
}

async function applyMigrations(database: string): Promise<void> {
    const db = pgClient(database);
    await db.connect();
    let applied: Set<string>;
    try {
        const { rows } = await db.query<{ users: string | null; tracking: string | null }>(
            `SELECT to_regclass('public.users')::text AS users,
                    to_regclass('public.tenant_schema_migrations')::text AS tracking`,
        );
        if (rows[0]?.users && !rows[0]?.tracking) {
            console.log('[tenant-init] Schema ohne tenant_schema_migrations — nicht von hier angelegt, wird nicht angefasst');
            return;
        }
        await db.query(`CREATE TABLE IF NOT EXISTS public.tenant_schema_migrations (
            file text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )`);
        const done = await db.query<{ file: string }>('SELECT file FROM public.tenant_schema_migrations');
        applied = new Set(done.rows.map((r) => r.file));
    } finally {
        await db.end();
    }

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
        console.log('[tenant-init] Schema aktuell — nichts zu tun');
        return;
    }
    for (const file of pending) {
        // Eigene Verbindung pro Datei: die Baseline (pg_dump) setzt search_path
        // fuer die Session auf '' — die folgenden Migrationen erwarten public.
        const client = pgClient(database);
        await client.connect();
        try {
            for (const stmt of statementsOf(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))) {
                await client.query(stmt);
            }
            await client.query('INSERT INTO public.tenant_schema_migrations (file) VALUES ($1)', [file]);
        } finally {
            await client.end();
        }
        console.log(`[tenant-init] ${file} eingespielt`);
    }
}

async function ensureBucket(bucket: string): Promise<void> {
    const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'auto',
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        },
        forcePathStyle: true,
    });
    try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        console.log(`[tenant-init] Bucket ${bucket} vorhanden`);
    } catch {
        // Kein Public-Read noetig: Medien laufen ueber den Backend-Proxy
        // (GET /api/v1/media/file/*), der mit Zugangsdaten liest.
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[tenant-init] Bucket ${bucket} angelegt`);
    }
}

async function main(): Promise<void> {
    const config = loadTenantConfig();
    const infra = tenantInfra();
    console.log(`[tenant-init] Mandant "${config.slug}" (${config.tier}) — DB ${infra.database}, Bucket ${infra.bucket}`);
    await ensureDatabase(infra.database);
    await ensureBucket(infra.bucket);
    console.log('[tenant-init] fertig');
}

main().catch((err: Error) => {
    console.error('[tenant-init] FEHLER:', err.message);
    process.exit(1);
});
