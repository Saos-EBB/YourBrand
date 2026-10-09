'use client'

import { useTenant } from '@/components/TenantProvider'
import { useLanguageStore } from '@/lib/store/languageStore'
import { useTranslation } from '@/lib/i18n'
import { navLabel, type NavKey } from '@/lib/tenant/types'

// Name eines Menuepunkts mit Mandanten-Namen (theme.layout.labels), sonst
// der uebersetzte Standard.
export function useNavLabel(): (key: NavKey) => string {
  const { t } = useTranslation()
  const { layout } = useTenant().theme
  const lang = useLanguageStore((s) => s.uiLang)

  const defaults: Record<NavKey, string> = {
    dashboard: t.nav.home,
    notifications: t.nav.notifications,
    discover: t.nav.discover,
    matches: t.nav.matches,
    chat: t.nav.chat,
    requests: t.nav.requests,
    profile: t.nav.profile,
    settings: t.nav.settings,
    admin: t.nav.admin,
    beef: 'Beef',
    board: t.nav.board,
    care: t.nav.care,
    org: t.nav.org,
  }
  return (key) => navLabel(layout, key, lang, defaults[key])
}
