import crypto from 'crypto'

/**
 * Minimal PayMongo (api.paymongo.com/v1) client.
 * Amounts are handled in PHP here and converted to centavos for PayMongo.
 * Auth is HTTP Basic with the secret key.
 *
 * MULTI-ACCOUNT: each branch is a separate PayMongo merchant account with its own
 * secret key, so every call takes an account code and resolves the key from env.
 * Secrets live ONLY in the environment — never in the repo:
 *   PAYMONGO_SECRET_KEY_AHEA     (East)
 *   PAYMONGO_SECRET_KEY_AHGH     (Greenhills)
 *   PAYMONGO_SECRET_KEY_VERDANA  (Verdana Store — falls back to PAYMONGO_SECRET_KEY)
 *   PAYMONGO_SECRET_KEY_AHI      (Aura Health Institute)
 *   PAYMONGO_WEBHOOK_SECRET      (whsk_… ; may be a comma/space-separated list — one per account)
 */

const BASE = 'https://api.paymongo.com/v1'
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET || ''

/** PayMongo merchant accounts ↔ the accounting Branch enum. */
export const PAYMONGO_ACCOUNTS = [
  { code: 'AHEA', label: 'East Branch', branch: 'SANDBOX_EAST' },
  { code: 'AHGH', label: 'Greenhills Branch', branch: 'SANDBOX_GREENHILLS' },
  { code: 'VERDANA', label: 'Verdana Store', branch: 'VERDANA_STORE' },
  { code: 'AHI', label: 'Aura Health Institute', branch: 'AURA_INSTITUTE' },
] as const

export type PaymongoAccount = typeof PAYMONGO_ACCOUNTS[number]['code']

export function isPaymongoAccount(v: string): v is PaymongoAccount {
  return PAYMONGO_ACCOUNTS.some(a => a.code === v)
}

/**
 * Map an accounting Branch (or a short code) to its PayMongo account.
 * Defaults to VERDANA, which was the single account before multi-account support —
 * so existing POS/Verdana call sites keep working unchanged.
 */
export function accountForBranch(branch?: string | null): PaymongoAccount {
  const b = (branch || '').toUpperCase()
  const hit = PAYMONGO_ACCOUNTS.find(a => a.branch === b || a.code === b)
  if (hit) return hit.code
  if (b === 'SBEA') return 'AHEA'
  if (b === 'SBGH') return 'AHGH'
  return 'VERDANA'
}

/** Resolve the secret key for an account. Verdana falls back to the original single-account var. */
function secretFor(account: string): string {
  const code = (account || '').toUpperCase()
  const direct = process.env[`PAYMONGO_SECRET_KEY_${code}`] || ''
  if (direct) return direct
  if (code === 'VERDANA') return process.env.PAYMONGO_SECRET_KEY || ''
  return ''
}

export function paymongoConfigured(account: string): boolean {
  return !!secretFor(account)
}
export function paymongoLivemode(account: string): boolean {
  return secretFor(account).startsWith('sk_live')
}
/** Which accounts currently have a key configured — drives the UI's per-branch state. */
export function configuredAccounts(): { code: string; label: string; branch: string; configured: boolean; livemode: boolean }[] {
  return PAYMONGO_ACCOUNTS.map(a => ({
    code: a.code, label: a.label, branch: a.branch,
    configured: paymongoConfigured(a.code),
    livemode: paymongoLivemode(a.code),
  }))
}

const toCentavos = (php: number) => Math.round(php * 100)
const toPhp = (centavos: number | null | undefined) => (Number(centavos) || 0) / 100

function authHeader(account: string): string {
  return 'Basic ' + Buffer.from(`${secretFor(account)}:`).toString('base64')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pmFetch(account: string, path: string, init?: RequestInit): Promise<any> {
  if (!secretFor(account)) {
    throw new Error(`PayMongo is not configured for ${account} (set PAYMONGO_SECRET_KEY_${(account || '').toUpperCase()})`)
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: authHeader(account), 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail || json?.errors?.[0]?.code || `PayMongo ${res.status}`
    throw new Error(msg)
  }
  return json
}

export interface CheckoutInput {
  account: string          // which merchant account issues the link
  amountPhp: number
  description?: string
  referenceCode?: string
  lineItemName?: string
  successUrl?: string
  cancelUrl?: string
  paymentMethodTypes?: string[]
  metadata?: Record<string, string>
  // Payer details — prefills the hosted page and appears on the payment record.
  customerName?: string
  customerEmail?: string
  customerPhone?: string
}

// Create a hosted PayMongo checkout session. Returns the checkout id + URL to open/QR.
export async function createCheckoutSession(input: CheckoutInput): Promise<{ id: string; checkoutUrl: string; raw: unknown }> {
  const billing = {
    ...(input.customerName ? { name: input.customerName } : {}),
    ...(input.customerEmail ? { email: input.customerEmail } : {}),
    ...(input.customerPhone ? { phone: input.customerPhone } : {}),
  }
  const body = {
    data: {
      attributes: {
        line_items: [{
          name: input.lineItemName || input.description || 'Payment',
          amount: toCentavos(input.amountPhp),
          currency: 'PHP',
          quantity: 1,
        }],
        payment_method_types: input.paymentMethodTypes || ['card', 'gcash', 'paymaya', 'qrph'],
        description: input.description,
        reference_number: input.referenceCode,
        ...(input.successUrl ? { success_url: input.successUrl } : {}),
        ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        ...(Object.keys(billing).length ? { billing } : {}),
        send_email_receipt: false,
        show_line_items: true,
      },
    },
  }
  const json = await pmFetch(input.account, '/checkout_sessions', { method: 'POST', body: JSON.stringify(body) })
  return { id: json.data.id, checkoutUrl: json.data.attributes.checkout_url, raw: json.data }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function retrieveCheckout(account: string, id: string): Promise<any> {
  return (await pmFetch(account, `/checkout_sessions/${id}`)).data
}

// Expire a checkout session so its link can no longer be paid. Best-effort:
// PayMongo rejects expiring an already-paid/expired session — callers ignore that.
export async function expireCheckout(account: string, id: string): Promise<void> {
  await pmFetch(account, `/checkout_sessions/${id}/expire`, { method: 'POST' })
}

// Normalise a PayMongo payment resource → PHP amount / fee / net.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePayment(p: any): { paymentId: string; amountPhp: number; feePhp: number; netPhp: number; status: string; paidAt: Date | null } {
  const a = p?.attributes || {}
  const amountPhp = toPhp(a.amount)
  const feePhp = toPhp(a.fee)
  const netPhp = a.net_amount != null ? toPhp(a.net_amount) : amountPhp - feePhp
  return {
    paymentId: p?.id || '',
    amountPhp, feePhp, netPhp,
    status: a.status || '',
    paidAt: a.paid_at ? new Date(a.paid_at * 1000) : null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPayments(account: string, params: { limit?: number; before?: string; after?: string } = {}): Promise<any[]> {
  const q = new URLSearchParams()
  if (params.limit) q.set('limit', String(params.limit))
  if (params.before) q.set('before', params.before)
  if (params.after) q.set('after', params.after)
  const json = await pmFetch(account, `/payments?${q.toString()}`)
  return json.data || []
}

// ── Payouts (bank settlement) ──────────────────────────────────────────────
// PayMongo deposits collected money to your bank as periodic payouts. There is no
// payout webhook, so reconciliation polls this endpoint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPayouts(account: string, params: { limit?: number } = {}): Promise<any[]> {
  const q = new URLSearchParams()
  q.set('limit', String(params.limit || 20))
  const json = await pmFetch(account, `/payouts?${q.toString()}`)
  return json.data || []
}

// Normalise a PayMongo payout resource → PHP net/fee + settled flag.
// Field names vary by account; we read defensively. `settled` = money has landed
// in the bank (as opposed to pending/in-transit).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePayout(p: any): { payoutId: string; netPhp: number; feePhp: number; status: string; settled: boolean; paidAt: Date | null } {
  const a = p?.attributes || {}
  const feePhp = toPhp(a.fee)
  // Prefer an explicit net; else total amount less fee.
  const netPhp = a.net_amount != null ? toPhp(a.net_amount) : toPhp(a.amount) - feePhp
  const status = String(a.status || '').toLowerCase()
  const SETTLED = new Set(['paid', 'settled', 'completed', 'succeeded', 'success'])
  const ts = a.paid_at || a.updated_at || a.created_at
  return {
    payoutId: p?.id || '',
    netPhp, feePhp, status,
    settled: SETTLED.has(status),
    paidAt: ts ? new Date(Number(ts) * 1000) : null,
  }
}

/**
 * Verify a PayMongo webhook signature.
 * Header format: "t=<unix>,te=<test_sig>,li=<live_sig>". The signed payload is
 * `${t}.${rawBody}` HMAC-SHA256 with the webhook secret. te is used in test mode,
 * li in live mode. Returns whether the matching signature is valid.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): { valid: boolean; livemode: boolean } {
  if (!WEBHOOK_SECRET || !signatureHeader) return { valid: false, livemode: false }
  const parts = Object.fromEntries(signatureHeader.split(',').map(kv => kv.split('=') as [string, string]))
  const t = parts.t
  const testSig = parts.te || ''
  const liveSig = parts.li || ''
  const safeEq = (a: string, b: string) => {
    if (!a || !b || a.length !== b.length) return false
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }
  // Multiple webhook endpoints → multiple signing secrets. Accept if ANY matches
  // (PAYMONGO_WEBHOOK_SECRET may be a comma/space-separated list).
  const secrets = WEBHOOK_SECRET.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
  for (const secret of secrets) {
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
    if (safeEq(expected, liveSig)) return { valid: true, livemode: true }
    if (safeEq(expected, testSig)) return { valid: true, livemode: false }
  }
  return { valid: false, livemode: false }
}
