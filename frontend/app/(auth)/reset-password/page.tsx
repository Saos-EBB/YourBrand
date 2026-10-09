'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { fetchApi } from '@/lib/api'

// Ziel des Links aus der Reset-Mail (mail.service.ts: /reset-password?token=...).
// Gleiche Regel wie ResetPasswordDto, damit Fehler schon vor dem Request auffallen.
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,64}$/

const inputClass =
  'w-full min-h-[52px] rounded-xl bg-surface-container px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim border border-outline-variant'

// useSearchParams() braucht eine Suspense-Grenze (siehe verify/page.tsx).
function ResetPasswordContent() {
  const token = useSearchParams().get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!PASSWORD_RULE.test(password)) {
      setError('Passwort braucht 8–64 Zeichen: Großbuchstabe, Kleinbuchstabe, Zahl, Sonderzeichen (@$!%*?&)')
      return
    }
    if (password !== confirm) {
      setError('Die Passwörter stimmen nicht überein')
      return
    }

    setLoading(true)
    try {
      await fetchApi('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zurücksetzen fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <p role="alert" className="text-sm text-error text-center">
        Der Link ist unvollständig. Bitte fordere einen neuen an.
      </p>
    )
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-on-surface-variant leading-relaxed text-center">
        Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-on-surface-variant">
          Neues Passwort
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-on-surface-variant">
          Passwort wiederholen
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-[52px] mt-2 rounded-xl bg-primary-fixed-dim font-semibold text-on-primary-container transition-opacity disabled:opacity-60"
      >
        {loading ? 'Wird gespeichert…' : 'Passwort speichern'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-on-surface mb-8 text-center">
        Neues Passwort
      </h1>

      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>

      <p className="mt-6 text-center text-sm text-on-surface-variant">
        <Link href="/login" className="text-primary-fixed-dim font-medium hover:underline">
          Zum Login
        </Link>
      </p>
    </>
  )
}
