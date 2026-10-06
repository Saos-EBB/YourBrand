'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Compass, Heart, MessageCircle, Users, Shield, Swords, Settings, User, Bell, Palette, ChevronDown,
} from 'lucide-react'
import { useAuthStore, selectUserRole } from '@/lib/store/authStore'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { useNotificationStore } from '@/lib/store/notificationStore'
import { useTranslation } from '@/lib/i18n'
import { HiddenLogoButton, HiddenZoneControls } from './HiddenShortcut'
import { StatusPicker } from './StatusPicker'
import { AdminBadge } from './AdminBadge'
import { ColorPalettePanel } from '@/components/DevColorPalette'
import { useTenant } from '@/components/TenantProvider'
import { isRouteEnabled } from '@/lib/tenant/types'

const ROUTE_TYPES: Record<string, string[]> = {
  '/chat':          ['message'],
  '/notifications': ['match', 'system', 'ban', 'beef_request', 'beef_accepted', 'beef_won', 'beef_lost'],
  '/requests':      ['request'],
}

export function DesktopSidebar() {
  const pathname      = usePathname()
  const { t }         = useTranslation()
  const role          = useAuthStore(selectUserRole)
  const isAdmin       = role === 'admin' || role === 'owner'
  const isHidden          = useHiddenStore((s) => s.isHidden)
  const hasEverBeenHidden = useHiddenStore((s) => s.hasEverBeenHidden)
  const notifications = useNotificationStore((s) => s.notifications)
  const { modules }   = useTenant()

  const [colorsOpen, setColorsOpen] = useState(false)

  function badgeCount(href: string): number {
    const types = ROUTE_TYPES[href]
    if (!types) return 0
    return notifications.filter((n) => !n.is_read && types.includes(n.type)).length
  }

  const mainLinks = [
    { href: '/dashboard',     label: t.nav.home,          Icon: LayoutDashboard },
    { href: '/notifications', label: t.nav.notifications, Icon: Bell },
    { href: '/discover',      label: t.nav.discover,      Icon: Compass },
    { href: '/matches',       label: t.nav.matches,       Icon: Heart },
    { href: '/chat',          label: t.nav.chat,          Icon: MessageCircle },
    ...(isAdmin
      ? [{ href: '/admin',    label: t.nav.admin,          Icon: Shield }]
      : [{ href: '/requests', label: t.nav.requests,       Icon: Users }]
    ),
    ...(isHidden ? [{ href: '/beef', label: 'Beef', Icon: Swords }] : []),
  ].filter((l) => isRouteEnabled(l.href, modules))

  const bottomLinks = [
    { href: '/settings', label: t.nav.settings, Icon: Settings },
    { href: '/profile',  label: t.nav.profile,  Icon: User },
  ]

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 h-screen sticky top-0 border-r border-outline-variant"
      style={{ background: 'var(--color-surface-container-lowest)' }}
    >
      {/* Logo row */}
      <div className="h-16 flex items-center px-5 border-b border-outline-variant shrink-0">
        <HiddenLogoButton />
      </div>

      {/* Status + Coins row */}
      <div className="shrink-0 border-b border-outline-variant px-4 py-2 flex items-center gap-2">
        <StatusPicker />
        <HiddenZoneControls />
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto" aria-label="Desktop navigation">
        <div className="px-3 mb-1">
          <p className="text-[10px] uppercase tracking-widest font-semibold px-2 pb-1"
            style={{ color: 'var(--color-on-surface-variant)', opacity: 0.5 }}>
            Navigation
          </p>
        </div>
        {mainLinks.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const count  = badgeCount(href)
          return (
            <div key={href} className="px-3">
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors w-full relative ${
                  active
                    ? 'text-primary-fixed-dim'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                style={{
                  ...(active ? {
                    background: 'var(--color-surface-container)',
                    borderLeft: '2px solid var(--color-primary-fixed-dim)',
                    paddingLeft: '10px',
                  } : {}),
                  ...(count > 0 && !active ? {
                    boxShadow: '0 0 0 1px var(--color-nav-badge-glow)',
                  } : {}),
                }}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={17} aria-hidden strokeWidth={active ? 2.5 : 2} />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span
                    aria-label={`${count} ungelesen`}
                    className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                    style={{
                      background: 'var(--color-nav-badge-glow)',
                      color: 'var(--color-surface-container-lowest)',
                    }}
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="shrink-0 border-t border-outline-variant">

        {/* Colors accordion — visible once hidden zone was entered at least once */}
        {modules.hidden && (isHidden || hasEverBeenHidden) && (
          <div data-dev-palette className="border-b border-outline-variant">
            <button
              data-dev-palette
              onClick={() => setColorsOpen(v => !v)}
              className="w-full flex items-center gap-3 px-6 py-2 text-sm transition-colors text-on-surface-variant hover:text-on-surface"
            >
              <Palette size={16} aria-hidden />
              <span className="flex-1 text-left">Colors</span>
              <ChevronDown
                size={14}
                aria-hidden
                className="transition-transform duration-200"
                style={{ transform: colorsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
            {colorsOpen && (
              <div
                data-dev-palette
                className="px-4 pb-4 overflow-y-auto"
                style={{ maxHeight: '40vh' }}
              >
                <ColorPalettePanel />
              </div>
            )}
          </div>
        )}

        {/* Settings + Profile */}
        <div className="py-2 flex flex-col gap-0.5">
          {bottomLinks.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <div key={href} className="px-3">
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                    active ? 'text-primary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  style={active ? { background: 'var(--color-surface-container)' } : {}}
                >
                  <Icon size={16} aria-hidden />
                  <span>{label}</span>
                </Link>
              </div>
            )
          })}
        </div>

        {isAdmin && (
          <div className="border-t border-outline-variant px-4 py-3">
            <AdminBadge />
          </div>
        )}
      </div>
    </aside>
  )
}
