// UGAT Fellowship auth helpers — used by /api/public/ugat/* routes.
// Session tokens are HS256 JWTs signed with UGAT_JWT_SECRET (falls back to
// CLASS_PORTAL_JWT_SECRET so we don't need a second prod secret). Passwords
// are bcrypt'd.
//
// Roles:
//   MAIN_ADMIN  — the single virtual account `main` / `scei` (no DB row).
//   STAFF_ADMIN — a UgatAdmin row, created by the main admin in User Access.
//   SCHOLAR     — a UgatScholar row (self-service signup).

import bcrypt from 'bcryptjs'

// The virtual main-admin login: a username + password (not an email).
export const UGAT_MAIN_ADMIN_USERNAME = 'main'
const UGAT_MAIN_ADMIN_PASSWORD = 'scei'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

function secret(): Uint8Array {
  const s = process.env.UGAT_JWT_SECRET || process.env.CLASS_PORTAL_JWT_SECRET
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('UGAT_JWT_SECRET / CLASS_PORTAL_JWT_SECRET not configured.')
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

export type UgatRole = 'MAIN_ADMIN' | 'STAFF_ADMIN' | 'SCHOLAR'

export function isAdminRole(role: UgatRole | undefined): boolean {
  return role === 'MAIN_ADMIN' || role === 'STAFF_ADMIN'
}

export interface UgatToken {
  role: UgatRole
  /** Scholar id — SCHOLAR only. */
  scholarId?: string
  /** UgatAdmin id — STAFF_ADMIN only. */
  adminId?: string
  /** Login handle (all roles; `main` for the virtual main admin). */
  username?: string
  email?: string
  firstName?: string
  /** Display name (admins). */
  name?: string
  /** issued-at / expiry (epoch seconds) */
  iat: number
  exp: number
}

export async function signToken(
  payload: Omit<UgatToken, 'iat' | 'exp'>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const full: UgatToken = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS }
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64url(new TextEncoder().encode(JSON.stringify(full)))
  const sig = b64url(await hmacSha256(secret(), `${header}.${body}`))
  return `${header}.${body}.${sig}`
}

export async function verifyToken(token: string): Promise<UgatToken | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = b64url(await hmacSha256(secret(), `${header}.${body}`))
  // Constant-time-ish compare.
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as UgatToken
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

/** Pull + verify the Bearer token from a request. Null if missing/invalid. */
export async function tokenFromRequest(req: Request): Promise<UgatToken | null> {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  return verifyToken(m[1])
}

/** True for the virtual MAIN admin login (username `main`, password `scei`). */
export function isMainAdminCredentials(username: string, password: string): boolean {
  return username.trim().toLowerCase() === UGAT_MAIN_ADMIN_USERNAME && password === UGAT_MAIN_ADMIN_PASSWORD
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** URL-safe random token for email verification links. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return b64url(buf)
}
