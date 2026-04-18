// PayMongo Links API + webhook signature helper.
// Docs: https://developers.paymongo.com/reference/links

import crypto from 'crypto'

const PAYMONGO_API = 'https://api.paymongo.com/v1'

function authHeader(): string {
  const secret = process.env.PAYMONGO_SECRET_KEY
  if (!secret) throw new Error('PAYMONGO_SECRET_KEY is not set')
  return 'Basic ' + Buffer.from(`${secret}:`).toString('base64')
}

export interface PaymongoLink {
  id: string
  checkoutUrl: string
  referenceNumber: string
  raw: unknown
}

/** Create a PayMongo Link (hosted checkout URL). Amount is in PHP (whole pesos). */
export async function createPaymongoLink(params: {
  amountPhp: number
  description: string
  remarks?: string
}): Promise<PaymongoLink> {
  const { amountPhp, description, remarks } = params
  if (amountPhp <= 0) throw new Error('amountPhp must be > 0')

  const res = await fetch(`${PAYMONGO_API}/links`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(amountPhp * 100), // convert to centavos
          description,
          remarks: remarks ?? description,
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayMongo link creation failed (${res.status}): ${body}`)
  }

  const json = await res.json()
  const d = json?.data
  const a = d?.attributes
  if (!d?.id || !a?.checkout_url) {
    throw new Error(`PayMongo returned malformed response: ${JSON.stringify(json)}`)
  }

  return {
    id: d.id,
    checkoutUrl: a.checkout_url,
    referenceNumber: a.reference_number,
    raw: json,
  }
}

/** Fetch current status of a PayMongo Link. */
export async function getPaymongoLink(linkId: string): Promise<{
  status: string
  raw: unknown
}> {
  const res = await fetch(`${PAYMONGO_API}/links/${linkId}`, {
    headers: { Authorization: authHeader() },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayMongo link fetch failed (${res.status}): ${body}`)
  }
  const json = await res.json()
  return {
    status: json?.data?.attributes?.status ?? 'unknown',
    raw: json,
  }
}

/**
 * Verify PayMongo webhook signature. PayMongo sends `Paymongo-Signature` header
 * formatted as `t=<timestamp>,te=<hmac>,li=<liveHmac>`. We compute HMAC-SHA256
 * of `<timestamp>.<rawBody>` with the webhook secret and compare.
 */
export function verifyPaymongoSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=')
      return [k.trim(), v?.trim() ?? '']
    }),
  )
  const timestamp = parts.t
  const expected = process.env.PAYMONGO_LIVE === 'false' ? parts.te : parts.li
  if (!timestamp || !expected) return false

  const payload = `${timestamp}.${rawBody}`
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expected))
  } catch {
    return false
  }
}
