'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useNavLabel } from '@/components/nav/useNavLabel'
import { ProductCard, ProductCardSkeleton, fulfillmentLabel } from '@/components/shop/ProductCard'
import { SHOP_FULFILLMENTS, SHOP_PAGE_SIZE, SHOP_SORTS, categoryLabel, type ShopProductPage, type ShopSort } from '@/lib/shop'

// Filter stehen in der URL: Zurueck aus dem Artikel landet wieder auf derselben Auswahl
const FILTER_KEYS = ['q', 'category', 'fulfillment', 'minPrice', 'maxPrice', 'minRating', 'inStock', 'sort', 'page'] as const
type FilterKey = (typeof FILTER_KEYS)[number]

export default function ShopPage() {
  return (
    <Suspense fallback={null}>
      <Shop />
    </Suspense>
  )
}

function Shop() {
  const { t } = useTranslation()
  const label = useNavLabel()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [data, setData] = useState<ShopProductPage | null>(null)
  // Welche Abfrage zuletzt geantwortet hat; weicht sie ab, laedt gerade die naechste
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState(params.get('q') ?? '')

  const get = (k: FilterKey) => params.get(k) ?? ''
  const page = Math.max(1, Number(get('page')) || 1)
  const query = params.toString()
  const loading = loadedQuery !== query
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  function update(patch: Partial<Record<FilterKey, string>>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    // Jede Filteraenderung startet wieder auf Seite 1
    if (!('page' in patch)) next.delete('page')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // Suche mit kurzer Verzoegerung, damit nicht jeder Tastendruck eine Anfrage ist
  function onSearch(value: string) {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => update({ q: value.trim() }), 300)
  }

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams(query)
    qs.set('limit', String(SHOP_PAGE_SIZE))
    fetchApi<ShopProductPage>(`/shop/products?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadedQuery(query) })
    return () => { cancelled = true }
  }, [query])

  const activeCount = FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'page' && k !== 'q' && get(k)).length
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  function goTo(p: number) {
    update({ page: p > 1 ? String(p) : '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filters = (
    <Filters
      data={data}
      get={get}
      update={update}
      onReset={() => { setSearch(''); router.replace(pathname, { scroll: false }) }}
      activeCount={activeCount}
    />
  )

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl text-on-surface">{label('shop')}</h1>
        <p className="text-sm text-on-surface-variant">{t.shop.subtitle}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative basis-full sm:basis-0 sm:flex-1">
          <span className="sr-only">{t.shop.searchPlaceholder}</span>
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t.shop.searchPlaceholder}
            maxLength={100}
            className="w-full rounded-xl bg-surface-container-high py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary-fixed-dim"
          />
        </label>
        <button
          onClick={() => setFiltersOpen(true)}
          className="lg:hidden inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2.5 text-sm font-semibold text-on-surface"
        >
          <SlidersHorizontal size={16} aria-hidden /> {t.shop.filters}
          {activeCount > 0 && <span className="rounded-full bg-primary-fixed-dim px-1.5 text-xs text-on-primary-container">{activeCount}</span>}
        </button>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-on-surface-variant sm:ml-0">
          <span className="hidden sm:inline">{t.shop.sort}</span>
          <select
            value={get('sort') || 'newest'}
            onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}
            className="rounded-xl bg-surface-container-high px-3 py-2.5 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim"
          >
            {SHOP_SORTS.map((s) => <option key={s} value={s}>{sortLabel(t, s)}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">{filters}</aside>

        <section aria-busy={loading} className="space-y-4 min-w-0">
          <p className="text-sm text-on-surface-variant" aria-live="polite">
            {data ? t.shop.results.replace('{n}', data.total.toLocaleString()) : ' '}
          </p>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}

          {!data && !error ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="rounded-2xl bg-surface-container py-16 text-center space-y-3">
              <p className="text-on-surface-variant">{t.shop.empty}</p>
              {(activeCount > 0 || get('q')) && (
                <button onClick={() => { setSearch(''); router.replace(pathname, { scroll: false }) }} className="text-sm font-semibold text-primary-fixed-dim hover:underline">
                  {t.shop.resetFilters}
                </button>
              )}
            </div>
          ) : data && (
            <ul role="list" className={`grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {data.items.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
            </ul>
          )}

          {data && pages > 1 && (
            <nav className="flex items-center justify-center gap-3 pt-2" aria-label={t.shop.pagination}>
              <button
                onClick={() => goTo(page - 1)}
                disabled={page <= 1}
                aria-label={t.shop.prev}
                className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <span className="text-sm text-on-surface-variant">
                {t.shop.page.replace('{page}', String(page)).replace('{pages}', String(pages))}
              </span>
              <button
                onClick={() => goTo(page + 1)}
                disabled={page >= pages}
                aria-label={t.shop.next}
                className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30"
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </nav>
          )}
        </section>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={t.shop.filters}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-5 pb-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-on-surface">{t.shop.filters}</h2>
              <button onClick={() => setFiltersOpen(false)} aria-label={t.common.close} className="rounded-full p-1.5 text-on-surface-variant hover:text-on-surface">
                <X size={20} aria-hidden />
              </button>
            </div>
            {filters}
            <button
              onClick={() => setFiltersOpen(false)}
              className="w-full rounded-xl bg-primary-fixed-dim py-3 text-sm font-bold text-on-primary-container"
            >
              {data ? t.shop.showResults.replace('{n}', data.total.toLocaleString()) : t.common.close}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

function sortLabel(t: T, s: ShopSort): string {
  return { newest: t.shop.sortNewest, price_asc: t.shop.sortPriceAsc, price_desc: t.shop.sortPriceDesc, rating: t.shop.sortRating }[s]
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
        active ? 'bg-on-surface text-background border-on-surface' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  )
}

function Filters({ data, get, update, onReset, activeCount }: {
  data: ShopProductPage | null
  get: (k: FilterKey) => string
  update: (patch: Partial<Record<FilterKey, string>>) => void
  onReset: () => void
  activeCount: number
}) {
  const { t } = useTranslation()
  const category = get('category')
  const fulfillment = get('fulfillment')
  const minRating = get('minRating')
  const inStock = get('inStock') === 'true'

  return (
    <div className="space-y-6">
      <FilterGroup title={t.shop.category}>
        <div className="flex flex-wrap gap-2">
          <Chip active={!category} onClick={() => update({ category: '' })}>{t.shop.all}</Chip>
          {data?.facets.categories.map((c) => (
            <Chip key={c.category} active={category === c.category} onClick={() => update({ category: category === c.category ? '' : c.category })}>
              {categoryLabel(c.category)} <span className="opacity-60">{c.count}</span>
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title={t.shop.kind}>
        <div className="flex flex-wrap gap-2">
          <Chip active={!fulfillment} onClick={() => update({ fulfillment: '' })}>{t.shop.all}</Chip>
          {SHOP_FULFILLMENTS.map((f) => (
            <Chip key={f} active={fulfillment === f} onClick={() => update({ fulfillment: fulfillment === f ? '' : f })}>
              {fulfillmentLabel(t, f)}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title={t.shop.price}>
        <PriceRange
          key={`${get('minPrice')}-${get('maxPrice')}`}
          min={get('minPrice')}
          max={get('maxPrice')}
          placeholderMin={data ? String(Math.floor(data.facets.priceMin / 100)) : ''}
          placeholderMax={data ? String(Math.ceil(data.facets.priceMax / 100)) : ''}
          onChange={(minPrice, maxPrice) => update({ minPrice, maxPrice })}
        />
      </FilterGroup>

      <FilterGroup title={t.shop.rating}>
        <div className="flex flex-wrap gap-2">
          <Chip active={!minRating} onClick={() => update({ minRating: '' })}>{t.shop.all}</Chip>
          {['4', '3', '2'].map((r) => (
            <Chip key={r} active={minRating === r} onClick={() => update({ minRating: minRating === r ? '' : r })}>
              <span className="inline-flex items-center gap-1">{r}<Star size={12} className="text-amber-400" fill="currentColor" strokeWidth={0} aria-hidden />+</span>
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-semibold text-on-surface">{t.shop.inStockOnly}</span>
        <input
          type="checkbox"
          role="switch"
          checked={inStock}
          onChange={(e) => update({ inStock: e.target.checked ? 'true' : '' })}
          className="peer sr-only"
        />
        <span className="relative h-6 w-11 shrink-0 rounded-full bg-surface-container-highest transition-colors peer-checked:bg-primary-fixed-dim peer-focus-visible:ring-2 peer-focus-visible:ring-primary-fixed-dim after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-on-surface after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-background" aria-hidden />
      </label>

      {activeCount > 0 && (
        <button onClick={onReset} className="text-sm font-semibold text-primary-fixed-dim hover:underline">
          {t.shop.resetFilters}
        </button>
      )}
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 text-xs font-bold uppercase tracking-wide text-on-surface-variant">{title}</legend>
      {children}
    </fieldset>
  )
}

// Eingabe in Euro, Filter in Cent; uebernommen bei Enter oder Verlassen des Felds
function PriceRange({ min, max, placeholderMin, placeholderMax, onChange }: {
  min: string
  max: string
  placeholderMin: string
  placeholderMax: string
  onChange: (min: string, max: string) => void
}) {
  const { t } = useTranslation()
  const toEuro = (cents: string) => (cents ? String(Number(cents) / 100) : '')
  const [lo, setLo] = useState(toEuro(min))
  const [hi, setHi] = useState(toEuro(max))

  const toCents = (euro: string) => {
    const n = Number(euro.replace(',', '.'))
    return euro.trim() && Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : ''
  }
  const commit = () => {
    const [a, b] = [toCents(lo), toCents(hi)]
    // vertauschte Grenzen still geraderuecken statt 0 Treffer zu zeigen
    const [x, y] = a && b && Number(a) > Number(b) ? [b, a] : [a, b]
    if (x !== min || y !== max) onChange(x, y)
  }
  const field = 'w-full rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:ring-2 focus:ring-primary-fixed-dim'

  return (
    <div className="flex items-center gap-2">
      <label className="flex-1">
        <span className="sr-only">{t.shop.priceFrom}</span>
        <input inputMode="decimal" value={lo} onChange={(e) => setLo(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={`${placeholderMin} €`} className={field} />
      </label>
      <span className="text-on-surface-variant">–</span>
      <label className="flex-1">
        <span className="sr-only">{t.shop.priceTo}</span>
        <input inputMode="decimal" value={hi} onChange={(e) => setHi(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={`${placeholderMax} €`} className={field} />
      </label>
    </div>
  )
}
