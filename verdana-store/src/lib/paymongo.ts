// ── PayMongo API helpers ─────────────────────────────────────
// Uses the Checkout Session API for hosted checkout
// Docs: https://developers.paymongo.com/reference/create-a-checkout

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY!
const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1'

function authHeader() {
  return `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString('base64')}`
}

export interface PayMongoLineItem {
  amount: number // in centavos (PHP * 100)
  currency: string
  name: string
  quantity: number
  description?: string
  images?: string[]
}

export interface PayMongoBilling {
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

export interface CreateCheckoutParams {
  lineItems: PayMongoLineItem[]
  description?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
  billing?: PayMongoBilling
}

export async function createCheckoutSession(params: CreateCheckoutParams) {
  const attributes: Record<string, unknown> = {
    line_items: params.lineItems,
    payment_method_types: ['card', 'gcash', 'grab_pay', 'paymaya'],
    description: params.description || 'Verdana Rehab Store Order',
    send_email_receipt: true,
    show_line_items: true,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata || {},
  }

  // Pre-fill customer billing info so they don't have to re-enter on PayMongo
  if (params.billing) {
    attributes.billing = params.billing
  }

  const body = { data: { attributes } }

  const res = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('PayMongo error:', JSON.stringify(err, null, 2))
    throw new Error(`PayMongo API error: ${res.status}`)
  }

  const data = await res.json()
  return data.data // { id, type, attributes: { checkout_url, ... } }
}

export async function retrieveCheckoutSession(sessionId: string) {
  const res = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions/${sessionId}`, {
    headers: {
      Accept: 'application/json',
      Authorization: authHeader(),
    },
  })

  if (!res.ok) {
    throw new Error(`PayMongo API error: ${res.status}`)
  }

  const data = await res.json()
  return data.data
}
