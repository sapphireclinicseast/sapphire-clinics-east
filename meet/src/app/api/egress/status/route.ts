import { NextRequest, NextResponse } from 'next/server'
import { verifyMeetLink } from '@/lib/meet-link'
import { egressClient, youtubeConfig } from '@/lib/egress'

// POST { t: <signed link token> } — any role. Lets everyone in the room
// (not just the host) see the "we're live" banner + watch link, and lets a
// host who refreshed mid-broadcast recover the egressId to stop it later.
export async function POST(req: NextRequest) {
  const egress = egressClient()
  if (!egress) return NextResponse.json({ active: false })

  let body: { room?: string; t?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const claims = await verifyMeetLink((body.room ?? '').trim(), (body.t ?? '').trim())
  if (!claims) return NextResponse.json({ error: 'This meeting link is invalid or has expired.' }, { status: 403 })

  const yt = youtubeConfig()
  try {
    // Any non-terminal egress for the room means we're live. Don't gate on
    // streamResults being populated — it's empty for the first few seconds
    // while the RTMP stream connects, which previously suppressed the "live"
    // banner and the host's Stop button.
    const existing = await egress.listEgress({ roomName: claims.room, active: true })
    const active = existing[0]
    return NextResponse.json({
      active: !!active,
      egressId: active?.egressId ?? null,
      watchUrl: active && yt ? yt.watchUrl : null,
    })
  } catch (e) {
    console.error('[egress/status]', e)
    return NextResponse.json({ active: false })
  }
}
