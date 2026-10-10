'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileUp, KeyRound, Pencil, Plus, Search } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { ProductTile, fulfillmentLabel } from '@/components/shop/ProductCard'
import { ProductEditor } from '@/components/shop/admin/ProductEditor'
import { ImportDialog } from '@/components/shop/admin/ImportDialog'
import { CodesDialog } from '@/components/shop/admin/CodesDialog'
import { adminField, primaryBtn, secondaryBtn } from '@/components/shop/admin/Sheet'
import { AdminShopShell } from '@/components/shop/admin/AdminShopShell'
import { SHOP_FULFILLMENTS, categoryLabel, formatPrice, type AdminShopProduct, type AdminShopProductPage } from '@/lib/shop'

type Status = 'all' | 'active' | 'inactive'
type Dialog = { kind: 'edit'; product: AdminShopProduct | null } | { kind: 'import' } | { kind: 'codes'; product: AdminShopProduct } | null

export default function AdminShopProductsPage() {
  return <AdminShopShell active="products"><Products /></AdminShopShell>
}

function Products() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [fulfillment, setFulfillment] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminShopProductPage | null>(null)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reload, setReload] = useState(0)
  const [flash, setFlash] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ status, page: String(page), ...(query ? { q: query } : {}), ...(fulfillment ? { fulfillment } : {}) })
    fetchApi<AdminShopProductPage>(`/admin/shop/products?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [query, fulfillment, status, page, reload])

  useEffect(() => () => { clearTimeout(searchTimer.current); clearTimeout(flashTimer.current) }, [])

  function onSearch(value: string) {
    setQ(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setQuery(value.trim()); setPage(1) }, 300)
  }

  function notify(msg: string) {
    setFlash(msg)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 2500)
  }

  // Einzelne Zeile ersetzen statt neu laden — die Liste springt nicht
  function replace(p: AdminShopProduct) {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === p.id ? p : i)) })
  }

  async function toggleActive(p: AdminShopProduct) {
    replace({ ...p, active: !p.active })
    try {
      replace(await fetchApi<AdminShopProduct>(`/admin/shop/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) }))
      notify(p.active ? 'Ausgeblendet' : 'Im Shop sichtbar')
    } catch (e) {
      replace(p)
      setError((e as Error).message)
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <>
      {flash && (
        <div role="status" data-flash className="fixed left-1/2 top-20 z-[220] -translate-x-1/2 rounded-full bg-surface-container-highest px-4 py-2 text-sm font-medium text-on-surface shadow-lg">
          {flash}
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Shop · Artikel</h1>
          <p className="text-sm text-on-surface-variant">{data ? `${data.total.toLocaleString('de')} Artikel` : ' '}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDialog({ kind: 'import' })} className={secondaryBtn}><FileUp size={16} aria-hidden /> CSV importieren</button>
          <button onClick={() => setDialog({ kind: 'edit', product: null })} className={primaryBtn}><Plus size={16} aria-hidden /> Neuer Artikel</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <label className="relative basis-full sm:basis-0 sm:flex-1">
          <span className="sr-only">Suchen</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Titel oder SKU" className={`${adminField} pl-9`} />
        </label>
        <select value={fulfillment} onChange={(e) => { setFulfillment(e.target.value); setPage(1) }} className="rounded-lg bg-surface-container-high px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim" aria-label="Art">
          <option value="">Alle Arten</option>
          {SHOP_FULFILLMENTS.map((f) => <option key={f} value={f}>{fulfillmentLabel(t, f)}</option>)}
        </select>
        <div role="radiogroup" aria-label="Status" className="flex rounded-lg bg-surface-container-high p-1 gap-1">
          {([['all', 'Alle'], ['active', 'Sichtbar'], ['inactive', 'Ausgeblendet']] as const).map(([s, label]) => (
            <button key={s} role="radio" aria-checked={status === s} onClick={() => { setStatus(s); setPage(1) }}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${status === s ? 'bg-on-surface text-background' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      <section className="overflow-hidden rounded-2xl bg-surface-container">
        {!data ? (
          <div className="space-y-px" aria-hidden>{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 bg-surface-container-high/40 animate-pulse" />)}</div>
        ) : data.items.length === 0 ? (
          <p className="py-16 text-center text-on-surface-variant">Keine Artikel gefunden.</p>
        ) : (
          <ul role="list" className="divide-y divide-outline-variant/50">
            {data.items.map((p) => <Row key={p.id} p={p} onEdit={() => setDialog({ kind: 'edit', product: p })}
              onCodes={() => setDialog({ kind: 'codes', product: p })} onToggle={() => toggleActive(p)} />)}
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

      {dialog?.kind === 'edit' && (
        <ProductEditor
          product={dialog.product}
          categories={data?.categories ?? []}
          onClose={() => setDialog(null)}
          onSaved={(p) => {
            if (dialog.product) replace(p)
            else setReload((n) => n + 1)
            setDialog(null)
            notify(dialog.product ? 'Gespeichert' : 'Artikel angelegt')
          }}
        />
      )}
      {dialog?.kind === 'import' && <ImportDialog onClose={() => setDialog(null)} onImported={() => setReload((n) => n + 1)} />}
      {dialog?.kind === 'codes' && (
        <CodesDialog product={dialog.product} onClose={() => setDialog(null)} onAdded={(free) => replace({ ...dialog.product, free_codes: free })} />
      )}
    </>
  )
}

function Row({ p, onEdit, onCodes, onToggle }: { p: AdminShopProduct; onEdit: () => void; onCodes: () => void; onToggle: () => void }) {
  const { t } = useTranslation()
  const stockLabel = p.fulfillment === 'license'
    ? `${p.free_codes ?? 0} Keys frei`
    : p.stock === null ? 'unbegrenzt' : `${p.stock} auf Lager`
  const empty = p.fulfillment === 'license' ? !p.free_codes : p.stock === 0

  return (
    <li className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${p.active ? '' : 'opacity-60'}`}>
      <div className="w-14 shrink-0"><ProductTile product={p} /></div>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold text-on-surface hover:underline">{p.title}</p>
        <p className="truncate text-xs text-on-surface-variant">
          <span className="font-mono">{p.sku}</span> · {categoryLabel(p.category)} · {fulfillmentLabel(t, p.fulfillment)}
          {p.unlock_target && <> · <span className="font-mono">{p.unlock_target}</span></>}
        </p>
        <p className="text-xs text-on-surface sm:hidden">
          <b>{formatPrice(p.price_cents, 'de')}</b> · <span className={empty ? 'font-semibold text-error' : 'text-on-surface-variant'}>{stockLabel}</span>
        </p>
      </button>
      <div className="hidden w-28 text-right sm:block">
        <p className="text-sm font-bold text-on-surface">{formatPrice(p.price_cents, 'de')}</p>
        <p className="text-xs text-on-surface-variant">{p.vat_rate} % MwSt</p>
      </div>
      <p className={`hidden w-28 text-right text-xs md:block ${empty ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>{stockLabel}</p>
      <div className="flex shrink-0 items-center gap-1">
        {p.fulfillment === 'license' && (
          <button onClick={onCodes} aria-label={`Keys für ${p.title} hinzufügen`} title="Keys hinzufügen" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface">
            <KeyRound size={16} aria-hidden />
          </button>
        )}
        <button onClick={onEdit} aria-label={`${p.title} bearbeiten`} title="Bearbeiten" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface">
          <Pencil size={16} aria-hidden />
        </button>
        <label className="ml-1 cursor-pointer" title={p.active ? 'Im Shop sichtbar' : 'Ausgeblendet'}>
          <span className="sr-only">{p.title} im Shop sichtbar</span>
          <input type="checkbox" role="switch" checked={p.active} onChange={onToggle} className="peer sr-only" />
          <span className="relative block h-6 w-11 rounded-full bg-surface-container-highest transition-colors peer-checked:bg-primary-fixed-dim peer-focus-visible:ring-2 peer-focus-visible:ring-primary-fixed-dim after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-on-surface after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-background" aria-hidden />
        </label>
      </div>
    </li>
  )
}
