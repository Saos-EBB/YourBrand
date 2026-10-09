'use client'

import { createContext, useContext, useEffect } from 'react'
import { useLanguageStore } from '@/lib/store/languageStore'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { FALLBACK_TENANT, type TenantConfig, type TenantModule } from '@/lib/tenant/types'

const TenantContext = createContext<TenantConfig>(FALLBACK_TENANT)

// Bekommt die Config aus dem Root-Layout (serverseitig geladen) und macht sie
// allen Client-Komponenten zugaenglich. Kein eigener Fetch im Browser.
export function TenantProvider({ config, children }: { config: TenantConfig; children: React.ReactNode }) {
  useEffect(() => {
    // Sprach-Default nur, solange der Nutzer selbst nichts gewaehlt hat
    // (persistierter Store); eine nicht (mehr) angebotene Sprache faellt auf
    // den Default zurueck. Das Theme setzt ThemeInitializer.
    try {
      const lang = useLanguageStore.getState().uiLang
      if (!localStorage.getItem('xxx-language') || !config.locale.available.includes(lang)) {
        useLanguageStore.getState().setUiLang(config.locale.default)
      }
    } catch {}
    // Hidden Zone gehoert zum Modul "hidden" — ist es aus, darf auch ein
    // frueher entsperrter Zustand nicht wieder aufleben.
    if (!config.modules.hidden && useHiddenStore.getState().isHidden) useHiddenStore.getState().lock()
  }, [config])

  return <TenantContext.Provider value={config}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantConfig {
  return useContext(TenantContext)
}

export function useModuleEnabled(module: TenantModule): boolean {
  return useContext(TenantContext).modules[module]
}

// Fuer Server-Layouts, die selbst keinen Hook nutzen koennen.
export function BrandName() {
  return <>{useTenant().brand.name}</>
}

// Logo des Mandanten (tenant.json brand.logo), dekorativ neben dem Namen
export function BrandLogo({ className }: { className?: string }) {
  const { logo } = useTenant().brand
  if (!logo) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/v1/tenant/asset/${logo}`} alt="" className={className} />
}
