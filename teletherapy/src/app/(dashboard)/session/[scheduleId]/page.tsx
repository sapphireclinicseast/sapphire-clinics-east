'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  Video,
  CheckCircle2,
  XCircle,
  Upload,
  QrCode,
  FileText,
  Send,
  Loader2,
  Paperclip,
  X,
  Mail,
  Calendar,
  Stethoscope,
  Pencil,
} from 'lucide-react'
import { formatTime, formatDate } from '@/lib/utils'

interface SessionDetail {
  id: string
  date: string
  startTime: string
  endTime: string
  sessionType: string
  status: string
  meetLink: string | null
  notes: string | null
  patient: {
    id: string
    firstName: string
    lastName: string
    email: string | null
  } | null
  staff: {
    firstName: string
    lastName: string
    department: string
  }
  sessionNote: {
    id: string
    status: string
    notes: string | null
    attachments: { fileName: string; filePath: string; mimeType: string }[] | null
    discontinuedRemarks: string | null
    emailSentAt: string | null
    emailSentTo: string | null
  } | null
}

type ActionMode = null | 'complete' | 'discontinue' | 'edit'

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const scheduleId = params.scheduleId as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionMode, setActionMode] = useState<ActionMode>(null)
  const [notes, setNotes] = useState('')
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [keptAttachments, setKeptAttachments] = useState<{ fileName: string; filePath: string; mimeType: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { fetchSession() }, [scheduleId])

  async function fetchSession() {
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${scheduleId}`)
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      }
    } catch {}
    setLoading(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function generateQR() {
    try {
      const res = await fetch(`/api/sessions/${scheduleId}/qr`, { method: 'POST' })
      const data = await res.json()
      setQrUrl(data.qrDataUrl)
    } catch { showToast('Failed to generate QR code') }
  }

  async function handleComplete() {
    setSubmitting(true)
    try {
      const attachments: { fileName: string; filePath: string; mimeType: string }[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('scheduleId', scheduleId)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        if (uploadRes.ok) attachments.push(await uploadRes.json())
      }
      const res = await fetch(`/api/sessions/${scheduleId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, attachments }),
      })
      if (res.ok) { showToast('Session marked as completed'); setActionMode(null); setFiles([]); setNotes(''); fetchSession() }
      else { const data = await res.json(); showToast(data.error ?? 'Failed') }
    } catch { showToast('Failed to complete session') }
    setSubmitting(false)
  }

  async function handleDiscontinue() {
    if (!remarks.trim()) { showToast('Please provide a reason'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sessions/${scheduleId}/discontinue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks }),
      })
      if (res.ok) { showToast('Session discontinued'); setActionMode(null); fetchSession() }
      else { const data = await res.json(); showToast(data.error ?? 'Failed') }
    } catch { showToast('Failed') }
    setSubmitting(false)
  }

  async function handleEdit() {
    setSubmitting(true)
    try {
      // Upload any new files
      const newAttachments: { fileName: string; filePath: string; mimeType: string }[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('scheduleId', scheduleId)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        if (uploadRes.ok) newAttachments.push(await uploadRes.json())
      }

      const body: Record<string, unknown> = {}
      if (session?.sessionNote?.status === 'COMPLETED') {
        body.notes = notes
        body.existingAttachments = keptAttachments
        if (newAttachments.length > 0) body.attachments = newAttachments
      } else {
        body.discontinuedRemarks = remarks
      }

      const res = await fetch(`/api/sessions/${scheduleId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Notes updated successfully')
        setActionMode(null)
        setFiles([])
        fetchSession()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Failed to update')
      }
    } catch { showToast('Failed to update notes') }
    setSubmitting(false)
  }

  function startEdit() {
    if (!session?.sessionNote) return
    if (session.sessionNote.status === 'COMPLETED') {
      setNotes(session.sessionNote.notes ?? '')
      setKeptAttachments((session.sessionNote.attachments as any[] | null) ?? [])
    } else {
      setRemarks(session.sessionNote.discontinuedRemarks ?? '')
    }
    setFiles([])
    setActionMode('edit')
  }

  function removeKeptAttachment(index: number) {
    setKeptAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSendEmail() {
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/sessions/${scheduleId}/send-email`, { method: 'POST' })
      if (res.ok) { showToast('Notes sent to patient email'); fetchSession() }
      else { const data = await res.json(); showToast(data.error ?? 'Failed to send') }
    } catch { showToast('Failed to send email') }
    setSendingEmail(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" />
        <p className="text-sm text-[var(--mid-gray)]">Loading session...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="card-static text-center py-16 max-w-lg mx-auto animate-fade-up">
        <p className="text-[var(--mid-gray)] font-medium">Session not found</p>
        <button onClick={() => router.push('/')} className="mt-3 text-[var(--teal)] text-sm hover:underline">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const hasNote = !!session.sessionNote
  const patientName = session.patient ? `${session.patient.firstName} ${session.patient.lastName}` : 'Walk-in Patient'

  return (
    <div className="max-w-3xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {/* Back */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1.5 text-[13px] text-[var(--mid-gray)] hover:text-[var(--teal)] mb-6 transition-colors font-medium"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>

      {/* Patient info hero */}
      <div className="hero-gradient rounded-2xl p-6 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm border border-white/20">
            {session.patient ? `${session.patient.firstName[0]}${session.patient.lastName[0]}` : 'W'}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{patientName}</h1>
            {session.patient?.email && (
              <p className="text-white/60 text-sm mt-0.5">{session.patient.email}</p>
            )}
          </div>
          <span className={`badge ${session.status === 'CONFIRMED' ? 'badge-confirmed' : session.status === 'PENDING' ? 'badge-pending' : 'badge-cancelled'}`}>
            {session.status}
          </span>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Calendar, label: 'Date', value: formatDate(session.date) },
          { icon: Clock, label: 'Time', value: `${formatTime(session.startTime)} – ${formatTime(session.endTime)}` },
          { icon: FileText, label: 'Type', value: session.sessionType },
          { icon: Stethoscope, label: 'Clinician', value: `${session.staff.lastName} (${session.staff.department})` },
        ].map((item, i) => (
          <div key={item.label} className={`card-static !p-4 animate-fade-up stagger-${i + 1}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <item.icon size={13} className="text-[var(--teal)]" />
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider">{item.label}</p>
            </div>
            <p className="text-[13px] font-semibold text-[var(--charcoal)]">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Meet link */}
      {session.meetLink && (
        <div className="mb-6 animate-fade-up stagger-5">
          <a
            href={session.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-3.5 rounded-xl text-[15px]"
          >
            <Video size={20} />
            Join Online Meet Link
          </a>
        </div>
      )}

      {/* Existing note display */}
      {hasNote && actionMode !== 'edit' && (
        <div className="card-static mb-6 animate-fade-up stagger-5">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--light-gray)]">
            <div className="flex items-center gap-2">
              {session.sessionNote!.status === 'COMPLETED' ? (
                <CheckCircle2 size={20} className="text-green-500" />
              ) : (
                <XCircle size={20} className="text-red-500" />
              )}
              <h2 className="font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
                Session {session.sessionNote!.status === 'COMPLETED' ? 'Completed' : 'Discontinued'}
              </h2>
            </div>
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-[13px] text-[var(--teal)] hover:text-[var(--deep-teal)] font-medium transition-colors"
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>

          {session.sessionNote!.notes && (
            <div className="mb-4">
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1.5">Notes</p>
              <div className="text-sm whitespace-pre-wrap bg-[var(--off-white)] p-4 rounded-xl border border-[var(--light-gray)]">
                {session.sessionNote!.notes}
              </div>
            </div>
          )}

          {session.sessionNote!.discontinuedRemarks && (
            <div className="mb-4">
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1.5">Reason</p>
              <div className="text-sm whitespace-pre-wrap bg-red-50 p-4 rounded-xl border border-red-100 text-red-800">
                {session.sessionNote!.discontinuedRemarks}
              </div>
            </div>
          )}

          {session.sessionNote!.attachments && (session.sessionNote!.attachments as any[]).length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1.5">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {(session.sessionNote!.attachments as any[]).map((att: any, i: number) => (
                  <a key={i} href={`/api/upload/${att.filePath}`} target="_blank"
                     className="flex items-center gap-1.5 text-[13px] text-[var(--teal)] bg-[var(--pale-teal)] px-3 py-2 rounded-xl hover:bg-[var(--teal)] hover:text-white transition-colors font-medium">
                    <Paperclip size={14} />
                    {att.fileName}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Send email */}
          {session.sessionNote!.status === 'COMPLETED' && session.patient?.email && (
            <div className="pt-4 border-t border-[var(--light-gray)]">
              {session.sessionNote!.emailSentAt ? (
                <p className="text-sm text-green-600 flex items-center gap-2 font-medium">
                  <Mail size={15} />
                  Sent to {session.sessionNote!.emailSentTo} on {new Date(session.sessionNote!.emailSentAt).toLocaleDateString()}
                </p>
              ) : (
                <button onClick={handleSendEmail} disabled={sendingEmail} className="btn-primary w-full py-3 rounded-xl">
                  {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Send Notes to Patient&apos;s Email
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {actionMode === 'edit' && session.sessionNote && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit {session.sessionNote.status === 'COMPLETED' ? 'Session Notes' : 'Discontinuation Remarks'}
          </h2>

          {session.sessionNote.status === 'COMPLETED' ? (
            <>
              {/* Upload additional files */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed border-[var(--light-gray)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all active:scale-97 group">
                  <Upload size={28} className="text-[var(--mid-gray)] group-hover:text-[var(--teal)] transition-colors" />
                  <span className="text-[13px] font-semibold text-[var(--mid-gray)] group-hover:text-[var(--deep-teal)]">Add More Attachments</span>
                </button>
                <button onClick={generateQR}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed border-[var(--light-gray)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all active:scale-97 group">
                  <QrCode size={28} className="text-[var(--mid-gray)] group-hover:text-[var(--teal)] transition-colors" />
                  <span className="text-[13px] font-semibold text-[var(--mid-gray)] group-hover:text-[var(--deep-teal)]">QR Camera Capture</span>
                </button>
              </div>

              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFileUpload} className="hidden" />

              {qrUrl && (
                <div className="mb-6 text-center bg-[var(--off-white)] p-6 rounded-xl border border-[var(--light-gray)]">
                  <p className="text-[13px] text-[var(--mid-gray)] mb-3 font-medium">Scan to photograph handwritten notes</p>
                  <img src={qrUrl} alt="QR Code" className="mx-auto w-48 h-48 rounded-xl" />
                  <button onClick={() => setQrUrl(null)} className="mt-3 text-[12px] text-[var(--mid-gray)] hover:text-[var(--charcoal)] font-medium">Dismiss</button>
                </div>
              )}

              {/* Existing attachments with delete */}
              {keptAttachments.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2">Existing Attachments</p>
                  <div className="space-y-2">
                    {keptAttachments.map((att, i) => (
                      <div key={i} className="flex items-center justify-between bg-[var(--off-white)] px-4 py-2.5 rounded-xl text-[13px] border border-[var(--light-gray)]">
                        <a href={`/api/upload/${att.filePath}`} target="_blank" className="flex items-center gap-2 truncate font-medium text-[var(--teal)] hover:underline">
                          <Paperclip size={14} />
                          {att.fileName}
                        </a>
                        <button onClick={() => removeKeptAttachment(i)} className="text-[var(--mid-gray)] hover:text-red-500 shrink-0 ml-2" title="Remove attachment"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New files */}
              {files.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2">New Attachments ({files.length})</p>
                  <div className="space-y-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-[var(--off-white)] px-4 py-2.5 rounded-xl text-[13px] border border-[var(--light-gray)]">
                        <span className="flex items-center gap-2 truncate font-medium">
                          <Paperclip size={14} className="text-[var(--teal)]" />
                          {f.name}
                        </span>
                        <button onClick={() => removeFile(i)} className="text-[var(--mid-gray)] hover:text-red-500 shrink-0 ml-2"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Session Notes</label>
                <textarea id="notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Enter session notes here..."
                  className="input resize-y !rounded-xl" />
              </div>
            </>
          ) : (
            <div className="mb-6">
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Reason for Discontinuation
              </label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} autoFocus
                className="input resize-y !rounded-xl" />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleEdit} disabled={submitting}
              className="btn-primary flex-1 py-3 rounded-xl">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save Changes
            </button>
            <button onClick={() => { setActionMode(null); setFiles([]); setNotes(''); setRemarks(''); setQrUrl(null) }} className="btn-secondary px-6 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!hasNote && actionMode === null && (
        <div className="flex gap-3 animate-fade-up stagger-6">
          <button onClick={() => setActionMode('complete')} className="btn-primary flex-1 py-3.5 rounded-xl text-[15px] !bg-gradient-to-r !from-green-600 !to-green-700 !shadow-[0_2px_8px_rgba(22,163,74,0.3)]">
            <CheckCircle2 size={20} />
            Completed
          </button>
          <button onClick={() => setActionMode('discontinue')} className="btn-danger flex-1 py-3.5 rounded-xl text-[15px]">
            <XCircle size={20} />
            Discontinued
          </button>
        </div>
      )}

      {/* Complete form */}
      {actionMode === 'complete' && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[
              { icon: Upload, label: 'Upload Photo/PDF', onClick: () => fileInputRef.current?.click() },
              { icon: QrCode, label: 'QR Camera Capture', onClick: generateQR },
              { icon: FileText, label: 'Write Notes', onClick: () => document.getElementById('notes-area')?.focus() },
            ].map((opt) => (
              <button key={opt.label} onClick={opt.onClick}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed border-[var(--light-gray)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all active:scale-97 group">
                <opt.icon size={28} className="text-[var(--mid-gray)] group-hover:text-[var(--teal)] transition-colors" />
                <span className="text-[13px] font-semibold text-[var(--mid-gray)] group-hover:text-[var(--deep-teal)]">{opt.label}</span>
              </button>
            ))}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFileUpload} className="hidden" />

          {qrUrl && (
            <div className="mb-6 text-center bg-[var(--off-white)] p-6 rounded-xl border border-[var(--light-gray)]">
              <p className="text-[13px] text-[var(--mid-gray)] mb-3 font-medium">Scan to photograph handwritten notes</p>
              <img src={qrUrl} alt="QR Code" className="mx-auto w-48 h-48 rounded-xl" />
              <button onClick={() => setQrUrl(null)} className="mt-3 text-[12px] text-[var(--mid-gray)] hover:text-[var(--charcoal)] font-medium">Dismiss</button>
            </div>
          )}

          {files.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2">Attachments ({files.length})</p>
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-[var(--off-white)] px-4 py-2.5 rounded-xl text-[13px] border border-[var(--light-gray)]">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <Paperclip size={14} className="text-[var(--teal)]" />
                      {f.name}
                    </span>
                    <button onClick={() => removeFile(i)} className="text-[var(--mid-gray)] hover:text-red-500 shrink-0 ml-2"><X size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Session Notes</label>
            <textarea id="notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Enter session notes here..."
              className="input resize-y !rounded-xl" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleComplete} disabled={submitting || (!notes.trim() && files.length === 0)}
              className="btn-primary flex-1 py-3 rounded-xl !bg-gradient-to-r !from-green-600 !to-green-700 !shadow-[0_2px_8px_rgba(22,163,74,0.3)]">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save & Complete
            </button>
            <button onClick={() => { setActionMode(null); setFiles([]); setNotes(''); setQrUrl(null) }} className="btn-secondary px-6 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Discontinue form */}
      {actionMode === 'discontinue' && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <XCircle size={20} className="text-red-500" />
            Discontinue Session
          </h2>

          <div className="mb-6">
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Reason for Discontinuation <span className="text-red-500">*</span>
            </label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} autoFocus
              placeholder="Please explain why this session was discontinued..."
              className="input resize-y !rounded-xl !focus:border-red-400 !focus:ring-red-100" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleDiscontinue} disabled={submitting || !remarks.trim()} className="btn-danger flex-1 py-3 rounded-xl">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              Confirm Discontinuation
            </button>
            <button onClick={() => { setActionMode(null); setRemarks('') }} className="btn-secondary px-6 rounded-xl">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
