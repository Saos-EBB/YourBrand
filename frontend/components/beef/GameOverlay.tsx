'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Socket } from 'socket.io-client'
import { X } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { RpsGame } from './games/RpsGame'
import { TicTacToeGame } from './games/TicTacToeGame'
import { MastermindGame } from './games/MastermindGame'
import { ReactionGame } from './games/ReactionGame'
import { WinnerScreen } from './WinnerScreen'

// ─── Types ──────────────────────────────────────────────────────────────────

export type GameType = 'rps' | 'tictactoe' | 'mastermind' | 'reaction'

export type GamePhase =
  | 'waiting'      // Waiting for both players to ready up
  | 'countdown'    // Both ready — 5 s pre-game countdown
  | 'playing'      // Active game UI
  | 'finished'     // Winner determined

export interface GameState {
  state: 'waiting' | 'in_game' | 'finished'
  game_type: GameType
  initiator_ready: boolean
  target_ready: boolean
}

export interface GameOverlayProps {
  beefId: string
  gameType: GameType
  /** pot_coins from the beef */
  potCoins: number
  initiatorId: string
  targetId: string
  initiatorNickname: string
  targetNickname: string
  initiatorPhotoUrl: string | null
  targetPhotoUrl: string | null
  currentUserId: string | null
  socket: Socket
  onClose: () => void
}

// ─── Avatar helper ──────────────────────────────────────────────────────────

function Avatar({
  photoUrl,
  nickname,
  size = 'md',
}: {
  photoUrl: string | null
  nickname: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const dim =
    size === 'lg' ? 'h-16 w-16 text-lg' :
    size === 'md' ? 'h-12 w-12 text-sm' :
                   'h-8 w-8 text-xs'

  if (photoUrl) {
    return (
      <img
        src={photoUrl.replace('http://localhost:3000', '')}
        alt={nickname}
        loading="lazy"
        className={`${dim} rounded-full object-cover flex-shrink-0`}
      />
    )
  }
  return (
    <div className={`${dim} rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0`}>
      <span className="font-semibold text-on-surface-variant select-none">
        {(nickname || '?').charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

// ─── Player Tile ─────────────────────────────────────────────────────────────

function PlayerTile({
  label,
  nickname,
  photoUrl,
  isReady,
  isCurrentUser,
  onReady,
  readying,
  readyLabel,
  waitingLabel,
}: {
  label: string
  nickname: string
  photoUrl: string | null
  isReady: boolean
  isCurrentUser: boolean
  onReady: () => void
  readying: boolean
  readyLabel: string
  waitingLabel: string
}) {
  return (
    <div className={`flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
      isReady
        ? 'border-primary-fixed-dim bg-primary-fixed-dim/10'
        : 'border-outline-variant bg-surface-container'
    }`}>
      <Avatar photoUrl={photoUrl} nickname={nickname} size="lg" />
      <div className="text-center">
        <p className="font-bold text-on-surface text-sm truncate max-w-[100px]">{nickname}</p>
        <p className="text-xs text-on-surface-variant">{label}</p>
      </div>

      {isReady ? (
        <span className="text-xs font-bold text-primary-fixed-dim bg-primary-fixed-dim/20 px-3 py-1 rounded-full">
          ✓ READY
        </span>
      ) : isCurrentUser ? (
        <button
          onClick={onReady}
          disabled={readying}
          className="px-4 py-2 rounded-xl bg-primary-fixed-dim text-on-primary-container
            font-bold text-sm disabled:opacity-40 transition-opacity"
        >
          {readying ? '...' : readyLabel}
        </button>
      ) : (
        <span className="text-xs text-on-surface-variant bg-surface-container-high px-3 py-1 rounded-full">
          {waitingLabel}
        </span>
      )}
    </div>
  )
}

// ─── Countdown Display ───────────────────────────────────────────────────────

function CountdownDisplay({ seconds, countdownLabel, getReadyLabel }: { seconds: number; countdownLabel: string; getReadyLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-widest">
        {countdownLabel}
      </p>
      <div className="w-28 h-28 rounded-full border-4 border-primary-fixed-dim flex items-center justify-center">
        <span className="text-5xl font-bold text-primary-fixed-dim tabular-nums">
          {seconds}
        </span>
      </div>
      <p className="text-on-surface-variant text-xs">{getReadyLabel}</p>
    </div>
  )
}

// ─── Main Overlay ────────────────────────────────────────────────────────────

export function GameOverlay({
  beefId,
  gameType,
  potCoins,
  initiatorId,
  targetId,
  initiatorNickname,
  targetNickname,
  initiatorPhotoUrl,
  targetPhotoUrl,
  currentUserId,
  socket,
  onClose,
}: GameOverlayProps) {
  const { t } = useTranslation()
  const gameLabels: Record<GameType, string> = {
    rps: 'Rock Paper Scissors',
    tictactoe: 'Tic Tac Toe',
    mastermind: 'Mastermind',
    reaction: t.beef.reactionTitle,
  }
  const [phase, setPhase] = useState<GamePhase>('waiting')
  const phaseRef = useRef<GamePhase>('waiting')
  const [initiatorReady, setInitiatorReady] = useState(false)
  const [targetReady, setTargetReady] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [readying, setReadying] = useState(false)

  const isInitiator = currentUserId === initiatorId
  const isTarget = currentUserId === targetId
  const isParticipant = isInitiator || isTarget

  // ── Fetch initial game state ────────────────────────────────────────────
  useEffect(() => {
    fetchApi<GameState>(`/hidden/beef/${beefId}/game`)
      .then((gs) => {
        setInitiatorReady(gs.initiator_ready)
        setTargetReady(gs.target_ready)
        if (gs.state === 'in_game') {
          setPhase('playing')
        } else if (gs.state === 'finished') {
          setPhase('finished')
        }
      })
      .catch(() => { /* non-critical, will be updated via WS */ })
  }, [beefId])

  // Keep phaseRef in sync so socket callbacks don't capture stale closure
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ── Socket listeners ────────────────────────────────────────────────────
  useEffect(() => {
    function onStateUpdate(data: {
      state: GameState['state']
      game_type: GameType
      initiator_ready: boolean
      target_ready: boolean
    }) {
      setInitiatorReady(data.initiator_ready)
      setTargetReady(data.target_ready)
      if (data.state === 'in_game') {
        // Only start countdown when transitioning from waiting — not on every move broadcast
        if (phaseRef.current === 'waiting') startCountdown()
      } else if (data.state === 'finished') {
        setPhase('finished')
      }
    }

    function onFinished(data: { winner_id: string }) {
      setWinnerId(data.winner_id)
      setPhase('finished')
    }

    socket.on('game:state_update', onStateUpdate)
    socket.on('game:finished', onFinished)

    return () => {
      socket.off('game:state_update', onStateUpdate)
      socket.off('game:finished', onFinished)
    }
  }, [socket]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown logic ──────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setPhase('countdown')
    setCountdown(5)
    let remaining = 5
    const iv = setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(iv)
        setPhase('playing')
      }
    }, 1000)
  }, [])

  // ── Ready handler ────────────────────────────────────────────────────────
  async function handleReady() {
    if (readying) return
    setReadying(true)
    try {
      await fetchApi(`/hidden/beef/${beefId}/game/ready`, { method: 'POST' })
      // Optimistic local update — WS will confirm
      if (isInitiator) setInitiatorReady(true)
      if (isTarget) setTargetReady(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.common.error
      alert(msg)
    } finally {
      setReadying(false)
    }
  }

  // ── Both ready while we haven't started countdown yet ───────────────────
  useEffect(() => {
    if (initiatorReady && targetReady && phase === 'waiting') {
      startCountdown()
    }
  }, [initiatorReady, targetReady, phase, startCountdown])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col rounded-3xl overflow-hidden border border-outline-variant bg-surface-container mb-4">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface-container-high">
        <span className="font-bold text-on-surface text-sm uppercase tracking-widest">
          {gameLabels[gameType]}
        </span>
        {(!isParticipant || phase === 'finished') && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col">
        {/* ── WAITING PHASE ── */}
        {phase === 'waiting' && (
          <div className="flex flex-col p-4 gap-6">
            <p className="text-center text-xs text-on-surface-variant uppercase tracking-widest font-semibold pt-2">
              {t.beef.waitingForPlayers}
            </p>

            {/* Player tiles */}
            <div className="flex gap-3">
              <PlayerTile
                label={t.beef.roleInitiator}
                nickname={initiatorNickname}
                photoUrl={initiatorPhotoUrl}
                isReady={initiatorReady}
                isCurrentUser={isInitiator}
                onReady={handleReady}
                readying={readying}
                readyLabel={t.beef.readyBtn}
                waitingLabel={t.beef.waitingBtn}
              />
              <div className="flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-on-surface-variant">VS</span>
              </div>
              <PlayerTile
                label={t.beef.roleTarget}
                nickname={targetNickname}
                photoUrl={targetPhotoUrl}
                isReady={targetReady}
                isCurrentUser={isTarget}
                onReady={handleReady}
                readying={readying}
                readyLabel={t.beef.readyBtn}
                waitingLabel={t.beef.waitingBtn}
              />
            </div>

            {/* Spectator hint */}
            {!isParticipant && (
              <p className="text-center text-xs text-on-surface-variant">
                {t.beef.spectatorWait}
              </p>
            )}

            {/* Pot info */}
            <div className="bg-surface-container-high border border-outline-variant rounded-2xl p-4 text-center">
              <p className="text-xs text-on-surface-variant mb-1">{t.beef.potLabel}</p>
              <p className="text-2xl font-bold text-primary-fixed-dim">{potCoins} 🪙</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {t.beef.potDistributionDesc}
              </p>
            </div>
          </div>
        )}

        {/* ── COUNTDOWN PHASE ── */}
        {phase === 'countdown' && (
          <div className="flex items-center justify-center py-10">
            <CountdownDisplay seconds={countdown} countdownLabel={t.beef.countdownLabel} getReadyLabel={t.beef.getReady} />
          </div>
        )}

        {/* ── PLAYING PHASE ── */}
        {phase === 'playing' && (
          <div className="flex flex-col">
            {/* Game board */}
            <div className="p-4">
              {gameType === 'rps' && (
                <RpsGame
                  beefId={beefId}
                  socket={socket}
                  currentUserId={currentUserId}
                  initiatorId={initiatorId}
                  targetId={targetId}
                  initiatorNickname={initiatorNickname}
                  targetNickname={targetNickname}
                  isParticipant={isParticipant}
                />
              )}
              {gameType === 'tictactoe' && (
                <TicTacToeGame
                  beefId={beefId}
                  socket={socket}
                  currentUserId={currentUserId}
                  initiatorId={initiatorId}
                  targetId={targetId}
                  initiatorNickname={initiatorNickname}
                  targetNickname={targetNickname}
                  isParticipant={isParticipant}
                />
              )}
              {gameType === 'mastermind' && (
                <MastermindGame
                  beefId={beefId}
                  socket={socket}
                  currentUserId={currentUserId}
                  initiatorId={initiatorId}
                  targetId={targetId}
                  initiatorNickname={initiatorNickname}
                  targetNickname={targetNickname}
                  isParticipant={isParticipant}
                />
              )}
              {gameType === 'reaction' && (
                <ReactionGame
                  beefId={beefId}
                  socket={socket}
                  currentUserId={currentUserId}
                  initiatorId={initiatorId}
                  targetId={targetId}
                  initiatorNickname={initiatorNickname}
                  targetNickname={targetNickname}
                  isParticipant={isParticipant}
                />
              )}
            </div>
          </div>
        )}

        {/* ── FINISHED PHASE ── */}
        {phase === 'finished' && (
          <WinnerScreen
            winnerId={winnerId}
            potCoins={potCoins}
            initiatorId={initiatorId}
            targetId={targetId}
            initiatorNickname={initiatorNickname}
            targetNickname={targetNickname}
            initiatorPhotoUrl={initiatorPhotoUrl}
            targetPhotoUrl={targetPhotoUrl}
            currentUserId={currentUserId}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

