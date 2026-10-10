'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Ticket } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { redeemMessage } from '@/components/shop/OrderStatus'
import type { RedeemResult } from '@/lib/shop'

export default function RedeemPage() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await fetchApi<RedeemResult>('/shop/redeem', { method: 'POST', body: JSON.stringify({ code }) })
      setDone(redeemMessage(t, r))
      setCode('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-6 space-y-5">
      <Link href="/shop/orders" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.shop.myOrders}
      </Link>
      <div className="space-y-2 text-center">
        <Ticket size={40} className="mx-auto text-primary-fixed-dim" aria-hidden />
        <h1 className="text-3xl text-on-surface">{t.shop.redeemTitle}</h1>
        <p className="text-sm text-on-surface-variant">{t.shop.redeemText}</p>
      </div>

      {done && (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-primary-fixed-dim/10 p-4 font-semibold text-on-surface" role="status">
          <CheckCircle2 size={20} className="text-primary-fixed-dim" aria-hidden /> {done}
        </p>
      )}

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="sr-only">{t.shop.redeemTitle}</span>
          <input value={code} onChange={(e) => { setCode(e.target.value); setError(''); setDone(null) }}
            placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40}
            className="w-full rounded-xl bg-surface-container-high px-4 py-3.5 text-center font-mono text-lg tracking-widest text-on-surface uppercase placeholder:text-on-surface-variant/50 outline-none focus:ring-2 focus:ring-primary-fixed-dim" />
        </label>
        {error && <p className="text-center text-sm text-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || code.trim().length < 4}
          className="w-full rounded-xl bg-primary-fixed-dim px-5 py-3 text-sm font-bold text-on-primary-container disabled:opacity-40">
          {busy ? '…' : t.shop.redeemButton}
        </button>
      </form>
    </div>
  )
}
