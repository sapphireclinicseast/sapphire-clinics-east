// One-time, short-lived handoff token used to log a provider into the staff
// portal from the patient app (client.sapphireclinicseast.org) without a new
// tab. The client app authenticates/creates the provider (server-to-server,
// guarded by PROVIDER_HANDOFF_SECRET), receives a token, and redirects the
// browser to /provider-handoff?token=… on staff.*, which redeems it through
// NextAuth so Auth.js sets the session cookie itself (no hand-minted cookies).
//
// Token = base64url(payload).hmacSHA256(payload, secret), payload = {accountId, exp, jti}.
// Single-use is enforced by a jti nonce consumed on redemption.

import crypto from 'crypto'

const TTL_MS = 90_000 // 90 seconds

function secret(): string {
  const s = process.env.PROVIDER_HANDOFF_SECRET
  if (!s) throw new Error('PROVIDER_HANDOFF_SECRET is not set')
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export interface HandoffPayload {
  accountId: string
  exp: number // epoch ms
  jti: string
}

export function mintHandoffToken(accountId: string): string {
  const payload: HandoffPayload = { accountId, exp: Date.now() + TTL_MS, jti: crypto.randomBytes(12).toString('hex') }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  return `${body}.${sig}`
}

// Verify signature + expiry. Does NOT enforce single-use (see consumeJti).
export function verifyHandoffToken(token: string): HandoffPayload | null {
  const [body, sig] = (token || '').split('.')
  if (!body || !sig) return null
  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  let payload: HandoffPayload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'))
  } catch {
    return null
  }
  if (!payload.accountId || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
  return payload
}

// Single-use enforcement: an in-process set is enough because a token lives 90s
// and the staff app runs as a single PM2 process. (If it ever scales out, back
// this with a DB/Redis nonce.) Returns false if the jti was already used.
const usedJtis = new Map<string, number>()
export function consumeJti(jti: string): boolean {
  const now = Date.now()
  // prune expired
  for (const [k, exp] of usedJtis) if (exp < now) usedJtis.delete(k)
  if (usedJtis.has(jti)) return false
  usedJtis.set(jti, now + TTL_MS)
  return true
}
