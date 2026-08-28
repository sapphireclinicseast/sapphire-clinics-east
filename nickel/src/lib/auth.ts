// Nickel provider auth — a small, self-contained signed-cookie session (no
// NextAuth needed). Cookie = base64url(payload).hmac, payload = { pid, exp }.

import crypto from 'crypto'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const SESSION_COOKIE = 'nickel_session'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function secret(): string {
  return process.env.NEXTAUTH_SECRET || 'dev-insecure-secret-change-me'
}
function b64url(b: Buffer) { return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function fromB64url(s: string) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64') }

export async function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 12) }
export async function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash) }

export function signSession(providerId: string): string {
  const body = b64url(Buffer.from(JSON.stringify({ pid: providerId, exp: Date.now() + TTL_MS })))
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  return `${body}.${sig}`
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null } catch { return null }
  try {
    const p = JSON.parse(fromB64url(body).toString('utf8')) as { pid: string; exp: number }
    if (!p.pid || typeof p.exp !== 'number' || p.exp < Date.now()) return null
    return p.pid
  } catch { return null }
}

// Server-component/route helper: the signed-in provider id (or null).
export async function getSessionProviderId(): Promise<string | null> {
  const jar = await cookies()
  return verifySession(jar.get(SESSION_COOKIE)?.value)
}

// Load the full provider row for the current session.
export async function getSessionProvider() {
  const pid = await getSessionProviderId()
  if (!pid) return null
  return prisma.provider.findUnique({ where: { id: pid } })
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Math.floor(TTL_MS / 1000),
}
