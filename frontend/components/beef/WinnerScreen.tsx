'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { useCountdown } from '@/lib/hooks/useCountdown'
import { useTranslation } from '@/lib/i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WinnerScreenProps {
  winnerId: string | null
  potCoins: number
  initiatorId: string
  targetId: string
  initiatorNickname: string
  targetNickname: string
  initiatorPhotoUrl: string | null
  targetPhotoUrl: string | null
  currentUserId: string | null
  onClose: () => void
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({
  photoUrl,
  nickname,
}: {
  photoUrl: string | null
  nickname: string
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl.replace('http://localhost:3000', '')}
        alt={nickname}
        loading="lazy"
        className="h-24 w-24 rounded-full object-cover border-4 border-primary-fixed-dim shadow-lg"
      />
    )
  }
  return (
    <div className="h-24 w-24 rounded-full bg-surface-container-high flex items-center justify-center border-4 border-primary-fixed-dim shadow-lg">
      <span className="text-3xl font-bold text-on-surface-variant select-none">
        {(nickname || '?').charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

// ─── Coin distribution row ────────────────────────────────────────────────────

function CoinRow({ label, amount, highlight }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${
      highlight
        ? 'bg-primary-fixed-dim/10 border border-primary-fixed-dim'
        : 'bg-surface-container border border-outline-variant'
    }`}>
      <span className={`text-sm ${highlight ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>
        {label}
      </span>
      <span className={`font-bold tabular-nums ${highlight ? 'text-primary-fixed-dim text-lg' : 'text-on-surface'}`}>
        {amount} 🪙
      </span>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WinnerScreen({
  winnerId,
  potCoins,
  initiatorId,
  targetId,
  initiatorNickname,
  targetNickname,
  initiatorPhotoUrl,
  targetPhotoUrl,
  currentUserId,
  onClose,
}: WinnerScreenProps) {
  const { t } = useTranslation()
  // Stable deadline: 5 min from first render
  const [closesAt] = useState(() => new Date(Date.now() + 5 * 60 * 1000).toISOString())
  const countdown = useCountdown(closesAt)

  useEffect(() => {
    if (countdown === null) onClose()
  }, [countdown, onClose])

  // ── Derived values ───────────────────────────────────────────────────────
  const winnerNickname =
    winnerId === initiatorId ? initiatorNickname :
    winnerId === targetId   ? targetNickname :
    null

  const winnerPhotoUrl =
    winnerId === initiatorId ? initiatorPhotoUrl :
    winnerId === targetId   ? targetPhotoUrl :
    null

  const winnerCoins  = Math.floor(potCoins * 0.30)
  const betterCoins  = Math.floor(potCoins * 0.60)

  const isWinner = currentUserId === winnerId

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 p-6 flex-1">

      {/* Trophy header */}
      <div className="flex flex-col items-center gap-1 pt-4">
        <Trophy size={36} className="text-primary-fixed-dim" />
        <h2 className="text-2xl font-bold text-on-surface">
          {winnerId ? t.beef.winnerTitle : t.beef.drawTitle}
        </h2>
      </div>

      {/* Winner avatar + name */}
      {winnerId && winnerNickname ? (
        <div className="flex flex-col items-center gap-3">
          <Avatar photoUrl={winnerPhotoUrl} nickname={winnerNickname} />
          <div className="text-center">
            <p className="text-xl font-bold text-on-surface">{winnerNickname}</p>
            {isWinner ? (
              <p className="text-sm text-primary-fixed-dim font-semibold mt-1">{t.beef.youWon}</p>
            ) : (
              <p className="text-sm text-on-surface-variant mt-1">{t.beef.winsThisBeef}</p>
            )}
          </div>
        </div>
      ) : (
        /* No winner — Double KO */
        <div className="flex flex-col items-center gap-2">
          <span className="text-6xl">🥊</span>
          <p className="text-sm text-on-surface-variant text-center">
            {t.beef.noWinnerDesc}
          </p>
        </div>
      )}

      {/* Coin distribution */}
      {winnerId && (
        <div className="w-full flex flex-col gap-2">
          <p className="text-xs text-on-surface-variant uppercase tracking-widest font-semibold text-center mb-1">
            {t.beef.coinDistribution}
          </p>
          <CoinRow
            label={`${winnerNickname ?? 'Winner'} (30%)`}
            amount={winnerCoins}
            highlight
          />
          <CoinRow
            label={t.beef.betters}
            amount={betterCoins}
          />
          <div className="text-center mt-1">
            <span className="text-xs text-on-surface-variant">
              {t.beef.potTotal.replace('{coins}', String(potCoins))}
            </span>
          </div>
        </div>
      )}

      {/* Auto-close info */}
      <div className="mt-auto flex flex-col items-center gap-3">
        <p className="text-xs text-on-surface-variant">
          {t.beef.closesIn.replace('{countdown}', countdown ?? '')}
        </p>
        <button
          onClick={onClose}
          className="px-8 py-3 rounded-2xl bg-primary-fixed-dim text-on-primary-container
            font-bold text-sm hover:opacity-90 transition-opacity"
        >
          {t.common.close}
        </button>
      </div>
    </div>
  )
}
