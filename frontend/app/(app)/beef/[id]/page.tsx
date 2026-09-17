'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Swords, Send, Trophy } from 'lucide-react'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { useAuthStore } from '@/lib/store/authStore'
import { fetchApi } from '@/lib/api'
import { connectHiddenBeef, disconnectHiddenBeef } from '@/lib/socket'
import { GameOverlay } from '@/components/beef/GameOverlay'
import type { GameType } from '@/components/beef/GameOverlay'
import { useCountdown } from '@/lib/hooks/useCountdown'
import { useTranslation } from '@/lib/i18n'

interface BeefDetail {
  id: string
  initiator_id: string
  target_id: string
  initiator_nickname: string | null
  target_nickname: string | null
  tldr: string
  chat_passage: string
  status: string
  winner_id: string | null
  ends_at: string | null
  initiator_coins: number
  target_coins: number
  total_votes: number
  user_vote: { side: string; coins_wagered: number } | null
  // Game fields (present when status is game_pending or in_game)
  game_type: GameType | null
  game_deadline_at: string | null
  pot_coins: number
  // 5-min post-game comment window
  comment_window_until: string | null
}

interface Comment {
  id: string
  user_id: string
  nickname: string | null
  content: string
  created_at: string
}

const WAGER_PRESETS = [1, 5, 10, 50, 100]

function parsePassage(raw: string): { nickname: string; content: string }[] {
  return raw.split('\n').filter(Boolean).map(line => {
    const m = line.match(/^([^:]+): (.+)$/)
    return m ? { nickname: m[1].trim(), content: m[2] } : { nickname: '', content: line }
  })
}


export default function LiveBeefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useTranslation()
  const router = useRouter()
  const isHidden = useHiddenStore((s) => s.isHidden)
  const accessToken = useAuthStore((s) => s.accessToken)
  const currentUserId = (() => {
    try {
      if (!accessToken) return null
      return JSON.parse(atob(accessToken.split('.')[1])).sub as string
    } catch { return null }
  })()

  const [beef, setBeef]                       = useState<BeefDetail | null>(null)
  const [comments, setComments]               = useState<Comment[]>([])
  const [loading, setLoading]                 = useState(true)
  const [wager, setWager]                     = useState(10)
  const [voting, setVoting]                   = useState(false)
  const [comment, setComment]                 = useState('')
  const [sending, setSending]                 = useState(false)
  const [balance, setBalance]                 = useState<number | null>(null)
  const [initiatorPhotoUrl, setInitiatorPhotoUrl] = useState<string | null>(null)
  const [targetPhotoUrl, setTargetPhotoUrl]       = useState<string | null>(null)
  const [showGameOverlay, setShowGameOverlay]      = useState(false)

  const countdown = useCountdown(beef?.ends_at ?? null)
  const commentWindowCountdown = useCountdown(beef?.comment_window_until ?? null)

  const load = useCallback(async () => {
    if (!isHidden) return
    try {
      const [b, c, bal] = await Promise.all([
        fetchApi<BeefDetail>(`/hidden/beef/${id}`),
        fetchApi<Comment[]>(`/hidden/beef/${id}/comments`),
        fetchApi<number>('/hidden/coin/balance'),
      ])
      setBeef(b)
      setComments(Array.isArray(c) ? c : [])
      setBalance(typeof bal === 'number' ? bal : 0)
    } catch { router.replace('/beef') }
    finally { setLoading(false) }
  }, [isHidden, id, router])

  useEffect(() => {
    if (!isHidden) { router.replace('/dashboard'); return }
    load()
  }, [isHidden, load, router])

  // Fetch participant avatars once IDs are known — runs only when the beef first loads
  useEffect(() => {
    if (!beef?.initiator_id || !beef?.target_id) return
    Promise.all([
      fetchApi<{ photo_url: string | null }>(`/profile/user/${beef.initiator_id}`).catch(() => null),
      fetchApi<{ photo_url: string | null }>(`/profile/user/${beef.target_id}`).catch(() => null),
    ]).then(([init, targ]) => {
      setInitiatorPhotoUrl(init?.photo_url ?? null)
      setTargetPhotoUrl(targ?.photo_url ?? null)
    })
  }, [beef?.initiator_id, beef?.target_id])

  // Auto-open overlay if beef already in game phase on first load
  useEffect(() => {
    if (beef?.status === 'game_pending' || beef?.status === 'in_game') {
      setShowGameOverlay(true)
    }
  }, [beef?.status])

  useEffect(() => {
    if (!isHidden || !id) return
    const socket = connectHiddenBeef()
    socket.emit('join_beef', id)

    socket.on('beef:vote_update', (data: {
      initiator_coins: number; target_coins: number; total_votes: number
    }) => {
      setBeef(prev => prev ? {
        ...prev,
        initiator_coins: data.initiator_coins,
        target_coins: data.target_coins,
        total_votes: data.total_votes,
      } : prev)
    })

    socket.on('beef:comment_new', (comment: Comment) => {
      setComments(prev => [...prev, comment])
    })

    socket.on('beef:closed', (data: { winner_id: string | null }) => {
      setBeef(prev => prev ? {
        ...prev,
        status: 'closed',
        winner_id: data.winner_id,
      } : prev)
    })

    // Game status transitions
    socket.on('game:state_update', (data: {
      state: string
      game_type: GameType
      initiator_ready: boolean
      target_ready: boolean
    }) => {
      setBeef(prev => prev ? {
        ...prev,
        status: data.state === 'in_game' ? 'in_game' : 'game_pending',
        game_type: data.game_type,
      } : prev)
      setShowGameOverlay(true)
    })

    socket.on('game:finished', (_data: { winner_id: string }) => {
      // Overlay handles winner display; reload beef for final status
      load()
    })

    return () => {
      socket.emit('leave_beef', id)
      socket.off('beef:vote_update')
      socket.off('beef:comment_new')
      socket.off('beef:closed')
      socket.off('game:state_update')
      socket.off('game:finished')
      disconnectHiddenBeef()
    }
  }, [isHidden, id, load])

  async function handleVote(side: 'initiator' | 'target') {
    if (!beef || voting) return
    setVoting(true)
    try {
      await fetchApi(`/hidden/beef/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ side, coins_wagered: wager }),
      })
      await load()
    } catch (e: any) {
      alert(e?.message ?? t.beef.voteError)
    } finally { setVoting(false) }
  }

  async function handleComment() {
    if (!comment.trim() || sending) return
    setSending(true)
    try {
      await fetchApi(`/hidden/beef/${id}/comment`, {
        method: 'POST',
        body: JSON.stringify({ content: comment.trim() }),
      })
      setComment('')
      const c = await fetchApi<Comment[]>(`/hidden/beef/${id}/comments`)
      setComments(Array.isArray(c) ? c : [])
    } catch {} finally { setSending(false) }
  }

  if (!isHidden) return null
  if (loading) return (
    <div className="flex justify-center py-32">
      <div className="w-6 h-6 border-2 border-primary-fixed-dim border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  if (!beef) return null

  const isInitiator   = beef.initiator_id === currentUserId
  const isTarget      = beef.target_id === currentUserId
  const isParticipant = isInitiator || isTarget
  const hasVoted      = !!beef.user_vote
  const isActive      = beef.status === 'active'
  const isGamePending = beef.status === 'game_pending'
  const isInGame      = beef.status === 'in_game'
  const isClosed      = beef.status === 'closed'
  const isGamePhase   = isGamePending || isInGame
  const isCommentWindowOpen = isClosed &&
    !!beef.comment_window_until &&
    new Date(beef.comment_window_until) > new Date()
  const totalCoins    = beef.initiator_coins + beef.target_coins
  const initPct       = totalCoins > 0 ? Math.round(beef.initiator_coins / totalCoins * 100) : 50

  return (
    <div className="max-w-screen-sm mx-auto px-4 py-6 pb-32">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/beef"
          className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors">
          <ArrowLeft size={20}/>
        </Link>
        <span className="font-bold text-on-surface flex-1">{beef.tldr}</span>
        {isActive && countdown && (
          <span className="text-xs text-on-surface-variant bg-surface-container-high
            px-2 py-1 rounded-full font-mono">
            🕐 {countdown}
          </span>
        )}
        {isClosed && (
          <span className="text-xs font-bold text-primary-fixed-dim bg-primary-fixed-dim/20
            px-2 py-1 rounded-full">
            {t.beef.statusClosed}
          </span>
        )}
      </div>

      {/* Participants */}
      <div className="flex items-center justify-between bg-surface-container
        border border-outline-variant rounded-2xl p-5 mb-4 gap-3">

        {/* Initiator — avatar far left, name+role to its right */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {initiatorPhotoUrl ? (
            <img
              src={initiatorPhotoUrl.replace('http://localhost:3000', '')}
              alt=""
              loading="lazy"
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-on-surface-variant select-none">
                {(beef.initiator_nickname ?? '?').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={`font-bold text-sm truncate ${
              isClosed && beef.winner_id === beef.initiator_id
                ? 'text-primary-fixed-dim' : 'text-on-surface'
            }`}>
              {beef.initiator_nickname ?? '???'}
            </span>
            <span className="text-xs text-on-surface-variant">{t.beef.roleInitiator}</span>
            {isClosed && beef.winner_id === beef.initiator_id && (
              <Trophy size={14} className="text-primary-fixed-dim"/>
            )}
          </div>
        </div>

        <Swords size={24} className="text-primary-fixed-dim flex-shrink-0"/>

        {/* Target — name+role on the left of its cell, avatar far right */}
        <div className="flex items-center gap-3 flex-1 flex-row-reverse min-w-0">
          {targetPhotoUrl ? (
            <img
              src={targetPhotoUrl.replace('http://localhost:3000', '')}
              alt=""
              loading="lazy"
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-on-surface-variant select-none">
                {(beef.target_nickname ?? '?').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-0.5 items-end min-w-0">
            <span className={`font-bold text-sm truncate ${
              isClosed && beef.winner_id === beef.target_id
                ? 'text-primary-fixed-dim' : 'text-on-surface'
            }`}>
              {beef.target_nickname ?? '???'}
            </span>
            <span className="text-xs text-on-surface-variant">{t.beef.roleTarget}</span>
            {isClosed && beef.winner_id === beef.target_id && (
              <Trophy size={14} className="text-primary-fixed-dim"/>
            )}
          </div>
        </div>

      </div>

      {/* Passage */}
      {(() => {
        const ownNickname =
          currentUserId === beef.initiator_id ? beef.initiator_nickname :
          currentUserId === beef.target_id    ? beef.target_nickname    : null
        return (
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-4 mb-4">
            <p className="text-xs text-on-surface-variant mb-3">{t.beef.chatPassageSection}</p>
            <div className="flex flex-col gap-2">
              {parsePassage(beef.chat_passage).map((line, i) => {
                const isOwn        = ownNickname != null && line.nickname === ownNickname
                const isInitiator  = line.nickname === beef.initiator_nickname
                const isTarget     = line.nickname === beef.target_nickname
                const bubbleBg     = isInitiator ? 'bg-rose-500/20'  : isTarget ? 'bg-sky-500/20'  : 'bg-surface-container'
                const nameColor    = isInitiator ? 'text-rose-400'   : isTarget ? 'text-sky-400'   : 'text-on-surface-variant'
                const roundedCorner = isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'
                return (
                  <div key={i} className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                    <span className={`text-[10px] font-semibold px-1 ${nameColor}`}>
                      {line.nickname || '?'}
                    </span>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug text-on-surface ${bubbleBg} ${roundedCorner}`}>
                      {line.content}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Vote distribution bar */}
      {totalCoins > 0 && (
        <div className="bg-surface-container border border-outline-variant
          rounded-2xl p-4 mb-4">
          <div className="flex justify-between text-xs text-on-surface-variant mb-2">
            <span>{beef.initiator_coins} 🪙</span>
            <span className="text-on-surface">{totalCoins} {t.beef.totalLabel}</span>
            <span>{beef.target_coins} 🪙</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-rose-500 transition-all duration-500"
              style={{ width: `${initPct}%` }}
            />
            <div className="h-full bg-sky-500 flex-1 transition-all duration-500" />
          </div>
          <div className="flex justify-between text-xs text-on-surface-variant mt-1">
            <span>{initPct}%</span>
            <span>{beef.total_votes} {t.beef.votesLabel}</span>
            <span>{100 - initPct}%</span>
          </div>
        </div>
      )}

      {/* Double KO result */}
      {isClosed && beef.winner_id === null && (
        <div className="bg-surface-container border border-outline-variant
          rounded-2xl p-4 mb-4 text-center">
          <p className="font-bold text-on-surface text-lg">{t.beef.doubleKo}</p>
          <p className="text-sm text-on-surface-variant">{t.beef.doubleKoDesc}</p>
        </div>
      )}

      {/* Game section — inline, no screen lock */}
      {showGameOverlay && beef.game_type && (
        <GameOverlay
          beefId={beef.id}
          gameType={beef.game_type}
          potCoins={beef.pot_coins ?? 0}
          initiatorId={beef.initiator_id}
          targetId={beef.target_id}
          initiatorNickname={beef.initiator_nickname ?? 'Initiator'}
          targetNickname={beef.target_nickname ?? 'Target'}
          initiatorPhotoUrl={initiatorPhotoUrl}
          targetPhotoUrl={targetPhotoUrl}
          currentUserId={currentUserId}
          socket={connectHiddenBeef()}
          onClose={() => {
            setShowGameOverlay(false)
            // Participants are sent to exile after the game resolves
            if (isParticipant && isClosed) router.push('/profile')
          }}
        />
      )}

      {/* Voting section — hidden during game phase */}
      {isActive && !isParticipant && !hasVoted && (
        <div className="bg-surface-container border border-outline-variant
          rounded-2xl p-4 mb-4">
          <p className="text-sm font-semibold text-on-surface mb-3">
            {t.beef.voteHeader}{balance !== null ? ` — ${t.beef.coinsAvailable.replace('{balance}', String(balance))}` : ''}
          </p>

          {/* Wager presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {WAGER_PRESETS.map(w => (
              <button key={w} onClick={() => setWager(w)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  wager === w
                    ? 'border-primary-fixed-dim bg-primary-fixed-dim/20 text-on-surface'
                    : 'border-outline-variant text-on-surface-variant hover:border-outline'
                }`}>
                {w} 🪙
              </button>
            ))}
          </div>

          {/* Vote buttons */}
          <div className="flex gap-3">
            <button onClick={() => handleVote('initiator')}
              disabled={voting || (balance ?? 0) < wager}
              className="flex-1 py-3 rounded-xl bg-surface-container-high border
                border-outline-variant text-on-surface font-bold text-sm
                disabled:opacity-40 transition-opacity hover:border-primary-fixed-dim">
              ← {beef.initiator_nickname ?? 'Initiator'}
            </button>
            <button onClick={() => handleVote('target')}
              disabled={voting || (balance ?? 0) < wager}
              className="flex-1 py-3 rounded-xl bg-surface-container-high border
                border-outline-variant text-on-surface font-bold text-sm
                disabled:opacity-40 transition-opacity hover:border-primary-fixed-dim">
              {beef.target_nickname ?? 'Target'} →
            </button>
          </div>
        </div>
      )}

      {/* Already voted */}
      {isActive && hasVoted && beef.user_vote && (
        <div className="bg-primary-fixed-dim/10 border border-primary-fixed-dim
          rounded-2xl p-4 mb-4 text-center">
          <p className="text-sm text-on-surface">
            {t.beef.alreadyVotedFor
              .replace('{coins}', String(beef.user_vote.coins_wagered))
              .replace('{nickname}', beef.user_vote.side === 'initiator'
                ? (beef.initiator_nickname ?? t.beef.roleInitiator)
                : (beef.target_nickname ?? t.beef.roleTarget))}
          </p>
        </div>
      )}

      {/* Comments */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-on-surface">
          {t.beef.commentsHeader.replace('{count}', String(comments.length))}
        </p>

        {comments.length === 0 ? (
          <p className="text-xs text-on-surface-variant text-center py-4">
            {t.beef.noComments}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {comments.map(c => {
              const isOwn = c.user_id === currentUserId
              return (
                <div key={c.id} className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-baseline gap-1.5 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[10px] font-semibold text-primary-fixed-dim">
                      {c.nickname ?? c.user_id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      {new Date(c.created_at).toLocaleTimeString('de-AT',
                        { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                    isOwn
                      ? 'rounded-br-sm bg-surface-container text-on-surface'
                      : 'rounded-bl-sm bg-primary-fixed-dim/20 text-on-surface'
                  }`}>
                    {c.content}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Comment input — active / game phase / 5-min post-game window */}
        {(isActive || isGamePhase || isCommentWindowOpen) && (
          <>
            {isCommentWindowOpen && (
              <div className="flex items-center justify-center gap-2 bg-surface-container-high
                border border-outline-variant rounded-xl px-3 py-2 mt-1">
                <span className="text-xs text-on-surface-variant">
                  {t.beef.commentWindowLabel}
                </span>
                <span className="text-xs font-mono font-bold text-primary-fixed-dim">
                  {commentWindowCountdown}
                </span>
              </div>
            )}
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                maxLength={500}
                placeholder={t.beef.commentPlaceholder}
                className="flex-1 bg-surface-container-low border border-outline-variant
                  rounded-lg px-4 py-2.5 text-on-surface text-sm outline-none
                  focus:border-primary-fixed-dim"
              />
              <button onClick={handleComment} disabled={!comment.trim() || sending}
                className="p-2.5 rounded-lg bg-primary-fixed-dim text-on-primary-container
                  disabled:opacity-40 transition-opacity">
                <Send size={18}/>
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  )
}

