'use client'

import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'

// Fertige Antworten ueber dem Eingabefeld im Chat (theme.layout.assist):
// ein Tipp schickt die Antwort direkt ab.
export function QuickReplies({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const { assist } = useTenant().theme.layout
  if (!assist) return null
  const replies = [t.assist.quickYes, t.assist.quickNo, t.assist.quickLater, t.assist.quickThanks]
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pb-2" role="group" aria-label={t.assist.quickReplies}>
      {replies.map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onPick(r)}
          className="shrink-0 rounded-full border-2 border-on-surface px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-container disabled:opacity-50"
        >
          {r}
        </button>
      ))}
    </div>
  )
}
