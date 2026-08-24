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

export function signMeetLink(claims: MeetClaims, expiresAtSec: number): string {
  const secret = process.env.MEET_LINK_SECRET
  if (!secret) throw new Error('MEET_LINK_SECRET is not set')
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      sub: claims.room,
      name: claims.name,
      role: claims.role ?? 'guest',
      iat: Math.floor(Date.now() / 1000),
      exp: expiresAtSec,
    }),
  )
  const data = `${header}.${payload}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

// Full join URL. `expiresAtSec` is absolute epoch seconds.
export function meetRoomUrl(room: string, claims: Omit<MeetClaims, 'room'>, expiresAtSec: number): string {
  const t = signMeetLink({ room, ...claims }, expiresAtSec)
  return `${MEET_BASE_URL}/r/${encodeURIComponent(room)}?t=${t}`
}

// Link expiry from a session date "YYYY-MM-DD": end of that day + 2-day buffer
// (covers reminders sent ahead and the session itself). Falls back to +30 days.
export function expiryFromDate(date: string): number {
  const base = Date.parse(`${date}T23:59:59Z`)
  const ms = Number.isNaN(base) ? Date.now() + 30 * 864e5 : base + 2 * 864e5
  return Math.floor(ms / 1000)
}
