// Feature-Module, die pro Mandant an- oder abschaltbar sind. Bewusst nur
// Module, die im Code wirklich existieren — alles andere (Auth, Profil,
// Moderation, Admin, DSGVO, Media, Notifications, Support) ist Basis und
// immer an. Das Abschalten selbst (Module gar nicht registrieren) kommt mit
// dem Feature-Gating, hier ist nur die Config-Seite.
export const TENANT_MODULES = ['chat', 'matching', 'payments', 'hidden'] as const;
export type TenantModule = (typeof TENANT_MODULES)[number];

export const TENANT_TIERS = ['core', 'connect', 'premium'] as const;
export type TenantTier = (typeof TENANT_TIERS)[number];

// Defaults pro Tier, einzelne Module koennen in tenant.json per "modules"
// explizit ueberschrieben werden. Connect = Core, weil die Connect-Features
// (Orgs, Caretaker) im Backend noch nicht gebaut sind — siehe docs/multitenant.md.
export const TIER_MODULES: Record<TenantTier, Record<TenantModule, boolean>> = {
    core:    { chat: true, matching: false, payments: true, hidden: false },
    connect: { chat: true, matching: false, payments: true, hidden: false },
    premium: { chat: true, matching: true,  payments: true, hidden: true },
};

// Muss zu den Sprachen in frontend/lib/i18n/index.ts passen.
export const TENANT_LOCALES = ['de', 'en', 'fr', 'es', 'it', 'ru', 'ja', 'de_easy', 'leet'] as const;
export type TenantLocale = (typeof TENANT_LOCALES)[number];

export interface TenantConfig {
    slug: string;
    brand: { name: string; logo?: string; favicon?: string };
    theme: { default: 'dark' | 'light'; tokens: Record<string, string> };
    locale: { default: TenantLocale; available: TenantLocale[] };
    tier: TenantTier;
    // Aufgeloest: Tier-Defaults + Overrides, immer vollstaendig.
    modules: Record<TenantModule, boolean>;
    legal: { name: string; address: string; email: string };
    seed?: string;
}

// Was GET /tenant nach aussen gibt — ohne interne Felder (seed).
export type PublicTenantConfig = Omit<TenantConfig, 'seed'>;

export const TENANT_CONFIG = 'TENANT_CONFIG';
