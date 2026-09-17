'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronDown, Send, User, Loader2, AlertCircle, Trash2, MoreVertical, Flag, Ban, Swords } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useAuthStore, selectUserId } from '@/lib/store/authStore'
import { blurText } from '@/lib/profanity'
import { useNotificationStore } from '@/lib/store/notificationStore'
import { connect, getSocket } from '@/lib/socket'
import { useConversationStore, type Message } from '@/lib/store/conversationStore'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import ReportModal from '@/components/ui/ReportModal'
import { useTranslation } from '@/lib/i18n'
import { useHiddenStore } from '@/lib/store/hiddenStore'

// ─── Types ────────────────────────────────────────────────────────────────────

// Extends Message with local-only optimistic status
interface LocalMessage extends Message {
  _status?: 'pending' | 'error'
}

type MsgEnvelope = Message[] | { data: Message[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(res: MsgEnvelope): Message[] {
  return Array.isArray(res) ? res : (res?.data ?? [])
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwn,
  profanityFilter,
  onLongPress,
  onContextMenu,
  avatarUrl,
  avatarInitial,
}: {
  msg: LocalMessage
  isOwn: boolean
  profanityFilter: boolean
  onLongPress: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  avatarUrl?: string | null
  avatarInitial?: string
}) {
  const { t, locale } = useTranslation()
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    const loc = locale === 'en' ? 'en-GB' : 'de-DE'
    if (sameDay) {
      return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  }

  function startPress() {
    didLongPress.current = false
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onLongPress(msg.id)
    }, 500)
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  if (msg.is_deleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <p className="text-xs italic text-on-surface-variant px-3 py-2">
          {t.chat.messageDeleted}
        </p>
      </div>
    )
  }

  return (
    <div
      className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
      onTouchStart={isOwn ? startPress : undefined}
      onTouchEnd={isOwn ? cancelPress : undefined}
      onTouchMove={isOwn ? cancelPress : undefined}
      onContextMenu={isOwn ? (e) => { e.preventDefault(); onContextMenu(e, msg.id) } : undefined}
    >
      {/* Avatar — only for other user */}
      {!isOwn && (
        avatarUrl ? (
          <img
            src={avatarUrl.replace('http://localhost:3000', '')}
            alt=""
            loading="lazy"
            className="flex-shrink-0 h-7 w-7 rounded-full object-cover mb-0.5"
          />
        ) : (
          <div
            className="flex-shrink-0 h-7 w-7 rounded-full bg-surface-container-high flex items-center justify-center mb-0.5"
            aria-hidden="true"
          >
            {avatarInitial ? (
              <span className="text-[10px] font-semibold text-on-surface-variant select-none">{avatarInitial}</span>
            ) : (
              <User className="h-3.5 w-3.5 text-outline" />
            )}
          </div>
        )
      )}

      <div className={`flex flex-col gap-1 max-w-[75%] sm:max-w-[60%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 leading-relaxed text-sm break-words ${
            isOwn
              ? 'rounded-br-sm bg-surface-container text-on-surface'
              : 'rounded-bl-sm bg-primary-fixed-dim text-background'
          } ${msg._status === 'pending' ? 'opacity-60' : ''} ${msg._status === 'error' ? 'ring-1 ring-error' : ''}`}
        >
          {!isOwn && profanityFilter ? blurText(msg.content) : msg.content}
        </div>

        <div className={`flex items-center gap-1.5 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <time className="text-[10px] text-on-surface-variant" dateTime={msg.sent_at}>
            {formatTime(msg.sent_at)}
          </time>
          {msg._status === 'pending' && (
            <Loader2 className="h-3 w-3 text-on-surface-variant animate-spin" aria-label={t.chat.sendingAriaLabel} />
          )}
          {msg._status === 'error' && (
            <AlertCircle className="h-3 w-3 text-error" aria-label={t.chat.sendErrorAriaLabel} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConversationPage() {
  const params = useParams<{ id: string }>()
  const conversationId = params.id
  const router = useRouter()
  const { t } = useTranslation()

  const currentUserId   = useAuthStore(selectUserId)
  const accessToken     = useAuthStore((s) => s.accessToken)
  const profanityFilter = useAuthStore((s) => (s.user as any)?.profanity_filter as boolean ?? true)
  const ownNickname     = useAuthStore((s) => (s.user as any)?.nickname as string | undefined)

  const DURATION_OPTIONS = [
    // TODO: DELETE BEFORE SHIPMENT — dev/demo only
    { label: '1 Min (DEV)', value: 60 },
    { label: '15 Min',      value: 900 },
    { label: '1h',          value: 3600 },
    { label: '6h',          value: 21600 },
    { label: '12h',         value: 43200 },
    { label: '24h',         value: 86400 },
    { label: '48h',         value: 172800 },
  ]

  const isHidden = useHiddenStore((s) => s.isHidden)
  const [beefOpen, setBeefOpen]             = useState(false)
  const [beefTldr, setBeefTldr]             = useState('')
  const [beefDuration, setBeefDuration]     = useState(86400)
  const [rangeStart, setRangeStart]         = useState<number | null>(null)
  const [rangeEnd, setRangeEnd]             = useState<number | null>(null)
  const [beefStep, setBeefStep]             = useState<'tldr' | 'passage' | 'game'>('tldr')
  const [beefGame, setBeefGame]             = useState<'rps' | 'tictactoe' | 'mastermind' | 'reaction'>('rps')
  const [beefSubmitting, setBeefSubmitting] = useState(false)
  const [beefError, setBeefError]           = useState<string | null>(null)

  const GAME_OPTIONS = [
    { value: 'rps'        as const, label: 'Rock Paper Scissors', desc: t.beef.rpsGameDesc,      emoji: '✊' },
    { value: 'tictactoe'  as const, label: 'Tic Tac Toe',         desc: t.beef.tttGameDesc,      emoji: '⬛' },
    { value: 'mastermind' as const, label: 'Mastermind',           desc: t.beef.mmGameDesc,       emoji: '🎨' },
    { value: 'reaction'   as const, label: t.beef.reactionTitle,   desc: t.beef.reactionGameDesc, emoji: '⚡' },
  ]

  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // id of message currently showing the delete confirmation sheet
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // three-dot menu + chat-level actions
  const [menuOpen, setMenuOpen]             = useState(false)
  const [deleteChatOpen, setDeleteChatOpen] = useState(false)
  const [deletingChat, setDeletingChat]     = useState(false)
  const [reportOpen, setReportOpen]         = useState(false)
  const [partnerUserId, setPartnerUserId]   = useState<string | null>(null)

  // block state
  const [isBlocked, setIsBlocked]   = useState(false)
  const [blockedBy, setBlockedBy]   = useState<'me' | 'them' | null>(null)
  const [blockOpen, setBlockOpen]   = useState(false)
  const [blocking, setBlocking]     = useState(false)

  const partnerTyping = useConversationStore((s) => s.partnerTyping)
  const pendingMessages = useConversationStore((s) => s.pendingMessages)

  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstScroll = useRef(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [partnerNickname, setPartnerNickname] = useState<string | null>(null)
  const [partnerPhotoUrl, setPartnerPhotoUrl] = useState<string | null>(null)
  const [partnerIsOnline, setPartnerIsOnline] = useState(false)
  const [partnerStatusMessage, setPartnerStatusMessage] = useState<string | null>(null)
  // Ref so the socket closure always reads the current nickname without re-subscribing
  const partnerNicknameRef = useRef<string | null>(null)
  const lastTypingEmit = useRef(0)

  function shortId(id: string): string {
    return t.chat.shortUserId.replace('{id}', id.slice(0, 6).toUpperCase())
  }

  // ── Active conversation tracking (suppresses bell notifications) ───────────

  useEffect(() => {
    const { setActiveConversationId, clearActiveConversationId } = useNotificationStore.getState()
    setActiveConversationId(conversationId)
    useConversationStore.getState().clearPendingMessages()
    useConversationStore.getState().setPartnerTyping(false)
    return () => {
      clearActiveConversationId()
      useConversationStore.getState().clearPendingMessages()
      useConversationStore.getState().setPartnerTyping(false)
    }
  }, [conversationId])

  // ── Consume incoming messages pushed by useSocketBus ──────────────────────

  useEffect(() => {
    if (pendingMessages.length === 0) return
    const msgs = pendingMessages.filter((m) => m.conversation_id === conversationId)
    useConversationStore.getState().clearPendingMessages()
    if (msgs.length === 0) return
    const myId = selectUserId(useAuthStore.getState())
    // A message from the partner proves they are active right now
    if (msgs.some((m) => m.sender_id !== myId)) setPartnerIsOnline(true)
    setMessages((prev) => {
      let next = [...prev]
      for (const msg of msgs) {
        if (msg.sender_id === myId) {
          const pendingIdx = next.findIndex((m) => m._status === 'pending')
          if (pendingIdx !== -1) {
            next = [...next]
            next[pendingIdx] = msg as LocalMessage
            continue
          }
        }
        if (!next.some((m) => m.id === msg.id)) {
          next = [...next, msg as LocalMessage]
        }
      }
      return next
    })
  }, [pendingMessages, conversationId])

  // ── Load messages ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [msgRes, conv] = await Promise.all([
          fetchApi<MsgEnvelope>(`/chat/conversations/${conversationId}/messages`),
          fetchApi<{ user_a_id: string; user_b_id: string; is_blocked: boolean; blocked_by: 'me' | 'them' | null }>(`/chat/conversations/${conversationId}`),
        ])
        setMessages(normalise(msgRes))
        setIsBlocked(conv.is_blocked)
        setBlockedBy(conv.blocked_by)
        const myId = selectUserId(useAuthStore.getState())
        const pid = conv.user_a_id === myId ? conv.user_b_id : conv.user_a_id
        setPartnerUserId(pid)
        fetchApi<{ nickname: string }>(`/profile/user/${pid}`)
          .then(async (p) => {
            setPartnerNickname(p.nickname)
            partnerNicknameRef.current = p.nickname
            const pub = await fetchApi<{ isOnline: boolean; statusMessage: string | null; photoUrl: string | null }>(
              `/profile/${encodeURIComponent(p.nickname)}`
            ).catch(() => null)
            if (pub) {
              setPartnerIsOnline(pub.isOnline)
              setPartnerStatusMessage(pub.statusMessage ?? null)
              setPartnerPhotoUrl(pub.photoUrl ?? null)
            }
          })
          .catch(() => { /* header falls back to shortId */ })
      } catch (err) {
        if (err instanceof Error && err.message === 'Session expired') return
        setError(err instanceof Error ? err.message : t.chat.loadError)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [conversationId])

  // ── Presence poll — re-check partner online state every 30 s ─────────────
  // The backend derives is_online from last_active_at (updated on every request);
  // there are no socket presence events, so polling is the only way to catch
  // the partner going offline after the initial load snapshot.

  useEffect(() => {
    if (!partnerNickname) return
    const interval = setInterval(async () => {
      const pub = await fetchApi<{ isOnline: boolean; statusMessage: string | null }>(
        `/profile/${encodeURIComponent(partnerNickname)}`
      ).catch(() => null)
      if (pub) {
        setPartnerIsOnline(pub.isOnline)
        setPartnerStatusMessage(pub.statusMessage ?? null)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [partnerNickname])

  // ── Socket — join room + mark read (listeners handled by useSocketBus) ─────

  useEffect(() => {
    if (!accessToken) return
    const sock = connect()
    sock.emit('join_conversation', conversationId)
    sock.emit('read_messages', conversationId)
    useConversationStore.getState().markConversationRead(conversationId)
  }, [conversationId, accessToken])

  // ── Scroll button visibility (IntersectionObserver on bottom sentinel) ─────

  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollBtn(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({
      behavior: isFirstScroll.current ? 'instant' : 'smooth',
    })
    isFirstScroll.current = false
  }, [messages])

  // ── Send message ───────────────────────────────────────────────────────────

  function handleSend() {
    const content = input.trim()
    if (!content || sending) return

    const sock = getSocket()
    if (!sock?.connected) return

    const tempId = `temp-${Date.now()}`
    const optimistic: LocalMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId ?? '',
      content,
      type: 'text',
      is_deleted: false,
      sent_at: new Date().toISOString(),
      read_at: null,
      _status: 'pending',
    }

    setMessages((prev) => [...prev, optimistic])
    setInput('')
    setSending(true)
    sock.emit('send_message', { conversationId, content, type: 'text' })
    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      return
    }
    const now = Date.now()
    if (now - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = now
      getSocket()?.emit('typing', conversationId)
    }
  }

  // ── Delete message ─────────────────────────────────────────────────────────

  function openDeleteSheet(msgId: string) {
    // Only own, confirmed, non-deleted messages
    const msg = messages.find((m) => m.id === msgId)
    if (!msg || msg.is_deleted || msg._status) return
    setDeleteTargetId(msgId)
  }

  async function confirmDelete() {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await fetchApi<unknown>(`/chat/messages/${deleteTargetId}`, { method: 'DELETE' })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === deleteTargetId ? { ...m, is_deleted: true, content: '' } : m
        )
      )
    } catch {
      // leave message as-is; error is silent since the sheet closes either way
    } finally {
      setDeleting(false)
      setDeleteTargetId(null)
    }
  }

  // ── Delete chat ────────────────────────────────────────────────────────────

  async function handleDeleteChat() {
    setDeletingChat(true)
    try {
      await fetchApi<unknown>(`/chat/conversations/${conversationId}`, { method: 'DELETE' })
      router.replace('/chat')
    } catch {
      setDeletingChat(false)
      setDeleteChatOpen(false)
    }
  }

  // ── Block user ─────────────────────────────────────────────────────────────

  async function handleBlock() {
    if (!partnerUserId || blocking) return
    setBlocking(true)
    try {
      await fetchApi<unknown>(`/profile/me/block/${partnerUserId}`, { method: 'POST' })
      setBlockOpen(false)
      const conv = await fetchApi<{ user_a_id: string; user_b_id: string; is_blocked: boolean; blocked_by: 'me' | 'them' | null }>(
        `/chat/conversations/${conversationId}`
      )
      setIsBlocked(conv.is_blocked)
      setBlockedBy(conv.blocked_by)
    } catch {
      // silent — sheet stays open
    } finally {
      setBlocking(false)
    }
  }

  // ── Beef ───────────────────────────────────────────────────────────────────

  function closeBeef() {
    setBeefOpen(false)
    setBeefTldr('')
    setRangeStart(null)
    setRangeEnd(null)
    setBeefStep('tldr')
    setBeefGame('rps')
    setBeefError(null)
    setBeefDuration(86400)
  }

  async function handleBeefSubmit() {
    if (!beefTldr.trim() || rangeStart === null || !partnerId) return
    setBeefSubmitting(true)
    setBeefError(null)
    try {
      const exileStatus = await fetchApi<{ in_exile: boolean; exile_until: string | null }>(
        '/hidden/beef/exile/status'
      ).catch(() => null)

      if (exileStatus?.in_exile) {
        const until = exileStatus.exile_until
          ? new Date(exileStatus.exile_until).toLocaleString('de-AT',
              { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
          : ''
        const leave = window.confirm(
          t.beef.exileWarning.replace('{until}', until)
        )
        if (!leave) { setBeefSubmitting(false); return }
        await fetchApi('/hidden/beef/exile/leave', { method: 'POST' }).catch(() => {})
      }

      const filteredMsgs = messages.filter(m => !m.is_deleted && m.content)
      const lo = Math.min(rangeStart, rangeEnd ?? rangeStart)
      const hi = Math.max(rangeStart, rangeEnd ?? rangeStart)
      const selected = filteredMsgs.slice(lo, hi + 1)
      const chat_passage = selected
        .map(m => `[${m.sender_id === currentUserId ? (ownNickname ?? 'Du') : partnerNickname ?? 'Partner'}]: ${m.content}`)
        .join('\n')
      await fetchApi('/hidden/beef', {
        method: 'POST',
        body: JSON.stringify({
          target_id: partnerId,
          tldr: beefTldr.trim(),
          chat_passage,
          duration_seconds: beefDuration,
          game_type: beefGame,
        }),
      })
      closeBeef()
    } catch {
      setBeefError(t.beef.createError)
    } finally {
      setBeefSubmitting(false)
    }
  }

  // ── Partner ID ─────────────────────────────────────────────────────────────

  const partnerId =
    messages.find((m) => m.sender_id !== currentUserId)?.sender_id ?? null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">

      {/* Conversation header — sticky below TopNav on mobile, at top on desktop (TopNav is md:hidden) */}
      <div className="sticky top-16 md:top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-outline-variant px-4 py-3 flex items-center gap-3">
        <Link
          href="/chat"
          className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-surface-container transition-colors flex-shrink-0"
          aria-label={t.chat.backToList}
        >
          <ChevronLeft className="h-5 w-5 text-on-surface" aria-hidden="true" />
        </Link>

        {partnerPhotoUrl ? (
          <img
            src={partnerPhotoUrl.replace('http://localhost:3000', '')}
            alt=""
            loading="lazy"
            className="flex-shrink-0 h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex-shrink-0 h-9 w-9 rounded-full bg-surface-container-high flex items-center justify-center"
            aria-hidden="true"
          >
            {partnerNickname ? (
              <span className="text-sm font-semibold text-on-surface-variant select-none">
                {partnerNickname.charAt(0).toUpperCase()}
              </span>
            ) : (
              <User className="h-5 w-5 text-outline" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-on-surface text-sm truncate">
            {isBlocked ? 'XXXX' : partnerNickname ?? (partnerId ? shortId(partnerId) : t.chat.conversation)}
          </p>
          <OnlineIndicator
            is_online={partnerIsOnline}
            status_message={partnerStatusMessage}
            size="sm"
          />
        </div>

        {/* Beef button — hidden-zone only */}
        {isHidden && (
          <button
            onClick={() => setBeefOpen(true)}
            className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            aria-label={t.beef.createTab}
          >
            <Swords size={20} aria-hidden />
          </button>
        )}

        {/* Three-dot menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-surface-container transition-colors"
            aria-label={t.chat.moreOptions}
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <MoreVertical className="h-5 w-5 text-on-surface" aria-hidden="true" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                className="absolute right-0 top-10 z-20 min-w-[180px] rounded-xl bg-surface-container border border-outline-variant shadow-lg overflow-hidden"
                role="menu"
              >
                <button
                  onClick={() => { setMenuOpen(false); setDeleteChatOpen(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface hover:bg-surface-container-high transition-colors text-left min-h-[44px]"
                  role="menuitem"
                >
                  <Trash2 className="h-4 w-4 text-error flex-shrink-0" aria-hidden="true" />
                  {t.chat.deleteChat}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface hover:bg-surface-container-high transition-colors text-left min-h-[44px]"
                  role="menuitem"
                >
                  <Flag className="h-4 w-4 text-on-surface-variant flex-shrink-0" aria-hidden="true" />
                  {t.chat.reportUser}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setBlockOpen(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface hover:bg-surface-container-high transition-colors text-left min-h-[44px]"
                  role="menuitem"
                >
                  <Ban className="h-4 w-4 text-error flex-shrink-0" aria-hidden="true" />
                  {t.chat.blockUser}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        className="px-4 py-4 space-y-3 pb-32 md:pb-24"
        role="log"
        aria-live="polite"
        aria-label={t.chat.title}
      >
        {(loading || currentUserId === undefined) ? (
          <div className="flex justify-center py-12" aria-busy="true">
            <Loader2 className="h-6 w-6 text-on-surface-variant animate-spin" aria-label={t.chat.loadingMessages} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3" role="alert">
            <AlertCircle className="h-10 w-10 text-error" aria-hidden="true" />
            <p className="text-on-surface font-semibold">{t.chat.loadError}</p>
            <p className="text-on-surface-variant text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity"
            >
              {t.common.retry}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-on-surface-variant text-sm py-12">
            {t.chat.startConversation}
          </p>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.sender_id === currentUserId}
              profanityFilter={profanityFilter}
              onLongPress={openDeleteSheet}
              onContextMenu={(_, id) => openDeleteSheet(id)}
              avatarUrl={partnerPhotoUrl}
              avatarInitial={(partnerNickname ?? '').charAt(0).toUpperCase() || undefined}
            />
          ))
        )}
        {partnerTyping && (
          <div className="flex items-end gap-2 justify-start" aria-label={t.chat.typingAriaLabel}>
            {partnerPhotoUrl ? (
              <img
                src={partnerPhotoUrl.replace('http://localhost:3000', '')}
                alt=""
                loading="lazy"
                className="flex-shrink-0 h-7 w-7 rounded-full object-cover mb-0.5"
              />
            ) : (
              <div
                className="flex-shrink-0 h-7 w-7 rounded-full bg-surface-container-high flex items-center justify-center mb-0.5"
                aria-hidden="true"
              >
                {partnerNickname ? (
                  <span className="text-[10px] font-semibold text-on-surface-variant select-none">
                    {partnerNickname.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="h-3.5 w-3.5 text-outline" />
                )}
              </div>
            )}
            <div className="rounded-2xl rounded-bl-sm bg-primary-fixed-dim px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-background animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-background animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-background animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div className="h-6" aria-hidden="true" />
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed bottom-36 md:bottom-20 right-4 z-10 h-10 w-10 rounded-full bg-surface-container-high border border-outline-variant shadow-md flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors"
          aria-label={t.chat.scrollDownAriaLabel}
        >
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* Fixed input bar — above BottomNav on mobile */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-t border-outline-variant px-3 py-2.5">
        {isBlocked && (
          <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 rounded-xl bg-error-container text-error px-4 py-2.5 text-sm" role="alert">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {blockedBy === 'them' ? t.chat.blockedBy : t.chat.blocked}
          </div>
        )}
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.chat.inputPlaceholder}
            className={`flex-1 rounded-full border px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none min-h-[44px] transition-colors ${
              isBlocked
                ? 'bg-surface-container-high border-outline-variant opacity-50 cursor-not-allowed'
                : 'bg-surface-container border-outline-variant focus:border-primary-fixed-dim'
            }`}
            aria-label={t.chat.inputAriaLabel}
            disabled={loading || !!error || isBlocked}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || loading || !!error || isBlocked}
            className="flex-shrink-0 h-11 w-11 rounded-full bg-primary-fixed-dim text-on-primary-container flex items-center justify-center hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            aria-label={t.chat.sendAriaLabel}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Delete chat confirmation modal */}
      {deleteChatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.chat.deleteChatTitle}
        >
          <div className="bg-surface-container-high rounded-2xl p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error-container">
                <Trash2 className="h-5 w-5 text-error" aria-hidden="true" />
              </div>
              <p className="font-semibold text-on-surface">{t.chat.deleteChatTitle}</p>
              <p className="text-sm text-on-surface-variant">
                {t.chat.deleteChatDesc}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                onClick={handleDeleteChat}
                disabled={deletingChat}
                className="flex-1 py-3 rounded-full bg-error-container text-error font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
              >
                {deletingChat ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t.common.deleting}
                  </span>
                ) : (
                  t.chat.deleteChatConfirm
                )}
              </button>
              <button
                onClick={() => setDeleteChatOpen(false)}
                disabled={deletingChat}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 disabled:opacity-50 transition-all"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportOpen && (
        <ReportModal
          reportedUserId={partnerUserId ?? undefined}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Block user confirmation modal */}
      {blockOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.chat.blockTitle}
        >
          <div className="bg-surface-container-high rounded-2xl p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error-container">
                <Ban className="h-5 w-5 text-error" aria-hidden="true" />
              </div>
              <p className="font-semibold text-on-surface">{t.chat.blockTitle}</p>
              <p className="text-sm text-on-surface-variant">
                {t.chat.blockDesc}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                onClick={handleBlock}
                disabled={blocking}
                className="flex-1 py-3 rounded-full bg-error-container text-error font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {blocking && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t.chat.blockConfirm}
              </button>
              <button
                onClick={() => setBlockOpen(false)}
                disabled={blocking}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 disabled:opacity-50 transition-all"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Beef modal */}
      {beefOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeBeef() }}
        >
          <div className="w-full max-w-lg bg-surface-container rounded-t-2xl pt-6 px-6 pb-10 flex flex-col gap-4 max-h-[80vh]">

            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
              <span className="font-bold text-on-surface flex items-center gap-2">
                <Swords size={18}/> {t.beef.createTab}
              </span>
              <button onClick={closeBeef} className="text-on-surface-variant text-sm hover:text-on-surface">
                {t.common.cancel}
              </button>
            </div>

            {/* Step 1: TLDR */}
            {beefStep === 'tldr' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-on-surface-variant">
                  {t.beef.tldrLabel}
                </p>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={50}
                    value={beefTldr}
                    onChange={(e) => setBeefTldr(e.target.value)}
                    placeholder={t.beef.tldrPlaceholder}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface text-sm outline-none focus:border-primary-fixed-dim"
                    autoFocus
                  />
                  <span className="absolute right-3 top-3 text-xs text-on-surface-variant">
                    {beefTldr.length}/50
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-on-surface-variant">
                    {t.beef.durationLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setBeefDuration(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          beefDuration === opt.value
                            ? 'border-primary-fixed-dim bg-primary-fixed-dim/20 text-on-surface'
                            : 'border-outline-variant text-on-surface-variant hover:border-outline'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setBeefStep('passage')}
                  disabled={beefTldr.trim().length === 0}
                  className="w-full py-3 rounded-lg bg-primary-fixed-dim text-on-primary-container font-semibold text-sm disabled:opacity-40 transition-opacity"
                >
                  {t.beef.nextPassage}
                </button>
              </div>
            )}

            {/* Step 2: Passage picker */}
            {beefStep === 'passage' && (() => {
              const filteredMsgs = messages.filter(m => !m.is_deleted && m.content)
              const lo = rangeStart !== null ? Math.min(rangeStart, rangeEnd ?? rangeStart) : -1
              const hi = rangeStart !== null ? Math.max(rangeStart, rangeEnd ?? rangeStart) : -1
              const selectedCount = rangeStart !== null ? hi - lo + 1 : 0

              function handleMsgTap(idx: number) {
                if (rangeStart === null) {
                  setRangeStart(idx)
                  setRangeEnd(null)
                } else if (rangeEnd === null && idx !== rangeStart) {
                  setRangeEnd(idx)
                } else {
                  setRangeStart(null)
                  setRangeEnd(null)
                }
              }

              return (
                <div className="flex flex-col gap-3 min-h-0">

                  {/* Header row */}
                  <div className="flex items-center justify-between flex-shrink-0">
                    <button onClick={() => setBeefStep('tldr')}
                      className="text-xs text-on-surface-variant hover:text-on-surface">
                      {t.common.back}
                    </button>
                    <span className="text-xs text-on-surface-variant">
                      {rangeStart === null
                        ? t.beef.tapFirstMsg
                        : rangeEnd === null
                        ? t.beef.tapLastMsg
                        : t.beef.selectedCount.replace('{count}', String(selectedCount))}
                    </span>
                  </div>

                  {/* Message list */}
                  <div className="overflow-y-auto flex flex-col gap-1 flex-1 min-h-0 max-h-[45vh] px-1">
                    {filteredMsgs.map((m, idx) => {
                      const isOwn = m.sender_id === currentUserId
                      const inRange = idx >= lo && idx <= hi
                      const isStart = idx === lo && rangeStart !== null
                      const isEndEdge = idx === hi && rangeEnd !== null

                      return (
                        <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <button
                            onClick={() => handleMsgTap(idx)}
                            className={`
                              max-w-[75%] text-left px-3 py-2 text-sm transition-all border
                              ${isOwn ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm'}
                              ${inRange
                                ? 'bg-primary-fixed-dim/20 border-primary-fixed-dim'
                                : 'bg-surface-container-low border-transparent hover:border-outline-variant'
                              }
                            `}
                          >
                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                              <span className={`text-[10px] font-semibold ${
                                isOwn ? 'text-primary-fixed-dim' : 'text-on-surface-variant'
                              }`}>
                                {isOwn ? (ownNickname ?? 'Du') : (partnerNickname ?? 'Partner')}
                              </span>
                              {isStart && (
                                <span className="text-[9px] text-primary-fixed-dim font-bold">START</span>
                              )}
                              {isEndEdge && rangeEnd !== null && (
                                <span className="text-[9px] text-primary-fixed-dim font-bold">END</span>
                              )}
                            </div>
                            <span className={`leading-snug ${
                              inRange ? 'text-on-surface' : 'text-on-surface-variant'
                            }`}>
                              {m.content}
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => setBeefStep('game')}
                    disabled={rangeStart === null}
                    className="w-full py-3 rounded-lg bg-primary-fixed-dim text-on-primary-container font-semibold text-sm disabled:opacity-40 transition-opacity flex-shrink-0"
                  >
                    {selectedCount > 0
                      ? `${t.beef.nextGame} (${selectedCount} Msg)`
                      : t.beef.nextGame}
                  </button>

                </div>
              )
            })()}

            {/* Step 3: Game picker */}
            {beefStep === 'game' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between flex-shrink-0">
                  <button onClick={() => setBeefStep('passage')}
                    className="text-xs text-on-surface-variant hover:text-on-surface">
                    {t.common.back}
                  </button>
                  <span className="text-xs text-on-surface-variant">{t.beef.selectGame}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {GAME_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setBeefGame(g.value)}
                      className={`flex flex-col gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                        beefGame === g.value
                          ? 'border-primary-fixed-dim bg-primary-fixed-dim/20'
                          : 'border-outline-variant bg-surface-container-low hover:border-outline'
                      }`}
                    >
                      <span className="text-xl">{g.emoji}</span>
                      <span className="font-bold text-on-surface text-xs">{g.label}</span>
                      <span className="text-[10px] text-on-surface-variant leading-snug">{g.desc}</span>
                    </button>
                  ))}
                </div>

                {beefError && (
                  <p className="text-error text-xs text-center">{beefError}</p>
                )}

                <button
                  onClick={handleBeefSubmit}
                  disabled={beefSubmitting}
                  className="w-full py-3 rounded-lg bg-primary-fixed-dim text-on-primary-container font-semibold text-sm disabled:opacity-40 transition-opacity"
                >
                  {beefSubmitting ? t.common.loading : t.beef.fight}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Delete message confirmation modal */}
      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.chat.deleteMessageTitle}
        >
          <div className="bg-surface-container-high rounded-2xl p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error-container">
                <Trash2 className="h-5 w-5 text-error" aria-hidden="true" />
              </div>
              <p className="font-semibold text-on-surface">{t.chat.deleteMessageTitle}</p>
              <p className="text-sm text-on-surface-variant">
                {t.chat.deleteMessageDesc}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-full bg-error-container text-error font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
              >
                {deleting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t.common.deleting}
                  </span>
                ) : (
                  t.chat.deleteMessageConfirm
                )}
              </button>
              <button
                onClick={() => setDeleteTargetId(null)}
                disabled={deleting}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 disabled:opacity-50 transition-all"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
