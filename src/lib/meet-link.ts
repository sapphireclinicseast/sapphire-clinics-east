import crypto from 'crypto'

// Signed meeting links for the LiveKit join app (meet.sapphireclinicseast.org),
// replacing public meet.jit.si. A link is `<base>/r/<room>?t=<jwt>` where <jwt>
// is an HS256 token (jose-verifiable) signed with the shared MEET_LINK_SECRET —
// so anyone with the link joins directly (no moderator login), but links can't
// be forged for other rooms and expire after the appointment window.

const MEET_BASE_URL = process.env.MEET_BASE_URL ?? 'https://meet.sapphireclinicseast.org'

const b64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url')

export interface MeetClaims {
  room: string
  name?: string
  role?: 'host' | 'guest'
}

// Compact token: `<payloadB64>.<sig16>` where payloadB64 = base64url("exp|role|name")
// and sig = first 16 bytes of HMAC-SHA256(secret, "room.payloadB64"). The room
// lives in the URL path and is bound into the signature (can't be reused for
// another room). ~1/3 the length of the old JWT. Must stay byte-identical to
// the meet app's verifier (meet/src/lib/meet-link.ts signCompact/verify).
export function signCompact(room: string, claims: Omit<MeetClaims, 'room'>, expiresAtSec: number): string {
  const secret = process.env.MEET_LINK_SECRET
  if (!secret) throw new Error('MEET_LINK_SECRET is not set')
  const payloadB64 = b64url(`${expiresAtSec}|${claims.role === 'host' ? 'h' : 'g'}|${claims.name ?? ''}`)
  const sig = crypto.createHmac('sha256', secret).update(`${room}.${payloadB64}`).digest().subarray(0, 16).toString('base64url')
  return `${payloadB64}.${sig}`
}

// Full join URL. `expiresAtSec` is absolute epoch seconds.
export function meetRoomUrl(room: string, claims: Omit<MeetClaims, 'room'>, expiresAtSec: number): string {
  return `${MEET_BASE_URL}/r/${encodeURIComponent(room)}?t=${signCompact(room, claims, expiresAtSec)}`
}

// Link expiry from a session date "YYYY-MM-DD": end of that day + 2-day buffer
// (covers reminders sent ahead and the session itself). Falls back to +30 days.
export function expiryFromDate(date: string): number {
  const base = Date.parse(`${date}T23:59:59Z`)
  const ms = Number.isNaN(base) ? Date.now() + 30 * 864e5 : base + 2 * 864e5
  return Math.floor(ms / 1000)
}
