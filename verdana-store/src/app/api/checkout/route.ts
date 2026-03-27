import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getProductBySlug, getAllProducts } from '@/lib/products'
import { toCentavos } from '@/lib/format'

interface CartItem {
  productId: string
  slug?: string
  variantLabel?: string
  quantity: number
  title: string
  price: number
}

export async function POST(request: Request) {
  try {
    const { items } = (await request.json()) as { items: CartItem[] }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    const allProducts = getAllProducts()

    const lineItems = items.map((item) => {
      const product = item.slug
        ? getProductBySlug(item.slug)
        : allProducts.find((p) => p.id === item.productId)

      const price = product?.price ?? item.price
      const name = item.variantLabel
        ? `${item.title} (${item.variantLabel})`
        : item.title

      return {
        price_data: {
          currency: 'php',
          product_data: {
            name,
          },
          unit_amount: toCentavos(price),
        },
        quantity: item.quantity,
      }
    })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/cart`,
      shipping_address_collection: {
        allowed_countries: ['PH'],
      },
      metadata: {
        cartItems: JSON.stringify(
          items.map((i) => ({
            productId: i.productId,
            variantLabel: i.variantLabel,
            quantity: i.quantity,
          }))
        ),
      },
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
