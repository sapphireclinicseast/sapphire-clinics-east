// Class-portal auth helpers — used by /api/public/class-portal/* routes.
// Tokens are HS256 JWTs signed with CLASS_PORTAL_JWT_SECRET. Passwords are
// bcrypt'd. The admin role is virtual (hardcoded creds), no DB row.

import bcrypt from 'bcryptjs'

const ADMIN_EMAIL = 'main@sapphireclinicseast.org'
const ADMIN_PASSWORD = 'SCEI'
const FRONTDESK_EMAIL = 'frontdesk@sapphireclinicseast.org'
const FRONTDESK_PASSWORD = 'FRONTDESK'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

function secret(): Uint8Array {
  const s = process.env.CLASS_PORTAL_JWT_SECRET
  if (!s || s.length < 16) {
    // Fail loudly in production; permit a deterministic fallback only when
    // the env is missing so local dev doesn't blow up before .env is wired.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CLASS_PORTAL_JWT_SECRET not configured.')
    }
    return new TextEncoder().encode('insecure-dev-secret-do-not-use-in-prod')
  }
  return new TextEncoder().encode(s)
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSha256(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg)))
}

export type ClassPortalRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'FRONTDESK' | 'BRANCH_ADMIN'

export interface ClassPortalToken {
  role: ClassPortalRole
  userId?: string // omitted for hardcoded admin/frontdesk
  email: string
  firstName?: string
  /** Branch scope for staff accounts (frontdesk + branch admin). */
  branch?: 'EAST' | 'GREENHILLS'
  /** Set when an admin minted this token via "View as". Carries the
   *  admin's email so server-side handlers can flag or refuse sensitive
   *  actions during impersonation, and so audit code paths know who is
   *  actually behind the request. */
  impersonatedBy?: string
  /** ID of the ClassPortalImpersonationLog row that opened this session. */
  impersonationLogId?: string
  iat: number
  exp: number
}

export async function signToken(payload: Omit<ClassPortalToken, 'iat' | 'exp'>): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  const full: ClassPortalToken = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS }
  const body = b64url(new TextEncoder().encode(JSON.stringify(full)))
  const signing = `${header}.${body}`
  const sig = await hmacSha256(secret(), signing)
  return `${signing}.${b64url(sig)}`
}

export async function verifyToken(token: string): Promise<ClassPortalToken | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, b, sig] = parts
  const expected = await hmacSha256(secret(), `${h}.${b}`)
  const actual = b64urlDecode(sig)
  if (expected.length !== actual.length) return null
  let ok = 0
  for (let i = 0; i < expected.length; i++) ok |= expected[i] ^ actual[i]
  if (ok !== 0) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(b))) as ClassPortalToken
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}

export async function comparePassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}

export function isAdminCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD
}

export function isFrontdeskCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === FRONTDESK_EMAIL && password === FRONTDESK_PASSWORD
}

export const CLASS_PORTAL_ADMIN_EMAIL = ADMIN_EMAIL
export const CLASS_PORTAL_FRONTDESK_EMAIL = FRONTDESK_EMAIL

/** Read the bearer token from the Authorization header. */
export function bearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null
  return auth.slice(7).trim() || null
}

/** Require a valid token; throws Response 401 if missing/invalid. */
export async function requireAuth(req: Request, allowedRoles?: ClassPortalRole[]): Promise<ClassPortalToken> {
  const tok = bearerToken(req)
  if (!tok) throw new Response(JSON.stringify({ error: 'Missing bearer token.' }), { status: 401, headers: { 'content-type': 'application/json' } })
  const payload = await verifyToken(tok)
  if (!payload) throw new Response(JSON.stringify({ error: 'Invalid or expired token.' }), { status: 401, headers: { 'content-type': 'application/json' } })
  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    throw new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403, headers: { 'content-type': 'application/json' } })
  }
  return payload
}
