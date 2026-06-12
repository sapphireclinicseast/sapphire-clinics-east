'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  ClipboardList,
} from 'lucide-react'
import { formatTime, formatDate } from '@/lib/utils'
import { useSession } from 'next-auth/react'
import PsychologyForm, { type PsychFormData } from '@/components/PsychologyForm'
import PsychologyNoteDisplay from '@/components/PsychologyNoteDisplay'
import OTNoteForm, { type OTFormData } from '@/components/OTNoteForm'
import OTNoteDisplay from '@/components/OTNoteDisplay'
import SLPNoteForm, { type SLPFormData } from '@/components/SLPNoteForm'
import SLPNoteDisplay from '@/components/SLPNoteDisplay'
import SPEDNoteForm, { type SPEDFormData } from '@/components/SPEDNoteForm'
import SPEDNoteDisplay from '@/components/SPEDNoteDisplay'
import PTNoteForm, { type PTFormData } from '@/components/PTNoteForm'
import PTNoteDisplay from '@/components/PTNoteDisplay'

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
    dob: string | null
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
    isInitialEvaluation: boolean
  } | null
}

type ActionMode = null | 'complete' | 'discontinue' | 'edit'

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const scheduleId = params.scheduleId as string
  const searchParams = useSearchParams()
  const autoEdit = searchParams.get('edit') === 'true'
  const autoAction = searchParams.get('action') // 'complete' | 'discontinue' | null
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
  const [clinicianSettings, setClinicianSettings] = useState<{ licenseNo?: string | null; ptrNo?: string | null; signatureDataUrl?: string | null } | null>(null)

  // Department detection — based on the SESSION's staff dept, not logged-in user
  // This way admin can also see the correct form for each session
  const { data: authSession } = useSession()
  const sessionDept = session?.staff?.department?.toUpperCase() ?? authSession?.user?.department?.toUpperCase() ?? ''
  const isPsychDept = sessionDept === 'PSYCHOLOGY'
  const isOTDept = sessionDept === 'OT' || sessionDept === 'OCCUPATIONAL THERAPY'
  const isSLPDept = sessionDept === 'SLP' || sessionDept === 'SPEECH LANGUAGE PATHOLOGY' || sessionDept === 'ST'
  const isSPEDDept = sessionDept === 'SPED' || sessionDept === 'SPECIAL EDUCATION'
  const isPTDept = sessionDept === 'PT' || sessionDept === 'PHYSICAL THERAPY'
  const hasStructuredForm = isPsychDept || isOTDept || isSLPDept || isSPEDDept || isPTDept // departments with structured note forms
  const supportsIEFlag = isPTDept || isOTDept || isSLPDept || isSPEDDept // depts that can flag a session as Initial Evaluation
  const [isFirstSession, setIsFirstSession] = useState(true)
  const [overrideToProgress, setOverrideToProgress] = useState(false)
  const [psychUseForm, setPsychUseForm] = useState(true) // true = structured form, false = upload/QR/write
  const [psychEditUseForm, setPsychEditUseForm] = useState(true) // same toggle for edit mode
  const [captureReceived, setCaptureReceived] = useState<string | null>(null) // filename of received capture
  const [spedFormVariant, setSPEDFormVariant] = useState<'SPED16' | 'SPED18'>('SPED16') // SPED form selector
  const [ieMode, setIEMode] = useState<'PENDING' | 'DAILY_NOTES' | 'INITIAL_EVAL'>('PENDING') // PT/OT/SLP/SPED IE flag
  const [ieFile, setIEFile] = useState<File | null>(null)
  const [ieDescription, setIEDescription] = useState('')
  const [showClearFormPrompt, setShowClearFormPrompt] = useState(false) // psych: ask to clear form when switching to upload
  const [clearFormTarget, setClearFormTarget] = useState<'complete' | 'edit' | null>(null) // which mode triggered the prompt
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const attachmentCountRef = useRef<number>(0) // track attachment count before QR

  useEffect(() => { fetchSession(); fetchClinicianSettings() }, [scheduleId])

  async function fetchClinicianSettings() {
    try {
      const res = await fetch('/api/clinician-settings')
      if (res.ok) {
        const data = await res.json()
        setClinicianSettings(data.settings ?? null)
      }
    } catch {}
  }

  // Auto-enter edit mode when navigated with ?edit=true
  useEffect(() => {
    if (autoEdit && session?.sessionNote && actionMode === null) {
      startEdit()
    }
  }, [autoEdit, session?.sessionNote?.id])

  // Auto-enter complete/discontinue mode when navigated with ?action=complete|discontinue
  // (skips the intermediate "Completed/Discontinued" buttons on the session page)
  useEffect(() => {
    if (!session || actionMode !== null) return
    if (session.sessionNote) return // session already has a note — don't auto-trigger
    if (autoAction === 'complete') {
      setActionMode('complete')
    } else if (autoAction === 'discontinue') {
      setActionMode('discontinue')
    }
  }, [autoAction, session?.id])

  useEffect(() => {
    if (isPsychDept && session?.id) {
      fetch(`/api/sessions/${scheduleId}/check-first-session`)
        .then((r) => r.json())
        .then((d) => setIsFirstSession(d.isFirstSession))
        .catch(() => {})
    }
  }, [isPsychDept, session?.id, scheduleId])

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

      // Record current attachment count and start polling for new captures
      const currentAttachments = session?.sessionNote?.attachments as any[] | null
      attachmentCountRef.current = currentAttachments?.length ?? 0
      startCapturePoll()
    } catch { showToast('Failed to generate QR code') }
  }

  function startCapturePoll() {
    // Clear any existing poll
    if (qrPollRef.current) clearInterval(qrPollRef.current)

    qrPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${scheduleId}`)
        if (!res.ok) return
        const data = await res.json()
        const newAttachments = (data.session?.sessionNote?.attachments as any[]) ?? []
        if (newAttachments.length > attachmentCountRef.current) {
          // New attachment(s) detected — find what was added
          const addedAttachments = newAttachments.slice(attachmentCountRef.current)
          const latest = addedAttachments[addedAttachments.length - 1]
          setCaptureReceived(latest?.fileName ?? 'Photo')
          attachmentCountRef.current = newAttachments.length

          // CRITICAL: Update keptAttachments to include the new QR capture
          // This prevents handleEdit from overwriting the DB with stale data
          setKeptAttachments((prev) => {
            const existingPaths = new Set(prev.map((a) => a.filePath))
            const newOnes = addedAttachments.filter((a: any) => !existingPaths.has(a.filePath))
            return [...prev, ...newOnes]
          })

          // Refresh session data to show the new attachment
          fetchSession()

          // Auto-dismiss after 6 seconds
          setTimeout(() => setCaptureReceived(null), 6000)
        }
      } catch {}
    }, 3000)
  }

  // Cleanup polling on unmount or when QR is dismissed
  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current)
    }
  }, [])

  // Handle psych toggle to Upload/QR — check if form has data
  function handlePsychSwitchToUpload(mode: 'complete' | 'edit') {
    const hasExistingNotes = session?.sessionNote?.notes && session.sessionNote.notes.trim().length > 0
    if (hasExistingNotes || (mode === 'complete' && notes.trim())) {
      // Show prompt asking if they want to clear form data
      setClearFormTarget(mode)
      setShowClearFormPrompt(true)
    } else {
      // No form data, just switch
      if (mode === 'complete') setPsychUseForm(false)
      else setPsychEditUseForm(false)
    }
  }

  function handleClearFormChoice(clearIt: boolean) {
    if (clearIt) {
      // Clear the notes so only the upload/attachment is saved
      setNotes('')
    }
    // Switch to upload mode regardless
    if (clearFormTarget === 'complete') setPsychUseForm(false)
    else setPsychEditUseForm(false)
    setShowClearFormPrompt(false)
    setClearFormTarget(null)
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

  // Check if existing notes are structured psych JSON
  function getPsychData(): PsychFormData | null {
    if (!session?.sessionNote?.notes) return null
    try {
      const parsed = JSON.parse(session.sessionNote.notes)
      if (parsed.formType?.startsWith('PSYCH_')) return parsed
    } catch {}
    return null
  }

  // Check if existing notes are structured OT JSON
  function getOTData(): OTFormData | null {
    if (!session?.sessionNote?.notes) return null
    try {
      const parsed = JSON.parse(session.sessionNote.notes)
      if (parsed.formType === 'OT_DAILY_NOTES') return parsed
    } catch {}
    return null
  }

  // Check if existing notes are structured SLP JSON
  function getSLPData(): SLPFormData | null {
    if (!session?.sessionNote?.notes) return null
    try {
      const parsed = JSON.parse(session.sessionNote.notes)
      if (parsed.formType === 'SLP_DAILY_NOTES') return parsed
    } catch {}
    return null
  }

  // Check if existing notes are structured SPED JSON
  function getSPEDData(): SPEDFormData | null {
    if (!session?.sessionNote?.notes) return null
    try {
      const parsed = JSON.parse(session.sessionNote.notes)
      if (parsed.formType === 'SPED16' || parsed.formType === 'SPED18') return parsed
    } catch {}
    return null
  }

  // Check if existing notes are structured PT JSON
  function getPTData(): PTFormData | null {
    if (!session?.sessionNote?.notes) return null
    try {
      const parsed = JSON.parse(session.sessionNote.notes)
      if (parsed.formType === 'PT_SESSION_NOTES') return parsed
    } catch {}
    return null
  }

  async function handlePsychEdit(data: PsychFormData) {
    setSubmitting(true)
    try {
      const newAttachments: { fileName: string; filePath: string; mimeType: string }[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('scheduleId', scheduleId)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        if (uploadRes.ok) newAttachments.push(await uploadRes.json())
      }

      const body: Record<string, unknown> = {
        notes: JSON.stringify(data),
        existingAttachments: keptAttachments,
      }
      if (newAttachments.length > 0) body.attachments = newAttachments

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
        const d = await res.json()
        showToast(d.error ?? 'Failed to update')
      }
    } catch { showToast('Failed to update notes') }
    setSubmitting(false)
  }

  async function handlePsychComplete(data: PsychFormData) {
    setSubmitting(true)
    try {
      // Upload any pending files
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
        body: JSON.stringify({ notes: JSON.stringify(data), attachments }),
      })
      if (res.ok) { showToast('Session completed'); setActionMode(null); setFiles([]); fetchSession() }
      else { const d = await res.json(); showToast(d.error ?? 'Failed') }
    } catch { showToast('Failed to complete session') }
    setSubmitting(false)
  }

  // Determine effective first-session status (with override)
  const effectiveFirstSession = isFirstSession && !overrideToProgress

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

      {/* Clear Form Prompt — when psych user switches to Upload/QR with existing form data */}
      {showClearFormPrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center animate-fade-up">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--charcoal)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              Existing Notes Detected
            </h3>
            <p className="text-[13px] text-[var(--mid-gray)] mb-5 leading-relaxed">
              This session already has filled-up form notes. Would you like to clear the form data and replace with uploads only, or keep the form data and just add attachments?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleClearFormChoice(false)}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-[var(--teal)] text-white hover:opacity-90 transition-opacity"
              >
                Keep form data & add attachments
              </button>
              <button
                onClick={() => handleClearFormChoice(true)}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
              >
                Clear form data (upload only)
              </button>
              <button
                onClick={() => { setShowClearFormPrompt(false); setClearFormTarget(null) }}
                className="w-full py-2 rounded-xl text-[12px] text-[var(--mid-gray)] hover:text-[var(--charcoal)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Capture Received Popup */}
      {captureReceived && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center animate-fade-up" onClick={() => setCaptureReceived(null)}>
          <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={36} className="text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Photo Received!
            </h3>
            <p className="text-[13px] text-[var(--mid-gray)] mb-1">
              The captured photo has been successfully attached to this session.
            </p>
            <p className="text-[12px] text-[var(--teal)] font-medium mb-5 truncate">
              {captureReceived}
            </p>
            <button
              onClick={() => setCaptureReceived(null)}
              className="btn-primary py-2.5 px-8 rounded-xl text-[13px]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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

          {/* Attachments — show FIRST so they're always visible */}
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

          {/* Notes display */}
          {session.sessionNote!.notes && (() => {
            try {
              const parsed = JSON.parse(session.sessionNote!.notes!)
              if (parsed.formType?.startsWith('PSYCH_')) {
                return <div className="mb-4"><PsychologyNoteDisplay data={parsed} /></div>
              }
              if (parsed.formType === 'OT_DAILY_NOTES') {
                return <div className="mb-4"><OTNoteDisplay data={parsed} /></div>
              }
              if (parsed.formType === 'SLP_DAILY_NOTES') {
                return <div className="mb-4"><SLPNoteDisplay data={parsed} /></div>
              }
              if (parsed.formType === 'SPED16' || parsed.formType === 'SPED18') {
                return <div className="mb-4"><SPEDNoteDisplay data={parsed} /></div>
              }
              if (parsed.formType === 'PT_SESSION_NOTES') {
                return <div className="mb-4"><PTNoteDisplay data={parsed} /></div>
              }
            } catch {}
            return (
              <div className="mb-4">
                <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1.5">Notes</p>
                <div className="text-sm whitespace-pre-wrap bg-[var(--off-white)] p-4 rounded-xl border border-[var(--light-gray)]">
                  {session.sessionNote!.notes}
                </div>
              </div>
            )
          })()}

          {session.sessionNote!.discontinuedRemarks && (
            <div className="mb-4">
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1.5">Reason</p>
              <div className="text-sm whitespace-pre-wrap bg-red-50 p-4 rounded-xl border border-red-100 text-red-800">
                {session.sessionNote!.discontinuedRemarks}
              </div>
            </div>
          )}

          {/* No notes and no attachments indicator */}
          {!session.sessionNote!.notes && (!session.sessionNote!.attachments || (session.sessionNote!.attachments as any[]).length === 0) && (
            <div className="mb-4 text-center py-6 bg-[var(--off-white)] rounded-xl border border-[var(--light-gray)]">
              <p className="text-[var(--mid-gray)] text-sm">No notes or attachments yet. Click Edit to add.</p>
            </div>
          )}

          {/* For Initial Evaluations the notes email is suppressed: the IE is
              delivered to the patient via "Send Email to Patient" on the
              uploaded IE document, which attaches the actual report. The notes
              email here has no attachment, so we direct the consultant instead. */}
          {session.sessionNote!.status === 'COMPLETED' && session.patient?.email && !isPsychDept && session.sessionNote!.isInitialEvaluation && (
            <div className="pt-4 border-t border-[var(--light-gray)]">
              <p className="text-sm text-[var(--mid-gray)] flex items-start gap-2">
                <Mail size={15} className="mt-0.5 shrink-0" />
                <span>This is an Initial Evaluation. To send it to the patient, use <strong>“Send Email to Patient”</strong> on the uploaded IE document — that email includes the report as an attachment.</span>
              </p>
            </div>
          )}

          {/* Send notes email — hidden for Psychology (internal only) and for IE (see above) */}
          {session.sessionNote!.status === 'COMPLETED' && session.patient?.email && !isPsychDept && !session.sessionNote!.isInitialEvaluation && (
            <div className="pt-4 border-t border-[var(--light-gray)]">
              {session.sessionNote!.emailSentAt && (
                <p className="text-sm text-green-600 flex items-center gap-2 font-medium mb-3">
                  <Mail size={15} />
                  Sent to {session.sessionNote!.emailSentTo} on {new Date(session.sessionNote!.emailSentAt).toLocaleDateString()}
                </p>
              )}
              <button
                onClick={() => {
                  if (session.sessionNote!.emailSentAt) {
                    if (confirm('This email was already sent. Do you want to resend it to the patient?')) {
                      handleSendEmail()
                    }
                  } else {
                    handleSendEmail()
                  }
                }}
                disabled={sendingEmail}
                className="btn-primary w-full py-3 rounded-xl"
              >
                {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {session.sessionNote!.emailSentAt ? 'Resend Notes to Patient\'s Email' : 'Send Notes to Patient\'s Email'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit form — Psychology structured notes (with toggle) */}
      {actionMode === 'edit' && session.sessionNote && isPsychDept && psychEditUseForm && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit Session Notes
          </h2>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button
              onClick={() => setPsychEditUseForm(true)}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white"
            >
              <FileText size={14} className="inline mr-1.5 -mt-0.5" />
              Use Form
            </button>
            <button
              onClick={() => handlePsychSwitchToUpload('edit')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors"
            >
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <PsychologyForm
            isFirstSession={getPsychData() ? getPsychData()!.formType === 'PSYCH_INITIAL' : isFirstSession}
            patientName={patientName}
            patientAge={session.patient?.dob ? String(Math.floor((Date.now() - new Date(session.patient.dob).getTime()) / 31557600000)) : null}
            sessionDate={formatDate(session.date)}
            onSubmit={handlePsychEdit}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychEditUseForm(true) }}
            initialData={getPsychData()}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* Edit form — OT structured notes (with toggle) */}
      {actionMode === 'edit' && session.sessionNote && isOTDept && psychEditUseForm && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit Session Notes — OT
          </h2>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button
              onClick={() => setPsychEditUseForm(true)}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white"
            >
              <FileText size={14} className="inline mr-1.5 -mt-0.5" />
              Use Form
            </button>
            <button
              onClick={() => handlePsychSwitchToUpload('edit')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors"
            >
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <OTNoteForm
            patientName={patientName}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                const res = await fetch(`/api/sessions/${scheduleId}/edit`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notes: JSON.stringify(data), existingAttachments: keptAttachments, attachments }),
                })
                if (res.ok) { showToast('Notes updated'); setActionMode(null); setFiles([]); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to update') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychEditUseForm(true) }}
            initialData={getOTData()}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* Edit form — SLP structured notes (with toggle) */}
      {actionMode === 'edit' && session.sessionNote && isSLPDept && psychEditUseForm && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit Session Notes — SLP
          </h2>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button onClick={() => setPsychEditUseForm(true)}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white">
              <FileText size={14} className="inline mr-1.5 -mt-0.5" />
              Use Form
            </button>
            <button onClick={() => handlePsychSwitchToUpload('edit')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors">
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <SLPNoteForm
            patientName={patientName}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                const res = await fetch(`/api/sessions/${scheduleId}/edit`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notes: JSON.stringify(data), existingAttachments: keptAttachments, attachments }),
                })
                if (res.ok) { showToast('Notes updated'); setActionMode(null); setFiles([]); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to update') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychEditUseForm(true) }}
            initialData={getSLPData()}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* Edit form — SPED structured notes (with 3-way toggle) */}
      {actionMode === 'edit' && session.sessionNote && isSPEDDept && psychEditUseForm && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit Session Notes — SPED
          </h2>

          {/* 3-way toggle */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button onClick={() => { setPsychEditUseForm(true); setSPEDFormVariant('SPED16') }}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${psychEditUseForm && spedFormVariant === 'SPED16' ? 'bg-purple-600 text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
              SPED16
            </button>
            <button onClick={() => { setPsychEditUseForm(true); setSPEDFormVariant('SPED18') }}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${psychEditUseForm && spedFormVariant === 'SPED18' ? 'bg-violet-600 text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
              SPED18
            </button>
            <button onClick={() => handlePsychSwitchToUpload('edit')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors">
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <SPEDNoteForm
            formVariant={spedFormVariant}
            patientName={patientName}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                const res = await fetch(`/api/sessions/${scheduleId}/edit`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notes: JSON.stringify(data), existingAttachments: keptAttachments, attachments }),
                })
                if (res.ok) { showToast('Notes updated'); setActionMode(null); setFiles([]); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to update') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychEditUseForm(true) }}
            initialData={getSPEDData()}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* Edit form — PT structured notes */}
      {actionMode === 'edit' && session.sessionNote && isPTDept && psychEditUseForm && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit Session Notes — PT
          </h2>

          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button onClick={() => setPsychEditUseForm(true)}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${psychEditUseForm ? 'bg-blue-600 text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
              <FileText size={14} className="inline mr-1.5 -mt-0.5" /> Use Form
            </button>
            <button onClick={() => handlePsychSwitchToUpload('edit')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors">
              <Upload size={14} className="inline mr-1.5 -mt-0.5" /> Upload / QR
            </button>
          </div>

          <PTNoteForm
            patientName={patientName}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                const res = await fetch(`/api/sessions/${scheduleId}/edit`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notes: JSON.stringify(data), existingAttachments: keptAttachments, attachments }),
                })
                if (res.ok) { showToast('Notes updated'); setActionMode(null); setFiles([]); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to update') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychEditUseForm(true) }}
            initialData={getPTData()}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* Edit form — Generic notes (or structured form depts in upload mode) */}
      {actionMode === 'edit' && session.sessionNote && (!hasStructuredForm || !psychEditUseForm) && (
        <div className="card-static mb-6 animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <Pencil size={20} className="text-[var(--teal)]" />
            Edit {session.sessionNote.status === 'COMPLETED' ? 'Session Notes' : 'Discontinuation Remarks'}
          </h2>

          {/* Structured form toggle — so they can switch back to form */}
          {hasStructuredForm && session.sessionNote.status === 'COMPLETED' && (
            <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
              <button
                onClick={() => setPsychEditUseForm(true)}
                className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors"
              >
                <FileText size={14} className="inline mr-1.5 -mt-0.5" />
                Use Form
              </button>
              <button
                onClick={() => setPsychEditUseForm(false)}
                className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white"
              >
                <Upload size={14} className="inline mr-1.5 -mt-0.5" />
                Upload / QR
              </button>
            </div>
          )}

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
                  <button onClick={() => { setQrUrl(null); if (qrPollRef.current) clearInterval(qrPollRef.current) }} className="mt-3 text-[12px] text-[var(--mid-gray)] hover:text-[var(--charcoal)] font-medium">Dismiss</button>
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

              {/* Hide Session Notes textarea for structured form depts (they use the form) */}
              {!hasStructuredForm && (
                <div className="mb-6">
                  <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Session Notes</label>
                  <textarea id="notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Enter session notes here..."
                    className="input resize-y !rounded-xl" />
                </div>
              )}
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
            <button onClick={() => { setActionMode(null); setFiles([]); setNotes(''); setRemarks(''); { setQrUrl(null); if (qrPollRef.current) clearInterval(qrPollRef.current) } }} className="btn-secondary px-6 rounded-xl">Cancel</button>
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

      {/* IE Flag Gate — for PT/OT/SLP/SPED only, shown after clicking Complete */}
      {actionMode === 'complete' && supportsIEFlag && ieMode === 'PENDING' && session.patient && (
        <div className="card-static animate-gate mb-6">
          <h2 className="font-bold text-[var(--charcoal)] mb-2 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session
          </h2>
          <p className="text-[12px] text-[var(--mid-gray)] mb-4">Choose how you want to record this session.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <button
              onClick={() => setIEMode('DAILY_NOTES')}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-[var(--light-gray)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all text-left"
            >
              <FileText size={20} className="text-[var(--teal)]" />
              <span className="font-bold text-[14px] text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
                Regular Daily Notes
              </span>
              <span className="text-[11px] text-[var(--mid-gray)] leading-snug">
                Fill out the standard Daily Notes form for this session.
              </span>
            </button>
            <button
              onClick={() => setIEMode('INITIAL_EVAL')}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-[#cf9d88]/30 bg-[#cf9d88]/5 hover:border-[#cf9d88] hover:bg-[#cf9d88]/10 transition-all text-left"
            >
              <ClipboardList size={20} style={{ color: '#cf9d88' }} />
              <span className="font-bold text-[14px] text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
                ✓ This session is Initial Evaluation
              </span>
              <span className="text-[11px] text-[var(--mid-gray)] leading-snug">
                Skip Daily Notes — upload IE Report directly to the patient&apos;s Initial Evaluation section.
              </span>
            </button>
          </div>

          <button
            onClick={() => { setActionMode(null); setIEMode('PENDING') }}
            className="text-[12px] text-[var(--mid-gray)] hover:text-[var(--teal)] font-medium"
          >
            ← Cancel
          </button>
        </div>
      )}

      {/* Initial Evaluation upload form (when user chose IE for PT/OT/SLP/SPED) */}
      {actionMode === 'complete' && supportsIEFlag && ieMode === 'INITIAL_EVAL' && session.patient && (
        <div className="card-static animate-gate mb-6">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <ClipboardList size={20} style={{ color: '#cf9d88' }} />
            Upload Initial Evaluation Report
          </h2>

          <p className="text-[12px] text-[var(--mid-gray)] mb-4 leading-relaxed">
            This will mark the session as completed (Initial Evaluation) and save the IE report directly under the patient&apos;s <strong>Initial Evaluation/Re-evaluation</strong> section. No Daily Notes form will be filled out.
          </p>

          <div className="mb-4">
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">IE Report File</label>
            <label className="flex items-center justify-center gap-2 w-full py-4 px-4 rounded-xl border-2 border-dashed border-[var(--light-gray)] text-[13px] font-medium text-[var(--teal)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all cursor-pointer">
              <Upload size={16} />
              {ieFile ? ieFile.name : 'Choose PDF or Word document'}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setIEFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Description (optional)</label>
            <input
              value={ieDescription}
              onChange={(e) => setIEDescription(e.target.value)}
              className="input text-[13px]"
              placeholder="e.g. Initial Evaluation - PT, March 2026"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (!ieFile) { showToast('Please select an IE report file'); return }
                if (!session.patient) return
                setSubmitting(true)
                try {
                  // Step 1: upload to patient documents (INITIAL_EVALUATION)
                  const fd = new FormData()
                  fd.append('file', ieFile)
                  fd.append('documentType', 'INITIAL_EVALUATION')
                  if (ieDescription) fd.append('description', ieDescription)
                  fd.append('scheduleId', scheduleId)
                  const upRes = await fetch(`/api/patients/${session.patient.id}/documents`, {
                    method: 'POST',
                    body: fd,
                  })
                  if (!upRes.ok) {
                    const e = await upRes.json()
                    showToast(e.error ?? 'Upload failed')
                    setSubmitting(false)
                    return
                  }
                  // Step 2: mark session as Completed + isInitialEvaluation
                  const compRes = await fetch(`/api/sessions/${scheduleId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      notes: 'Initial Evaluation — see uploaded IE report.',
                      attachments: [],
                      isInitialEvaluation: true,
                    }),
                  })
                  if (compRes.ok) {
                    showToast('Session completed as Initial Evaluation')
                    setActionMode(null)
                    setIEMode('PENDING')
                    setIEFile(null)
                    setIEDescription('')
                    fetchSession()
                  } else {
                    const e = await compRes.json()
                    showToast(e.error ?? 'Failed')
                  }
                } catch { showToast('Failed') }
                setSubmitting(false)
              }}
              disabled={submitting || !ieFile}
              className="btn-primary flex-1 py-3 rounded-xl !bg-gradient-to-r !from-[#cf9d88] !to-[#c69849]"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save IE & Complete Session
            </button>
            <button
              onClick={() => { setIEMode('DAILY_NOTES'); setIEFile(null); setIEDescription('') }}
              className="btn-secondary px-6 rounded-xl"
              title="Switch to the regular Daily Notes form instead"
            >
              <FileText size={14} className="-ml-1 mr-1" />
              Use Daily Notes instead
            </button>
          </div>

          {/* Footer hint: way back to the choice screen */}
          <div className="mt-3 pt-3 border-t border-[var(--light-gray)] text-center">
            <button
              onClick={() => { setIEMode('PENDING'); setIEFile(null); setIEDescription('') }}
              className="text-[11px] text-[var(--mid-gray)] hover:text-[var(--teal)] underline"
            >
              ← Back to choice screen
            </button>
          </div>
        </div>
      )}

      {/* IE toggle banner — shown above daily-notes form so user can switch to IE upload if they misclicked */}
      {actionMode === 'complete' && supportsIEFlag && ieMode === 'DAILY_NOTES' && session.patient && (
        <div className="mb-3 rounded-xl border-2 border-[#c69849]/30 bg-[#c69849]/5 px-4 py-3 flex items-center gap-3 animate-fade-up">
          <ClipboardList size={16} style={{ color: '#cf9d88' }} className="shrink-0" />
          <p className="flex-1 text-[12px] text-[var(--charcoal)] leading-snug">
            Was this an <strong>Initial Evaluation</strong> instead?
          </p>
          <button
            onClick={() => { setIEMode('INITIAL_EVAL'); setNotes(''); setFiles([]) }}
            className="text-[12px] font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg bg-[#cf9d88] text-white hover:bg-[#c69849] transition-colors"
          >
            Switch to IE upload
          </button>
        </div>
      )}

      {/* Complete form */}
      {actionMode === 'complete' && isPsychDept && session.patient && psychUseForm && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session — Psychology
          </h2>

          {/* Mode toggle: Form vs Upload/QR */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button
              onClick={() => setPsychUseForm(true)}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white"
            >
              <FileText size={14} className="inline mr-1.5 -mt-0.5" />
              Use Form
            </button>
            <button
              onClick={() => handlePsychSwitchToUpload('complete')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors"
            >
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          {/* Override toggle for first session */}
          {isFirstSession && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 p-3 rounded-xl border border-amber-200">
              <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                <input
                  type="checkbox"
                  checked={overrideToProgress}
                  onChange={(e) => setOverrideToProgress(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-amber-800 font-medium">
                  Use Progress Notes form instead (returning patient)
                </span>
              </label>
            </div>
          )}

          <PsychologyForm
            isFirstSession={effectiveFirstSession}
            patientName={`${session.patient.firstName} ${session.patient.lastName}`}
            patientAge={session.patient.dob ? String(Math.floor((Date.now() - new Date(session.patient.dob).getTime()) / 31557600000)) : null}
            sessionDate={formatDate(session.date)}
            onSubmit={handlePsychComplete}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setOverrideToProgress(false); setPsychUseForm(true) }}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* OT Complete form */}
      {actionMode === 'complete' && isOTDept && session.patient && psychUseForm && ieMode === 'DAILY_NOTES' && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session — OT Daily Notes
          </h2>

          {/* Mode toggle: Form vs Upload/QR */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button
              onClick={() => setPsychUseForm(true)}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white"
            >
              <FileText size={14} className="inline mr-1.5 -mt-0.5" />
              Use Form
            </button>
            <button
              onClick={() => handlePsychSwitchToUpload('complete')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors"
            >
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <OTNoteForm
            patientName={`${session.patient.firstName} ${session.patient.lastName}`}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                  body: JSON.stringify({ notes: JSON.stringify(data), attachments }),
                })
                if (res.ok) { showToast('Session completed'); setActionMode(null); setFiles([]); setNotes(''); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to complete session') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychUseForm(true) }}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* SLP Complete form */}
      {actionMode === 'complete' && isSLPDept && session.patient && psychUseForm && ieMode === 'DAILY_NOTES' && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session — SLP Daily Notes
          </h2>

          {/* Mode toggle: Form vs Upload/QR */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button onClick={() => setPsychUseForm(true)}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white">
              <FileText size={14} className="inline mr-1.5 -mt-0.5" />
              Use Form
            </button>
            <button onClick={() => handlePsychSwitchToUpload('complete')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors">
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <SLPNoteForm
            patientName={`${session.patient.firstName} ${session.patient.lastName}`}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                  body: JSON.stringify({ notes: JSON.stringify(data), attachments }),
                })
                if (res.ok) { showToast('Session completed'); setActionMode(null); setFiles([]); setNotes(''); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to complete session') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychUseForm(true) }}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* SPED Complete form — with 3-way toggle */}
      {actionMode === 'complete' && isSPEDDept && session.patient && psychUseForm && ieMode === 'DAILY_NOTES' && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session — SPED
          </h2>

          {/* 3-way toggle: SPED16 / SPED18 / Upload/QR */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button onClick={() => { setPsychUseForm(true); setSPEDFormVariant('SPED16') }}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${psychUseForm && spedFormVariant === 'SPED16' ? 'bg-purple-600 text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
              SPED16
            </button>
            <button onClick={() => { setPsychUseForm(true); setSPEDFormVariant('SPED18') }}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${psychUseForm && spedFormVariant === 'SPED18' ? 'bg-violet-600 text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
              SPED18
            </button>
            <button onClick={() => handlePsychSwitchToUpload('complete')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors">
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              Upload / QR
            </button>
          </div>

          <SPEDNoteForm
            formVariant={spedFormVariant}
            patientName={`${session.patient.firstName} ${session.patient.lastName}`}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                  body: JSON.stringify({ notes: JSON.stringify(data), attachments }),
                })
                if (res.ok) { showToast('Session completed'); setActionMode(null); setFiles([]); setNotes(''); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to complete session') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychUseForm(true) }}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* PT Complete form */}
      {actionMode === 'complete' && isPTDept && session.patient && psychUseForm && ieMode === 'DAILY_NOTES' && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session — PT Session Notes
          </h2>

          <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
            <button onClick={() => setPsychUseForm(true)}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${psychUseForm ? 'bg-blue-600 text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
              <FileText size={14} className="inline mr-1.5 -mt-0.5" /> Use Form
            </button>
            <button onClick={() => handlePsychSwitchToUpload('complete')}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors">
              <Upload size={14} className="inline mr-1.5 -mt-0.5" /> Upload / QR
            </button>
          </div>

          <PTNoteForm
            patientName={`${session.patient.firstName} ${session.patient.lastName}`}
            sessionDate={formatDate(session.date)}
            onSubmit={async (data) => {
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
                  body: JSON.stringify({ notes: JSON.stringify(data), attachments }),
                })
                if (res.ok) { showToast('Session completed'); setActionMode(null); setFiles([]); setNotes(''); fetchSession() }
                else { const d = await res.json(); showToast(d.error ?? 'Failed') }
              } catch { showToast('Failed to complete session') }
              setSubmitting(false)
            }}
            submitting={submitting}
            onCancel={() => { setActionMode(null); setFiles([]); setPsychUseForm(true) }}
            clinicianSettings={clinicianSettings}
          />
        </div>
      )}

      {/* Upload/QR/Write mode — shown for non-structured-form depts OR structured-form depts when they chose Upload mode */}
      {actionMode === 'complete' && (!hasStructuredForm || !psychUseForm) && (!supportsIEFlag || ieMode === 'DAILY_NOTES') && (
        <div className="card-static animate-gate">
          <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <CheckCircle2 size={20} className="text-green-500" />
            Complete Session
          </h2>

          {/* Structured form toggle — so they can switch back to form */}
          {hasStructuredForm && (
            <div className="flex rounded-xl overflow-hidden border border-[var(--light-gray)] mb-5">
              <button
                onClick={() => setPsychUseForm(true)}
                className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100 transition-colors"
              >
                <FileText size={14} className="inline mr-1.5 -mt-0.5" />
                Use Form
              </button>
              <button
                onClick={() => setPsychUseForm(false)}
                className="flex-1 py-2.5 text-[13px] font-semibold bg-[var(--teal)] text-white"
              >
                <Upload size={14} className="inline mr-1.5 -mt-0.5" />
                Upload / QR
              </button>
            </div>
          )}

          <div className={`grid grid-cols-1 ${hasStructuredForm ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3 mb-6`}>
            {[
              { icon: Upload, label: 'Upload Photo/PDF', onClick: () => fileInputRef.current?.click() },
              { icon: QrCode, label: 'QR Camera Capture', onClick: generateQR },
              ...(!hasStructuredForm ? [{ icon: FileText, label: 'Write Notes', onClick: () => document.getElementById('notes-area')?.focus() }] : []),
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
              <button onClick={() => { setQrUrl(null); if (qrPollRef.current) clearInterval(qrPollRef.current) }} className="mt-3 text-[12px] text-[var(--mid-gray)] hover:text-[var(--charcoal)] font-medium">Dismiss</button>
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

          {/* Hide Session Notes textarea for structured form depts (they use the form) */}
          {!hasStructuredForm && (
            <div className="mb-6">
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Session Notes</label>
              <textarea id="notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Enter session notes here..."
                className="input resize-y !rounded-xl" />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleComplete} disabled={submitting || (!hasStructuredForm && !notes.trim() && files.length === 0)}
              className="btn-primary flex-1 py-3 rounded-xl !bg-gradient-to-r !from-green-600 !to-green-700 !shadow-[0_2px_8px_rgba(22,163,74,0.3)]">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save & Complete
            </button>
            <button onClick={() => { setActionMode(null); setFiles([]); setNotes(''); { setQrUrl(null); if (qrPollRef.current) clearInterval(qrPollRef.current) } }} className="btn-secondary px-6 rounded-xl">Cancel</button>
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
