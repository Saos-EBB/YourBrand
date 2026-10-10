'use client'

import { useState } from 'react'
import { CheckCircle2, Download, FileUp } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Sheet, adminField, primaryBtn, secondaryBtn } from './Sheet'

interface ImportResult {
  created: number
  updated: number
  errors: { line: number; message: string }[]
  written: boolean
}

// Express nimmt JSON nur bis 100 KB an — Backend begrenzt auf 95 000 Zeichen
const MAX_BYTES = 90_000

const TEMPLATE = [
  'sku;title;description;category;fulfillment;price;vat_rate;stock;unlock_target;image_url;active',
  'PIZZA-001;Pizza Margherita;Tomate, Mozzarella, Basilikum;pizza;food;9,90;7;;;;ja',
  'MERCH-001;Kiez-Hoodie schwarz;Bio-Baumwolle, Unisex;merch;physical;39,90;19;25;;;ja',
  'APP-001;Premium 30 Tage;Alle Premium-Funktionen für 30 Tage;in-app;unlock;4,99;19;;premium:30;;ja',
  'SOFT-001;Foto-Plugin Lizenz;Lizenz-Key für ein Gerät;software;license;19,90;19;;;;ja',
].join('\r\n')

function downloadTemplate() {
  // BOM, damit Excel die Umlaute richtig liest
  const url = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'shop-artikel-vorlage.csv' })
  a.click()
  URL.revokeObjectURL(url)
}

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [checked, setChecked] = useState<ImportResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState<'check' | 'import' | null>(null)
  const [error, setError] = useState('')

  const bytes = new TextEncoder().encode(JSON.stringify(csv)).length
  const tooBig = bytes > MAX_BYTES

  function change(text: string, name = '') {
    setCsv(text)
    setFileName(name)
    setChecked(null)
    setDone(null)
    setError('')
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    change(await file.text(), file.name)
  }

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    try {
      const res = await fetchApi<ImportResult>('/admin/shop/products/import', { method: 'POST', body: JSON.stringify({ csv, dryRun }) })
      if (dryRun) setChecked(res)
      else { setDone(res); onImported() }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const ready = checked && checked.errors.length === 0 && checked.created + checked.updated > 0

  return (
    <Sheet
      title="Artikel importieren"
      wide
      onClose={onClose}
      footer={done ? (
        <button onClick={onClose} className={`${primaryBtn} w-full`}>Fertig</button>
      ) : (
        <div className="space-y-3">
          {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => run(true)} disabled={!csv.trim() || tooBig || busy !== null} className={`${secondaryBtn} flex-1`}>
              {busy === 'check' ? 'Prüft …' : '1. Prüfen'}
            </button>
            <button onClick={() => run(false)} disabled={!ready || busy !== null} className={`${primaryBtn} flex-1`}>
              {busy === 'import' ? 'Importiert …' : '2. Importieren'}
            </button>
          </div>
        </div>
      )}
    >
      {done ? (
        <div className="space-y-3 py-10 text-center">
          <CheckCircle2 size={48} className="mx-auto text-primary-fixed-dim" aria-hidden />
          <p className="text-lg font-semibold text-on-surface">Import fertig</p>
          <p className="text-sm text-on-surface-variant">{done.created} neu angelegt, {done.updated} aktualisiert.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2 text-sm text-on-surface-variant">
            <p>
              Eine Zeile pro Artikel, Trenner <code className="text-on-surface">;</code> oder <code className="text-on-surface">,</code>.
              Gleiche SKU = vorhandenen Artikel aktualisieren (nur die Spalten aus der Datei). Gespeichert wird nur,
              wenn alle Zeilen stimmen.
            </p>
            <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 font-semibold text-primary-fixed-dim hover:underline">
              <Download size={15} aria-hidden /> Vorlage herunterladen
            </button>
          </div>

          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant px-4 py-6 text-center hover:border-outline"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
          >
            <FileUp size={28} className="text-on-surface-variant" aria-hidden />
            <span className="text-sm font-semibold text-on-surface">{fileName || 'CSV-Datei wählen oder hierher ziehen'}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>

          <label className="block space-y-1.5 text-sm font-semibold text-on-surface">
            <span>… oder einfügen</span>
            <textarea value={csv} onChange={(e) => change(e.target.value)} rows={8} spellCheck={false}
              placeholder={TEMPLATE.split('\r\n').slice(0, 2).join('\n')} className={`${adminField} font-mono text-xs`} />
          </label>
          {tooBig && <p className="text-sm text-error" role="alert">Datei zu groß ({Math.round(bytes / 1000)} KB) — bitte in Teile unter 90 KB aufteilen.</p>}

          {checked && (
            checked.errors.length === 0 ? (
              <p className="rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface" role="status">
                Alles in Ordnung: <b>{checked.created}</b> neu, <b>{checked.updated}</b> werden aktualisiert.
              </p>
            ) : (
              <div className="space-y-2" role="alert">
                <p className="text-sm font-semibold text-error">{checked.errors.length} {checked.errors.length === 1 ? 'Zeile hat' : 'Zeilen haben'} Fehler — nichts gespeichert:</p>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-outline-variant">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-surface-container text-xs text-on-surface-variant">
                      <tr><th className="px-3 py-2 font-semibold">Zeile</th><th className="px-3 py-2 font-semibold">Problem</th></tr>
                    </thead>
                    <tbody>
                      {checked.errors.map((e, i) => (
                        <tr key={i} className="border-t border-outline-variant/60">
                          <td className="px-3 py-2 align-top font-mono text-on-surface">{e.line}</td>
                          <td className="px-3 py-2 text-on-surface-variant">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </Sheet>
  )
}
