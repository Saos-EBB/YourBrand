'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Minus, Plus, ShoppingCart } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { CART_MAX_QUANTITY, cartConflict, useCartItems, useShopCartStore } from '@/lib/store/shopCartStore'
import type { CartGroup, ShopProduct } from '@/lib/shop'

type T = ReturnType<typeof useTranslation>['t']

export function groupLabel(t: T, g: CartGroup): string {
  return { food: t.shop.groupFood, physical: t.shop.groupPhysical, digital: t.shop.groupDigital }[g]
}

// Der Korb liegt in localStorage — erst nach dem Mount lesen, sonst passt das
// Server-HTML nicht zum Client
export function useHydrated(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(id) }, [])
  return ready
}

export function CartButton() {
  const { t } = useTranslation()
  const items = useCartItems()
  const ready = useHydrated()
  const count = ready ? items.reduce((n, i) => n + i.quantity, 0) : 0
  return (
    <Link
      href="/shop/cart"
      aria-label={t.shop.cartAria.replace('{n}', String(count))}
      className="relative inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-highest"
    >
      <ShoppingCart size={18} aria-hidden />
      <span className="hidden sm:inline">{t.shop.cart}</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-primary-fixed-dim px-1.5 text-center text-xs font-bold leading-5 text-on-primary-container">
          {count}
        </span>
      )}
    </Link>
  )
}

export function QuantityStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn = 'grid h-9 w-9 place-items-center rounded-lg text-on-surface hover:bg-surface-container-highest disabled:opacity-30'
  return (
    <div className="inline-flex items-center rounded-xl bg-surface-container-high p-0.5" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="−">
        <Minus size={16} aria-hidden />
      </button>
      <span className="w-8 text-center text-sm font-bold tabular-nums text-on-surface" aria-live="polite">{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= CART_MAX_QUANTITY} aria-label="+">
        <Plus size={16} aria-hidden />
      </button>
    </div>
  )
}

export function AddToCart({ product }: { product: ShopProduct }) {
  const { t } = useTranslation()
  const items = useCartItems()
  const add = useShopCartStore((s) => s.add)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [confirm, setConfirm] = useState(false)

  if (!product.in_stock) {
    return <button disabled className="w-full rounded-xl bg-surface-container-high py-3 text-sm font-bold text-on-surface-variant">{t.shop.soldOut}</button>
  }

  const conflict = cartConflict(items, product)
  function put() {
    add(product, quantity)
    setConfirm(false)
    setAdded(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <QuantityStepper value={quantity} onChange={(n) => { setQuantity(n); setAdded(false) }} label={t.shop.quantity} />
        <button
          onClick={() => (conflict ? setConfirm(true) : put())}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary-fixed-dim py-3 text-sm font-bold text-on-primary-container transition active:scale-[0.98] hover:opacity-90"
        >
          {added ? <Check size={18} aria-hidden /> : <ShoppingCart size={18} aria-hidden />}
          {added ? t.shop.added : t.shop.addToCart}
        </button>
      </div>
      {confirm && conflict && (
        <div className="space-y-3 rounded-xl border border-outline-variant p-3 text-sm" role="alertdialog" aria-label={t.shop.conflictTitle}>
          <p className="text-on-surface">{t.shop.conflictText.replace('{group}', groupLabel(t, conflict))}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={put} className="rounded-lg bg-on-surface px-3 py-2 text-xs font-bold text-background">{t.shop.conflictReplace}</button>
            <Link href="/shop/cart" className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface">{t.shop.conflictKeep}</Link>
          </div>
        </div>
      )}
      {added && (
        <Link href="/shop/cart" className="inline-block text-sm font-semibold text-primary-fixed-dim hover:underline">
          {t.shop.toCart} →
        </Link>
      )}
    </div>
  )
}
