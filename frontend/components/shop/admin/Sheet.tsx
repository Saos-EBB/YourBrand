'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// Panel fuer Admin-Dialoge: rechts auf dem Desktop, von unten auf dem Handy.
// Esc und Klick daneben schliessen; ueber BottomNav (z-50) und Demo-Banner (z-200).
export function Sheet({ title, onClose, children, footer, wide = false }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  // onClose kommt oft inline — ueber die Ref laeuft der Effekt nur einmal (Fokus bleibt stehen)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button[data-autofocus]')?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [])

  return (
    <div className="fixed inset-0 z-[210]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        className={`absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:rounded-none md:rounded-l-2xl ${wide ? 'md:w-[44rem]' : 'md:w-[30rem]'}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
          <button onClick={onClose} aria-label="Schließen" className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="border-t border-outline-variant px-5 py-4">{footer}</footer>}
      </div>
    </div>
  )
}

export const adminField = 'w-full rounded-lg bg-surface-container-high px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none focus:ring-2 focus:ring-primary-fixed-dim disabled:opacity-60'
export const adminLabel = 'block space-y-1.5 text-sm font-semibold text-on-surface'
export const adminHint = 'block text-xs font-normal text-on-surface-variant'
export const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-primary-fixed-dim px-4 py-2.5 text-sm font-bold text-on-primary-container hover:opacity-90 disabled:opacity-40'
export const secondaryBtn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-40'
