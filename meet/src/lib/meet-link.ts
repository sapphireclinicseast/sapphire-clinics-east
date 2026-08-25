/**
 * Signed meeting links — the canonical implementation.
 *
 * A meeting link is `https://meet.sapphireclinicseast.org/r/<room>?t=<token>`.
 * Any app that hands out links (Operations Hub, HR Hub) signs one of these;
 * the join app verifies it before minting a LiveKit token, so links can't be
 * forged for other rooms, names can't be spoofed, and links expire on their
 * own. Generators mirror the signing logic here with the SAME secret — keep
 * this the source of truth.
 *
 * TWO token formats are accepted, both HMAC-SHA256 with MEET_LINK_SECRET:
 *
 * 1. COMPACT (current — Ops Hub's signCompact, HR Hub's signMeetRoomLink):
 *    `<payloadB64>.<sig16>` where payloadB64 = base64url("exp|role|name")
 *    and sig = first 16 bytes of HMAC-SHA256(secret, "<room>.<payloadB64>").
 *    The room is NOT in the token — it's the URL path segment, and it's
 *    bound into the signature so a token can't be replayed against a
 *    different room. ~1/3 the length of the old JWT form below.
 *
 * 2. LEGACY JWT (kept for backward compatibility — links issued before the
 *    format switch are still honored until they expire, up to 180 days out):
 *    a standard 3-part `header.payload.sig` HS256 JWT (jose-verifiable) whose
 *    payload carries `sub` (room), `name`, `role`, `iat`, `exp`. Self-describes
 *    its own room, so it's checked against the URL's room after decoding
 *    rather than needing it up front.
 *
 * verifyMeetLink needs the room from the URL (it's a required argument, not
 * optional) because the compact format can't be verified without it. Format
 * is auto-detected by dot count (compact has exactly one, JWT has exactly
 * two) — nothing about the URL or caller needs to know which is in play.
 */
import crypto from 'crypto'
import { jwtVerify } from 'jose'

export type MeetRole = 'host' | 'guest'

export interface MeetClaims {
  room: string
  name?: string
  role?: MeetRole
  // True only for links that are allowed to start a public YouTube broadcast
  // (HR seminars/trainings). Regular host links — clinical sessions, HR
  // meetings — are host (can Record) but NOT broadcast. Encoded as role char
  // 'b' in the compact token.
  canBroadcast?: boolean
}

function secret(): string {
  const s = process.env.MEET_LINK_SECRET
  if (!s) throw new Error('MEET_LINK_SECRET is not set')
  return s
}

const b64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url')

// Sign a COMPACT token for `room` — matches Ops Hub's signCompact() and HR
// Hub's signMeetRoomLink() byte-for-byte. New links should use this; the
// legacy JWT signer has been removed as a generator (verify-only above).
export function signCompact(room: string, claims: Omit<MeetClaims, 'room'>, expiresAtSec: number): string {
  const roleChar = claims.canBroadcast ? 'b' : claims.role === 'host' ? 'h' : 'g'
  const payloadB64 = b64url(`${expiresAtSec}|${roleChar}|${claims.name ?? ''}`)
  const sig = crypto.createHmac('sha256', secret()).update(`${room}.${payloadB64}`).digest().subarray(0, 16).toString('base64url')
  return `${payloadB64}.${sig}`
}

function verifyCompact(room: string, token: string): MeetClaims | null {
  const dot = token.indexOf('.')
  if (dot < 0 || token.indexOf('.', dot + 1) !== -1) return null // exactly one dot
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expectedSig = crypto.createHmac('sha256', secret()).update(`${room}.${payloadB64}`).digest().subarray(0, 16).toString('base64url')
  // Constant-time comparison — sig is attacker-influenced input.
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  let decoded: string
  try {
    decoded = Buffer.from(payloadB64, 'base64url').toString()
  } catch {
    return null
  }
  const parts = decoded.split('|')
  if (parts.length < 2) return null
  const [expStr, roleChar, ...nameParts] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  // 'b' = host WITH broadcast capability; 'h' = host (record only); else guest.
  return {
    room,
    name: nameParts.join('|') || undefined,
    role: roleChar === 'h' || roleChar === 'b' ? 'host' : 'guest',
    canBroadcast: roleChar === 'b',
  }
}

async function verifyLegacyJwt(room: string, token: string): Promise<MeetClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret()))
    const tokenRoom = typeof payload.sub === 'string' ? payload.sub : ''
    if (!tokenRoom || tokenRoom !== room) return null // signature valid but for a different room
    return {
      room,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      role: payload.role === 'host' || payload.role === 'broadcast' ? 'host' : 'guest',
      canBroadcast: payload.role === 'broadcast',
    }
  } catch {
    return null
  }
}

export async function verifyMeetLink(room: string, token: string): Promise<MeetClaims | null> {
  if (!room || !token) return null
  const dotCount = (token.match(/\./g) || []).length
  if (dotCount === 1) return verifyCompact(room, token)
  if (dotCount === 2) return verifyLegacyJwt(room, token)
  return null
}
