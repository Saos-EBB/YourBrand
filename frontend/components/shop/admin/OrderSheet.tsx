'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import {
  CASE_KIND_LABEL, CASE_REASON_LABEL, CASE_STATUS_LABEL, REPORT_REASONS, DELIVERY_MODE_LABEL, HOLD_REASON_LABEL, NOT_MET_FROM, ORDER_STATUS_LABEL, PROGRESS_FLOW, PROGRESS_LABEL, formatPrice, orderNumber,
  type AdminShopOrderDetail, type AdminShopOrderEvent, type PhysicalMode, type ShopCaseKind, type ShopOrderStatus, type ShopProgress,
} from '@/lib/shop'
import { Sheet, adminField, primaryBtn, secondaryBtn } from './Sheet'
import { formatDateTime, timeLeft, useNow } from './time'

const EVENT_LABEL: Record<string, string> = {
  created: 'Bestellt',
  authorized: 'Zahlung reserviert',
  held: 'Angehalten',
  approved: 'Angenommen',
  rejected: 'Abgelehnt',
  stripe_error: 'Stripe-Fehler',
  expired: 'Reservierung verfallen',
  fulfilled: 'Ausgeliefert',
  progress: 'Lieferstand',
  redeemed: 'Code eingelöst',
  case_opened: 'Fall eröffnet',
}

// Schnellauswahl beim Ablehnen — landet als Text im Feld, Begruendung bleibt Pflicht
const REJECT_REASONS = [
  'Verdacht auf Betrug',
  'Adresse nicht zustellbar',
  'Artikel nicht mehr lieferbar',
  'Käufer nicht erreichbar',
]

// Stripe Radar risk_level
const RADAR_LABEL: Record<string, string> = { normal: 'normal', elevated: 'erhöht', highest: 'hoch' }

const BADGE: Partial<Record<ShopOrderStatus, string>> = {
  held: 'bg-error-container/50 text-error',
  approved: 'bg-primary-fixed-dim/15 text-primary-fixed-dim',
  fulfilled: 'bg-primary-fixed-dim/15 text-primary-fixed-dim',
}

export function StatusBadge({ status }: { status: ShopOrderStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[status] ?? 'bg-surface-container-highest text-on-surface-variant'}`}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  )
}

export function ReasonChips({ reasons }: { reasons: string[] }) {
  return (
    <>
      {reasons.map((r) => (
        <span key={r} className="inline-flex items-center rounded-md bg-surface-container-highest px-1.5 py-0.5 text-[11px] font-medium text-on-surface">
          {HOLD_REASON_LABEL[r] ?? r}
        </span>
      ))}
    </>
  )
}

type Mode = 'idle' | 'approve' | 'reject'

export function OrderSheet({ id, onClose, onDecided, onChanged }: {
  id: string
  onClose: () => void
  onDecided: (status: 'approved' | 'rejected', message: string) => void
  // Lieferstand geaendert: Panel bleibt offen, Liste laedt neu
  onChanged: (message: string) => void
}) {
  const [detail, setDetail] = useState<AdminShopOrderDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('idle')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = useNow()

  useEffect(() => {
    let cancelled = false
    fetchApi<AdminShopOrderDetail>(`/admin/shop/orders/${id}`)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [id, reload])

  const order = detail?.id === id ? detail : null
  const held = order?.status === 'held'
  const shipping = order?.status === 'approved' && order.delivery_mode !== 'digital' && order.progress !== 'not_met'

  async function decide() {
    if (!order) return
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/admin/shop/orders/${id}/${mode === 'approve' ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      })
      const amount = formatPrice(order.total_cents, 'de')
      onDecided(mode === 'approve' ? 'approved' : 'rejected',
        mode === 'approve' ? `Angenommen — ${amount} abgebucht` : 'Abgelehnt — Reservierung freigegeben')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      // Stripe-Fehler steht jetzt im Zeitstrahl
      setReload((n) => n + 1)
    }
  }

  function choose(next: Mode) {
    setMode(next)
    setNote('')
    setError('')
  }

  const footer = shipping ? (
    <ProgressFooter key={order.progress} order={order} onDone={(msg) => { setReload((n) => n + 1); onChanged(msg) }} />
  ) : !held ? undefined : (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
      {mode === 'idle' && (
        <div className="flex gap-3">
          <button onClick={() => choose('reject')} className={`${secondaryBtn} flex-1 text-error`}>Ablehnen</button>
          <button onClick={() => choose('approve')} className={`${primaryBtn} flex-1`}>Annehmen</button>
        </div>
      )}
      {mode === 'approve' && (
        <>
          <p className="text-sm text-on-surface">
            <b>{formatPrice(order.total_cents, 'de')}</b> werden jetzt abgebucht, die Bestellung geht in die Auslieferung.
          </p>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Notiz (optional), z. B. Käufer angerufen" className={adminField} />
          <div className="flex gap-3">
            <button onClick={() => choose('idle')} disabled={busy} className={`${secondaryBtn} flex-1`}>Zurück</button>
            <button onClick={decide} disabled={busy} className={`${primaryBtn} flex-1`}>{busy ? 'Bucht ab …' : 'Annehmen & abbuchen'}</button>
          </div>
        </>
      )}
      {mode === 'reject' && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setNote(r)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${note === r ? 'border-on-surface bg-on-surface text-background' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'}`}>
                {r}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5 text-sm font-semibold text-on-surface">
            <span>Begründung <span className="font-normal text-on-surface-variant">(Pflicht, steht im Protokoll)</span></span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={adminField} />
          </label>
          <div className="flex gap-3">
            <button onClick={() => choose('idle')} disabled={busy} className={`${secondaryBtn} flex-1`}>Zurück</button>
            <button onClick={decide} disabled={busy || note.trim().length < 5}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-error px-4 py-2.5 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40">
              {busy ? 'Lehnt ab …' : 'Endgültig ablehnen'}
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <Sheet title={`Bestellung #${orderNumber(id)}`} wide onClose={onClose} footer={footer}>
      {!order ? (
        loadError
          ? <p className="text-sm text-error" role="alert">{loadError}</p>
          : <div className="space-y-3" aria-hidden>{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container" />)}</div>
      ) : (
        <div className="space-y-6">
          <Status order={order} now={now} />
          <Buyer order={order} />
          <Cases order={order} onReported={() => { setReload((n) => n + 1); onChanged('Käufer gemeldet — steht unter Fälle') }} />
          <Delivery order={order} />
          <Items order={order} />
          <Timeline events={order.events} />
        </div>
      )}
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{title}</h3>
      {children}
    </section>
  )
}

function Status({ order, now }: { order: AdminShopOrderDetail; now: number }) {
  if (order.status === 'held') {
    const left = order.decide_by ? timeLeft(order.decide_by, now) : null
    return (
      <div className="space-y-2 rounded-xl border border-error/40 bg-error-container/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold text-on-surface">
            <AlertTriangle size={18} className="text-error" aria-hidden /> Wartet auf deine Entscheidung
          </p>
          {left && (
            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${left.urgent ? 'text-error' : 'text-on-surface-variant'}`}>
              <Clock size={14} aria-hidden /> {left.label}
            </span>
          )}
        </div>
        {order.hold_reasons.length > 0 && <div className="flex flex-wrap gap-1.5"><ReasonChips reasons={order.hold_reasons} /></div>}
        <p className="text-xs text-on-surface-variant">
          Der Betrag ist nur reserviert. Ohne Entscheidung bis zur Frist verfällt die Reservierung und der Käufer zahlt nichts.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container p-4 text-sm">
      <StatusBadge status={order.status} />
      {order.decided_at && (
        <span className="text-on-surface-variant">
          {formatDateTime(order.decided_at)}{order.decided_by_nickname ? ` von ${order.decided_by_nickname}` : ' vom System'}
        </span>
      )}
      {order.progress && order.status === 'approved' && (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${order.progress === 'not_met' ? 'bg-error-container/50 text-error' : 'bg-surface-container-highest text-on-surface'}`}>
          {PROGRESS_LABEL[order.progress]}
        </span>
      )}
      {order.tracking_number && <span className="text-on-surface-variant">Sendung <span className="font-mono text-on-surface">{order.tracking_number}</span></span>}
      {order.decision_note && <p className="basis-full text-on-surface">„{order.decision_note}“</p>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-28 shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-line break-words text-on-surface">{children}</dd>
    </div>
  )
}

function Buyer({ order }: { order: AdminShopOrderDetail }) {
  const h = order.buyer_history
  const history = !h ? 'Konto gelöscht'
    : h.completed + h.rejected + h.refunded === 0 ? 'Erste Bestellung'
      : `${h.completed} abgeschlossen · ${h.rejected} abgelehnt · ${h.refunded} erstattet`
  const reports = h?.reports ?? 0
  return (
    <Section title="Käufer">
      <dl className="rounded-xl bg-surface-container px-4 py-2">
        <Row label="Konto">{order.nickname ?? '—'}</Row>
        {(order.buyer_name || order.contact_name) && <Row label="Name">{order.buyer_name ?? order.contact_name}</Row>}
        {order.buyer_email && <Row label="E-Mail">{order.buyer_email}</Row>}
        {order.contact_phone && <Row label="Telefon"><a href={`tel:${order.contact_phone}`} className="hover:underline">{order.contact_phone}</a></Row>}
        <Row label="Vorgeschichte">
          <span className={h && (h.rejected > 0 || h.refunded > 0) ? 'font-semibold text-error' : ''}>{history}</span>
          {reports > 0 && <span className="block font-semibold text-error">{reports} {reports === 1 ? 'Meldung' : 'Meldungen'} gegen den Käufer</span>}
        </Row>
        {order.radar_risk && (
          <Row label="Stripe Radar">
            <span className={order.radar_risk === 'normal' ? '' : 'font-semibold text-error'}>{RADAR_LABEL[order.radar_risk] ?? order.radar_risk}</span>
          </Row>
        )}
      </dl>
    </Section>
  )
}

function Delivery({ order }: { order: AdminShopOrderDetail }) {
  return (
    <Section title="Lieferung">
      <dl className="rounded-xl bg-surface-container px-4 py-2">
        <Row label="Art">{DELIVERY_MODE_LABEL[order.delivery_mode]}</Row>
        {order.delivery_address && <Row label="Adresse">{order.delivery_address}</Row>}
        {order.desired_at && <Row label="Wunschzeit">{formatDateTime(order.desired_at)}</Row>}
        {order.delivery_note && <Row label="Hinweis">{order.delivery_note}</Row>}
        {order.withdrawal_waiver_at && <Row label="Widerruf">Verzicht bestätigt am {formatDateTime(order.withdrawal_waiver_at)}</Row>}
      </dl>
    </Section>
  )
}

function Items({ order }: { order: AdminShopOrderDetail }) {
  return (
    <Section title="Artikel">
      <div className="rounded-xl bg-surface-container px-4 py-2 text-sm">
        <ul role="list" className="divide-y divide-outline-variant/50">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-baseline gap-3 py-2">
              <span className="w-8 shrink-0 font-semibold text-on-surface">{i.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-on-surface">{i.title}</span>
                <span className="font-mono text-xs text-on-surface-variant">{i.sku}</span>
                {(i.fulfillment === 'license' || i.fulfillment === 'unlock') && i.codes_assigned > 0 && (
                  <span className="ml-2 text-xs text-primary-fixed-dim">
                    {i.codes_assigned} {i.fulfillment === 'license' ? (i.codes_assigned === 1 ? 'Key zugeteilt' : 'Keys zugeteilt') : (i.codes_assigned === 1 ? 'Code erzeugt' : 'Codes erzeugt')}
                  </span>
                )}
              </span>
              <span className="font-semibold text-on-surface">{formatPrice(i.unit_price_cents * i.quantity, 'de')}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-outline-variant py-2">
          {order.shipping_cents > 0 && (
            <div className="flex justify-between text-on-surface-variant"><dt>Versand</dt><dd>{formatPrice(order.shipping_cents, 'de')}</dd></div>
          )}
          <div className="flex justify-between font-bold text-on-surface"><dt>Gesamt</dt><dd>{formatPrice(order.total_cents, 'de')}</dd></div>
        </dl>
      </div>
    </Section>
  )
}

function eventDetail(e: AdminShopOrderEvent): string | null {
  const d = e.data
  if (typeof d.note === 'string') return `„${d.note}“`
  if (Array.isArray(d.reasons)) return d.reasons.map((r) => HOLD_REASON_LABEL[String(r)] ?? String(r)).join(', ')
  if (typeof d.message === 'string') return d.message
  if (typeof d.kind === 'string' && typeof d.amount === 'number') return `${d.amount} ${d.kind}`
  if (typeof d.case_id === 'string') return `${CASE_KIND_LABEL[d.kind as ShopCaseKind] ?? d.kind} · ${CASE_REASON_LABEL[String(d.reason)] ?? d.reason}`
  if (typeof d.progress === 'string') {
    const label = PROGRESS_LABEL[d.progress as ShopProgress] ?? d.progress
    return typeof d.tracking_number === 'string' ? `${label} · Sendung ${d.tracking_number}` : label
  }
  if (typeof d.keys === 'number' || typeof d.codes === 'number') {
    return [d.keys ? `${d.keys} Keys zugeteilt` : '', d.codes ? `${d.codes} Codes erzeugt` : ''].filter(Boolean).join(', ') || null
  }
  return null
}

function Timeline({ events }: { events: AdminShopOrderEvent[] }) {
  return (
    <Section title="Verlauf">
      <ol className="relative ml-1.5 space-y-4 border-l border-outline-variant pl-5">
        {events.map((e) => {
          const detail = eventDetail(e)
          const bad = e.type === 'stripe_error' || e.type === 'held' || e.type === 'rejected'
          return (
            <li key={e.id} className="relative">
              <span className={`absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background ${bad ? 'bg-error' : 'bg-primary-fixed-dim'}`} aria-hidden />
              <p className="text-sm font-semibold text-on-surface">{EVENT_LABEL[e.type] ?? e.type}</p>
              <p className="text-xs text-on-surface-variant">
                {formatDateTime(e.created_at)} · {e.actor_nickname ?? (e.actor_id ? 'gelöschter Nutzer' : 'System')}
              </p>
              {detail && <p className="mt-0.5 break-words text-sm text-on-surface-variant">{detail}</p>}
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

// Lieferstand weiterschalten: naechster Schritt gross, "nicht angetroffen" klein daneben
function ProgressFooter({ order, onDone }: { order: AdminShopOrderDetail; onDone: (message: string) => void }) {
  const mode = order.delivery_mode as PhysicalMode
  const flow = PROGRESS_FLOW[mode]
  const current = order.progress ?? 'accepted'
  const next = flow[flow.indexOf(current) + 1]
  const notMetFrom = NOT_MET_FROM[mode]
  const canNotMet = notMetFrom !== undefined && flow.indexOf(current) >= flow.indexOf(notMetFrom)
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function go(progress: ShopProgress) {
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/admin/shop/orders/${order.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ progress, ...(progress === 'shipped' && tracking.trim() ? { trackingNumber: tracking.trim() } : {}) }),
      })
      onDone(`#${orderNumber(order.id)}: ${PROGRESS_LABEL[progress]}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
      {next === 'shipped' && (
        <input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={80} placeholder="Sendungsnummer (optional)" className={`${adminField} font-mono`} />
      )}
      <div className="flex gap-3">
        {canNotMet && (
          <button onClick={() => go('not_met')} disabled={busy} className={`${secondaryBtn} flex-1 text-error`}>Nicht angetroffen</button>
        )}
        {next && (
          <button onClick={() => go(next)} disabled={busy} className={`${primaryBtn} flex-[2]`}>
            {busy ? 'Speichert …' : `Weiter: ${PROGRESS_LABEL[next]}`}
          </button>
        )}
      </div>
    </div>
  )
}

// Faelle zur Bestellung + Kaeufer melden (intern, zaehlt in der Vorgeschichte)
function Cases({ order, onReported }: { order: AdminShopOrderDetail; onReported: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!order.user_id && order.cases.length === 0) return null

  async function report() {
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/admin/shop/orders/${order.id}/report`, { method: 'POST', body: JSON.stringify({ reason, note: note.trim() }) })
      setOpen(false)
      setReason(null)
      setNote('')
      onReported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Fälle">
      {order.cases.length > 0 && (
        <ul role="list" className="space-y-1.5">
          {order.cases.map((c) => (
            <li key={c.id}>
              <Link href="/admin/shop/cases" className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container px-4 py-2.5 text-sm hover:bg-surface-container-high">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.priority === 'urgent' && c.status !== 'resolved' ? 'bg-error-container/50 text-error' : 'bg-surface-container-highest text-on-surface'}`}>{CASE_KIND_LABEL[c.kind]}</span>
                <span className="text-on-surface">{CASE_REASON_LABEL[c.reason] ?? c.reason}</span>
                <span className="ml-auto text-xs text-on-surface-variant">{CASE_STATUS_LABEL[c.status]} · {formatDateTime(c.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {order.user_id && (open ? (
        <div className="space-y-3 rounded-xl border border-outline-variant p-4">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reason === r ? 'border-on-surface bg-on-surface text-background' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'}`}>
                {CASE_REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Was ist passiert? (intern, mindestens 10 Zeichen)" className={adminField} />
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setOpen(false)} disabled={busy} className={`${secondaryBtn} flex-1`}>Abbrechen</button>
            <button onClick={report} disabled={busy || !reason || note.trim().length < 10} className={`${primaryBtn} flex-1`}>{busy ? 'Speichert …' : 'Käufer melden'}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-sm font-semibold text-on-surface-variant hover:text-on-surface">Käufer melden …</button>
      ))}
    </Section>
  )
}
