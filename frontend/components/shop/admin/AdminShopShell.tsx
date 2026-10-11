'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { selectUserRole, useAuthStore } from '@/lib/store/authStore'
import { useModuleEnabled } from '@/components/TenantProvider'
import { useHydrated } from '@/components/shop/Cart'
import { fetchApi } from '@/lib/api'
import { useNotificationStore } from '@/lib/store/notificationStore'
import type { ShopAttention } from '@/lib/shop'

const TABS = [
  { key: 'orders', href: '/admin/shop', label: 'Bestellungen' },
  { key: 'cases', href: '/admin/shop/cases', label: 'Fälle' },
  { key: 'products', href: '/admin/shop/products', label: 'Artikel' },
] as const

// Rahmen fuer die Shop-Konsole: nur Admins/Owner, nur mit Modul, Tabs oben
export function AdminShopShell({ active, children }: { active: (typeof TABS)[number]['key']; children: React.ReactNode }) {
  const ready = useHydrated()
  const role = useAuthStore((s) => selectUserRole(s))
  const shopOn = useModuleEnabled('shop')
  const router = useRouter()
  const isAdmin = role === 'admin' || role === 'owner'
  const tick = useNotificationStore((s) => s.shopAlertTick)
  const [attention, setAttention] = useState<ShopAttention | null>(null)

  useEffect(() => {
    if (ready && !isAdmin) router.replace('/dashboard')
  }, [ready, isAdmin, router])

  // Zaehler an den Tabs; Seitenwechsel und Shop-Alarm laden neu
  useEffect(() => {
    if (!ready || !isAdmin || !shopOn) return
    let cancelled = false
    fetchApi<ShopAttention>('/admin/shop/attention')
      .then((a) => { if (!cancelled) setAttention(a) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ready, isAdmin, shopOn, tick, active])

  if (!ready || !isAdmin) return null
  if (!shopOn) return <p className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant">Das Modul Shop ist für diesen Mandanten aus.</p>

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-24 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={16} aria-hidden /> Admin
        </Link>
        <nav aria-label="Shop-Konsole" className="flex rounded-xl bg-surface-container-high p-1 gap-1">
          {TABS.map((tab) => {
            const n = tab.key === 'orders' ? attention?.held ?? 0 : tab.key === 'cases' ? attention?.cases_open ?? 0 : 0
            const urgent = tab.key === 'cases' && (attention?.urgent ?? 0) > 0
            return (
              <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? 'page' : undefined}
                aria-label={n > 0 ? `${tab.label}, ${n} offen${urgent ? ', davon dringend' : ''}` : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${tab.key === active ? 'bg-on-surface text-background' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {tab.label}
                {n > 0 && (
                  <span aria-hidden className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 ${urgent || tab.key === 'orders' ? 'bg-error text-background' : 'bg-surface-container-highest text-on-surface'}`}>
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>
      {children}
    </main>
  )
}
