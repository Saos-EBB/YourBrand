'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check, CheckCircle2, ChevronLeft, ChevronRight,
  Image as ImageIcon, Music, Pause, Play, X,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { ModalOverlay } from './shared/ModalOverlay'
import { Spinner } from './shared/Spinner'
import { btnPrimary, btnOutline, inputCls, fmtDate } from './shared/utils'
import type { PendingMedia, MediaFilter } from './shared/types'

// ─── SwipeView ────────────────────────────────────────────────────────────────

type SwipeAction = 'approve' | 'reject'

function SwipeView({
  snapshot,
  onApprove,
  onReject,
  onClose,
}: {
  snapshot: PendingMedia[]
  onApprove: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [filter, setFilter] = useState<MediaFilter>('all')
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set())
  const [tilt, setTilt] = useState<'left' | 'right' | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const touchStartX = useRef<number | null>(null)

  const { t } = useTranslation()

  const filteredAll = snapshot.filter((m) => filter === 'all' || m.file_type === filter)
  const filteredPending = filteredAll.filter((m) => !processedIds.has(m.id))
  const current = filteredPending[0] ?? null
  const doneCount = filteredAll.length - filteredPending.length
  const total = filteredAll.length

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
  }, [current?.id])

  function toggleAudio() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  function processItem(id: string, action: SwipeAction) {
    setProcessedIds((prev) => new Set([...prev, id]))
    setTilt(action === 'approve' ? 'right' : 'left')
    setTimeout(() => setTilt(null), 300)
    if (action === 'approve') void onApprove(id)
    else void onReject(id)
  }

  const latestCurrentId   = useRef<string | null>(null)
  const latestCurrentType = useRef<string | null>(null)
  const latestProcessItem = useRef(processItem)
  const latestToggleAudio = useRef(toggleAudio)
  latestCurrentId.current   = current?.id ?? null
  latestCurrentType.current = current?.file_type ?? null
  latestProcessItem.current = processItem
  latestToggleAudio.current = toggleAudio

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const id = latestCurrentId.current
      if (!id) return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); latestProcessItem.current(id, 'reject') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); latestProcessItem.current(id, 'approve') }
      else if (e.key === ' ' && latestCurrentType.current === 'audio') {
        e.preventDefault()
        latestToggleAudio.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (!current || Math.abs(dx) < 80) return
    processItem(current.id, dx > 0 ? 'approve' : 'reject')
  }

  const cardTransform =
    tilt === 'left'  ? 'rotate(-5deg)' :
    tilt === 'right' ? 'rotate(5deg)'  : 'none'

  return (
    <div className="fixed inset-0 z-[9998] bg-background flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant flex-shrink-0">
        <div className="flex gap-1.5">
          {(['all', 'image', 'audio'] as MediaFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-primary-fixed-dim text-on-primary-container'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f === 'image' && <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {f === 'audio' && <Music className="h-3.5 w-3.5" aria-hidden="true" />}
              {f === 'all' ? t.admin.swipeAll : f === 'image' ? t.admin.swipePhotos : t.admin.swipeAudio}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {filteredPending.length > 0 && (
            <span className="text-sm text-on-surface-variant tabular-nums">
              {t.admin.swipeProgress.replace('{current}', String(doneCount + 1)).replace('{total}', String(total))}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
            aria-label={t.admin.swipeModeClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!current ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
          <CheckCircle2 className="h-12 w-12" aria-hidden="true" />
          <p className="text-sm">{t.admin.swipeNoPending}</p>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-full border border-outline-variant text-on-surface text-sm hover:bg-surface-container-high transition-colors"
          >
            {t.admin.swipeClose}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 min-h-0">
          <div className="flex items-center gap-4 w-full max-w-lg">
            <button
              onClick={() => processItem(current.id, 'reject')}
              onMouseEnter={() => setTilt('left')}
              onMouseLeave={() => setTilt(null)}
              className="flex-shrink-0 p-3 rounded-full bg-error-container text-error hover:opacity-90 transition-opacity"
              aria-label={t.admin.swipeReject}
            >
              <ChevronLeft className="h-7 w-7" />
            </button>

            <div
              className="flex-1 rounded-2xl overflow-hidden border border-outline-variant relative select-none"
              style={{ transform: cardTransform, transition: 'transform 0.2s ease' }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {tilt && (
                <div
                  className="absolute inset-0 z-10 pointer-events-none rounded-2xl"
                  style={{ backgroundColor: tilt === 'left' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}
                />
              )}
              {current.file_type === 'audio' ? (
                <div
                  className="w-full aspect-square bg-surface-container-high flex flex-col items-center justify-center gap-4 p-6 cursor-pointer"
                  onClick={toggleAudio}
                >
                  <Music className="h-16 w-16 text-on-surface-variant" aria-hidden="true" />
                  <p className="text-sm text-on-surface-variant text-center break-all line-clamp-2 px-2">
                    {current.file_url.split('/').pop() ?? current.file_url}
                  </p>
                  <div className="p-3 rounded-full bg-primary-fixed-dim text-on-primary-container">
                    {isPlaying
                      ? <Pause className="h-6 w-6" aria-hidden="true" />
                      : <Play className="h-6 w-6" aria-hidden="true" />}
                  </div>
                  <p className="text-xs text-on-surface-variant/60">{t.admin.swipeSpacePlay}</p>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio
                    ref={audioRef}
                    src={current.file_url}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                    preload="metadata"
                  />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.file_url}
                  alt={t.admin.mediaAlt.replace('{nickname}', current.nickname ?? current.uploaded_by)}
                  className="w-full aspect-square object-contain bg-surface-container"
                  draggable={false}
                />
              )}
            </div>

            <button
              onClick={() => processItem(current.id, 'approve')}
              onMouseEnter={() => setTilt('right')}
              onMouseLeave={() => setTilt(null)}
              className="flex-shrink-0 p-3 rounded-full bg-primary-fixed-dim text-on-primary-container hover:opacity-90 transition-opacity"
              aria-label={t.admin.swipeApprove}
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">
              {current.nickname ?? current.uploaded_by.slice(0, 8)}
            </p>
            <p className="text-xs text-on-surface-variant">{fmtDate(current.uploaded_at)}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => processItem(current.id, 'reject')}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-error-container text-error font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <X className="h-4 w-4" />
              {t.admin.swipeReject}
            </button>
            <button
              onClick={() => processItem(current.id, 'approve')}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Check className="h-4 w-4" />
              {t.admin.swipeApprove}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MediaTab ─────────────────────────────────────────────────────────────────

interface Props {
  showToast: (msg: string, ok?: boolean) => void
}

export function MediaTab({ showToast }: Props) {
  const { t } = useTranslation()

  const [media, setMedia] = useState<PendingMedia[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSaving, setRejectSaving] = useState(false)
  const [swipeMode, setSwipeMode] = useState(false)
  const [swipeSnapshot, setSwipeSnapshot] = useState<PendingMedia[]>([])

  async function loadMedia() {
    setMediaLoading(true)
    try {
      const data = await fetchApi<PendingMedia[]>('/admin/media/pending')
      setMedia(data)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.admin.loadError, false)
    } finally {
      setMediaLoading(false)
    }
  }

  async function approveMedia(id: string) {
    try {
      await fetchApi<void>(`/admin/media/${id}/approve`, { method: 'PATCH' })
      setMedia((prev) => prev.filter((m) => m.id !== id))
      showToast(t.admin.toastMediaApproved)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.common.error, false)
    }
  }

  async function submitRejectMedia() {
    if (!rejectModal || !rejectReason.trim()) return
    setRejectSaving(true)
    try {
      await fetchApi<void>(`/admin/media/${rejectModal.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      setMedia((prev) => prev.filter((m) => m.id !== rejectModal.id))
      setRejectModal(null)
      setRejectReason('')
      showToast(t.admin.toastMediaRejected)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.common.error, false)
    } finally {
      setRejectSaving(false)
    }
  }

  async function rejectMediaDirect(id: string) {
    try {
      await fetchApi<void>(`/admin/media/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: 'Abgelehnt' }),
      })
      setMedia((prev) => prev.filter((m) => m.id !== id))
      showToast(t.admin.toastMediaRejected)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.common.error, false)
    }
  }

  useEffect(() => {
    void loadMedia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = media.filter((m) => mediaFilter === 'all' || m.file_type === mediaFilter)

  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          {t.admin.mediaPending}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSwipeSnapshot([...media]); setSwipeMode(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-fixed-dim text-on-primary-container text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {t.admin.mediaSwipeMode}
          </button>
          <button onClick={() => void loadMedia()} className="text-xs text-on-surface-variant hover:text-on-surface underline">
            {t.admin.ticketsRefresh}
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(['all', 'image', 'audio'] as MediaFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setMediaFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mediaFilter === f
                ? 'bg-primary-fixed-dim text-on-primary-container'
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {f === 'image' && <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            {f === 'audio' && <Music className="h-3.5 w-3.5" aria-hidden="true" />}
            {f === 'all' ? t.admin.swipeAll : f === 'image' ? t.admin.mediaImages : t.admin.mediaAudio}
          </button>
        ))}
      </div>

      {mediaLoading ? (
        <div className="flex justify-center py-10"><Spinner size={6} /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-on-surface-variant">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm">{t.admin.mediaNoMedia}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="rounded-xl overflow-hidden border border-outline-variant bg-surface-container-high flex flex-col"
            >
              {m.file_type === 'audio' ? (
                <div className="w-full aspect-square bg-surface-container flex flex-col items-center justify-center gap-2 p-3">
                  <Music className="h-8 w-8 text-on-surface-variant" aria-hidden="true" />
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={m.file_url} className="w-full" />
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={m.file_url}
                  alt={t.admin.mediaAlt.replace('{nickname}', m.nickname ?? m.uploaded_by)}
                  className="w-full aspect-square object-cover"
                />
              )}
              <div className="p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                    {m.file_type === 'audio' ? t.admin.mediaAudio : t.admin.mediaItem}
                  </span>
                  <p className="text-xs font-medium text-on-surface truncate">
                    {m.nickname ?? m.uploaded_by.slice(0, 8)}
                  </p>
                </div>
                <p className="text-xs text-on-surface-variant">{fmtDate(m.uploaded_at)}</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => void approveMedia(m.id)}
                    className="flex-1 py-1.5 rounded-lg bg-primary-fixed-dim text-on-primary-container text-xs font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                    aria-label={t.admin.swipeApprove}
                  >
                    <Check className="h-3 w-3" />
                    OK
                  </button>
                  <button
                    onClick={() => { setRejectModal({ id: m.id }); setRejectReason('') }}
                    className="flex-1 py-1.5 rounded-lg bg-error-container text-error text-xs font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                    aria-label={t.admin.swipeReject}
                  >
                    <X className="h-3 w-3" />
                    {t.common.no}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectModal && (
        <ModalOverlay title={t.admin.rejectModalTitle} onClose={() => setRejectModal(null)}>
          <div className="space-y-3">
            <label className="text-sm text-on-surface-variant" htmlFor="reject-reason">{t.admin.rejectModalReasonLabel}</label>
            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t.admin.rejectModalReasonPlaceholder}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              onClick={() => void submitRejectMedia()}
              disabled={rejectSaving || !rejectReason.trim()}
              className={`${btnPrimary} flex-1 justify-center bg-error-container text-error`}
            >
              {rejectSaving && <Spinner size={4} />}
              {t.admin.swipeReject}
            </button>
            <button onClick={() => setRejectModal(null)} className={`${btnOutline} flex-1 justify-center`}>
              {t.common.cancel}
            </button>
          </div>
        </ModalOverlay>
      )}

      {swipeMode && (
        <SwipeView
          snapshot={swipeSnapshot}
          onApprove={approveMedia}
          onReject={rejectMediaDirect}
          onClose={() => setSwipeMode(false)}
        />
      )}
    </div>
  )
}
