import type { UiLang } from '@/lib/store/languageStore'

// Spiegel von PublicTenantConfig (backend/src/common/tenant/tenant.types.ts),
// geliefert von GET /api/v1/tenant.
export type TenantModule = 'chat' | 'matching' | 'payments' | 'hidden' | 'board' | 'caretaker' | 'orgs'

// Spiegel von TenantLayout im Backend (theme.layout)
export type LayoutNav = 'sidebar' | 'topbar' | 'line-map' | 'wide-sidebar'
export type LayoutFont = 'jakarta' | 'bricolage' | 'archivo' | 'atkinson' | 'bigshoulders'
export type LayoutRadius = 'xs' | 'sm' | 'md' | 'lg'
export type NavKey =
  | 'dashboard' | 'notifications' | 'discover' | 'matches' | 'chat' | 'requests'
  | 'profile' | 'settings' | 'admin' | 'beef' | 'board' | 'care' | 'org'

export interface TenantLayout {
  nav: LayoutNav
  font: LayoutFont
  radius?: LayoutRadius
  textScale: number
  // Vorlesen, fertige Antworten, Hilfe-Knopf (Miteinander)
  assist: boolean
  labels: Partial<Record<NavKey, string | Partial<Record<UiLang, string>>>>
}

export const DEFAULT_LAYOUT: TenantLayout = { nav: 'sidebar', font: 'jakarta', textScale: 1, assist: false, labels: {} }

export interface TenantConfig {
  slug: string
  brand: { name: string; logo?: string; favicon?: string }
  // tokens gelten in beiden Modi, dark/light ueberschreiben pro Modus
  theme: {
    default: 'dark' | 'light'
    tokens: Record<string, string>
    dark: Record<string, string>
    light: Record<string, string>
    layout: TenantLayout
  }
  locale: { default: UiLang; available: UiLang[] }
  tier: 'core' | 'connect' | 'premium'
  modules: Record<TenantModule, boolean>
  legal: { name: string; address: string; email: string }
}

// Nur falls das Backend beim Rendern nicht erreichbar ist — entspricht dem
// default-Mandanten (alles an). BackendHealthGate zeigt dann ohnehin den
// Offline-Fallback.
export const FALLBACK_TENANT: TenantConfig = {
  slug: 'default',
  brand: { name: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'YourBrand' },
  theme: { default: 'dark', tokens: {}, dark: {}, light: {}, layout: DEFAULT_LAYOUT },
  locale: { default: 'de', available: ['de', 'en', 'fr', 'es', 'it', 'ru', 'ja', 'de_easy', 'leet'] },
  tier: 'premium',
  modules: { chat: true, matching: true, payments: true, hidden: true, board: false, caretaker: false, orgs: false },
  legal: { name: '<NAME>', address: '<ANSCHRIFT>', email: '<EMAIL>' },
}

// Welche App-Routen zu welchem Modul gehoeren (app/(app)/...). /requests sind
// Kontaktanfragen — Teil des Chat-Moduls im Backend (ChatController).
export const ROUTE_MODULES: { prefix: string; module: TenantModule }[] = [
  { prefix: '/discover', module: 'matching' },
  { prefix: '/matches', module: 'matching' },
  { prefix: '/chat', module: 'chat' },
  { prefix: '/requests', module: 'chat' },
  { prefix: '/beef', module: 'hidden' },
  { prefix: '/board', module: 'board' },
  { prefix: '/care', module: 'caretaker' },
  { prefix: '/org', module: 'orgs' },
]

export function moduleForPath(href: string): TenantModule | null {
  const pathname = href.split(/[?#]/)[0]
  const hit = ROUTE_MODULES.find(({ prefix }) => pathname === prefix || pathname.startsWith(prefix + '/'))
  return hit?.module ?? null
}

// Fuer Nav-Links: Ziel gehoert zu keinem oder einem aktiven Modul.
export function isRouteEnabled(href: string, modules: Record<TenantModule, boolean>): boolean {
  const mod = moduleForPath(href)
  return mod === null || modules[mod]
}

// Backend validiert schon (nur --color-* mit Hex-Wert) — hier nochmal, weil
// die Werte unescaped in ein <style>-Tag gehen.
const TOKEN_KEY = /^--color-[a-z0-9-]+$/
const TOKEN_VALUE = /^#[0-9a-f]{3,8}$/i

// Greift nicht fuer die Hidden-Zone-Themes (underground-*), die bewusst ihre
// eigene Palette haben, und nicht bei .palette-classic (Nutzer hat in den
// Einstellungen die Standardfarben gewaehlt). Spezifitaet 0,4,0 bzw. 0,5,0
// schlaegt .light / .dark aus globals.css; Modus-Tokens schlagen die
// gemeinsamen.
const NOT_OVERRIDDEN = ':not(.underground-brick):not(.underground-neon):not(.palette-classic)'

function decls(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .filter(([k, v]) => TOKEN_KEY.test(k) && TOKEN_VALUE.test(v))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

export function themeTokensCss(theme: Pick<TenantConfig['theme'], 'tokens' | 'dark' | 'light'>): string {
  const rules: string[] = []
  const all = decls(theme.tokens)
  const dark = decls(theme.dark ?? {})
  const light = decls(theme.light ?? {})
  if (all) rules.push(`:root${NOT_OVERRIDDEN}{${all}}`)
  if (dark) rules.push(`:root.dark${NOT_OVERRIDDEN}{${dark}}`)
  if (light) rules.push(`:root.light${NOT_OVERRIDDEN}{${light}}`)
  return rules.join('')
}

export function hasTenantColors(theme: TenantConfig['theme']): boolean {
  return [theme.tokens, theme.dark, theme.light].some((t) => Object.keys(t ?? {}).length > 0)
}

// Name eines Menuepunkts: eigener Name des Mandanten (pro Sprache oder fuer
// alle), sonst der Standard aus den Uebersetzungen.
export function navLabel(layout: TenantLayout, key: NavKey, lang: UiLang, fallback: string): string {
  const custom = layout.labels[key]
  if (!custom) return fallback
  if (typeof custom === 'string') return custom
  return custom[lang] ?? fallback
}
