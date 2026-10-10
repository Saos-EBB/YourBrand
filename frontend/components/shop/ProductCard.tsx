'use client'

import Link from 'next/link'
import { KeyRound, Package, Pizza, Salad, Shirt, Sparkles, Star, Ticket, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { categoryLabel, formatPrice, type ShopFulfillment, type ShopProduct } from '@/lib/shop'

// Ohne Produktfotos: jede Kategorie bekommt Farbe + Icon, damit das Raster nicht grau wirkt.
// Unbekannte Kategorien fallen auf die Art zurueck.
const CATEGORY_LOOK: Record<string, [LucideIcon, string]> = {
  pizza: [Pizza, 'from-orange-400 to-rose-500'],
  bowls: [Salad, 'from-lime-400 to-emerald-600'],
  merch: [Shirt, 'from-sky-400 to-indigo-600'],
  software: [KeyRound, 'from-slate-500 to-slate-800'],
  'in-app': [Sparkles, 'from-fuchsia-400 to-violet-600'],
  gutscheine: [Ticket, 'from-amber-300 to-orange-500'],
}
const FULFILLMENT_LOOK: Record<ShopFulfillment, [LucideIcon, string]> = {
  food: [Pizza, 'from-orange-400 to-rose-500'],
  physical: [Package, 'from-sky-400 to-indigo-600'],
  license: [KeyRound, 'from-slate-500 to-slate-800'],
  unlock: [Sparkles, 'from-fuchsia-400 to-violet-600'],
}

export function ProductTile({ product, size = 'card' }: { product: Pick<ShopProduct, 'category' | 'fulfillment' | 'image_url' | 'title'>; size?: 'card' | 'hero' }) {
  const [Icon, gradient] = CATEGORY_LOOK[product.category] ?? FULFILLMENT_LOOK[product.fulfillment]
  const box = size === 'hero' ? 'aspect-[16/9] rounded-2xl' : 'aspect-[4/3] rounded-xl'
  if (product.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.image_url} alt="" className={`${box} w-full object-cover`} />
  }
  return (
    <div className={`${box} relative w-full overflow-hidden bg-gradient-to-br ${gradient}`} aria-hidden="true">
      <Icon className="absolute -right-4 -bottom-4 h-2/3 w-2/3 text-white/15 rotate-[-12deg]" strokeWidth={1.5} />
      <Icon className={`absolute left-4 top-4 text-white drop-shadow ${size === 'hero' ? 'h-14 w-14' : 'h-9 w-9'}`} strokeWidth={1.75} />
    </div>
  )
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i + 1))
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-outline-variant" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="text-amber-400" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        )
      })}
    </span>
  )
}

export function Rating({ avg, count }: { avg: number; count: number }) {
  const { t } = useTranslation()
  if (count === 0) return <span className="text-xs text-on-surface-variant">{t.shop.noRatings}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant" aria-label={t.shop.ratingAria.replace('{avg}', avg.toFixed(1)).replace('{n}', String(count))}>
      <Stars value={avg} />
      <span className="font-semibold text-on-surface">{avg.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  )
}

export function fulfillmentLabel(t: ReturnType<typeof useTranslation>['t'], f: ShopFulfillment): string {
  return { food: t.shop.kindFood, physical: t.shop.kindPhysical, license: t.shop.kindLicense, unlock: t.shop.kindUnlock }[f]
}

export function ProductCard({ product }: { product: ShopProduct }) {
  const { t, locale } = useTranslation()
  return (
    <Link
      href={`/shop/${product.id}`}
      className="group flex h-full flex-col gap-3 rounded-2xl bg-surface-container p-3 outline-none transition hover:-translate-y-0.5 hover:bg-surface-container-highest hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary-fixed-dim"
    >
      <div className={`relative ${product.in_stock ? '' : 'opacity-60 grayscale-[40%]'}`}>
        <ProductTile product={product} />
        <span className="absolute left-2 bottom-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
          {categoryLabel(product.category)}
        </span>
        {!product.in_stock && (
          <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-on-surface">
            {t.shop.soldOut}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface group-hover:underline decoration-primary-fixed-dim underline-offset-2">
          {product.title}
        </h3>
        <Rating avg={product.rating_avg} count={product.rating_count} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className={`text-lg font-bold ${product.in_stock ? 'text-on-surface' : 'text-on-surface-variant opacity-70'}`}>
            {formatPrice(product.price_cents, locale)}
          </span>
          <span className="text-[11px] text-on-surface-variant">{fulfillmentLabel(t, product.fulfillment)}</span>
        </div>
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-container p-3" aria-hidden="true">
      <div className="aspect-[4/3] rounded-xl bg-surface-container-high animate-pulse" />
      <div className="h-4 w-4/5 rounded bg-surface-container-high animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-surface-container-high animate-pulse" />
      <div className="h-6 w-1/3 rounded bg-surface-container-high animate-pulse" />
    </div>
  )
}
