import { NextResponse } from 'next/server'
import { createCheckoutSession, type PayMongoLineItem } from '@/lib/paymongo'
import { getProductBySlug, getAllProducts } from '@/lib/products'
import { toCentavos } from '@/lib/format'
import { evaluateVoucher } from '@/lib/vouchers'
import { calculateBlendedFee, roadDistanceKm, getSettings } from '@/lib/settings'

interface CartItem {
  productId: string
  slug?: string
  variantId?: string
  variantLabel?: string
  variantSku?: string
  quantity: number
  title: string
  price: number
  image?: string
}

interface ShippingInfo {
  name: string
  phone: string
  email?: string
  address: string
  city: string
  zipCode?: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { items, shipping, shippingFee, voucherCode } = body as {
      items: CartItem[]
      shipping?: ShippingInfo
      shippingFee?: number
      voucherCode?: string
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    const allProducts = getAllProducts()

    // Category lines feed category-aware partner discount codes (toys vs bulky rates).
    const catLines: { collectionSlug?: string; price: number; quantity: number }[] = []

    // Build line items for products (amounts in centavos).
    const productLineItems: PayMongoLineItem[] = items.map((item) => {
      const product = item.slug
        ? getProductBySlug(item.slug)
        : allProducts.find((p) => p.id === item.productId)

      // Honor per-variant pricing (e.g. SMALL vs LARGE): resolve the selected
      // variant server-side and use its price when set, so the customer is charged
      // the right amount regardless of what the client sent.
      const variant = product?.variants?.find(
        (v) =>
          (item.variantSku && v.sku === item.variantSku) ||
          (item.variantLabel && v.label === item.variantLabel),
      )
      const price =
        variant && typeof variant.price === 'number' && variant.price > 0
          ? variant.price
          : product?.price ?? item.price
      const name = item.variantLabel ? `${item.title} (${item.variantLabel})` : item.title

      catLines.push({ collectionSlug: product?.collectionSlug, price, quantity: item.quantity })

      return {
        amount: toCentavos(price),
        currency: 'PHP',
        name,
        quantity: item.quantity,
        description: product?.description?.slice(0, 200) || '',
      }
    })

    // Authoritative product subtotal (pesos) from resolved prices.
    const subtotal =
      productLineItems.reduce((sum, li) => sum + li.amount * li.quantity, 0) / 100

    // ── Shipping fee: weight-based (server-authoritative). Heavier carts pay more. ──
    // Total order weight = Σ (product.weightKg × quantity); resolved server-side so the
    // client can't tamper with it. Falls back to the client value / flat ₱100 if no
    // weight pricing is configured.
    const totalKg = items.reduce((sum, item) => {
      const product = item.slug
        ? getProductBySlug(item.slug)
        : allProducts.find((p) => p.id === item.productId)
      const w = product?.weightKg
      return sum + (typeof w === 'number' && w > 0 ? w : 0) * item.quantity
    }, 0)

    // Street-level road distance from the main office to the delivery address
    // (Google Distance Matrix, server-side). Null when distance pricing is off,
    // no key is set, or the address can't be resolved → weight-only pricing.
    const settings = getSettings()
    let roadKm: number | null = null
    if (settings.shipping.distance?.enabled && shipping) {
      const dest = [shipping.address, shipping.city, shipping.zipCode, 'Philippines']
        .map((x) => (x || '').trim())
        .filter(Boolean)
        .join(', ')
      roadKm = await roadDistanceKm(dest, settings)
    }

    // Blended fee = weight base + distance surcharge.
    let fee = calculateBlendedFee(totalKg, roadKm, settings)
    if (fee <= 0) fee = shippingFee ?? 100

    // ── Apply voucher (server-side re-validation; never trust the client) ──
    const voucher = voucherCode ? evaluateVoucher(voucherCode, subtotal, catLines) : null

    if (voucher?.valid) {
      if (voucher.freeShipping) fee = 0

      if (voucher.discountAmount && voucher.discountAmount > 0 && subtotal > 0) {
        // Scale each product line proportionally so the discounted total
        // matches (item prices on the PayMongo page reflect the discount).
        const factor = (subtotal - voucher.discountAmount) / subtotal
        for (const li of productLineItems) {
          li.amount = Math.max(1, Math.round(li.amount * factor))
        }
      }
    }

    const lineItems: PayMongoLineItem[] = [...productLineItems]

    if (fee > 0) {
      lineItems.push({
        amount: toCentavos(fee),
        currency: 'PHP',
        name: `Shipping to ${shipping?.city || 'your address'}`,
        quantity: 1,
        description: 'Flat-rate delivery fee',
      })
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://verdanarehab.com'

    const session = await createCheckoutSession({
      lineItems,
      description: `Verdana Rehab — ${items.length} item${items.length > 1 ? 's' : ''}${fee > 0 ? ' + delivery' : ''}`,
      successUrl: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/cart`,
      billing: shipping
        ? {
            name: shipping.name,
            email: shipping.email,
            phone: shipping.phone,
            address: {
              line1: shipping.address,
              city: shipping.city,
              postal_code: shipping.zipCode,
              country: 'PH',
            },
          }
        : undefined,
      metadata: {
        customer_name: shipping?.name || '',
        customer_phone: shipping?.phone || '',
        customer_email: shipping?.email || '',
        customer_address: shipping?.address || '',
        customer_city: shipping?.city || '',
        customer_zip: shipping?.zipCode || '',
        shipping_fee: String(fee),
        voucher_code: voucher?.valid ? voucher.code || '' : '',
        discount_amount: voucher?.valid ? String(voucher.discountAmount || 0) : '0',
        free_shipping: voucher?.valid && voucher.freeShipping ? 'yes' : 'no',
        cart_items: JSON.stringify(
          items.map((i) => ({
            productId: i.productId,
            title: i.title,
            variantLabel: i.variantLabel,
            variantSku: i.variantSku,
            quantity: i.quantity,
            price: i.price,
          }))
        ),
      },
    })

    const checkoutUrl = session.attributes.checkout_url

    return NextResponse.json({ url: checkoutUrl, sessionId: session.id })
  } catch (error) {
    console.error('Checkout error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create checkout session'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
