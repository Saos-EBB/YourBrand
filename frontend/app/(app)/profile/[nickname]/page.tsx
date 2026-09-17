'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MapPin, Loader2, AlertCircle, Flag, Ban, Swords } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store/authStore'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { blurText } from '@/lib/profanity'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import AudioPlayer from '@/components/ui/AudioPlayer'
import ReportModal from '@/components/ui/ReportModal'
import { useConnectionAction, type ConnectionStatus } from '@/hooks/useConnectionAction'
import { useTranslation } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicProfile {
  id: string
  userId: string
  nickname: string
  birthdate: string | null
  bio: string | null
  city: string | null
  gender: string | null
  lookingFor: string | null
  photoUrl: string | null
  photoNeedsReview: boolean
  audioUrl: string | null
  isOnline: boolean
  statusVisible: boolean
  statusMessage: string | null
  connectionStatus?: ConnectionStatus
  requestId?: string | null
  conversationId?: string | null
  publicId?: string | null
}

interface Interest {
  id: string
  name_de: string
  name_en: string | null
  category: string | null
}

interface UserInterest {
  id: string
  user_id: string
  interest_id: string
  is_green: boolean
  interest: Interest
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJwtRole(token: string | null): string | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const decoded = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return decoded.role ?? null
  } catch {
    return null
  }
}

function calcAge(birthdate: string): number {
  return Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicProfilePage() {
  const { nickname } = useParams<{ nickname: string }>()
  const { t, locale } = useTranslation()

  const [profile, setProfile]           = useState<PublicProfile | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [interests, setInterests]       = useState<UserInterest[]>([])
  const [loading, setLoading]           = useState(true)
  const [notFound, setNotFound]         = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [photoUrl, setPhotoUrl]         = useState<string | null>(null)

  const [audioUrl, setAudioUrl]           = useState<string | null>(null)

  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false)
  const [reportOpen, setReportOpen]                 = useState(false)
  const [blockConfirmOpen, setBlockConfirmOpen]     = useState(false)

  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const isHidden = useHiddenStore((s) => s.isHidden)
  const isAdmin = getJwtRole(accessToken) === 'admin'
  const profanityFilter = useAuthStore((s) => (s.user as any)?.profanity_filter as boolean ?? true)
  const [adminChatLoading, setAdminChatLoading] = useState(false)
  const conn = useConnectionAction(
    profile?.userId ?? '',
    profile?.connectionStatus ?? 'NONE',
    profile?.requestId ?? null,
    profile?.conversationId ?? null,
  )

  const GENDER_LABELS: Record<string, string> = {
    male:       t.publicProfile.genderMale,
    female:     t.publicProfile.genderFemale,
    non_binary: t.publicProfile.genderNonBinary,
    diverse:    t.publicProfile.genderDiverse,
  }

  const LOOKING_FOR_LABELS: Record<string, string> = {
    friendship:   t.publicProfile.lookingForFriendship,
    relationship: t.publicProfile.lookingForRelationship,
    exchange:     t.publicProfile.lookingForExchange,
    all:          t.publicProfile.lookingForAll,
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [pubResult, ownResult, interestsResult] = await Promise.allSettled([
          fetchApi<PublicProfile>(`/profile/${encodeURIComponent(nickname)}`),
          fetchApi<{ nickname: string }>('/profile/me'),
          fetchApi<UserInterest[]>(`/profile/${encodeURIComponent(nickname)}/interests`),
        ])

        if (pubResult.status === 'rejected') {
          if (pubResult.reason instanceof Error && pubResult.reason.message === 'Session expired') return
          const msg = pubResult.reason instanceof Error ? pubResult.reason.message : ''
          if (msg === 'Profil nicht gefunden') {
            setNotFound(true)
          } else {
            setError(msg || t.publicProfile.loadError)
          }
          return
        }

        const prof = pubResult.value
        setProfile(prof)
        if (prof.photoUrl) {
          try { setPhotoUrl(new URL(prof.photoUrl).pathname) } catch { setPhotoUrl(prof.photoUrl) }
        }
        if (prof.audioUrl) {
          try { setAudioUrl(new URL(prof.audioUrl).pathname) } catch { setAudioUrl(prof.audioUrl) }
        }

        if (ownResult.status === 'fulfilled') {
          setIsOwnProfile(ownResult.value.nickname === nickname)
        }

        if (interestsResult.status === 'fulfilled') {
          setInterests(interestsResult.value)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [nickname])

  // ── Loading / not found / error ────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-on-surface-variant animate-spin" aria-label={t.common.loading} />
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <AlertCircle className="h-10 w-10 text-on-surface-variant" aria-hidden="true" />
        <p className="text-on-surface font-semibold">{t.publicProfile.notFound}</p>
        <p className="text-on-surface-variant text-sm">
          {t.publicProfile.notFoundDesc}
        </p>
      </main>
    )
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <AlertCircle className="h-10 w-10 text-error" aria-hidden="true" />
        <p className="text-on-surface font-semibold">{t.publicProfile.loadError}</p>
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

  // ── Admin direct chat ──────────────────────────────────────────────────────

  async function handleAdminChat() {
    if (!profile || adminChatLoading) return
    setAdminChatLoading(true)
    try {
      const result = await fetchApi<{ conversation_id: string }>('/admin/conversations', {
        method: 'POST',
        body: JSON.stringify({ target_user_id: profile.userId }),
      })
      router.push(`/chat/${result.conversation_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.publicProfile.chatOpenError)
    } finally {
      setAdminChatLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background pb-28 md:pb-8">
      <div className="max-w-md mx-auto px-6 py-8">
        <div className="flex flex-col items-center">

          {/* ── Photo ──────────────────────────────────────────────────────── */}
          <div className="relative w-full aspect-square mb-5">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={t.profile.profilePhoto}
                loading="lazy"
                className={`w-full h-full object-cover rounded-3xl${profile.photoNeedsReview ? ' blur-sm ring-2 ring-error' : ''}`}
              />
            ) : (
              <div className="w-full h-full rounded-3xl bg-surface-container-high flex items-center justify-center">
                <span className="text-8xl font-bold text-on-surface-variant select-none">
                  {profile.nickname.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {profile.photoNeedsReview && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-error/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm whitespace-nowrap pointer-events-none">
                {t.publicProfile.underReview}
              </div>
            )}

            {/* Nickname + age — bottom left */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl">
              <h1 className="text-2xl font-bold text-white leading-tight">{profile.nickname}</h1>
              {profile.birthdate && (
                <p className="text-sm text-white/70 mt-0.5">{calcAge(profile.birthdate)} {t.publicProfile.years}</p>
              )}
              {profile.publicId && (
                <p className="text-xs text-white/50 mt-0.5 font-mono">#ID-{profile.publicId}</p>
              )}
            </div>

            {/* Location + online — bottom right */}
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-xl">
              {profile.city && (
                <div className="flex items-center gap-1.5 text-white text-sm mb-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span>{profile.city}</span>
                </div>
              )}
              <OnlineIndicator
                is_online={profile.isOnline}
                status_message={profanityFilter && profile.statusMessage ? blurText(profile.statusMessage) : profile.statusMessage}
                size="sm"
              />
            </div>
          </div>

          {/* ── Gender / Looking for ───────────────────────────────────────── */}
          {(profile.gender && profile.gender !== 'not_specified' || profile.lookingFor) && (
            <div className="w-full flex flex-wrap gap-2 mb-5">
              {profile.gender && profile.gender !== 'not_specified' && GENDER_LABELS[profile.gender] && (
                <span className="px-4 py-2 rounded-full bg-surface-container text-on-surface text-sm">
                  {GENDER_LABELS[profile.gender]}
                </span>
              )}
              {profile.lookingFor && LOOKING_FOR_LABELS[profile.lookingFor] && (
                <span className="px-4 py-2 rounded-full bg-surface-container text-on-surface text-sm">
                  {LOOKING_FOR_LABELS[profile.lookingFor]}
                </span>
              )}
            </div>
          )}

          {/* ── Audio ────────────────────────────────────────────────────── */}
          {audioUrl && (
            <div className="w-full mb-5">
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide text-center mb-3">
                {t.publicProfile.introduction}
              </p>
              <AudioPlayer src={audioUrl} />
            </div>
          )}

          {/* ── Bio ───────────────────────────────────────────────────────── */}
          {profile.bio && (
            <div className="w-full bg-surface-container rounded-2xl p-6 mb-5">
              <p className="text-on-surface leading-relaxed text-center">
                {profanityFilter ? blurText(profile.bio) : profile.bio}
              </p>
            </div>
          )}

          {/* ── Interests ─────────────────────────────────────────────────── */}
          {interests.length > 0 && (
            <div className="w-full mb-6">
              <h3 className="text-xs font-medium text-on-surface-variant mb-3 text-center uppercase tracking-wide">
                {t.publicProfile.interests}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {interests.map((ui) => (
                  <span
                    key={ui.interest_id}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm ${
                      ui.is_green
                        ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                        : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                    }`}
                  >
                    <span aria-hidden="true">{ui.is_green ? '💚' : '🚩'}</span>
                    {locale === 'en' && ui.interest.name_en ? ui.interest.name_en : ui.interest.name_de}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Actions (other profiles only) ─────────────────────────────── */}
          {!isOwnProfile && (
            <div className="w-full space-y-3">

              {conn.error && (
                <div className="flex items-center gap-2 rounded-xl bg-error-container text-error px-4 py-3 text-sm" role="alert">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {conn.error}
                </div>
              )}

              {/* Connection state */}
              {conn.connectionStatus === 'NONE' && !isAdmin && (
                <button
                  onClick={() => conn.sendRequest()}
                  disabled={conn.isLoading}
                  className="w-full py-4 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {conn.isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.publicProfile.connect}
                </button>
              )}

              {/* Admin: direct message without connection */}
              {isAdmin && (
                <button
                  onClick={handleAdminChat}
                  disabled={adminChatLoading}
                  className="w-full py-4 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {adminChatLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.publicProfile.message}
                </button>
              )}

              {conn.connectionStatus === 'SENT' && (
                <div
                  className="w-full py-4 rounded-full bg-surface-container-high text-primary-fixed-dim font-semibold text-center"
                  role="status"
                  aria-live="polite"
                >
                  {t.publicProfile.pending}
                </div>
              )}

              {conn.connectionStatus === 'RECEIVED' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => conn.acceptRequest()}
                    disabled={conn.isLoading}
                    className="flex-1 py-4 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {conn.isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {t.publicProfile.accept}
                  </button>
                  <button
                    onClick={() => conn.declineRequest()}
                    disabled={conn.isLoading}
                    className="flex-1 py-4 rounded-full border border-outline-variant text-on-surface font-semibold hover:bg-surface-container active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t.publicProfile.decline}
                  </button>
                </div>
              )}

              {conn.connectionStatus === 'CONNECTED' && (
                <div className="space-y-2">
                  <div
                    className="w-full py-4 rounded-full bg-surface-container-high text-primary-fixed-dim font-semibold text-center"
                    role="status"
                    aria-live="polite"
                  >
                    {t.publicProfile.connected}
                  </div>
                  <button
                    onClick={() => conn.conversationId && router.push(`/chat/${conn.conversationId}`)}
                    disabled={!conn.conversationId}
                    className="w-full py-4 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Mit ${profile.nickname} chatten`}
                  >
                    {t.publicProfile.chat}
                  </button>
                  <button
                    onClick={() => setDisconnectConfirmOpen(true)}
                    className="w-full py-4 rounded-full border border-outline-variant text-on-surface font-semibold hover:bg-surface-container active:scale-95 transition-all"
                  >
                    {t.publicProfile.disconnect}
                  </button>
                </div>
              )}

              {conn.connectionStatus === 'BLOCKED' && (
                <div className="space-y-2">
                  <div
                    className="w-full py-4 rounded-full bg-surface-container-high text-on-surface-variant font-semibold text-center"
                    role="status"
                  >
                    {t.publicProfile.blocked}
                  </div>
                  <button
                    onClick={() => conn.unblock()}
                    disabled={conn.isLoading}
                    className="w-full py-4 rounded-full border border-outline-variant text-on-surface-variant font-semibold hover:bg-surface-container active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {conn.isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {t.publicProfile.unblock}
                  </button>
                </div>
              )}

              {/* Report button */}
              <button
                onClick={() => setReportOpen(true)}
                className="w-full py-3 rounded-full border border-outline-variant text-on-surface-variant text-sm font-medium hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Flag className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {t.publicProfile.report}
              </button>

              {/* Block button — hidden when already blocked */}
              {conn.connectionStatus !== 'BLOCKED' && (
                <button
                  onClick={() => setBlockConfirmOpen(true)}
                  className="w-full py-3 rounded-full border border-outline-variant text-on-surface-variant text-sm font-medium hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Ban className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {t.publicProfile.block}
                </button>
              )}

              {/* Beef starten — only in Hidden Zone, only on other profiles */}
              {isHidden && conn.connectionStatus !== 'BLOCKED' && (
                <button
                  onClick={() => router.push(`/beef?create=1&targetId=${profile.userId}&targetNickname=${encodeURIComponent(profile.nickname)}`)}
                  className="w-full py-3 rounded-full border-2 border-primary-fixed-dim text-primary-fixed-dim text-sm font-semibold hover:bg-primary-fixed-dim/10 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Swords className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  Beef starten
                </button>
              )}
            </div>
          )}

          {/* Disconnect confirmation modal */}
          {disconnectConfirmOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
              role="dialog"
              aria-modal="true"
              aria-label={t.publicProfile.disconnectTitle}
            >
              <div className="bg-surface-container-high rounded-2xl p-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="font-semibold text-on-surface">{t.publicProfile.disconnectTitle}</p>
                  <p className="text-sm text-on-surface-variant">
                    {t.publicProfile.disconnectDesc}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    onClick={async () => { if (await conn.disconnect()) setDisconnectConfirmOpen(false) }}
                    disabled={conn.isLoading}
                    className="flex-1 py-3 rounded-full bg-error-container text-error font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {conn.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {t.publicProfile.disconnect}
                  </button>
                  <button
                    onClick={() => setDisconnectConfirmOpen(false)}
                    disabled={conn.isLoading}
                    className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Block user confirmation modal */}
          {blockConfirmOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
              role="dialog"
              aria-modal="true"
              aria-label={t.publicProfile.blockTitle}
            >
              <div className="bg-surface-container-high rounded-2xl p-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="font-semibold text-on-surface">{t.publicProfile.blockTitle}</p>
                  <p className="text-sm text-on-surface-variant">
                    {t.publicProfile.blockDesc}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    onClick={async () => { if (await conn.block()) setBlockConfirmOpen(false) }}
                    disabled={conn.isLoading}
                    className="flex-1 py-3 rounded-full bg-error-container text-error font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {conn.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {t.publicProfile.blockConfirm}
                  </button>
                  <button
                    onClick={() => setBlockConfirmOpen(false)}
                    disabled={conn.isLoading}
                    className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Report modal */}
          {reportOpen && (
            <ReportModal
              reportedUserId={profile.userId}
              onClose={() => setReportOpen(false)}
            />
          )}

        </div>
      </div>
    </main>
  )
}
