'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useShopCartStore } from '@/lib/store/shopCartStore'

// Ruecksprung von Stripe nach der Zahlung. Die Bestellung selbst zeigt erst
// die Bestelluebersicht (kommt mit GET /shop/orders) — hier nur die Quittung.
export default function ShopOrderPlacedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useTranslation()
  const clear = useShopCartStore((s) => s.clear)

  useEffect(() => { clear() }, [clear])

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 text-center space-y-5">
      <CheckCircle2 size={56} className="mx-auto text-primary-fixed-dim" aria-hidden />
      <h1 className="text-3xl text-on-surface">{t.shop.thanksTitle}</h1>
      <p className="text-on-surface-variant">{t.shop.thanksText}</p>
      <p className="text-xs text-on-surface-variant">{t.shop.orderNumber.replace('{id}', id.slice(0, 8).toUpperCase())}</p>
      <Link href="/shop" className="inline-block rounded-xl bg-primary-fixed-dim px-5 py-2.5 text-sm font-bold text-on-primary-container">
        {t.shop.continueShopping}
      </Link>
    </div>
  )
}
