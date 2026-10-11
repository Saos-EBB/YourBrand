'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Search } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { AdminShopShell } from '@/components/shop/admin/AdminShopShell'
import { OrderSheet, ReasonChips, StatusBadge } from '@/components/shop/admin/OrderSheet'
import { adminField } from '@/components/shop/admin/Sheet'
import { formatDateTime, timeLeft, useNow } from '@/components/shop/admin/time'
import {
  DELIVERY_MODE_LABEL, ORDER_STATUS_LABEL, PROGRESS_LABEL, formatPrice, orderNumber,
  type AdminShopOrder, type AdminShopOrderPage, type ShopOrderStatus,
} from '@/lib/shop'

type Filter = ShopOrderStatus | 'all'
// Reihenfolge der Chips: was ein Mensch tun muss zuerst
const FILTERS: Filter[] = ['held', 'approved', 'fulfilled', 'rejected', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'all']

export default function AdminShopOrdersPage() {
  return <AdminShopShell active="orders"><Orders /></AdminShopShell>
}

function Orders() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Filter>('held')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminShopOrderPage | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [flash, setFlash] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const now = useNow()

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ status, page: String(page), ...(query ? { q: query } : {}) })
    fetchApi<AdminShopOrderPage>(`/admin/shop/orders?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [query, status, page, reload])

  useEffect(() => () => { clearTimeout(searchTimer.current); clearTimeout(flashTimer.current) }, [])

  function onSearch(value: string) {
    setQ(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setQuery(value.trim()); setPage(1) }, 300)
  }

  function choose(f: Filter) {
    setStatus(f)
    setPage(1)
  }

  function decided(message: string) {
    setOpen(null)
    setFlash(message)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 3000)
    setReload((n) => n + 1)
  }

  function changed(message: string) {
    setFlash(message)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 3000)
    setReload((n) => n + 1)
  }

  const counts = data?.counts ?? {}
  const countOf = (f: Filter) => (f === 'all' ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) : counts[f] ?? 0)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const heldCount = counts.held ?? 0

  return (
    <>
      {flash && (
        <div role="status" data-flash className="fixed bottom-24 left-1/2 z-[220] md:bottom-6 -translate-x-1/2 rounded-full bg-surface-container-highest px-4 py-2 text-sm font-medium text-on-surface shadow-lg">
          {flash}
        </div>
      )}

      <header>
        <h1 className="text-2xl font-bold text-on-surface">Shop · Bestellungen</h1>
        <p className="text-sm text-on-surface-variant">
          {!data ? ' ' : heldCount === 0 ? 'Nichts wartet auf dich.' : `${heldCount} ${heldCount === 1 ? 'Bestellung wartet' : 'Bestellungen warten'} auf eine Entscheidung.`}
        </p>
      </header>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Suchen</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Bestellnummer, Name, E-Mail oder Nickname" className={`${adminField} pl-9`} />
        </label>
        <div role="radiogroup" aria-label="Status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => {
            const n = countOf(f)
            const on = status === f
            return (
              <button key={f} role="radio" aria-checked={on} onClick={() => choose(f)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'border-on-surface bg-on-surface text-background' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'}`}>
                {f === 'all' ? 'Alle' : ORDER_STATUS_LABEL[f]}
                {data && n > 0 && (
                  <span className={`rounded-full px-1.5 text-xs ${f === 'held' && !on ? 'bg-error text-background' : on ? 'bg-background/20' : 'bg-surface-container-highest'}`}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      <section className="overflow-hidden rounded-2xl bg-surface-container">
        {!data ? (
          <div className="space-y-px" aria-hidden>{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-20 bg-surface-container-high/40 animate-pulse" />)}</div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-on-surface-variant">
            {status === 'held' && !query && <CheckCircle2 size={36} className="text-primary-fixed-dim" aria-hidden />}
            <p>{status === 'held' && !query ? 'Alles entschieden.' : 'Keine Bestellungen gefunden.'}</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-outline-variant/50">
            {data.items.map((o) => <OrderRow key={o.id} o={o} now={now} onOpen={() => setOpen(o.id)} />)}
          </ul>
        )}
      </section>

      {data && pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Seiten">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Vorherige Seite" className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30">
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="text-sm text-on-surface-variant">Seite {page} von {pages}</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Nächste Seite" className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30">
            <ChevronRight size={18} aria-hidden />
          </button>
        </nav>
      )}

      {open && <OrderSheet id={open} onClose={() => setOpen(null)} onDecided={(_, msg) => decided(msg)} onChanged={changed} />}
    </>
  )
}

function OrderRow({ o, now, onOpen }: { o: AdminShopOrder; now: number; onOpen: () => void }) {
  const left = o.status === 'held' && o.decide_by ? timeLeft(o.decide_by, now) : null
  const who = o.nickname ?? o.buyer_name ?? 'gelöschter Nutzer'
  const more = o.item_count > 1 ? ` +${o.item_count - 1}` : ''

  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface-container-high/50 sm:items-center sm:px-4">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0 ${left?.urgent ? 'bg-error' : o.status === 'held' ? 'bg-error/50' : 'bg-transparent'}`} aria-hidden />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-on-surface-variant">#{orderNumber(o.id)}</span>
            <StatusBadge status={o.status} />
            {(o.status === 'approved' || o.status === 'partially_refunded') && o.progress && (
              <span className={`text-[11px] font-semibold ${o.progress === 'not_met' ? 'text-error' : 'text-on-surface-variant'}`}>{PROGRESS_LABEL[o.progress]}</span>
            )}
          </span>
          <span className="block truncate text-sm font-semibold text-on-surface">
            {o.first_title ?? '—'}{more && <span className="font-normal text-on-surface-variant">{more}</span>}
          </span>
          <span className="block truncate text-xs text-on-surface-variant">
            {who} · {DELIVERY_MODE_LABEL[o.delivery_mode]} · {formatDateTime(o.created_at)}
          </span>
          {o.hold_reasons.length > 0 && <span className="flex flex-wrap gap-1"><ReasonChips reasons={o.hold_reasons} /></span>}
        </span>
        <span className="shrink-0 space-y-1 text-right">
          <span className="block text-sm font-bold text-on-surface">{formatPrice(o.total_cents, 'de')}</span>
          {left && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${left.urgent ? 'text-error' : 'text-on-surface-variant'}`}>
              <Clock size={12} aria-hidden /> {left.label}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
