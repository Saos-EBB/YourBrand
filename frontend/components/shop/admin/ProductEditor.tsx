'use client'

import { useState } from 'react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { ProductCard, fulfillmentLabel } from '@/components/shop/ProductCard'
import { Sheet, adminField, adminHint, adminLabel, primaryBtn, secondaryBtn } from './Sheet'
import {
  SHOP_FULFILLMENTS, SHOP_VAT_RATES, centsToEuroInput, defaultVat, euroToCents,
  type AdminShopProduct, type ShopFulfillment,
} from '@/lib/shop'

const SKU_PATTERN = /^[A-Za-z0-9._-]{1,40}$/
const CATEGORY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const UNLOCK_PATTERN = /^[a-z][a-z0-9_]*:[0-9]{1,6}$/

// Anlegen (product = null) oder Bearbeiten. SKU und Art sind nach dem Anlegen fest.
export function ProductEditor({ product, categories, onClose, onSaved }: {
  product: AdminShopProduct | null
  categories: string[]
  onClose: () => void
  onSaved: (p: AdminShopProduct) => void
}) {
  const { t } = useTranslation()
  const isNew = product === null
  const [sku, setSku] = useState(product?.sku ?? '')
  const [fulfillment, setFulfillment] = useState<ShopFulfillment>(product?.fulfillment ?? 'physical')
  const [title, setTitle] = useState(product?.title ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [price, setPrice] = useState(product ? centsToEuroInput(product.price_cents) : '')
  const [vat, setVat] = useState<number>(product?.vat_rate ?? defaultVat('physical'))
  const [vatTouched, setVatTouched] = useState(!isNew)
  const [stock, setStock] = useState(product?.stock == null ? '' : String(product.stock))
  const [unlockTarget, setUnlockTarget] = useState(product?.unlock_target ?? '')
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '')
  const [active, setActive] = useState(product?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const priceCents = euroToCents(price)
  const hasStock = fulfillment === 'food' || fulfillment === 'physical'

  function chooseFulfillment(f: ShopFulfillment) {
    setFulfillment(f)
    // MwSt folgt der Art, bis man sie selbst aendert
    if (!vatTouched) setVat(defaultVat(f))
  }

  function problem(): string | null {
    if (isNew && !SKU_PATTERN.test(sku.trim())) return 'SKU: 1–40 Zeichen, A–Z, 0–9, Punkt, Minus, Unterstrich'
    if (title.trim().length < 2) return 'Titel: mindestens 2 Zeichen'
    if (!CATEGORY_PATTERN.test(category.trim())) return 'Kategorie: nur a–z, 0–9 und Bindestrich, z. B. „merch“ oder „in-app“'
    if (priceCents === null || priceCents < 1) return 'Preis: Zahl wie 12,90'
    if (hasStock && stock.trim() && !/^\d+$/.test(stock.trim())) return 'Bestand: ganze Zahl oder leer für unbegrenzt'
    if (fulfillment === 'unlock' && unlockTarget.trim() && !UNLOCK_PATTERN.test(unlockTarget.trim())) return 'Freischaltung wie premium:30 oder coins:500 — oder leer für externe Codes'
    if (imageUrl.trim() && !imageUrl.trim().startsWith('https://')) return 'Bild-URL muss mit https:// beginnen'
    return null
  }

  async function save() {
    const p = problem()
    if (p) { setError(p); return }
    setBusy(true)
    setError('')
    const body = {
      ...(isNew ? { sku: sku.trim(), fulfillment } : {}),
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      price_cents: priceCents,
      vat_rate: vat,
      ...(hasStock ? { stock: stock.trim() ? Number(stock) : null } : {}),
      ...(fulfillment === 'unlock' ? { unlock_target: unlockTarget.trim() || null } : {}),
      image_url: imageUrl.trim() || null,
      active,
    }
    try {
      const saved = await fetchApi<AdminShopProduct>(isNew ? '/admin/shop/products' : `/admin/shop/products/${product.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
      })
      onSaved(saved)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const preview = {
    id: product?.id ?? 'vorschau',
    sku, title: title.trim() || 'Titel', description, category: category.trim() || 'kategorie', fulfillment,
    price_cents: priceCents ?? 0, vat_rate: vat, image_url: imageUrl.trim().startsWith('https://') ? imageUrl.trim() : null,
    rating_avg: product?.rating_avg ?? 0, rating_count: product?.rating_count ?? 0,
    in_stock: fulfillment === 'license' ? (product?.free_codes ?? 0) > 0 : !(hasStock && stock.trim() === '0'),
  }

  return (
    <Sheet
      title={isNew ? 'Neuer Artikel' : 'Artikel bearbeiten'}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className={`${secondaryBtn} flex-1`}>Abbrechen</button>
            <button onClick={save} disabled={busy} className={`${primaryBtn} flex-1`}>{busy ? 'Speichert …' : isNew ? 'Anlegen' : 'Speichern'}</button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-on-surface">Art</legend>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-container-high p-1">
            {SHOP_FULFILLMENTS.map((f) => (
              <button
                key={f}
                type="button"
                disabled={!isNew}
                aria-pressed={fulfillment === f}
                onClick={() => chooseFulfillment(f)}
                className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors ${fulfillment === f ? 'bg-on-surface text-background' : 'text-on-surface-variant hover:text-on-surface disabled:opacity-40'}`}
              >
                {fulfillmentLabel(t, f)}
              </button>
            ))}
          </div>
          {!isNew && <span className={adminHint}>Art und SKU lassen sich nach dem Anlegen nicht mehr ändern.</span>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={adminLabel}>
            <span>SKU</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={!isNew} maxLength={40} placeholder="MERCH-001" className={`${adminField} font-mono`} />
          </label>
          <label className={adminLabel}>
            <span>Kategorie</span>
            <input value={category} onChange={(e) => setCategory(e.target.value.toLowerCase())} list="shop-categories" maxLength={40} placeholder="merch" className={adminField} />
            <datalist id="shop-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>

        <label className={adminLabel}>
          <span>Titel</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Kiez-Hoodie schwarz" className={adminField} />
        </label>

        <label className={adminLabel}>
          <span>Beschreibung</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} className={adminField} />
        </label>

        <div className="grid gap-4 grid-cols-2">
          <label className={adminLabel}>
            <span>Preis brutto</span>
            <span className="relative block">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="39,90" className={`${adminField} pr-8`} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">€</span>
            </span>
          </label>
          <label className={adminLabel}>
            <span>MwSt</span>
            <select value={vat} onChange={(e) => { setVat(Number(e.target.value)); setVatTouched(true) }} className={adminField}>
              {SHOP_VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
            </select>
          </label>
        </div>

        {hasStock && (
          <label className={adminLabel}>
            <span>Bestand</span>
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" placeholder="leer = unbegrenzt" className={adminField} />
          </label>
        )}
        {fulfillment === 'license' && (
          <p className="rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
            Lizenzen zählen freie Keys statt Bestand. {isNew ? 'Keys fügst du nach dem Anlegen in der Liste hinzu.' : `Gerade frei: ${product?.free_codes ?? 0}.`}
          </p>
        )}
        {fulfillment === 'unlock' && (
          <label className={adminLabel}>
            <span>Freischaltung in der App</span>
            <input value={unlockTarget} onChange={(e) => setUnlockTarget(e.target.value)} maxLength={60} placeholder="premium:30 oder coins:500" className={`${adminField} font-mono`} />
            <span className={adminHint}>Leer lassen für Codes, die außerhalb der App gelten (z. B. Kinoticket).</span>
          </label>
        )}

        <label className={adminLabel}>
          <span>Bild-URL <span className="font-normal text-on-surface-variant">(optional)</span></span>
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={500} placeholder="https://…" className={adminField} />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm font-semibold text-on-surface">Im Shop sichtbar</span>
          <input type="checkbox" role="switch" checked={active} onChange={(e) => setActive(e.target.checked)} className="peer sr-only" />
          <span className="relative h-6 w-11 shrink-0 rounded-full bg-surface-container-highest transition-colors peer-checked:bg-primary-fixed-dim peer-focus-visible:ring-2 peer-focus-visible:ring-primary-fixed-dim after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-on-surface after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-background" aria-hidden />
        </label>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Vorschau</p>
          <div className="pointer-events-none max-w-[15rem]" aria-hidden>
            <ProductCard product={preview} />
          </div>
        </div>
      </div>
    </Sheet>
  )
}
