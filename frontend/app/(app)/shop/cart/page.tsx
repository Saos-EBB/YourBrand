'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart, Trash2 } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { ProductTile } from '@/components/shop/ProductCard'
import { QuantityStepper, groupLabel, useHydrated } from '@/components/shop/Cart'
import { useCartItems, useShopCartStore } from '@/lib/store/shopCartStore'
import { cartGroup, formatPrice, type ShopSettings } from '@/lib/shop'

export default function ShopCartPage() {
  const { t, locale } = useTranslation()
  const ready = useHydrated()
  const items = useCartItems()
  const setQuantity = useShopCartStore((s) => s.setQuantity)
  const remove = useShopCartStore((s) => s.remove)
  const [settings, setSettings] = useState<ShopSettings | null>(null)

  useEffect(() => { fetchApi<ShopSettings>('/shop/settings').then(setSettings).catch(() => {}) }, [])

  const group = items.length ? cartGroup(items[0].fulfillment) : null
  const subtotal = items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0)
  const shipping = group === 'physical' ? settings?.shipping_cents ?? null : 0

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link href="/shop" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.shop.continueShopping}
      </Link>
      <h1 className="text-3xl text-on-surface">{t.shop.cart}</h1>

      {!ready ? (
        <div className="h-40 rounded-2xl bg-surface-container animate-pulse" aria-hidden="true" />
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-surface-container py-16 text-center space-y-4">
          <ShoppingCart size={40} className="mx-auto text-on-surface-variant" aria-hidden />
          <p className="text-on-surface-variant">{t.shop.cartEmpty}</p>
          <Link href="/shop" className="inline-block rounded-xl bg-primary-fixed-dim px-5 py-2.5 text-sm font-bold text-on-primary-container">
            {t.shop.continueShopping}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_18rem] md:items-start">
          <section className="space-y-3">
            {group && <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{groupLabel(t, group)}</p>}
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.productId} className="flex gap-3 rounded-2xl bg-surface-container p-3">
                  <Link href={`/shop/${i.productId}`} className="w-20 shrink-0 sm:w-24">
                    <ProductTile product={{ ...i, image_url: null }} />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/shop/${i.productId}`} className="line-clamp-2 text-sm font-semibold text-on-surface hover:underline">{i.title}</Link>
                      <button onClick={() => remove(i.productId)} aria-label={t.shop.removeItem} className="rounded-lg p-1.5 text-on-surface-variant hover:text-error">
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <QuantityStepper value={i.quantity} onChange={(n) => setQuantity(i.productId, n)} label={t.shop.quantity} />
                      <div className="text-right">
                        <p className="font-bold text-on-surface">{formatPrice(i.price_cents * i.quantity, locale)}</p>
                        {i.quantity > 1 && <p className="text-xs text-on-surface-variant">{t.shop.each.replace('{price}', formatPrice(i.price_cents, locale))}</p>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="space-y-4 rounded-2xl bg-surface-container p-5 md:sticky md:top-20">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-on-surface-variant">{t.shop.subtotal}</dt><dd className="text-on-surface">{formatPrice(subtotal, locale)}</dd></div>
              {group === 'physical' && (
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">{t.shop.shipping}</dt>
                  <dd className="text-on-surface">{shipping === null ? '…' : formatPrice(shipping, locale)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-outline-variant pt-2 text-base font-bold">
                <dt className="text-on-surface">{t.shop.total}</dt>
                <dd className="text-on-surface">{shipping === null ? '…' : formatPrice(subtotal + shipping, locale)}</dd>
              </div>
            </dl>
            <p className="text-xs text-on-surface-variant">{t.shop.vatIncluded}</p>
            <Link href="/shop/checkout" className="block rounded-xl bg-primary-fixed-dim py-3 text-center text-sm font-bold text-on-primary-container hover:opacity-90">
              {t.shop.toCheckout}
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
