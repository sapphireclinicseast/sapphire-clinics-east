// PayMongo Links API + webhook signature helper.
// Docs: https://developers.paymongo.com/reference/links

import crypto from 'crypto'

const PAYMONGO_API = 'https://api.paymongo.com/v1'

// Each branch has its own PayMongo account (its settlement bank account is tied
// to that account), so a payment must be created with THAT branch's secret key.
// PAYMONGO_SECRET_KEY_SBEA / _SBGH select per branch; PAYMONGO_SECRET_KEY is the
// backward-compatible fallback when a per-branch key isn't configured.
function branchShort(branch?: string): 'SBEA' | 'SBGH' | null {
  if (branch === 'SANDBOX_EAST') return 'SBEA'
  if (branch === 'SANDBOX_GREENHILLS') return 'SBGH'
  return null
}

function secretKeyFor(branch?: string): string {
  const sh = branchShort(branch)
  const perBranch = sh ? process.env[`PAYMONGO_SECRET_KEY_${sh}`] : undefined
  const secret = perBranch || process.env.PAYMONGO_SECRET_KEY
  if (!secret) throw new Error('PAYMONGO_SECRET_KEY is not set')
  return secret
}

function authHeader(branch?: string): string {
  return 'Basic ' + Buffer.from(`${secretKeyFor(branch)}:`).toString('base64')
}

// All configured webhook signing secrets (per-branch + legacy single). A paid
// webhook is accepted if it verifies against ANY of them, so one endpoint can
// receive events from every branch account.
function webhookSecrets(): string[] {
  return [
    process.env.PAYMONGO_WEBHOOK_SECRET_SBEA,
    process.env.PAYMONGO_WEBHOOK_SECRET_SBGH,
    process.env.PAYMONGO_WEBHOOK_SECRET,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0)
}

/** True when at least one webhook signing secret is configured. */
export function hasWebhookSecret(): boolean {
  return webhookSecrets().length > 0
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
  branch?: string // routes the charge to that branch's PayMongo account
}): Promise<PaymongoLink> {
  const { amountPhp, description, remarks, branch } = params
  if (amountPhp <= 0) throw new Error('amountPhp must be > 0')

  const res = await fetch(`${PAYMONGO_API}/links`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(branch),
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
export async function getPaymongoLink(linkId: string, branch?: string): Promise<{
  status: string
  raw: unknown
}> {
  const res = await fetch(`${PAYMONGO_API}/links/${linkId}`, {
    headers: { Authorization: authHeader(branch) },
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
  const secrets = webhookSecrets()
  if (secrets.length === 0 || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=')
      return [k.trim(), v?.trim() ?? '']
    }),
  )
  const timestamp = parts.t
  const expected = process.env.PAYMONGO_LIVE === 'false' ? parts.te : parts.li
  if (!timestamp || !expected) return false

  // Accept if the signature matches ANY configured branch/legacy secret — a
  // single webhook endpoint can receive events from every branch account.
  const payload = `${timestamp}.${rawBody}`
  for (const secret of secrets) {
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    try {
      if (crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expected))) return true
    } catch {
      // length mismatch → not this secret; keep trying
    }
  }
  return false
}
