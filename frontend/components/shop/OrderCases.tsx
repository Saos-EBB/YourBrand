'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, MessageCircle } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { PROBLEM_REASONS, formatDate, type MyShopCase, type ProblemReason } from '@/lib/shop'

type T = ReturnType<typeof useTranslation>['t']

function reasonLabel(t: T, r: ProblemReason): string {
  return {
    not_received: t.shop.reasonNotReceived, wrong_item: t.shop.reasonWrongItem, damaged: t.shop.reasonDamaged,
    code_invalid: t.shop.reasonCodeInvalid, other: t.shop.reasonOther,
  }[r]
}

const field = 'w-full rounded-xl bg-surface-container-high px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none focus:ring-2 focus:ring-primary-fixed-dim'

// Problem melden + Verlauf auf der Bestellseite. Eine offene Meldung pro
// Bestellung: solange sie offen ist, schreibt man dort weiter.
export function OrderCases({ orderId }: { orderId: string }) {
  const { t } = useTranslation()
  const [cases, setCases] = useState<MyShopCase[] | null>(null)
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchApi<MyShopCase[]>(`/shop/orders/${orderId}/cases`)
      .then((c) => { if (!cancelled) setCases(c) })
      .catch(() => { if (!cancelled) setCases([]) })
    return () => { cancelled = true }
  }, [orderId, reload])

  if (!cases) return null
  const hasOpen = cases.some((c) => c.status !== 'resolved')

  return (
    <>
      {cases.map((c) => <CaseThread key={c.id} c={c} onChanged={() => setReload((n) => n + 1)} />)}
      {sent && <p className="text-sm font-semibold text-primary-fixed-dim" role="status">{t.shop.problemSent}</p>}
      {!hasOpen && (formOpen
        ? <ProblemForm orderId={orderId} onCancel={() => setFormOpen(false)} onSent={() => { setFormOpen(false); setSent(true); setReload((n) => n + 1) }} />
        : (
          <button onClick={() => { setFormOpen(true); setSent(false) }}
            className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
            <AlertCircle size={16} aria-hidden /> {t.shop.reportProblem}
          </button>
        ))}
    </>
  )
}

function ProblemForm({ orderId, onCancel, onSent }: { orderId: string; onCancel: () => void; onSent: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<ProblemReason | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason) return
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/shop/orders/${orderId}/cases`, { method: 'POST', body: JSON.stringify({ reason, message: message.trim() }) })
      onSent()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface-container p-5">
      <h2 className="font-semibold text-on-surface">{t.shop.reportProblem}</h2>
      <fieldset>
        <legend className="mb-2 text-sm text-on-surface-variant">{t.shop.problemQuestion}</legend>
        <div className="flex flex-wrap gap-2">
          {PROBLEM_REASONS.map((r) => (
            <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${reason === r ? 'border-on-surface bg-on-surface text-background' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'}`}>
              {reasonLabel(t, r)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="sr-only">{t.shop.problemPlaceholder}</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder={t.shop.problemPlaceholder} className={field} />
      </label>
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold text-on-surface">{t.shop.cancel}</button>
        <button type="submit" disabled={busy || !reason || message.trim().length < 10}
          className="flex-1 rounded-xl bg-primary-fixed-dim px-4 py-2.5 text-sm font-bold text-on-primary-container disabled:opacity-40">
          {busy ? '…' : t.shop.send}
        </button>
      </div>
    </form>
  )
}

function CaseThread({ c, onChanged }: { c: MyShopCase; onChanged: () => void }) {
  const { t, locale } = useTranslation()
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = { open: t.shop.caseOpen, waiting: t.shop.caseWaiting, resolved: t.shop.caseResolved }[c.status]

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/shop/cases/${c.id}/messages`, { method: 'POST', body: JSON.stringify({ body: reply.trim() }) })
      setReply('')
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-surface-container p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-on-surface">
          <MessageCircle size={18} aria-hidden /> {t.shop.caseTitle} · <span className="font-normal text-on-surface-variant">{reasonLabel(t, c.reason)}</span>
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.status === 'waiting' ? 'bg-primary-fixed-dim/15 text-primary-fixed-dim' : 'bg-surface-container-highest text-on-surface'}`}>{status}</span>
      </div>
      <ol className="space-y-2">
        {c.messages.map((m) => (
          <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? 'rounded-br-md bg-primary-fixed-dim/15 text-on-surface' : 'rounded-bl-md bg-surface-container-high text-on-surface'}`}>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className="mt-1 text-[11px] text-on-surface-variant">{m.mine ? t.shop.you : t.shop.shopTeam} · {formatDate(m.created_at, locale, true)}</p>
            </div>
          </li>
        ))}
      </ol>
      {c.status === 'resolved' ? (
        c.resolution && (
          <p className="flex items-start gap-2 rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary-fixed-dim" aria-hidden /> {t.shop.caseResolution.replace('{text}', c.resolution)}
          </p>
        )
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">{t.shop.replyPlaceholder}</span>
            <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder={t.shop.replyPlaceholder} className={field} />
          </label>
          <button type="submit" disabled={busy || !reply.trim()}
            className="rounded-xl bg-primary-fixed-dim px-4 py-2.5 text-sm font-bold text-on-primary-container disabled:opacity-40">{t.shop.send}</button>
        </form>
      )}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </section>
  )
}
