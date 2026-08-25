'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  useRoomContext,
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
  const [savedOnLeave, setSavedOnLeave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const recorder = useRecorder()

  // Warn before closing/refreshing the tab while recording — closing kills the
  // recorder before the file can be written, so this is the only safety net for
  // that path. (Leaving via the in-room Leave button is handled by auto-save.)
  useEffect(() => {
    if (!recorder.recording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [recorder.recording])

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

  // If they leave the room while still recording, save the recording rather
  // than losing it.
  const handleDisconnected = useCallback(() => {
    if (recorder.isRecording()) { recorder.stop(); setSavedOnLeave(true) }
    setEnded(true)
  }, [recorder])

  if (ended) {
    return (
      <div className="screen">
        <div className="card">
          <img className="brand-logo" src="/aura-health-rehab.png" alt="Aura Health Rehab" />
          <h1>You’ve left the meeting</h1>
          {savedOnLeave && (
            <p style={{ background: '#eef5f2', border: '1px solid #d7e6e0', borderRadius: 10, padding: '10px 12px', color: '#2c6a4e', fontWeight: 600 }}>
              ⬇ You were still recording — your recording has been saved to this device.
            </p>
          )}
          <p>Thanks for joining. You can close this tab, or rejoin using your meeting link if your session is still ongoing.</p>
          <button className="lk-button" style={{ marginTop: 16 }} onClick={() => { setEnded(false); setSavedOnLeave(false); setConn(null) }}>
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
          onDisconnected={handleDisconnected}
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
          <MeetToolbar
            showBoard={showBoard}
            onToggleBoard={() => setShowBoard((v) => !v)}
            isHost={role === 'host'}
            recorder={recorder}
          />
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

// Top toolbar (inside the room): whiteboard toggle, elective host recording,
// and a Leave button that warns if a recording is still running.
function MeetToolbar({
  showBoard, onToggleBoard, isHost, recorder,
}: {
  showBoard: boolean
  onToggleBoard: () => void
  isHost: boolean
  recorder: Recorder
}) {
  const room = useRoomContext()
  const [recording, setRecording] = useState(recorder.isRecording())
  useEffect(() => recorder.subscribe(setRecording), [recorder])

  const leave = () => {
    if (recording) {
      const ok = window.confirm(
        'You’re still recording.\n\nPlease click “Stop recording” first so the recording saves. If you leave now, we’ll stop and save it to this device.',
      )
      if (!ok) return
      recorder.stop()
    }
    room.disconnect()
  }

  return (
    <div className="meet-toolbar">
      <button className={`meet-tool${showBoard ? ' on' : ''}`} onClick={onToggleBoard}>
        {showBoard ? '✕ Whiteboard' : '✎ Whiteboard'}
      </button>
      {isHost && (
        recording
          ? <button className="meet-tool rec-on" onClick={recorder.stop}>■ Stop recording</button>
          : <button className="meet-tool" onClick={recorder.start}>● Record</button>
      )}
      <button className="meet-tool leave" onClick={leave}>Leave</button>
    </div>
  )
}

// ── Recorder: elective, clinician-only, client-side capture of the tab
// (video + mic), downloaded as .webm when stopped. Exposes a tiny subscribe
// API so both the toolbar and RoomClient can react to recording state.
interface Recorder {
  start: () => void
  stop: () => void
  isRecording: () => boolean
  recording: boolean
  subscribe: (cb: (r: boolean) => void) => () => void
}

function useRecorder(): Recorder {
  const [recording, setRecording] = useState(false)
  const recordingRef = useRef(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const cleanupRef = useRef<() => void>(() => {})
  const subsRef = useRef<Set<(r: boolean) => void>>(new Set())

  const setRec = useCallback((v: boolean) => {
    recordingRef.current = v
    setRecording(v)
    subsRef.current.forEach((cb) => cb(v))
  }, [])

  const start = useCallback(async () => {
    const ok = window.confirm(
      'Start recording this session?\n\nMake sure the patient has given consent. The recording will download to THIS device when you stop.',
    )
    if (!ok) return
    try {
      const display = await navigator.mediaDevices.getDisplayMedia(
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

      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
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
        setRec(false)
      }
      cleanupRef.current = () => {
        display.getTracks().forEach((t) => t.stop())
        mic?.getTracks().forEach((t) => t.stop())
        ac.close().catch(() => {})
      }
      display.getVideoTracks()[0].addEventListener('ended', () => {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
      })
      rec.start(1000)
      recRef.current = rec
      setRec(true)
    } catch (e) {
      if ((e as Error)?.name !== 'NotAllowedError') {
        alert('Could not start recording: ' + ((e as Error)?.message ?? 'unknown error'))
      }
    }
  }, [setRec])

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
  }, [])

  const isRecording = useCallback(() => recordingRef.current, [])
  const subscribe = useCallback((cb: (r: boolean) => void) => {
    subsRef.current.add(cb)
    return () => { subsRef.current.delete(cb) }
  }, [])

  return { start, stop, isRecording, recording, subscribe }
}
