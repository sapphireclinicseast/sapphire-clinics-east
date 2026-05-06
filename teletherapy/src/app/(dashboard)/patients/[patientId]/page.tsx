'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Paperclip,
  Calendar,
  Clock,
  Stethoscope,
  ArrowRightLeft,
  UserX,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Pencil,
  ExternalLink,
  Info,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'
import { formatTime, formatDate } from '@/lib/utils'
import PsychologyNoteDisplay from '@/components/PsychologyNoteDisplay'
import OTNoteDisplay from '@/components/OTNoteDisplay'
import SLPNoteDisplay from '@/components/SLPNoteDisplay'
import SPEDNoteDisplay from '@/components/SPEDNoteDisplay'
import PTNoteDisplay from '@/components/PTNoteDisplay'
import PatientWidgets from '@/components/PatientWidgets'

interface PatientDetail {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  patientType: string
  diagnosis: string | null
  dob: string | null
  sex: string | null
  city?: string | null
  address?: string | null
  referralUrl?: string | null
}

interface SessionItem {
  id: string
  date: string
  startTime: string
  endTime: string
  sessionType: string
  status: string
  staff: { firstName: string; lastName: string; department: string }
  sessionNote: {
    id: string
    status: string
    notes: string | null
    attachments: any[] | null
    discontinuedRemarks: string | null
    emailSentAt: string | null
    createdAt: string
  } | null
}

interface StaffOption {
  accountId: string
  name: string
  department: string
  branch: string
}

export default function PatientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.patientId as string

  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [otherServices, setOtherServices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  // Session history filters + collapsibility
  const [historyOpen, setHistoryOpen] = useState(true)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Endorse state
  const [showEndorse, setShowEndorse] = useState(false)
  const [endorseStaff, setEndorseStaff] = useState<StaffOption[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [endorsing, setEndorsing] = useState(false)

  // Discharge state
  const [showDischarge, setShowDischarge] = useState(false)
  const [dischargeRemarks, setDischargeRemarks] = useState('')
  const [discharging, setDischarging] = useState(false)
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [readmitting, setReadmitting] = useState(false)

  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { fetchPatient() }, [patientId])

  async function fetchPatient() {
    setLoading(true)
    try {
      const res = await fetch(`/api/patients/${patientId}`)
      if (res.ok) {
        const data = await res.json()
        setPatient(data.patient)
        setSessions(data.sessions)
        setOtherServices(data.otherServices ?? [])
        setAssignmentStatus(data.assignment?.status ?? null)
        setReadOnly(!!data.readOnly)
      }
    } catch {}
    setLoading(false)
  }

  async function loadEndorseStaff() {
    setShowEndorse(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/endorse`)
      if (res.ok) {
        const data = await res.json()
        setEndorseStaff(data.staff)
      }
    } catch {}
  }

  async function handleEndorse() {
    if (!selectedStaff) { showToast('Please select a clinician'); return }
    setEndorsing(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/endorse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endorseToAccountId: selectedStaff }),
      })
      if (res.ok) {
        const data = await res.json()
        showToast(data.message)
        setShowEndorse(false)
        setSelectedStaff('')
        fetchPatient()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Endorsement failed')
      }
    } catch { showToast('Endorsement failed') }
    setEndorsing(false)
  }

  async function handleDischarge() {
    if (!dischargeRemarks.trim()) { showToast('Please provide discharge remarks'); return }
    setDischarging(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/discharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: dischargeRemarks }),
      })
      if (res.ok) {
        showToast('Patient discharged')
        setShowDischarge(false)
        setDischargeRemarks('')
        fetchPatient()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Discharge failed')
      }
    } catch { showToast('Discharge failed') }
    setDischarging(false)
  }

  async function handleReadmit() {
    if (!confirm('Re-admit this patient as active?')) return
    setReadmitting(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/readmit`, { method: 'POST' })
      if (res.ok) {
        showToast('Patient re-admitted')
        fetchPatient()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Re-admit failed')
      }
    } catch { showToast('Re-admit failed') }
    setReadmitting(false)
  }

  async function handleDeleteNote(scheduleId: string) {
    if (!confirm('Are you sure you want to delete this session note? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/sessions/${scheduleId}/delete-note`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Note deleted')
        fetchPatient()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Failed to delete')
      }
    } catch { showToast('Failed to delete note') }
  }

  async function handleDeleteAttachment(scheduleId: string, attachmentIndex: number) {
    if (!confirm('Delete this attachment?')) return
    const session = sessions.find((s) => s.id === scheduleId)
    if (!session?.sessionNote?.attachments) return

    const kept = (session.sessionNote.attachments as any[]).filter((_: any, i: number) => i !== attachmentIndex)

    try {
      const res = await fetch(`/api/sessions/${scheduleId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ existingAttachments: kept }),
      })
      if (res.ok) {
        showToast('Attachment deleted')
        fetchPatient()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Failed')
      }
    } catch { showToast('Failed to delete attachment') }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" />
        <p className="text-sm text-[var(--mid-gray)]">Loading patient...</p>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="card-static text-center py-16 max-w-lg mx-auto">
        <p className="text-[var(--mid-gray)] font-medium">Patient not found</p>
        <button onClick={() => router.push('/patients')} className="mt-3 text-[var(--teal)] text-sm hover:underline">
          Back to Patients
        </button>
      </div>
    )
  }

  const patientName = `${patient.firstName} ${patient.lastName}`
  const completedCount = sessions.filter((s) => s.sessionNote?.status === 'COMPLETED').length
  const totalCount = sessions.length

  return (
    <div className="max-w-7xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {/* Back */}
      <button
        onClick={() => router.push('/patients')}
        className="flex items-center gap-1.5 text-[13px] text-[var(--mid-gray)] hover:text-[var(--teal)] mb-6 transition-colors font-medium"
      >
        <ArrowLeft size={16} />
        Back to Patients
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="min-w-0">

      {/* Patient header */}
      <div className="hero-gradient rounded-2xl p-6 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm border border-white/20">
            {patient.firstName[0]}{patient.lastName[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{patientName}</h1>
            <p className="text-white/60 text-sm mt-0.5">
              {patient.patientType} {patient.diagnosis ? `· ${patient.diagnosis}` : ''}
              {patient.email ? ` · ${patient.email}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card-static !p-4 animate-fade-up stagger-1">
          <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">Total Sessions</p>
          <p className="text-2xl font-bold text-[var(--charcoal)]">{totalCount}</p>
        </div>
        <div className="card-static !p-4 animate-fade-up stagger-2">
          <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-600">{completedCount}</p>
        </div>
      </div>

      {/* Read-only banner — visible whenever this clinician no longer
          owns the patient (endorsed away or discharged). The patient
          and their notes are still visible for continuity of care, but
          we hide the write-action buttons. */}
      {readOnly && (
        <div className="card-static !p-4 mb-4 animate-fade-up stagger-3 border-l-4 border-[var(--mid-gray)] bg-[var(--paper-2)]/40">
          <p className="text-[13px] font-semibold text-[var(--narra)] mb-1 flex items-center gap-2">
            <ShieldAlert size={15} className="text-[var(--mid-gray)]" />
            Read-only — you don&rsquo;t currently own this patient
          </p>
          <p className="text-[12px] text-[var(--mid-gray)] leading-relaxed">
            {assignmentStatus === 'DISCHARGED'
              ? 'This patient was discharged. You can review past sessions and notes, but cannot edit them. Re-admit if the patient returns to your care.'
              : 'You endorsed this patient to another clinician. You can still view all sessions and notes (yours and theirs going forward) for continuity of care, but cannot make new edits unless they endorse the patient back to you.'}
          </p>
        </div>
      )}

      {/* Action buttons — hidden in read-only mode */}
      {!readOnly && (
        <div className="flex gap-3 mb-6 animate-fade-up stagger-3">
          <button
            onClick={loadEndorseStaff}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            <ArrowRightLeft size={18} />
            Endorse to
          </button>
          <button
            onClick={() => setShowDischarge(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
          >
            <UserX size={18} />
            Discharged
          </button>
        </div>
      )}
      {readOnly && assignmentStatus === 'DISCHARGED' && (
        <div className="flex gap-3 mb-6 animate-fade-up stagger-3">
          <button
            onClick={handleReadmit}
            disabled={readmitting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
            title="Re-admit this patient as active"
          >
            {readmitting ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
            Re-admit
          </button>
        </div>
      )}

      {/* Endorse modal */}
      {showEndorse && (
        <div className="card-static mb-6 animate-gate">
          <h3 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <ArrowRightLeft size={18} className="text-amber-600" />
            Endorse Patient
          </h3>
          <p className="text-sm text-[var(--mid-gray)] mb-4">
            Select a clinician from the same department. All past session notes will be accessible to them.
          </p>
          {endorseStaff.length === 0 ? (
            <p className="text-sm text-[var(--mid-gray)] italic">No other clinicians found in your department.</p>
          ) : (
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="input !rounded-xl mb-4"
            >
              <option value="">Select clinician...</option>
              {endorseStaff.map((s) => (
                <option key={s.accountId} value={s.accountId}>
                  {s.name} ({s.department}) - {s.branch}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-3">
            <button onClick={handleEndorse} disabled={endorsing || !selectedStaff}
              className="btn-primary flex-1 py-2.5 rounded-xl !bg-amber-600 !shadow-[0_2px_8px_rgba(217,119,6,0.3)]">
              {endorsing ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
              Confirm Endorsement
            </button>
            <button onClick={() => { setShowEndorse(false); setSelectedStaff('') }} className="btn-secondary px-5 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Discharge modal */}
      {showDischarge && (
        <div className="card-static mb-6 animate-gate">
          <h3 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <UserX size={18} className="text-red-500" />
            Discharge Patient
          </h3>
          <div className="mb-4">
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2">
              Remarks <span className="text-red-500">*</span>
            </label>
            <textarea
              value={dischargeRemarks}
              onChange={(e) => setDischargeRemarks(e.target.value)}
              rows={4}
              placeholder="Reason for discharge..."
              className="input resize-y !rounded-xl"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button onClick={handleDischarge} disabled={discharging || !dischargeRemarks.trim()} className="btn-danger flex-1 py-2.5 rounded-xl">
              {discharging ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
              Confirm Discharge
            </button>
            <button onClick={() => { setShowDischarge(false); setDischargeRemarks('') }} className="btn-secondary px-5 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Other Services Notice — patient confidentiality */}
      {otherServices.length > 0 && (
        <div className="mb-6 animate-fade-up stagger-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <ShieldAlert size={20} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-blue-800 mb-1">
                Other Services Availed in the Clinic: {otherServices.join(', ')}
              </p>
              <p className="text-[12px] text-blue-600 leading-relaxed">
                This patient is also receiving services from other departments. For patient confidentiality, only your sessions are displayed here. Coordinate with the front desk for information if needed for interprofessional collaboration.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Session history */}
      <div className="animate-fade-up stagger-4">
        <button
          type="button"
          onClick={() => setHistoryOpen(!historyOpen)}
          className="w-full flex items-center gap-2 mb-4 group"
        >
          <FileText size={18} className="text-[var(--teal)]" />
          <h2 className="font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            Session History
            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-[var(--teal)] text-white text-[10px] font-bold">
              {(() => {
                const from = filterFrom ? new Date(filterFrom).getTime() : -Infinity
                const to = filterTo ? new Date(filterTo).getTime() + 86400000 : Infinity
                return sessions.filter(s => {
                  const t = new Date(s.date).getTime()
                  return t >= from && t < to
                }).length
              })()}
            </span>
          </h2>
          <div className="ml-auto text-[var(--mid-gray)] group-hover:text-[var(--teal)] transition-colors">
            {historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {historyOpen && (
        <>
        {/* Date range filter */}
        <div className="card-static !p-3 mb-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--mid-gray)] uppercase tracking-wider shrink-0">
            <Calendar size={13} />
            Filter by date
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1 w-full">
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-[var(--mid-gray)]">From</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="px-2 py-1 text-[12px] rounded-lg border border-[var(--light-gray)] bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-[var(--mid-gray)]">To</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="px-2 py-1 text-[12px] rounded-lg border border-[var(--light-gray)] bg-white"
              />
            </div>
            {(filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterFrom(''); setFilterTo('') }}
                className="text-[11px] text-[var(--mid-gray)] hover:text-[var(--teal)] underline ml-auto"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="card-static text-center py-12">
            <Calendar className="w-10 h-10 text-[var(--light-gray)] mx-auto mb-2" />
            <p className="text-[var(--mid-gray)]">No confirmed sessions found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.filter(s => {
              const t = new Date(s.date).getTime()
              const from = filterFrom ? new Date(filterFrom).getTime() : -Infinity
              const to = filterTo ? new Date(filterTo).getTime() + 86400000 : Infinity
              return t >= from && t < to
            }).map((s) => {
              const expanded = expandedSession === s.id
              return (
                <div key={s.id} className="card-static !p-0 overflow-hidden">
                  <button
                    onClick={() => setExpandedSession(expanded ? null : s.id)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-[var(--off-white)] transition-colors text-left"
                  >
                    <div className="shrink-0">
                      {s.sessionNote?.status === 'COMPLETED' ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                      ) : s.sessionNote?.status === 'DISCONTINUED' ? (
                        <XCircle size={20} className="text-red-500" />
                      ) : (
                        <Clock size={20} className="text-[var(--mid-gray)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-[var(--charcoal)]">
                          {formatDate(s.date)}
                        </p>
                        <span className="text-[11px] text-[var(--mid-gray)]">
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--mid-gray)]">
                        {s.sessionType} · {s.staff.lastName} ({s.staff.department})
                      </p>
                    </div>
                    {!s.sessionNote && (
                      <span className="text-[11px] text-amber-600 font-medium mr-1">Pending</span>
                    )}
                    {expanded ? <ChevronUp size={16} className="text-[var(--mid-gray)]" /> : <ChevronDown size={16} className="text-[var(--mid-gray)]" />}
                  </button>

                  {/* Expanded: no notes yet — show action buttons */}
                  {expanded && !s.sessionNote && (
                    <div className="px-4 pb-4 pt-0 border-t border-[var(--light-gray)]">
                      <div className="pt-3">
                        <p className="text-[13px] text-[var(--mid-gray)] mb-3">
                          No notes recorded for this session. You can add notes now:
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => router.push(`/session/${s.id}?action=complete`)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            <CheckCircle2 size={16} />
                            Completed
                          </button>
                          <button
                            onClick={() => router.push(`/session/${s.id}?action=discontinue`)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                          >
                            <XCircle size={16} />
                            Discontinued
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded notes */}
                  {expanded && s.sessionNote && (
                    <div className="px-4 pb-4 pt-0 border-t border-[var(--light-gray)]">
                      <div className="pt-3">
                        {s.sessionNote.notes && (() => {
                          try {
                            const parsed = JSON.parse(s.sessionNote.notes!)
                            if (parsed.formType?.startsWith('PSYCH_')) {
                              return <div className="mb-3"><PsychologyNoteDisplay data={parsed} /></div>
                            }
                            if (parsed.formType === 'OT_DAILY_NOTES') {
                              return <div className="mb-3"><OTNoteDisplay data={parsed} /></div>
                            }
                            if (parsed.formType === 'SLP_DAILY_NOTES') {
                              return <div className="mb-3"><SLPNoteDisplay data={parsed} /></div>
                            }
                            if (parsed.formType === 'SPED16' || parsed.formType === 'SPED18') {
                              return <div className="mb-3"><SPEDNoteDisplay data={parsed} /></div>
                            }
                            if (parsed.formType === 'PT_SESSION_NOTES') {
                              return <div className="mb-3"><PTNoteDisplay data={parsed} /></div>
                            }
                          } catch {}
                          return (
                            <div className="mb-3">
                              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">Notes</p>
                              <div className="text-sm whitespace-pre-wrap bg-[var(--off-white)] p-3 rounded-lg border border-[var(--light-gray)]">
                                {s.sessionNote.notes}
                              </div>
                            </div>
                          )
                        })()}

                        {s.sessionNote.discontinuedRemarks && (
                          <div className="mb-3">
                            <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">Reason</p>
                            <div className="text-sm whitespace-pre-wrap bg-red-50 p-3 rounded-lg border border-red-100 text-red-800">
                              {s.sessionNote.discontinuedRemarks}
                            </div>
                          </div>
                        )}

                        {s.sessionNote.attachments && (s.sessionNote.attachments as any[]).length > 0 && (
                          <div className="mb-3">
                            <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">Attachments</p>
                            <div className="space-y-1.5">
                              {(s.sessionNote.attachments as any[]).map((att: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-[var(--off-white)] px-3 py-2 rounded-lg border border-[var(--light-gray)]">
                                  <a href={`/api/upload/${att.filePath}`} target="_blank"
                                     className="flex items-center gap-1.5 text-[12px] text-[var(--teal)] hover:underline font-medium truncate">
                                    <Paperclip size={12} />
                                    {att.fileName}
                                  </a>
                                  <button
                                    onClick={() => handleDeleteAttachment(s.id, i)}
                                    className="text-[var(--mid-gray)] hover:text-red-500 shrink-0 ml-2 p-0.5"
                                    title="Delete attachment"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="pt-3 border-t border-[var(--light-gray)] flex items-center justify-between">
                          <button
                            onClick={() => router.push(`/session/${s.id}?edit=true`)}
                            className="flex items-center gap-1.5 text-[12px] text-[var(--teal)] hover:underline font-medium transition-colors"
                          >
                            <Pencil size={13} />
                            Edit notes
                          </button>
                          <button
                            onClick={() => handleDeleteNote(s.id)}
                            className="flex items-center gap-1.5 text-[12px] text-red-500 hover:text-red-700 font-medium transition-colors"
                          >
                            <Trash2 size={13} />
                            Delete note
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        </>
        )}
      </div>
        </div>

        {/* Right sidebar: Patient Widgets */}
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
          <PatientWidgets patient={patient} canManage={true} />
        </aside>
      </div>
    </div>
  )
}
