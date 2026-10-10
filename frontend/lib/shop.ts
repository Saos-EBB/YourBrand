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
