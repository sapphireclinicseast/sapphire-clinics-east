import { NextResponse } from 'next/server'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'

const ORDERS_FILE = join(process.cwd(), 'src', 'data', 'orders.json')

interface Order {
  id: string
  paymongoId: string
  status: string
  amount: number
  currency: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  customerCity: string
  customerZip: string
  shippingFee: number
  items: Array<{
    productId: string
    title: string
    variantLabel?: string
    quantity: number
    price: number
  }>
  paidAt: string
  deliveryStatus: 'pending' | 'preparing' | 'shipped' | 'delivered'
}

async function readOrders(): Promise<Order[]> {
  try {
    const raw = await readFile(ORDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function saveOrder(order: Order): Promise<void> {
  const orders = await readOrders()
  // Don't duplicate
  if (orders.some((o) => o.paymongoId === order.paymongoId)) return
  orders.unshift(order) // newest first
  await mkdir(join(process.cwd(), 'src', 'data'), { recursive: true })
  await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const event = body.data

    if (!event) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const eventType = event.attributes?.type

    switch (eventType) {
      case 'checkout_session.payment.paid': {
        const checkoutData = event.attributes?.data
        const attrs = checkoutData?.attributes || {}
        const metadata = attrs.metadata || {}

        console.log('✅ PayMongo payment successful:', {
          id: checkoutData?.id,
          amount: attrs.amount,
          description: attrs.description,
        })

        // Parse cart items from metadata
        let cartItems = []
        try {
          cartItems = JSON.parse(metadata.cart_items || '[]')
        } catch {}

        // Save order
        const order: Order = {
          id: `ORD-${Date.now()}`,
          paymongoId: checkoutData?.id || '',
          status: 'paid',
          amount: (attrs.amount || 0) / 100, // convert centavos to PHP
          currency: attrs.currency || 'PHP',
          customerName: metadata.customer_name || '',
          customerPhone: metadata.customer_phone || '',
          customerEmail: metadata.customer_email || '',
          customerAddress: metadata.customer_address || '',
          customerCity: metadata.customer_city || '',
          customerZip: metadata.customer_zip || '',
          shippingFee: Number(metadata.shipping_fee) || 0,
          items: cartItems,
          paidAt: new Date().toISOString(),
          deliveryStatus: 'pending',
        }

        await saveOrder(order)
        console.log('📦 Order saved:', order.id)
        break
      }

      case 'payment.paid': {
        const paymentData = event.attributes?.data
        console.log('✅ PayMongo payment.paid:', {
          id: paymentData?.id,
          amount: paymentData?.attributes?.amount,
          status: paymentData?.attributes?.status,
        })
        break
      }

      case 'payment.failed': {
        const paymentData = event.attributes?.data
        console.error('❌ PayMongo payment failed:', {
          id: paymentData?.id,
        })
        break
      }

      default:
        console.log(`Unhandled PayMongo event: ${eventType}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
