'use client'

import { useEffect, useState } from 'react'
import {
  MessageCircle, Heart, Info, ShieldX, UserPlus,
  CheckCheck, Loader2, AlertCircle, Trash2, Swords, Trophy,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import {
  useNotificationStore,
  type Notification as AppNotification,
  type NotificationType,
} from '@/lib/store/notificationStore'
import { useTranslation } from '@/lib/i18n'
import { resolveNotificationContent } from '@/lib/notification-resolver'

type Tab = 'neu' | 'verlauf'

const TYPE_ICONS: Record<NotificationType, typeof MessageCircle> = {
  message:       MessageCircle,
  match:         Heart,
  system:        Info,
  ban:           ShieldX,
  request:       UserPlus,
  beef_request:  Swords,
  beef_accepted: Swords,
  beef_won:      Trophy,
  beef_lost:     Swords,
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('neu')
  const [loading, setLoading]     = useState(true)
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [cursor, setCursor]       = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const notifications = useNotificationStore((s) => s.notifications)
  const unreadCount   = useNotificationStore((s) => s.unreadCount)

  const TYPE_LABELS: Record<NotificationType, string> = {
    message:       t.notifications.typeMessage,
    match:         t.notifications.typeMatch,
    system:        t.notifications.typeSystem,
    ban:           t.notifications.typeBan,
    request:       t.notifications.typeRequest,
    beef_request:  'Beef Anfrage',
    beef_accepted: 'Beef angenommen',
    beef_won:      'Beef gewonnen',
    beef_lost:     'Beef verloren',
  }

  function relativeTime(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t.relativeTime.justNow
    if (mins < 60) return t.relativeTime.minutesAgo.replace('{mins}', String(mins))
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t.relativeTime.hoursAgo.replace('{hours}', String(hours))
    const days = Math.floor(hours / 24)
    return (days === 1 ? t.relativeTime.daysAgo : t.relativeTime.daysAgoPlural).replace('{days}', String(days))
  }

  useEffect(() => {
    async function load() {
      try {
        const page = await fetchApi<{ data: AppNotification[]; nextCursor: string | null }>('/notifications')
        useNotificationStore.getState().setNotifications(page.data)
        setCursor(page.nextCursor)
      } catch (err) {
        if (err instanceof Error && err.message === 'Session expired') return
        setError(err instanceof Error ? err.message : t.notifications.loadError)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await fetchApi<{ data: AppNotification[]; nextCursor: string | null }>(
        `/notifications?cursor=${encodeURIComponent(cursor)}`,
      )
      useNotificationStore.getState().appendNotifications(page.data)
      setCursor(page.nextCursor)
    } catch (err) {
      if (err instanceof Error && err.message === 'Session expired') return
      setError(err instanceof Error ? err.message : t.notifications.loadError)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleMarkRead(id: string) {
    useNotificationStore.getState().markRead(id)
    try {
      await fetchApi(`/notifications/${id}/read`, { method: 'PATCH' })
    } catch {
      // optimistic update already applied
    }
  }

  async function handleMarkAllRead() {
    useNotificationStore.getState().markAllRead()
    try {
      await fetchApi('/notifications/read-all', { method: 'PATCH' })
    } catch {
      // optimistic update already applied
    }
  }

  async function handleDeleteAll() {
    setDeleting(true)
    await Promise.all(
      tabNotifications.map(async (n) => {
        if (!n._local) {
          try {
            await fetchApi(`/notifications/${n.id}`, { method: 'DELETE' })
          } catch {
            return
          }
        }
        useNotificationStore.getState().removeNotification(n.id)
      })
    )
    setDeleting(false)
  }

  async function handleDelete(n: AppNotification) {
    if (!n._local) {
      try {
        await fetchApi(`/notifications/${n.id}`, { method: 'DELETE' })
      } catch {
        return
      }
    }
    useNotificationStore.getState().removeNotification(n.id)
  }

  const tabNotifications = notifications.filter((n) =>
    activeTab === 'neu' ? !n.is_read : n.is_read
  )

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2
          className="h-6 w-6 text-on-surface-variant animate-spin"
          aria-label={t.notifications.loadingLabel}
        />
      </main>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <main
        className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center"
        role="alert"
      >
        <AlertCircle className="h-10 w-10 text-error" aria-hidden="true" />
        <p className="text-on-surface font-semibold">
          {t.notifications.loadError}
        </p>
        <p className="text-on-surface-variant text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity"
        >
          {t.common.retry}
        </button>
      </main>
    )
  }

  // ── Page ───────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-on-surface">{t.notifications.title}</h1>
          {activeTab === 'neu' && unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors min-h-[44px] flex-shrink-0"
            >
              <CheckCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{t.notifications.markAllRead}</span>
              <span className="sm:hidden">{t.notifications.markAllReadShort}</span>
            </button>
          )}
          {activeTab === 'verlauf' && tabNotifications.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface-variant hover:text-error hover:border-error hover:bg-error/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] flex-shrink-0"
            >
              {deleting
                ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" aria-hidden="true" />
                : <Trash2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              }
              <span>{t.notifications.deleteAll}</span>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div
          role="group"
          aria-label={t.notifications.filterLabel}
          className="flex rounded-xl overflow-hidden border border-outline-variant"
        >
          {([
            { key: 'neu' as Tab,     label: unreadCount > 0 ? `${t.notifications.tabNew} (${unreadCount})` : t.notifications.tabNew },
            { key: 'verlauf' as Tab, label: t.notifications.tabHistory },
          ]).map(({ key, label }, i, arr) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              aria-pressed={activeTab === key}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                i < arr.length - 1 ? 'border-r border-outline-variant' : ''
              } ${
                activeTab === key
                  ? 'bg-primary-fixed-dim text-on-primary-container'
                  : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {tabNotifications.length === 0 ? (
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-10 flex flex-col items-center gap-2 text-center">
            <p className="text-on-surface font-medium">
              {activeTab === 'neu' ? t.notifications.emptyNew : t.notifications.emptyHistory}
            </p>
            <p className="text-sm text-on-surface-variant">
              {activeTab === 'neu' ? t.notifications.emptyNewDesc : t.notifications.emptyHistoryDesc}
            </p>
          </div>
        ) : (
          <ul className="rounded-2xl bg-surface-container border border-outline-variant overflow-hidden divide-y divide-outline-variant">
            {tabNotifications.map((n) => {
              const Icon = TYPE_ICONS[n.type]
              return (
                <li
                  key={n.id}
                  className={`flex items-stretch ${
                    !n.is_read ? 'border-l-2 border-primary-fixed-dim' : ''
                  }`}
                >
                  {/* Main area — marks as read on click */}
                  <button
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                    disabled={n.is_read}
                    className={`flex-1 flex items-start gap-3 px-4 py-4 text-left transition-colors ${
                      n.is_read ? 'cursor-default' : 'hover:bg-surface-container-high'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                        !n.is_read ? 'bg-primary-fixed-dim/10' : 'bg-surface-container-high'
                      }`}
                      aria-hidden="true"
                    >
                      <Icon
                        size={16}
                        className={!n.is_read ? 'text-primary-fixed-dim' : 'text-on-surface-variant'}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${
                        !n.is_read ? 'text-on-surface font-medium' : 'text-on-surface-variant'
                      }`}>
                        {resolveNotificationContent(n, t)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-on-surface-variant">
                          {relativeTime(n.created_at)}
                        </span>
                        <span className="text-xs text-on-surface-variant" aria-hidden="true">·</span>
                        <span className="text-xs text-on-surface-variant">
                          {TYPE_LABELS[n.type]}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(n)}
                    className="flex-shrink-0 px-4 text-on-surface-variant/40 hover:text-error transition-colors"
                    aria-label={t.notifications.deleteNotification}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {cursor && (
          <div className="flex justify-center">
            <button onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}
              className="px-6 py-2.5 rounded-full bg-surface-container-high text-on-surface font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity disabled:opacity-50">
              {t.notifications.loadMore}
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
