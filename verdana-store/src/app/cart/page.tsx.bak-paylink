"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Minus, Plus, Trash2, Loader2, ShoppingBag } from "lucide-react"
import { useCart } from "@/hooks/use-cart"
import { formatPrice } from "@/lib/format"
import { Button } from "@/components/ui/button"

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotal, totalItems } = useCart()
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  async function handleCheckout() {
    setIsCheckingOut(true)
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error("Checkout failed:", error)
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold text-verdana-charcoal">Your cart is empty</h1>
        <p className="mt-2 text-gray-500">Add some products to get started.</p>
        <Button className="mt-6" asChild>
          <Link href="/collections">Continue Shopping</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-verdana-charcoal">
        Your Cart ({totalItems} {totalItems === 1 ? "item" : "items"})
      </h1>

      <div className="mt-8 space-y-6">
        {items.map((item) => {
          const key = `${item.productId}-${item.variantId ?? "default"}`
          return (
            <div
              key={key}
              className="flex gap-4 border-b border-gray-200 pb-6"
            >
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400 text-xs">
                    No image
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-medium text-verdana-charcoal">{item.title}</h3>
                    {item.variantLabel && (
                      <p className="text-sm text-gray-500 mt-0.5">{item.variantLabel}</p>
                    )}
                  </div>
                  <p className="font-semibold text-verdana-charcoal">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-md">
                    <button
                      onClick={() =>
                        updateQuantity(item.productId, item.variantId, item.quantity - 1)
                      }
                      className="px-2 py-1 text-gray-600 hover:text-verdana-charcoal"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-medium min-w-[1.5rem] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(item.productId, item.variantId, item.quantity + 1)
                      }
                      className="px-2 py-1 text-gray-600 hover:text-verdana-charcoal"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId, item.variantId)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-sm flex items-center gap-1"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between text-lg">
          <span className="font-medium">Subtotal</span>
          <span className="font-bold">{formatPrice(subtotal)}</span>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <Button variant="outline" asChild className="flex-1">
            <Link href="/collections">Continue Shopping</Link>
          </Button>
          <Button
            className="flex-1"
            size="lg"
            onClick={handleCheckout}
            disabled={isCheckingOut}
          >
            {isCheckingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Checkout"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
