'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { User, Clock, CheckCircle, XCircle, Inbox, Send } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useNotificationStore } from '@/lib/store/notificationStore'
import { useTranslation } from '@/lib/i18n'

interface ContactRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'declined'
  message_preview: string | null
  created_at: string
  // Modul caretaker: schon Ja gesagt, wartet auf die Betreuung
  awaiting_caretaker?: boolean
}

type RequestsEnvelope = ContactRequest[] | { data: ContactRequest[] }

function normalise(res: RequestsEnvelope): ContactRequest[] {
  return Array.isArray(res) ? res : (res?.data ?? [])
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (secs < 60) return 'Gerade eben'
  if (mins < 60) return `vor ${mins} Min.`
  if (hours < 24) return `vor ${hours} Std.`
  if (days < 7) return `vor ${days} Tag${days === 1 ? '' : 'en'}`
  return new Date(dateStr).toLocaleDateString('de-DE')
}

// ─── Incoming card ────────────────────────────────────────────────────────────

type ActionState = 'idle' | 'accepting' | 'declining' | 'accepted' | 'held'

function IncomingCard({
  request,
  nickname,
  onDecline,
}: {
  request: ContactRequest
  nickname: string
  onDecline: (id: string) => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<ActionState>(request.awaiting_caretaker ? 'held' : 'idle')
  const [error, setError] = useState('')
  const busy = state === 'accepting' || state === 'declining'

  async function handleAccept() {
    setState('accepting')
    setError('')
    try {
      const res = await fetchApi<{ pendingCaretaker?: boolean }>(`/chat/requests/${request.id}/accept`, { method: 'PATCH' })
      setState(res?.pendingCaretaker ? 'held' : 'accepted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage fehlgeschlagen')
      setState('idle')
    }
  }

  async function handleDecline() {
    setState('declining')
    setError('')
    try {
      await fetchApi<unknown>(`/chat/requests/${request.id}/decline`, { method: 'PATCH' })
      onDecline(request.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage fehlgeschlagen')
      setState('idle')
    }
  }

  return (
    <li className="flex gap-3 rounded-2xl bg-surface-container border border-outline-variant p-4">
      <div
        className="flex-shrink-0 h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center"
        aria-hidden="true"
      >
        <User className="h-6 w-6 text-outline" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/profile/${nickname}`} className="font-semibold text-on-surface text-sm hover:underline cursor-pointer">{nickname}</Link>
          <time
            className="text-xs text-on-surface-variant flex-shrink-0"
            dateTime={request.created_at}
          >
            {relativeTime(request.created_at)}
          </time>
        </div>

        {request.message_preview && (
          <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">
            {request.message_preview}
          </p>
        )}

        <div className="mt-3 space-y-2">
          {state === 'held' ? (
            <div className="flex items-center gap-1.5 text-on-surface-variant text-xs font-semibold" role="status" aria-live="polite">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {t.care.awaitingCaretaker}
            </div>
          ) : state === 'accepted' ? (
            <div
              className="flex items-center gap-1.5 text-primary-fixed-dim text-xs font-semibold"
              role="status"
              aria-live="polite"
            >
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              Angenommen
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={busy}
                className="flex-1 py-2 rounded-full bg-primary-fixed-dim text-on-primary-container text-xs font-semibold min-h-[40px] hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="Anfrage annehmen"
              >
                {state === 'accepting' ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full border-2 border-on-primary-container/30 border-t-on-primary-container animate-spin"
                      aria-hidden="true"
                    />
                    Sende…
                  </span>
                ) : (
                  'Annehmen'
                )}
              </button>
              <button
                onClick={handleDecline}
                disabled={busy}
                className="flex-1 py-2 rounded-full border border-outline-variant text-on-surface text-xs font-semibold min-h-[40px] hover:bg-surface-container-high active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="Anfrage ablehnen"
              >
                {state === 'declining' ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full border-2 border-on-surface/30 border-t-on-surface animate-spin"
                      aria-hidden="true"
                    />
                    Sende…
                  </span>
                ) : (
                  'Ablehnen'
                )}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-error text-center" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ContactRequest['status'] }) {
  if (status === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-fixed-dim/15 text-primary-fixed-dim">
        <CheckCircle className="h-3 w-3" aria-hidden="true" />
        Angenommen
      </span>
    )
  }
  if (status === 'declined') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-error/10 text-error">
        <XCircle className="h-3 w-3" aria-hidden="true" />
        Abgelehnt
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant">
      <Clock className="h-3 w-3" aria-hidden="true" />
      Ausstehend
    </span>
  )
}

// ─── Outgoing card ────────────────────────────────────────────────────────────

function OutgoingCard({ request, nickname }: { request: ContactRequest; nickname: string }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-surface-container border border-outline-variant p-4">
      <div
        className="flex-shrink-0 h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center"
        aria-hidden="true"
      >
        <User className="h-6 w-6 text-outline" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/profile/${nickname}`} className="font-semibold text-on-surface text-sm hover:underline cursor-pointer">{nickname}</Link>
          <time
            className="text-xs text-on-surface-variant flex-shrink-0"
            dateTime={request.created_at}
          >
            {relativeTime(request.created_at)}
          </time>
        </div>

        {request.message_preview && (
          <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">
            {request.message_preview}
          </p>
        )}

        <div className="mt-2">
          <StatusBadge status={request.status} />
        </div>
      </div>
    </li>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-container border border-outline-variant p-4 animate-pulse">
      <div className="flex-shrink-0 h-12 w-12 rounded-full bg-surface-container-high" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex justify-between gap-2">
          <div className="h-3.5 w-24 rounded-lg bg-surface-container-high" />
          <div className="h-3 w-14 rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-3 w-48 rounded-lg bg-surface-container-high" />
        <div className="flex gap-2 pt-1">
          <div className="h-9 flex-1 rounded-full bg-surface-container-high" />
          <div className="h-9 flex-1 rounded-full bg-surface-container-high" />
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'incoming' | 'outgoing'

export default function RequestsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('incoming')
  const [incoming, setIncoming] = useState<ContactRequest[]>([])
  const [outgoing, setOutgoing] = useState<ContactRequest[]>([])
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [inRes, outRes] = await Promise.all([
          fetchApi<RequestsEnvelope>('/chat/requests/incoming'),
          fetchApi<RequestsEnvelope>('/chat/requests/outgoing'),
        ])
        const incomingList = normalise(inRes)
        const outgoingList = normalise(outRes)
        setIncoming(incomingList)
        setOutgoing(outgoingList)

        const uniqueIds = [...new Set([
          ...incomingList.map((r) => r.sender_id),
          ...outgoingList.map((r) => r.receiver_id),
        ])]
        const profiles = await Promise.all(
          uniqueIds.map((id) =>
            fetchApi<{ nickname: string }>(`/profile/user/${id}`).catch(() => null)
          )
        )
        const map = new Map<string, string>()
        uniqueIds.forEach((id, i) => {
          const p = profiles[i]
          if (p?.nickname) map.set(id, p.nickname)
        })
        setNicknames(map)

        // User is viewing the requests page — clear all local request notifications
        const store = useNotificationStore.getState()
        store.notifications
          .filter(n => n.type === 'request' && n._local)
          .forEach(n => store.removeNotification(n.id))
      } catch (err) {
        if (err instanceof Error && err.message === 'Session expired') return
        setError(err instanceof Error ? err.message : 'Fehler beim Laden')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function handleDecline(id: string) {
    setIncoming((prev) => prev.filter((r) => r.id !== id))
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'incoming', label: t.requests.tabIncoming, count: incoming.length },
    { key: 'outgoing', label: t.requests.tabOutgoing, count: outgoing.length },
  ]

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 pb-24 sm:pb-8 space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">{t.requests.title}</h1>

      {/* Tabs */}
      <div
        className="flex rounded-xl bg-surface-container-low border border-outline-variant p-1 gap-1"
        role="tablist"
        aria-label="Anfragentyp wählen"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold min-h-[44px] transition-all ${
              activeTab === tab.key
                ? 'bg-surface-container-high text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.key === 'incoming' ? (
              <Inbox className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            )}
            {tab.label}
            {!loading && tab.count > 0 && (
              <span
                className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key
                    ? 'bg-primary-fixed-dim text-on-primary-container'
                    : 'bg-surface-container-highest text-on-surface-variant'
                }`}
                aria-label={`${tab.count} Anfragen`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <ul className="space-y-3" aria-busy="true" aria-label="Lädt Anfragen">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </ul>
      ) : error ? (
        <div
          className="flex flex-col items-center justify-center py-20 text-center space-y-3"
          role="alert"
        >
          <p className="text-on-surface font-semibold">Fehler beim Laden</p>
          <p className="text-on-surface-variant text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity"
          >
            Erneut versuchen
          </button>
        </div>
      ) : (
        <>
          <div
            id="panel-incoming"
            role="tabpanel"
            aria-labelledby="tab-incoming"
            hidden={activeTab !== 'incoming'}
          >
            {incoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <Inbox className="h-10 w-10 text-on-surface-variant" aria-hidden="true" />
                <p className="text-on-surface font-semibold">{t.requests.noIncoming}</p>
              </div>
            ) : (
              <ul className="space-y-3" aria-label="Eingehende Anfragen">
                {incoming.map((r) => (
                  <IncomingCard key={r.id} request={r} nickname={nicknames.get(r.sender_id) ?? '...'} onDecline={handleDecline} />
                ))}
              </ul>
            )}
          </div>

          <div
            id="panel-outgoing"
            role="tabpanel"
            aria-labelledby="tab-outgoing"
            hidden={activeTab !== 'outgoing'}
          >
            {outgoing.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <Send className="h-10 w-10 text-on-surface-variant" aria-hidden="true" />
                <p className="text-on-surface font-semibold">{t.requests.noOutgoing}</p>
              </div>
            ) : (
              <ul className="space-y-3" aria-label="Ausgehende Anfragen">
                {outgoing.map((r) => (
                  <OutgoingCard key={r.id} request={r} nickname={nicknames.get(r.receiver_id) ?? '...'} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  )
}
