'use client'

import { useEffect } from 'react'
import { useConversationStore, type Conversation } from '@/lib/store/conversationStore'
import { useAuthStore } from '@/lib/store/authStore'
import { fetchApi, normalise } from '@/lib/api'
import { useModuleEnabled } from '@/components/TenantProvider'

function isUnread(conv: Conversation, currentUserId: string | undefined): boolean {
  return (
    currentUserId != null &&
    conv.last_message_at != null &&
    conv.last_message_sender_id !== currentUserId &&
    conv.read_at == null
  )
}

export function useUnreadMessageCount(): number {
  const conversations = useConversationStore((s) => s.conversations)
  const currentUserId = useAuthStore((s) => (s.user as any)?.user_id ?? s.user?.id)
  const chatEnabled   = useModuleEnabled('chat')

  useEffect(() => {
    if (!chatEnabled || useConversationStore.getState().conversations.length > 0) return
    fetchApi<Conversation[] | { data: Conversation[] }>('/chat/conversations')
      .then((res) => normalise(res))
      .then((convs) => useConversationStore.getState().setConversations(convs))
      .catch(() => {})
  }, [chatEnabled])

  return conversations.filter((conv) => isUnread(conv, currentUserId)).length
}
