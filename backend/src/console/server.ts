import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { promisify } from 'util';
import { Client } from 'pg';
import { parseTenantConfig } from '../common/tenant/tenant-config.loader';
import { TENANT_LOCALES, TENANT_MODULES, TENANT_TIERS, TIER_MODULES } from '../common/tenant/tenant.types';
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
// restart: was nach einer Config-Aenderung neu starten muss (Loader liest beim
// Boot, das Frontend holt GET /tenant pro Request).
function stackInfo(slug: string) {
    if (slug === 'default') {
        return {
            containers: ['XXX_backend', 'XXX_frontend'],
            restart: ['XXX_backend', 'XXX_worker'],
            backendPort: '3000',
            frontendPort: '3001',
        };
    }
    const env = path.join(TENANTS, slug, '.env');
    return {
        containers: [`yb-${slug}-backend`, `yb-${slug}-frontend`],
        restart: [`yb-${slug}-backend`, `yb-${slug}-worker`],
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
        const raw: unknown = JSON.parse(fs.readFileSync(configFile(slug), 'utf8'));
        const error = validate(slug, raw);
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

// null = gueltig, sonst alle Fehler auf einmal (Text aus parseTenantConfig)
function validate(slug: string, raw: unknown): string | null {
    try {
        parseTenantConfig(raw, slug);
        return null;
    } catch (err) {
        return (err as Error).message;
    }
}

const configFile = (slug: string) => path.join(TENANTS, slug, 'tenant.json');
const serialize = (raw: unknown) => JSON.stringify(raw, null, 2) + '\n';

// Unified Diff aktuelle Datei -> Vorschlag. git diff --no-index endet mit
// Exit-Code 1, wenn es Unterschiede gibt — das ist hier der Normalfall.
async function diffConfig(slug: string, raw: unknown): Promise<string> {
    const tmp = path.join(TENANTS, slug, '.tenant.json.preview');
    fs.writeFileSync(tmp, serialize(raw));
    try {
        await run('git', ['diff', '--no-index', '--no-color', configFile(slug), tmp], { cwd: REPO });
        return '';
    } catch (err) {
        const out = (err as { stdout?: string }).stdout;
        if (out === undefined) throw err;
        return out;
    } finally {
        fs.unlinkSync(tmp);
    }
}

// Commit-Betreff aus den geaenderten Top-Level-Feldern, z.B. "brand, theme geaendert"
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

// Atomar schreiben (tmp + rename) und nur diese Datei committen — andere
// Aenderungen im Working Tree bleiben unberuehrt (git commit -- <pfad>).
async function saveConfig(slug: string, raw: Record<string, unknown>) {
    const file = configFile(slug);
    const before = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const fields = changedFields(before, raw);
    if (fields.length === 0) return { commit: null };
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, serialize(raw));
    fs.renameSync(tmp, file);
    const rel = path.relative(REPO, file);
    await run('git', ['add', '--', rel], { cwd: REPO });
    await run('git', ['commit', '-m', `chore(tenant/${slug}): ${fields.join(', ')} geaendert`, '--', rel], { cwd: REPO });
    const { stdout } = await run('git', ['log', '-1', '--format=%h %s'], { cwd: REPO });
    return { commit: stdout.trim() };
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => (data += chunk.toString()));
        req.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (err) {
                reject(err as Error);
            }
        });
        req.on('error', reject);
    });
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
        if (req.method === 'GET' && url.pathname === '/api/meta') {
            sendJson(res, 200, { locales: TENANT_LOCALES, tiers: TENANT_TIERS, modules: TENANT_MODULES, tierModules: TIER_MODULES });
            return;
        }
        // /api/tenants/<slug>/<aktion> — slug nur aus der Ordnerliste, nie als Pfad
        const m = url.pathname.match(/^\/api\/tenants\/([^/]+)\/(preview|save|restart)$/);
        if (req.method === 'POST' && m && tenantSlugs().includes(m[1])) {
            const [, slug, action] = m;
            if (action === 'restart') {
                await run('docker', ['restart', ...stackInfo(slug).restart]);
                sendJson(res, 200, { ok: true });
                return;
            }
            const raw = await readBody(req);
            const error = validate(slug, raw);
            if (action === 'preview') {
                sendJson(res, 200, { error, diff: error ? '' : await diffConfig(slug, raw) });
                return;
            }
            if (error) {
                sendJson(res, 400, { error });
                return;
            }
            sendJson(res, 200, await saveConfig(slug, raw as Record<string, unknown>));
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
