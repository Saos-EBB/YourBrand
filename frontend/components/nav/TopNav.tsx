'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, User } from 'lucide-react'
import { useAuthStore, selectUserRole } from '@/lib/store/authStore'
import { HiddenLogoButton, HiddenZoneControls } from './HiddenShortcut'
import { useTenant } from '@/components/TenantProvider'
import { useNavItems } from './navItems'
import { useNavLabel } from './useNavLabel'
import { StatusPicker } from './StatusPicker'
import { AdminBadge } from './AdminBadge'
import { NotificationBell } from './NotificationBell'
import { HelpButton } from '@/components/assist/HelpButton'

export default function TopNav() {
  const pathname = usePathname()
  const label    = useNavLabel()
  const role     = useAuthStore(selectUserRole)
  const isAdmin  = role === 'admin' || role === 'owner'
  // topbar-Mandanten: die Leiste ist auch am Desktop die Navigation
  const topbar   = useTenant().theme.layout.nav === 'topbar'
  // Benachrichtigungen haben oben die Glocke
  const links    = useNavItems('main').filter((l) => l.key !== 'notifications')

  return (
    <header className={`sticky top-0 z-50 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant ${topbar ? '' : 'md:hidden'}`}>
      <nav
        className={`mx-auto flex h-16 items-center px-4 ${topbar ? 'max-w-screen-xl md:px-6' : 'max-w-screen-lg'}`}
        aria-label="Main navigation"
      >
        <HiddenLogoButton />

        <ul className={`hidden md:flex items-center gap-1 ml-8 ${topbar ? 'flex-1 justify-center' : ''}`} role="list">
          {links.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-primary-fixed-dim text-on-primary-container'
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

          <HelpButton className="px-2.5 py-1.5" />
          {isAdmin ? <AdminBadge /> : <NotificationBell />}

          <Link
            href="/settings"
            aria-label={label('settings')}
            className="inline-flex p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <Settings size={20} aria-hidden />
          </Link>

          <Link
            href="/profile"
            aria-label={label('profile')}
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
