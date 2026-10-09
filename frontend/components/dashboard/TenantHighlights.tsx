'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, HeartHandshake, Hand } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'
import { useNavLabel } from '@/components/nav/useNavLabel'
import { ReadAloud } from '@/components/assist/ReadAloud'
import { BoardNote } from '@/components/board/BoardNote'
import { fill, type Client, type Helper } from '@/lib/care'
import type { BoardPost } from '@/lib/board'

// Bloecke auf dem Dashboard, die es nur mit bestimmten Mandanten-Modulen
// gibt: Aushaenge aus der Naehe (board), Betreuung (caretaker).
export function TenantHighlights() {
  const { modules } = useTenant()
  return (
    <>
      {modules.caretaker && <CareSummary />}
      {modules.board && <NearbyBoard />}
    </>
  )
}

function NearbyBoard() {
  const { t } = useTranslation()
  const label = useNavLabel()
  const [posts, setPosts] = useState<BoardPost[]>([])

  useEffect(() => {
    fetchApi<BoardPost[]>('/board?range=r1000')
      .then((p) => setPosts(p.filter((x) => !x.mine).slice(0, 3)))
      .catch(() => {})
  }, [])

  return (
    <section aria-labelledby="nearby-board" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="nearby-board" className="text-xl text-on-surface">{t.board.nearYou}</h2>
        <Link href="/board" className="inline-flex items-center gap-1 text-sm font-bold text-primary-fixed-dim hover:underline">
          {label('board')} <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t.board.emptyRange}</p>
      ) : (
        <ul className="grid gap-8 rounded-xl bg-surface-container-high p-5 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {posts.map((p) => <li key={p.id}><BoardNote post={p} href={`/board/${p.id}`} /></li>)}
        </ul>
      )}
    </section>
  )
}

function CareSummary() {
  const { t } = useTranslation()
  const [clients, setClients] = useState<Client[]>([])
  const [helpers, setHelpers] = useState<Helper[]>([])

  useEffect(() => {
    fetchApi<Client[]>('/care/clients').then(setClients).catch(() => {})
    fetchApi<Helper[]>('/care/helpers').then(setHelpers).catch(() => {})
  }, [])

  const approvals = clients.reduce((n, c) => n + c.pending_approvals, 0)
  const invites = helpers.filter((h) => !h.accepted_at)
  const active = helpers.filter((h) => h.accepted_at)
  if (clients.length === 0 && helpers.length === 0) return null

  const tile = 'flex items-center gap-4 rounded-2xl bg-surface-container p-4 text-on-surface hover:bg-surface-container-high'
  const icon = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl'
  return (
    <section aria-label={t.care.title} className="grid gap-3 sm:grid-cols-2">
      {clients.length > 0 && (
        <Link href="/care" className={`${tile} ${approvals > 0 ? 'ring-2 ring-primary-fixed-dim' : ''}`}>
          <span className={`${icon} bg-primary-fixed-dim text-on-primary-container`} aria-hidden="true"><HeartHandshake /></span>
          <span>
            <span className="block text-lg font-bold">{t.care.clientsTitle} · {clients.length}</span>
            <span className="block text-on-surface-variant">
              {approvals > 0 ? `${t.care.approvalsTitle}: ${approvals}` : t.care.approvalsEmpty}
            </span>
          </span>
        </Link>
      )}
      {invites.map((h) => (
        <Link key={h.id} href="/care" className={`${tile} ring-2 ring-primary-fixed-dim`}>
          <span className={`${icon} bg-tertiary-fixed-dim text-background`} aria-hidden="true"><Hand /></span>
          <span className="text-lg font-bold">{fill(t.care.inviteFrom, { nickname: h.caretaker_nickname })}</span>
        </Link>
      ))}
      {active.map((h) => (
        <div key={h.id} className={tile}>
          <span className={`${icon} bg-surface-container-highest`} aria-hidden="true"><HeartHandshake /></span>
          <span className="flex-1">
            <span className="block text-lg font-bold">{fill(t.care.helpedBy, { nickname: h.caretaker_nickname })}</span>
            {h.org_name && <span className="block text-on-surface-variant">{h.org_name}</span>}
          </span>
          <ReadAloud size="sm" text={fill(t.care.helpedBy, { nickname: h.caretaker_nickname })} />
        </div>
      ))}
    </section>
  )
}
