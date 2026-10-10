'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { selectUserRole, useAuthStore } from '@/lib/store/authStore'
import { useModuleEnabled } from '@/components/TenantProvider'
import { useHydrated } from '@/components/shop/Cart'

const TABS = [
  { key: 'orders', href: '/admin/shop', label: 'Bestellungen' },
  { key: 'products', href: '/admin/shop/products', label: 'Artikel' },
] as const

// Rahmen fuer die Shop-Konsole: nur Admins/Owner, nur mit Modul, Tabs oben
export function AdminShopShell({ active, children }: { active: (typeof TABS)[number]['key']; children: React.ReactNode }) {
  const ready = useHydrated()
  const role = useAuthStore((s) => selectUserRole(s))
  const shopOn = useModuleEnabled('shop')
  const router = useRouter()
  const isAdmin = role === 'admin' || role === 'owner'

  useEffect(() => {
    if (ready && !isAdmin) router.replace('/dashboard')
  }, [ready, isAdmin, router])

  if (!ready || !isAdmin) return null
  if (!shopOn) return <p className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant">Das Modul Shop ist für diesen Mandanten aus.</p>

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-24 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={16} aria-hidden /> Admin
        </Link>
        <nav aria-label="Shop-Konsole" className="flex rounded-xl bg-surface-container-high p-1 gap-1">
          {TABS.map((tab) => (
            <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? 'page' : undefined}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${tab.key === active ? 'bg-on-surface text-background' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </main>
  )
}
