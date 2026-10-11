'use client'

import { useEffect, useState } from 'react'
import { Clock, Lock } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import {
  CASE_KIND_LABEL, CASE_REASON_LABEL, CASE_STATUS_LABEL, DELIVERY_MODE_LABEL, formatPrice, orderNumber,
  type AdminShopCaseDetail,
} from '@/lib/shop'
import { Sheet, adminField, primaryBtn, secondaryBtn } from './Sheet'
import { formatDateTime, timeLeft, useNow } from './time'

// Meldungen gegen Kaeufer haben kein Gegenueber — dort ist alles intern
const INTERNAL_ONLY = ['report', 'not_met']

export function CaseSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (message: string) => void }) {
  const [detail, setDetail] = useState<AdminShopCaseDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<'reply' | 'resolve'>('reply')
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = useNow()

  useEffect(() => {
    let cancelled = false
    fetchApi<AdminShopCaseDetail>(`/admin/shop/cases/${id}`)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [id, reload])

  const c = detail?.id === id ? detail : null
  const internalOnly = c ? INTERNAL_ONLY.includes(c.kind) : false

  async function submit() {
    setBusy(true)
    setError('')
    try {
      if (mode === 'resolve') {
        await fetchApi(`/admin/shop/cases/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: text.trim() }) })
        onChanged('Fall abgeschlossen')
      } else {
        await fetchApi(`/admin/shop/cases/${id}/messages`, { method: 'POST', body: JSON.stringify({ body: text.trim(), internal }) })
        onChanged(internal || internalOnly ? 'Notiz gespeichert' : 'Antwort gesendet — wartet auf Käufer')
      }
      setText('')
      setMode('reply')
      setReload((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const footer = !c || c.status === 'resolved' ? undefined : (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
      {mode === 'reply' ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
            placeholder={internalOnly || internal ? 'Interne Notiz (nur fürs Team)' : 'Antwort an den Käufer'} className={adminField} />
          <div className="flex flex-wrap items-center gap-3">
            {!internalOnly && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-on-surface">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary-fixed-dim)]" />
                Nur intern
              </label>
            )}
            <div className="ml-auto flex gap-3">
              <button onClick={() => { setMode('resolve'); setText(''); setError('') }} className={secondaryBtn}>Abschließen …</button>
              <button onClick={submit} disabled={busy || !text.trim()} className={primaryBtn}>{busy ? 'Sendet …' : internalOnly || internal ? 'Notiz speichern' : 'Senden'}</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Ergebnis, z. B. Ersatz verschickt (Pflicht)" className={adminField} />
          {!internalOnly && <p className="text-xs text-on-surface-variant">Der Käufer sieht das Ergebnis in seiner Meldung.</p>}
          <div className="flex gap-3">
            <button onClick={() => { setMode('reply'); setText(''); setError('') }} disabled={busy} className={`${secondaryBtn} flex-1`}>Zurück</button>
            <button onClick={submit} disabled={busy || text.trim().length < 5} className={`${primaryBtn} flex-1`}>{busy ? 'Speichert …' : 'Fall abschließen'}</button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <Sheet title={c ? `${CASE_KIND_LABEL[c.kind]} · ${CASE_REASON_LABEL[c.reason] ?? c.reason}` : 'Fall'} wide onClose={onClose} footer={footer}>
      {!c ? (
        loadError
          ? <p className="text-sm text-error" role="alert">{loadError}</p>
          : <div className="space-y-3" aria-hidden>{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container" />)}</div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container p-4 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.status === 'resolved' ? 'bg-primary-fixed-dim/15 text-primary-fixed-dim' : c.priority === 'urgent' ? 'bg-error-container/50 text-error' : 'bg-surface-container-highest text-on-surface'}`}>
              {CASE_STATUS_LABEL[c.status]}{c.priority === 'urgent' && c.status !== 'resolved' ? ' · dringend' : ''}
            </span>
            {c.status !== 'resolved' && (() => {
              const left = timeLeft(c.due_at, now)
              return <span className={`inline-flex items-center gap-1 font-semibold ${left.urgent ? 'text-error' : 'text-on-surface-variant'}`}><Clock size={14} aria-hidden /> {left.label}</span>
            })()}
            {c.status === 'resolved' && c.resolved_at && (
              <span className="text-on-surface-variant">{formatDateTime(c.resolved_at)}{c.resolved_by_nickname ? ` von ${c.resolved_by_nickname}` : ''}</span>
            )}
            {c.resolution && <p className="basis-full text-on-surface">„{c.resolution}“</p>}
          </div>

          <dl className="rounded-xl bg-surface-container px-4 py-2 text-sm">
            {[
              ['Gemeldet von', c.opened_by_nickname ?? '—'],
              ...(c.against_nickname ? [['Gegen', c.against_nickname]] : []),
              ...(c.order_id ? [['Bestellung', `#${orderNumber(c.order_id)}${c.total_cents != null ? ` · ${formatPrice(c.total_cents, 'de')}` : ''}${c.delivery_mode ? ` · ${DELIVERY_MODE_LABEL[c.delivery_mode]}` : ''}`]] : []),
              ['Eröffnet', formatDateTime(c.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 py-1.5">
                <dt className="w-28 shrink-0 text-on-surface-variant">{k}</dt>
                <dd className="min-w-0 flex-1 text-on-surface">{v}</dd>
              </div>
            ))}
          </dl>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Verlauf</h3>
            <ol className="space-y-2">
              {c.messages.map((m) => (
                <li key={m.id} className={`flex ${m.from_buyer ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm text-on-surface ${m.internal
                    ? 'border border-dashed border-outline bg-transparent'
                    : m.from_buyer ? 'rounded-bl-md bg-surface-container-high' : 'rounded-br-md bg-primary-fixed-dim/15'}`}>
                    {m.internal && <p className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-on-surface-variant"><Lock size={11} aria-hidden /> Intern</p>}
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      {m.author_nickname ?? 'gelöschter Nutzer'}{m.from_buyer ? ' (Käufer)' : ''} · {formatDateTime(m.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Sheet>
  )
}
