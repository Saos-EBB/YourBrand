'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Bell, ChevronRight, Compass, Crown, Heart, Loader2,
  MessageCircle, Shield, UserCheck, UserPlus,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useAuthStore, selectUserRole } from '@/lib/store/authStore'
import { useNotificationStore } from '@/lib/store/notificationStore'
import { useUnreadMessageCount } from '@/hooks/useUnreadMessageCount'
import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserStats {
  pendingRequests: number
  activeConversations: number
  subscription: { plan: string; status: string; expires_at: string | null } | null
}

interface AdminStats {
  openReports: number
  openTickets: number
  strikesThisWeek: number
  pendingMedia: number
}

interface OwnerStats {
  totalUsers: number
  activeUsers: number
  bannedUsers: number
  newUsersToday: number
  newUsersThisWeek: number
  activeSubscriptions: number
  totalRevenue: number
  onlineUsers: number
  messagesToday: number
  messagesThisWeek: number
  contactRequestsToday: number
  contactRequestsThisWeek: number
  openReports: number
  strikesThisWeek: number
  openTickets: number
  pendingMedia: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtExpiry(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
}

function SkeletonPulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-container-high ${className}`} />
}

function NotifIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 text-primary-fixed-dim'
  if (type === 'match') return <Heart className={cls} />
  if (type === 'message') return <MessageCircle className={cls} />
  if (type === 'request') return <UserPlus className={cls} />
  if (type === 'accepted') return <UserCheck className={cls} />
  return <Bell className={cls} />
}

// Compact stat card used in all stat grids
function StatCard({
  label,
  value,
  href,
  alert = false,
  loading = false,
}: {
  label: string
  value?: string | number | null
  href?: string
  alert?: boolean
  loading?: boolean
}) {
  const needsAttention = alert && typeof value === 'number' && value > 0
  const cls = [
    'rounded-xl border p-3 flex flex-col gap-1 transition-all',
    needsAttention
      ? 'bg-error-container/15 border-error/30'
      : 'bg-surface-container-high border-outline-variant',
    href ? 'cursor-pointer hover:opacity-80 active:scale-[0.98]' : '',
  ].join(' ')

  const inner = (
    <div className={cls}>
      <p className="text-xs text-on-surface-variant truncate">{label}</p>
      {loading ? (
        <div className="h-6 w-12 rounded bg-outline-variant/40 animate-pulse mt-0.5" />
      ) : (
        <p className={`text-xl font-bold tabular-nums mt-0.5 ${needsAttention ? 'text-error' : 'text-on-surface'}`}>
          {value != null ? value.toLocaleString('de-DE') : '—'}
        </p>
      )}
      {href && <ChevronRight className="h-3 w-3 text-on-surface-variant self-end" />}
    </div>
  )

  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

function SectionHeading({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-on-surface-variant">{icon}</span>
      <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{label}</h2>
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function StatRowSkeleton({ cols }: { cols: number }) {
  return (
    <div className={`grid gap-2 grid-cols-2 sm:grid-cols-${cols}`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="rounded-xl bg-surface-container-high border border-outline-variant p-3 space-y-1.5 animate-pulse">
          <div className="h-3 w-16 rounded bg-outline-variant/60" />
          <div className="h-6 w-10 rounded bg-outline-variant/40" />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t, locale } = useTranslation()
  const { modules } = useTenant()
  const role = useAuthStore(selectUserRole)
  const user = useAuthStore((s) => s.user)
  const isAdmin = role === 'admin' || role === 'owner'
  const isOwner = role === 'owner'

  // Notifications come from the shared store (populated by NotificationBell)
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadMessageCount = useUnreadMessageCount()
  const [baseLoading, setBaseLoading] = useState(true)

  // Role-based stats
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [userStatsLoading, setUserStatsLoading] = useState(true)

  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [adminStatsLoading, setAdminStatsLoading] = useState(false)

  const [ownerStats, setOwnerStats] = useState<OwnerStats | null>(null)
  const [ownerStatsLoading, setOwnerStatsLoading] = useState(false)

  useEffect(() => {
    if (role === null) return

    // Base data for all users
    fetchApi<UserStats>('/admin/dashboard/user-stats')
      .then((stats) => setUserStats(stats))
      .catch(() => {})
      .finally(() => {
        setBaseLoading(false)
        setUserStatsLoading(false)
      })

    // Admin stats
    if (role === 'admin' || role === 'owner') {
      setAdminStatsLoading(true)
      fetchApi<AdminStats>('/admin/dashboard/admin-stats')
        .then(setAdminStats)
        .catch(() => {})
        .finally(() => setAdminStatsLoading(false))
    }

    // Owner stats
    if (role === 'owner') {
      setOwnerStatsLoading(true)
      fetchApi<OwnerStats>('/admin/dashboard/stats')
        .then(setOwnerStats)
        .catch(() => {})
        .finally(() => setOwnerStatsLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const secs = Math.floor(diff / 1000)
    const mins = Math.floor(secs / 60)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)
    if (secs < 60) return t.relativeTime.justNow
    if (mins < 60) return t.relativeTime.minutesAgo.replace('{mins}', String(mins))
    if (hours < 24) return t.relativeTime.hoursAgo.replace('{hours}', String(hours))
    if (days < 7) return (days === 1 ? t.relativeTime.daysAgo : t.relativeTime.daysAgoPlural).replace('{days}', String(days))
    return new Date(dateStr).toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE')
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length
  const recentNotifs = notifications.slice(0, 3)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 space-y-6 pb-24 sm:pb-8">

      {/* ── Greeting Hero ───────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl bg-surface-container-low border border-outline-variant p-6 space-y-4"
        aria-label={t.dashboard.welcomeArea}
      >
        <div>
          <h1 className="text-2xl font-bold text-on-surface leading-tight flex items-center gap-2">
            {(baseLoading || !user)
              ? <SkeletonPulse className="h-8 w-64 inline-block" />
              : t.dashboard.welcome.replace('{nickname}', (user.nickname as string | undefined) ?? '')}
            {isOwner && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 ml-1">
                <Crown className="h-3 w-3" aria-hidden="true" />
                Owner
              </span>
            )}
            {role === 'admin' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-fixed-dim/30 text-on-primary-container ml-1">
                <Shield className="h-3 w-3" aria-hidden="true" />
                Admin
              </span>
            )}
          </h1>
          <p className="mt-1.5 text-sm text-on-surface-variant">
            {unreadCount > 0
              ? (unreadCount === 1
                  ? t.dashboard.unreadOne.replace('{count}', String(unreadCount))
                  : t.dashboard.unreadMany.replace('{count}', String(unreadCount)))
              : t.dashboard.noNotifications}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {modules.matching && (
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 transition-all"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              {t.dashboard.discover}
            </Link>
          )}
          {modules.chat && (
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 transition-all"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {t.dashboard.messages}
              {unreadMessageCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary-fixed-dim text-on-primary-container text-[10px] font-bold" aria-hidden="true">
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              )}
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 transition-all"
            >
              <Shield className="h-4 w-4" aria-hidden="true" />
              Admin
            </Link>
          )}
        </div>
      </section>

      {/* ── Mein Überblick (user only) ──────────────────────────────────────── */}
      {!isAdmin && <section>
        <SectionHeading label={t.dashboard.myOverview} icon={<UserCheck className="h-3.5 w-3.5" />} />
        {userStatsLoading ? (
          <StatRowSkeleton cols={3} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {modules.chat && <StatCard
              label={t.dashboard.openRequests}
              value={userStats?.pendingRequests}
              href="/chat?tab=requests"
              alert
            />}
            {modules.chat && <StatCard
              label={t.dashboard.activeChats}
              value={userStats?.activeConversations}
              href="/chat"
            />}
            <div className="rounded-xl border border-outline-variant bg-surface-container-high p-3 flex flex-col gap-1">
              <p className="text-xs text-on-surface-variant">{t.dashboard.subscriptionStatus}</p>
              {userStats?.subscription ? (
                <>
                  {/* i18n: backend value — plan name (e.g. "monthly") comes from backend */}
                  <p className="text-lg font-bold text-on-surface capitalize mt-0.5">{userStats.subscription.plan}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t.dashboard.validUntil.replace('{date}', fmtExpiry(userStats.subscription.expires_at))}
                  </p>
                </>
              ) : (
                <p className="text-xl font-bold text-on-surface mt-0.5">{t.dashboard.noSubscription}</p>
              )}
            </div>
          </div>
        )}
      </section>}

      {/* ── Moderations-Überblick (admin + owner) ───────────────────────────── */}
      {isAdmin && (
        <section>
          <SectionHeading label={t.dashboard.moderationOverview} icon={<Shield className="h-3.5 w-3.5" />} />
          {adminStatsLoading ? (
            <StatRowSkeleton cols={4} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard
                label={t.dashboard.openReports}
                value={adminStats?.openReports}
                href="/admin?tab=meldungen"
                alert
              />
              <StatCard
                label={t.dashboard.openTickets}
                value={adminStats?.openTickets}
                href="/admin?tab=tickets"
                alert
              />
              <StatCard
                label={t.dashboard.unverifiedMedia}
                value={adminStats?.pendingMedia}
                href="/admin?tab=medien"
                alert
              />
              <StatCard
                label={t.dashboard.strikesThisWeek}
                value={adminStats?.strikesThisWeek}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Plattform-Übersicht (owner only) ────────────────────────────────── */}
      {isOwner && (
        <section>
          <SectionHeading label={t.dashboard.platformOverview} icon={<Crown className="h-3.5 w-3.5" />} />
          {ownerStatsLoading ? (
            <div className="space-y-2">
              <StatRowSkeleton cols={4} />
              <StatRowSkeleton cols={4} />
              <StatRowSkeleton cols={3} />
              <StatRowSkeleton cols={4} />
            </div>
          ) : (
            <div className="space-y-2">
              {/* Row 1 — Users */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label={t.dashboard.totalUsers}  value={ownerStats?.totalUsers} />
                <StatCard label={t.dashboard.activeUsers} value={ownerStats?.activeUsers} />
                <StatCard label={t.dashboard.bannedUsers} value={ownerStats?.bannedUsers} />
                <StatCard label={t.dashboard.newToday}    value={ownerStats?.newUsersToday} />
              </div>

              {/* Row 2 — Activity */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label={t.dashboard.onlineNow}      value={ownerStats?.onlineUsers} />
                <StatCard label={t.dashboard.messagesToday}  value={ownerStats?.messagesToday} />
                <StatCard label={t.dashboard.requestsToday}  value={ownerStats?.contactRequestsToday} />
                <StatCard label={t.dashboard.newThisWeek}    value={ownerStats?.newUsersThisWeek} />
              </div>

              {/* Row 3 — Business */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatCard label={t.dashboard.activeSubscriptions} value={ownerStats?.activeSubscriptions} />
                <StatCard
                  label={t.dashboard.totalRevenue}
                  value={ownerStats?.totalRevenue != null
                    ? ownerStats.totalRevenue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : undefined}
                />
                <StatCard label={t.dashboard.newSubscriptionsThisWeek} value={ownerStats?.newUsersThisWeek} />
              </div>

              {/* Row 4 — Moderation */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label={t.dashboard.openReports}     value={ownerStats?.openReports}     alert />
                <StatCard label={t.dashboard.strikesThisWeek} value={ownerStats?.strikesThisWeek} />
                <StatCard label={t.dashboard.openTickets}     value={ownerStats?.openTickets}     alert />
                <StatCard label={t.dashboard.unverifiedMedia} value={ownerStats?.pendingMedia}    alert />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Schnellzugriff ───────────────────────────────────────────────────── */}
      <section aria-label={t.dashboard.quickAccess}>
        <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
          {t.dashboard.quickAccess}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {modules.matching && (
            <Link
              href="/discover"
              className="group rounded-2xl bg-surface-container border border-outline-variant p-5 flex flex-col gap-3 hover:bg-surface-container-high active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high group-hover:bg-surface-container-highest transition-colors">
                  <Compass className="h-5 w-5 text-primary-fixed-dim" aria-hidden="true" />
                </div>
                <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-40 group-hover:opacity-100 mt-0.5 transition-opacity" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">{t.dashboard.findPeople}</p>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{t.dashboard.findPeopleDesc}</p>
              </div>
            </Link>
          )}

          {modules.chat && (
            <Link
              href="/chat"
              className="group rounded-2xl bg-surface-container border border-outline-variant p-5 flex flex-col gap-3 hover:bg-surface-container-high active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high group-hover:bg-surface-container-highest transition-colors">
                  <MessageCircle className="h-5 w-5 text-primary-fixed-dim" aria-hidden="true" />
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-primary-fixed-dim text-on-primary-container text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-40 group-hover:opacity-100 mt-0.5 transition-opacity" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-on-surface text-sm">{t.dashboard.messages}</p>
                  {unreadMessageCount > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary-fixed-dim text-on-primary-container text-[9px] font-bold" aria-hidden="true">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{t.dashboard.conversations}</p>
              </div>
            </Link>
          )}

          {modules.chat && (
            <Link
              href="/requests"
              className="group rounded-2xl bg-surface-container border border-outline-variant p-5 flex flex-col gap-3 hover:bg-surface-container-high active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high group-hover:bg-surface-container-highest transition-colors">
                  <UserPlus className="h-5 w-5 text-primary-fixed-dim" aria-hidden="true" />
                  {(userStats?.pendingRequests ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
                      {(userStats!.pendingRequests) > 9 ? '9+' : userStats!.pendingRequests}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-40 group-hover:opacity-100 mt-0.5 transition-opacity" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-on-surface text-sm">{t.dashboard.requests}</p>
                  {(userStats?.pendingRequests ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-error text-on-error text-[9px] font-bold" aria-hidden="true">
                      {(userStats!.pendingRequests) > 9 ? '9+' : userStats!.pendingRequests}
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{t.dashboard.requestsDesc}</p>
              </div>
            </Link>
          )}

        </div>
      </section>

      {/* ── Aktuelle Benachrichtigungen ──────────────────────────────────────── */}
      {recentNotifs.length > 0 && (
        <section aria-label={t.dashboard.recentNotificationsArea}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              {t.dashboard.recentNotifications}
            </h2>
            <Link
              href="/notifications"
              className="text-sm text-primary-fixed-dim font-medium hover:opacity-80 transition-opacity min-h-[44px] flex items-center"
            >
              {t.notifications.showAll}
            </Link>
          </div>
          <ul className="space-y-2" role="list">
            {recentNotifs.map((notif) => (
              <li
                key={notif.id}
                className={`flex items-start gap-3 rounded-xl p-4 border transition-colors ${
                  notif.is_read
                    ? 'bg-surface-container border-outline-variant'
                    : 'bg-surface-container-high border-primary-fixed-dim/20'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-highest" aria-hidden="true">
                  <NotifIcon type={notif.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface leading-snug">{notif.content}</p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    <time dateTime={notif.created_at}>{relativeTime(notif.created_at)}</time>
                  </p>
                </div>
                {!notif.is_read && (
                  <div className="flex-shrink-0 mt-2 h-2 w-2 rounded-full bg-primary-fixed-dim" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  )
}
