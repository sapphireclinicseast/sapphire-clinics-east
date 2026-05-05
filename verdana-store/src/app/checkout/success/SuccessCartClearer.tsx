"use client"

import { useEffect } from "react"
import { useCart } from "@/hooks/use-cart"

export function SuccessCartClearer() {
  const { clearCart } = useCart()

  useEffect(() => {
    clearCart()
  }, [clearCart])

  return null
}
