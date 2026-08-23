"use client"

import { createContext, useState, useEffect, useCallback, type ReactNode } from "react"

export interface CartItem {
  productId: string
  variantId: string | undefined
  variantLabel: string | undefined
  quantity: number
  title: string
  price: number
  image: string
}

interface CartContextValue {
  items: CartItem[]
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void
  removeItem: (productId: string, variantId?: string) => void
  updateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
  isCartOpen: boolean
  setIsCartOpen: (open: boolean) => void
}

export const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = "verdana-cart"

function matchesItem(item: CartItem, productId: string, variantId?: string): boolean {
  return item.productId === productId && item.variantId === variantId
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const [isCartOpen, setIsCartOpen] = useState(false)

  // Persist to localStorage on every items change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // localStorage may be unavailable
    }
  }, [items])

  const addItem = useCallback(
    (incoming: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      const qty = incoming.quantity ?? 1
      setItems((prev) => {
        const idx = prev.findIndex((i) =>
          matchesItem(i, incoming.productId, incoming.variantId)
        )
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qty }
          return updated
        }
        return [...prev, { ...incoming, quantity: qty }]
      })
    },
    []
  )

  const removeItem = useCallback(
    (productId: string, variantId?: string) => {
      setItems((prev) => prev.filter((i) => !matchesItem(i, productId, variantId)))
    },
    []
  )

  const updateQuantity = useCallback(
    (productId: string, variantId: string | undefined, quantity: number) => {
      if (quantity <= 0) {
        setItems((prev) => prev.filter((i) => !matchesItem(i, productId, variantId)))
        return
      }
      setItems((prev) =>
        prev.map((i) =>
          matchesItem(i, productId, variantId) ? { ...i, quantity } : i
        )
      )
    },
    []
  )

  const clearCart = useCallback(() => setItems([]), [])

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}
