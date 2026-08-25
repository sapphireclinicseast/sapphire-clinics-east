'use client'

// "Home Progress" — parents/patients log progress at home: pick a date, add
// remarks, and attach voice / video / photo (record directly or upload).
// Multiple files per entry, uploaded one-by-one with a % progress indicator.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  listHomeProgress,
  createHomeProgressEntry,
  uploadHomeProgressFile,
  deleteHomeProgressEntry,
  homeProgressFileUrl,
  type HomeProgressEntryRow,
} from '@/lib/api'

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
    <div className="card-static">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Home Progress</h3>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">Record or upload your child&apos;s progress at home — voice, video, or photos. These are shared with your therapist&apos;s portal so they can follow your child&apos;s progress at home between sessions.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary shrink-0">+ Add progress</button>
      </div>

      {err && <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{err}</div>}

      <div className="mt-5 space-y-4">
        {entries == null ? (
          <p className="text-sm text-[color:var(--mid-gray)]">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)]">No entries yet. Tap “Add progress” to upload your first.</p>
        ) : (
          entries.map((e) => <EntryCard key={e.id} entry={e} token={token} onDeleted={load} />)
        )}
      </div>

      {showForm && <AddEntryModal token={token} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
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
    <div className="rounded-2xl border border-[color:var(--light-gray)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--deep-teal)]">{fmtDate(entry.date)}</div>
        <button onClick={del} disabled={busy} className="text-[12px] text-[color:var(--mid-gray)] hover:text-rose-600">Delete</button>
      </div>
      {entry.remarks && <p className="text-sm text-[color:var(--mid-gray)] mt-1 whitespace-pre-wrap">{entry.remarks}</p>}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entry.files.map((f) => {
          const src = homeProgressFileUrl(f.id, token)
          return (
            <div key={f.id} className="rounded-xl overflow-hidden border border-[color:var(--paper-3)] bg-[color:var(--paper-2)]">
              {f.kind === 'PHOTO' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={f.fileName} className="w-full max-h-56 object-cover" /></a>
              ) : f.kind === 'VIDEO' ? (
                <video src={src} controls className="w-full max-h-56 bg-black" />
              ) : (
                <audio src={src} controls className="w-full" />
              )}
              <div className="px-2.5 py-1.5 text-[11px] text-[color:var(--mid-gray)] flex items-center justify-between" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="truncate">{f.kind === 'AUDIO' ? '🎙 Voice' : f.kind === 'VIDEO' ? '🎬 Video' : '📷 Photo'}</span>
                <span className="shrink-0">{fmtSize(f.sizeBytes)}</span>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={uploading ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-[0_24px_60px_rgba(27,63,56,0.3)] flex flex-col overflow-hidden animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-[color:var(--light-gray)] px-4 py-3 z-10 flex items-center justify-between">
          <div className="text-[18px] font-semibold text-[color:var(--deep-teal)]">Add Home Progress</div>
          <button onClick={onClose} disabled={uploading} aria-label="Close" className="text-2xl leading-none text-[color:var(--mid-gray)] hover:text-[color:var(--deep-teal)] disabled:opacity-40">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <label className="block">
            <span className="label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" disabled={uploading} />
          </label>
          <label className="block">
            <span className="label">Remarks</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="input !py-2.5 resize-y" placeholder="e.g. Practiced the /s/ sound at home — much clearer today." disabled={uploading} />
          </label>

          <div>
            <span className="label">Attachments</span>
            <div className="grid grid-cols-2 gap-2.5">
              <AttachBtn label="Record voice" emoji="🎙" onClick={() => setRecorder('AUDIO')} disabled={uploading} />
              <AttachBtn label="Record video" emoji="🎬" onClick={() => setRecorder('VIDEO')} disabled={uploading} />
              <AttachBtn label="Take photo" emoji="📷" onClick={() => setRecorder('PHOTO')} disabled={uploading} />
              <AttachBtn label="Upload files" emoji="📎" onClick={() => uploadInput.current?.click()} disabled={uploading} />
              <input ref={uploadInput} type="file" accept="audio/*,video/*,image/*" multiple className="hidden" onChange={onUpload} />
            </div>
            <p className="text-[11px] text-[color:var(--mid-gray)] mt-1.5" style={{ fontFamily: 'var(--font-display)' }}>Up to 18 MB per file.</p>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border border-[color:var(--paper-3)] p-2">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-[color:var(--paper-2)] flex items-center justify-center shrink-0">
                    {f.kind === 'PHOTO' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl">{f.kind === 'AUDIO' ? '🎙' : '🎬'}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[color:var(--deep-teal)] truncate">{f.name}</div>
                    <div className="text-[11px] text-[color:var(--mid-gray)]">{f.kind.toLowerCase()} · {fmtSize(f.blob.size)}</div>
                  </div>
                  {!uploading && <button onClick={() => removeFile(f.id)} className="text-[color:var(--mid-gray)] hover:text-rose-600 text-lg shrink-0" aria-label="Remove">×</button>}
                </div>
              ))}
            </div>
          )}

          {err && <div className="text-[12.5px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{err}</div>}

          {uploading ? (
            <div>
              <div className="flex items-center justify-between text-[12px] text-[color:var(--deep-teal)] font-semibold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[color:var(--pale-teal)] overflow-hidden">
                <div className="h-full bg-[color:var(--teal)] transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <button onClick={submit} className="btn-primary w-full">Save progress</button>
          )}
        </div>
      </div>

      {recorder && <RecorderOverlay mode={recorder} onCancel={() => setRecorder(null)} onDone={(pf) => { addFiles([pf]); setRecorder(null) }} />}
    </div>,
    document.body,
  )
}

function AttachBtn({ label, emoji, onClick, disabled }: { label: string; emoji: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-secondary !py-2.5 text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
      <span>{emoji}</span> {label}
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
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[color:var(--light-gray)] flex items-center justify-between">
          <div className="font-semibold text-[color:var(--deep-teal)]">{mode === 'AUDIO' ? 'Record voice' : mode === 'VIDEO' ? 'Record video' : 'Take photo'}</div>
          <button onClick={() => { stopStream(); onCancel() }} aria-label="Close" className="text-2xl leading-none text-[color:var(--mid-gray)]">×</button>
        </div>
        <div className="p-4">
          {err ? (
            <p className="text-sm text-rose-700">{err}</p>
          ) : (
            <>
              {mode === 'AUDIO' ? (
                <div className="py-8 text-center">
                  <div className={`text-5xl ${recording ? 'animate-pulse' : ''}`}>🎙</div>
                  <div className="mt-3 text-2xl font-semibold text-[color:var(--deep-teal)] tabular-nums">{mm}:{ss}</div>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video ref={videoRef} muted playsInline className="w-full max-h-[50vh]" />
                  {recording && <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 text-white text-[12px] px-2 py-0.5 rounded-full"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />{mm}:{ss}</div>}
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-3">
                {mode === 'PHOTO' ? (
                  <button onClick={capturePhoto} disabled={!ready} className="btn-primary disabled:opacity-40">Capture</button>
                ) : !recording ? (
                  <button onClick={start} disabled={!ready} className="btn-primary disabled:opacity-40">● Start recording</button>
                ) : (
                  <button onClick={stop} className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-semibold">■ Stop</button>
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
