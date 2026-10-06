'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, MessageCircle, Heart, Info, ShieldX, UserPlus, Swords, Trophy, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ElementType } from 'react'
import {
  useNotificationStore,
  type Notification as AppNotification,
  type NotificationType,
} from '@/lib/store/notificationStore'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { resolveNotificationContent } from '@/lib/notification-resolver'
import { useAuthStore } from '@/lib/store/authStore'
import { useModuleEnabled } from '@/components/TenantProvider'

const TYPE_ICONS: Record<NotificationType, ElementType> = {
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

const TYPE_ROUTES: Record<NotificationType, string> = {
  message:       '/chat',
  match:         '/notifications',
  system:        '/notifications',
  ban:           '/notifications',
  request:       '/requests',
  beef_request:  '/beef',
  beef_accepted: '/notifications',
  beef_won:      '/notifications',
  beef_lost:     '/notifications',
}

function relativeTime(
  dateString: string,
  rt: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string; daysAgoPlural: string }
): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return rt.justNow
  if (mins < 60) return rt.minutesAgo.replace('{mins}', String(mins))
  const hours = Math.floor(mins / 60)
  if (hours < 24) return rt.hoursAgo.replace('{hours}', String(hours))
  const days = Math.floor(hours / 24)
  return (days === 1 ? rt.daysAgo : rt.daysAgoPlural).replace('{days}', String(days))
}

interface IncomingRequest {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

type IncomingEnvelope = IncomingRequest[] | { data: IncomingRequest[] }

function normaliseRequests(res: IncomingEnvelope): IncomingRequest[] {
  return Array.isArray(res) ? res : (res?.data ?? [])
}

export function NotificationBell() {
  const pathname = usePathname()
  const router   = useRouter()
  const { t }    = useTranslation()

  const [bellOpen, setBellOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'neu' | 'verlauf'>('neu')
  const bellRef = useRef<HTMLDivElement>(null)

  const seenRequestIdsRef = useRef(new Set<string>())
  const hasFetched        = useRef(false)

  const accessToken   = useAuthStore((s) => s.accessToken)
  const chatEnabled   = useModuleEnabled('chat')
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadCount   = useNotificationStore((s) => s.unreadCount)
  const displayUnread = pathname.startsWith('/chat/')
    ? notifications.filter((n) => !n.is_read && n.type !== 'message').length
    : unreadCount

  useEffect(() => {
    if (!accessToken || hasFetched.current) return
    hasFetched.current = true

    async function load() {
      try {
        const data = await fetchApi<AppNotification[]>('/notifications')
        useNotificationStore.getState().setNotifications(data)
      } catch {}

      if (chatEnabled) try {
        const res = await fetchApi<IncomingEnvelope>('/chat/requests/incoming')
        const pending = normaliseRequests(res).filter((r) => r.status === 'pending')
        pending.forEach((r) => seenRequestIdsRef.current.add(r.id))
      } catch {}
    }
    load()
  }, [accessToken, chatEnabled])

  useEffect(() => {
    if (!bellOpen) return
    function onOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [bellOpen])

  function handleNotificationClick(n: AppNotification) {
    setBellOpen(false)
    router.push(TYPE_ROUTES[n.type])
  }

  async function handleMarkAllRead() {
    useNotificationStore.getState().markAllRead()
    try { await fetchApi('/notifications/read-all', { method: 'PATCH' }) } catch {}
  }

  async function handleDelete(n: AppNotification) {
    if (!n._local) {
      try { await fetchApi(`/notifications/${n.id}`, { method: 'DELETE' }) } catch { return }
    }
    useNotificationStore.getState().removeNotification(n.id)
  }

  const tabNotifications = notifications
    .filter((n) => activeTab === 'neu' ? !n.is_read : n.is_read)
    .slice(0, 5)

  return (
    <div className="relative" ref={bellRef}>
      <button
        aria-label={`${t.notifications.label}${displayUnread > 0 ? `, ${displayUnread} ungelesen` : ''}`}
        aria-expanded={bellOpen}
        onClick={() => setBellOpen((v) => !v)}
        className="relative p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        style={displayUnread > 0 ? {
          outline: '2px solid var(--color-nav-badge-glow)',
          outlineOffset: '1px',
          animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        } : undefined}
      >
        <Bell size={20} aria-hidden />
        {displayUnread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none"
            style={{
              background: 'var(--color-nav-badge-glow)',
              color: 'var(--color-surface-container-lowest)',
            }}
          >
            {displayUnread > 9 ? '9+' : displayUnread}
          </span>
        )}
      </button>

      {bellOpen && (
        <div
          role="dialog"
          aria-label={t.notifications.label}
          className="fixed top-16 left-2 right-2 md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-80 rounded-2xl bg-surface-container border border-outline-variant shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
            <span className="text-sm font-semibold text-on-surface">{t.notifications.label}</span>
            {activeTab === 'neu' && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary-fixed-dim hover:opacity-75 transition-opacity"
              >
                {t.notifications.markAllRead}
              </button>
            )}
          </div>

          <div className="flex border-b border-outline-variant">
            {(['neu', 'verlauf'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === tab
                    ? 'text-primary-fixed-dim border-b-2 border-primary-fixed-dim'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab === 'neu'
                  ? unreadCount > 0 ? `${t.notifications.tabNew} (${unreadCount})` : t.notifications.tabNew
                  : t.notifications.tabHistory}
              </button>
            ))}
          </div>

          {tabNotifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-on-surface-variant">
              {activeTab === 'neu' ? t.notifications.emptyNew : t.notifications.emptyHistory}
            </p>
          ) : (
            <ul>
              {tabNotifications.map((n) => {
                const Icon = TYPE_ICONS[n.type]
                return (
                  <li
                    key={n.id}
                    className={`flex items-stretch ${
                      !n.is_read ? 'border-l-2 border-primary-fixed-dim bg-surface-container-low' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleNotificationClick(n)}
                      className="flex-1 flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-container-high transition-colors"
                    >
                      <Icon
                        size={16}
                        className={`mt-0.5 flex-shrink-0 ${
                          !n.is_read ? 'text-primary-fixed-dim' : 'text-on-surface-variant'
                        }`}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug truncate ${
                          !n.is_read ? 'text-on-surface font-medium' : 'text-on-surface-variant'
                        }`}>
                          {resolveNotificationContent(n, t)}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {relativeTime(n.created_at, t.relativeTime)}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDelete(n)}
                      className="flex-shrink-0 px-3 text-on-surface-variant/40 hover:text-error transition-colors"
                      aria-label={t.notifications.deleteNotification}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="border-t border-outline-variant px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setBellOpen(false)}
              className="block text-center text-xs font-medium text-primary-fixed-dim hover:opacity-75 transition-opacity"
            >
              {t.notifications.showAll}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
