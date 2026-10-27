'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Image as ImageIcon, Music } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useNotificationStore } from '@/lib/store/notificationStore'
import { Divider } from './shared/Divider'
import { Spinner } from './shared/Spinner'
import { fmtDate } from './shared/utils'
import type { AdminReport, AdminTicket, Paginated, PendingMedia } from './shared/types'

interface Props {
  showToast: (msg: string, ok?: boolean) => void
}

export function TicketsTab({ showToast }: Props) {
  const { t } = useTranslation()

  const [tickets, setTickets] = useState<AdminReport[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsExpanded, setTicketsExpanded] = useState(false)

  const [supportTickets, setSupportTickets] = useState<AdminTicket[]>([])
  const [supportTicketsLoading, setSupportTicketsLoading] = useState(false)
  const [supportExpanded, setSupportExpanded] = useState(false)

  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaExpanded, setMediaExpanded] = useState(false)

  const adminMediaCount = useNotificationStore((s) => s.adminMediaCount)
  const setAdminMediaCount = useNotificationStore((s) => s.setAdminMediaCount)
  const adminSoundTick = useNotificationStore((s) => s.adminSoundTick)

  async function loadTickets() {
    setTicketsLoading(true)
    try {
      const data = await fetchApi<Paginated<AdminReport>>('/admin/reports?status=open&limit=50&page=1')
      const sorted = [...data.data].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      setTickets(sorted)
      if (sorted.length > 0) setTicketsExpanded(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.admin.loadError, false)
    } finally {
      setTicketsLoading(false)
    }
  }

  async function loadSupportTickets() {
    setSupportTicketsLoading(true)
    try {
      const data = await fetchApi<Paginated<AdminTicket>>('/admin/tickets?type=support_request&limit=50&page=1')
      setSupportTickets(data.data)
      if (data.data.length > 0) setSupportExpanded(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.admin.loadError, false)
    } finally {
      setSupportTicketsLoading(false)
    }
  }

  async function loadPendingMedia() {
    setMediaLoading(true)
    try {
      // Fetch one extra to detect overflow without a separate COUNT query
      const data = await fetchApi<PendingMedia[]>('/admin/media/pending?limit=51')
      const hasMore = data.length > 50
      const items = hasMore ? data.slice(0, 50) : data
      setPendingMedia(items)
      // Store 51 when there are more so the badge can show "50+"
      setAdminMediaCount(hasMore ? 51 : items.length)
      if (items.length > 0) setMediaExpanded(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.admin.loadError, false)
    } finally {
      setMediaLoading(false)
    }
  }

  useEffect(() => {
    void loadTickets()
    void loadSupportTickets()
    void loadPendingMedia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch all lists when a real-time admin notification arrives
  useEffect(() => {
    if (adminSoundTick === 0) return
    void loadTickets()
    void loadSupportTickets()
    void loadPendingMedia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSoundTick])

  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5 space-y-2">

      {/* Accordion: Meldungen */}
      <div>
        <div
          role="button"
          aria-expanded={ticketsExpanded}
          onClick={() => setTicketsExpanded((v) => !v)}
          className="w-full flex items-center justify-between py-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              {t.admin.ticketsReports.replace(/\s*\(\{count\}\)/, '')}
            </p>
            {tickets.length > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-error text-on-error text-[9px] font-bold flex items-center justify-center">
                {tickets.length > 99 ? '99+' : tickets.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void loadTickets() }}
              className="text-xs text-on-surface-variant hover:text-on-surface underline"
            >
              {t.admin.ticketsRefresh}
            </button>
            <ChevronDown
              className={`h-4 w-4 text-on-surface-variant transition-transform duration-300 ${ticketsExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${ticketsExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className="pt-2 pb-1 space-y-3">
              <Divider />
              {ticketsLoading ? (
                <div className="flex justify-center py-8"><Spinner size={6} /></div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-on-surface-variant">
                  <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                  <p className="text-sm">{t.admin.ticketsNoReports}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-on-surface truncate">
                          {ticket.reporter_nickname ?? ticket.reporter_id.slice(0, 8)}
                          <span className="text-on-surface-variant font-normal mx-1.5">→</span>
                          {ticket.reported_nickname ?? ticket.reported_user_id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-on-surface-variant">{ticket.reason}</p>
                        <p className="text-xs text-on-surface-variant/60">{fmtDate(ticket.created_at)}</p>
                      </div>
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-error-container text-error">
                        {ticket.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Accordion: Support Anfragen */}
      <div>
        <div
          role="button"
          aria-expanded={supportExpanded}
          onClick={() => setSupportExpanded((v) => !v)}
          className="w-full flex items-center justify-between py-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              {t.admin.ticketsSupportRequests.replace(/\s*\(\{count\}\)/, '')}
            </p>
            {supportTickets.length > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-error text-on-error text-[9px] font-bold flex items-center justify-center">
                {supportTickets.length > 99 ? '99+' : supportTickets.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void loadSupportTickets() }}
              className="text-xs text-on-surface-variant hover:text-on-surface underline"
            >
              {t.admin.ticketsRefresh}
            </button>
            <ChevronDown
              className={`h-4 w-4 text-on-surface-variant transition-transform duration-300 ${supportExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${supportExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className="pt-2 pb-1 space-y-3">
              <Divider />
              {supportTicketsLoading ? (
                <div className="flex justify-center py-6"><Spinner size={6} /></div>
              ) : supportTickets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-on-surface-variant">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  <p className="text-sm">{t.admin.ticketsNoSupport}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {supportTickets.map((stk) => (
                    <div key={stk.id} className="rounded-xl bg-surface-container-high border border-outline-variant p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-on-surface truncate">{stk.context.email}</p>
                          {(stk.context.nickname || stk.context.public_id) && (
                            <p className="text-xs text-on-surface-variant">
                              {[stk.context.nickname, stk.context.public_id].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className="text-xs text-on-surface-variant/60">{fmtDate(stk.created_at)}</p>
                        </div>
                        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-error-container text-error">
                          {stk.status}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{stk.context.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Divider />

      {/* Accordion: Medien */}
      <div>
        <div
          role="button"
          aria-expanded={mediaExpanded}
          onClick={() => setMediaExpanded((v) => !v)}
          className="w-full flex items-center justify-between py-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Medien
            </p>
            {adminMediaCount > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-error text-on-error text-[9px] font-bold flex items-center justify-center">
                {adminMediaCount > 50 ? '50+' : adminMediaCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void loadPendingMedia() }}
              className="text-xs text-on-surface-variant hover:text-on-surface underline"
            >
              {t.admin.ticketsRefresh}
            </button>
            <ChevronDown
              className={`h-4 w-4 text-on-surface-variant transition-transform duration-300 ${mediaExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${mediaExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className="pt-2 pb-1 space-y-3">
              <Divider />
              {mediaLoading ? (
                <div className="flex justify-center py-6"><Spinner size={6} /></div>
              ) : pendingMedia.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-on-surface-variant">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  <p className="text-sm">{t.admin.mediaNoMedia}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingMedia.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-surface-container flex items-center justify-center">
                          {m.file_type === 'audio'
                            ? <Music className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
                            : <ImageIcon className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-on-surface truncate">
                            {m.nickname ?? m.uploaded_by.slice(0, 8)}
                          </p>
                          <p className="text-xs text-on-surface-variant/60">{fmtDate(m.uploaded_at)}</p>
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-error-container text-error">
                        open
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
