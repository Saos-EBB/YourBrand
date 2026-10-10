'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bike, Download, Package, Star } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { ProductTile, Rating, Stars, fulfillmentLabel } from '@/components/shop/ProductCard'
import { categoryLabel, formatPrice, type ShopFulfillment, type ShopProductDetail } from '@/lib/shop'

type T = ReturnType<typeof useTranslation>['t']

function deliveryHint(t: T, f: ShopFulfillment): [typeof Bike, string] {
  return {
    food: [Bike, t.shop.deliveryFood],
    physical: [Package, t.shop.deliveryPhysical],
    license: [Download, t.shop.deliveryLicense],
    unlock: [Download, t.shop.deliveryUnlock],
  }[f] as [typeof Bike, string]
}

export default function ShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [product, setProduct] = useState<ShopProductDetail | null>(null)
  const [error, setError] = useState('')

  const load = () => fetchApi<ShopProductDetail>(`/shop/products/${id}`).then(setProduct).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zurueck zur Liste mit denselben Filtern, falls wir von dort kommen
  const back = () => (window.history.length > 1 ? router.back() : router.push('/shop'))

  if (error) return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6"><p className="text-sm text-error" role="alert">{error}</p></div>

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <button onClick={back} className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.shop.back}
      </button>

      {!product ? (
        <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
          <div className="aspect-[16/9] rounded-2xl bg-surface-container animate-pulse" />
          <div className="space-y-3">
            <div className="h-8 w-3/4 rounded bg-surface-container animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-surface-container animate-pulse" />
            <div className="h-10 w-1/4 rounded bg-surface-container animate-pulse" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <ProductTile product={product} size="hero" />
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  {categoryLabel(product.category)} · {fulfillmentLabel(t, product.fulfillment)}
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold leading-tight text-on-surface">{product.title}</h1>
                <a href="#reviews" className="inline-block hover:opacity-80"><Rating avg={product.rating_avg} count={product.rating_count} /></a>
              </div>
              <div>
                <p className="text-3xl font-bold text-on-surface">{formatPrice(product.price_cents, locale)}</p>
                <p className="text-xs text-on-surface-variant">{t.shop.inclVat.replace('{rate}', String(product.vat_rate))}</p>
              </div>
              <DeliveryHint t={t} product={product} />
              {product.description && <p className="text-sm leading-relaxed text-on-surface-variant">{product.description}</p>}
            </div>
          </div>

          <Reviews product={product} onSaved={load} />
        </>
      )}
    </div>
  )
}

function DeliveryHint({ t, product }: { t: T; product: ShopProductDetail }) {
  const [Icon, text] = deliveryHint(t, product.fulfillment)
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-container p-3">
      <Icon size={20} className="shrink-0 text-primary-fixed-dim" aria-hidden />
      <div className="text-sm">
        <p className="text-on-surface">{text}</p>
        <p className={`text-xs font-semibold ${product.in_stock ? 'text-primary-fixed-dim' : 'text-error'}`}>
          {product.in_stock ? t.shop.available : t.shop.soldOut}
        </p>
      </div>
    </div>
  )
}

function Reviews({ product, onSaved }: { product: ShopProductDetail; onSaved: () => void }) {
  const { t, locale } = useTranslation()
  const mine = product.reviews.find((r) => r.mine)
  const dateFmt = new Intl.DateTimeFormat(locale === 'de_easy' || locale === 'leet' ? 'de' : locale, { dateStyle: 'medium' })

  // Verteilung 5..1 fuer die Balken
  const dist = [5, 4, 3, 2, 1].map((s) => product.reviews.filter((r) => r.rating === s).length)
  const shown = product.reviews.length

  return (
    <section id="reviews" className="space-y-5 scroll-mt-20">
      <h2 className="text-xl font-semibold text-on-surface">{t.shop.reviews}</h2>

      {shown > 0 && (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center rounded-2xl bg-surface-container p-5">
          <div className="text-center sm:px-4">
            <p className="text-4xl font-bold text-on-surface">{product.rating_avg.toFixed(1)}</p>
            <Stars value={product.rating_avg} size={16} />
            <p className="text-xs text-on-surface-variant">{t.shop.ratingCount.replace('{n}', String(product.rating_count))}</p>
          </div>
          <ul className="space-y-1.5" aria-hidden="true">
            {dist.map((n, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="w-3 text-right">{5 - i}</span>
                <Star size={11} className="text-amber-400" fill="currentColor" strokeWidth={0} />
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(n / shown) * 100}%` }} />
                </span>
                <span className="w-6 text-right">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {product.can_review ? (
        <ReviewForm productId={product.id} initial={mine} onSaved={onSaved} />
      ) : (
        <p className="text-sm text-on-surface-variant">{t.shop.reviewOnlyBuyers}</p>
      )}

      {shown === 0 ? (
        <p className="rounded-2xl bg-surface-container py-10 text-center text-sm text-on-surface-variant">{t.shop.reviewsNone}</p>
      ) : (
        <ul className="divide-y divide-outline-variant/50">
          {product.reviews.map((r, i) => (
            <li key={i} className="py-4 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="text-sm font-semibold text-on-surface">{r.mine ? t.shop.you : (r.nickname ?? t.shop.anonymous)}</span>
                <span className="text-xs text-on-surface-variant">{dateFmt.format(new Date(r.created_at))}</span>
              </div>
              {r.body && <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-line">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ReviewForm({ productId, initial, onSaved }: { productId: string; initial?: { rating: number; body: string | null }; onSaved: () => void }) {
  const { t } = useTranslation()
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState(initial?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!rating) return
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/shop/products/${productId}/reviews`, { method: 'POST', body: JSON.stringify({ rating, body: body.trim() || undefined }) })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-outline-variant p-4">
      <p className="text-sm font-semibold text-on-surface">{initial ? t.shop.reviewYours : t.shop.reviewWrite}</p>
      <div role="radiogroup" aria-label={t.shop.rating} className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={rating === s}
            aria-label={`${s}`}
            onClick={() => { setRating(s); setSaved(false) }}
            onMouseEnter={() => setHover(s)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star size={28} className={(hover || rating) >= s ? 'text-amber-400' : 'text-outline-variant'} fill="currentColor" strokeWidth={0} />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => { setBody(e.target.value); setSaved(false) }}
        maxLength={1000}
        rows={3}
        placeholder={t.shop.reviewBodyPlaceholder}
        className="w-full rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary-fixed-dim"
      />
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!rating || busy}
          className="rounded-lg bg-primary-fixed-dim px-4 py-2 text-sm font-bold text-on-primary-container disabled:opacity-40"
        >
          {t.shop.reviewSend}
        </button>
        {saved && <span className="text-sm text-primary-fixed-dim" role="status">{t.shop.reviewSaved}</span>}
      </div>
    </form>
  )
}
