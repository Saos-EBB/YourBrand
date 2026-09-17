'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { fetchApi, normalise } from '@/lib/api'
import { useAuthStore, selectUserId } from '@/lib/store/authStore'
import { useConversationStore, type Conversation } from '@/lib/store/conversationStore'
import { OnlineIndicator, getStatusColor } from '@/components/ui/OnlineIndicator'
import { useTranslation } from '@/lib/i18n'

function SkeletonItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="flex-shrink-0 h-12 w-12 rounded-full bg-surface-container-high" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="flex justify-between gap-2">
          <div className="h-3.5 w-32 rounded-lg bg-surface-container-high" />
          <div className="h-3 w-14 rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-3 w-48 rounded-lg bg-surface-container-high" />
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const currentUserId = useAuthStore(selectUserId)
  const conversations = useConversationStore((s) => s.conversations)
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map())
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  function getPreview(content: string | null | undefined): string {
    if (!content) return t.chat.noMessages
    return content.length > 40 ? content.slice(0, 40) + '...' : content
  }

  function shortId(id: string): string {
    return t.chat.shortUserId.replace('{id}', id.slice(0, 6).toUpperCase())
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi<Conversation[] | { data: Conversation[] }>('/chat/conversations')
        const convs = normalise(res)
        useConversationStore.getState().setConversations(convs)

        const myId = selectUserId(useAuthStore.getState())
        const partnerIds = [...new Set(convs.map((c) => c.user_a_id === myId ? c.user_b_id : c.user_a_id))]
        const profiles = await Promise.all(
          partnerIds.map((pid) =>
            fetchApi<{ nickname: string; photo_url: string | null }>(`/profile/user/${pid}`).catch(() => null)
          )
        )
        const map = new Map<string, string>()
        const photoMap = new Map<string, string | null>()
        partnerIds.forEach((pid, i) => {
          const p = profiles[i]
          if (p) {
            map.set(pid, p.nickname)
            photoMap.set(pid, p.photo_url ?? null)
          }
        })
        setNicknames(map)
        setPhotos(photoMap)
      } catch (err) {
        if (err instanceof Error && err.message === 'Session expired') return
        setError(err instanceof Error ? err.message : t.chat.loadError)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function getPartnerId(conv: Conversation): string {
    return conv.user_a_id === currentUserId ? conv.user_b_id : conv.user_a_id
  }

  function isUnread(conv: Conversation): boolean {
    return (
      currentUserId != null &&
      conv.last_message_at != null &&
      conv.last_message_sender_id !== currentUserId &&
      conv.read_at == null
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20 md:pb-8">
      <div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
        <h1 className="text-2xl font-bold text-on-surface">{t.chat.title}</h1>
      </div>

      {loading ? (
        <div className="divide-y divide-outline-variant mt-2" aria-busy="true" aria-label={t.chat.loadingConversations}>
          {[0, 1, 2, 3].map((i) => <SkeletonItem key={i} />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 px-6" role="alert">
          <p className="text-on-surface font-semibold">{t.chat.loadError}</p>
          <p className="text-on-surface-variant text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity"
          >
            {t.common.retry}
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-2 px-6">
          <MessageCircle className="h-10 w-10 text-on-surface-variant" aria-hidden="true" />
          <p className="text-on-surface font-semibold">{t.chat.empty}</p>
          <p className="text-on-surface-variant text-sm">
            {t.chat.emptyDesc}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant mt-2" aria-label={t.chat.conversationList}>
          {conversations.map((conv) => {
            const partnerId = getPartnerId(conv)
            const unread = isUnread(conv)
            const realNickname = nicknames.get(partnerId)
            const nickname = realNickname ?? shortId(partnerId)
            const preview = getPreview(conv.last_message_content)
            const partnerPhotoUrl = photos.get(partnerId) ?? null
            return (
              <li key={conv.id}>
                <div
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-surface-container-low active:bg-surface-container transition-colors min-h-[72px] cursor-pointer"
                  aria-label={`${t.chat.conversationWith.replace('{nickname}', nickname)}${conv.last_message_at ? ', ' + formatTime(conv.last_message_at) : ''}`}
                >
                  <div className="relative flex-shrink-0">
                    {partnerPhotoUrl ? (
                      <img
                        src={partnerPhotoUrl.replace('http://localhost:3000', '')}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <span className="text-base font-semibold text-on-surface-variant select-none">
                          {nickname.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span
                      className="absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: getStatusColor(conv.partner_is_online ?? false, conv.partner_status_message) }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      {realNickname ? (
                        <Link
                          href={`/profile/${realNickname}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-on-surface text-sm truncate hover:underline cursor-pointer ${unread ? 'font-semibold' : 'font-medium'}`}
                        >
                          {nickname}
                        </Link>
                      ) : (
                        <span className={`text-on-surface text-sm truncate ${unread ? 'font-semibold' : 'font-medium'}`}>
                          {nickname}
                        </span>
                      )}
                      {conv.last_message_at && (
                        <span className="flex items-baseline gap-0.5 flex-shrink-0">
                          <span className="text-xs text-zinc-400" aria-hidden="true">
                            {conv.last_message_sender_id === currentUserId ? '↗' : '↙'}
                          </span>
                          <time
                            className="text-xs text-on-surface-variant"
                            dateTime={conv.last_message_at}
                          >
                            {formatTime(conv.last_message_at)}
                          </time>
                        </span>
                      )}
                    </div>
                    <p className={`text-xs text-on-surface-variant mt-0.5 truncate ${unread ? 'font-semibold italic' : ''}`}>
                      {preview}
                    </p>
                    {conv.partner_status_message && (
                      <OnlineIndicator
                        is_online={conv.partner_is_online ?? false}
                        status_message={conv.partner_status_message}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
