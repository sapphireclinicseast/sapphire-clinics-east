import crypto from 'crypto'

// The booking meet link stored on a Schedule is a GUEST link (patients join
// with no extra rights). When a clinician opens their session, we upgrade it to
// a HOST link for the SAME room — that's what surfaces the elective Record
// button in the meet app. Signed with the shared MEET_LINK_SECRET (HS256,
// jose-verifiable by the meet app), matching Ops Hub's generator.

const MEET_BASE_URL = process.env.MEET_BASE_URL ?? 'https://meet.sapphireclinicseast.org'
const b64url = (i: string | Buffer) => Buffer.from(i).toString('base64url')

function signHost(room: string, name: string | undefined, expiresAtSec: number): string {
  const secret = process.env.MEET_LINK_SECRET as string
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ sub: room, name, role: 'host', iat: Math.floor(Date.now() / 1000), exp: expiresAtSec }),
  )
  const data = `${header}.${payload}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
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
