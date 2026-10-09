'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { daysLeft, type BoardKind, type BoardPost, type BoardRange } from '@/lib/board'

// Ein Aushang als Zettel: Klebestreifen oben, Abreissstreifen unten.
// Leicht schraeg, Winkel aus der ID, damit er beim Neuladen gleich bleibt.
export function BoardNote({ post, href }: { post: BoardPost; href?: string }) {
  const { t } = useTranslation()
  const tilt = ((parseInt(post.id.slice(0, 2), 16) % 5) - 2) * 0.6
  const days = daysLeft(post.expires_at)
  const meta = [
    kindLabel(t.board, post.kind),
    post.street,
    post.distance_m != null ? formatDistance(t.board, post.distance_m) : null,
  ].filter(Boolean).join(' · ')

  const note = (
    <article
      className="relative bg-surface-container-lowest text-on-surface rounded-sm pt-4 px-4 shadow-[0_1px_0_var(--color-outline-variant),0_8px_18px_-12px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 -rotate-2"
        style={{ background: 'color-mix(in srgb, var(--color-tertiary-fixed-dim) 55%, transparent)' }}
      />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{meta}</p>
      <h3 className="mt-1 text-lg leading-tight">{post.title}</h3>
      <p className="mt-1 text-sm text-on-surface-variant line-clamp-3">{post.body}</p>
      <p className="mt-2 text-xs text-on-surface-variant">
        {t.board.postedBy.replace('{nickname}', post.author.nickname)} ·{' '}
        {days === 0 ? t.board.expiresToday : t.board.expiresIn.replace('{days}', String(days))}
        {post.mine && <span className="ml-1 font-semibold text-primary-fixed-dim">· {t.board.mine}</span>}
      </p>
      <div className="mt-3 -mx-4 flex border-t-2 border-dashed border-outline-variant" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={`flex-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide truncate px-1 ${
              i > 0 ? 'border-l-2 border-dashed border-outline-variant' : ''
            } ${i < post.tears ? 'opacity-25 line-through' : 'text-primary-fixed-dim'}`}
          >
            {post.author.nickname}
          </span>
        ))}
      </div>
    </article>
  )

  return href ? (
    <Link href={href} className="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-fixed-dim">
      {note}
    </Link>
  ) : note
}

type BoardText = ReturnType<typeof useTranslation>['t']['board']

export function kindLabel(t: BoardText, kind: BoardKind | 'all'): string {
  return { all: t.kindAll, search: t.kindSearch, offer: t.kindOffer, gift: t.kindGift, meet: t.kindMeet }[kind]
}

export function rangeLabel(t: BoardText, range: BoardRange | 'public'): string {
  return {
    street: t.rangeStreet, r500: t.range500, r1000: t.range1000, kiez: t.rangeKiez, all: t.rangeAll, public: t.rangeAll,
  }[range]
}

export function formatDistance(t: BoardText, meters: number): string {
  return meters < 1000
    ? t.distanceM.replace('{m}', String(Math.max(10, Math.round(meters / 10) * 10)))
    : t.distanceKm.replace('{km}', (meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }))
}
