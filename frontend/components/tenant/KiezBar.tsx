'use client'

import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTenant } from '@/components/TenantProvider'

// Schmale dunkle Leiste ueber der Navigation, wie ein Strassenschild: der
// eigene Ort und der Name der Seite. Bewusst in beiden Modi dunkel. Nur fuer Mandanten mit Schwarzem Brett.
export function KiezBar() {
  const { modules, brand } = useTenant()
  const [city, setCity] = useState<string | null>(null)

  useEffect(() => {
    if (!modules.board) return
    fetchApi<{ city?: string | null }>('/profile/me').then((p) => setCity(p.city ?? null)).catch(() => {})
  }, [modules.board])

  if (!modules.board) return null
  return (
    <div className="flex items-center gap-2 bg-[#1E2226] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white md:px-6">
      <MapPin size={13} aria-hidden />
      {city && <span>{city}</span>}
      {city && <span aria-hidden="true">·</span>}
      <span className="text-[#FFD23F]">{brand.name}</span>
    </div>
  )
}
