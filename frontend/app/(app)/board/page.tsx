'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useNavLabel } from '@/components/nav/useNavLabel'
import { BoardNote, kindLabel, rangeLabel } from '@/components/board/BoardNote'
import { BOARD_KINDS, BOARD_RANGES, type BoardKind, type BoardPost, type BoardRange } from '@/lib/board'

export default function BoardPage() {
  const { t } = useTranslation()
  const label = useNavLabel()
  const [range, setRange] = useState<BoardRange>('kiez')
  const [kind, setKind] = useState<BoardKind | 'all'>('all')
  const [posts, setPosts] = useState<BoardPost[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ range, ...(kind !== 'all' ? { kind } : {}) })
    fetchApi<BoardPost[]>(`/board?${qs}`)
      .then((p) => { if (!cancelled) { setPosts(p); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [range, kind])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl text-on-surface">{label('board')}</h1>
          <p className="text-sm text-on-surface-variant">{t.board.subtitle}</p>
        </div>
        <Link
          href="/board/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-fixed-dim px-4 py-2.5 text-sm font-bold text-on-primary-container hover:opacity-90"
        >
          <Plus size={18} aria-hidden /> {t.board.new}
        </Link>
      </header>

      <div className="space-y-3">
        <div role="radiogroup" aria-label={t.board.rangeLabel} className="flex rounded-lg bg-surface-container-high p-1 gap-1 max-w-xl">
          {BOARD_RANGES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`flex-1 rounded-md px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                range === r ? 'bg-on-surface text-background' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {rangeLabel(t.board, r)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.board.formKind}>
          {(['all', ...BOARD_KINDS] as const).map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                kind === k
                  ? 'bg-on-surface text-background border-on-surface'
                  : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {kindLabel(t.board, k)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      <section className="rounded-xl bg-surface-container-high p-5 sm:p-7 min-h-64">
        {posts === null ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-48 rounded-sm bg-surface-container animate-pulse" />)}
          </div>
        ) : posts.length === 0 ? (
          <p className="py-16 text-center text-on-surface-variant">
            {range === 'all' && kind === 'all' ? t.board.empty : t.board.emptyRange}
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" role="list">
            {posts.map((p) => (
              <li key={p.id}><BoardNote post={p} href={`/board/${p.id}`} /></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
