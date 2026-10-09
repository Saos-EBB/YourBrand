'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, X, ShieldCheck, MessageCircle, UserPlus, Clock, Flag, HandHelping } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'
import { ReadAloud } from '@/components/assist/ReadAloud'
import {
  daysUntil, fill, formatDate,
  type Approval, type Client, type ClientConversation, type ClientMessage, type Helper, type OrgSummary,
} from '@/lib/care'

const CARD = 'rounded-2xl bg-surface-container p-5'
const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold min-h-[52px] disabled:opacity-50'
const BTN_PRIMARY = `${BTN} bg-primary-fixed-dim text-on-primary-container`
const BTN_GHOST = `${BTN} border-2 border-on-surface text-on-surface`

export default function CarePage() {
  const { t } = useTranslation()
  const [helpers, setHelpers] = useState<Helper[] | null>(null)
  const [clients, setClients] = useState<Client[] | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])

  const load = useCallback(() => {
    fetchApi<Helper[]>('/care/helpers').then(setHelpers).catch(() => setHelpers([]))
    fetchApi<Client[]>('/care/clients').then(setClients).catch(() => setClients([]))
    fetchApi<Approval[]>('/care/approvals').then(setApprovals).catch(() => setApprovals([]))
  }, [])
  useEffect(load, [load])

  const loading = helpers === null || clients === null
  const isCaretaker = (clients?.length ?? 0) > 0

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-10">
      <h1 className="text-3xl text-on-surface">{t.care.title}</h1>
      {loading && <div className="h-40 rounded-2xl bg-surface-container animate-pulse" aria-hidden="true" />}

      {!loading && (helpers!.length > 0 || !isCaretaker) && (
        <HelpersSection helpers={helpers!} onChange={load} />
      )}
      {!loading && (
        <ClientsSection clients={clients!} approvals={approvals} onChange={load} />
      )}
    </div>
  )
}

// ── Betreute Person: Wer hilft mir? ─────────────────────────────────────────

function HelpersSection({ helpers, onChange }: { helpers: Helper[]; onChange: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="space-y-4" aria-labelledby="helpers-title">
      <h2 id="helpers-title" className="text-2xl text-on-surface">{t.care.helpersTitle}</h2>
      {helpers.length === 0 && <p className="text-on-surface-variant">{t.care.helpersEmpty}</p>}
      {helpers.map((h) => <HelperCard key={h.id} helper={h} onChange={onChange} />)}
    </section>
  )
}

function HelperCard({ helper, onChange }: { helper: Helper; onChange: () => void }) {
  const { t, locale } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [read, setRead] = useState(helper.can_read_chat)
  const [protect, setProtect] = useState(helper.can_set_protection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await fn(); onChange() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const rights = [
    { on: helper.can_read_chat, text: t.care.mayRead },
    { on: helper.can_set_protection, text: t.care.mayProtect },
  ]
  const summary = [
    fill(t.care.helpedBy, { nickname: helper.caretaker_nickname }),
    ...rights.filter((r) => r.on).map((r) => r.text),
    t.care.mayWriteNever,
  ].join('. ')

  return (
    <article className={`${CARD} space-y-4`}>
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed-dim text-2xl font-bold text-background" aria-hidden="true">
          {helper.caretaker_nickname[0]?.toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold text-on-surface">{helper.caretaker_nickname}</p>
          {helper.org_name && <p className="text-on-surface-variant">{fill(t.care.inviteOrg, { org: helper.org_name })}</p>}
        </div>
      </div>

      {!helper.accepted_at ? (
        <>
          <p className="text-lg text-on-surface">{fill(t.care.inviteFrom, { nickname: helper.caretaker_nickname })}</p>
          <RightsList rights={rights} />
          <div className="grid gap-3 sm:grid-cols-2">
            <button className={BTN_PRIMARY} disabled={busy} onClick={() => run(() => fetchApi(`/care/helpers/${helper.id}/accept`, { method: 'POST' }))}>
              <Check aria-hidden /> {t.care.accept}
            </button>
            <button className={BTN_GHOST} disabled={busy} onClick={() => run(() => fetchApi(`/care/helpers/${helper.id}`, { method: 'DELETE' }))}>
              <X aria-hidden /> {t.care.decline}
            </button>
          </div>
        </>
      ) : editing ? (
        <div className="space-y-3">
          <Toggle id={`read-${helper.id}`} label={t.care.mayRead} checked={read} onChange={setRead} />
          <Toggle id={`protect-${helper.id}`} label={t.care.mayProtect} checked={protect} onChange={setProtect} />
          <div className="grid gap-3 sm:grid-cols-2">
            <button className={BTN_PRIMARY} disabled={busy} onClick={() => run(async () => {
              await fetchApi(`/care/helpers/${helper.id}`, { method: 'PATCH', body: JSON.stringify({ can_read_chat: read, can_set_protection: protect }) })
              setEditing(false)
            })}>{t.care.save}</button>
            <button className={BTN_GHOST} onClick={() => setEditing(false)}>{t.care.cancel}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-on-surface">{t.care.mayTitle}</p>
            <ReadAloud text={summary} />
          </div>
          <RightsList rights={rights} />
          <p className="text-on-surface-variant">
            {fill(t.care.allowedSince, { date: formatDate(helper.accepted_at, locale) })}{' '}
            {helper.expires_at ? fill(t.care.validUntil, { date: formatDate(helper.expires_at, locale) }) : t.care.validForever}
          </p>
          {confirmEnd ? (
            <div className="space-y-3">
              <p className="font-bold text-on-surface">{fill(t.care.endConfirm, { nickname: helper.caretaker_nickname })}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button className={`${BTN} bg-error text-background`} disabled={busy} onClick={() => run(() => fetchApi(`/care/helpers/${helper.id}`, { method: 'DELETE' }))}>
                  {t.care.end}
                </button>
                <button className={BTN_GHOST} onClick={() => setConfirmEnd(false)}>{t.care.cancel}</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button className={BTN_GHOST} onClick={() => setEditing(true)}>{t.care.changeRights}</button>
              <button className={`${BTN} text-error underline`} onClick={() => setConfirmEnd(true)}>{t.care.end}</button>
            </div>
          )}
        </>
      )}
      {error && <p className="text-error" role="alert">{error}</p>}
    </article>
  )
}

function RightsList({ rights }: { rights: { on: boolean; text: string }[] }) {
  const { t } = useTranslation()
  return (
    <ul className="divide-y-2 divide-surface-container-high" role="list">
      {[...rights, { on: false, text: t.care.mayWriteNever }].map((r) => (
        <li key={r.text} className="flex items-center gap-3 py-2.5 text-on-surface">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              r.on ? 'bg-tertiary-fixed-dim text-background' : 'bg-surface-container-high text-on-surface-variant'
            }`}
            aria-hidden="true"
          >
            {r.on ? <Check size={18} /> : <X size={18} />}
          </span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  )
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 rounded-xl bg-surface-container-high px-4 py-3 text-on-surface">
      <span>{label}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-[var(--color-primary-fixed-dim)]" />
    </label>
  )
}

// ── Betreuung: Meine Leute ──────────────────────────────────────────────────

function ClientsSection({ clients, approvals, onChange }: { clients: Client[]; approvals: Approval[]; onChange: () => void }) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.user_id ?? null)
  const selected = clients.find((c) => c.user_id === selectedId) ?? clients[0]

  return (
    <section className="space-y-5" aria-labelledby="clients-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="clients-title" className="text-2xl text-on-surface">{t.care.clientsTitle}</h2>
      </div>

      {clients.length === 0 ? (
        <p className="text-on-surface-variant">{t.care.clientsEmpty}</p>
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto p-2 -m-2" role="tablist" aria-label={t.care.clientsTitle}>
            {clients.map((c) => {
              const active = c.user_id === selected?.user_id
              const open = c.pending_approvals + c.open_reports
              return (
                <button
                  key={c.user_id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(c.user_id)}
                  className="flex shrink-0 flex-col items-center gap-1.5 text-sm font-bold text-on-surface"
                >
                  <span
                    className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-highest text-2xl ${
                      active ? 'ring-4 ring-primary-fixed-dim ring-offset-2 ring-offset-background' : ''
                    }`}
                    aria-hidden="true"
                  >
                    {c.nickname[0]?.toUpperCase()}
                    {open > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-fixed-dim px-1 text-xs text-on-primary-container">
                        {open}
                      </span>
                    )}
                  </span>
                  {c.nickname}
                </button>
              )
            })}
          </div>
          {selected && (
            <ClientPanel
              key={selected.user_id}
              client={selected}
              approvals={approvals.filter((a) => a.client_nickname === selected.nickname)}
              onChange={onChange}
            />
          )}
        </>
      )}

      <InviteForm onDone={onChange} />
    </section>
  )
}

function ClientPanel({ client, approvals, onChange }: { client: Client; approvals: Approval[]; onChange: () => void }) {
  const { t, locale } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [chats, setChats] = useState<ClientConversation[] | null>(null)
  const [openChat, setOpenChat] = useState<{ id: string; partner: string; messages: ClientMessage[] } | null>(null)
  const days = daysUntil(client.expires_at)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await fn(); onChange() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function showChat(c: ClientConversation) {
    try {
      const messages = await fetchApi<ClientMessage[]>(`/care/clients/${client.user_id}/conversations/${c.id}/messages`)
      setOpenChat({ id: c.id, partner: c.partner_nickname, messages })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl text-on-surface mr-2">{client.nickname}</h3>
        {!client.accepted_at && <Badge icon={<Clock size={14} />}>{t.care.pendingInvite}</Badge>}
        {client.vulnerable_flag && <Badge icon={<ShieldCheck size={14} />}>{t.care.vulnerable}</Badge>}
        {client.org_name && <Badge>{client.org_name}</Badge>}
        {days !== null && days <= 14 && <Badge warn icon={<Clock size={14} />}>{fill(t.care.expiresIn, { days })}</Badge>}
      </div>

      {client.open_reports > 0 && (
        <div className={`${CARD} flex items-center gap-4 bg-[color-mix(in_srgb,var(--color-tertiary-fixed-dim)_15%,var(--color-surface-container))]`}>
          <Flag className="shrink-0 text-on-surface" aria-hidden />
          <p className="font-bold text-on-surface">{fill(t.care.openReports, { n: client.open_reports })}</p>
        </div>
      )}

      {approvals.map((a) => (
        <article key={a.id} className={`${CARD} space-y-3 border-2 border-primary-fixed-dim`}>
          <p className="text-lg font-bold text-on-surface">{fill(t.care.approvalFor, { sender: a.sender_nickname, client: a.client_nickname })}</p>
          {a.message_preview && <blockquote className="rounded-xl bg-surface-container-high p-3 text-on-surface">„{a.message_preview}“</blockquote>}
          <ul className="space-y-1.5 text-on-surface" role="list">
            <li className="flex items-center gap-2"><Check size={18} className="text-tertiary-fixed-dim" aria-hidden /> {fill(t.care.clientSaidYes, { client: a.client_nickname })}</li>
            <li className="flex items-center gap-2">
              {a.sender_reports === 0 ? <Check size={18} className="text-tertiary-fixed-dim" aria-hidden /> : <Flag size={18} className="text-error" aria-hidden />}
              {a.sender_reports === 0
                ? fill(t.care.senderNoReports, { sender: a.sender_nickname })
                : fill(t.care.senderReports, { n: a.sender_reports, sender: a.sender_nickname })}
            </li>
            <li className="flex items-center gap-2 text-on-surface-variant">
              <Clock size={18} aria-hidden /> {fill(t.care.senderSince, { date: formatDate(a.sender_since, locale) })}{a.sender_city ? ` · ${a.sender_city}` : ''}
            </li>
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className={BTN_PRIMARY} disabled={busy} onClick={() => run(() => fetchApi(`/care/approvals/${a.id}`, { method: 'PATCH', body: JSON.stringify({ approve: true }) }))}>
              <Check aria-hidden /> {t.care.approve}
            </button>
            <button className={BTN_GHOST} disabled={busy} onClick={() => run(() => fetchApi(`/care/approvals/${a.id}`, { method: 'PATCH', body: JSON.stringify({ approve: false }) }))}>
              <X aria-hidden /> {t.care.reject}
            </button>
          </div>
        </article>
      ))}
      {approvals.length === 0 && client.accepted_at && client.can_set_protection && (
        <p className="text-on-surface-variant">{t.care.approvalsEmpty}</p>
      )}

      {client.accepted_at && client.can_set_protection && (
        <label htmlFor={`prot-${client.user_id}`} className={`${CARD} flex items-center justify-between gap-4`}>
          <span>
            <span className="block font-bold text-on-surface">{t.care.protection}</span>
            <span className="block text-on-surface-variant">{t.care.protectionDesc}</span>
          </span>
          <input
            id={`prot-${client.user_id}`}
            type="checkbox"
            role="switch"
            checked={client.enhanced_protection}
            disabled={busy}
            onChange={(e) => run(() => fetchApi(`/care/clients/${client.user_id}/protection`, {
              method: 'PATCH', body: JSON.stringify({ enhanced_protection: e.target.checked }),
            }))}
            className="h-7 w-7 accent-[var(--color-primary-fixed-dim)]"
          />
        </label>
      )}

      {client.accepted_at && client.can_read_chat && (
        <div className={`${CARD} space-y-3`}>
          <button
            className={BTN_GHOST}
            onClick={() => {
              if (chats) { setChats(null); setOpenChat(null); return }
              fetchApi<ClientConversation[]>(`/care/clients/${client.user_id}/conversations`).then(setChats).catch((e: Error) => setError(e.message))
            }}
          >
            <MessageCircle aria-hidden /> {chats ? t.care.hideChats : t.care.readChats}
          </button>
          {chats && (
            <>
              <p className="text-sm text-on-surface-variant">{t.care.readOnly}</p>
              {chats.length === 0 && <p className="text-on-surface-variant">{t.care.chatsEmpty}</p>}
              <ul className="space-y-2" role="list">
                {chats.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => showChat(c)} className="w-full rounded-xl bg-surface-container-high p-3 text-left">
                      <span className="block font-bold text-on-surface">{c.partner_nickname}</span>
                      <span className="block truncate text-sm text-on-surface-variant">{c.last_message ?? '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {openChat && (
                <div className="space-y-2 rounded-xl border-2 border-outline-variant p-3" aria-label={openChat.partner}>
                  {openChat.messages.map((m) => (
                    <p
                      key={m.id}
                      className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.from_client ? 'ml-auto bg-primary-fixed-dim text-on-primary-container' : 'bg-surface-container-high text-on-surface'}`}
                    >
                      {m.content ?? '—'}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="text-error" role="alert">{error}</p>}
    </div>
  )
}

function Badge({ children, icon, warn }: { children: React.ReactNode; icon?: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
      warn ? 'bg-error-container text-on-surface' : 'bg-surface-container-high text-on-surface'
    }`}>
      {icon}{children}
    </span>
  )
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const { modules } = useTenant()
  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [read, setRead] = useState(false)
  const [protect, setProtect] = useState(true)
  const [until, setUntil] = useState('')
  const [orgs, setOrgs] = useState<OrgSummary[]>([])
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (open && modules.orgs) fetchApi<OrgSummary[]>('/orgs/mine').then(setOrgs).catch(() => {})
  }, [open, modules.orgs])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await fetchApi('/care/clients', {
        method: 'POST',
        body: JSON.stringify({
          nickname: nickname.trim(), can_read_chat: read, can_set_protection: protect,
          ...(until ? { expires_at: new Date(until).toISOString() } : {}),
          ...(orgId ? { org_id: orgId } : {}),
        }),
      })
      setMsg({ ok: true, text: t.care.inviteSent })
      setNickname('')
      onDone()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className={BTN_GHOST} onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> {t.care.invite}
      </button>
    )
  }
  return (
    <form onSubmit={submit} className={`${CARD} space-y-4`}>
      <h3 className="flex items-center gap-2 text-xl text-on-surface"><HandHelping aria-hidden /> {t.care.invite}</h3>
      <div className="space-y-2">
        <label htmlFor="invite-nick" className="block font-bold text-on-surface">{t.care.inviteNickname}</label>
        <input id="invite-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} required minLength={3} maxLength={30}
          className="w-full rounded-xl border-2 border-on-surface-variant bg-background p-3 text-on-surface" />
      </div>
      <Toggle id="invite-read" label={t.care.inviteRead} checked={read} onChange={setRead} />
      <Toggle id="invite-protect" label={t.care.inviteProtect} checked={protect} onChange={setProtect} />
      <div className="space-y-2">
        <label htmlFor="invite-until" className="block font-bold text-on-surface">{t.care.inviteUntil}</label>
        <input id="invite-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)}
          className="w-full rounded-xl border-2 border-on-surface-variant bg-background p-3 text-on-surface" />
      </div>
      {orgs.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="invite-org" className="block font-bold text-on-surface">{t.care.inviteOrgLabel}</label>
          <select id="invite-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}
            className="w-full rounded-xl border-2 border-on-surface-variant bg-background p-3 text-on-surface">
            <option value="">{t.care.inviteNone}</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      {msg && <p className={msg.ok ? 'text-on-surface' : 'text-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="submit" className={BTN_PRIMARY} disabled={busy || nickname.trim().length < 3}>{t.care.inviteSend}</button>
        <button type="button" className={BTN_GHOST} onClick={() => setOpen(false)}>{t.care.cancel}</button>
      </div>
    </form>
  )
}
