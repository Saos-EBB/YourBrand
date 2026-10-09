'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Scissors, Trash2, CheckCircle } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { BoardNote } from '@/components/board/BoardNote'
import type { BoardPost } from '@/lib/board'

export default function BoardPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useTranslation()
  const router = useRouter()
  const [post, setPost] = useState<BoardPost | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApi<BoardPost>(`/board/${id}`).then(setPost).catch((e: Error) => setError(e.message))
  }, [id])

  async function tear() {
    if (!post) return
    setBusy(true)
    setError('')
    try {
      await fetchApi(`/board/${post.id}/tear`, { method: 'POST', body: JSON.stringify({ message: message.trim() || undefined }) })
      setPost({ ...post, torn_by_me: true, tears: post.tears + 1 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!post) return
    setBusy(true)
    try {
      await fetchApi(`/board/${post.id}`, { method: 'DELETE' })
      router.push('/board')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.board.back}
      </Link>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      {!post && !error && <div className="h-64 rounded-sm bg-surface-container animate-pulse" aria-hidden="true" />}

      {post && (
        <>
          <div className="rounded-xl bg-surface-container-high p-6"><BoardNote post={post} /></div>

          <p className="text-sm text-on-surface-variant">
            {post.tears === 0 ? t.board.tearsNone : t.board.tears.replace('{n}', String(post.tears))}
          </p>

          {post.mine ? (
            confirmRemove ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-on-surface">{t.board.removeConfirm}</span>
                <button onClick={remove} disabled={busy} className="rounded-lg bg-error px-4 py-2 text-sm font-bold text-background disabled:opacity-50">
                  {t.board.remove}
                </button>
                <button onClick={() => setConfirmRemove(false)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm">
                  {t.care.cancel}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmRemove(true)} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container">
                <Trash2 size={16} aria-hidden /> {t.board.remove}
              </button>
            )
          ) : post.torn_by_me ? (
            <div role="status" className="flex gap-3 rounded-lg bg-surface-container p-4 text-sm text-on-surface">
              <CheckCircle className="shrink-0 text-primary-fixed-dim" size={20} aria-hidden />
              <span><b>{t.board.torn}.</b> {t.board.tornHint.replaceAll('{nickname}', post.author.nickname)}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <label htmlFor="tear-message" className="block text-sm font-semibold text-on-surface">{t.board.messageLabel}</label>
              <textarea
                id="tear-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder={t.board.messagePlaceholder}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-fixed-dim"
              />
              <button
                onClick={tear}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-fixed-dim px-4 py-3 text-sm font-bold text-on-primary-container hover:opacity-90 disabled:opacity-50"
              >
                <Scissors size={18} aria-hidden /> {t.board.tear}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
