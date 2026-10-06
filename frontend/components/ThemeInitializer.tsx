'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/lib/store/themeStore'
import { useTenant } from '@/components/TenantProvider'

export function ThemeInitializer() {
  const tenantDefault = useTenant().theme.default
  useEffect(() => {
    // Ohne eigene Wahl (nichts persistiert) gilt der Mandanten-Default —
    // dasselbe, was das theme-init-Script im Root-Layout schon gesetzt hat.
    let hasChoice = false
    try { hasChoice = localStorage.getItem('xxx-theme') !== null } catch {}
    if (!hasChoice) useThemeStore.getState().setTheme(tenantDefault)
    const theme = useThemeStore.getState().theme
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
  }, [tenantDefault])
  return null
}
