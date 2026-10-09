import * as fs from 'fs';
import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { TenantConfigSchema } from './tenant-config.schema';
import { NAV_KEYS, TENANT_LOCALES, TENANT_MODULES, TIER_MODULES } from './tenant.types';
import type { PublicTenantConfig, TenantConfig, TenantLayout, TenantModule } from './tenant.types';

// Plain functions wie crypto.helper.ts, kein DI — auch von Seeds und vom
// Worker aus nutzbar. Der Mandant kommt aus TENANT (Default "default"), die
// Config aus TENANT_DIR (Docker: /tenants, lokal: ../tenants relativ zu backend/).

// Nur Farb-Tokens aus globals.css, nur Hex — die Werte landen spaeter als
// CSS-Variablen im Browser, beliebiger Text waere dort CSS-Injection.
const TOKEN_KEY = /^--color-[a-z0-9-]+$/;
const TOKEN_VALUE = /^#[0-9a-f]{3,8}$/i;

export function tenantDir(): string {
    return process.env.TENANT_DIR ?? path.resolve(process.cwd(), '..', 'tenants');
}

export function tenantSlug(): string {
    return process.env.TENANT ?? 'default';
}

function flattenErrors(errors: ValidationError[], prefix = ''): string[] {
    return errors.flatMap((e) => {
        const p = prefix ? `${prefix}.${e.property}` : e.property;
        const own = Object.values(e.constraints ?? {}).map((msg) => `${p}: ${msg}`);
        return [...own, ...flattenErrors(e.children ?? [], p)];
    });
}

// Validiert und loest auf. Wirft mit allen Fehlern auf einmal, damit ein
// kaputtes tenant.json nicht Fehler fuer Fehler repariert werden muss.
export function parseTenantConfig(raw: unknown, expectedSlug: string): TenantConfig {
    const schema = plainToInstance(TenantConfigSchema, raw);
    const errors = flattenErrors(
        validateSync(schema, { whitelist: true, forbidNonWhitelisted: true }),
    );

    if (errors.length === 0) {
        if (schema.slug !== expectedSlug) {
            errors.push(`slug: "${schema.slug}" passt nicht zum Ordnernamen "${expectedSlug}"`);
        }
        if (!schema.locale.available.includes(schema.locale.default)) {
            errors.push(`locale.default: "${schema.locale.default}" fehlt in locale.available`);
        }
        for (const field of ['tokens', 'dark', 'light'] as const) {
            for (const [key, value] of Object.entries(schema.theme[field] ?? {})) {
                if (!TOKEN_KEY.test(key)) errors.push(`theme.${field}: Key "${key}" muss --color-* sein`);
                if (typeof value !== 'string' || !TOKEN_VALUE.test(value)) {
                    errors.push(`theme.${field}.${key}: "${String(value)}" ist keine Hex-Farbe`);
                }
            }
        }
        errors.push(...labelErrors(schema.theme.layout?.labels));
    }

    if (errors.length > 0) {
        throw new Error(`Ungueltige Tenant-Config "${expectedSlug}":\n  - ${errors.join('\n  - ')}`);
    }

    const modules = { ...TIER_MODULES[schema.tier] };
    for (const key of TENANT_MODULES) {
        const override = schema.modules?.[key];
        if (override !== undefined) modules[key] = override;
    }
    // "Zettel abreissen" ist eine Kontaktanfrage, der Rest laeuft im Chat
    if (modules.board && !modules.chat) {
        throw new Error(`Ungueltige Tenant-Config "${expectedSlug}":\n  - modules.board erfordert modules.chat`);
    }
    // Eine Organisation verwaltet Konten ueber Betreuungen (managed_accounts)
    if (modules.orgs && !modules.caretaker) {
        throw new Error(`Ungueltige Tenant-Config "${expectedSlug}":\n  - modules.orgs erfordert modules.caretaker`);
    }
    // Ein Match legt eine Conversation an (SwipeService -> ConversationsService)
    // — ohne Chat waere jedes Match eine Sackgasse.
    if (modules.matching && !modules.chat) {
        throw new Error(`Ungueltige Tenant-Config "${expectedSlug}":\n  - modules.matching erfordert modules.chat`);
    }

    return {
        slug: schema.slug,
        brand: { ...schema.brand },
        theme: {
            default: schema.theme.default,
            tokens: { ...(schema.theme.tokens ?? {}) },
            dark: { ...(schema.theme.dark ?? {}) },
            light: { ...(schema.theme.light ?? {}) },
            layout: resolveLayout(schema.theme.layout),
        },
        locale: { default: schema.locale.default, available: [...schema.locale.available] },
        tier: schema.tier,
        modules,
        legal: { ...schema.legal },
        ...(schema.seed ? { seed: schema.seed } : {}),
        ...(schema.seedAgeDays ? { seedAgeDays: schema.seedAgeDays } : {}),
    };
}

// Menuenamen landen als Text im Frontend (React escaped), trotzdem kurz und
// nur fuer bekannte Menuepunkte/Sprachen — Tippfehler sollen auffallen.
const LABEL_MAX = 24;
function labelErrors(labels: Record<string, unknown> | undefined): string[] {
    const errors: string[] = [];
    for (const [key, value] of Object.entries(labels ?? {})) {
        if (!(NAV_KEYS as readonly string[]).includes(key)) {
            errors.push(`theme.layout.labels: unbekannter Menuepunkt "${key}" (erlaubt: ${NAV_KEYS.join(', ')})`);
            continue;
        }
        const texts = typeof value === 'string' ? { '*': value } : value;
        if (!texts || typeof texts !== 'object' || Array.isArray(texts)) {
            errors.push(`theme.layout.labels.${key}: Text oder Objekt pro Sprache erwartet`);
            continue;
        }
        for (const [lang, text] of Object.entries(texts as Record<string, unknown>)) {
            if (lang !== '*' && !(TENANT_LOCALES as readonly string[]).includes(lang)) {
                errors.push(`theme.layout.labels.${key}: unbekannte Sprache "${lang}"`);
            }
            if (typeof text !== 'string' || text.trim().length === 0 || text.length > LABEL_MAX) {
                errors.push(`theme.layout.labels.${key}: Text muss 1-${LABEL_MAX} Zeichen haben`);
            }
        }
    }
    return errors;
}

function resolveLayout(raw: TenantConfigSchema['theme']['layout']): TenantLayout {
    return {
        nav: raw?.nav ?? 'sidebar',
        font: raw?.font ?? 'jakarta',
        ...(raw?.radius ? { radius: raw.radius } : {}),
        textScale: raw?.textScale ?? 1,
        assist: raw?.assist ?? false,
        labels: { ...((raw?.labels ?? {}) as TenantLayout['labels']) },
    };
}

let cached: TenantConfig | null = null;

// Einmal pro Prozess gelesen. Fehlt die Datei oder ist sie ungueltig, wirft
// das beim Boot — die App startet bewusst nicht mit halber Config.
export function loadTenantConfig(): TenantConfig {
    if (cached) return cached;
    const slug = tenantSlug();
    const file = path.join(tenantDir(), slug, 'tenant.json');
    if (!fs.existsSync(file)) {
        throw new Error(`Tenant-Config nicht gefunden: ${file} (TENANT=${slug}, TENANT_DIR=${tenantDir()})`);
    }
    let raw: unknown;
    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        throw new Error(`Tenant-Config ${file} ist kein gueltiges JSON: ${(err as Error).message}`);
    }
    cached = parseTenantConfig(raw, slug);
    return cached;
}

export function isModuleEnabled(module: TenantModule): boolean {
    return loadTenantConfig().modules[module];
}

export function toPublicTenantConfig(config: TenantConfig): PublicTenantConfig {
    const publicConfig: PublicTenantConfig & { seed?: string; seedAgeDays?: number } = { ...config };
    delete publicConfig.seed;
    delete publicConfig.seedAgeDays;
    return publicConfig;
}
