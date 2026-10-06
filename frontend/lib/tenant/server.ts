import { cache } from 'react'
import { FALLBACK_TENANT, type TenantConfig } from './types'

const backendInternalUrl = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3000'

// Nur aus Server-Komponenten aufrufen (BACKEND_INTERNAL_URL ist server-seitig).
// Einmal pro Request (React cache), serverseitig — so stimmen Titel, lang,
// Theme und Farben schon im ersten HTML, ohne Flackern nach dem Laden.
export const getTenant = cache(async (): Promise<TenantConfig> => {
  try {
    const res = await fetch(`${backendInternalUrl}/api/v1/tenant`, { cache: 'no-store' })
    if (!res.ok) return FALLBACK_TENANT
    return (await res.json()) as TenantConfig
  } catch {
    return FALLBACK_TENANT
  }
})
