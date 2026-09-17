'use client'

import Link from 'next/link'
import { useAccessibilityStore } from '@/lib/store/accessibilityStore'
import TopNav from '@/components/nav/TopNav'
import BottomNav from '@/components/nav/BottomNav'
import { DesktopSidebar } from '@/components/nav/DesktopSidebar'
import AuthProvider from '@/components/AuthProvider'
import ToastNotification from '@/components/ui/ToastNotification'
import { HiddenEntryOverlay } from '@/components/HiddenEntryOverlay'
import { useTranslation } from '@/lib/i18n'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const fontSizeClass = useAccessibilityStore((s) => s.fontSizeClass)
  const highContrast  = useAccessibilityStore((s) => s.highContrast)

  return (
    <AuthProvider>
      <div className={`${fontSizeClass}${highContrast ? ' high-contrast' : ''} flex min-h-screen`}>
        <DesktopSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopNav />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <footer className="mb-16 md:mb-0 border-t border-outline-variant py-4 text-center text-xs text-on-surface-variant">
            © {process.env.NEXT_PUBLIC_COPYRIGHT_YEAR} {process.env.NEXT_PUBLIC_BRAND_NAME}{' '}
            <span aria-hidden="true">·</span>{' '}
            <Link href="/impressum" className="hover:text-on-surface transition-colors">{t.footer.impressum}</Link>{' '}
            <span aria-hidden="true">·</span>{' '}
            <Link href="/datenschutz" className="hover:text-on-surface transition-colors">{t.footer.datenschutz}</Link>{' '}
            <span aria-hidden="true">·</span>{' '}
            <Link href="/agb" className="hover:text-on-surface transition-colors">AGB</Link>
          </footer>
        </div>
        <BottomNav />
        <ToastNotification />
        <HiddenEntryOverlay />
      </div>
    </AuthProvider>
  )
}
