'use client'

import {
  LayoutDashboard, Bell, Compass, Heart, MessageCircle, Users, Shield, Swords, User, StickyNote, HeartHandshake, Building2, ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore, selectUserRole } from '@/lib/store/authStore'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { useTenant } from '@/components/TenantProvider'
import { isRouteEnabled, type NavKey } from '@/lib/tenant/types'
import { useNavLabel } from './useNavLabel'

export interface NavItem {
  key: NavKey
  href: string
  label: string
  Icon: LucideIcon
}

// Eine Liste fuer alle Navigationen, damit Sidebar, Topbar und Tabs unten
// dieselben Ziele und Namen zeigen. Abgeschaltete Module fallen raus.
//   main:   Sidebar / Topbar (ohne Einstellungen/Profil, die stehen extra)
//   bottom: Tabs unten am Handy, hoechstens 5 (+ Beef in der Hidden Zone)
export function useNavItems(placement: 'main' | 'bottom'): NavItem[] {
  const label = useNavLabel()
  const role = useAuthStore(selectUserRole)
  const isAdmin = role === 'admin' || role === 'owner'
  const isHidden = useHiddenStore((s) => s.isHidden)
  const { modules } = useTenant()

  const all: NavItem[] = [
    { key: 'dashboard', href: '/dashboard', label: label('dashboard'), Icon: LayoutDashboard },
    { key: 'notifications', href: '/notifications', label: label('notifications'), Icon: Bell },
    { key: 'board', href: '/board', label: label('board'), Icon: StickyNote },
    { key: 'shop', href: '/shop', label: label('shop'), Icon: ShoppingBag },
    { key: 'discover', href: '/discover', label: label('discover'), Icon: Compass },
    { key: 'matches', href: '/matches', label: label('matches'), Icon: Heart },
    { key: 'chat', href: '/chat', label: label('chat'), Icon: MessageCircle },
    isAdmin
      ? { key: 'admin', href: '/admin', label: label('admin'), Icon: Shield }
      : { key: 'requests', href: '/requests', label: label('requests'), Icon: Users },
    { key: 'care', href: '/care', label: label('care'), Icon: HeartHandshake },
    { key: 'org', href: '/org', label: label('org'), Icon: Building2 },
    ...(isHidden ? [{ key: 'beef' as const, href: '/beef', label: label('beef'), Icon: Swords }] : []),
  ]
  const enabled = all.filter((i) => isRouteEnabled(i.href, modules))
  if (placement === 'main') return enabled

  // Handy: Benachrichtigungen haben die Glocke oben, Betreuung/Organisation
  // erreicht man ueber Home. Mit Matching (Entdecken + Matches) ist kein
  // Platz fuer Anfragen/Admin — die liegen dann im Profil bzw. Dashboard.
  const skip = new Set<string>(['notifications', 'care', 'org'])
  if (modules.matching) { skip.add('requests'); skip.add('admin') }
  return [
    ...enabled.filter((i) => !skip.has(i.key)),
    { key: 'profile', href: '/profile', label: label('profile'), Icon: User },
  ]
}
