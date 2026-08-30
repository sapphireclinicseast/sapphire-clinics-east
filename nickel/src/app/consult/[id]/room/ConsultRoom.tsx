'use client'

import '@livekit/components-styles'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import { useEffect, useState } from 'react'

interface Conn { token: string; url: string }

// Nickel teleconsult room — connects to Nickel's own LiveKit project using a
// short-lived token minted server-side (see /api/consult/[id]/token).
export default function ConsultRoom({ consultId }: { consultId: string }) {
  const [conn, setConn] = useState<Conn | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/consult/${consultId}/token`)
      .then((r) => r.json())
      .then((d) => { if (d.token && d.url) setConn({ token: d.token, url: d.url }); else setErr(d.error ?? 'Could not join the room.') })
      .catch(() => setErr('Could not connect. Check your internet and try again.'))
  }, [consultId])

  if (err) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: '#0b1b2b', color: '#fff', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 360 }}>
        <p style={{ fontSize: 15, lineHeight: 1.5 }}>{err}</p>
        <a href="/bookings" style={{ display: 'inline-block', marginTop: 16, background: '#fff', color: '#1e4b7d', borderRadius: 12, padding: '10px 20px', fontWeight: 600, textDecoration: 'none' }}>Back</a>
      </div>
    </div>
  )
  if (!conn) return <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: '#0b1b2b', color: '#fff' }}>Connecting to your teleconsult…</div>

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0b1b2b' }} data-lk-theme="default">
      <LiveKitRoom token={conn.token} serverUrl={conn.url} connect audio video onDisconnected={() => { window.location.href = '/bookings' }}>
        <VideoConference />
      </LiveKitRoom>
    </div>
  )
}
