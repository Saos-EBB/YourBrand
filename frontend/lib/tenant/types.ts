import type { UiLang } from '@/lib/store/languageStore'

// Spiegel von PublicTenantConfig (backend/src/common/tenant/tenant.types.ts),
// geliefert von GET /api/v1/tenant.
export type TenantModule = 'chat' | 'matching' | 'payments' | 'hidden'

export interface TenantConfig {
  slug: string
  brand: { name: string; logo?: string; favicon?: string }
  theme: { default: 'dark' | 'light'; tokens: Record<string, string> }
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
  theme: { default: 'dark', tokens: {} },
  locale: { default: 'de', available: ['de', 'en', 'fr', 'es', 'it', 'ru', 'ja', 'de_easy', 'leet'] },
  tier: 'premium',
  modules: { chat: true, matching: true, payments: true, hidden: true },
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
]

export function moduleForPath(href: string): TenantModule | null {
  const pathname = href.split(/[?#]/)[0]
  const hit = ROUTE_MODULES.find(({ prefix }) => pathname === prefix || pathname.startsWith(prefix + '/'))
  return hit?.module ?? null
}

// Fuer Nav-Links: Ziel gehoert zu keinem oder einem aktiven Modul.
export function isRouteEnabled(href: string, modules: Record<TenantModule, boolean>): boolean {
  const module = moduleForPath(href)
  return module === null || modules[module]
}

// Backend validiert schon (nur --color-* mit Hex-Wert) — hier nochmal, weil
// die Werte unescaped in ein <style>-Tag gehen.
const TOKEN_KEY = /^--color-[a-z0-9-]+$/
const TOKEN_VALUE = /^#[0-9a-f]{3,8}$/i

// Greift fuer dark und light, aber nicht fuer die Hidden-Zone-Themes
// (underground-*), die bewusst ihre eigene Palette haben. Spezifitaet 0,3,0
// schlaegt .light / .dark aus globals.css.
export function themeTokensCss(tokens: Record<string, string>): string {
  const decls = Object.entries(tokens)
    .filter(([k, v]) => TOKEN_KEY.test(k) && TOKEN_VALUE.test(v))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  return decls ? `:root:not(.underground-brick):not(.underground-neon){${decls}}` : ''
}
