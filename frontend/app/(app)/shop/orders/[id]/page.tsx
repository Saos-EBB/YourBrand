'use client'

import { Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle2, Copy, KeyRound, Ticket } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useShopCartStore } from '@/lib/store/shopCartStore'
import { OrderCases } from '@/components/shop/OrderCases'
import { ProgressTracker, TONE_BADGE, buyerStatus, redeemMessage } from '@/components/shop/OrderStatus'
import { formatDate, formatPrice, orderNumber, type MyShopOrderDetail, type RedeemResult } from '@/lib/shop'

// Solange sich noch etwas tut (Pruefung, Kueche, Versand), alle 15 s neu laden
const LIVE = ['pending', 'authorized', 'held', 'approved']
const POLL_MS = 15_000

export default function ShopOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <Suspense><Order id={id} /></Suspense>
}

function Order({ id }: { id: string }) {
  const { t, locale } = useTranslation()
  // ?placed=1 kommt nur vom Ruecksprung aus Stripe — dann Danke zeigen und Korb leeren
  const placed = useSearchParams().get('placed') === '1'
  const clear = useShopCartStore((s) => s.clear)
  const [order, setOrder] = useState<MyShopOrderDetail | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => { if (placed) clear() }, [placed, clear])

  const live = !order || LIVE.includes(order.status)
  useEffect(() => {
    let cancelled = false
    const load = () => fetchApi<MyShopOrderDetail>(`/shop/orders/${id}`)
      .then((d) => { if (!cancelled) { setOrder(d); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    load()
    const timer = live ? setInterval(load, POLL_MS) : undefined
    return () => { cancelled = true; clearInterval(timer) }
  }, [id, live, reload])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <Link href="/shop/orders" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.shop.myOrders}
      </Link>

      {placed && (
        <div className="flex items-start gap-3 rounded-2xl bg-primary-fixed-dim/10 p-4">
          <CheckCircle2 size={28} className="shrink-0 text-primary-fixed-dim" aria-hidden />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-on-surface">{t.shop.thanksTitle}</h1>
            <p className="text-sm text-on-surface-variant">{t.shop.thanksText}</p>
          </div>
        </div>
      )}

      {error && !order && <p className="text-sm text-error" role="alert">{error}</p>}
      {!order ? (
        !error && <div className="space-y-3" aria-hidden>{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-container" />)}</div>
      ) : (
        <Detail order={order} locale={locale} headline={!placed} onRedeemed={() => setReload((n) => n + 1)} />
      )}
      {/* Abgebrochene Kasse ist keine Bestellung — dazu gibt es nichts zu melden */}
      {order && !['pending', 'cancelled'].includes(order.status) && <OrderCases orderId={order.id} />}
      {order && (
        <Link href="/shop" className="inline-block text-sm font-semibold text-primary-fixed-dim hover:underline">{t.shop.continueShopping}</Link>
      )}
    </div>
  )
}

function Detail({ order, locale, headline, onRedeemed }: { order: MyShopOrderDetail; locale: string; headline: boolean; onRedeemed: () => void }) {
  const { t } = useTranslation()
  const st = buyerStatus(t, order)
  const showTracker = order.status === 'approved' || order.status === 'fulfilled'
  const digitalItems = order.items.filter((i) => i.fulfillment === 'license' || i.fulfillment === 'unlock')
  const Heading = headline ? 'h1' : 'h2'

  return (
    <>
      <section className="space-y-4 rounded-2xl bg-surface-container p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading className="text-sm text-on-surface-variant">
            {t.shop.orderNumber.replace('{id}', orderNumber(order.id))} · {formatDate(order.created_at, locale)}
          </Heading>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${TONE_BADGE[st.tone]}`} role="status">{st.label}</span>
        </div>
        {st.text && <p className="text-sm text-on-surface">{st.text}</p>}
        {showTracker && order.delivery_mode !== 'digital' && order.progress !== 'not_met' && (
          <ProgressTracker mode={order.delivery_mode} progress={order.status === 'fulfilled' ? 'delivered' : order.progress ?? 'accepted'} />
        )}
        {order.tracking_number && (
          <p className="text-sm text-on-surface-variant">{t.shop.trackingNumber}: <span className="font-mono text-on-surface">{order.tracking_number}</span></p>
        )}
      </section>

      {digitalItems.length > 0 && <Codes order={order} items={digitalItems} onRedeemed={onRedeemed} />}

      <section className="space-y-3 rounded-2xl bg-surface-container p-5">
        <h2 className="font-semibold text-on-surface">{t.shop.summary}</h2>
        <ul role="list" className="divide-y divide-outline-variant/50 text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-baseline gap-3 py-2">
              <span className="w-8 shrink-0 text-on-surface-variant">{i.quantity}×</span>
              {i.product_id
                ? <Link href={`/shop/${i.product_id}`} className="min-w-0 flex-1 truncate text-on-surface hover:underline">{i.title}</Link>
                : <span className="min-w-0 flex-1 truncate text-on-surface">{i.title}</span>}
              <span className="text-on-surface">{formatPrice(i.unit_price_cents * i.quantity, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-outline-variant pt-3 text-sm">
          {order.shipping_cents > 0 && (
            <>
              <div className="flex justify-between"><dt className="text-on-surface-variant">{t.shop.subtotal}</dt><dd className="text-on-surface">{formatPrice(order.items_cents, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-on-surface-variant">{t.shop.shipping}</dt><dd className="text-on-surface">{formatPrice(order.shipping_cents, locale)}</dd></div>
            </>
          )}
          <div className="flex justify-between font-bold text-on-surface"><dt>{t.shop.total}</dt><dd>{formatPrice(order.total_cents, locale)}</dd></div>
          {order.refunded_cents > 0 && (
            <div className="flex justify-between font-semibold text-primary-fixed-dim"><dt>{t.shop.refundedAmount}</dt><dd>−{formatPrice(order.refunded_cents, locale)}</dd></div>
          )}
          <p className="text-xs text-on-surface-variant">{t.shop.vatIncluded}</p>
        </dl>
      </section>

      {order.delivery_mode !== 'digital' && (
        <section className="space-y-2 rounded-2xl bg-surface-container p-5 text-sm">
          <h2 className="font-semibold text-on-surface">{t.shop.delivery}</h2>
          <p className="text-on-surface">{{ pickup: t.shop.modePickup, delivery: t.shop.modeDelivery, shipping: t.shop.modeShipping }[order.delivery_mode]}</p>
          {order.delivery_address && <p className="whitespace-pre-line text-on-surface-variant">{order.delivery_address}</p>}
          {order.desired_at && (
            <p className="text-on-surface-variant">
              {order.delivery_mode === 'pickup' ? t.shop.fieldPickupAt : t.shop.fieldDesiredAt}: <span className="text-on-surface">{formatDate(order.desired_at, locale, true)}</span>
            </p>
          )}
          {order.delivery_note && <p className="text-on-surface-variant">{t.shop.fieldNote}: <span className="text-on-surface">{order.delivery_note}</span></p>}
        </section>
      )}
    </>
  )
}

function Codes({ order, items, onRedeemed }: { order: MyShopOrderDetail; items: MyShopOrderDetail['items']; onRedeemed: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [result, setResult] = useState<{ code: string; ok: boolean; text: string } | null>(null)
  const any = items.some((i) => i.codes.length > 0)
  // Abgelehnt/abgelaufen: es kommen keine Codes mehr
  if (!any && !LIVE.includes(order.status)) return null

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000)
    } catch { /* Zwischenablage gesperrt — Code bleibt markierbar */ }
  }

  // Code fuer das eigene Konto einloesen (verschenken: Code kopieren)
  async function redeem(code: string) {
    setRedeeming(code)
    setResult(null)
    try {
      const r = await fetchApi<RedeemResult>('/shop/redeem', { method: 'POST', body: JSON.stringify({ code }) })
      setResult({ code, ok: true, text: redeemMessage(t, r) })
      onRedeemed()
    } catch (e) {
      setResult({ code, ok: false, text: (e as Error).message })
    } finally {
      setRedeeming(null)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-surface-container p-5">
      {!any ? (
        <p className="text-sm text-on-surface-variant">{t.shop.codesPending}</p>
      ) : (
        <>
          {items.map((i) => (
            <div key={i.id} className="space-y-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  {i.fulfillment === 'license' ? <KeyRound size={16} aria-hidden /> : <Ticket size={16} aria-hidden />}
                  {i.fulfillment === 'license' ? t.shop.codeLicense : t.shop.codeUnlock}
                </h2>
                <p className="truncate pl-6 text-xs text-on-surface-variant">{i.title}</p>
              </div>
              <ul role="list" className="space-y-2">
                {i.codes.map((c, n) => c.code && (
                  <li key={n} className="space-y-1.5">
                    <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-background px-3 py-2.5 ${c.redeemed_at ? 'opacity-60' : ''}`}>
                      <code className={`min-w-0 flex-1 select-all break-all font-mono text-base tracking-wider text-on-surface ${c.redeemed_at ? 'line-through' : ''}`}>{c.code}</code>
                      {c.redeemed_at ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant"><Check size={14} aria-hidden /> {t.shop.redeemedLabel}</span>
                      ) : (
                        <>
                          <button onClick={() => copy(c.code!)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high">
                            {copied === c.code ? <><Check size={14} aria-hidden /> {t.shop.copied}</> : <><Copy size={14} aria-hidden /> {t.shop.copy}</>}
                          </button>
                          {i.unlock_target && (
                            <button onClick={() => redeem(c.code!)} disabled={redeeming !== null}
                              className="inline-flex shrink-0 items-center rounded-lg bg-primary-fixed-dim px-3 py-1.5 text-xs font-bold text-on-primary-container disabled:opacity-40">
                              {redeeming === c.code ? '…' : t.shop.redeemNow}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {result?.code === c.code && (
                      <p className={`text-sm ${result.ok ? 'font-semibold text-primary-fixed-dim' : 'text-error'}`} role={result.ok ? 'status' : 'alert'}>{result.text}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-on-surface-variant">{t.shop.codesHint}</p>
        </>
      )}
    </section>
  )
}
