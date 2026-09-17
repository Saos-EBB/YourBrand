'use client'

import { useState } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await fetchApi('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full min-h-[52px] rounded-xl bg-surface-container px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim border border-outline-variant'

  return (
    <>
      <h1 className="text-2xl font-bold text-on-surface mb-8 text-center">
        Passwort vergessen
      </h1>

      {sent ? (
        <p role="status" className="text-sm text-on-surface-variant leading-relaxed text-center">
          Falls die E-Mail-Adresse registriert ist, wurde eine Mail mit einem Link zum
          Zurücksetzen verschickt.
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-on-surface-variant">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="name@beispiel.de"
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
            {loading ? 'Wird gesendet…' : 'Link anfordern'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-on-surface-variant">
        <Link href="/login" className="text-primary-fixed-dim font-medium hover:underline">
          Zurück zum Login
        </Link>
      </p>
    </>
  )
}
