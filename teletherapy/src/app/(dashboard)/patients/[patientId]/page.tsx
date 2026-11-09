'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Paperclip,
  Calendar,
  Clock,
  ArrowRightLeft,
  UserX,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Pencil,
  UserCheck,
  Eye,
  Lock,
  ShieldX,
  Unlock,
  Inbox,
} from 'lucide-react'
import { formatTime, formatDate, cn } from '@/lib/utils'
import PsychologyNoteDisplay from '@/components/PsychologyNoteDisplay'
import OTNoteDisplay from '@/components/OTNoteDisplay'
import SLPNoteDisplay from '@/components/SLPNoteDisplay'
import SPEDNoteDisplay from '@/components/SPEDNoteDisplay'
import PTNoteDisplay from '@/components/PTNoteDisplay'
import PatientWidgets from '@/components/PatientWidgets'
import PatientUploads from '@/components/PatientUploads'
import {
  Avatar, Banner, Dialog, EmptyState, KpiCard, PillTabs, Skeleton, StatusPill, Tag,
  BTN_DANGER_GHOST, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE,
  DANGER, FOCUS, LABEL, LABEL_STYLE, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, TEXTAREA,
} from '@/components/hub/ui'
import { NOTE_WINDOW_MONTHS } from '@/lib/note-age-lock'

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
  pwdIdUrl?: string | null
  pwdSeniorId?: string | null
}

interface SessionItem {
  id: string
  date: string
  startTime: string
  endTime: string
  sessionType: string
  status: string
  staff: { id: string; firstName: string; lastName: string; department: string }
  sessionNote: {
    id: string
    status: string
    notes: string | null
    attachments: any[] | null
    discontinuedRemarks: string | null
    emailSentAt: string | null
    createdAt: string
    // Permanent freeze marker. Set when the authoring clinician was
    // endorsed/discharged off the patient. The UI uses it to render
    // a "View only — signed by …" footer; canEdit also falls to false.
    lockedAt: string | null
  } | null
  // Server-computed: true iff the logged-in clinician is the staff who
  // delivered this session AND is currently the active owner of the
  // patient AND the note is neither signed nor aged out. Admins always
  // get true.
  canEdit?: boolean
  // Server-computed: the session is past the documentation window and
  // nobody has re-opened it. Unlike lockedAt this is reversible, so the
  // footer points at the session page where the re-enable lives.
  ageLocked?: boolean
}

interface StaffOption {
  accountId: string
  name: string
  department: string
  branch: string
}

// Read-only document from another department (IE / Progress Report / other upload).
interface OtherDeptDoc {
  id: string
  department: string
  documentType: string
  fileName: string
  filePath: string
  description: string | null
  createdAt: string
  uploaderName: string
}

const DOC_TYPE_LABEL: Record<string, string> = {
  INITIAL_EVALUATION: 'Initial Evaluation',
  PROGRESS_REPORT: 'Progress Report',
  OTHER_DOCUMENT: 'Other Document',
}

// Read-only render of one session note's body, reusing the department display
// components (falls back to plain text). Used for other departments' notes.
function renderNoteBody(notes: string | null | undefined) {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    if (parsed.formType?.startsWith('PSYCH_')) return <PsychologyNoteDisplay data={parsed} />
    if (parsed.formType === 'OT_DAILY_NOTES') return <OTNoteDisplay data={parsed} />
    if (parsed.formType === 'SLP_DAILY_NOTES') return <SLPNoteDisplay data={parsed} />
    if (parsed.formType === 'SPED16' || parsed.formType === 'SPED18') return <SPEDNoteDisplay data={parsed} />
    if (parsed.formType === 'PT_SESSION_NOTES') return <PTNoteDisplay data={parsed} />
  } catch { /* not JSON — render as plain text below */ }
  return (
    <div className="text-sm whitespace-pre-wrap p-3 rounded-lg" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>{notes}</div>
  )
}

export default function PatientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.patientId as string
  // Used to gate admin-only affordances (currently: the bulk
  // "Delete all clinical data" button). The role lives in the JWT
  // and is set at sign-in from TherapistAccount.role.
  const { data: nextAuthSession } = useSession()
  const isAdmin =
    (nextAuthSession?.user as { role?: string } | undefined)?.role === 'ADMIN'

  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [otherDeptSessions, setOtherDeptSessions] = useState<SessionItem[]>([])
  const [otherDeptDocuments, setOtherDeptDocuments] = useState<OtherDeptDoc[]>([])
  const [otherDeptStaff, setOtherDeptStaff] = useState<{ name: string; department: string }[]>([])
  // Interdisciplinary patients get a two-tab view (own notes vs other
  // departments' records) so the page isn't crowded; openDept drives the
  // per-department accordion inside the "other" tab.
  const [activeTab, setActiveTab] = useState<'own' | 'other' | 'uploads'>('own')
  // Deep-link: /patients/[id]?tab=uploads opens the Patient Uploads tab (used by
  // the notification bell). Read once on mount.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'uploads' || t === 'own' || t === 'other') setActiveTab(t as 'own' | 'other' | 'uploads')
  }, [])
  const [openDept, setOpenDept] = useState<string | null>(null)
  // Which other-department note (by session id) is expanded. Notes collapse to
  // a per-day list first so a year of sessions isn't one giant scroll.
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
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

  // Admin-only "wipe everything clinical" flow. Two-step: clicking
  // the button opens the modal; the modal requires the admin to type
  // the patient's exact name before the Delete button enables. This
  // is the only place in the app that can remove a clinician's
  // locked notes / documents — so we deliberately make it slow.
  const [showAdminWipe, setShowAdminWipe] = useState(false)
  const [adminWipeNameInput, setAdminWipeNameInput] = useState('')
  const [adminWiping, setAdminWiping] = useState(false)

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
        setOtherDeptSessions(data.otherDeptSessions ?? [])
        setOtherDeptDocuments(data.otherDeptDocuments ?? [])
        setOtherDeptStaff(data.otherDeptStaff ?? [])
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

  // Admin-only bulk wipe. Sends the typed name as confirmName — the
  // server normalises whitespace + case, but we also enforce the
  // match client-side via the disabled button so a misclick can't
  // reach the network.
  async function handleAdminWipe() {
    if (!patient) return
    setAdminWiping(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/admin-wipe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: adminWipeNameInput }),
      })
      if (res.ok) {
        const data = await res.json()
        showToast(
          `Wiped: ${data.deleted.sessionNotes} notes, ` +
          `${data.deleted.patientDocuments} documents, ` +
          `${data.deleted.attachmentFiles} attachments`,
        )
        setShowAdminWipe(false)
        setAdminWipeNameInput('')
        fetchPatient()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error ?? 'Admin wipe failed')
      }
    } catch {
      showToast('Admin wipe failed')
    }
    setAdminWiping(false)
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
      <div className="max-w-[1240px] mx-auto space-y-5" role="status" aria-label="Loading patient">
        <Skeleton className="h-4 w-32" />
        <div className="rounded-xl p-5 flex items-center gap-4" style={CARD_STYLE}>
          <Skeleton className="w-14 h-14 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-3.5 w-72" /></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="rounded-xl max-w-lg mx-auto" style={CARD_STYLE}>
        <EmptyState icon="users" title="Patient not found" hint="They may have been removed, or you no longer have access." />
        <div className="pb-6 text-center">
          <button type="button" onClick={() => router.push('/patients')} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
            <ArrowLeft size={14} /> Back to Patients
          </button>
        </div>
      </div>
    )
  }

  const patientName = `${patient.firstName} ${patient.lastName}`
  const completedCount = sessions.filter((s) => s.sessionNote?.status === 'COMPLETED').length
  const totalCount = sessions.length
  const discontinuedCount = sessions.filter((s) => s.sessionNote?.status === 'DISCONTINUED').length
  const pendingCount = sessions.filter((s) => !s.sessionNote).length

  // Interdisciplinary = the patient also sees other departments. Only then do
  // we split the page into tabs. The department list is the union of every
  // other-department the patient has services, notes, or documents in.
  const isInterdisciplinary = otherServices.length > 0
  const otherDepts = Array.from(new Set<string>([
    ...otherServices,
    ...otherDeptSessions.map((s) => s.staff.department),
    ...otherDeptDocuments.map((d) => d.department),
  ])).sort()
  // The own-documents sidebar belongs to the "own" view; hide it on the other tab.
  const showSidebar = activeTab === 'own'

  // Session-history date filter (same maths as before, computed once).
  const histFrom = filterFrom ? new Date(filterFrom).getTime() : -Infinity
  const histTo = filterTo ? new Date(filterTo).getTime() + 86400000 : Infinity
  const visibleSessions = sessions.filter(s => {
    const t = new Date(s.date).getTime()
    return t >= histFrom && t < histTo
  })

  // The caller's relationship to this patient, as a pill.
  const relationPill = assignmentStatus === 'DISCHARGED'
    ? <StatusPill tone="error">Discharged</StatusPill>
    : readOnly
      ? <StatusPill tone="neutral">Read-only</StatusPill>
      : <StatusPill tone="success">Active</StatusPill>

  return (
    <div className="max-w-[1240px] mx-auto space-y-5 min-w-0">
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* Back */}
      <button
        type="button"
        onClick={() => router.push('/patients')}
        className={`${BTN_SM} -ml-2`}
        style={{ color: 'var(--mid-gray)' }}
      >
        <ArrowLeft size={14} />
        Back to Patients
      </button>

      <div className={cn(
        'grid grid-cols-1 gap-5',
        showSidebar && 'lg:grid-cols-[minmax(0,1fr)_320px]',
        // Whole-page muted state when this clinician no longer owns the
        // patient. Slight desaturation makes it visually obvious without
        // preventing reading.
        readOnly && 'grayscale-[0.4]'
      )}>
        <div className="min-w-0 space-y-5">

      {/* Patient header */}
      <section className="rounded-xl" style={CARD_STYLE}>
        <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4">
          <span className={readOnly ? 'opacity-60' : ''}><Avatar text={`${patient.firstName[0]}${patient.lastName[0]}`} size={52} /></span>
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Patient</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] sm:text-2xl font-bold leading-tight break-words" style={{ fontFamily: 'var(--font-display)', color: readOnly ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                {patientName}
              </h1>
              {relationPill}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
              <Tag tone="brand">{patient.patientType}</Tag>
              {patient.diagnosis && <span className="break-words">{patient.diagnosis}</span>}
              {patient.email && <><span aria-hidden>·</span><span className="break-all">{patient.email}</span></>}
              {otherServices.map((d) => <span key={d} title={`Also seen by ${d}`}><Tag tone="neutral">{d}</Tag></span>)}
            </div>
          </div>

          {/* Actions. Three mutually exclusive states based on the
              requester's OWN PatientAssignment row (admin and clinician
              share this logic — admins never go read-only, but they DO
              accumulate their own DISCHARGED row when they click
              Discharged on a patient, and need a way back from that):
                • assignmentStatus === 'DISCHARGED' → Re-admit only
                  (POST /api/patients/[id]/readmit flips the caller's own
                  DISCHARGED row back to ACTIVE).
                • !readOnly (active owner OR admin without a discharged
                  row) → Endorse + Discharge.
                • read-only (DEACTIVATED / legacy ENDORSED) → no actions.
              assignmentStatus is checked first so an admin who already
              discharged the patient sees Re-admit instead of being able
              to discharge twice. */}
          {assignmentStatus === 'DISCHARGED' ? (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleReadmit}
                disabled={readmitting}
                className={`${BTN_PRIMARY} flex-1 sm:flex-none`}
                style={PRIMARY_STYLE}
                title="Re-admit this patient as active"
              >
                {readmitting ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
                Re-admit
              </button>
            </div>
          ) : !readOnly ? (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button type="button" onClick={loadEndorseStaff} className={`${BTN_SECONDARY} flex-1 sm:flex-none`} style={{ ...SECONDARY_STYLE, color: '#8A5A1F' }}>
                <ArrowRightLeft size={15} />
                Endorse to
              </button>
              <button type="button" onClick={() => setShowDischarge(true)} className={`${BTN_SECONDARY} flex-1 sm:flex-none`} style={{ ...SECONDARY_STYLE, color: DANGER }}>
                <UserX size={15} />
                Discharged
              </button>
            </div>
          ) : null}
        </div>

        {/* Admin-only "wipe everything clinical for this patient". Visible
            regardless of readOnly (admins are never read-only) so it shows
            on Active, Deactivated, Endorsed and Discharged patients alike.
            The destructive cascade lives behind a typed-name confirm. */}
        {isAdmin && (
          <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 rounded-b-xl"
            style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
            <span className="text-[11.5px] inline-flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
              <ShieldX size={13} /> Admin tools
            </span>
            <button
              type="button"
              onClick={() => setShowAdminWipe(true)}
              className={BTN_DANGER_GHOST}
              style={{ color: DANGER }}
              title="Admin only — delete all session notes and documents for this patient"
            >
              <ShieldX size={13} />
              Delete all clinical data for this patient
            </button>
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Sessions" value={totalCount} sub="Confirmed sessions" icon={<Calendar size={15} />} />
        <KpiCard label="Completed" value={completedCount} sub={totalCount ? `${Math.round((completedCount / totalCount) * 100)}% have notes` : 'No sessions yet'} accent="var(--moss)" icon={<CheckCircle2 size={15} />} />
        <KpiCard label="Pending notes" value={pendingCount} sub={pendingCount ? 'No note yet' : 'All documented'} accent={pendingCount ? '#8C6A2D' : 'var(--moss)'} icon={<Clock size={15} />} />
        <KpiCard label="Discontinued" value={discontinuedCount} sub="With remarks" accent="var(--clay)" icon={<XCircle size={15} />} />
      </div>

      {/* Read-only banner — visible whenever this clinician no longer owns
          the patient (endorsed away or discharged). The patient and their
          notes are still visible for continuity of care, but the write
          actions are hidden. */}
      {readOnly && (
        <Banner tone="warn">
          <span className="font-semibold">Read-only — you don&rsquo;t currently own this patient.</span>{' '}
          {assignmentStatus === 'DISCHARGED'
            ? 'This patient was discharged. You can review past sessions and notes, but cannot edit them. Re-admit if the patient returns to your care.'
            : 'You endorsed this patient to another clinician. You can still view all sessions and notes (yours and theirs going forward) for continuity of care, but cannot make new edits unless they endorse the patient back to you.'}
        </Banner>
      )}

      {/* Endorse dialog */}
      {showEndorse && (
        <Dialog
          labelId="pp-endorse"
          eyebrow="Endorse patient"
          title={`Endorse ${patientName}`}
          description="Select a clinician from the same department. All past session notes will be accessible to them."
          onClose={() => { setShowEndorse(false); setSelectedStaff('') }}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowEndorse(false); setSelectedStaff('') }} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
              <button type="button" onClick={handleEndorse} disabled={endorsing || !selectedStaff} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                {endorsing ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                Confirm Endorsement
              </button>
            </div>
          }
        >
          {endorseStaff.length === 0 ? (
            <p className="text-sm italic" style={{ color: 'var(--mid-gray)' }}>No other clinicians found in your department.</p>
          ) : (
            <div>
              <label htmlFor="pp-endorse-to" className={LABEL} style={LABEL_STYLE}>Endorse to</label>
              <select
                id="pp-endorse-to"
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className={`${CONTROL} w-full h-10`}
                style={CONTROL_STYLE}
              >
                <option value="">Select clinician...</option>
                {endorseStaff.map((s) => (
                  <option key={s.accountId} value={s.accountId}>
                    {s.name} ({s.department}) - {s.branch}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Dialog>
      )}

      {/* Discharge dialog */}
      {showDischarge && (
        <Dialog
          labelId="pp-discharge"
          eyebrow="Discharge patient"
          title={`Discharge ${patientName}`}
          onClose={() => { setShowDischarge(false); setDischargeRemarks('') }}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowDischarge(false); setDischargeRemarks('') }} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
              <button type="button" onClick={handleDischarge} disabled={discharging || !dischargeRemarks.trim()} className={BTN_PRIMARY} style={{ background: DANGER }}>
                {discharging ? <Loader2 size={15} className="animate-spin" /> : <UserX size={15} />}
                Confirm Discharge
              </button>
            </div>
          }
        >
          <label htmlFor="pp-discharge-remarks" className={LABEL} style={LABEL_STYLE}>
            Remarks <span style={{ color: DANGER }}>*</span>
          </label>
          <textarea
            id="pp-discharge-remarks"
            value={dischargeRemarks}
            onChange={(e) => setDischargeRemarks(e.target.value)}
            rows={4}
            placeholder="Reason for discharge..."
            className={`${TEXTAREA} resize-y`}
            style={CONTROL_STYLE}
            autoFocus
          />
        </Dialog>
      )}

      {/* Admin wipe dialog — type-the-name confirmation */}
      {showAdminWipe && patient && (() => {
        // Local helpers: same normalization the server uses, so the
        // disabled state matches what the server would accept.
        const normalize = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
        const expected = normalize(`${patient.firstName} ${patient.lastName}`)
        const matches = normalize(adminWipeNameInput) === expected
        return (
          <Dialog
            labelId="pp-admin-wipe"
            eyebrow="Admin only"
            title="Delete all clinical data for this patient"
            onClose={() => { setShowAdminWipe(false); setAdminWipeNameInput('') }}
            footer={
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowAdminWipe(false); setAdminWipeNameInput('') }} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
                <button type="button" onClick={handleAdminWipe} disabled={adminWiping || !matches} className={BTN_PRIMARY} style={{ background: DANGER }}>
                  {adminWiping ? <Loader2 size={15} className="animate-spin" /> : <ShieldX size={15} />}
                  Permanently delete
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <Banner tone="error">
                This permanently removes <strong>every session note</strong>, <strong>Initial Evaluation</strong>, <strong>Progress Report</strong>, <strong>Other Document</strong> and all attached files for{' '}
                <strong>{patient.firstName} {patient.lastName}</strong>. The patient record and schedule history are kept. This action is admin-only and cannot be undone.
              </Banner>
              <div>
                <label htmlFor="pp-wipe-name" className={LABEL} style={LABEL_STYLE}>
                  Type the patient&apos;s full name to confirm
                </label>
                <input
                  id="pp-wipe-name"
                  type="text"
                  value={adminWipeNameInput}
                  onChange={(e) => setAdminWipeNameInput(e.target.value)}
                  placeholder={`${patient.firstName} ${patient.lastName}`}
                  className={`${CONTROL} w-full h-10`}
                  style={{ ...CONTROL_STYLE, borderColor: matches ? '#9FC08A' : '#FECACA' }}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </Dialog>
        )
      })()}

      {/* Tab switcher: own notes, other-department records (interdisciplinary
          patients only), and patient uploads. Always shown so Patient Uploads
          is a first-class tab for every patient. */}
      <PillTabs
        label="Patient records"
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'own' | 'other' | 'uploads')}
        tabs={[
          { id: 'own', label: 'Own Session Notes', count: sessions.length },
          ...(isInterdisciplinary
            ? [{ id: 'other', label: 'Records from Other Departments', count: otherDeptSessions.length + otherDeptDocuments.length }]
            : []),
          { id: 'uploads', label: <span className="inline-flex items-center gap-1.5"><Inbox size={13} /> Patient Uploads</span> },
        ]}
      />

      {/* OTHER tab — per-department, read-only records (notes + IE / Progress
          Reports / uploads). One accordion per department the patient sees. */}
      {isInterdisciplinary && activeTab === 'other' && (
        <div className="space-y-3">
          <Banner tone="info">
            <span className="font-semibold">Interdisciplinary case.</span> These are the other departments’ read-only records — you can view but not edit them. Open a department to see its notes and documents, and coordinate with the professional for interprofessional collaboration.
          </Banner>

          {otherDepts.map((dep) => {
            const notes = otherDeptSessions.filter((s) => s.staff.department === dep)
            const docs = otherDeptDocuments.filter((d) => d.department === dep)
            const pros = otherDeptStaff.filter((p) => p.department === dep).map((p) => p.name)
            const open = openDept === dep
            return (
              <section key={dep} className="rounded-xl" style={CARD_STYLE}>
                <button
                  type="button"
                  onClick={() => setOpenDept(open ? null : dep)}
                  aria-expanded={open}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left rounded-xl transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Tag tone="brand">{dep}</Tag>
                    {pros.length > 0 && <span className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{pros.join(', ')}</span>}
                    <span className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>{notes.length} note{notes.length === 1 ? '' : 's'} · {docs.length} document{docs.length === 1 ? '' : 's'}</span>
                  </div>
                  {open ? <ChevronUp size={18} style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={18} style={{ color: 'var(--mid-gray)' }} />}
                </button>
                {open && (
                  <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    {notes.length === 0 && docs.length === 0 && (
                      <p className="text-[12.5px] italic px-1 py-3" style={{ color: 'var(--mid-gray)' }}>No notes or documents yet for this department.</p>
                    )}

                    {notes.length > 0 && (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider pt-3 px-1" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Session Notes ({notes.length}) — pick a day</p>
                        {notes.map((s) => {
                          const noteOpen = openNoteId === s.id
                          return (
                            <div key={s.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
                              <button
                                type="button"
                                onClick={() => setOpenNoteId(noteOpen ? null : s.id)}
                                aria-expanded={noteOpen}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Calendar size={13} className="shrink-0" style={{ color: 'var(--mid-gray)' }} />
                                  <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{s.date}</span>
                                  {s.sessionType && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{s.sessionType}</span>}
                                </div>
                                {noteOpen ? <ChevronUp size={16} className="shrink-0" style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={16} className="shrink-0" style={{ color: 'var(--mid-gray)' }} />}
                              </button>
                              {noteOpen && (
                                <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
                                  <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>by {s.staff.firstName} {s.staff.lastName}</p>
                                  {s.sessionNote?.notes
                                    ? renderNoteBody(s.sessionNote.notes)
                                    : s.sessionNote?.discontinuedRemarks
                                      ? <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>Discontinued: {s.sessionNote.discontinuedRemarks}</p>
                                      : <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>No note content.</p>}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}

                    {docs.length > 0 && (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider pt-3 px-1" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Documents — Initial Evaluations, Progress Reports &amp; Uploads</p>
                        {docs.map((d) => (
                          <div key={d.id} className="rounded-lg p-3.5" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
                            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Tag tone="info">{DOC_TYPE_LABEL[d.documentType] ?? d.documentType}</Tag>
                                {d.uploaderName && <span className="text-[12.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>{d.uploaderName}</span>}
                              </div>
                              <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>{new Date(d.createdAt).toLocaleDateString()}</span>
                            </div>
                            {d.description && <p className="text-[12.5px] mb-2" style={{ color: 'var(--mid-gray)' }}>{d.description}</p>}
                            <a
                              href={`/api/upload/${d.filePath}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 text-[13px] font-semibold rounded hover:underline ${FOCUS}`}
                              style={{ color: 'var(--teal)' }}
                            >
                              <FileText size={14} />
                              {d.fileName}
                            </a>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* UPLOADS tab — patient-submitted PWD/Senior ID + home-practice media. */}
      {activeTab === 'uploads' && (
        <PatientUploads
          patientId={patient.id}
          pwdIdUrl={patient.pwdIdUrl}
          pwdSeniorId={patient.pwdSeniorId}
        />
      )}

      {/* OWN tab — the clinician's own session history + note-making. */}
      {activeTab === 'own' && (
      <section className="rounded-xl min-w-0" style={CARD_STYLE}>
        <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: historyOpen ? '1px solid var(--light-gray)' : undefined }}>
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
            className={`flex items-center gap-2 rounded-md ${FOCUS}`}
          >
            <FileText size={16} style={{ color: 'var(--teal)' }} />
            <h2 className="text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Session History</h2>
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>
              {visibleSessions.length}{visibleSessions.length !== sessions.length ? ` of ${sessions.length}` : ''}
            </span>
            {historyOpen ? <ChevronUp size={16} style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={16} style={{ color: 'var(--mid-gray)' }} />}
          </button>

          {historyOpen && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                From
                <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={`${CONTROL} !h-8 !text-xs`} style={CONTROL_STYLE} />
              </label>
              <label className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                To
                <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={`${CONTROL} !h-8 !text-xs`} style={CONTROL_STYLE} />
              </label>
              {(filterFrom || filterTo) && (
                <button type="button" onClick={() => { setFilterFrom(''); setFilterTo('') }} className={BTN_SM} style={{ color: 'var(--mid-gray)' }}>
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          )}
        </header>

        {historyOpen && (
        sessions.length === 0 ? (
          <EmptyState icon="calendar" title="No confirmed sessions found" />
        ) : visibleSessions.length === 0 ? (
          <EmptyState icon="search" title="No sessions in this date range" hint="Widen the dates or clear the filter." />
        ) : (
          <ul>
            {visibleSessions.map((s, idx) => {
              const expanded = expandedSession === s.id
              const notePill = s.sessionNote?.status === 'COMPLETED'
                ? <StatusPill tone="success">Completed</StatusPill>
                : s.sessionNote?.status === 'DISCONTINUED'
                  ? <StatusPill tone="error">Discontinued</StatusPill>
                  : <StatusPill tone="warn">Pending</StatusPill>
              return (
                <li key={s.id} style={{ borderTop: idx ? '1px solid var(--light-gray)' : undefined }}>
                  <button
                    type="button"
                    onClick={() => setExpandedSession(expanded ? null : s.id)}
                    aria-expanded={expanded}
                    className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 transition-colors text-left hover:bg-[#F8FAF2] ${FOCUS}`}
                  >
                    <div className="shrink-0">
                      {s.sessionNote?.status === 'COMPLETED' ? (
                        <CheckCircle2 size={18} style={{ color: '#2F5A28' }} />
                      ) : s.sessionNote?.status === 'DISCONTINUED' ? (
                        <XCircle size={18} style={{ color: DANGER }} />
                      ) : (
                        <Clock size={18} style={{ color: 'var(--mid-gray)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-[13.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                          {formatDate(s.date)}
                        </p>
                        <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </span>
                      </div>
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {s.sessionType} · {s.staff.lastName} ({s.staff.department})
                      </p>
                    </div>
                    <span className="hidden sm:inline-flex">{notePill}</span>
                    {expanded ? <ChevronUp size={16} className="shrink-0" style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={16} className="shrink-0" style={{ color: 'var(--mid-gray)' }} />}
                  </button>

                  {/* Expanded: no notes yet — show add-note buttons only when
                      this clinician owns the session (s.canEdit). A read-only
                      viewer sees a passive line; a clinician who can see the
                      session for continuity but didn't deliver it sees nothing
                      actionable. */}
                  {expanded && !s.sessionNote && (
                    <div className="px-4 sm:px-5 pb-4 pt-3" style={{ borderTop: '1px solid var(--light-gray)', background: '#FCFDF8' }}>
                      {s.ageLocked ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>
                            No notes recorded. This session is over {NOTE_WINDOW_MONTHS} months old, so documentation is closed.
                          </span>
                          <button type="button" onClick={() => router.push(`/session/${s.id}`)} className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--teal)' }}>
                            <Unlock size={13} />
                            Enable editing
                          </button>
                        </div>
                      ) : !s.canEdit ? (
                        <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>
                          No notes recorded yet. Only {s.staff.firstName} {s.staff.lastName} can add notes for this session.
                        </p>
                      ) : (
                        <>
                          <p className="text-[13px] mb-3" style={{ color: 'var(--mid-gray)' }}>
                            No notes recorded for this session. You can add notes now:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(`/session/${s.id}?action=complete`)}
                              className={`${BTN_PRIMARY} flex-1 sm:flex-none`}
                              style={{ background: '#2F7A4A' }}
                            >
                              <CheckCircle2 size={15} />
                              Completed
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/session/${s.id}?action=discontinue`)}
                              className={`${BTN_PRIMARY} flex-1 sm:flex-none`}
                              style={{ background: DANGER }}
                            >
                              <XCircle size={15} />
                              Discontinued
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Expanded notes */}
                  {expanded && s.sessionNote && (
                    <div className="px-4 sm:px-5 pb-4 pt-3" style={{ borderTop: '1px solid var(--light-gray)', background: '#FCFDF8' }}>
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
                            <p className={LABEL} style={LABEL_STYLE}>Notes</p>
                            <div className="text-sm whitespace-pre-wrap p-3 rounded-lg" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
                              {s.sessionNote.notes}
                            </div>
                          </div>
                        )
                      })()}

                      {s.sessionNote.discontinuedRemarks && (
                        <div className="mb-3">
                          <p className={LABEL} style={LABEL_STYLE}>Reason</p>
                          <div className="text-sm whitespace-pre-wrap p-3 rounded-lg" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
                            {s.sessionNote.discontinuedRemarks}
                          </div>
                        </div>
                      )}

                      {s.sessionNote.attachments && (s.sessionNote.attachments as any[]).length > 0 && (
                        <div className="mb-3">
                          <p className={LABEL} style={LABEL_STYLE}>Attachments</p>
                          <div className="space-y-1.5">
                            {(s.sessionNote.attachments as any[]).map((att: any, i: number) => (
                              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
                                <a href={`/api/upload/${att.filePath}`} target="_blank"
                                   className={`flex items-center gap-1.5 text-[12.5px] font-medium truncate rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)' }}>
                                  <Paperclip size={12} />
                                  {att.fileName}
                                </a>
                                {s.canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAttachment(s.id, i)}
                                    className={`shrink-0 ml-2 w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-red-50 ${FOCUS}`}
                                    style={{ color: 'var(--mid-gray)' }}
                                    title="Delete attachment"
                                    aria-label={`Delete attachment ${att.fileName}`}
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions — only the clinician who delivered the session
                          can edit/delete its note, and only while it isn't
                          locked. Locked notes (frozen at the moment the author
                          was endorsed/discharged off the patient) are read-only
                          forever, even if the patient is endorsed BACK to the
                          original author. Distinct read-only footers explain
                          WHY edit isn't available. */}
                      {s.canEdit ? (
                        <div className="pt-3 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
                          <button type="button" onClick={() => router.push(`/session/${s.id}?edit=true`)} className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--teal)' }}>
                            <Pencil size={13} />
                            Edit notes
                          </button>
                          <button type="button" onClick={() => handleDeleteNote(s.id)} className={BTN_DANGER_GHOST} style={{ color: DANGER }}>
                            <Trash2 size={13} />
                            Delete note
                          </button>
                        </div>
                      ) : s.ageLocked && !s.sessionNote.lockedAt ? (
                        <div className="pt-3 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
                          <span className="flex items-center gap-2 text-[11.5px] italic" style={{ color: 'var(--mid-gray)' }}>
                            <Lock size={12} />
                            Read-only — over {NOTE_WINDOW_MONTHS} months old.
                          </span>
                          <button type="button" onClick={() => router.push(`/session/${s.id}`)} className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--teal)' }}>
                            <Unlock size={13} />
                            Enable editing
                          </button>
                        </div>
                      ) : s.sessionNote.lockedAt ? (
                        <div className="pt-3 flex items-center gap-2 text-[11.5px] italic" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                          <Lock size={12} />
                          Locked — signed by {s.staff.firstName} {s.staff.lastName}. Notes are frozen at endorsement and cannot be edited.
                        </div>
                      ) : (
                        <div className="pt-3 flex items-center gap-2 text-[11.5px] italic" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                          <Eye size={12} />
                          View only — signed by {s.staff.firstName} {s.staff.lastName}.
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )
        )}
      </section>
      )}
        </div>

        {/* Right sidebar: Patient Widgets — own documents, part of the "own" view. */}
        {showSidebar && (
        <aside className="lg:sticky lg:top-0 lg:self-start space-y-3 min-w-0">
          <PatientWidgets patient={patient} canManage={!readOnly} />
        </aside>
        )}
      </div>
    </div>
  )
}
