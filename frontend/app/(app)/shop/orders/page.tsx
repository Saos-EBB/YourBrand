'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { ProductTile } from '@/components/shop/ProductCard'
import { TONE_BADGE, buyerStatus } from '@/components/shop/OrderStatus'
import { formatDate, formatPrice, orderNumber, type MyShopOrderPage } from '@/lib/shop'

export default function MyOrdersPage() {
  const { t, locale } = useTranslation()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<MyShopOrderPage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchApi<MyShopOrderPage>(`/shop/orders?page=${page}`)
      .then((d) => { if (!cancelled) { setData(d); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [page])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <Link href="/shop" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.shop.continueShopping}
      </Link>
      <h1 className="text-3xl text-on-surface">{t.shop.myOrders}</h1>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      {!data ? (
        <div className="space-y-3" aria-hidden>{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-container" />)}</div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-container py-16 text-center">
          <Package size={40} className="text-on-surface-variant" aria-hidden />
          <p className="text-on-surface-variant">{t.shop.ordersEmpty}</p>
          <Link href="/shop" className="rounded-xl bg-primary-fixed-dim px-5 py-2.5 text-sm font-bold text-on-primary-container">{t.shop.continueShopping}</Link>
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {data.items.map((o) => {
            const st = buyerStatus(t, o)
            return (
              <li key={o.id}>
                <Link href={`/shop/orders/${o.id}`} className="flex items-center gap-4 rounded-2xl bg-surface-container p-3 hover:bg-surface-container-high">
                  <div className="w-20 shrink-0">
                    <ProductTile product={{ category: '', fulfillment: o.first_fulfillment ?? 'physical', image_url: null, title: '' }} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE_BADGE[st.tone]}`}>{st.label}</span>
                    <p className="truncate font-semibold text-on-surface">
                      {o.first_title}
                      {o.item_count > 1 && <span className="font-normal text-on-surface-variant"> {t.shop.moreItems.replace('{n}', String(o.item_count - 1))}</span>}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {t.shop.orderedOn.replace('{date}', formatDate(o.created_at, locale))} · #{orderNumber(o.id)}
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-on-surface">{formatPrice(o.total_cents, locale)}</p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {data && pages > 1 && (
        <nav className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label={t.shop.prev} className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30"><ChevronLeft size={18} aria-hidden /></button>
          <span className="text-sm text-on-surface-variant">{t.shop.page.replace('{page}', String(page)).replace('{pages}', String(pages))}</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label={t.shop.next} className="rounded-full bg-surface-container-high p-2 text-on-surface disabled:opacity-30"><ChevronRight size={18} aria-hidden /></button>
        </nav>
      )}
    </div>
  )
}
