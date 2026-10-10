'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { ArrowLeft, Bike, Download, Lock, Package, Store } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useHydrated } from '@/components/shop/Cart'
import { useCartItems } from '@/lib/store/shopCartStore'
import { MODES_BY_GROUP, cartGroup, formatPrice, type ShopDeliveryMode, type ShopSettings } from '@/lib/shop'

type T = ReturnType<typeof useTranslation>['t']

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let stripePromise: Promise<Stripe | null> | null = null
// Erst laden, wenn wirklich bezahlt wird
const getStripe = () => (stripePromise ??= loadStripe(PUBLISHABLE_KEY!))

const MAX_DESIRED_DAYS = 7

// datetime-local arbeitet in Ortszeit ohne Zone
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function soonest(): Date {
  // In 45 min, auf die naechste Viertelstunde
  const d = new Date(Date.now() + 45 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

function modeInfo(t: T, m: ShopDeliveryMode): [typeof Bike, string] {
  return {
    pickup: [Store, t.shop.modePickup],
    delivery: [Bike, t.shop.modeDelivery],
    shipping: [Package, t.shop.modeShipping],
    digital: [Download, t.shop.modeDigital],
  }[m] as [typeof Bike, string]
}

export default function ShopCheckoutPage() {
  const { t, locale } = useTranslation()
  const ready = useHydrated()
  const items = useCartItems()
  const group = items.length ? cartGroup(items[0].fulfillment) : null
  const modes = group ? MODES_BY_GROUP[group] : []

  const [mode, setMode] = useState<ShopDeliveryMode | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [desiredAt, setDesiredAt] = useState(() => toLocalInput(soonest()))
  const [note, setNote] = useState('')
  const [waiver, setWaiver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<{ orderId: string; clientSecret: string } | null>(null)
  const [settings, setSettings] = useState<ShopSettings | null>(null)

  useEffect(() => { fetchApi<ShopSettings>('/shop/settings').then(setSettings).catch(() => {}) }, [])

  const activeMode = mode && modes.includes(mode) ? mode : modes[0] ?? null
  const subtotal = items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0)
  const shipping = activeMode === 'shipping' ? settings?.shipping_cents ?? 0 : 0
  const isFood = activeMode === 'pickup' || activeMode === 'delivery'
  const [bounds] = useState(() => ({ min: toLocalInput(new Date()), max: toLocalInput(new Date(Date.now() + MAX_DESIRED_DAYS * 86_400_000)) }))

  // Gleiche Pflichtangaben wie validateCart im Backend — hier nur fuer schnelle Rueckmeldung
  function missing(): string | null {
    if (activeMode === 'delivery' && address.trim().length < 5) return t.shop.fieldAddress
    if ((activeMode === 'delivery' || activeMode === 'pickup') && phone.trim().length < 5) return t.shop.fieldPhone
    if (activeMode === 'pickup' && name.trim().length < 2) return t.shop.fieldName
    if (activeMode === 'shipping' && address.trim().length < 5) return t.shop.fieldShippingAddress
    if (isFood && !desiredAt) return t.shop.fieldDesiredAt
    if (activeMode === 'digital' && !waiver) return t.shop.waiverLabel
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeMode) return
    const gap = missing()
    if (gap) { setError(t.shop.missingField.replace('{field}', gap)); return }
    if (!PUBLISHABLE_KEY) { setError(t.shop.paymentUnavailable); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetchApi<{ orderId: string; clientSecret: string }>('/shop/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          deliveryMode: activeMode,
          contactName: name.trim() && activeMode !== 'digital' ? name.trim() : undefined,
          contactPhone: phone.trim() && activeMode !== 'digital' ? phone.trim() : undefined,
          deliveryAddress: (activeMode === 'delivery' || activeMode === 'shipping') ? address.trim() : undefined,
          desiredAt: isFood ? new Date(desiredAt).toISOString() : undefined,
          deliveryNote: note.trim() && activeMode !== 'digital' ? note.trim() : undefined,
          withdrawalWaiver: activeMode === 'digital' ? true : undefined,
        }),
      })
      setSession(res)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fetchClientSecret = useCallback(async () => session!.clientSecret, [session])

  if (!ready) return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6"><div className="h-64 rounded-2xl bg-surface-container animate-pulse" aria-hidden /></div>

  if (items.length === 0 && !session) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <p className="text-on-surface-variant">{t.shop.cartEmpty}</p>
        <Link href="/shop" className="inline-block rounded-xl bg-primary-fixed-dim px-5 py-2.5 text-sm font-bold text-on-primary-container">{t.shop.continueShopping}</Link>
      </div>
    )
  }

  const field = 'w-full rounded-lg bg-surface-container-high px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary-fixed-dim'
  const labelCls = 'block space-y-1.5 text-sm font-semibold text-on-surface'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {session ? (
        <button onClick={() => setSession(null)} className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={16} aria-hidden /> {t.shop.editDetails}
        </button>
      ) : (
        <Link href="/shop/cart" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={16} aria-hidden /> {t.shop.backToCart}
        </Link>
      )}
      <h1 className="text-3xl text-on-surface">{t.shop.checkout}</h1>

      <div className="grid gap-6 md:grid-cols-[1fr_18rem] md:items-start">
        {session ? (
          <section className="overflow-hidden rounded-2xl bg-white">
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-6" noValidate>
            {modes.length > 1 && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">{t.shop.howToGet}</legend>
                <div className="grid grid-cols-2 gap-3">
                  {modes.map((m) => {
                    const [Icon, text] = modeInfo(t, m)
                    const active = activeMode === m
                    return (
                      <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${active ? 'border-primary-fixed-dim bg-surface-container-high' : 'border-outline-variant hover:border-outline'}`}>
                        <input type="radio" name="mode" value={m} checked={active} onChange={() => setMode(m)} className="sr-only" />
                        <Icon size={22} className={active ? 'text-primary-fixed-dim' : 'text-on-surface-variant'} aria-hidden />
                        <span className="text-sm font-semibold text-on-surface">{text}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}
            {modes.length === 1 && activeMode && (
              <div className="flex items-center gap-3 rounded-xl bg-surface-container p-4">
                {(() => { const [Icon, text] = modeInfo(t, activeMode); return <><Icon size={22} className="text-primary-fixed-dim" aria-hidden /><span className="text-sm font-semibold text-on-surface">{text}</span></> })()}
              </div>
            )}

            <div className="space-y-4">
              {(activeMode === 'pickup' || activeMode === 'delivery' || activeMode === 'shipping') && (
                <label className={labelCls}>
                  <span>{t.shop.fieldName}{activeMode !== 'pickup' && <span className="font-normal text-on-surface-variant"> ({t.shop.optional})</span>}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={200} className={field} />
                </label>
              )}
              {(activeMode === 'delivery' || activeMode === 'shipping') && (
                <label className={labelCls}>
                  <span>{activeMode === 'shipping' ? t.shop.fieldShippingAddress : t.shop.fieldAddress}</span>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" rows={3} maxLength={500}
                    placeholder={t.shop.addressPlaceholder} className={field} />
                </label>
              )}
              {(activeMode === 'pickup' || activeMode === 'delivery') && (
                <label className={labelCls}>
                  <span>{t.shop.fieldPhone}</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={40} className={field} />
                  <span className="block text-xs font-normal text-on-surface-variant">{t.shop.phoneHint}</span>
                </label>
              )}
              {isFood && (
                <label className={labelCls}>
                  <span>{activeMode === 'pickup' ? t.shop.fieldPickupAt : t.shop.fieldDesiredAt}</span>
                  <input type="datetime-local" value={desiredAt} min={bounds.min} max={bounds.max} step={900}
                    onChange={(e) => setDesiredAt(e.target.value)} className={field} />
                </label>
              )}
              {activeMode && activeMode !== 'digital' && (
                <label className={labelCls}>
                  <span>{t.shop.fieldNote} <span className="font-normal text-on-surface-variant">({t.shop.optional})</span></span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t.shop.notePlaceholder} className={field} />
                </label>
              )}
              {activeMode === 'digital' && (
                <label className="flex cursor-pointer gap-3 rounded-xl border border-outline-variant p-4 text-sm text-on-surface">
                  <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-fixed-dim)]" />
                  <span>{t.shop.waiverLabel}</span>
                </label>
              )}
            </div>

            {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}

            <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-fixed-dim py-3.5 text-sm font-bold text-on-primary-container hover:opacity-90 disabled:opacity-50">
              <Lock size={16} aria-hidden /> {busy ? t.shop.preparingPayment : t.shop.toPayment}
            </button>
            <p className="text-xs leading-relaxed text-on-surface-variant">{t.shop.offerNote}</p>
          </form>
        )}

        <aside className="space-y-3 rounded-2xl bg-surface-container p-5 md:sticky md:top-20">
          <h2 className="text-sm font-bold text-on-surface">{t.shop.summary}</h2>
          <ul className="space-y-2 text-sm">
            {items.map((i) => (
              <li key={i.productId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-on-surface-variant">{i.quantity} × {i.title}</span>
                <span className="shrink-0 text-on-surface">{formatPrice(i.price_cents * i.quantity, locale)}</span>
              </li>
            ))}
            {activeMode === 'shipping' && (
              <li className="flex justify-between gap-3">
                <span className="text-on-surface-variant">{t.shop.shipping}</span>
                <span className="text-on-surface">{formatPrice(shipping, locale)}</span>
              </li>
            )}
          </ul>
          <div className="flex justify-between border-t border-outline-variant pt-2 font-bold text-on-surface">
            <span>{t.shop.total}</span><span>{formatPrice(subtotal + shipping, locale)}</span>
          </div>
          <p className="text-xs text-on-surface-variant">{t.shop.vatIncluded}</p>
        </aside>
      </div>
    </div>
  )
}
