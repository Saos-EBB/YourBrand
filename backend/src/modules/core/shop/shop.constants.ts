// Spiegel der CHECKs in migrations/007_shop.sql
export const SHOP_FULFILLMENTS = ['food', 'physical', 'license', 'unlock'] as const;
export type ShopFulfillment = (typeof SHOP_FULFILLMENTS)[number];

export const SHOP_SORTS = ['price_asc', 'price_desc', 'rating', 'newest'] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_PAGE_SIZE_MAX = 60;

// Bestellungen, nach denen jemand als Kaeufer gilt (darf bewerten)
export const SHOP_BOUGHT_STATUSES = ['approved', 'fulfilled', 'partially_refunded'] as const;
