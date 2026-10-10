'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Sheet, adminField, primaryBtn, secondaryBtn } from './Sheet'
import type { AdminShopProduct } from '@/lib/shop'

// ~2000 Keys bleiben unter dem 100-KB-Limit fuer JSON (main.ts)
const MAX_CODES = 2000

// Keys fuer einen Lizenz-Artikel: einer pro Zeile. Das Backend speichert sie
// verschluesselt und ueberspringt Keys, die es schon gibt.
export function CodesDialog({ product, onClose, onAdded }: {
  product: AdminShopProduct
  onClose: () => void
  onAdded: (free: number) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ added: number; duplicates: number; free: number } | null>(null)

  const codes = text.split(/\r?\n/).map((c) => c.trim()).filter(Boolean)
  const short = codes.filter((c) => c.length < 4 || c.length > 200)

  async function add() {
    setBusy(true)
    setError('')
    try {
      const res = await fetchApi<{ added: number; duplicates: number; free: number }>(`/admin/shop/products/${product.id}/codes`, {
        method: 'POST',
        body: JSON.stringify({ codes }),
      })
      setResult(res)
      setText('')
      onAdded(res.free)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Keys hinzufügen"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className={`${secondaryBtn} flex-1`}>{result ? 'Fertig' : 'Abbrechen'}</button>
            <button onClick={add} disabled={busy || codes.length === 0 || codes.length > MAX_CODES || short.length > 0} className={`${primaryBtn} flex-1`}>
              {busy ? 'Speichert …' : codes.length ? `${codes.length} ${codes.length === 1 ? 'Key' : 'Keys'} hinzufügen` : 'Hinzufügen'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-surface-container p-3">
          <KeyRound size={20} className="shrink-0 text-primary-fixed-dim" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold text-on-surface">{product.title}</p>
            <p className="text-xs text-on-surface-variant">
              <span className="font-mono">{product.sku}</span> · gerade frei: <b className="text-on-surface">{result?.free ?? product.free_codes ?? 0}</b>
            </p>
          </div>
        </div>

        {result && (
          <p className="rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface" role="status">
            <b>{result.added}</b> neu gespeichert{result.duplicates > 0 && <>, <b>{result.duplicates}</b> übersprungen (gab es schon oder doppelt)</>}.
          </p>
        )}

        <label className="block space-y-1.5 text-sm font-semibold text-on-surface">
          <span>Ein Key pro Zeile</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null) }} rows={12} spellCheck={false}
            placeholder={'ABCD-1234-EFGH-5678\nIJKL-9012-MNOP-3456'} className={`${adminField} font-mono text-xs`} />
        </label>
        {short.length > 0 && <p className="text-sm text-error" role="alert">{short.length} {short.length === 1 ? 'Zeile ist' : 'Zeilen sind'} kürzer als 4 oder länger als 200 Zeichen.</p>}
        {codes.length > MAX_CODES && <p className="text-sm text-error" role="alert">Höchstens {MAX_CODES} Keys auf einmal.</p>}
        <p className="text-xs text-on-surface-variant">Keys werden verschlüsselt gespeichert und sind danach hier nicht mehr lesbar.</p>
      </div>
    </Sheet>
  )
}
