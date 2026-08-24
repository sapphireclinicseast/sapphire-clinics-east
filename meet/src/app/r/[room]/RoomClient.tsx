'use client'

import { useCallback, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  type LocalUserChoices,
} from '@livekit/components-react'

interface Connection {
  token: string
  url: string
  choices: LocalUserChoices
}

export default function RoomClient({
  linkToken,
  defaultName,
}: {
  linkToken: string
  defaultName: string
}) {
  const [conn, setConn] = useState<Connection | null>(null)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const onJoin = useCallback(
    async (choices: LocalUserChoices) => {
      setJoining(true)
      setError(null)
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ t: linkToken, name: choices.username }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Could not join the meeting.')
        setConn({ token: data.token, url: data.url, choices })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not join the meeting.')
      } finally {
        setJoining(false)
      }
    },
    [linkToken],
  )

  if (ended) {
    return (
      <div className="screen">
        <div className="card">
          <div className="brandbar"><span className="dot" /> Sapphire Clinics East</div>
          <h1>You’ve left the meeting</h1>
          <p>Thanks for joining. You can close this tab, or rejoin using your meeting link if your session is still ongoing.</p>
          <button className="lk-button" style={{ marginTop: 16 }} onClick={() => { setEnded(false); setConn(null) }}>
            Rejoin
          </button>
        </div>
      </div>
    )
  }

  if (conn) {
    return (
      <div className="lk-room-container" data-lk-theme="default">
        <LiveKitRoom
          token={conn.token}
          serverUrl={conn.url}
          connect
          video={conn.choices.videoEnabled}
          audio={conn.choices.audioEnabled}
          onDisconnected={() => setEnded(true)}
          onError={(e) => setError(e.message)}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="brandbar"><span className="dot" /> Sapphire Clinics East</div>
        <h1>Join your session</h1>
        <p style={{ marginBottom: 16 }}>Check your camera and microphone, then join.</p>
        {error && (
          <p style={{ color: '#b3261e', marginBottom: 12 }}>{error}</p>
        )}
        <div data-lk-theme="default" style={{ borderRadius: 12, overflow: 'hidden' }}>
          <PreJoin
            defaults={{ username: defaultName, videoEnabled: true, audioEnabled: true }}
            onSubmit={onJoin}
            onError={(e) => setError(e.message)}
            joinLabel={joining ? 'Joining…' : 'Join session'}
          />
        </div>
      </div>
    </div>
  )
}
