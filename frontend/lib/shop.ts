// Shop (Modul "shop") — Spiegel von backend/src/modules/core/shop
export const SHOP_FULFILLMENTS = ['food', 'physical', 'license', 'unlock'] as const
export type ShopFulfillment = (typeof SHOP_FULFILLMENTS)[number]
export const SHOP_SORTS = ['newest', 'price_asc', 'price_desc', 'rating'] as const
export type ShopSort = (typeof SHOP_SORTS)[number]
export const SHOP_PAGE_SIZE = 24

export interface ShopProduct {
  id: string
  sku: string
  title: string
  description: string
  category: string
  fulfillment: ShopFulfillment
  price_cents: number
  vat_rate: number
  image_url: string | null
  rating_avg: number
  rating_count: number
  in_stock: boolean
}

export interface ShopReview {
  rating: number
  body: string | null
  created_at: string
  nickname: string | null
  mine: boolean
}

export interface ShopProductDetail extends ShopProduct {
  reviews: ShopReview[]
  can_review: boolean
}

export interface ShopProductPage {
  items: ShopProduct[]
  total: number
  page: number
  limit: number
  facets: { categories: { category: string; count: number }[]; priceMin: number; priceMax: number }
}

export function formatPrice(cents: number, locale: string): string {
  const lang = locale === 'de_easy' || locale === 'leet' ? 'de' : locale
  return new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

// Kategorien sind Daten des Mandanten, kein i18n: Slug lesbar machen
export function categoryLabel(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Eine Bestellung hat genau eine Lieferart (wie MODES_BY_FULFILLMENT im Backend):
// Essen wird abgeholt oder geliefert, Merch verschickt, Keys/Codes sind digital
export type CartGroup = 'food' | 'physical' | 'digital'
export type ShopDeliveryMode = 'pickup' | 'delivery' | 'shipping' | 'digital'
export function cartGroup(f: ShopFulfillment): CartGroup {
  return f === 'food' ? 'food' : f === 'physical' ? 'physical' : 'digital'
}
export const MODES_BY_GROUP: Record<CartGroup, ShopDeliveryMode[]> = {
  food: ['pickup', 'delivery'],
  physical: ['shipping'],
  digital: ['digital'],
}

export interface ShopSettings {
  shipping_cents: number
}

// Admin-Sicht (GET /admin/shop/products): auch inaktive Artikel, Bestand und freie Keys
export interface AdminShopProduct extends Omit<ShopProduct, 'in_stock'> {
  unlock_target: string | null
  stock: number | null
  active: boolean
  free_codes: number | null
  created_at: string
  updated_at: string
}

export interface AdminShopProductPage {
  items: AdminShopProduct[]
  total: number
  page: number
  limit: number
  categories: string[]
}

export const SHOP_VAT_RATES = [19, 7, 0] as const
export function defaultVat(f: ShopFulfillment): number {
  return f === 'food' ? 7 : 19
}

// "39,90" / "39.90" -> Cent (Formular); null wenn keine Zahl
export function euroToCents(raw: string): number | null {
  const s = raw.trim().replace(/\s|€/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}
export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

// Admin: Bestellungen (GET /admin/shop/orders). Konsole nur auf Deutsch.
export type ShopOrderStatus =
  | 'pending' | 'authorized' | 'held' | 'approved' | 'fulfilled'
  | 'rejected' | 'expired' | 'cancelled' | 'refunded' | 'partially_refunded'

export const ORDER_STATUS_LABEL: Record<ShopOrderStatus, string> = {
  pending: 'Offen',
  authorized: 'Reserviert',
  held: 'Angehalten',
  approved: 'Angenommen',
  fulfilled: 'Ausgeliefert',
  rejected: 'Abgelehnt',
  expired: 'Abgelaufen',
  cancelled: 'Abgebrochen',
  refunded: 'Erstattet',
  partially_refunded: 'Teilerstattet',
}

export const DELIVERY_MODE_LABEL: Record<ShopDeliveryMode, string> = {
  pickup: 'Abholen',
  delivery: 'Liefern',
  shipping: 'Versand',
  digital: 'Digital',
}

// Regel-Codes aus dem Risiko-Check (Schritt 5); Unbekanntes zeigt den Code
export const HOLD_REASON_LABEL: Record<string, string> = {
  amount_high: 'Hoher Betrag',
  new_buyer: 'Erste Bestellung',
  card_reuse: 'Karte bei mehreren Konten',
  velocity: 'Viele Bestellungen in kurzer Zeit',
  radar_elevated: 'Stripe Radar: erhöhtes Risiko',
  previous_dispute: 'Frühere Rückbuchung',
}

export interface AdminShopOrder {
  id: string
  status: ShopOrderStatus
  delivery_mode: ShopDeliveryMode
  total_cents: number
  currency: string
  created_at: string
  decide_by: string | null
  hold_reasons: string[]
  radar_risk: string | null
  buyer_name: string | null
  nickname: string | null
  item_count: number
  first_title: string | null
}

export interface AdminShopOrderPage {
  items: AdminShopOrder[]
  total: number
  page: number
  limit: number
  counts: Partial<Record<ShopOrderStatus, number>>
}

export interface AdminShopOrderEvent {
  id: string
  type: string
  data: Record<string, unknown>
  created_at: string
  actor_id: string | null
  actor_nickname: string | null
}

export interface AdminShopOrderDetail extends Omit<AdminShopOrder, 'item_count' | 'first_title'> {
  user_id: string | null
  items_cents: number
  shipping_cents: number
  refunded_cents: number
  contact_name: string | null
  contact_phone: string | null
  delivery_address: string | null
  desired_at: string | null
  delivery_note: string | null
  buyer_email: string | null
  buyer_address: string | null
  withdrawal_waiver_at: string | null
  stripe_payment_intent_id: string | null
  decided_at: string | null
  decided_by_nickname: string | null
  decision_note: string | null
  items: { id: string; sku: string; title: string; fulfillment: ShopFulfillment; quantity: number; unit_price_cents: number; vat_rate: number }[]
  events: AdminShopOrderEvent[]
  buyer_history: { completed: number; rejected: number; refunded: number } | null
}

// Kurze Bestellnummer fuer Anzeige und Suche
export function orderNumber(id: string): string {
  return id.slice(0, 8).toUpperCase()
}
