import { verifyMeetLink } from '@/lib/meet-link'
import RoomClient from './RoomClient'

// The join page. `t` (the signed link token) carries the room + name/role +
// expiry; we verify it up front so an invalid/expired link shows a friendly
// message instead of a broken video screen.
export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ room: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { room } = await params
  const { t } = await searchParams
  const claims = t ? await verifyMeetLink(room, t) : null

  if (!t || !claims) {
    return (
      <div className="screen">
        <div className="card">
          <img className="brand-logo" src="/aura-health-rehab.png" alt="Aura Health Rehab" />
          <h1>This link isn’t valid</h1>
          <p>Your meeting link is invalid or has expired. Please use the latest link from your appointment reminder, or contact your clinic.</p>
        </div>
      </div>
    )
  }

  // Broadcasting is offered only when the server has YouTube configured AND
  // this specific link is broadcast-capable (HR seminars/trainings). Clinical
  // sessions and HR meetings get host/record but never the Broadcast button.
  const youtubeConfigured = !!(process.env.YOUTUBE_STREAM_KEY && process.env.YOUTUBE_WATCH_URL)
  const canBroadcast = youtubeConfigured && claims.canBroadcast === true

  return <RoomClient room={room} linkToken={t} defaultName={claims.name ?? ''} role={claims.role ?? 'guest'} youtubeConfigured={canBroadcast} />
}
