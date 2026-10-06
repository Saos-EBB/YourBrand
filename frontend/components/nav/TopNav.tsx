'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, User } from 'lucide-react'
import { useAuthStore, selectUserRole } from '@/lib/store/authStore'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { useTranslation } from '@/lib/i18n'
import { HiddenLogoButton, HiddenZoneControls } from './HiddenShortcut'
import { useTenant } from '@/components/TenantProvider'
import { isRouteEnabled } from '@/lib/tenant/types'
import { StatusPicker } from './StatusPicker'
import { AdminBadge } from './AdminBadge'
import { NotificationBell } from './NotificationBell'

export default function TopNav() {
  const pathname = usePathname()
  const { t }    = useTranslation()
  const { modules } = useTenant()

  const role = useAuthStore(selectUserRole)
  const isAdmin     = role === 'admin' || role === 'owner'
  const isHidden    = useHiddenStore((s) => s.isHidden)

  const navLinks = [
    { href: '/dashboard', label: t.nav.home },
    { href: '/discover',  label: t.nav.discover },
    { href: '/requests',  label: t.nav.requests },
    { href: '/chat',      label: t.nav.chat },
  ]

  const baseNavLinks = isAdmin
    ? navLinks.map((l) => l.href === '/requests' ? { href: '/admin', label: t.nav.admin } : l)
    : navLinks
  const activeNavLinks = (isHidden
    ? [...baseNavLinks, { href: '/beef', label: 'Beef' }]
    : baseNavLinks
  ).filter((l) => isRouteEnabled(l.href, modules))

  return (
    <header className="sticky top-0 z-50 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant md:hidden">
      <nav
        className="mx-auto flex h-16 max-w-screen-lg items-center px-4"
        aria-label="Main navigation"
      >
        <HiddenLogoButton />

        <ul className="hidden md:flex items-center gap-1 ml-8" role="list">
          {activeNavLinks.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-primary-fixed-dim'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex-1 sm:flex-none sm:ml-auto flex items-center justify-evenly sm:justify-start gap-0 sm:gap-2">
          <StatusPicker />

          {isAdmin ? <AdminBadge /> : <NotificationBell />}

          <Link
            href="/settings"
            aria-label={t.nav.settings}
            className="inline-flex p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <Settings size={20} aria-hidden />
          </Link>

          <Link
            href="/profile"
            aria-label={t.nav.profile}
            className="hidden md:inline-flex p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <User size={20} aria-hidden />
          </Link>

          <HiddenZoneControls />
        </div>
      </nav>
    </header>
  )
}
