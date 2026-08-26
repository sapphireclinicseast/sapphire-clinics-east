import crypto from 'crypto'

// The booking meet link stored on a Schedule is a GUEST link (patients join
// with no extra rights). When a clinician opens their session, we upgrade it to
// a HOST link for the SAME room — that's what surfaces the elective Record
// button in the meet app. Signed with the shared MEET_LINK_SECRET (HS256,
// jose-verifiable by the meet app), matching Ops Hub's generator.

const MEET_BASE_URL = process.env.MEET_BASE_URL ?? 'https://meet.sapphireclinicseast.org'
const b64url = (i: string | Buffer) => Buffer.from(i).toString('base64url')

// Compact host token — byte-identical to the meet app verifier + Ops Hub
// generator: `<payloadB64>.<sig16>`, payloadB64 = base64url("exp|h|name"),
// sig = first 16 bytes of HMAC-SHA256(secret, "room.payloadB64").
function signHost(room: string, name: string | undefined, expiresAtSec: number): string {
  const secret = process.env.MEET_LINK_SECRET as string
  const payloadB64 = b64url(`${expiresAtSec}|h|${name ?? ''}`)
  const sig = crypto.createHmac('sha256', secret).update(`${room}.${payloadB64}`).digest().subarray(0, 16).toString('base64url')
  return `${payloadB64}.${sig}`
}

// Build a fresh HOST meet link for a brand-new room (used by supervision /
// mentorship meetings — everyone invited gets a host link so either side can
// record; the meet app makes host transferable). Returns null if the secret
// isn't configured.
export function meetHostLink(room: string, name?: string | null, validDays = 60): string | null {
  if (!process.env.MEET_LINK_SECRET) return null
  const exp = Math.floor(Date.now() / 1000) + validDays * 24 * 3600
  const t = signHost(room, name ?? undefined, exp)
  return `${MEET_BASE_URL}/r/${encodeURIComponent(room)}?t=${t}`
}

// Turn a stored guest meet link into a host link for the same room. Passes
// through unchanged when: no link, secret unset, not a meet.sapphire /r/ link
// (e.g. legacy meet.jit.si), or the URL can't be parsed.
export function hostifyMeetLink(storedUrl: string | null | undefined, name?: string | null): string | null {
  if (!storedUrl) return storedUrl ?? null
  if (!process.env.MEET_LINK_SECRET) return storedUrl
  try {
    const u = new URL(storedUrl)
    const m = u.pathname.match(/^\/r\/([^/]+)/)
    if (!m) return storedUrl
    const room = decodeURIComponent(m[1])
    const exp = Math.floor(Date.now() / 1000) + 24 * 3600 // host link valid 24h from view
    const t = signHost(room, name ?? undefined, exp)
    return `${MEET_BASE_URL}/r/${encodeURIComponent(room)}?t=${t}`
  } catch {
    return storedUrl
  }
}
