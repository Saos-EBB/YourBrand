'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/components/TenantProvider'
import { useTranslation } from '@/lib/i18n'
import { BoardNote } from './BoardNote'
import type { BoardPost } from '@/lib/board'

// Vorschau fuer Besucher ohne Login: nur Aushaenge mit Sichtbarkeit "Alle"
// (AGB § 7). Ohne Modul board oder ohne oeffentliche Aushaenge: nichts.
export function PublicBoardPreview() {
  const { modules } = useTenant()
  const { t } = useTranslation()
  const [posts, setPosts] = useState<BoardPost[]>([])

  useEffect(() => {
    if (!modules.board) return
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
    fetch(`${base}/board/public?limit=3`)
      .then((r) => (r.ok ? r.json() : []))
      .then((p: BoardPost[]) => setPosts(p))
      .catch(() => {})
  }, [modules.board])

  if (posts.length === 0) return null
  return (
    <section className="mt-12 space-y-4" aria-labelledby="public-board-title">
      <h2 id="public-board-title" className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">
        {t.board.publicPreviewTitle}
      </h2>
      <ul className="space-y-6" role="list">
        {posts.map((p) => <li key={p.id}><BoardNote post={p} /></li>)}
      </ul>
      <p className="text-center text-xs text-on-surface-variant">{t.board.publicPreviewMore}</p>
    </section>
  )
}
