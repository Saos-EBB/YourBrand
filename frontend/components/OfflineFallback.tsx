'use client'

import { useState, type FormEvent } from 'react'
import { WifiOff } from 'lucide-react'

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'kontakt@example.com'
const DEMO_VIDEO_URL = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? 'https://loom.com/share/placeholder'
const CONTACT_FORM_ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT

const MAILTO_SUBJECT = 'Anfrage zur Live-Demo'
const MAILTO_BODY = 'Hallo, ich haette gerne Zugang zur Live-Demo bzw. mehr Informationen.'
const MAILTO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(MAILTO_SUBJECT)}&body=${encodeURIComponent(MAILTO_BODY)}`

function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!CONTACT_FORM_ENDPOINT) return
    setStatus('sending')
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch(CONTACT_FORM_ENDPOINT, { method: 'POST', body: form })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return <p className="text-on-surface-variant text-sm" role="status">Danke, die Anfrage wurde verschickt.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3 text-left">
      <input
        name="name" type="text" required placeholder="Name"
        className="w-full px-4 py-2.5 rounded-full border border-outline-variant bg-surface text-on-surface text-sm"
      />
      <input
        name="email" type="email" required placeholder="E-Mail"
        className="w-full px-4 py-2.5 rounded-full border border-outline-variant bg-surface text-on-surface text-sm"
      />
      <textarea
        name="message" required placeholder="Nachricht" rows={3}
        className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant bg-surface text-on-surface text-sm resize-none"
      />
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
      >
        {status === 'sending' ? 'Wird gesendet…' : 'Anfrage senden'}
      </button>
      {status === 'error' && (
        <p className="text-error text-sm" role="alert">Senden fehlgeschlagen, bitte per Mail versuchen: {CONTACT_EMAIL}</p>
      )}
    </form>
  )
}

export function OfflineFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-container-high">
            <WifiOff className="h-10 w-10 text-error" aria-hidden="true" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-on-surface" role="status" aria-label="Demo aktuell offline">
            Aktuell offline
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Live-Demo läuft werktags ab ca. 06:00 Uhr, aktuell offline.
          </p>
          <p className="text-on-surface-variant text-xs">
            Betriebszeiten: Mo–Fr ab ca. 06:00 Uhr
          </p>
        </div>

        {CONTACT_FORM_ENDPOINT ? (
          <ContactForm />
        ) : (
          <a
            href={MAILTO_HREF}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 transition-all"
          >
            Anfrage senden
          </a>
        )}

        <div>
          <a
            href={DEMO_VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
          >
            Demo-Video ansehen
          </a>
        </div>
      </div>
    </div>
  )
}
