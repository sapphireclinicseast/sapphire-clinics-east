/**
 * Signed meeting links — the canonical implementation.
 *
 * A meeting link is `https://meet.sapphireclinicseast.org/r/<room>?t=<jwt>`
 * where <jwt> is an HS256 token signed with MEET_LINK_SECRET carrying the
 * room + optional display name/role + expiry. Any app that hands out links
 * (Operations Hub, HR Hub) signs one of these; the join app verifies it before
 * minting a LiveKit token, so links can't be forged for other rooms, names
 * can't be spoofed, and links expire on their own.
 *
 * Generators in other codebases mirror `signMeetLink` with the SAME secret and
 * HS256 alg (see the Ops Hub / HR Hub helpers). Keep this the source of truth.
 */
import { SignJWT, jwtVerify } from 'jose'

export type MeetRole = 'host' | 'guest'

export interface MeetClaims {
  room: string
  name?: string
  role?: MeetRole
}

function secretKey(): Uint8Array {
  const s = process.env.MEET_LINK_SECRET
  if (!s) throw new Error('MEET_LINK_SECRET is not set')
  return new TextEncoder().encode(s)
}

/**
 * Sign a link token. `expiresAtSec` is an absolute UNIX epoch (seconds) — the
 * generator sets it from the session/meeting time (+ a buffer) so the link is
 * valid up to and a little past the appointment, then dies.
 */
export async function signMeetLink(claims: MeetClaims, expiresAtSec: number): Promise<string> {
  return new SignJWT({ name: claims.name, role: claims.role ?? 'guest' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.room)
    .setIssuedAt()
    .setExpirationTime(expiresAtSec)
    .sign(secretKey())
}

export async function verifyMeetLink(token: string): Promise<MeetClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    const room = typeof payload.sub === 'string' ? payload.sub : ''
    if (!room) return null
    return {
      room,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      role: payload.role === 'host' ? 'host' : 'guest',
    }
  } catch {
    return null
  }
}
