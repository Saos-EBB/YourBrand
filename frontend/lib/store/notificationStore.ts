import { create } from 'zustand'

export type NotificationType =
  'message' | 'match' | 'system' | 'ban' | 'request' |
  'beef_request' | 'beef_accepted' | 'beef_won' | 'beef_lost'

export interface Notification {
  id: string
  type: NotificationType
  content: string
  content_vars?: Record<string, unknown> | null
  is_read: boolean
  created_at: string
  count?: number
  conversation_id?: string
  /** True for client-generated notifications that have no backend record. */
  _local?: true
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  activeConversationId: string | null
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Notification) => void
  addOrUpdateNotification: (notification: Notification) => void
  markRead: (id: string) => void
  markAllRead: () => void
  removeNotification: (id: string) => void
  setActiveConversationId: (id: string) => void
  clearActiveConversationId: () => void
  adminTicketCount: number
  setAdminTicketCount: (n: number) => void
  incrementAdminTicketCount: () => void
  adminMediaCount: number
  setAdminMediaCount: (n: number) => void
  incrementAdminMediaCount: () => void
  adminSoundTick: number
  bumpAdminSoundTick: () => void
  // Shop-Alarm (Socket shop.alert): Zaehler und Listen laden neu
  shopAlertTick: number
  bumpShopAlertTick: () => void
}

export function mergeNotification(existing: Notification[], incoming: Notification): Notification[] {
  if (incoming.type === 'message' && incoming.conversation_id) {
    const idx = existing.findIndex(
      (n) => n.type === 'message' && !n.is_read && n.conversation_id === incoming.conversation_id,
    )
    if (idx !== -1) {
      const prev = existing[idx]
      const newCount = (prev.count ?? 1) + 1
      const next = [...existing]
      next[idx] = { ...prev, count: newCount, content: `${newCount} neue Nachrichten`, created_at: incoming.created_at }
      return next
    }
  }

  if (incoming.type === 'request') {
    const idx = existing.findIndex((n) => n.type === 'request' && !n.is_read)
    const addCount = incoming.count ?? 1
    if (idx !== -1) {
      const prev = existing[idx]
      const newCount = (prev.count ?? 1) + addCount
      const next = [...existing]
      next[idx] = {
        ...prev,
        count: newCount,
        content: newCount === 1 ? '1 neue Kontaktanfrage' : `${newCount} neue Kontaktanfragen`,
        created_at: incoming.created_at,
      }
      return next
    }
    const count = addCount
    const content = count === 1 ? '1 neue Kontaktanfrage' : `${count} neue Kontaktanfragen`
    return [{ ...incoming, count, content }, ...existing]
  }

  if (incoming.type === 'system') {
    return [incoming, ...existing.filter((n) => n.type !== 'system')]
  }

  if (existing.some((n) => n.id === incoming.id)) return existing
  return [{ ...incoming, count: 1 }, ...existing]
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,
  activeConversationId: null,
  setNotifications: (incoming) =>
    set((state) => {
      const merged = [
        ...incoming,
        ...state.notifications.filter(
          (n) => n._local && !incoming.some((b) => b.id === n.id)
        ),
      ]
      return { notifications: merged, unreadCount: merged.filter((n) => !n.is_read).length }
    }),
  addNotification: (notification) =>
    set((state) => {
      if (state.notifications.some((n) => n.id === notification.id)) return state
      const notifications = [notification, ...state.notifications]
      return { notifications, unreadCount: notifications.filter((n) => !n.is_read).length }
    }),
  addOrUpdateNotification: (n) =>
    set((s) => {
      const notifications = mergeNotification(s.notifications, n)
      return { notifications, unreadCount: notifications.filter((x) => !x.is_read).length }
    }),
  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      )
      return { notifications, unreadCount: notifications.filter((n) => !n.is_read).length }
    }),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    })),
  removeNotification: (id) =>
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id)
      return { notifications, unreadCount: notifications.filter((n) => !n.is_read).length }
    }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  clearActiveConversationId: () => set({ activeConversationId: null }),
  adminTicketCount: 0,
  setAdminTicketCount: (n) => set({ adminTicketCount: n }),
  incrementAdminTicketCount: () => set((s) => ({ adminTicketCount: s.adminTicketCount + 1 })),
  adminMediaCount: 0,
  setAdminMediaCount: (n) => set({ adminMediaCount: n }),
  incrementAdminMediaCount: () => set((s) => ({ adminMediaCount: s.adminMediaCount + 1 })),
  adminSoundTick: 0,
  bumpAdminSoundTick: () => set((s) => ({ adminSoundTick: s.adminSoundTick + 1 })),
  shopAlertTick: 0,
  bumpShopAlertTick: () => set((s) => ({ shopAlertTick: s.shopAlertTick + 1 })),
}))
