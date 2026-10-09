import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { promisify } from 'util';
import { Client } from 'pg';
import sharp from 'sharp';
import { parseTenantConfig } from '../common/tenant/tenant-config.loader';
import { TENANT_LOCALES, TENANT_MODULES, TENANT_TIERS, TIER_MODULES } from '../common/tenant/tenant.types';
import { tenantInfra } from '../common/tenant/tenant-infra.helper';
import {
    collectDashboardAnalytics, parseAnalyticsRange, type AnalyticsRange, type RowsFn,
} from '../modules/core/admin/dashboard-analytics.query';
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
async function withTenantDb<T>(slug: string, fn: (rows: RowsFn) => Promise<T>): Promise<T> {
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
        return await fn(async (sql, params) => (await client.query(sql, params as unknown[])).rows);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function tenantStats(slug: string) {
    try {
        return { stats: await withTenantDb(slug, (rows) => collectDashboardStats((sql) => rows(sql) as Promise<{ value: string }[]>)) };
    } catch (err) {
        return { stats: null, error: (err as Error).message };
    }
}

// Coins nur mit Hidden Zone (wie im AdminService), Module aus tenant.json
async function tenantAnalytics(slug: string, days: AnalyticsRange) {
    const config = parseTenantConfig(JSON.parse(fs.readFileSync(configFile(slug), 'utf8')), slug);
    try {
        const analytics = await withTenantDb(slug, (rows) => collectDashboardAnalytics(rows, days, { coins: config.modules.hidden }));
        return { slug, name: config.brand.name, modules: config.modules, analytics };
    } catch (err) {
        return { slug, name: config.brand.name, modules: config.modules, analytics: null, error: (err as Error).message };
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
    writeConfig(slug, raw);
    return { commit: await commitPaths([file], `chore(tenant/${slug}): ${fields.join(', ')} geaendert`) };
}

function writeConfig(slug: string, raw: unknown) {
    const tmp = `${configFile(slug)}.tmp`;
    fs.writeFileSync(tmp, serialize(raw));
    fs.renameSync(tmp, configFile(slug));
}

async function commitPaths(files: string[], message: string): Promise<string> {
    const rels = files.map((f) => path.relative(REPO, f));
    await run('git', ['add', '-A', '--', ...rels], { cwd: REPO });
    await run('git', ['commit', '-m', message, '--', ...rels], { cwd: REPO });
    const { stdout } = await run('git', ['log', '-1', '--format=%h %s'], { cwd: REPO });
    return stdout.trim();
}

// ── Logo ──────────────────────────────────────────────────────────────────
const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const ASSET_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Das Logo landet spaeter im Browser jedes Mandanten — ein SVG mit Script waere
// XSS. Ablehnen statt bereinigen: kein Sanitizer noetig, Fehlermeldung sagt warum.
function unsafeSvg(svg: string): string | null {
    if (/<script/i.test(svg)) return '<script>';
    if (/\son[a-z]+\s*=/i.test(svg)) return 'Event-Handler (on…=)';
    if (/javascript:/i.test(svg)) return 'javascript:-URL';
    if (/<foreignObject/i.test(svg)) return '<foreignObject>';
    if (/(href|src)\s*=\s*["'](?!#|data:image\/)/i.test(svg)) return 'externe Referenz';
    return null;
}

// Speichert logo.<ext> + favicon.png (64×64, per sharp), traegt beide in tenant.json
// ein, raeumt ein altes Logo mit anderer Endung weg und committet alles zusammen.
async function saveLogo(slug: string, type: string, data: Buffer) {
    const ext = LOGO_TYPES[type];
    if (!ext) return { error: `Dateityp ${type} nicht erlaubt (PNG, JPG, WebP, SVG)` };
    if (data.length > MAX_LOGO_BYTES) return { error: 'Datei groesser als 2 MB' };
    if (ext === 'svg') {
        const bad = unsafeSvg(data.toString('utf8'));
        if (bad) return { error: `SVG abgelehnt: enthaelt ${bad}` };
    }
    let favicon: Buffer;
    try {
        favicon = await sharp(data).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    } catch (err) {
        return { error: `Kein lesbares Bild: ${(err as Error).message}` };
    }
    const dir = path.join(TENANTS, slug);
    const raw = JSON.parse(fs.readFileSync(configFile(slug), 'utf8')) as { brand: { logo?: string; favicon?: string } };
    const touched = [configFile(slug), path.join(dir, `logo.${ext}`), path.join(dir, 'favicon.png')];
    const old = raw.brand.logo;
    if (old && old !== `logo.${ext}` && fs.existsSync(path.join(dir, old))) {
        fs.unlinkSync(path.join(dir, old));
        touched.push(path.join(dir, old));
    }
    fs.writeFileSync(path.join(dir, `logo.${ext}`), data);
    fs.writeFileSync(path.join(dir, 'favicon.png'), favicon);
    raw.brand.logo = `logo.${ext}`;
    raw.brand.favicon = 'favicon.png';
    writeConfig(slug, raw);
    return { logo: raw.brand.logo, favicon: raw.brand.favicon, commit: await commitPaths(touched, `chore(tenant/${slug}): logo + favicon getauscht`) };
}

function readRaw(req: http.IncomingMessage, limit: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            // Mehr als das Limit nicht puffern; saveLogo meldet die Groesse
            if (size <= limit + 1) chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
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

// Basis-Farben aus frontend/app/globals.css: @theme = dark (Standard), .light = Overrides.
// Mandanten-Tokens gelten fuer beide Modi (themeTokensCss im Frontend).
function baseTokens() {
    const css = fs.readFileSync(path.join(REPO, 'frontend', 'app', 'globals.css'), 'utf8');
    const block = (selector: string) => {
        const body = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
        return Object.fromEntries([...body.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)].map((m) => [m[1], m[2]]));
    };
    const dark = block('@theme');
    return { dark, light: { ...dark, ...block('.light') } };
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
            sendJson(res, 200, {
                locales: TENANT_LOCALES,
                tiers: TENANT_TIERS,
                modules: TENANT_MODULES,
                tierModules: TIER_MODULES,
                baseTokens: baseTokens(),
            });
            return;
        }
        // Nur die Dateien, die tenant.json als Logo/Favicon nennt (Namen sind per Schema ohne Pfad)
        const asset = url.pathname.match(/^\/api\/tenants\/([^/]+)\/asset\/([^/]+)$/);
        if (req.method === 'GET' && asset && tenantSlugs().includes(asset[1])) {
            const [, slug, name] = asset;
            const brand = (JSON.parse(fs.readFileSync(configFile(slug), 'utf8')) as { brand: Record<string, string> }).brand;
            const file = path.join(TENANTS, slug, name);
            if ((name === brand.logo || name === brand.favicon) && fs.existsSync(file)) {
                res.writeHead(200, {
                    'Content-Type': ASSET_TYPES[path.extname(name).slice(1)] ?? 'application/octet-stream',
                    'Cache-Control': 'no-store',
                    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
                });
                res.end(fs.readFileSync(file));
                return;
            }
            sendJson(res, 404, { error: 'not found' });
            return;
        }
        // /api/tenants/<slug>/<aktion> — slug nur aus der Ordnerliste, nie als Pfad
        const m = url.pathname.match(/^\/api\/tenants\/([^/]+)\/(preview|save|restart|logo)$/);
        if (req.method === 'POST' && m && tenantSlugs().includes(m[1])) {
            const [, slug, action] = m;
            if (action === 'restart') {
                await run('docker', ['restart', ...stackInfo(slug).restart]);
                sendJson(res, 200, { ok: true });
                return;
            }
            if (action === 'logo') {
                const result = await saveLogo(slug, req.headers['content-type'] ?? '', await readRaw(req, MAX_LOGO_BYTES));
                sendJson(res, 'error' in result ? 400 : 200, result);
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
        if (req.method === 'GET' && url.pathname === '/api/analytics') {
            const days = parseAnalyticsRange(url.searchParams.get('days'));
            // Nacheinander: 5 Mandanten a ~30 ms, kein Grund fuer 5 parallele Verbindungen
            const out: Awaited<ReturnType<typeof tenantAnalytics>>[] = [];
            for (const slug of tenantSlugs()) {
                try { out.push(await tenantAnalytics(slug, days)); } catch { /* ungueltige tenant.json: steht schon in der Uebersicht */ }
            }
            sendJson(res, 200, out);
            return;
        }
        const an = url.pathname.match(/^\/api\/tenants\/([^/]+)\/analytics$/);
        if (req.method === 'GET' && an && tenantSlugs().includes(an[1])) {
            sendJson(res, 200, await tenantAnalytics(an[1], parseAnalyticsRange(url.searchParams.get('days'))));
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
