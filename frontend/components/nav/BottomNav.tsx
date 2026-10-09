'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/components/TenantProvider'
import { useNavItems } from './navItems'

export default function BottomNav() {
  const pathname = usePathname()
  const items = useNavItems('bottom')
  // Miteinander (wide-sidebar): grosse Felder, aktiver Tab gefuellt
  const large = useTenant().theme.layout.nav === 'wide-sidebar'

  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container-low/90 backdrop-blur-md rounded-t-2xl border-t ${
        large ? 'border-on-surface border-t-2' : 'border-outline-variant'
      }`}
      aria-label="Bottom navigation"
    >
      <ul className={`flex items-center justify-around px-1 ${large ? 'h-20' : 'h-16'}`} role="list">
        {items.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors ${
                  large
                    ? isActive ? 'bg-primary-fixed-dim text-on-primary-container px-3 py-2' : 'text-on-surface px-3 py-2'
                    : isActive ? 'text-primary-fixed-dim' : 'text-on-surface-variant'
                }`}
              >
                <Icon size={large ? 26 : 22} fill={isActive && !large ? 'currentColor' : 'none'} aria-hidden />
                <span className={large ? 'text-xs font-bold' : 'text-[9px] font-medium'}>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
