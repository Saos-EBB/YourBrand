'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Volume2, Square } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'

const VOICE_LANG: Record<string, string> = {
  de: 'de-DE', de_easy: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', ru: 'ru-RU', ja: 'ja-JP', leet: 'en-GB',
}

// Vorlesen mit der Sprachausgabe des Browsers (Web Speech API), nur bei
// Mandanten mit theme.layout.assist. Ohne Unterstuetzung im Browser: nichts.
export function ReadAloud({ text, size = 'md' }: { text: string; size?: 'sm' | 'md' }) {
  const { t, locale } = useTranslation()
  const { assist } = useTenant().theme.layout
  const [speaking, setSpeaking] = useState(false)
  // Auf dem Server immer false, im Browser je nach Unterstuetzung
  const supported = useSyncExternalStore(
    () => () => {},
    () => 'speechSynthesis' in window,
    () => false,
  )

  useEffect(() => () => { if (speaking) window.speechSynthesis.cancel() }, [speaking])

  if (!assist || !supported) return null

  function toggle() {
    const synth = window.speechSynthesis
    if (speaking) { synth.cancel(); setSpeaking(false); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = VOICE_LANG[locale] ?? 'de-DE'
    u.rate = 0.9
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    synth.speak(u)
    setSpeaking(true)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-primary-fixed-dim font-bold text-primary-fixed-dim hover:bg-surface-container ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
      }`}
    >
      {speaking ? <Square size={size === 'sm' ? 14 : 16} aria-hidden /> : <Volume2 size={size === 'sm' ? 14 : 16} aria-hidden />}
      {speaking ? t.assist.stop : t.assist.readAloud}
    </button>
  )
}
