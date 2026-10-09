'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'
import { useTenant } from '@/components/TenantProvider'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { useNavLabel } from '@/components/nav/useNavLabel'

interface PublicBeef {
  id: string
  tldr: string
  status: string
  ends_at: string | null
  game_deadline_at: string | null
  pot_coins: number
}

function countdown(target: string | null, now: number): string {
  if (!target) return '--:--'
  const s = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// Underground (Linienplan-Navigation): laufende Beefs als Abfahrtstafel,
// jeder Beef eine Linie U1 … U4. Nur sichtbar, wenn die Hidden Zone offen ist
// — Beefs gehoeren dorthin.
export function DepartureBoard() {
  const { theme, modules } = useTenant()
  const isHidden = useHiddenStore((s) => s.isHidden)
  const label = useNavLabel()
  const [beefs, setBeefs] = useState<PublicBeef[]>([])
  const [now, setNow] = useState(() => Date.now())
  const show = theme.layout.nav === 'line-map' && modules.hidden && isHidden

  useEffect(() => {
    if (!show) return
    fetchApi<PublicBeef[]>('/hidden/beef/public').then((b) => setBeefs(b.slice(0, 6))).catch(() => {})
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [show])

  if (!show || beefs.length === 0) return null
  return (
    <section aria-label={label('beef')} className="rounded bg-[#050506] p-4 font-mono text-sm text-[#FFC400] shadow-[inset_0_0_0_1px_#2a2a2a]">
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-2.5 items-center">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#7d6a20]">Linie</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#7d6a20]">{label('beef')}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#7d6a20] text-right">Pot</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#7d6a20] text-right">Ende</span>
        {beefs.map((b, i) => (
          <Link key={b.id} href={`/beef/${b.id}`} className="contents hover:[&>*]:text-white">
            <span
              className="inline-grid h-5 min-w-8 place-items-center rounded-sm px-1 font-display text-sm font-black text-[#0F1013]"
              style={{ background: `var(--viz-${(i % 4) + 1})` }}
            >
              U{i + 1}
            </span>
            <span className="truncate">{b.tldr}</span>
            <span className="text-right tabular-nums">{b.pot_coins} C</span>
            <span className="text-right tabular-nums">{countdown(b.status === 'active' ? b.ends_at : b.game_deadline_at, now)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
