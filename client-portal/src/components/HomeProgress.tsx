'use client'

// "Home Progress" — parents/patients log progress at home: pick a date, add
// remarks, and attach voice / video / photo (record directly or upload).
// Multiple files per entry, uploaded one-by-one with a % progress indicator.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  listHomeProgress,
  createHomeProgressEntry,
  uploadHomeProgressFile,
  deleteHomeProgressEntry,
  homeProgressFileUrl,
  type HomeProgressEntryRow,
} from '@/lib/api'
import {
  DashCard, Banner, EmptyState, RowsSkeleton, Tag, Icon,
  CONTROL, CONTROL_STYLE, TEXTAREA, LABEL, LABEL_STYLE, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER_GHOST,
  PRIMARY_STYLE, SECONDARY_STYLE, CARD_STYLE, SUBTLE_BG, MODAL_BACKDROP, DANGER, FOCUS,
} from '@/components/hub/ui'

type Kind = 'AUDIO' | 'VIDEO' | 'PHOTO'
interface PendingFile { id: string; kind: Kind; blob: Blob; name: string; url: string }

let counter = 0
const uid = () => `pf-${Date.now()}-${counter++}`

function todayStr() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function HomeProgressSection({ token }: { token: string }) {
  const [entries, setEntries] = useState<HomeProgressEntryRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(() => {
    setErr(null)
    listHomeProgress(token).then((d) => setEntries(d.entries)).catch((e) => setErr((e as Error).message))
  }, [token])
  useEffect(() => { load() }, [load])

  return (
    <DashCard
      title="Home Progress"
      description="Record or upload your child's progress at home — voice, video, or photos. These are shared with your therapist's portal so they can follow your child's progress at home between sessions."
      icon={<Icon name="image" size={16} />}
      action={
        <button onClick={() => setShowForm(true)} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
          <Icon name="plus" size={14} /> Add progress
        </button>
      }
      flush={entries == null || entries.length === 0}
    >
      {err && <div className={entries && entries.length ? 'mb-4' : 'px-4 sm:px-5 pt-4'}><Banner tone="error">{err}</Banner></div>}

      {entries == null ? (
        <RowsSkeleton rows={3} label="Loading home progress" />
      ) : entries.length === 0 ? (
        <EmptyState icon="image" title="No entries yet" hint="Tap “Add progress” to upload your first." />
      ) : (
        <div className="space-y-3">
          {entries.map((e) => <EntryCard key={e.id} entry={e} token={token} onDeleted={load} />)}
        </div>
      )}

      {showForm && <AddEntryModal token={token} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </DashCard>
  )
}

function EntryCard({ entry, token, onDeleted }: { entry: HomeProgressEntryRow; token: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!confirm('Delete this progress entry and its files?')) return
    setBusy(true)
    try { await deleteHomeProgressEntry(token, entry.id); onDeleted() }
    catch { setBusy(false) }
  }
  return (
    <div className="rounded-xl p-4 min-w-0" style={CARD_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
          <Icon name="calendar" size={14} style={{ color: 'var(--teal)' }} />
          {fmtDate(entry.date)}
        </div>
        <button onClick={del} disabled={busy} className={BTN_DANGER_GHOST} style={{ color: DANGER }}>
          <Icon name="trash" size={12} /> Delete
        </button>
      </div>
      {entry.remarks && <p className="text-sm mt-1.5 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--mid-gray)' }}>{entry.remarks}</p>}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entry.files.map((f) => {
          const src = homeProgressFileUrl(f.id, token)
          return (
            <div key={f.id} className="rounded-lg overflow-hidden min-w-0" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              {f.kind === 'PHOTO' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={f.fileName} className="w-full max-h-56 object-cover" /></a>
              ) : f.kind === 'VIDEO' ? (
                <video src={src} controls className="w-full max-h-56 bg-black" />
              ) : (
                <audio src={src} controls className="w-full" />
              )}
              <div className="px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2" style={{ color: 'var(--mid-gray)' }}>
                <Tag tone="brand">{f.kind === 'AUDIO' ? 'Voice' : f.kind === 'VIDEO' ? 'Video' : 'Photo'}</Tag>
                <span className="shrink-0 tabular-nums">{fmtSize(f.sizeBytes)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddEntryModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(todayStr())
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [recorder, setRecorder] = useState<Kind | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const uploadInput = useRef<HTMLInputElement | null>(null)

  const addFiles = (list: PendingFile[]) => setFiles((f) => [...f, ...list])
  const removeFile = (id: string) => setFiles((f) => {
    const g = f.find((x) => x.id === id); if (g) URL.revokeObjectURL(g.url)
    return f.filter((x) => x.id !== id)
  })

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    const mapped = picked.map((file): PendingFile => {
      const kind: Kind = file.type.startsWith('audio/') ? 'AUDIO' : file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO'
      return { id: uid(), kind, blob: file, name: file.name, url: URL.createObjectURL(file) }
    }).filter((f) => f.blob.type.startsWith('audio/') || f.blob.type.startsWith('video/') || f.blob.type.startsWith('image/'))
    addFiles(mapped)
    e.target.value = ''
  }

  async function submit() {
    if (files.length === 0) { setErr('Add at least one recording or file.'); return }
    for (const f of files) {
      if (f.blob.size > 18 * 1024 * 1024) { setErr(`"${f.name}" is over 18 MB. Please record a shorter clip or upload a smaller file.`); return }
    }
    setUploading(true); setErr(null); setProgress(0)
    try {
      const { entryId } = await createHomeProgressEntry(token, date, remarks)
      const total = files.length
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        await uploadHomeProgressFile(token, entryId, f.kind, f.blob, f.name, (pct) => {
          setProgress(Math.round(((i + pct / 100) / total) * 100))
        })
      }
      files.forEach((f) => URL.revokeObjectURL(f.url))
      onSaved()
    } catch (e) { setErr((e as Error).message); setUploading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={MODAL_BACKDROP} onClick={uploading ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-progress-title" className="bg-white w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Home Progress</p>
            <h2 id="add-progress-title" className="text-[15px] font-bold leading-tight tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Add Home Progress</h2>
          </div>
          <button onClick={onClose} disabled={uploading} aria-label="Close" className={`w-8 h-8 -mr-1.5 -mt-1 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] disabled:opacity-40 ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} disabled={uploading} />
          </label>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Remarks</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE} placeholder="e.g. Practiced the /s/ sound at home — much clearer today." disabled={uploading} />
          </label>

          <div>
            <span className={LABEL} style={LABEL_STYLE}>Attachments</span>
            <div className="grid grid-cols-2 gap-2.5">
              <AttachBtn label="Record voice" icon={<IconMic />} onClick={() => setRecorder('AUDIO')} disabled={uploading} />
              <AttachBtn label="Record video" icon={<IconVideo />} onClick={() => setRecorder('VIDEO')} disabled={uploading} />
              <AttachBtn label="Take photo" icon={<IconCamera />} onClick={() => setRecorder('PHOTO')} disabled={uploading} />
              <AttachBtn label="Upload files" icon={<IconPaperclip />} onClick={() => uploadInput.current?.click()} disabled={uploading} />
              <input ref={uploadInput} type="file" accept="audio/*,video/*,image/*" multiple className="hidden" onChange={onUpload} />
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>Up to 18 MB per file.</p>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg p-2" style={CARD_STYLE}>
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                    {f.kind === 'PHOTO' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="w-full h-full object-cover" />
                    ) : f.kind === 'AUDIO' ? <IconMic /> : <IconVideo />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate" style={{ color: 'var(--charcoal)' }}>{f.name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{f.kind.toLowerCase()} · {fmtSize(f.blob.size)}</div>
                  </div>
                  {!uploading && (
                    <button onClick={() => removeFile(f.id)} className={`w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-red-50 shrink-0 ${FOCUS}`} style={{ color: 'var(--mid-gray)' }} aria-label="Remove">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {err && <Banner tone="error">{err}</Banner>}

          {uploading ? (
            <div role="status">
              <div className="flex items-center justify-between text-xs font-semibold mb-1 tabular-nums" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--pale-teal)' }}>
                <div className="h-full transition-[width] duration-200" style={{ width: `${progress}%`, background: 'var(--teal)' }} />
              </div>
            </div>
          ) : (
            <button onClick={submit} className={`${BTN_PRIMARY} w-full`} style={PRIMARY_STYLE}>Save progress</button>
          )}
        </div>
      </div>

      {recorder && <RecorderOverlay mode={recorder} onCancel={() => setRecorder(null)} onDone={(pf) => { addFiles([pf]); setRecorder(null) }} />}
    </div>,
    document.body,
  )
}

const svgProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
function IconMic() { return <svg {...svgProps}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg> }
function IconVideo() { return <svg {...svgProps}><path d="m16 10 4.55-2.28A1 1 0 0 1 22 8.62v6.76a1 1 0 0 1-1.45.9L16 14"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg> }
function IconCamera() { return <svg {...svgProps}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg> }
function IconPaperclip() { return <svg {...svgProps}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> }

function AttachBtn({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
      {icon}<span className="truncate">{label}</span>
    </button>
  )
}

// ── In-browser recorder (getUserMedia + MediaRecorder) ───────────────────────
function RecorderOverlay({ mode, onCancel, onDone }: { mode: Kind; onCancel: () => void; onDone: (f: PendingFile) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [ready, setReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    const constraints: MediaStreamConstraints = mode === 'AUDIO' ? { audio: true } : { video: { facingMode: 'user' }, audio: mode === 'VIDEO' }
    navigator.mediaDevices?.getUserMedia(constraints)
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current && mode !== 'AUDIO') { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
        setReady(true)
      })
      .catch(() => { if (!cancelled) setErr('Could not access your camera/microphone. Please allow permission, or use “Upload files” instead.') })
    return () => { cancelled = true; stopStream() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  function pickMime(): string {
    const cands = mode === 'AUDIO'
      ? ['audio/webm', 'audio/mp4', 'audio/ogg']
      : ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
    for (const c of cands) { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c }
    return ''
  }

  function start() {
    if (!streamRef.current) return
    chunksRef.current = []
    const mime = pickMime()
    try {
      const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined)
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        const type = rec.mimeType || (mode === 'AUDIO' ? 'audio/webm' : 'video/webm')
        const blob = new Blob(chunksRef.current, { type })
        const ext = type.includes('mp4') ? (mode === 'AUDIO' ? 'm4a' : 'mp4') : type.includes('ogg') ? 'ogg' : 'webm'
        stopStream()
        onDone({ id: uid(), kind: mode, blob, name: `${mode.toLowerCase()}-${todayStr()}.${ext}`, url: URL.createObjectURL(blob) })
      }
      recRef.current = rec
      rec.start()
      setRecording(true); setSeconds(0)
    } catch { setErr('Recording is not supported on this browser. Please use “Upload files”.') }
  }

  function stop() { recRef.current?.stop(); setRecording(false) }

  function capturePhoto() {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      stopStream()
      onDone({ id: uid(), kind: 'PHOTO', blob, name: `photo-${todayStr()}.jpg`, url: URL.createObjectURL(blob) })
    }, 'image/jpeg', 0.9)
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => { stopStream(); onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="recorder-title" className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <h2 id="recorder-title" className="text-[15px] font-bold leading-tight tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{mode === 'AUDIO' ? 'Record voice' : mode === 'VIDEO' ? 'Record video' : 'Take photo'}</h2>
          <button onClick={() => { stopStream(); onCancel() }} aria-label="Close" className={`w-8 h-8 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-4 sm:p-5">
          {err ? (
            <Banner tone="error">{err}</Banner>
          ) : (
            <>
              {mode === 'AUDIO' ? (
                <div className="py-8 text-center">
                  <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${recording ? 'animate-pulse' : ''}`} style={{ background: recording ? '#FEF2F2' : 'var(--pale-teal)', color: recording ? DANGER : 'var(--deep-teal)' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                  </div>
                  <div className="mt-3 text-2xl font-bold tabular-nums" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{mm}:{ss}</div>
                  {recording && <p className="text-xs mt-1" style={{ color: DANGER }}>Recording…</p>}
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video ref={videoRef} muted playsInline className="w-full max-h-[50vh]" />
                  {recording && <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 text-white text-[12px] px-2 py-0.5 rounded-full tabular-nums"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />Recording · {mm}:{ss}</div>}
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-3">
                {mode === 'PHOTO' ? (
                  <button onClick={capturePhoto} disabled={!ready} className={BTN_PRIMARY} style={PRIMARY_STYLE}><IconCamera /> Capture</button>
                ) : !recording ? (
                  <button onClick={start} disabled={!ready} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                    <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-red-400" /> Start recording
                  </button>
                ) : (
                  <button onClick={stop} className={BTN_PRIMARY} style={{ background: DANGER }}>
                    <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-white" /> Stop
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
