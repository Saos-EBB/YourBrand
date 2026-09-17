'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Heart, X, MapPin, Users, UserRoundX,
  Sparkles, RefreshCw, CheckCircle2,
  MessageCircle, Calendar, AlertCircle,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeckInterest {
  name_de: string
  name_en: string | null
  is_green: boolean
}

interface DeckCandidate {
  user_id: string
  nickname: string
  photo_url: string | null
  city: string | null
  age: number
  gender: string | null
  looking_for: string | null
  bio: string | null
  distance_km: number | null
  match_score: number
  interests: DeckInterest[]
}

interface SwipeResult {
  matched: boolean
  conversation_id: string | null
}

interface MatchListItem {
  match_id: string
  conversation_id: string | null
  matched_at: string
  nickname: string
  age: number | null
  city: string | null
  photo_url: string | null
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function toProxyUrl(url: string | null): string | null {
  if (!url) return null
  return url.replace('http://localhost:3000', '')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Swipe components ─────────────────────────────────────────────────────────

function InterestTag({ interest }: { interest: DeckInterest }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
        interest.is_green
          ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
          : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
      }`}
    >
      <span>{interest.is_green ? '💚' : '🚩'}</span>
      {interest.name_de}
    </span>
  )
}

function SwipeCard({ candidate }: { candidate: DeckCandidate }) {
  const { t } = useTranslation()
  return (
    <article
      className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden shadow-xl"
      style={{ background: 'var(--color-surface-container)' }}
    >
      <div className="relative aspect-[3/4] bg-surface-container-high overflow-hidden">
        {candidate.photo_url ? (
          <img
            src={toProxyUrl(candidate.photo_url)!}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Users className="h-16 w-16 text-outline" aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-1">
          <div className="flex items-end gap-2">
            <Link
              href={`/profile/${candidate.nickname}`}
              className="text-white font-bold text-xl leading-tight hover:underline"
            >
              {candidate.nickname}
            </Link>
            <span className="text-white/80 text-lg font-medium">{candidate.age}</span>
          </div>
          {candidate.city && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-white/70 flex-shrink-0" aria-hidden />
              <span className="text-white/80 text-sm">
                {candidate.city}
                {candidate.distance_km != null && (
                  <span className="text-white/60"> · {candidate.distance_km} {t.discover.km}</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {candidate.bio && (
          <p className="text-on-surface-variant text-sm line-clamp-2">{candidate.bio}</p>
        )}
        {candidate.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.interests.slice(0, 6).map((i, idx) => (
              <InterestTag key={idx} interest={i} />
            ))}
          </div>
        )}
        {candidate.interests.length === 0 && (
          <p className="text-on-surface-variant/50 text-xs italic">Keine Interessen angegeben</p>
        )}
      </div>
    </article>
  )
}

function SwipeTab({ onMatch }: { onMatch: (nickname: string) => void }) {
  const { t } = useTranslation()
  const [deck, setDeck] = useState<DeckCandidate[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [limitError, setLimitError] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [swiping, setSwiping] = useState(false)
  const [swipeDir, setSwipeDir] = useState<'like' | 'skip' | null>(null)
  const swipeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadDeck()
    return () => {
      if (swipeTimeout.current) clearTimeout(swipeTimeout.current)
      if (advanceTimeout.current) clearTimeout(advanceTimeout.current)
    }
  }, [])

  async function loadDeck() {
    setLoading(true)
    setError(null)
    setLimitError(false)
    setIdx(0)
    try {
      const data = await fetchApi<DeckCandidate[]>('/discover/deck')
      setDeck(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err instanceof Error && err.message === 'Session expired') return
      setError(err instanceof Error ? err.message : t.discover.swipeError)
    } finally {
      setLoading(false)
    }
  }

  async function handleSwipe(action: 'like' | 'skip') {
    if (swiping || idx >= deck.length) return
    const candidate = deck[idx]
    setSwiping(true)
    setSwipeDir(action)

    try {
      const result = await fetchApi<SwipeResult>('/discover/swipe', {
        method: 'POST',
        body: JSON.stringify({ target_user_id: candidate.user_id, action }),
      })
      if (result.matched) {
        onMatch(candidate.nickname)
        advanceTimeout.current = setTimeout(() => advance(), 2000)
      } else {
        advance()
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Swipe-Limit')) {
        setLimitError(true)
      } else if (err instanceof Error && err.message !== 'Session expired') {
        setError(err.message)
      }
    } finally {
      setSwiping(false)
      swipeTimeout.current = setTimeout(() => setSwipeDir(null), 300)
    }
  }

  function advance() {
    setIdx(i => i + 1)
    setSwipeDir(null)
  }

  const current = deck[idx]
  const hasMore = idx < deck.length

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-primary-fixed-dim/30 border-t-primary-fixed-dim animate-spin" aria-hidden />
        <p className="text-on-surface-variant text-sm">{t.common.loading}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <UserRoundX className="h-12 w-12 text-error" aria-hidden />
        <p className="text-on-surface font-semibold">{t.discover.swipeError}</p>
        <p className="text-on-surface-variant text-sm">{error}</p>
        <button
          onClick={loadDeck}
          className="px-6 py-2.5 rounded-full font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity flex items-center gap-2"
          style={{ background: 'var(--color-primary-fixed-dim)', color: 'var(--color-on-primary-container)' }}
        >
          <RefreshCw size={14} aria-hidden /> {t.common.retry}
        </button>
      </div>
    )
  }

  if (limitError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 max-w-xs mx-auto">
        <div className="text-4xl">⏳</div>
        <p className="text-on-surface font-semibold">{t.discover.swipeLimitReached}</p>
        <p className="text-on-surface-variant text-sm">{t.discover.swipeLimitDesc}</p>
      </div>
    )
  }

  async function handleResetSwipes() {
    setResetting(true)
    try {
      await fetchApi('/discover/swipes', { method: 'DELETE' })
      await loadDeck()
    } catch {
      // ignore
    } finally {
      setResetting(false)
    }
  }

  if (!hasMore) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <Sparkles className="h-12 w-12 text-on-surface-variant" aria-hidden />
        <p className="text-on-surface font-semibold">{t.discover.swipeEmpty}</p>
        <p className="text-on-surface-variant text-sm">{t.discover.swipeEmptyDesc}</p>
        <button
          onClick={loadDeck}
          className="px-6 py-2.5 rounded-full font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity flex items-center gap-2"
          style={{ background: 'var(--color-primary-fixed-dim)', color: 'var(--color-on-primary-container)' }}
        >
          <RefreshCw size={14} aria-hidden /> Neu laden
        </button>
        <button
          onClick={handleResetSwipes}
          disabled={resetting}
          className="px-6 py-2.5 rounded-full font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity flex items-center gap-2 border border-outline-variant text-on-surface-variant disabled:opacity-50"
        >
          <RefreshCw size={14} className={resetting ? 'animate-spin' : ''} aria-hidden />
          Swipes zurücksetzen
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 pb-6">
      {/* Interest nudge */}
      <div
        className="w-full max-w-sm mx-auto px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"
        style={{
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        <Sparkles size={14} className="text-primary-fixed-dim flex-shrink-0" aria-hidden />
        <span className="text-on-surface-variant flex-1">{t.discover.interestNudge}</span>
        <Link
          href="/profile"
          className="text-sm font-semibold whitespace-nowrap"
          style={{ color: 'var(--color-primary-fixed-dim)' }}
        >
          {t.discover.interestNudgeLink}
        </Link>
      </div>

      {/* Card with swipe animation */}
      <div
        className="w-full transition-all duration-200"
        style={{
          transform: swipeDir === 'like'
            ? 'translateX(8px) rotate(1.5deg)'
            : swipeDir === 'skip'
            ? 'translateX(-8px) rotate(-1.5deg)'
            : 'none',
          opacity: swiping ? 0.85 : 1,
        }}
      >
        <SwipeCard candidate={current} />
      </div>

      {/* Counter */}
      <p className="text-on-surface-variant text-xs">
        {idx + 1} / {deck.length}
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-8">
        <button
          onClick={() => handleSwipe('skip')}
          disabled={swiping}
          aria-label={t.discover.swipeSkip}
          className="h-16 w-16 rounded-full flex items-center justify-center shadow-lg border-2 border-red-500/40 bg-surface-container hover:bg-red-500/10 active:scale-95 disabled:opacity-40 transition-all"
        >
          <X className="h-7 w-7 text-red-400" aria-hidden />
        </button>

        <button
          onClick={() => handleSwipe('like')}
          disabled={swiping}
          aria-label={t.discover.swipeLike}
          className="h-16 w-16 rounded-full flex items-center justify-center shadow-lg border-2 border-green-500/40 bg-surface-container hover:bg-green-500/10 active:scale-95 disabled:opacity-40 transition-all"
        >
          <Heart className="h-7 w-7 text-green-400" fill="currentColor" aria-hidden />
        </button>
      </div>
    </div>
  )
}

// ─── Matches List ─────────────────────────────────────────────────────────────

function MatchSkeletonCard() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-container animate-pulse">
      <div className="w-16 h-16 rounded-full bg-surface-variant flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 bg-surface-variant rounded" />
        <div className="h-3 w-1/2 bg-surface-variant rounded" />
        <div className="h-3 w-1/4 bg-surface-variant rounded" />
      </div>
      <div className="h-9 w-10 bg-surface-variant rounded-xl" />
    </div>
  )
}

function MatchCard({ match }: { match: MatchListItem }) {
  const { t } = useTranslation()
  const router = useRouter()

  const dateLabel = t.matches.matchedOn.replace('{date}', formatDate(match.matched_at))
  const photoSrc = toProxyUrl(match.photo_url)
  const canChat = !!match.conversation_id

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-container">
      <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-surface-variant">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt={match.nickname} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Heart className="h-6 w-6 text-on-surface-variant" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-surface truncate">
          {match.nickname}
          {match.age != null && (
            <span className="font-normal text-on-surface-variant">, {match.age}</span>
          )}
        </p>
        {match.city && (
          <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
            <MapPin size={11} aria-hidden />
            <span>{match.city}</span>
          </p>
        )}
        <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
          <Calendar size={11} aria-hidden />
          <span>{dateLabel}</span>
        </p>
      </div>

      <button
        onClick={() => canChat && router.push(`/chat/${match.conversation_id}`)}
        disabled={!canChat}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-opacity
          disabled:opacity-40 disabled:cursor-not-allowed
          bg-primary text-on-primary hover:opacity-90"
        title={canChat ? t.matches.openChat : t.matches.chatUnavailable}
      >
        <MessageCircle size={14} aria-hidden />
        <span className="hidden sm:inline">
          {canChat ? t.matches.openChat : t.matches.chatUnavailable}
        </span>
      </button>
    </div>
  )
}

function MatchesTab() {
  const { t } = useTranslation()
  const [matches, setMatches] = useState<MatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const data = await fetchApi<MatchListItem[]>('/discover/matches')
      setMatches(Array.isArray(data) ? data : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t.common.loading}>
        <MatchSkeletonCard />
        <MatchSkeletonCard />
        <MatchSkeletonCard />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertCircle className="h-12 w-12 text-error" aria-hidden />
        <p className="text-on-surface-variant text-sm">{t.matches.loadError}</p>
        <button
          onClick={load}
          className="px-4 py-2 text-sm font-medium rounded-xl bg-primary text-on-primary"
        >
          {t.common.retry}
        </button>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Heart className="h-14 w-14 text-primary-fixed-dim" fill="currentColor" aria-hidden />
        <h2 className="text-lg font-semibold text-on-surface">{t.matches.empty}</h2>
        <p className="text-on-surface-variant text-sm max-w-xs">{t.matches.emptyDesc}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {matches.map(m => <MatchCard key={m.match_id} match={m} />)}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchingPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'swipe' | 'matches'>('swipe')
  const [matchBanner, setMatchBanner] = useState<string | null>(null)
  const bannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (bannerTimeout.current) clearTimeout(bannerTimeout.current)
    }
  }, [])

  function handleMatch(nickname: string) {
    if (bannerTimeout.current) clearTimeout(bannerTimeout.current)
    setMatchBanner(nickname)
    bannerTimeout.current = setTimeout(() => setMatchBanner(null), 2000)
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 pb-24 sm:pb-8 space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">{t.nav.matches}</h1>

      {/* Match flash banner */}
      {matchBanner && (
        <div
          className="w-full max-w-sm mx-auto flex items-center gap-3 px-4 py-3 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300"
          style={{ background: 'var(--color-primary-fixed-dim)', color: 'var(--color-on-primary-container)' }}
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 size={20} aria-hidden />
          <span className="flex-1 font-semibold text-sm">
            {t.discover.matchTitle} — {matchBanner}!
          </span>
          <button
            onClick={() => { setMatchBanner(null); setTab('matches') }}
            className="text-xs font-bold underline underline-offset-2 whitespace-nowrap"
          >
            {t.matches.title}
          </button>
        </div>
      )}

      {/* Tab selector */}
      <div
        className="flex rounded-xl p-1 gap-1"
        style={{ background: 'var(--color-surface-container)' }}
        role="tablist"
      >
        {(['swipe', 'matches'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id
                ? 'text-on-primary-container shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            style={tab === id ? { background: 'var(--color-primary-fixed-dim)' } : {}}
          >
            {id === 'swipe' ? t.discover.tabSwipe : t.matches.title}
          </button>
        ))}
      </div>

      {tab === 'swipe' ? <SwipeTab onMatch={handleMatch} /> : <MatchesTab />}
    </main>
  )
}
