'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Info } from 'lucide-react'

const STORAGE_KEY = 'xxx-demo-banner-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // localStorage nicht verfuegbar (privater Modus o.ae.) — Banner zeigt beim
    // naechsten Aufruf halt wieder, kein Crash.
  }
}

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(true)

  // Erst nach Mount lesen — localStorage ist serverseitig nicht verfuegbar,
  // ein SSR-Mismatch (Server rendert immer "nicht dismissed") waere sonst
  // ein Hydration-Fehler.
  useEffect(() => {
    // localStorage ist serverseitig nicht lesbar — die Korrektur muss nach
    // dem Mount passieren, sonst kein Hydration-Match moeglich.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed())
  }, [])

  if (dismissed) return null

  return (
    <div
      role="status"
      aria-label="Demo-Hinweis"
      className="sticky top-0 z-[200] flex items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2.5 text-sm text-on-surface"
    >
      <Info className="h-4 w-4 flex-shrink-0 text-tertiary-fixed-dim" aria-hidden="true" />
      <p className="flex-1 leading-snug">
        Demo-Version — keine echten Daten eingeben. Alle Daten werden bei jedem Neustart
        vollständig gelöscht (spätestens nach ca. 12 Stunden).{' '}
        <Link href="/datenschutz" className="underline underline-offset-2 hover:text-on-surface-variant">
          Mehr dazu
        </Link>
      </p>
      <button
        type="button"
        onClick={() => {
          writeDismissed()
          setDismissed(true)
        }}
        aria-label="Demo-Hinweis schließen"
        className="flex-shrink-0 rounded-full p-1 hover:bg-surface-container-highest transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
