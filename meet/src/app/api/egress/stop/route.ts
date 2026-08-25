import { NextRequest, NextResponse } from 'next/server'
import { verifyMeetLink } from '@/lib/meet-link'
import { egressClient } from '@/lib/egress'
import { roomServiceClient, getHostIdentity } from '@/lib/livekit-room'

// POST { room, t: <signed link token>, identity: <caller's own LiveKit
// identity>, egressId: string } — host only.
export async function POST(req: NextRequest) {
  const egress = egressClient()
  if (!egress) return NextResponse.json({ error: 'LiveKit is not configured.' }, { status: 500 })

  let body: { room?: string; t?: string; identity?: string; egressId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const claims = await verifyMeetLink((body.room ?? '').trim(), (body.t ?? '').trim())
  if (!claims) return NextResponse.json({ error: 'This meeting link is invalid or has expired.' }, { status: 403 })

  let isHost = claims.role === 'host'
  const rc = roomServiceClient()
  if (rc) {
    try {
      const currentHost = await getHostIdentity(rc, claims.room)
      if (currentHost) isHost = (body.identity ?? '').trim() === currentHost
    } catch (e) {
      console.error('[egress/stop] host-identity check failed', e)
    }
  }
  if (!isHost) return NextResponse.json({ error: 'Only the host can stop the broadcast.' }, { status: 403 })
  if (!body.egressId) return NextResponse.json({ error: 'Missing egress id.' }, { status: 400 })

  try {
    await egress.stopEgress(body.egressId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[egress/stop]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not stop the broadcast.' }, { status: 500 })
  }
}
