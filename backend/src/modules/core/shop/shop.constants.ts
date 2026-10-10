// Spiegel der CHECKs in migrations/007_shop.sql
export const SHOP_FULFILLMENTS = ['food', 'physical', 'license', 'unlock'] as const;
export type ShopFulfillment = (typeof SHOP_FULFILLMENTS)[number];

export const SHOP_SORTS = ['price_asc', 'price_desc', 'rating', 'newest'] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_PAGE_SIZE_MAX = 60;

// Bestellungen, nach denen jemand als Kaeufer gilt (darf bewerten)
export const SHOP_BOUGHT_STATUSES = ['approved', 'fulfilled', 'partially_refunded'] as const;

export const SHOP_DELIVERY_MODES = ['pickup', 'delivery', 'shipping', 'digital'] as const;
export type ShopDeliveryMode = (typeof SHOP_DELIVERY_MODES)[number];

// Welche Lieferart zu welcher Artikelart passt; eine Bestellung hat genau eine
export const MODES_BY_FULFILLMENT: Record<ShopFulfillment, ShopDeliveryMode[]> = {
    food: ['pickup', 'delivery'],
    physical: ['shipping'],
    license: ['digital'],
    unlock: ['digital'],
};

// Versandpauschale pro Bestellung, falls system_settings.shop_shipping_cents fehlt
export const SHOP_SHIPPING_CENTS_DEFAULT = 490;
