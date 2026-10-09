// Betreuung / Organisation (Module "caretaker", "orgs") —
// Spiegel von backend/src/modules/core/care
export interface Helper {
  id: string
  caretaker_nickname: string
  org_name: string | null
  can_read_chat: boolean
  can_set_protection: boolean
  accepted_at: string | null
  expires_at: string | null
  created_at: string
}

export interface Client {
  id: string
  user_id: string
  nickname: string
  can_read_chat: boolean
  can_set_protection: boolean
  accepted_at: string | null
  expires_at: string | null
  org_id: string | null
  org_name: string | null
  vulnerable_flag: boolean
  enhanced_protection: boolean
  pending_approvals: number
  open_reports: number
}

export interface Approval {
  id: string
  message_preview: string | null
  created_at: string
  receiver_accepted_at: string
  client_nickname: string
  sender_nickname: string
  sender_city: string | null
  sender_since: string
  sender_reports: number
}

export interface ClientConversation {
  id: string
  partner_nickname: string
  last_message: string | null
  last_message_at: string | null
}

export interface ClientMessage {
  id: string
  from_client: boolean
  content: string | null
  type: string
  sent_at: string
}

export interface OrgSummary {
  id: string
  name: string
  description: string | null
  is_verified: boolean
  role: 'admin' | 'member'
  members: number
  clients: number
}

export interface OrgOverview {
  id: string
  name: string
  description: string | null
  is_verified: boolean
  members: { user_id: string; nickname: string; role: 'admin' | 'member'; clients: number }[]
  clients: {
    id: string
    user_id: string
    nickname: string
    caretaker_nickname: string
    can_read_chat: boolean
    can_set_protection: boolean
    accepted_at: string | null
    expires_at: string | null
    vulnerable_flag: boolean
    pending_approvals: number
    open_reports: number
  }[]
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
}

export function formatDate(date: string, locale: string): string {
  return new Date(date).toLocaleDateString(locale === 'leet' || locale === 'de_easy' ? 'de-DE' : locale, {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}
