'use client'

// Floating "Concerns?" widget for the signed-in portal. Patients report a
// concern (subject, description, optional screenshot) and track their tickets;
// once an admin resolves one, the resolution shows under "My tickets".

import { useCallback, useEffect, useState } from 'react'
import { submitTicket, listMyTickets, type PortalTicket } from '@/lib/api'

type Tab = 'report' | 'mine'

export default function PortalConcerns({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('report')

  return (
    <>
      {/* Launcher — bottom-left so it doesn't collide with the chatbot (bottom-right) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full text-white font-semibold shadow-[0_10px_30px_rgba(27,63,56,0.28)] hover:opacity-95 transition-opacity"
          style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))', fontFamily: 'var(--font-display)' }}
          aria-label="Report a portal concern"
        >
          <LifebuoyIcon />
          <span className="text-sm">Concerns?</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 left-5 right-5 sm:right-auto z-40 w-auto sm:w-[420px] max-w-[calc(100vw-2.5rem)] rounded-2xl bg-white shadow-[0_24px_60px_rgba(27,63,56,0.28)] border border-[color:var(--paper-3)] overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 text-white" style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}>
            <div className="flex items-center gap-2 font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              <LifebuoyIcon />
              Portal Concerns
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="opacity-80 hover:opacity-100 text-xl leading-none">×</button>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ fontFamily: 'var(--font-display)' }}>
            {([['report', 'Report a concern'], ['mine', 'My tickets']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  tab === k
                    ? 'border-[color:var(--deep-teal)] text-[color:var(--deep-teal)]'
                    : 'border-transparent text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-4">
            {tab === 'report' ? <ReportForm token={token} onDone={() => setTab('mine')} /> : <MyTickets token={token} />}
          </div>
        </div>
      )}
    </>
  )
}

function ReportForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try { setScreenshot(await fileToResizedDataUrl(file)) }
    catch { setErr('Could not read that image.') }
  }

  async function onCapture() {
    setErr(null)
    try {
      const data = await captureScreenFrame()
      setScreenshot(data)
    } catch {
      setErr('Screen capture was cancelled or is not available on this device. You can upload a photo instead.')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) { setErr('Please add a subject and description.'); return }
    setBusy(true); setErr(null)
    try {
      await submitTicket(token, { subject, description, screenshot })
      setOk(true)
      setSubject(''); setDescription(''); setScreenshot(null)
      setTimeout(onDone, 900)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (ok) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-2">✓</div>
        <p className="text-sm text-[color:var(--deep-teal)] font-semibold">Concern submitted</p>
        <p className="text-[12px] text-[color:var(--mid-gray)] mt-1">The clinic admin will review it. Track it under “My tickets”.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <p className="text-[13px] text-[color:var(--mid-gray)]">Something not working, or a suggestion for the portal? Let the admin know.</p>

      <label className="block">
        <span className="label">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" placeholder="e.g. Can’t upload session photo" maxLength={200} />
      </label>

      <label className="block">
        <span className="label">Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input !py-2.5 resize-y" placeholder="Describe what happened and where…" maxLength={5000} />
      </label>

      <div>
        <span className="label">Screenshot (optional)</span>
        {screenshot ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screenshot} alt="Attached screenshot" className="max-h-32 rounded-lg border border-[color:var(--paper-3)]" />
            <button type="button" onClick={() => setScreenshot(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[color:var(--clay)] text-white text-sm leading-none shadow" aria-label="Remove screenshot">×</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onCapture} className="btn-secondary !py-2.5 text-sm inline-flex items-center justify-center gap-1.5">
              <CameraIcon /> Capture screen
            </button>
            <label className="btn-secondary !py-2.5 text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer">
              <ImageIcon /> Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </label>
          </div>
        )}
      </div>

      {err && <div className="text-[12.5px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{err}</div>}

      <button type="submit" disabled={busy} className="btn-primary w-full inline-flex items-center justify-center gap-2">
        <SendIcon /> {busy ? 'Submitting…' : 'Submit concern'}
      </button>
    </form>
  )
}

function MyTickets({ token }: { token: string }) {
  const [tickets, setTickets] = useState<PortalTicket[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    listMyTickets(token).then((d) => setTickets(d.tickets)).catch((e) => setErr((e as Error).message))
  }, [token])

  useEffect(() => { load() }, [load])

  if (err) return <div className="text-[13px] text-rose-700">{err}</div>
  if (!tickets) return <div className="text-sm text-[color:var(--mid-gray)] py-6 text-center">Loading…</div>
  if (tickets.length === 0) return <div className="text-sm text-[color:var(--mid-gray)] py-6 text-center">You haven’t submitted any concerns yet.</div>

  return (
    <div className="space-y-3">
      {tickets.map((t) => {
        const resolved = t.status === 'RESOLVED'
        return (
          <div key={t.id} className="rounded-xl border border-[color:var(--paper-3)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold text-[color:var(--deep-teal)]">{t.subject}</div>
              <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded ${resolved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {resolved ? 'Resolved' : 'Open'}
              </span>
            </div>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1 whitespace-pre-wrap">{t.description}</p>
            {resolved && t.adminResponse && (
              <div className="mt-2 rounded-lg bg-[color:var(--pale-teal)]/60 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--teal)]">Clinic response</div>
                <div className="text-[13px] text-[color:var(--deep-teal)] mt-0.5 whitespace-pre-wrap">{t.adminResponse}</div>
              </div>
            )}
            <div className="text-[11px] text-[color:var(--mid-gray)] mt-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              {fmt(t.createdAt)}{resolved && t.resolvedAt ? ` · resolved ${fmt(t.resolvedAt)}` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Resize an uploaded image down to <=1280px and re-encode as JPEG (keeps payload small).
function fileToResizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 1280
        let { width, height } = img
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height)
          width = Math.round(width * r); height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => reject(new Error('bad image'))
      img.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

// Capture a single frame of the shared screen/tab as a JPEG data URL.
async function captureScreenFrame(): Promise<string> {
  const md = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (c?: MediaStreamConstraints) => Promise<MediaStream>
  }
  if (!md?.getDisplayMedia) throw new Error('unsupported')
  const stream = await md.getDisplayMedia({ video: true })
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    await video.play()
    await new Promise((r) => setTimeout(r, 250))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

function LifebuoyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" /><line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
      <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" /><line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
    </svg>
  )
}
function CameraIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>)
}
function ImageIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>)
}
function SendIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>)
}
