import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { promisify } from 'util';
import { Client } from 'pg';
import { parseTenantConfig } from '../common/tenant/tenant-config.loader';
import { tenantInfra } from '../common/tenant/tenant-infra.helper';
import { collectDashboardStats } from '../modules/core/admin/dashboard-stats.query';

// Mandanten-Console: lokales Dashboard ueber allen Mandanten (backend/docs/architecture.md).
// Laeuft auf dem Host (nicht im Container) — braucht Schreibzugriff auf tenants/,
// git und docker. Nur an 127.0.0.1 gebunden, keine Auth.

const PORT = 3099;
const REPO = path.resolve(__dirname, '..', '..', '..');
const TENANTS = path.join(REPO, 'tenants');
// Eine Zeile pro Mandant und Aktualisierung (gitignored)
const SNAPSHOTS = path.join(REPO, '.console', 'snapshots.jsonl');

const run = promisify(execFile);

function envValue(file: string, key: string): string | undefined {
    if (!fs.existsSync(file)) return undefined;
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim();
}

// default ist der Haupt-Stack (docker-compose.yml, feste Namen/Ports), alle
// anderen laufen ueber scripts/tenant.sh (Ports aus tenants/<slug>/.env).
function stackInfo(slug: string) {
    if (slug === 'default') {
        return { containers: ['XXX_backend', 'XXX_frontend'], backendPort: '3000', frontendPort: '3001' };
    }
    const env = path.join(TENANTS, slug, '.env');
    return {
        containers: [`yb-${slug}-backend`, `yb-${slug}-frontend`],
        backendPort: envValue(env, 'BACKEND_PORT'),
        frontendPort: envValue(env, 'FRONTEND_PORT'),
    };
}

// null = Docker nicht erreichbar, Status unbekannt
async function runningContainers(): Promise<Set<string> | null> {
    try {
        const { stdout } = await run('docker', ['ps', '--format', '{{.Names}}']);
        return new Set(stdout.split('\n').filter(Boolean));
    } catch {
        return null;
    }
}

function tenantSlugs(): string[] {
    return fs.readdirSync(TENANTS)
        .filter((slug) => !slug.startsWith('_') && fs.existsSync(path.join(TENANTS, slug, 'tenant.json')))
        .sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
}

async function listTenants() {
    const running = await runningContainers();
    return tenantSlugs().map((slug) => {
        const raw: unknown = JSON.parse(fs.readFileSync(path.join(TENANTS, slug, 'tenant.json'), 'utf8'));
        let error: string | null = null;
        try {
            parseTenantConfig(raw, slug);
        } catch (err) {
            error = (err as Error).message;
        }
        const stack = stackInfo(slug);
        return {
            slug,
            config: raw,
            error,
            running: running && stack.containers.every((c) => running.has(c)),
            frontendUrl: stack.frontendPort && `http://localhost:${stack.frontendPort}`,
        };
    });
}

// Zugangsdaten wie der Haupt-Stack (Root-.env), Postgres auf dem Host-Port aus
// docker-compose.yml. DB_NAME gilt nur fuer default (tenantInfra).
async function tenantStats(slug: string) {
    const env = path.join(REPO, '.env');
    process.env.DB_NAME = envValue(env, 'DB_NAME');
    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: envValue(env, 'DB_USER'),
        password: envValue(env, 'DB_PASSWORD'),
        database: tenantInfra(slug).database,
        connectionTimeoutMillis: 3000,
    });
    try {
        await client.connect();
        return { stats: await collectDashboardStats(async (sql) => (await client.query(sql)).rows) };
    } catch (err) {
        return { stats: null, error: (err as Error).message };
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function takeSnapshot() {
    const at = new Date().toISOString();
    const rows = await Promise.all(tenantSlugs().map(async (slug) => ({ at, slug, ...(await tenantStats(slug)) })));
    fs.mkdirSync(path.dirname(SNAPSHOTS), { recursive: true });
    fs.appendFileSync(SNAPSHOTS, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return rows;
}

function readSnapshots(): unknown[] {
    if (!fs.existsSync(SNAPSHOTS)) return [];
    return fs.readFileSync(SNAPSHOTS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as unknown);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const handle = async () => {
        if (req.method === 'GET' && url.pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/tenants') {
            sendJson(res, 200, await listTenants());
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/snapshots') {
            sendJson(res, 200, readSnapshots());
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/snapshots') {
            sendJson(res, 200, await takeSnapshot());
            return;
        }
        sendJson(res, 404, { error: 'not found' });
    };
    handle().catch((err: Error) => sendJson(res, 500, { error: err.message }));
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Mandanten-Console: http://localhost:${PORT}`);
});
