'use client'

import Link from 'next/link'
import { Check, Package } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { PROGRESS_FLOW, type PhysicalMode, type ShopDeliveryMode, type ShopOrderStatus, type ShopProgress } from '@/lib/shop'

type T = ReturnType<typeof useTranslation>['t']
export type Tone = 'wait' | 'ok' | 'bad'

export function progressLabel(t: T, p: ShopProgress, mode: ShopDeliveryMode): string {
  if (p === 'delivered' && mode === 'pickup') return t.shop.stPickedUp
  return {
    accepted: t.shop.stAccepted, preparing: t.shop.stPreparing, ready: t.shop.stReady, on_the_way: t.shop.stOnTheWay,
    shipped: t.shop.stShipped, delivered: t.shop.stDelivered, not_met: t.shop.stNotMet,
  }[p]
}

// Was der Kaeufer sieht: Annahme-Pruefung ist "wird geprueft", Interna bleiben intern
export function buyerStatus(t: T, o: { status: ShopOrderStatus; progress: ShopProgress | null; delivery_mode: ShopDeliveryMode }):
  { label: string; text?: string; tone: Tone } {
  switch (o.status) {
    case 'pending': return { label: t.shop.stPaying, text: t.shop.stPayingText, tone: 'wait' }
    case 'authorized':
    case 'held': return { label: t.shop.stReview, text: t.shop.stReviewText, tone: 'wait' }
    case 'rejected':
    case 'cancelled': return { label: t.shop.stRejected, text: t.shop.stRejectedText, tone: 'bad' }
    case 'expired': return { label: t.shop.stExpired, text: t.shop.stExpiredText, tone: 'bad' }
    case 'refunded': return { label: t.shop.stRefunded, tone: 'bad' }
    case 'partially_refunded': return { label: t.shop.stPartiallyRefunded, tone: 'ok' }
    case 'fulfilled':
      return { label: o.delivery_mode === 'digital' ? t.shop.stDigitalReady : progressLabel(t, 'delivered', o.delivery_mode), tone: 'ok' }
    case 'approved':
      if (o.progress === 'not_met') return { label: t.shop.stNotMet, text: t.shop.stNotMetText, tone: 'bad' }
      return { label: progressLabel(t, o.progress ?? 'accepted', o.delivery_mode), tone: 'ok' }
  }
}

export const TONE_BADGE: Record<Tone, string> = {
  wait: 'bg-surface-container-highest text-on-surface',
  ok: 'bg-primary-fixed-dim/15 text-primary-fixed-dim',
  bad: 'bg-error-container/50 text-error',
}

// Schritte als Leiste: erledigt, aktuell, kommt noch
export function ProgressTracker({ mode, progress }: { mode: PhysicalMode; progress: ShopProgress }) {
  const { t } = useTranslation()
  const flow = PROGRESS_FLOW[mode]
  const at = flow.indexOf(progress)
  return (
    <ol className="flex items-start" aria-label={t.shop.delivery}>
      {flow.map((step, i) => {
        const done = i <= at
        return (
          <li key={step} className="relative flex flex-1 flex-col items-center gap-1.5 text-center" aria-current={i === at ? 'step' : undefined}>
            {i > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${i <= at ? 'bg-primary-fixed-dim' : 'bg-surface-container-highest'}`} aria-hidden />}
            <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ${done ? 'bg-primary-fixed-dim text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'} ${i === at ? 'ring-4 ring-primary-fixed-dim/25' : ''}`}>
              {done ? <Check size={15} strokeWidth={3} aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
            </span>
            <span className={`px-1 text-[11px] leading-tight ${i === at ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>{progressLabel(t, step, mode)}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function OrdersButton() {
  const { t } = useTranslation()
  return (
    <Link href="/shop/orders" aria-label={t.shop.myOrders}
      className="inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-highest">
      <Package size={18} aria-hidden />
      <span className="hidden sm:inline">{t.shop.myOrders}</span>
    </Link>
  )
}
