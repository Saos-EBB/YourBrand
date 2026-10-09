// Feature-Module, die pro Mandant an- oder abschaltbar sind. Bewusst nur
// Module, die im Code wirklich existieren — alles andere (Auth, Profil,
// Moderation, Admin, DSGVO, Media, Notifications, Support) ist Basis und
// immer an. Das Abschalten selbst (Module gar nicht registrieren) kommt mit
// dem Feature-Gating, hier ist nur die Config-Seite.
export const TENANT_MODULES = ['chat', 'matching', 'payments', 'hidden', 'board', 'caretaker', 'orgs'] as const;
export type TenantModule = (typeof TENANT_MODULES)[number];

export const TENANT_TIERS = ['core', 'connect', 'premium'] as const;
export type TenantTier = (typeof TENANT_TIERS)[number];

// Defaults pro Tier, einzelne Module koennen in tenant.json per "modules"
// explizit ueberschrieben werden. board (Schwarzes Brett), caretaker
// (Betreuung) und orgs (Organisationen) sind in keinem Tier Default — ein
// Mandant schaltet sie bewusst ein.
export const TIER_MODULES: Record<TenantTier, Record<TenantModule, boolean>> = {
    core:    { chat: true, matching: false, payments: true, hidden: false, board: false, caretaker: false, orgs: false },
    connect: { chat: true, matching: false, payments: true, hidden: false, board: false, caretaker: false, orgs: false },
    premium: { chat: true, matching: true,  payments: true, hidden: true,  board: false, caretaker: false, orgs: false },
};

// Layout pro Mandant (theme.layout). Alles optional, ohne Angabe sieht die
// App aus wie der default-Mandant.
export const LAYOUT_NAVS = ['sidebar', 'topbar', 'line-map', 'wide-sidebar'] as const;
export type LayoutNav = (typeof LAYOUT_NAVS)[number];
export const LAYOUT_FONTS = ['jakarta', 'bricolage', 'archivo', 'atkinson', 'bigshoulders'] as const;
export type LayoutFont = (typeof LAYOUT_FONTS)[number];
export const LAYOUT_RADII = ['xs', 'sm', 'md', 'lg'] as const;
export type LayoutRadius = (typeof LAYOUT_RADII)[number];
// Menuepunkte, die einen eigenen Namen bekommen koennen (layout.labels)
export const NAV_KEYS = [
    'dashboard', 'notifications', 'discover', 'matches', 'chat', 'requests',
    'profile', 'settings', 'admin', 'beef', 'board', 'care', 'org',
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export interface TenantLayout {
    nav: LayoutNav;
    font: LayoutFont;
    radius?: LayoutRadius;
    textScale: number;
    // Assistenz: Vorlesen, fertige Antworten im Chat, Hilfe-Knopf immer sichtbar
    assist: boolean;
    // Name pro Menuepunkt: ein Text fuer alle Sprachen oder pro Sprache
    labels: Partial<Record<NavKey, string | Partial<Record<TenantLocale, string>>>>;
}

// Muss zu den Sprachen in frontend/lib/i18n/index.ts passen.
export const TENANT_LOCALES = ['de', 'en', 'fr', 'es', 'it', 'ru', 'ja', 'de_easy', 'leet'] as const;
export type TenantLocale = (typeof TENANT_LOCALES)[number];

export interface TenantConfig {
    slug: string;
    brand: { name: string; logo?: string; favicon?: string };
    // tokens gelten in beiden Modi, dark/light ueberschreiben pro Modus
    theme: {
        default: 'dark' | 'light';
        tokens: Record<string, string>;
        dark: Record<string, string>;
        light: Record<string, string>;
        layout: TenantLayout;
    };
    locale: { default: TenantLocale; available: TenantLocale[] };
    tier: TenantTier;
    // Aufgeloest: Tier-Defaults + Overrides, immer vollstaendig.
    modules: Record<TenantModule, boolean>;
    legal: { name: string; address: string; email: string };
    seed?: string;
    seedAgeDays?: number;
}

// Was GET /tenant nach aussen gibt — ohne interne Felder (seed, seedAgeDays).
export type PublicTenantConfig = Omit<TenantConfig, 'seed' | 'seedAgeDays'>;

export const TENANT_CONFIG = 'TENANT_CONFIG';
