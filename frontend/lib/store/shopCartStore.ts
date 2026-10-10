import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { selectUserId, useAuthStore } from './authStore'
import { cartGroup, type CartGroup, type ShopProduct } from '@/lib/shop'

// Warenkorb des Shops — nur im Browser; Preise hier sind Anzeige, der
// Checkout rechnet mit den Preisen aus der DB.
export interface CartItem {
  productId: string
  title: string
  category: string
  fulfillment: ShopProduct['fulfillment']
  price_cents: number
  quantity: number
}

export const CART_MAX_QUANTITY = 99

interface ShopCartState {
  // Wem der Korb gehoert: auf geteilten Geraeten sieht der naechste Login ihn nicht
  owner: string | null
  items: CartItem[]
  add: (product: ShopProduct, quantity: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
}

export const useShopCartStore = create<ShopCartState>()(
  persist(
    (set, get) => ({
      owner: null,
      items: [],
      // Eine Lieferart pro Bestellung: die Seite fragt vorher nach, ob ein Korb
      // mit anderer Gruppe geleert werden soll (siehe cartConflict)
      add: (product, quantity) => {
        const owner = selectUserId()
        const base = get().owner === owner ? get().items : []
        const kept = base.filter((i) => cartGroup(i.fulfillment) === cartGroup(product.fulfillment))
        const existing = kept.find((i) => i.productId === product.id)
        const items = existing
          ? kept.map((i) => (i === existing ? { ...i, quantity: Math.min(CART_MAX_QUANTITY, i.quantity + quantity) } : i))
          : [...kept, {
              productId: product.id,
              title: product.title,
              category: product.category,
              fulfillment: product.fulfillment,
              price_cents: product.price_cents,
              quantity: Math.min(CART_MAX_QUANTITY, quantity),
            }]
        set({ owner, items })
      },
      setQuantity: (productId, quantity) =>
        set({ items: get().items.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, Math.min(CART_MAX_QUANTITY, quantity)) } : i)) }),
      remove: (productId) => set({ items: get().items.filter((i) => i.productId !== productId) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'xxx-shop-cart' },
  ),
)

// Korb des eingeloggten Users; fremder Korb zaehlt als leer
export function useCartItems(): CartItem[] {
  const userId = useAuthStore((s) => selectUserId(s))
  const owner = useShopCartStore((s) => s.owner)
  const items = useShopCartStore((s) => s.items)
  return owner === userId ? items : EMPTY
}
const EMPTY: CartItem[] = []

// Gruppe, die beim Hinzufuegen verdraengt wuerde, sonst null
export function cartConflict(items: CartItem[], product: ShopProduct): CartGroup | null {
  const group = items.length ? cartGroup(items[0].fulfillment) : null
  return group && group !== cartGroup(product.fulfillment) ? group : null
}
