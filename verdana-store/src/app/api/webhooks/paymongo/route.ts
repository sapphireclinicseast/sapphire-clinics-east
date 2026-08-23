import { NextResponse } from 'next/server'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { incrementUsage } from '@/lib/vouchers'
import { sendOrderConfirmation } from '@/lib/order-email'
import { syncCustomerToCRM } from '@/lib/crm-sync'
import { activatePartnerSubscription } from '@/lib/partner-subscribe'

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
  voucherCode?: string
  discountAmount?: number
  items: Array<{
    productId: string
    title: string
    variantLabel?: string
    variantSku?: string
    quantity: number
    price: number
  }>
  paidAt: string
  deliveryStatus: 'pending' | 'preparing' | 'shipped' | 'delivered'
  /**
   * Where the customer details came from. 'checkout' means the buyer typed a
   * delivery address on our cart page. 'billing' means we only have what
   * PayMongo captured for the card — that is a *billing* address and may be
   * nowhere near where the parcel should go, so the hub flags it for a call
   * before packing.
   */
  detailsSource?: 'checkout' | 'billing' | 'none'
}

interface PayMongoBilling {
  name?: string
  email?: string
  phone?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
}

/**
 * PayMongo exposes the payer's billing details on the checkout session, and
 * again on each payment. The buyer fills these in on PayMongo's own page, so
 * they are the only customer data we have when the cart form was skipped
 * (older orders) or left blank.
 */
function extractBilling(attrs: Record<string, unknown>): PayMongoBilling {
  const sessionBilling = attrs.billing as PayMongoBilling | undefined
  if (sessionBilling?.name || sessionBilling?.email || sessionBilling?.address) return sessionBilling

  const payments = attrs.payments as Array<{ attributes?: { billing?: PayMongoBilling } }> | undefined
  return payments?.[0]?.attributes?.billing || {}
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
  if (orders.some((o) => o.paymongoId === order.paymongoId)) return
  orders.unshift(order)
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

        console.log('PayMongo payment successful:', {
          id: checkoutData?.id,
          amount: attrs.amount,
          description: attrs.description,
        })

        // Partner (institutional) subscription → generate the 2 discount codes and
        // activate the partner. This is NOT a product order, so handle and stop here.
        if (metadata.partner_subscription === 'yes' && metadata.partner_id && metadata.tier) {
          try {
            await activatePartnerSubscription(metadata.partner_id, metadata.tier, checkoutData?.id || '')
          } catch (e) {
            console.error('Partner activation failed:', e)
          }
          break
        }

        let cartItems: Array<{ productId: string; title: string; variantLabel?: string; quantity: number; price: number }> = []
        try {
          cartItems = JSON.parse(metadata.cart_items || '[]')
        } catch {}

        // Skip payment links - they have no customer_name or cart_items in metadata.
        // Payment links fire the same webhook but only contain pm_reference_number.
        const isStoreOrder = !!(metadata.customer_name || cartItems.length > 0)
        if (!isStoreOrder) {
          console.log('Skipping payment link event (no customer/cart data):', checkoutData?.id)
          break
        }

        // attrs.amount is in centavos for checkout sessions.
        // Fall back to summing line_items if attrs.amount is null.
        const lineItemsTotal = Array.isArray(attrs.line_items)
          ? (attrs.line_items as Array<{ amount: number }>).reduce((s: number, i) => s + (i.amount || 0), 0)
          : 0
        const amountCentavos = attrs.amount ?? lineItemsTotal
        const amountPHP = amountCentavos / 100

        // Prefer what the buyer typed on our cart page; fall back to the
        // billing details PayMongo collected so an order is never anonymous.
        const billing = extractBilling(attrs)
        const billingAddr = billing.address || {}
        const billingLine = [billingAddr.line1, billingAddr.line2].filter(Boolean).join(', ')
        const billingCity = [
          billingAddr.city,
          billingAddr.state,
          billingAddr.country && billingAddr.country !== 'PH' ? billingAddr.country : null,
        ].filter(Boolean).join(', ')

        const hasFormDetails = !!(metadata.customer_name || metadata.customer_address)
        const hasBilling = !!(billing.name || billing.email || billingLine)

        const order: Order = {
          id: `ORD-${Date.now()}`,
          paymongoId: checkoutData?.id || '',
          status: 'paid',
          amount: amountPHP,
          currency: attrs.currency || 'PHP',
          customerName: metadata.customer_name || billing.name || '',
          customerPhone: metadata.customer_phone || billing.phone || '',
          customerEmail: metadata.customer_email || billing.email || '',
          customerAddress: metadata.customer_address || billingLine,
          customerCity: metadata.customer_city || billingCity,
          customerZip: metadata.customer_zip || billingAddr.postal_code || '',
          detailsSource: hasFormDetails ? 'checkout' : hasBilling ? 'billing' : 'none',
          shippingFee: Number(metadata.shipping_fee) || 0,
          voucherCode: metadata.voucher_code || undefined,
          discountAmount: Number(metadata.discount_amount) || 0,
          items: cartItems,
          paidAt: new Date().toISOString(),
          deliveryStatus: 'pending',
        }

        await saveOrder(order)
        console.log('Order saved:', order.id)

        // Thank-you / confirmation email to the customer (best-effort, never blocks).
        await sendOrderConfirmation(order)

        // Mirror the customer into the Operations hub "Verdana customers" CRM segment
        // so they can be reached in email campaigns (best-effort, never blocks).
        await syncCustomerToCRM(order)

        // Count the redemption once the payment is confirmed.
        if (metadata.voucher_code) {
          try {
            await incrementUsage(metadata.voucher_code)
          } catch (e) {
            console.error('Failed to increment voucher usage:', e)
          }
        }
        break
      }

      case 'payment.paid': {
        const paymentData = event.attributes?.data
        console.log('PayMongo payment.paid:', {
          id: paymentData?.id,
          amount: paymentData?.attributes?.amount,
          status: paymentData?.attributes?.status,
        })
        break
      }

      case 'payment.failed': {
        const paymentData = event.attributes?.data
        console.error('PayMongo payment failed:', { id: paymentData?.id })
        break
      }

      default:
        console.log()
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
