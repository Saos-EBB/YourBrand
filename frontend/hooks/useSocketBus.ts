'use client'

import { useEffect, useRef } from 'react'
import { connect, disconnect } from '@/lib/socket'
import { useAuthStore, selectUserId } from '@/lib/store/authStore'
import { useNotificationStore } from '@/lib/store/notificationStore'
import { useConversationStore, type Message } from '@/lib/store/conversationStore'
import { useToastStore } from '@/lib/store/toastStore'

export function useSocketBus(isReady: boolean) {
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const adminSoundTick = useNotificationStore((s) => s.adminSoundTick)
  useEffect(() => {
    if (adminSoundTick === 0) return
    new Audio('/sounds/workwork.mp3').play().catch((e) => console.warn('[sound] autoplay blocked:', e))
  }, [adminSoundTick])

  useEffect(() => {
    if (!isReady) return

    const sock = connect()

    const handlers: Record<string, (data: any) => void> = {
      new_message: (msg: Message) => {
        const activeId = useNotificationStore.getState().activeConversationId

        // Clear partner typing when a message arrives in the open conversation
        if (msg.conversation_id === activeId) {
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = null
          }
          useConversationStore.getState().setPartnerTyping(false)
        }

        // Update conversation list preview
        useConversationStore.getState().applyMessage(msg)

        // Deliver to open chat page
        useConversationStore.getState().pushPendingMessage(msg)

        // Bell notification — only for messages from others not in the active conversation
        const myId = selectUserId()
        if (msg.sender_id !== myId && msg.conversation_id !== activeId) {
          useNotificationStore.getState().addOrUpdateNotification({
            id: `temp-msg-${msg.id}`,
            type: 'message',
            content: `${msg.sender_nickname ?? 'Jemand'} hat dir eine Nachricht geschickt.`,
            is_read: false,
            created_at: new Date().toISOString(),
            conversation_id: msg.conversation_id,
            _local: true,
          })
        }
      },

      user_typing: ({ userId, conversationId }: { userId: string; conversationId: string }) => {
        const myId = selectUserId()
        const activeId = useNotificationStore.getState().activeConversationId
        if (conversationId !== activeId || userId === myId) return
        useConversationStore.getState().setPartnerTyping(true)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => {
          useConversationStore.getState().setPartnerTyping(false)
        }, 3000)
      },

      notification: (notification: any) => {
        useNotificationStore.getState().addOrUpdateNotification(notification)
      },

      contact_request: (request: any) => {
        useNotificationStore.getState().addOrUpdateNotification({
          id: request.id,
          type: 'request',
          content: 'Neue Kontaktanfrage',
          is_read: false,
          created_at: new Date().toISOString(),
          _local: true,
        })
      },

      contact_request_accepted: (payload: { conversationId: string; acceptedByNickname: string }) => {
        useToastStore.getState().addToast({
          nickname: payload.acceptedByNickname,
          conversationId: payload.conversationId,
        })
      },

      'user.banned': () => {
        useAuthStore.getState().clearAuth()
        useAuthStore.getState().setBanned(true)
      },

      'user.unbanned': () => {
        useAuthStore.getState().setBanned(false)
      },

      'ticket.new': () => {
        useNotificationStore.getState().incrementAdminTicketCount()
        useNotificationStore.getState().bumpAdminSoundTick()
      },

      'shop.alert': () => {
        useNotificationStore.getState().bumpShopAlertTick()
        useNotificationStore.getState().bumpAdminSoundTick()
      },

      'media:pending_review': () => {
        useNotificationStore.getState().incrementAdminTicketCount()
        useNotificationStore.getState().incrementAdminMediaCount()
        useNotificationStore.getState().bumpAdminSoundTick()
      },
    }

    for (const [event, handler] of Object.entries(handlers)) {
      sock.on(event, handler)
    }

    return () => {
      disconnect()
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [isReady])
}
