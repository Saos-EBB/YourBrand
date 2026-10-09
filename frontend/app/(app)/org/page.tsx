'use client'

import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, UserPlus, X } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { daysUntil, fill, formatDate, type OrgOverview, type OrgSummary } from '@/lib/care'

type Filter = 'all' | 'open' | 'expiring'

export default function OrgPage() {
  const { t } = useTranslation()
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    fetchApi<OrgSummary[]>('/orgs/mine')
      .then((o) => { setOrgs(o); setOrgId(o[0]?.id ?? null) })
      .catch(() => setOrgs([]))
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {orgs === null && <div className="h-40 rounded-2xl bg-surface-container animate-pulse" aria-hidden="true" />}
      {orgs?.length === 0 && (
        <>
          <h1 className="text-3xl text-on-surface">{t.org.title}</h1>
          <p className="text-on-surface-variant">{t.org.none}</p>
        </>
      )}
      {orgs && orgs.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist">
          {orgs.map((o) => (
            <button key={o.id} role="tab" aria-selected={o.id === orgId} onClick={() => setOrgId(o.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${o.id === orgId ? 'bg-primary-fixed-dim text-on-primary-container' : 'bg-surface-container text-on-surface'}`}>
              {o.name}
            </button>
          ))}
        </div>
      )}
      {orgId && orgs && <OrgView key={orgId} orgId={orgId} isAdmin={orgs.find((o) => o.id === orgId)?.role === 'admin'} />}
    </div>
  )
}

function OrgView({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const { t, locale } = useTranslation()
  const [org, setOrg] = useState<OrgOverview | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetchApi<OrgOverview>(`/orgs/${orgId}`).then(setOrg).catch((e: Error) => setError(e.message))
  }, [orgId])
  useEffect(load, [load])

  if (!org) return error ? <p className="text-error" role="alert">{error}</p> : null

  const expiring = (d: string | null) => { const n = daysUntil(d); return n !== null && n <= 14 }
  const clients = org.clients.filter((c) =>
    filter === 'all' ? true
      : filter === 'open' ? c.pending_approvals + c.open_reports > 0 || !c.accepted_at
        : expiring(c.expires_at))
  const counts: Record<Filter, number> = {
    all: org.clients.length,
    open: org.clients.filter((c) => c.pending_approvals + c.open_reports > 0 || !c.accepted_at).length,
    expiring: org.clients.filter((c) => expiring(c.expires_at)).length,
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await fetchApi(`/orgs/${orgId}/members`, { method: 'POST', body: JSON.stringify({ nickname: nickname.trim() }) })
      setNickname('')
      load()
    } catch (err) { setError((err as Error).message) }
  }

  async function removeMember(userId: string) {
    setError('')
    try {
      await fetchApi(`/orgs/${orgId}/members/${userId}`, { method: 'DELETE' })
      load()
    } catch (err) { setError((err as Error).message) }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_18rem]">
      <section className="min-w-0 space-y-5" aria-labelledby="org-clients">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-on-surface-variant">
            {org.name}{org.is_verified && <><BadgeCheck size={16} className="text-tertiary-fixed-dim" aria-hidden /> {t.org.verified}</>}
          </p>
          <h1 id="org-clients" className="text-3xl text-on-surface">{t.org.clients}</h1>
          {org.description && <p className="mt-1 text-on-surface-variant">{org.description}</p>}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t.org.clients}>
          {(['all', 'open', 'expiring'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${filter === f ? 'bg-primary-fixed-dim text-on-primary-container' : 'bg-surface-container text-on-surface'}`}>
              {{ all: t.org.filterAll, open: t.org.filterOpen, expiring: t.org.filterExpiring }[f]} · {counts[f]}
            </button>
          ))}
        </div>

        {clients.length === 0 ? (
          <p className="text-on-surface-variant">{t.org.noClients}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3">{t.org.person}</th>
                  <th scope="col" className="px-4 py-3">{t.org.responsible}</th>
                  <th scope="col" className="px-4 py-3">{t.org.rights}</th>
                  <th scope="col" className="px-4 py-3">{t.org.open}</th>
                  <th scope="col" className="px-4 py-3">{t.org.until}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {clients.map((c) => {
                  const days = daysUntil(c.expires_at)
                  return (
                    <tr key={c.id} className="text-on-surface">
                      <td className="px-4 py-3 font-bold">{c.nickname}</td>
                      <td className="px-4 py-3">{c.caretaker_nickname}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {!c.accepted_at ? t.org.pending
                          : [c.can_read_chat && t.org.rightRead, c.can_set_protection && t.org.rightProtect].filter(Boolean).join(' · ') || '–'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          {c.pending_approvals > 0 && <Pill>{fill(t.org.approvalsN, { n: c.pending_approvals })}</Pill>}
                          {c.open_reports > 0 && <Pill>{fill(t.org.reportsN, { n: c.open_reports })}</Pill>}
                          {c.pending_approvals + c.open_reports === 0 && '–'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 tabular-nums ${days !== null && days <= 14 ? 'font-bold text-error' : ''}`}>
                        {!c.expires_at ? t.org.noEnd
                          : days !== null && days <= 14 ? fill(t.org.inDays, { days })
                            : formatDate(c.expires_at, locale)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-on-surface-variant">{t.org.consentNote}</p>
      </section>

      <aside className="space-y-4" aria-labelledby="org-team">
        <h2 id="org-team" className="text-xl text-on-surface">{t.org.team} · {org.members.length}</h2>
        <ul className="space-y-2" role="list">
          {org.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 rounded-xl bg-surface-container p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-highest font-bold text-on-surface" aria-hidden="true">
                {m.nickname[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-on-surface">{m.nickname}</span>
                <span className="block text-xs text-on-surface-variant">
                  {m.role === 'admin' ? t.org.roleAdmin : t.org.roleMember} · {fill(t.org.clientsN, { n: m.clients })}
                </span>
              </span>
              {isAdmin && m.role !== 'admin' && (
                <button onClick={() => removeMember(m.user_id)} aria-label={`${t.org.remove}: ${m.nickname}`} className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-high">
                  <X size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form onSubmit={addMember} className="space-y-2">
            <label htmlFor="org-add" className="block text-sm font-bold text-on-surface">{t.org.addMember}</label>
            <div className="flex gap-2">
              <input id="org-add" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.org.addMemberNickname} minLength={3} maxLength={30}
                className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-background px-3 py-2 text-sm text-on-surface" />
              <button type="submit" disabled={nickname.trim().length < 3} aria-label={t.org.add}
                className="rounded-xl bg-primary-fixed-dim px-3 text-on-primary-container disabled:opacity-40">
                <UserPlus size={18} aria-hidden />
              </button>
            </div>
          </form>
        )}
        {error && <p className="text-sm text-error" role="alert">{error}</p>}
      </aside>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#FFF3B0] px-2 py-0.5 text-xs font-bold text-[#3D2E00]">{children}</span>
}
