'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { AdminShopShell } from '@/components/shop/admin/AdminShopShell'
import { CaseSheet } from '@/components/shop/admin/CaseSheet'
import { formatDateTime, timeLeft, useNow } from '@/components/shop/admin/time'
import {
  CASE_KIND_LABEL, CASE_REASON_LABEL, CASE_STATUS_LABEL, orderNumber,
  type AdminShopCase, type AdminShopCasePage, type ShopCaseStatus,
} from '@/lib/shop'

type Filter = 'active' | ShopCaseStatus | 'all'
const FILTERS: [Filter, string][] = [['active', 'Zu tun'], ['open', 'Offen'], ['waiting', 'Wartet auf Käufer'], ['resolved', 'Erledigt'], ['all', 'Alle']]

export default function AdminShopCasesPage() {
  return <AdminShopShell active="cases"><Cases /></AdminShopShell>
}

function Cases() {
  const [status, setStatus] = useState<Filter>('active')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminShopCasePage | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [flash, setFlash] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const now = useNow()

  useEffect(() => {
    let cancelled = false
    fetchApi<AdminShopCasePage>(`/admin/shop/cases?status=${status}&page=${page}`)
      .then((d) => { if (!cancelled) { setData(d); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [status, page, reload])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  function changed(message: string) {
    setFlash(message)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 3000)
    setReload((n) => n + 1)
  }

  const counts = data?.counts ?? {}
  const countOf = (f: Filter) => f === 'active' ? (counts.open ?? 0) + (counts.waiting ?? 0)
    : f === 'all' ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) : counts[f] ?? 0
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const openCount = counts.open ?? 0

  return (
    <>
      {flash && (
        <div role="status" data-flash className="fixed bottom-24 left-1/2 z-[220] -translate-x-1/2 rounded-full bg-surface-container-highest px-4 py-2 text-sm font-medium text-on-surface shadow-lg md:bottom-6">
          {flash}
        </div>
      )}
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Shop · Fälle</h1>
        <p className="text-sm text-on-surface-variant">
          {!data ? ' ' : openCount === 0 ? 'Kein Fall wartet auf euch.' : `${openCount} ${openCount === 1 ? 'Fall wartet' : 'Fälle warten'} auf eine Antwort.`}
        </p>
      </header>

      <div role="radiogroup" aria-label="Status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map(([f, label]) => {
          const n = countOf(f)
          const on = status === f
          return (
            <button key={f} role="radio" aria-checked={on} onClick={() => { setStatus(f); setPage(1) }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'border-on-surface bg-on-surface text-background' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'}`}>
              {label}
              {data && n > 0 && <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-background/20' : 'bg-surface-container-highest'}`}>{n}</span>}
            </button>
          )
        })}
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      <section className="overflow-hidden rounded-2xl bg-surface-container">
        {!data ? (
          <div className="space-y-px" aria-hidden>{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 bg-surface-container-high/40 animate-pulse" />)}</div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-on-surface-variant">
            {status === 'active' && <CheckCircle2 size={36} className="text-primary-fixed-dim" aria-hidden />}
            <p>{status === 'active' ? 'Alles erledigt.' : 'Keine Fälle.'}</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-outline-variant/50">
            {data.items.map((c) => <CaseRow key={c.id} c={c} now={now} onOpen={() => setOpen(c.id)} />)}
          </ul>
        )}
      </section>

      {data && pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Seiten">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Vorherige Seite" className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30"><ChevronLeft size={18} aria-hidden /></button>
          <span className="text-sm text-on-surface-variant">Seite {page} von {pages}</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Nächste Seite" className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30"><ChevronRight size={18} aria-hidden /></button>
        </nav>
      )}

      {open && <CaseSheet id={open} onClose={() => setOpen(null)} onChanged={changed} />}
    </>
  )
}

function CaseRow({ c, now, onOpen }: { c: AdminShopCase; now: number; onOpen: () => void }) {
  const left = c.status !== 'resolved' ? timeLeft(c.due_at, now) : null
  const urgent = c.priority === 'urgent' && c.status !== 'resolved'
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface-container-high/50 sm:items-center sm:px-4">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0 ${urgent || left?.urgent ? 'bg-error' : c.status === 'open' ? 'bg-primary-fixed-dim' : 'bg-transparent'}`} aria-hidden />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${urgent ? 'bg-error-container/50 text-error' : 'bg-surface-container-highest text-on-surface'}`}>{CASE_KIND_LABEL[c.kind]}</span>
            <span className="text-sm font-semibold text-on-surface">{CASE_REASON_LABEL[c.reason] ?? c.reason}</span>
            <span className="text-xs text-on-surface-variant">{CASE_STATUS_LABEL[c.status]}</span>
          </span>
          {c.last_message && <span className="block truncate text-sm text-on-surface-variant">„{c.last_message}“</span>}
          <span className="block truncate text-xs text-on-surface-variant">
            {c.against_nickname ? `gegen ${c.against_nickname}` : `von ${c.opened_by_nickname ?? '—'}`}
            {c.order_id && ` · #${orderNumber(c.order_id)}`} · {formatDateTime(c.created_at)} · {c.message_count} {c.message_count === 1 ? 'Nachricht' : 'Nachrichten'}
          </span>
        </span>
        {left && (
          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${left.urgent ? 'text-error' : 'text-on-surface-variant'}`}>
            <Clock size={12} aria-hidden /> {left.label}
          </span>
        )}
      </button>
    </li>
  )
}
