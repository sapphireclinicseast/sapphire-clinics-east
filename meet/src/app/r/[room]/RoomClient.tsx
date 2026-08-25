'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  useRoomContext,
  useRoomInfo,
  useParticipants,
  type LocalUserChoices,
} from '@livekit/components-react'
import Whiteboard from './Whiteboard'

interface BroadcastState {
  active: boolean
  egressId: string | null
  watchUrl: string | null
}

interface Connection {
  token: string
  url: string
  identity: string
  choices: LocalUserChoices
}

export default function RoomClient({
  room,
  linkToken,
  defaultName,
  role,
  youtubeConfigured,
}: {
  room: string
  linkToken: string
  defaultName: string
  role: 'host' | 'guest'
  youtubeConfigured: boolean
}) {
  const [conn, setConn] = useState<Connection | null>(null)
  const [ended, setEnded] = useState(false)
  const [savedOnLeave, setSavedOnLeave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [broadcast, setBroadcast] = useState<BroadcastState>({ active: false, egressId: null, watchUrl: null })
  const recorder = useRecorder()

  // Warn before closing/refreshing the tab while recording — closing kills the
  // recorder before the file can be written, so this is the only safety net for
  // that path. (Leaving via the Leave button is handled by auto-save below.)
  useEffect(() => {
    if (!recorder.recording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [recorder.recording])

  // Poll broadcast status once connected — recovers state after a refresh
  // (host or guest), and picks up a broadcast someone else started/stopped
  // from a different device within ~15s. Everyone sees this, not just the
  // host: the whole point is the watch link being visible in the meeting.
  useEffect(() => {
    if (!conn || !youtubeConfigured) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/egress/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, t: linkToken }),
        })
        const data = await res.json()
        if (!cancelled && res.ok) setBroadcast({ active: !!data.active, egressId: data.egressId ?? null, watchUrl: data.watchUrl ?? null })
      } catch { /* transient — next poll retries */ }
    }
    check()
    const id = setInterval(check, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [conn, room, linkToken, youtubeConfigured])

  const onJoin = useCallback(
    async (choices: LocalUserChoices) => {
      setJoining(true)
      setError(null)
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, t: linkToken, name: choices.username }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Could not join the meeting.')
        setConn({ token: data.token, url: data.url, identity: data.identity, choices })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not join the meeting.')
      } finally {
        setJoining(false)
      }
    },
    [room, linkToken],
  )

  // If they leave the room while still recording, save the recording rather
  // than losing it (handles the Leave button, network drops, and page-hide).
  const handleDisconnected = useCallback(() => {
    if (recorder.isRecording()) { recorder.stop(); setSavedOnLeave(true) }
    setEnded(true)
  }, [recorder])

  if (ended) {
    return (
      <div className="screen">
        <div className="card">
          <img className="brand-logo" src="/aura-health-rehab.png" alt="Aura Health Rehab" />
          <h1>Until next time 🌿</h1>
          {savedOnLeave && (
            <p style={{ background: '#eef5f2', border: '1px solid #d7e6e0', borderRadius: 10, padding: '10px 12px', color: '#2c6a4e', fontWeight: 600 }}>
              ⬇ You were still recording — your recording has been saved to this device.
            </p>
          )}
          <p>Thank you for being here with us. Aura Health is grateful for every moment we share — take good care, and we’ll see you again soon.</p>
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
          {broadcast.active && (
            <div className="broadcast-banner" style={recorder.recording ? { top: 104 } : undefined}>
              🔴 LIVE on YouTube
              {broadcast.watchUrl && (
                <a href={broadcast.watchUrl} target="_blank" rel="noopener noreferrer">Watch: {broadcast.watchUrl}</a>
              )}
            </div>
          )}
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
            recorder={recorder}
            hostProps={{
              room,
              linkToken,
              identity: conn.identity,
              role,
              youtubeConfigured,
              broadcast,
              setBroadcast,
            }}
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

// Top toolbar (inside the room): a drag handle, the whiteboard toggle, the
// host-only controls (Record / Broadcast / Transfer host), and a guarded Leave
// button that saves a still-running recording instead of losing it. It's
// DRAGGABLE (grip handle) so it can be moved off the whiteboard's colour
// swatches. Shows a persistent banner while recording. Must render inside
// <LiveKitRoom> (uses room context).
interface HostProps {
  room: string
  linkToken: string
  identity: string
  role: 'host' | 'guest'
  youtubeConfigured: boolean
  broadcast: BroadcastState
  setBroadcast: (b: BroadcastState) => void
}
function MeetToolbar({
  showBoard,
  onToggleBoard,
  recorder,
  hostProps,
}: {
  showBoard: boolean
  onToggleBoard: () => void
  recorder: Recorder
  hostProps: HostProps
}) {
  const room = useRoomContext()
  const [recording, setRecording] = useState(recorder.isRecording())
  useEffect(() => recorder.subscribe(setRecording), [recorder])

  // Drag-to-move. `pos` is null until the user drags, so it stays centred by
  // default; once dragged we switch to absolute left/top (viewport-clamped).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const grabRef = useRef<{ dx: number; dy: number } | null>(null)

  const onGripDown = (e: React.PointerEvent) => {
    const bar = (e.currentTarget as HTMLElement).parentElement
    if (!bar) return
    const r = bar.getBoundingClientRect()
    grabRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onGripMove = (e: React.PointerEvent) => {
    if (!grabRef.current) return
    const x = e.clientX - grabRef.current.dx
    const y = e.clientY - grabRef.current.dy
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - 80)),
      y: Math.max(4, Math.min(y, window.innerHeight - 48)),
    })
  }
  const onGripUp = () => { grabRef.current = null }

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

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, transform: 'none' }
    : { top: recording ? 52 : 12 }

  return (
    <>
      {recording && (
        <div className="rec-banner">
          <span className="dot" />
          <span>Recording in progress — click <strong>Stop recording</strong> to save it</span>
          <button className="rec-banner-stop" onClick={recorder.stop}>■ Stop &amp; save</button>
        </div>
      )}
      <div className="meet-toolbar" style={style}>
        <span
          className="meet-drag"
          title="Drag to move"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
        >
          ⋮⋮
        </span>
        <button className={`meet-tool${showBoard ? ' on' : ''}`} onClick={onToggleBoard}>
          {showBoard ? '✕ Whiteboard' : '✎ Whiteboard'}
        </button>
        <HostControls {...hostProps} recorder={recorder} />
        <button className="meet-tool leave" onClick={leave}>Leave</button>
      </div>
    </>
  )
}

// Renders the host-only toolbar controls (Record, Broadcast, Transfer Host).
// "Host" here is dynamic, not just whoever's own link says role==='host':
// it's whoever's identity matches the room's live hostIdentity metadata,
// which starts as the join-time role and can move via Transfer Host. Must
// render inside <LiveKitRoom> — useRoomInfo/useParticipants need room context.
function HostControls({
  room,
  linkToken,
  identity,
  role,
  youtubeConfigured,
  broadcast,
  setBroadcast,
  recorder,
}: HostProps & { recorder: Recorder }) {
  const { metadata } = useRoomInfo()
  const participants = useParticipants()

  let hostIdentity: string | undefined
  if (metadata) {
    try {
      hostIdentity = JSON.parse(metadata)?.hostIdentity
    } catch { /* ignore malformed metadata */ }
  }
  // Before the room's metadata has synced yet (first tick after connecting),
  // fall back to the join-time role so the host isn't briefly missing their
  // own controls.
  const isHost = hostIdentity ? identity === hostIdentity : role === 'host'

  if (!isHost) return null

  return (
    <>
      <RecordButton recorder={recorder} />
      {youtubeConfigured && (
        <BroadcastButton room={room} linkToken={linkToken} identity={identity} broadcast={broadcast} setBroadcast={setBroadcast} />
      )}
      <TransferHostButton room={room} linkToken={linkToken} identity={identity} participants={participants} />
    </>
  )
}

// Elective, clinician-only recording button. The actual capture lives in the
// shared useRecorder() hook (lifted to RoomClient) so the recording banner,
// the tab-close warning, and save-on-leave can all see the same state.
function RecordButton({ recorder }: { recorder: Recorder }) {
  const [recording, setRecording] = useState(recorder.isRecording())
  useEffect(() => recorder.subscribe(setRecording), [recorder])
  return recording ? (
    <button className="meet-tool rec-on" onClick={recorder.stop}>■ Stop recording</button>
  ) : (
    <button className="meet-tool" onClick={recorder.start}>● Record</button>
  )
}

// Host-only. Pushes the room to the org's persistent YouTube stream key via
// LiveKit Cloud's Egress service (server-side, not a client-side capture —
// unlike Record above, this runs whether or not the host's own tab stays
// open). The watch link is fixed (same one every time — see YOUTUBE_WATCH_URL
// in the join app's env) and shown to everyone in the room, not just here.
function BroadcastButton({
  room,
  linkToken,
  identity,
  broadcast,
  setBroadcast,
}: {
  room: string
  linkToken: string
  identity: string
  broadcast: BroadcastState
  setBroadcast: (b: BroadcastState) => void
}) {
  const [busy, setBusy] = useState(false)

  const start = useCallback(async () => {
    const ok = window.confirm('Start broadcasting this session to YouTube?\n\nMake sure attendees/patients have given consent — this goes out publicly on the channel\'s live stream.')
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch('/api/egress/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, t: linkToken, identity }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Could not start the broadcast.')
      setBroadcast({ active: true, egressId: data.egressId, watchUrl: data.watchUrl })
    } catch (e) {
      alert('Could not start broadcast: ' + (e instanceof Error ? e.message : 'unknown error'))
    } finally {
      setBusy(false)
    }
  }, [room, linkToken, identity, setBroadcast])

  const stop = useCallback(async () => {
    if (!broadcast.egressId) return
    setBusy(true)
    try {
      const res = await fetch('/api/egress/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, t: linkToken, identity, egressId: broadcast.egressId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Could not stop the broadcast.')
      setBroadcast({ active: false, egressId: null, watchUrl: null })
    } catch (e) {
      alert('Could not stop broadcast: ' + (e instanceof Error ? e.message : 'unknown error'))
    } finally {
      setBusy(false)
    }
  }, [room, linkToken, identity, broadcast.egressId, setBroadcast])

  return broadcast.active ? (
    <button className="meet-tool rec-on" onClick={stop} disabled={busy}>■ Stop broadcast</button>
  ) : (
    <button className="meet-tool" onClick={start} disabled={busy}>📺 Broadcast to YouTube</button>
  )
}

// Host-only. Hands host capability (Record + Broadcast) to another
// currently-connected participant — for when the host needs to step out or
// leave the meeting but wants someone else able to keep recording/
// broadcasting. Takes effect immediately for everyone: the outgoing host's
// buttons disappear and the new host's appear, live, via room metadata.
function TransferHostButton({
  room,
  linkToken,
  identity,
  participants,
}: {
  room: string
  linkToken: string
  identity: string
  participants: ReturnType<typeof useParticipants>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const others = participants.filter((p) => p.identity !== identity)

  const transfer = useCallback(
    async (toIdentity: string, label: string) => {
      const ok = window.confirm(`Make "${label}" the host?\n\nThey'll be able to record and broadcast; you'll lose those controls.`)
      if (!ok) return
      setBusy(true)
      try {
        const res = await fetch('/api/host/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, t: linkToken, identity, toIdentity }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Could not transfer host.')
        setOpen(false)
      } catch (e) {
        alert('Could not transfer host: ' + (e instanceof Error ? e.message : 'unknown error'))
      } finally {
        setBusy(false)
      }
    },
    [room, linkToken, identity],
  )

  return (
    <div className="host-transfer">
      <button className="meet-tool" onClick={() => setOpen((v) => !v)} disabled={busy}>
        🔁 Transfer host
      </button>
      {open && (
        <div className="host-transfer-menu">
          {others.length === 0 ? (
            <p className="host-transfer-empty">No one else is in the meeting yet.</p>
          ) : (
            others.map((p) => (
              <button
                key={p.identity}
                className="host-transfer-item"
                onClick={() => transfer(p.identity, p.name || 'this participant')}
                disabled={busy}
              >
                {p.name || 'Unnamed participant'}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Recorder: elective, clinician-only, client-side capture of the tab
// (video + mic), downloaded as .webm when stopped. Lifted to a hook with a
// tiny subscribe API so the toolbar button, the recording banner, the
// tab-close warning, and save-on-leave all observe the same state.
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
