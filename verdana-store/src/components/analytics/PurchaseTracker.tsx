"use client"

import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { fbTrack } from "@/lib/fbpixel"

interface OrderLike {
  paymongoId?: string
  amount?: number
  currency?: string
  items?: Array<{ productId?: string; variantSku?: string; quantity?: number }>
}

/**
 * Fires the Meta Pixel `Purchase` event on the order-success page. Looks the order
 * up by the PayMongo session_id so the event carries the real value/contents; the
 * webhook that saves the order can lag the redirect, so we retry briefly. Falls
 * back to a value-less Purchase if the order isn't visible yet.
 */
export function PurchaseTracker() {
  const searchParams = useSearchParams()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    const sessionId = searchParams.get("session_id")
    let cancelled = false

    async function fire() {
      let order: OrderLike | undefined
      for (let attempt = 0; attempt < 5 && !cancelled && sessionId; attempt++) {
        try {
          const res = await fetch("/api/orders?limit=50", { cache: "no-store" })
          const data = await res.json()
          order = (data.orders || []).find((o: OrderLike) => o.paymongoId === sessionId)
          if (order) break
        } catch {
          // ignore and retry
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (cancelled) return

      if (order) {
        fbTrack("Purchase", {
          value: order.amount ?? 0,
          currency: order.currency || "PHP",
          content_type: "product",
          content_ids: (order.items || []).map((it) => it.variantSku || it.productId),
          num_items: (order.items || []).reduce((s, it) => s + (it.quantity || 1), 0),
        })
      } else {
        // Conversion still happened even if the order record isn't readable yet.
        fbTrack("Purchase")
      }
    }

    fire()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  return null
}
