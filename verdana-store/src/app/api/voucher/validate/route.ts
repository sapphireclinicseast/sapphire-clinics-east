import { NextResponse } from 'next/server'
import { evaluateVoucher } from '@/lib/vouchers'
import { getAllProducts, getProductBySlug } from '@/lib/products'

// Public: customers call this from the cart to check a code before checkout.
export async function POST(request: Request) {
  try {
    const { code, subtotal, items } = (await request.json()) as {
      code?: string
      subtotal?: number
      items?: Array<{ productId?: string; slug?: string; price?: number; quantity?: number }>
    }

    // Resolve each cart line to its collection so category-aware partner codes
    // (toys vs bulky rates) compute correctly.
    let lines: Array<{ collectionSlug?: string; price: number; quantity: number }> | undefined
    if (Array.isArray(items) && items.length) {
      const all = getAllProducts()
      lines = items.map((it) => {
        const product = it.slug ? getProductBySlug(it.slug) : all.find((p) => p.id === it.productId)
        return { collectionSlug: product?.collectionSlug, price: Number(it.price) || 0, quantity: Number(it.quantity) || 1 }
      })
    }

    const result = evaluateVoucher(code || '', Number(subtotal) || 0, lines)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ valid: false, reason: 'Could not check that code.' }, { status: 400 })
  }
}
