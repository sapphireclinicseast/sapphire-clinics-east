// Server-side helpers for the Aurora admin console session.
// A successful password login sets an httpOnly cookie whose value is a hash of
// the configured password + shared token. We never store the raw secret in the
// cookie, and the marketing token never reaches the browser.

import { NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'

export const ADMIN_COOKIE = 'aurora_admin'

// The opaque session value written to the cookie on login. Returns null when
// the server isn't configured (so auth fails closed).
export function adminSessionValue(): string | null {
  const pw = process.env.AURORA_ADMIN_PASSWORD
  const tok = process.env.AURORA_ADMIN_TOKEN
  if (!pw || !tok) return null
  return createHash('sha256').update(`${pw}:${tok}`).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function passwordMatches(password: string): boolean {
  const pw = process.env.AURORA_ADMIN_PASSWORD
  if (!pw) return false
  return safeEqual(password, pw)
}

// Username is not a secret; a plain case-insensitive compare is fine.
export function usernameMatches(username: string): boolean {
  const expected = (process.env.AURORA_ADMIN_USERNAME ?? 'main').trim().toLowerCase()
  return (username ?? '').trim().toLowerCase() === expected
}

export function isAdmin(req: NextRequest): boolean {
  const expected = adminSessionValue()
  if (!expected) return false
  const got = req.cookies.get(ADMIN_COOKIE)?.value ?? ''
  return got.length > 0 && safeEqual(got, expected)
}
