'use client'

import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { downloadApiFile, fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { formatDate, formatPrice, type ShopInvoice } from '@/lib/shop'

// Rechnung + Stornorechnungen zum Herunterladen. Der Worker legt sie kurz nach
// der Annahme an — solange noch nichts da ist, ein Hinweis statt leerer Liste.
export function OrderInvoices({ orderId }: { orderId: string }) {
  const { t, locale } = useTranslation()
  const [invoices, setInvoices] = useState<ShopInvoice[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchApi<ShopInvoice[]>(`/shop/orders/${orderId}/invoices`)
      .then((i) => { if (!cancelled) setInvoices(i) })
      .catch(() => { if (!cancelled) setInvoices([]) })
    return () => { cancelled = true }
  }, [orderId])

  async function download(inv: ShopInvoice) {
    setBusy(inv.id)
    setError('')
    try {
      await downloadApiFile(`/shop/invoices/${inv.id}/pdf`, `${inv.invoice_number}.pdf`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!invoices) return null
  return (
    <section className="space-y-3 rounded-2xl bg-surface-container p-5">
      <h2 className="font-semibold text-on-surface">{t.shop.invoicesTitle}</h2>
      {invoices.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t.shop.invoiceComing}</p>
      ) : (
        <ul role="list" className="divide-y divide-outline-variant/50">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <FileText size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-on-surface">
                  {inv.kind === 'invoice' ? t.shop.invoiceLabel : t.shop.creditNoteLabel} <span className="whitespace-nowrap">{inv.invoice_number}</span>
                </span>
                <span className="text-xs text-on-surface-variant">{formatDate(inv.issued_at, locale)} · {formatPrice(inv.amount_cents, locale)}</span>
              </span>
              <button onClick={() => download(inv)} disabled={busy === inv.id}
                aria-label={`${inv.invoice_number} ${t.shop.downloadPdf}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-outline-variant px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50">
                <Download size={16} aria-hidden /> {busy === inv.id ? '…' : t.shop.downloadPdf}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </section>
  )
}
