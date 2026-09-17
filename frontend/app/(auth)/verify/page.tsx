'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { fetchApi } from '@/lib/api'

type Status = 'loading' | 'success' | 'error'

function VerifyingFallback() {
  return (
    <div className="text-center space-y-4" aria-live="polite" aria-busy="true">
      <Loader2
        className="h-12 w-12 text-primary-fixed-dim animate-spin mx-auto"
        aria-hidden="true"
      />
      <p className="text-on-surface font-semibold">E-Mail wird bestätigt…</p>
    </div>
  )
}

// useSearchParams() zwingt die ganze Seite in einen Client-Side-Bailout beim
// Prerendern, wenn es nicht in <Suspense> steckt (siehe
// https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout) — der
// gesamte Seiteninhalt haengt hier vom Token ab, daher wandert er komplett in
// diese Komponente statt nur ein Teilstueck auszulagern.
function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    // Endpoint: GET /auth/verify?token=... (no auth required)
    fetchApi<unknown>(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  if (status === 'loading') {
    return <VerifyingFallback />
  }

  if (status === 'success') {
    return (
      <div className="text-center space-y-6" role="main">
        <CheckCircle
          className="h-14 w-14 text-primary-fixed-dim mx-auto"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-on-surface">
            E-Mail erfolgreich bestätigt
          </h1>
          <p className="text-sm text-on-surface-variant">
            Dein Konto ist jetzt aktiv. Du kannst dich jetzt anmelden.
          </p>
        </div>
        <Link
          href="/login"
          className="block w-full py-3 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm text-center min-h-[44px] hover:opacity-90 active:scale-95 transition-all"
        >
          Zum Login
        </Link>
      </div>
    )
  }

  return (
    <div className="text-center space-y-6" role="main">
      <XCircle
        className="h-14 w-14 text-error mx-auto"
        aria-hidden="true"
      />
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-on-surface">
          Link ungültig oder abgelaufen
        </h1>
        <p className="text-sm text-on-surface-variant">
          Bitte fordere eine neue Bestätigungs-E-Mail an oder melde dich erneut an.
        </p>
      </div>
      <Link
        href="/login"
        className="block w-full py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm text-center min-h-[44px] hover:bg-surface-container active:scale-95 transition-all"
      >
        Zurück zum Login
      </Link>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyingFallback />}>
      <VerifyContent />
    </Suspense>
  )
}
