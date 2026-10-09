'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { kindLabel, rangeLabel } from '@/components/board/BoardNote'
import { BOARD_KINDS, BOARD_VISIBILITIES, type BoardKind, type BoardPost, type BoardVisibility } from '@/lib/board'

const FIELD = 'w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-fixed-dim'

export default function NewBoardPostPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [kind, setKind] = useState<BoardKind>('search')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [street, setStreet] = useState('')
  const [visibility, setVisibility] = useState<BoardVisibility>('r500')
  const [hasConsent, setHasConsent] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApi<{ public: boolean }>('/board/consent').then((r) => setHasConsent(r.public)).catch(() => {})
  }, [])

  const needsConsent = visibility === 'public' && !hasConsent
  const valid = title.trim().length >= 3 && body.trim().length > 0 && (!needsConsent || consent)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError('')
    try {
      const post = await fetchApi<BoardPost>('/board', {
        method: 'POST',
        body: JSON.stringify({
          kind, title: title.trim(), body: body.trim(), street: street.trim() || undefined, visibility,
          ...(needsConsent ? { publicConsent: true } : {}),
        }),
      })
      router.push(`/board/${post.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden /> {t.board.back}
      </Link>
      <h1 className="text-3xl text-on-surface">{t.board.formTitle}</h1>

      <form onSubmit={submit} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-on-surface mb-2">{t.board.formKind}</legend>
          <div className="flex flex-wrap gap-2">
            {BOARD_KINDS.map((k) => (
              <button
                type="button"
                key={k}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${
                  kind === k ? 'bg-on-surface text-background border-on-surface' : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {kindLabel(t.board, k)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="board-title" className="block text-sm font-semibold text-on-surface">{t.board.formTitleLabel}</label>
          <input id="board-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t.board.formTitlePlaceholder} className={FIELD} />
        </div>
        <div className="space-y-2">
          <label htmlFor="board-body" className="block text-sm font-semibold text-on-surface">{t.board.formBody}</label>
          <textarea id="board-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={4} placeholder={t.board.formBodyPlaceholder} className={FIELD} />
        </div>
        <div className="space-y-2">
          <label htmlFor="board-street" className="block text-sm font-semibold text-on-surface">{t.board.formStreet}</label>
          <input id="board-street" value={street} onChange={(e) => setStreet(e.target.value)} maxLength={80} className={FIELD} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-on-surface mb-2">{t.board.formVisibility}</legend>
          <div role="radiogroup" className="flex rounded-lg bg-surface-container-high p-1 gap-1">
            {BOARD_VISIBILITIES.map((v) => (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={visibility === v}
                onClick={() => setVisibility(v)}
                className={`flex-1 rounded-md px-2 py-2 text-xs font-bold uppercase tracking-wide ${
                  visibility === v ? 'bg-on-surface text-background' : 'text-on-surface-variant'
                }`}
              >
                {rangeLabel(t.board, v)}
              </button>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">{t.board.formVisibilityHint}</p>
        </fieldset>

        {needsConsent && (
          <div className="rounded-lg border-2 border-primary-fixed-dim p-4 space-y-3">
            <p className="text-sm font-bold text-on-surface">{t.board.consentTitle}</p>
            <p className="text-sm text-on-surface-variant">{t.board.consentText}</p>
            <p className="text-sm">
              <Link href="/agb#board" target="_blank" className="underline text-primary-fixed-dim">AGB</Link>
              {' · '}
              <Link href="/datenschutz#board" target="_blank" className="underline text-primary-fixed-dim">{t.footer.datenschutz}</Link>
            </p>
            <label className="flex items-center gap-3 text-sm font-semibold text-on-surface">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 accent-[var(--color-primary-fixed-dim)]" />
              {t.board.consentCheck}
            </label>
          </div>
        )}

        {error && <p className="text-sm text-error" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!valid || busy}
          className="w-full rounded-lg bg-primary-fixed-dim px-4 py-3 text-sm font-bold uppercase tracking-wide text-on-primary-container disabled:opacity-40"
        >
          {t.board.submit}
        </button>
        <p className="text-center text-xs text-on-surface-variant">{t.board.expiresAfter}</p>
      </form>
    </div>
  )
}
