import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { AccessToken } from 'livekit-server-sdk'
import { verifyMeetLink } from '@/lib/meet-link'
import { roomServiceClient, claimHostIfUnset } from '@/lib/livekit-room'

// POST { t: <signed link token>, name?: string }
// Verifies the signed link, then mints a LiveKit access token for that room.
// Each connection gets a fresh unique identity so two people on the same link
// never collide.
export async function POST(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const wsUrl = process.env.LIVEKIT_URL
  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: 'LiveKit is not configured.' }, { status: 500 })
  }

  let body: { room?: string; t?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const room = (body.room ?? '').trim()
  const linkToken = (body.t ?? '').trim()
  if (!room || !linkToken) return NextResponse.json({ error: 'Missing room or link token.' }, { status: 400 })

  const claims = await verifyMeetLink(room, linkToken)
  if (!claims) {
    return NextResponse.json({ error: 'This meeting link is invalid or has expired.' }, { status: 403 })
  }

  const displayName = (body.name ?? claims.name ?? 'Guest').toString().slice(0, 80).trim() || 'Guest'
  const identity = `${claims.role ?? 'guest'}-${randomUUID().slice(0, 8)}`

  const at = new AccessToken(apiKey, apiSecret, { identity, name: displayName, ttl: '3h' })
  at.addGrant({
    roomJoin: true,
    room: claims.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  const token = await at.toJwt()

  // First host-role link to join claims host capability for the room (see
  // livekit-room.ts) — non-fatal if this fails, the call still joins fine.
  if (claims.role === 'host') {
    const rc = roomServiceClient()
    if (rc) await claimHostIfUnset(rc, claims.room, identity)
  }

  return NextResponse.json({ token, url: wsUrl, room: claims.room, name: displayName, identity })
}
