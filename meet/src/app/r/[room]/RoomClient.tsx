'use client'

import { useCallback, useRef, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  type LocalUserChoices,
} from '@livekit/components-react'
import Whiteboard from './Whiteboard'

interface Connection {
  token: string
  url: string
  choices: LocalUserChoices
}

export default function RoomClient({
  linkToken,
  room,
  defaultName,
  role,
}: {
  linkToken: string
  room: string
  defaultName: string
  role: 'host' | 'guest'
}) {
  const [conn, setConn] = useState<Connection | null>(null)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [showBoard, setShowBoard] = useState(false)

  const onJoin = useCallback(
    async (choices: LocalUserChoices) => {
      setJoining(true)
      setError(null)
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ t: linkToken, name: choices.username, room }),
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
    [linkToken, room],
  )

  if (ended) {
    return (
      <div className="screen">
        <div className="card">
          <img className="brand-logo" src="/aura-health-rehab.png" alt="Aura Health Rehab" />
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
          style={{ height: '100dvh' }}
        >
          <div className="room-split">
            <div className="video-pane">
              <VideoConference />
            </div>
            {showBoard && (
              <div className="board-pane">
                <Whiteboard />
              </div>
            )}
          </div>

          <div className="meet-toolbar">
            <button
              className={`meet-tool${showBoard ? ' on' : ''}`}
              onClick={() => setShowBoard((v) => !v)}
            >
              {showBoard ? '✕ Whiteboard' : '✎ Whiteboard'}
            </button>
            {role === 'host' && <RecordButton />}
          </div>
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="card" style={{ maxWidth: 520 }}>
        <img className="brand-logo" src="/aura-health-rehab.png" alt="Aura Health Rehab" />
        <h1>Join your session</h1>
        <p style={{ marginBottom: 16 }}>Check your camera and microphone, then join.</p>
        {error && <p style={{ color: '#b3261e', marginBottom: 12 }}>{error}</p>}
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

// Elective, clinician-only recording. Client-side capture of the tab (video +
// audio) mixed with the mic, downloaded as a .webm when stopped. Never
// automatic; no server/cloud storage involved.
function RecordButton() {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const cleanupRef = useRef<() => void>(() => {})

  const start = useCallback(async () => {
    const ok = window.confirm(
      'Start recording this session?\n\nMake sure the patient has given consent. The recording will download to THIS device when you stop.',
    )
    if (!ok) return
    try {
      const display = await navigator.mediaDevices.getDisplayMedia(
        // preferCurrentTab is Chromium-only; harmless elsewhere
        { video: { frameRate: 30 }, audio: true, preferCurrentTab: true } as MediaStreamConstraints,
      )
      let mic: MediaStream | null = null
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { /* no mic */ }

      const ac = new AudioContext()
      const dest = ac.createMediaStreamDestination()
      const addAudio = (s: MediaStream | null) => {
        if (s && s.getAudioTracks().length) ac.createMediaStreamSource(s).connect(dest)
      }
      addAudio(display); addAudio(mic)
      const mixed = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()])

      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm'
      const chunks: Blob[] = []
      const rec = new MediaRecorder(mixed, { mimeType: mime })
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        a.href = url
        a.download = `aura-session-${stamp}.webm`
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 15000)
        cleanupRef.current()
        setRecording(false)
      }
      cleanupRef.current = () => {
        display.getTracks().forEach((t) => t.stop())
        mic?.getTracks().forEach((t) => t.stop())
        ac.close().catch(() => {})
      }
      // If the clinician ends the share from the browser UI, stop cleanly.
      display.getVideoTracks()[0].addEventListener('ended', () => {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
      })
      rec.start(1000)
      recRef.current = rec
      setRecording(true)
    } catch (e) {
      if ((e as Error)?.name !== 'NotAllowedError') {
        alert('Could not start recording: ' + ((e as Error)?.message ?? 'unknown error'))
      }
    }
  }, [])

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
  }, [])

  return recording ? (
    <button className="meet-tool rec-on" onClick={stop}>■ Stop recording</button>
  ) : (
    <button className="meet-tool" onClick={start}>● Record</button>
  )
}
