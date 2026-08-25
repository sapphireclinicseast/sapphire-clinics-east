import { NextRequest, NextResponse } from 'next/server'
import { verifyMeetLink } from '@/lib/meet-link'
import { roomServiceClient, getHostIdentity } from '@/lib/livekit-room'

// POST { room, t: <signed link token>, identity: <caller's own LiveKit
// identity>, toIdentity: <target participant's identity> }
//
// Lets the current host hand off host capability (Record + Broadcast) to
// another connected participant — e.g. because they need to leave the
// meeting. Authorization is identity-based, not link-based: whoever
// currently holds the room's hostIdentity can transfer it onward, even if
// they originally joined on a guest link and only became host via an
// earlier transfer. The very first transfer is authorized by the
// join-time role instead, since no hostIdentity exists yet at that point.
export async function POST(req: NextRequest) {
  const rc = roomServiceClient()
  if (!rc) return NextResponse.json({ error: 'LiveKit is not configured.' }, { status: 500 })

  let body: { room?: string; t?: string; identity?: string; toIdentity?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const room = (body.room ?? '').trim()
  const identity = (body.identity ?? '').trim()
  const toIdentity = (body.toIdentity ?? '').trim()

  const claims = await verifyMeetLink(room, (body.t ?? '').trim())
  if (!claims) return NextResponse.json({ error: 'This meeting link is invalid or has expired.' }, { status: 403 })
  if (!identity || !toIdentity) return NextResponse.json({ error: 'Missing participant identity.' }, { status: 400 })
  if (identity === toIdentity) return NextResponse.json({ error: "That's already you." }, { status: 400 })

  try {
    const currentHost = await getHostIdentity(rc, claims.room)
    const authorized = currentHost ? identity === currentHost : claims.role === 'host'
    if (!authorized) {
      return NextResponse.json({ error: 'Only the current host can transfer host.' }, { status: 403 })
    }

    // Confirm the target is actually still in the meeting — don't hand host
    // to someone who's already left.
    const participants = await rc.listParticipants(claims.room)
    const target = participants.find((p) => p.identity === toIdentity)
    if (!target) {
      return NextResponse.json({ error: 'That participant is no longer in the meeting.' }, { status: 400 })
    }

    await rc.updateRoomMetadata(claims.room, JSON.stringify({ hostIdentity: toIdentity }))
    return NextResponse.json({ ok: true, hostIdentity: toIdentity, hostName: target.name || undefined })
  } catch (e) {
    console.error('[host/transfer]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not transfer host.' }, { status: 500 })
  }
}
