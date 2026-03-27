// ── Cart types for Verdana Rehab Store ──────────────────────────

export interface CartItem {
  productId: string
  variantId?: string
  variantLabel?: string
  quantity: number
  title: string
  price: number
  image: string
}

export interface CartState {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (productId: string, variantId?: string) => void
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
}
