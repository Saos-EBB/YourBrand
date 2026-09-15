'use client'

import { useBackendHealth } from '@/hooks/useBackendHealth'
import { OfflineFallback } from '@/components/OfflineFallback'

export function BackendHealthGate({ children }: { children: React.ReactNode }) {
  const status = useBackendHealth()
  // 'checking' rendert children mit — sonst flackert bei jedem Seitenaufruf
  // kurz der Fallback auf, bevor der erste Health-Check zurueckkommt.
  if (status === 'unhealthy') return <OfflineFallback />
  return <>{children}</>
}
