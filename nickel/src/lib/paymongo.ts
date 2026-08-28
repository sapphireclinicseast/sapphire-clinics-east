// PayMongo Links — patient payments settle into the Verdana account. The
// container's PAYMONGO_SECRET_KEY is wired to the Verdana key in compose.

import crypto from 'crypto'

const PAYMONGO_API = 'https://api.paymongo.com/v1'

function authHeader(): string {
  const secret = process.env.PAYMONGO_SECRET_KEY
  if (!secret) throw new Error('PAYMONGO_SECRET_KEY is not set')
  return 'Basic ' + Buffer.from(`${secret}:`).toString('base64')
}

export interface PaymongoLink { id: string; checkoutUrl: string; referenceNumber: string }

export async function createPaymongoLink(params: { amountPhp: number; description: string; remarks?: string }): Promise<PaymongoLink> {
  const { amountPhp, description, remarks } = params
  if (amountPhp <= 0) throw new Error('amountPhp must be > 0')
  const res = await fetch(`${PAYMONGO_API}/links`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { attributes: { amount: Math.round(amountPhp * 100), description, remarks: remarks ?? description } } }),
  })
  if (!res.ok) throw new Error(`PayMongo link creation failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  const d = json?.data
  const a = d?.attributes
  if (!d?.id || !a?.checkout_url) throw new Error('PayMongo returned malformed response')
  return { id: d.id, checkoutUrl: a.checkout_url, referenceNumber: a.reference_number }
}

// ── Webhook signature verification ─────────────────────────────────────────
// The Verdana webhook signing secret. Set PAYMONGO_WEBHOOK_SECRET in the Nickel
// container env (from the PayMongo dashboard for the Verdana account).
export function hasWebhookSecret(): boolean {
  return typeof process.env.PAYMONGO_WEBHOOK_SECRET === 'string' && process.env.PAYMONGO_WEBHOOK_SECRET.length > 0
}

// Header format: "t=<ts>,te=<test-sig>,li=<live-sig>". Signed payload is
// `${t}.${rawBody}`, HMAC-SHA256 hex with the webhook secret.
export function verifyPaymongoSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => { const [k, v] = kv.split('='); return [k.trim(), v?.trim() ?? ''] }),
  )
  const timestamp = parts.t
  const expected = process.env.PAYMONGO_LIVE === 'false' ? parts.te : parts.li
  if (!timestamp || !expected) return false
  const computed = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expected)) } catch { return false }
}
