/**
 * Meeting-link verification.
 *
 * Two token formats are accepted (the verifier is format-agnostic so old links
 * keep working while generators migrate):
 *
 *  - COMPACT (new, short): `t = <payloadB64>.<sig>`  — payloadB64 is
 *    base64url("<exp>|<h|g>|<name>"), sig is the first 16 bytes of
 *    HMAC-SHA256(secret, "<room>.<payloadB64>") base64url. The room comes from
 *    the URL path (not the token), and is bound into the signature so a token
 *    can't be reused for another room. ~⅓ the length of the JWT form.
 *  - LEGACY JWT (2-dot HS256, sub=room): verified with jose.
 *
 * Signed with the shared MEET_LINK_SECRET (also used by the Ops Hub / HR / staff
 * generators). Keep the compact serialization identical across all of them.
 */
import crypto from 'crypto'
import { jwtVerify } from 'jose'

export type MeetRole = 'host' | 'guest'
export interface MeetClaims {
  room: string
  name?: string
  role?: MeetRole
}

function secretStr(): string {
  const s = process.env.MEET_LINK_SECRET
  if (!s) throw new Error('MEET_LINK_SECRET is not set')
  return s
}
const b64url = (b: Buffer): string => b.toString('base64url')

// Compact signer — exported so generators in THIS codebase (and as the
// reference impl for the others) stay byte-identical.
export function signCompact(room: string, claims: Omit<MeetClaims, 'room'>, expiresAtSec: number): string {
  const payloadB64 = Buffer.from(`${expiresAtSec}|${claims.role === 'host' ? 'h' : 'g'}|${claims.name ?? ''}`).toString('base64url')
  const sig = b64url(crypto.createHmac('sha256', secretStr()).update(`${room}.${payloadB64}`).digest().subarray(0, 16))
  return `${payloadB64}.${sig}`
}

export function meetRoomUrl(room: string, claims: Omit<MeetClaims, 'room'>, expiresAtSec: number): string {
  const base = process.env.MEET_BASE_URL ?? 'https://meet.sapphireclinicseast.org'
  return `${base}/r/${encodeURIComponent(room)}?t=${signCompact(room, claims, expiresAtSec)}`
}

// Verify a token for a given room (room comes from the URL path). Returns the
// claims or null. Accepts compact (1 dot) and legacy JWT (2 dots).
export async function verifyMeetLink(token: string, room: string): Promise<MeetClaims | null> {
  if (!token || !room) return null
  const dots = token.split('.').length - 1

  if (dots === 1) {
    try {
      const [payloadB64, sig] = token.split('.')
      const expected = b64url(crypto.createHmac('sha256', secretStr()).update(`${room}.${payloadB64}`).digest().subarray(0, 16))
      const a = Buffer.from(sig), b = Buffer.from(expected)
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
      const parts = Buffer.from(payloadB64, 'base64url').toString('utf8').split('|')
      const exp = Number(parts[0])
      if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
      return { room, role: parts[1] === 'h' ? 'host' : 'guest', name: parts.slice(2).join('|') || undefined }
    } catch {
      return null
    }
  }

  // Legacy JWT (sub = room)
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secretStr()))
    const sub = typeof payload.sub === 'string' ? payload.sub : ''
    if (!sub) return null
    return {
      room: sub,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      role: payload.role === 'host' ? 'host' : 'guest',
    }
  } catch {
    return null
  }
}
