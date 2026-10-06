'use client'

import { useHiddenZone } from '@/hooks/useHiddenZone'
import { useModuleEnabled } from '@/components/TenantProvider'

function HiddenZoneEffects() {
  useHiddenZone()
  return null
}

// Hidden Zone nur, wenn der Mandant das Modul "hidden" hat — sonst werden
// auch keine gespeicherten Underground-Themes/Audio wiederhergestellt.
export function HiddenInitializer() {
  return useModuleEnabled('hidden') ? <HiddenZoneEffects /> : null
}
