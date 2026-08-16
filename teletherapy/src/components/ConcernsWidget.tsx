'use client'

import { useEffect, useRef, useState } from 'react'
import {
  LifeBuoy, X, Camera, ImageUp, Loader2, CheckCircle2, Clock, Send,
} from 'lucide-react'

interface MyTicket {
  id: string
  ticketNumber: string
  subject: string
  description: string
  status: string
  resolution: string | null
  resolvedByName: string | null
  createdAt: string
  attachmentName: string | null
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/heif']

/**
 * Floating "Concerns?" widget shown to staff on every portal page. Lets them
 * raise a support ticket (subject + description + an optional screen capture or
 * uploaded photo), and view their own tickets with the admin's resolution.
 */
export default function ConcernsWidget() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'new' | 'mine'>('new')

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdNumber, setCreatedNumber] = useState<string | null>(null)

  const [mine, setMine] = useState<MyTicket[] | null>(null)
  const [loadingMine, setLoadingMine] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  function setAttachment(f: File | null) {
    setFile(f)
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null })
  }

  async function captureScreen() {
    setError(null); setCapturing(true)
    const el = rootRef.current
    const prev = el?.style.visibility
    try {
      if (el) el.style.visibility = 'hidden' // keep the widget out of the shot
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, {
        logging: false, useCORS: true, backgroundColor: '#eef3d9',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
      })
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      if (blob) setAttachment(new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' }))
    } catch {
      setError('Couldn’t capture the screen automatically — you can upload a photo instead.')
    } finally {
      if (el) el.style.visibility = prev ?? ''
      setCapturing(false)
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!ALLOWED.includes(f.type)) { setError('Please choose a JPG, PNG, or HEIC image.'); return }
    setError(null); setAttachment(f)
  }

  async function submit() {
    if (!subject.trim()) { setError('Please add a subject.'); return }
    if (!description.trim()) { setError('Please describe the concern.'); return }
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('subject', subject.trim())
      fd.append('description', description.trim())
      if (file) fd.append('file', file)
      const res = await fetch('/api/tickets', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCreatedNumber(data.ticket?.ticketNumber ?? 'Submitted')
        setSubject(''); setDescription(''); setAttachment(null)
        setMine(null) // force refresh next time "My tickets" opens
      } else setError(data.error ?? 'Could not submit. Please try again.')
    } catch { setError('Could not submit. Please try again.') }
    setSubmitting(false)
  }

  async function loadMine() {
    setLoadingMine(true)
    try {
      const res = await fetch('/api/tickets', { cache: 'no-store' })
      if (res.ok) setMine((await res.json()).tickets ?? [])
    } catch { /* ignore */ }
    setLoadingMine(false)
  }

  useEffect(() => { if (open && tab === 'mine' && mine === null) loadMine() }, [open, tab, mine])

  const tabBtn = (key: 'new' | 'mine', label: string) => (
    <button
      onClick={() => { setError(null); setTab(key) }}
      className={`flex-1 py-2 text-[12.5px] font-semibold transition-colors ${
        tab === key ? 'text-[var(--deep-teal)] border-b-2 border-[var(--deep-teal)]' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'
      }`}
      style={{ fontFamily: 'var(--font-display)' }}
    >{label}</button>
  )

  return (
    <div ref={rootRef} className="fixed bottom-5 right-5 z-50 print:hidden">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full pl-3.5 pr-4 py-3 shadow-lg text-white text-[13px] font-semibold hover:opacity-95 transition-opacity"
          style={{ background: 'linear-gradient(135deg, var(--deep-teal), var(--moss))', fontFamily: 'var(--font-display)' }}
        >
          <LifeBuoy size={18} /> Concerns?
        </button>
      ) : (
        <div className="w-[min(92vw,380px)] rounded-2xl bg-white shadow-2xl border border-[var(--light-gray)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, var(--deep-teal), var(--moss))' }}>
            <div className="flex items-center gap-2 text-white">
              <LifeBuoy size={17} />
              <span className="text-[13.5px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Portal Concerns</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white"><X size={18} /></button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--light-gray)]">
            {tabBtn('new', 'Report a concern')}
            {tabBtn('mine', 'My tickets')}
          </div>

          <div className="p-4 max-h-[70vh] overflow-y-auto">
            {error && <div className="mb-3 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

            {/* NEW / SUCCESS */}
            {tab === 'new' && (createdNumber ? (
              <div className="text-center py-4">
                <CheckCircle2 size={34} className="text-[var(--moss)] mx-auto mb-2" />
                <p className="text-[13px] text-[var(--charcoal)]">Thanks! Your concern was submitted. Reference:</p>
                <p className="text-[16px] font-bold text-[var(--deep-teal)] my-1.5 tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>{createdNumber}</p>
                <p className="text-[11.5px] text-[var(--mid-gray)] mb-4">You’ll see the resolution under <strong>My tickets</strong>.</p>
                <button onClick={() => setCreatedNumber(null)} className="text-[12.5px] font-semibold text-[var(--moss)] hover:underline">Report another</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12px] text-[var(--mid-gray)]">Something not working, or a suggestion for the portal? Let the admin know.</p>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--charcoal)] mb-1">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder="e.g. Can’t upload session photo" className="input text-[13px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--charcoal)] mb-1">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe what happened and where…" className="input text-[13px] resize-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--charcoal)] mb-1">Screenshot (optional)</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={captureScreen} disabled={capturing} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[var(--light-gray)] text-[12px] font-semibold text-[var(--charcoal)] hover:bg-[var(--off-white)]">
                      {capturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Capture screen
                    </button>
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[var(--light-gray)] text-[12px] font-semibold text-[var(--charcoal)] hover:bg-[var(--off-white)]">
                      <ImageUp size={14} /> Upload photo
                    </button>
                  </div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic" onChange={onPick} className="hidden" />
                  {preview && (
                    <div className="mt-2 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="attachment preview" className="w-full max-h-40 object-contain rounded-lg border border-[var(--light-gray)] bg-[var(--off-white)]" />
                      <button onClick={() => setAttachment(null)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"><X size={13} /></button>
                    </div>
                  )}
                </div>
                <button onClick={submit} disabled={submitting} className="btn-primary w-full !py-2.5 !text-[13px] !rounded-xl">
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Submit concern
                </button>
              </div>
            ))}

            {/* MY TICKETS */}
            {tab === 'mine' && (
              loadingMine ? (
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--mid-gray)] py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
              ) : !mine || mine.length === 0 ? (
                <p className="text-[12.5px] text-[var(--mid-gray)] text-center py-6">You haven’t raised any concerns yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {mine.map((t) => (
                    <div key={t.id} className="rounded-xl border border-[var(--light-gray)] p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12px] font-bold text-[var(--deep-teal)]" style={{ fontFamily: 'var(--font-display)' }}>{t.ticketNumber}</span>
                        {t.status === 'RESOLVED'
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--moss)] bg-[var(--sage-tint)] px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Resolved</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#9a6a1f] bg-[#fdf1d6] px-2 py-0.5 rounded-full"><Clock size={11} /> Open</span>}
                      </div>
                      <p className="text-[12.5px] font-semibold text-[var(--charcoal)]">{t.subject}</p>
                      {t.status === 'RESOLVED' && t.resolution && (
                        <div className="mt-2 rounded-lg bg-[var(--off-white)] border border-[var(--light-gray)] p-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--moss)] mb-0.5">Resolution{t.resolvedByName ? ` · ${t.resolvedByName}` : ''}</p>
                          <p className="text-[12px] text-[var(--charcoal)] whitespace-pre-wrap">{t.resolution}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
