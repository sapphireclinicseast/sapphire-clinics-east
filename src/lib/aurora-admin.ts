// Shared-secret auth for the Aurora FAQ admin endpoints. These are called
// server-to-server by the client-portal admin proxy, which injects the token.
// The token never reaches the browser.

import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'

export function checkAdminToken(req: NextRequest): boolean {
  const expected = process.env.AURORA_ADMIN_TOKEN
  if (!expected) return false
  const provided = req.headers.get('x-aurora-admin-token') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
