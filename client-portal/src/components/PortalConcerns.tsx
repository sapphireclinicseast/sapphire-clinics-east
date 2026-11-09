'use client'

// Floating "Concerns?" widget for the signed-in portal. Patients report a
// concern (subject, description, optional screenshot) and track their tickets;
// once an admin resolves one, the resolution shows under "My tickets".

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { submitTicket, listMyTickets, type PortalTicket } from '@/lib/api'
import {
  PillTabs, StatusPill, Banner, Icon, CONTROL, CONTROL_STYLE, TEXTAREA, LABEL, LABEL_STYLE,
  BTN_PRIMARY, BTN_SECONDARY, PRIMARY_STYLE, SECONDARY_STYLE, FILE_FOCUS, SUBTLE_BG, FOCUS, DANGER,
} from '@/components/hub/ui'

// Round launcher; PortalMessages uses the same look one slot above.
const LAUNCHER = `fixed right-5 z-40 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-[0_8px_24px_rgba(23,50,58,0.28)] hover:shadow-[0_12px_32px_rgba(23,50,58,0.38)] hover:-translate-y-0.5 transition-all ${FOCUS}`

type Tab = 'report' | 'mine'

export default function PortalConcerns({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('report')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Into <body>, for the same reason as the Messages widget: the dashboard
  // section this sits in ends its entry animation holding a transform, and a
  // transformed ancestor becomes the containing block for `position: fixed`,
  // so the launcher was pinned to that section rather than the screen.
  if (!mounted) return null

  return createPortal(
    <>
      {/* Launcher — bottom-right corner, stacked directly BELOW the Messages
          launcher (bottom-24 right-5). */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`${LAUNCHER} bottom-5`}
          style={{ background: 'var(--deep-teal)' }}
          aria-label="Report a portal concern"
          title="Concerns"
        >
          <LifebuoyIcon size={24} />
        </button>
      )}

      {open && (
        <div
          role="dialog" aria-label="Portal Concerns"
          className="fixed bottom-5 left-5 right-5 sm:left-auto z-40 w-auto sm:w-[420px] max-w-[calc(100vw-2.5rem)] rounded-xl bg-white shadow-2xl overflow-hidden animate-fade-up"
          style={{ border: '1px solid var(--light-gray)' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Client Portal</p>
              <h2 className="flex items-center gap-2 text-[15px] font-bold leading-tight tracking-normal mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <span style={{ color: 'var(--teal)' }}><LifebuoyIcon size={16} /></span>
                Portal Concerns
              </h2>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className={`w-8 h-8 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-4 pt-3">
            <PillTabs
              label="Portal Concerns"
              value={tab}
              onChange={(k) => setTab(k as Tab)}
              tabs={[{ id: 'report', label: 'Report a concern' }, { id: 'mine', label: 'My tickets' }]}
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-4">
            {tab === 'report' ? <ReportForm token={token} onDone={() => setTab('mine')} /> : <MyTickets token={token} />}
          </div>
        </div>
      )}
    </>,
    document.body,
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
      <div className="text-center py-8" role="status">
        <Icon name="check" size={28} className="mx-auto mb-2" style={{ color: 'var(--sage)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Concern submitted</p>
        <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>The clinic admin will review it. Track it under “My tickets”.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <p className="text-[13px]" style={{ color: 'var(--mid-gray)' }}>Something not working, or a suggestion for the portal? Let the admin know.</p>

      <label className="block">
        <span className={LABEL} style={LABEL_STYLE}>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="e.g. Can’t upload session photo" maxLength={200} />
      </label>

      <label className="block">
        <span className={LABEL} style={LABEL_STYLE}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE} placeholder="Describe what happened and where…" maxLength={5000} />
      </label>

      <div>
        <span className={LABEL} style={LABEL_STYLE}>Screenshot (optional)</span>
        {screenshot ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screenshot} alt="Attached screenshot" className="max-h-32 rounded-lg" style={{ border: '1px solid var(--light-gray)' }} />
            <button type="button" onClick={() => setScreenshot(null)} className={`absolute -top-2 -right-2 w-6 h-6 rounded-full text-white inline-flex items-center justify-center shadow ${FOCUS}`} style={{ background: DANGER }} aria-label="Remove screenshot">
              <Icon name="x" size={12} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onCapture} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
              <CameraIcon /> <span className="truncate">Capture screen</span>
            </button>
            <label className={`${BTN_SECONDARY} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
              <ImageIcon /> <span className="truncate">Upload photo</span>
              <input type="file" accept="image/*" className="sr-only" onChange={onUpload} />
            </label>
          </div>
        )}
      </div>

      {err && <Banner tone="error">{err}</Banner>}

      <button type="submit" disabled={busy} className={`${BTN_PRIMARY} w-full`} style={PRIMARY_STYLE}>
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

  if (err) return <Banner tone="error">{err}</Banner>
  if (!tickets) return <div className="text-sm py-6 text-center" role="status" style={{ color: 'var(--mid-gray)' }}>Loading…</div>
  if (tickets.length === 0) return <div className="text-sm py-6 text-center" style={{ color: 'var(--mid-gray)' }}>You haven’t submitted any concerns yet.</div>

  return (
    <div className="space-y-3">
      {tickets.map((t) => {
        const resolved = t.status === 'RESOLVED'
        return (
          <div key={t.id} className="rounded-lg p-3" style={{ border: '1px solid var(--light-gray)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold min-w-0 [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{t.subject}</div>
              <span className="shrink-0">
                <StatusPill tone={resolved ? 'success' : 'warn'}>{resolved ? 'Resolved' : 'Open'}</StatusPill>
              </span>
            </div>
            <p className="text-[12.5px] mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--mid-gray)' }}>{t.description}</p>
            {resolved && t.adminResponse && (
              <div className="mt-2 rounded-lg px-3 py-2" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>Clinic response</div>
                <div className="text-[13px] mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{t.adminResponse}</div>
              </div>
            )}
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
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

function LifebuoyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
