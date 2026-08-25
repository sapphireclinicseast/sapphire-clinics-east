import { NextRequest, NextResponse } from 'next/server'
import { StreamOutput, StreamProtocol } from 'livekit-server-sdk'
import { verifyMeetLink } from '@/lib/meet-link'
import { egressClient, youtubeConfig } from '@/lib/egress'
import { roomServiceClient, getHostIdentity } from '@/lib/livekit-room'

// POST { room, t: <signed link token>, identity: <caller's own LiveKit
// identity> } — host only. Starts (or reattaches to, if already running for
// this room) a RoomCompositeEgress streamed to the org's persistent YouTube
// stream key.
export async function POST(req: NextRequest) {
  const egress = egressClient()
  if (!egress) return NextResponse.json({ error: 'LiveKit is not configured.' }, { status: 500 })

  const yt = youtubeConfig()
  if (!yt) return NextResponse.json({ error: 'YouTube broadcasting is not configured yet.' }, { status: 500 })

  let body: { room?: string; t?: string; identity?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const claims = await verifyMeetLink((body.room ?? '').trim(), (body.t ?? '').trim())
  if (!claims) return NextResponse.json({ error: 'This meeting link is invalid or has expired.' }, { status: 403 })

  // Host capability can move via transfer (see api/host/transfer) — the
  // room's current hostIdentity, when set, is the source of truth over the
  // static role on this caller's own link.
  let isHost = claims.role === 'host'
  const rc = roomServiceClient()
  if (rc) {
    try {
      const currentHost = await getHostIdentity(rc, claims.room)
      if (currentHost) isHost = (body.identity ?? '').trim() === currentHost
    } catch (e) {
      console.error('[egress/start] host-identity check failed', e)
    }
  }
  if (!isHost) return NextResponse.json({ error: 'Only the host can start a broadcast.' }, { status: 403 })

  try {
    // Reuse an already-running broadcast for this room rather than starting a
    // second one — e.g. the host refreshed mid-broadcast, or clicked twice.
    const existing = await egress.listEgress({ roomName: claims.room, active: true })
    const already = existing.find((e) => e.streamResults && e.streamResults.length > 0)
    if (already) return NextResponse.json({ egressId: already.egressId, watchUrl: yt.watchUrl })

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${yt.streamKey}`
    const output = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [rtmpUrl] })
    const info = await egress.startRoomCompositeEgress(claims.room, output)
    return NextResponse.json({ egressId: info.egressId, watchUrl: yt.watchUrl })
  } catch (e) {
    console.error('[egress/start]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start the broadcast.' }, { status: 500 })
  }
}
