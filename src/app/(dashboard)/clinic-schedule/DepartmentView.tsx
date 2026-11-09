'use client'

import { Fragment, useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { internWindowCovers } from '@/lib/intern-window'
import { Plus, Pencil, Trash2, Mail, MailCheck, MessageSquare, ChevronDown, ChevronUp, X, Smartphone, Video, History, LayoutGrid, Users, CalendarClock, UserPlus, AlertTriangle, Search, Info, Layers } from 'lucide-react'
import DeskShortcutCard from '@/components/DeskShortcutCard'
import { localTodayStr, localTomorrowStr } from '@/lib/utils'
import { branchLabel } from '@/lib/branch-label'
import { isRenter, RENTER_NOTIFY_REASON } from '@/lib/employment'
import { KpiCard, Skeleton, DeptChip, CARD_STYLE } from '../patients/dashboard/ui'
import { PillTabs, Avatar, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CONTROL, CONTROL_STYLE, TEAL_HEX } from '../decking/ui'
import { Toolbar, Field, ErrorBanner, KpiSkeletonRow, StatusBadge, TodayTag, deptColor, TH, TH_BG } from './ui'


// ─── Session types per department ────────────────────────────────────────────
const SESSION_TYPES: Record<string, string[]> = {
  OT:         ['IE', 'Basic Session', 'Specialized Session', 'Group Session', 'PTC', 'Aquatherapy', 'IE Intern', 'Session Intern'],
  PT:         ['IE', 'Basic Session', 'Specialized Session', 'Group Session', 'PTC', 'Aquatherapy', 'IE Intern', 'Session Intern'],
  SLP:        ['IE', 'Basic Session', 'Specialized Session', 'Group Session', 'PTC', 'Aquatherapy', 'IE Intern', 'Session Intern'],
  SPED:       ['IE', '1-on-1', 'PTC', 'Group Session'],
  MD:         ['Initial Consult', 'Follow Up'],
  PSYCHOLOGY: ['Individual', 'Couple', 'Family', 'Testing'],
  ORTHOSIS:   ['Initial Consult', 'Follow Up'],
}

// ─── Time slots ───────────────────────────────────────────────────────────────
const TIME_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00',
]
const DURATION_MINUTES: Record<string, number> = { '1h': 60, '1.5h': 90, '2h': 120 }

function computeEndTime(start: string, duration: string): string {
  if (duration === 'custom') return ''
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + (DURATION_MINUTES[duration] ?? 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

function visibleBranches(role: string): string[] {
  if (role.startsWith('SBEA_') || role.startsWith('AHEA_')) return ['SBEA']
  if (role.startsWith('SBGH_') || role.startsWith('AHGH_')) return ['SBGH']
  return ['SBEA', 'SBGH']
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StaffMember {
  id: string; firstName: string; lastName: string; department: string; branch: string
  extraBranches: string[]; phone: string | null
  employmentType: string | null; active: boolean
  // Per-branch classification. /api/staff returns whole rows, so both arrive
  // without asking; they are what makes "renter at East, consultant at
  // Greenhills" answerable. See lib/employment.
  employmentByBranch?: unknown
  branchEmployment?: unknown
  dateHired: string | null; contractExpiry: string | null // interns: Start Month / End Month
  // Supervision and mentorship roles from HR. Shown on the card because a
  // decked slot means different things depending on them: a supervisor's
  // session may be run by an intern, a mentee's may have a mentor sitting in.
  isInternshipSupervisor?: boolean | null
  isClinicalMentor?: boolean | null
  menteeIds?: string[]
}
interface Patient { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; branches?: string[] }

// Staff.branch codes -> Patient.branches enum values
const BRANCH_ENUM: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}
interface InternStaff { id: string; firstName: string; lastName: string }
interface Schedule {
  id: string; staffId: string; patientId: string | null; patient: Patient | null
  date: string; startTime: string; endTime: string; duration: string
  sessionType: string; status: string; notes: string | null
  isTeletherapy: boolean; meetLink: string | null; withMentor?: boolean
  internStaffId: string | null; internStaff: InternStaff | null
}

const EMPTY_FORM = {
  patientId: '', patientLabel: '', date: '',
  startTime: '08:00', duration: '1h', endTime: '09:00',
  sessionType: '', status: 'PENDING', notes: '',
  isTeletherapy: false, internStaffId: '', withMentor: false,
}

const INTERN_SESSION_TYPES = new Set(['IE Intern', 'Session Intern'])

// Interns are attached to a supervisor's session via the "Select Intern"
// field; they are never listed as clinicians in their own right. Note this is
// intentionally date-independent, unlike isEligibleIntern below — an intern
// outside their Start/End Month is still an intern, and must not fall back
// into the clinician list.
function isIntern(s: StaffMember): boolean {
  return s.employmentType === 'intern'
}

// Is this staff member an intern whose Start/End Month covers `forDate`
// (YYYY-MM-DD)? Falls back to today if no date is picked yet.
function isEligibleIntern(s: StaffMember, forDate: string): boolean {
  if (s.employmentType !== 'intern' || s.active === false) return false
  return internWindowCovers(s.dateHired, s.contractExpiry, forDate || localTodayStr())
}

// Shared form-field look (matches the Decking / toolbar controls).
const FIELD_STYLE = {
  border: '1px solid var(--light-gray)', background: '#fff',
  color: 'var(--charcoal)', borderRadius: '0.5rem',
  padding: '0.45rem 0.75rem', fontSize: '0.875rem', width: '100%', minHeight: '2.25rem',
}

// ─── Patient search typeahead ─────────────────────────────────────────────────
function PatientSearch({ value, label, onChange, branchEnum }: {
  value: string; label: string
  onChange: (id: string, label: string) => void
  branchEnum: string
}) {
  const [query, setQuery] = useState(label)
  const [results, setResults] = useState<Patient[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setQuery(label) }, [label])

  function handleInput(val: string) {
    setQuery(val)
    if (val !== label) onChange('', val)
    if (timer.current) clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(val)}`)
      if (res.ok) { setResults(await res.json()); setOpen(true) }
    }, 250)
  }

  const inputStyle = { ...FIELD_STYLE, paddingLeft: '2rem' }

  return (
    <div className="relative">
      <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
      <input
        style={inputStyle}
        className="outline-none focus:border-[var(--teal)]"
        placeholder="Search patient name…"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden max-h-72 overflow-y-auto"
          style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 12px 32px rgba(15,23,42,0.12)' }}>
          {results.map(p => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5FAFA] transition-colors"
              style={{ color: 'var(--charcoal)', borderBottom: '1px solid #EEF1F1' }}
              onMouseDown={() => {
                onChange(p.id, `${p.lastName}, ${p.firstName}`)
                setQuery(`${p.lastName}, ${p.firstName}`)
                setOpen(false)
              }}>
              <span className="font-medium">{p.lastName}, {p.firstName}</span>
              {(p.branches ?? []).map(b => (
                <span key={b} className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: b === 'SANDBOX_GREENHILLS' ? '#ede9fe' : '#d1fae5',
                           color: b === 'SANDBOX_GREENHILLS' ? '#5b21b6' : '#065f46' }}>
                  {b === 'SANDBOX_GREENHILLS' ? 'GH' : b === 'SANDBOX_EAST' ? 'East' : b}
                </span>
              ))}
              {/* Search spans both branches on purpose: a patient registered at
                  one branch is routinely seen at the other, and booking them
                  here adds this branch to their record. The badges say where
                  they are already registered so the front desk can tell an
                  existing patient from a same-named stranger. */}
              {!(p.branches ?? []).includes(branchEnum) && (
                <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'var(--mid-gray)' }}>
                  · will be added to this branch
                </span>
              )}
              {p.email && <span className="ml-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{p.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Schedule form ─────────────────────────────────────────────────────────────
function ScheduleForm({ dept, allStaff, values, onChange, onSubmit, onCancel, error, submitting, submitLabel, branchEnum }: {
  dept: string
  branchEnum: string
  allStaff: StaffMember[]
  values: typeof EMPTY_FORM
  onChange: (v: typeof EMPTY_FORM) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  error: string
  submitting: boolean
  submitLabel: string
}) {
  // Track whether the user chose "Custom…" from the start-time dropdown
  const [customStart, setCustomStart] = useState(() => !TIME_SLOTS.includes(values.startTime))

  const inputStyle = FIELD_STYLE
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: 'var(--mid-gray)', marginBottom: '0.25rem',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  }

  function handleDurationChange(dur: string) {
    const end = dur === 'custom' ? values.endTime : computeEndTime(values.startTime, dur)
    onChange({ ...values, duration: dur, endTime: end })
  }

  function handleStartDropdown(val: string) {
    if (val === '__custom__') {
      setCustomStart(true)
      // Keep current startTime; user will enter via time input
    } else {
      setCustomStart(false)
      const end = values.duration === 'custom' ? values.endTime : computeEndTime(val, values.duration)
      onChange({ ...values, startTime: val, endTime: end })
    }
  }

  function handleCustomStartInput(val: string) {
    const end = values.duration === 'custom' ? values.endTime : (val ? computeEndTime(val, values.duration) : '')
    onChange({ ...values, startTime: val, endTime: end })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          <AlertTriangle size={13} className="flex-shrink-0 mt-px" />{error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label style={labelStyle}>Patient</label>
          <PatientSearch
            value={values.patientId}
            label={values.patientLabel}
            branchEnum={branchEnum}
            onChange={(id, lbl) => onChange({ ...values, patientId: id, patientLabel: lbl })}
          />
        </div>
        <div>
          <label style={labelStyle}>Start Time</label>
          <select
            style={inputStyle}
            value={customStart ? '__custom__' : values.startTime}
            onChange={e => handleStartDropdown(e.target.value)}
          >
            {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
            <option value="__custom__">Custom…</option>
          </select>
          {customStart && (
            <input
              type="time"
              step="60"
              style={{ ...inputStyle, marginTop: '0.35rem' }}
              value={values.startTime}
              onChange={e => handleCustomStartInput(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div>
          <label style={labelStyle}>Duration</label>
          <select style={inputStyle} value={values.duration} onChange={e => handleDurationChange(e.target.value)}>
            <option value="1h">1 Hour</option>
            <option value="1.5h">1.5 Hours</option>
            <option value="2h">2 Hours</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>End Time</label>
          {values.duration === 'custom' ? (
            <input
              type="time"
              step="60"
              style={inputStyle}
              value={values.endTime}
              onChange={e => onChange({ ...values, endTime: e.target.value })}
            />
          ) : (
            <input style={{ ...inputStyle, background: 'var(--off-white)', color: 'var(--mid-gray)' }}
              value={values.endTime ? formatTime(values.endTime) : '—'} readOnly />
          )}
        </div>
        <div>
          <label style={labelStyle}>Session Type</label>
          <select style={inputStyle} value={values.sessionType} onChange={e => {
            const sessionType = e.target.value
            // Clear a stale intern pick when switching away from an intern session type.
            const internStaffId = INTERN_SESSION_TYPES.has(sessionType) ? values.internStaffId : ''
            onChange({ ...values, sessionType, internStaffId })
          }}>
            <option value="">Select type</option>
            {(SESSION_TYPES[dept] ?? []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {INTERN_SESSION_TYPES.has(values.sessionType) && (
          <div>
            <label style={labelStyle}>Select Intern</label>
            {(() => {
              const eligible = allStaff
                .filter(s => s.department === dept && isEligibleIntern(s, values.date))
                .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
              return eligible.length === 0 ? (
                <div style={{ ...inputStyle, background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  No active {dept} interns right now
                </div>
              ) : (
                <select style={inputStyle} value={values.internStaffId}
                  onChange={e => onChange({ ...values, internStaffId: e.target.value })}>
                  <option value="">Select intern…</option>
                  {eligible.map(s => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
                </select>
              )
            })()}
          </div>
        )}
        <div className="col-span-2">
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={values.status} onChange={e => onChange({ ...values, status: e.target.value })}>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="RESCHEDULED">Rescheduled</option>
            <option value="NO_SHOW">No-Show</option>
          </select>
        </div>
        <div className="col-span-2">
          <label style={labelStyle}>Mode</label>
          <button type="button" onClick={() => onChange({ ...values, isTeletherapy: !values.isTeletherapy })}
            aria-pressed={values.isTeletherapy}
            className="flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold w-full justify-center transition-colors"
            style={{
              background: values.isTeletherapy ? '#EFF6FF' : '#fff',
              color: values.isTeletherapy ? '#1D4ED8' : 'var(--mid-gray)',
              border: `1px solid ${values.isTeletherapy ? '#93C5FD' : 'var(--light-gray)'}`,
              cursor: 'pointer',
            }}>
            <Video size={15} />
            {values.isTeletherapy ? 'Teletherapy (Jitsi Meet link will be generated)' : 'In-Person (click to switch to Teletherapy)'}
          </button>
        </div>
        <div className="col-span-2">
          <label style={labelStyle}>Mentorship</label>
          <button type="button" onClick={() => onChange({ ...values, withMentor: !values.withMentor })}
            aria-pressed={!!values.withMentor}
            className="flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold w-full justify-center transition-colors"
            style={{
              background: values.withMentor ? '#FEF9C3' : '#fff',
              color: values.withMentor ? '#854D0E' : 'var(--mid-gray)',
              border: `1px solid ${values.withMentor ? '#FDE047' : 'var(--light-gray)'}`,
              cursor: 'pointer',
            }}>
            <input type="checkbox" readOnly checked={!!values.withMentor} style={{ pointerEvents: 'none' }} />
            {values.withMentor ? 'With Mentor — billed as a mentorship session' : 'With Mentor'}
          </button>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            Tick only if a mentor will sit in on this session alongside the mentee. Cashiering flags
            mentorship sessions so the “Mentorship” service is added and the session is tagged for payroll.
          </p>
        </div>
        <div className="col-span-2">
          <label style={labelStyle}>Notes (optional)</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
            value={values.notes} onChange={e => onChange({ ...values, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}
          style={CONTROL_STYLE}>Cancel</button>
        <button type="submit" disabled={submitting} className={`${BTN_PRIMARY} px-4`}
          style={{ background: TEAL_HEX, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Staff card with schedules ─────────────────────────────────────────────────
// `flat` drops the card chrome so the row can sit inside a department card.
function StaffCard({ staff, allStaff, selectedDate, schedulingBranch, flat = false }: { staff: StaffMember; allStaff: StaffMember[]; selectedDate: string; schedulingBranch: string; flat?: boolean }) {
  const [open, setOpen] = useState(false)
  // Renting clinicians can still be BOOKED here — the room is ours to schedule,
  // and the queue shows their sessions like anyone else's. What stops is the
  // clinic messaging their patients, who are the clinician's own private
  // clients. Per-branch, so someone who rents at one clinic and is on staff at
  // the other is only restricted where they rent.
  //
  // The buttons are disabled rather than removed, so the desk can see the rule
  // exists and why, instead of wondering where the button went. The routes
  // refuse independently — this is the explanation, not the enforcement.
  const renter = isRenter(staff, schedulingBranch)
  // Mentee status has no field of its own: HR stores menteeIds on the MENTOR,
  // so the only way to answer "is this person mentored?" is to scan the roster.
  const mentorName = useMemo(() => {
    const m = allStaff.find(x => (x.menteeIds ?? []).includes(staff.id))
    return m ? `${m.firstName} ${m.lastName}` : null
  }, [allStaff, staff.id])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM, date: selectedDate, endTime: computeEndTime('08:00', '1h') })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null)
  const [sendingSmsAll, setSendingSmsAll] = useState(false)
  const [sendingClinicianSms, setSendingClinicianSms] = useState(false)
  const [sendingClinicianEmail, setSendingClinicianEmail] = useState(false)
  const [sendingAbsentSms, setSendingAbsentSms] = useState(false)
  const [sendingAbsentEmail, setSendingAbsentEmail] = useState(false)
  const [toast, setToast] = useState('')
  // Last-week suggestions
  const [lastWeekSuggestions, setLastWeekSuggestions] = useState<Schedule[]>([])
  // Decking suggestions
  // `staff` rides along so an intern's decked hour can be told from the
  // clinician's own: with includeSupervised the list holds both.
  const [deckingSuggestions, setDeckingSuggestions] = useState<{
    id: string; patient: Patient | null; startTime: string; endTime: string; dayOfWeek: string
    staff?: { id: string; firstName: string; lastName: string; employmentType: string | null } | null
  }[]>([])

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true)
    // Always scope to the branch calendar being viewed — not just when the
    // clinician is visiting from another branch. Sessions carry the branch they
    // were booked on, so an East-registered patient booked by the Greenhills
    // front desk belongs to Greenhills. Filtering only on the "extra" branch
    // left the clinician's HOME calendar unfiltered, which is why sessions
    // booked at the other branch showed up there.
    const params = new URLSearchParams({
      staffId: staff.id,
      date: selectedDate,
      branch: schedulingBranch,
    })
    const res = await fetch(`/api/clinic-schedule?${params}`)
    if (res.ok) setSchedules(await res.json())
    setLoadingSchedules(false)
  }, [staff.id, selectedDate, staff.branch, schedulingBranch])

  useEffect(() => {
    if (open) loadSchedules()
  }, [open, loadSchedules])

  // Sync date changes
  useEffect(() => {
    setForm(f => ({ ...f, date: selectedDate }))
    if (open) loadSchedules()
  }, [selectedDate, open, loadSchedules])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function openAddForm() {
    setShowAdd(true)
    setFormError('')
    // Fetch last week same day suggestions
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 7)
    const lastWeekDate = d.toISOString().split('T')[0]
    try {
      const lwParams = new URLSearchParams({
        staffId: staff.id,
        date: lastWeekDate,
        branch: schedulingBranch,
      })
      const res = await fetch(`/api/clinic-schedule?${lwParams}`)
      if (res.ok) setLastWeekSuggestions(await res.json())
    } catch { /* silent */ }
    // Fetch decking suggestions for this day of week
    const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const dow = DOW_NAMES[new Date(selectedDate + 'T12:00:00').getDay()]
    try {
      // includeSupervised: also the intern hours this clinician oversees.
      const res = await fetch(`/api/decking/slots?staffId=${staff.id}&dayOfWeek=${dow}&includeSupervised=1`)
      if (res.ok) setDeckingSuggestions(await res.json())
    } catch { /* silent */ }
  }

  function closeAddForm() {
    setShowAdd(false)
    setLastWeekSuggestions([])
    setDeckingSuggestions([])
    setForm({ ...EMPTY_FORM, date: selectedDate, endTime: computeEndTime('08:00', '1h') })
  }

  function applyLastWeekSuggestion(s: Schedule) {
    setForm({
      patientId: s.patientId ?? '',
      patientLabel: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '',
      date: selectedDate,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      sessionType: s.sessionType,
      status: 'PENDING',
      notes: '',
      isTeletherapy: s.isTeletherapy || false,
      internStaffId: s.internStaffId ?? '',
      withMentor: s.withMentor ?? false,
    })
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.sessionType) { setFormError('Session type is required.'); return }
    setSaving(true)
    const res = await fetch('/api/clinic-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, ...form, isTeletherapy: form.isTeletherapy, branch: schedulingBranch }),
    })
    setSaving(false)
    if (res.ok) { closeAddForm(); loadSchedules() }
    else { const d = await res.json(); setFormError(d.error ?? 'Failed to save.') }
  }

  function startEdit(s: Schedule) {
    setEditId(s.id)
    setEditForm({
      patientId: s.patientId ?? '',
      patientLabel: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '',
      date: s.date.split('T')[0],
      startTime: s.startTime, endTime: s.endTime, duration: s.duration,
      sessionType: s.sessionType, status: s.status, notes: s.notes ?? '',
      isTeletherapy: s.isTeletherapy || false,
      internStaffId: s.internStaffId ?? '',
      withMentor: s.withMentor ?? false,
    })
    setEditError('')
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    setEditError('')
    if (!editForm.sessionType) { setEditError('Session type is required.'); return }
    setEditSaving(true)
    const res = await fetch('/api/clinic-schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editForm, branch: schedulingBranch }),
    })
    setEditSaving(false)
    if (res.ok) { setEditId(null); loadSchedules() }
    else { const d = await res.json(); setEditError(d.error ?? 'Failed to update.') }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch('/api/clinic-schedule', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteTarget.id }),
    })
    setDeleting(false); setDeleteTarget(null); loadSchedules()
  }

  async function sendReminder(scheduleId: string) {
    setSendingId(scheduleId)
    const res = await fetch('/api/clinic-schedule/send-reminder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId, branch: schedulingBranch }),
    })
    setSendingId(null)
    if (res.ok) showToast('Reminder sent!')
    else { const d = await res.json(); showToast(d.error ?? 'Failed to send email') }
  }

  async function sendAllReminders() {
    setSendingAll(true)
    const res = await fetch('/api/clinic-schedule/send-reminder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate, branch: schedulingBranch }),
    })
    setSendingAll(false)
    if (res.ok) { const d = await res.json(); showToast(`Sent ${d.sent} email reminder(s)`) }
    else { const d = await res.json(); showToast(d.error ?? 'Failed to send emails') }
  }

  async function sendSmsReminder(scheduleId: string) {
    setSendingSmsId(scheduleId)
    const res = await fetch('/api/clinic-schedule/send-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId, branch: schedulingBranch }),
    })
    setSendingSmsId(null)
    if (res.ok) {
      const d = await res.json()
      const ch = d.channel === 'viber' ? 'Viber' : 'SMS'
      showToast(`Reminder sent via ${ch}!`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send reminder')
    }
  }

  async function sendAllSmsReminders() {
    setSendingSmsAll(true)
    const res = await fetch('/api/clinic-schedule/send-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate, branch: schedulingBranch }),
    })
    setSendingSmsAll(false)
    if (res.ok) {
      const d = await res.json()
      const parts = []
      if (d.viber > 0) parts.push(`${d.viber} via Viber`)
      if (d.sms   > 0) parts.push(`${d.sms} via SMS`)
      showToast(`Sent ${d.sent} reminder(s) — ${parts.join(', ')}`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send reminders')
    }
  }

  async function sendClinicianSms() {
    if (!staff.phone) { showToast('No mobile number on file for this clinician'); return }
    setSendingClinicianSms(true)
    const res = await fetch('/api/clinic-schedule/send-clinician-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate, branch: schedulingBranch }),
    })
    setSendingClinicianSms(false)
    if (res.ok) {
      const d = await res.json()
      showToast(`Schedule sent to ${staff.firstName} (${d.patients} confirmed patient${d.patients !== 1 ? 's' : ''})`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send schedule to clinician')
    }
  }

  async function sendAbsentSms() {
    setSendingAbsentSms(true)
    const res = await fetch('/api/clinic-schedule/send-absent-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate, branch: schedulingBranch }),
    })
    setSendingAbsentSms(false)
    if (res.ok) {
      const d = await res.json()
      const parts = []
      if (d.viber > 0) parts.push(`${d.viber} via Viber`)
      if (d.sms   > 0) parts.push(`${d.sms} via SMS`)
      showToast(`Absent notice sent to ${d.sent} patient${d.sent !== 1 ? 's' : ''} — ${parts.join(', ')}`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send absent notices')
    }
  }

  async function sendAbsentEmail() {
    setSendingAbsentEmail(true)
    const res = await fetch('/api/clinic-schedule/send-absent-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate, branch: schedulingBranch }),
    })
    setSendingAbsentEmail(false)
    if (res.ok) {
      const d = await res.json()
      showToast(`Absent notice emailed to ${d.sent} patient${d.sent !== 1 ? 's' : ''}`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send absent notice emails')
    }
  }

  async function sendClinicianEmail() {
    setSendingClinicianEmail(true)
    const res = await fetch('/api/clinic-schedule/send-clinician-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate, branch: schedulingBranch }),
    })
    setSendingClinicianEmail(false)
    if (res.ok) {
      const d = await res.json()
      showToast(`Email sent to ${staff.firstName} (${d.patients} confirmed patient${d.patients !== 1 ? 's' : ''})`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send email to clinician')
    }
  }

  const isMultiBranch = (staff.extraBranches ?? []).length > 0
  const isSBEA = staff.branch === 'SBEA'

  // Notification buttons share one shape; the tone says who receives them.
  const NOTIFY_BTN = `${BTN_SM} cs-btn disabled:cursor-not-allowed`
  const TONE_PATIENT = { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }
  const TONE_ABSENT  = { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }
  const TONE_CLINIC  = { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }

  return (
    <div className={flat ? '' : 'rounded-xl overflow-hidden'} style={flat ? { background: '#fff' } : CARD_STYLE}>
      {/* Staff header row */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="cs-btn w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7FAFA] transition-colors text-left"
      >
        <Avatar text={`${staff.firstName[0] ?? ''}${staff.lastName[0] ?? ''}`.toUpperCase() || '?'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
            {staff.lastName}, {staff.firstName}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <DeptChip code={staff.department} color={deptColor(staff.department)} />
            {staff.isInternshipSupervisor && (
              <span title="Supervises students on clinical placement — sessions may be run by an intern"
                className="px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap leading-none"
                style={{ background: '#DBEAFE', color: '#1E40AF' }}>Clinical Supervisor</span>
            )}
            {staff.isClinicalMentor && (
              <span title="Mentors junior or newly licensed clinicians"
                className="px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap leading-none"
                style={{ background: '#FEF3C7', color: '#92400E' }}>Mentor</span>
            )}
            {mentorName && (
              <span title={`Mentored by ${mentorName} — tick "With Mentor" on sessions the mentor sits in on`}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap leading-none"
                style={{ background: '#FDE68A', color: '#78350F' }}>Mentee</span>
            )}
          </div>
        </div>
        <span className="hidden sm:inline-flex px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap leading-none"
          style={isMultiBranch
            ? { background: '#F1EEFD', color: '#5B21B6' }
            : isSBEA
              ? { background: 'var(--pale-teal)', color: 'var(--teal)' }
              : { background: '#FFF8E6', color: '#92400E' }}>
          {isMultiBranch ? 'Both Branches' : (branchLabel(staff.branch) ?? staff.branch)}
        </span>
        <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: open ? 'var(--pale-teal)' : 'transparent' }}>
          {open ? <ChevronUp size={16} style={{ color: 'var(--teal)' }} /> : <ChevronDown size={16} style={{ color: 'var(--mid-gray)' }} />}
        </span>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4" style={{ borderTop: '1px solid #EEF1F1', background: '#FBFCFC' }}>
          {/* Toast */}
          {toast && (
            <div role="status" className="rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2"
              style={{ background: 'var(--pale-teal)', color: 'var(--teal)', border: '1px solid #A9D4D9' }}>
              <MailCheck size={14} />{toast}
            </div>
          )}

          {/* Add Schedule toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              Schedules for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <button type="button" onClick={() => showAdd ? closeAddForm() : openAddForm()}
              className={showAdd ? BTN_SM : `${BTN_SM} text-white hover:opacity-90`}
              style={showAdd ? { ...CONTROL_STYLE } : { background: TEAL_HEX }}>
              {showAdd ? <><X size={12} /> Cancel</> : <><Plus size={12} /> Add Schedule</>}
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: '#fff', border: '1px solid #A9D4D9', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              {/* ── Last-week suggestions ── */}
              {lastWeekSuggestions.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold mb-1.5" style={{ color: 'var(--teal)' }}>
                    <History size={13} /> Re-use from last week ({new Date(new Date(selectedDate + 'T12:00:00').setDate(new Date(selectedDate + 'T12:00:00').getDate() - 7)).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {lastWeekSuggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => applyLastWeekSuggestion(s)}
                        className="cs-btn px-2.5 h-7 rounded-full text-xs font-medium transition-colors hover:bg-[#D9EEF0]"
                        style={{ background: 'var(--pale-teal)', color: 'var(--teal)', border: '1px solid #A9D4D9' }}
                      >
                        {s.patient ? `${s.patient.lastName}, ${s.patient.firstName[0]}.` : '(no patient)'}
                        {' · '}{formatTime(s.startTime)}
                        {' · '}{s.sessionType}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* ── Decking suggestions ── */}
              {deckingSuggestions.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold mb-1.5" style={{ color: '#C2410C' }}>
                    <LayoutGrid size={13} /> From Decking Schedule ({['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(selectedDate + 'T12:00:00').getDay()]})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {deckingSuggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setForm({
                          patientId: s.patient?.id ?? '',
                          patientLabel: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '',
                          date: selectedDate,
                          startTime: s.startTime,
                          endTime: s.endTime,
                          duration: 'custom',
                          sessionType: '',
                          status: 'PENDING',
                          notes: '',
                          isTeletherapy: false,
                          // An intern's decked hour fills the intern in, since
                          // that is how the session is recorded: the clinician
                          // is the staff member, the intern is named alongside.
                          internStaffId: s.staff && s.staff.id !== staff.id ? s.staff.id : '',
                          withMentor: false,
                        })}
                        className="cs-btn px-2.5 h-7 rounded-full text-xs font-medium transition-colors hover:bg-[#FDE3D2]"
                        // An intern's hour, in the same visual language as
                        // main's restyled chips rather than the old solid fill.
                        style={s.staff && s.staff.id !== staff.id
                          ? { background: '#EEF0FF', color: '#4338CA', border: '1px solid #C7CCF7' }
                          : { background: '#FFF1E8', color: '#C2410C', border: '1px solid #FBD5BC' }}
                      >
                        {s.patient ? `${s.patient.lastName}, ${s.patient.firstName[0]}.` : '(slot)'}
                        {' · '}{formatTime(s.startTime)}
                        {s.staff && s.staff.id !== staff.id
                          ? ` · intern ${s.staff.lastName}`
                          : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ScheduleForm dept={staff.department} branchEnum={BRANCH_ENUM[schedulingBranch] ?? ''} allStaff={allStaff} values={form} onChange={setForm}
                onSubmit={handleAdd} onCancel={closeAddForm}
                error={formError} submitting={saving} submitLabel="Save Schedule" />
            </div>
          )}

          {/* Schedules table — the previous rows stay on screen (dimmed) while a reload runs */}
          {loadingSchedules && schedules.length === 0 ? (
            <div className="rounded-lg p-3 space-y-2" style={{ background: '#fff', border: '1px solid var(--light-gray)' }} aria-busy="true" aria-label="Loading schedules">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-8" style={{ opacity: 1 - i * 0.2 }} />)}
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-lg py-6 px-4 text-center" style={{ background: '#fff', border: '1px dashed var(--light-gray)' }}>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No schedules for this day.</p>
            </div>
          ) : (
            <div className={`rounded-lg overflow-hidden transition-opacity ${loadingSchedules ? 'opacity-55' : ''}`}
              style={{ background: '#fff', border: '1px solid var(--light-gray)' }} aria-busy={loadingSchedules || undefined}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr style={{ background: TH_BG, borderBottom: '1px solid var(--light-gray)' }}>
                      {['Patient', 'Time', 'Session Type', 'Status', ''].map(h => (
                        <th key={h} className={`${TH} !px-3 !py-2 !text-[10.5px]`}
                          style={{ color: 'var(--mid-gray)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map(s => (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-[#F7FAFA] transition-colors"
                          style={{ borderBottom: editId === s.id ? 'none' : '1px solid #EEF1F1' }}>
                          <td className="px-3 py-2 h-11 font-semibold" style={{ color: 'var(--charcoal)' }}>
                            {s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                          </td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--charcoal)', whiteSpace: 'nowrap' }}>
                            {formatTime(s.startTime)} – {formatTime(s.endTime)}
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                            <span className="flex items-center gap-1.5">
                              {s.sessionType}
                              {s.isTeletherapy && (
                                s.meetLink
                                  ? <a href={s.meetLink} target="_blank" rel="noopener noreferrer" title="Join Meeting" className="hover:opacity-70"><Video size={13} style={{ color: '#1D4ED8' }} /></a>
                                  : <span title="Teletherapy (no link yet)" className="inline-flex"><Video size={13} style={{ color: '#93C5FD' }} /></span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={s.status} size="sm" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-0.5 justify-end">
                              <button type="button" onClick={() => editId === s.id ? setEditId(null) : startEdit(s)}
                                className="cs-btn w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#E8F4F5]" title="Edit" aria-label="Edit">
                                <Pencil size={13} style={{ color: 'var(--teal)' }} />
                              </button>
                              <button type="button" onClick={() => setDeleteTarget(s)}
                                className="cs-btn w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-50" title="Delete" aria-label="Delete">
                                <Trash2 size={13} style={{ color: '#DC2626' }} />
                              </button>
                              {s.patient?.email && (
                                <button type="button" onClick={() => sendReminder(s.id)} disabled={renter || sendingId === s.id}
                                  className="cs-btn w-7 h-7 rounded-md flex items-center justify-center hover:bg-blue-50 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={renter ? RENTER_NOTIFY_REASON : 'Send reminder email'} aria-label="Send reminder email">
                                  <Mail size={13} style={{ color: (renter || sendingId === s.id) ? 'var(--mid-gray)' : '#2563EB' }} />
                                </button>
                              )}
                              {s.patient?.phone && (
                                <button type="button" onClick={() => sendSmsReminder(s.id)} disabled={renter || sendingSmsId === s.id}
                                  className="cs-btn w-7 h-7 rounded-md flex items-center justify-center hover:bg-green-50 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={renter ? RENTER_NOTIFY_REASON : 'Send mobile text reminder'} aria-label="Send mobile text reminder">
                                  <MessageSquare size={13} style={{ color: (renter || sendingSmsId === s.id) ? 'var(--mid-gray)' : '#16A34A' }} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editId === s.id && (
                          <tr style={{ borderBottom: '1px solid #EEF1F1' }}>
                            <td colSpan={5} className="px-3 py-3" style={{ background: '#F3FAFA' }}>
                              <ScheduleForm dept={staff.department} branchEnum={BRANCH_ENUM[schedulingBranch] ?? ''} allStaff={allStaff} values={editForm} onChange={setEditForm}
                                onSubmit={handleEdit} onCancel={() => { setEditId(null); setEditError('') }}
                                error={editError} submitting={editSaving} submitLabel="Save Changes" />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Send all buttons — grouped by recipient */}
              <div className="px-3 py-3 space-y-2.5" style={{ borderTop: '1px solid var(--light-gray)', background: '#FAFBFB' }}>
                {renter && (
                  // Said once, plainly, above the whole block: a row of greyed
                  // buttons with no explanation reads as a bug, and the desk
                  // would ring HR about it.
                  <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px]"
                    style={{ background: '#FEF6E7', border: '1px solid #F3D9A4', color: '#7A4E08' }}>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Renter</span>
                    <span>
                      {staff.firstName} rents the facility for their own private clients.
                      Book their sessions here as usual — they appear in the queue — but
                      the clinic does not message their patients, so the buttons below are off.
                    </span>
                  </div>
                )}
                <div className="grid gap-2.5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
                  {/* Patients section */}
                  <p className="text-[10px] font-bold uppercase tracking-wider md:w-16" style={{ color: 'var(--mid-gray)' }}>Patients</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={sendAllReminders} disabled={renter || sendingAll}
                      className={NOTIFY_BTN} style={TONE_PATIENT}>
                      <MailCheck size={13} />
                      {sendingAll ? 'Sending…' : 'Email All Patients'}
                    </button>
                    <button type="button" onClick={sendAllSmsReminders} disabled={renter || sendingSmsAll}
                      className={NOTIFY_BTN} style={TONE_PATIENT}>
                      <MessageSquare size={13} />
                      {sendingSmsAll ? 'Sending…' : 'Text All Patients'}
                    </button>
                    <button type="button" onClick={sendAbsentSms} disabled={renter || sendingAbsentSms}
                      className={NOTIFY_BTN}
                      title={renter ? RENTER_NOTIFY_REASON : `Notify all of ${staff.firstName}'s patients today via SMS that they are absent`}
                      style={TONE_ABSENT}>
                      <Smartphone size={13} />
                      {sendingAbsentSms ? 'Sending…' : 'Text: Clinician Absent Notice'}
                    </button>
                    <button type="button" onClick={sendAbsentEmail} disabled={renter || sendingAbsentEmail}
                      className={NOTIFY_BTN}
                      title={renter ? RENTER_NOTIFY_REASON : `Notify all of ${staff.firstName}'s patients today via email that they are absent`}
                      style={TONE_ABSENT}>
                      <Mail size={13} />
                      {sendingAbsentEmail ? 'Sending…' : 'Email: Clinician Absent Notice'}
                    </button>
                  </div>
                  {/* Clinician section */}
                  <p className="text-[10px] font-bold uppercase tracking-wider md:w-16" style={{ color: 'var(--mid-gray)' }}>Clinician</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={sendClinicianSms} disabled={renter || sendingClinicianSms || !staff.phone}
                      className={NOTIFY_BTN}
                      title={renter ? RENTER_NOTIFY_REASON : !staff.phone ? 'No mobile number on file for this clinician' : `Text ${staff.firstName} their confirmed sessions for this day — pending, rescheduled and cancelled rows are left out`}
                      style={TONE_CLINIC}>
                      <Smartphone size={13} />
                      {sendingClinicianSms ? 'Sending…' : 'Text Clinician'}
                    </button>
                    <button type="button" onClick={sendClinicianEmail} disabled={renter || sendingClinicianEmail}
                      className={NOTIFY_BTN}
                      title={renter ? RENTER_NOTIFY_REASON : `Email ${staff.firstName} their confirmed sessions for this day — pending, rescheduled and cancelled rows are left out`}
                      style={TONE_CLINIC}>
                      <Mail size={13} />
                      {sendingClinicianEmail ? 'Sending…' : 'Email Clinician'}
                    </button>
                    <span className="text-[10.5px] italic" style={{ color: 'var(--mid-gray)' }}>
                      {renter
                        ? '*No automatic SMS either — nothing is sent for a renting clinician'
                        : '*Patient status change will automatically send SMS to clinician'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
              <div role="dialog" aria-modal="true" className="rounded-2xl p-5 w-full max-w-sm" style={{ background: '#fff', boxShadow: '0 24px 64px rgba(15,23,42,0.22)' }}>
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                    <Trash2 size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-sm mb-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                      Delete Schedule
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                      {deleteTarget.patient
                        ? `Remove ${deleteTarget.patient.lastName}, ${deleteTarget.patient.firstName}'s appointment at ${formatTime(deleteTarget.startTime)}?`
                        : `Remove appointment at ${formatTime(deleteTarget.startTime)}?`}
                      {' '}This cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end mt-5">
                  <button type="button" onClick={() => setDeleteTarget(null)} className={BTN_SECONDARY}
                    style={CONTROL_STYLE}>Cancel</button>
                  <button type="button" onClick={handleDelete} disabled={deleting} className={`${BTN_PRIMARY} px-4`}
                    style={{ background: '#DC2626', opacity: deleting ? 0.7 : 1 }}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ALL_DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']

// Decking Module weekly-schedule config (one row per clinician). workDays is
// stored as day codes e.g. ["MON","TUE","WED","THU","FRI"].
interface TherapistConfig { staffId: string; workDays: string[]; startTime: string; endTime: string; branch: string; department: string }
const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const WEEKDAY_FULL: Record<string, string> = {
  SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday',
}
function weekdayCodeFor(iso: string): string {
  return WEEKDAY_CODES[new Date(iso + 'T12:00:00').getDay()]
}
const tomorrowStr = localTomorrowStr
function fmtDateShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// ─── Main DepartmentView ───────────────────────────────────────────────────────
export default function DepartmentView({ role, selectedDate, onDateChange }: { role: string; selectedDate: string; onDateChange: (d: string) => void }) {
  const branches = visibleBranches(role)
  const [activeBranch, setActiveBranch] = useState(branches[0])
  const [activeDept, setActiveDept] = useState('Tomorrow')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [configs, setConfigs] = useState<TherapistConfig[]>([])
  const [loading, setLoading] = useState(true)
  // Manually-added make-up clinicians (work a session on a day that isn't on
  // their weekly Decking schedule). Keyed by staffId.
  const [makeupIds, setMakeupIds] = useState<string[]>([])
  const [makeupQuery, setMakeupQuery] = useState('')
  // Display-only: the roster load's error, and a counter "Try again" bumps to
  // re-run the same request.
  const [staffError, setStaffError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    fetch('/api/staff')
      .then(r => r.json())
      .then(data => {
        // A non-array (an { error } body) used to be stored as the roster and
        // crash the page on .filter; show it as an error instead.
        if (Array.isArray(data)) { setStaff(data); setStaffError('') }
        else setStaffError((data && typeof data.error === 'string' && data.error) || "Couldn't load the staff roster.")
      })
      .catch(() => setStaffError("Couldn't load the staff roster. Check your connection, then try again."))
      .finally(() => setLoading(false))
  }, [reloadKey])

  // Decking weekly schedules — drives the "Tomorrow" view.
  useEffect(() => {
    fetch('/api/decking/therapists')
      .then(r => r.json())
      .then((rows: TherapistConfig[]) => setConfigs(Array.isArray(rows) ? rows : []))
      .catch(() => setConfigs([]))
  }, [])

  // Reset dept filter + make-up picks when branch changes
  useEffect(() => { setActiveDept('Tomorrow'); setMakeupIds([]); setMakeupQuery('') }, [activeBranch])

  // Interns are never standalone clinicians — they hold no caseload of their
  // own and appear only as the "Select Intern" field inside a supervisor's
  // schedule entry (see ScheduleForm's isEligibleIntern picker). They must
  // stay in `staff` so that picker can still find them; they're excluded
  // here, from every list that renders a clinician row.
  const branchStaff = staff.filter(s => !isIntern(s) && (s.branch === activeBranch || (s.extraBranches ?? []).includes(activeBranch)))
  const presentDepts = ALL_DEPARTMENTS.filter(d => branchStaff.some(s => s.department === d))
  const filtered = activeDept === 'All' ? branchStaff : branchStaff.filter(s => s.department === activeDept)

  // ── "Tomorrow" view: clinicians whose Decking weekly schedule includes the
  // weekday of TOMORROW (today + 1), in the active branch. ────────────────────
  const tomorrowDate = tomorrowStr()
  const tomorrowCode = weekdayCodeFor(tomorrowDate)
  const staffById = new Map(staff.map(s => [s.id, s]))
  const tomorrowClinicians = configs
    .filter(c => Array.isArray(c.workDays) && c.workDays.includes(tomorrowCode))
    .map(c => ({ cfg: c, staff: staffById.get(c.staffId) }))
    .filter((x): x is { cfg: TherapistConfig; staff: StaffMember } => !!x.staff && !isIntern(x.staff) && (x.staff.branch === activeBranch || (x.staff.extraBranches ?? []).includes(activeBranch)))
    .sort((a, b) =>
      (a.staff.lastName || '').localeCompare(b.staff.lastName || '') ||
      (a.staff.firstName || '').localeCompare(b.staff.firstName || ''))

  // Group tomorrow's clinicians by department (in ALL_DEPARTMENTS order); each
  // group stays alphabetical because tomorrowClinicians is already sorted.
  const tomorrowByDept = [
    ...ALL_DEPARTMENTS.map(dept => ({ dept, list: tomorrowClinicians.filter(x => x.staff.department === dept) })),
    { dept: 'Other', list: tomorrowClinicians.filter(x => !ALL_DEPARTMENTS.includes(x.staff.department)) },
  ].filter(g => g.list.length > 0)

  // Make-up clinicians: manually added, in this branch, not already auto-listed.
  const autoIds = new Set(tomorrowClinicians.map(x => x.staff.id))
  const makeupClinicians = makeupIds
    .map(id => staffById.get(id))
    .filter((s): s is StaffMember => !!s && !isIntern(s) && (s.branch === activeBranch || (s.extraBranches ?? []).includes(activeBranch)) && !autoIds.has(s.id))
  // Type-ahead matches for the make-up search (exclude already-listed staff).
  const makeupMatches = makeupQuery.trim().length > 0
    ? branchStaff
        .filter(s => !autoIds.has(s.id) && !makeupIds.includes(s.id) &&
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(makeupQuery.trim().toLowerCase()))
        .slice(0, 8)
    : []

  // ── Display-only derived values ──
  const branchName = branchLabel(activeBranch) ?? activeBranch
  const isTodaySelected = selectedDate === localTodayStr()
  // The All / single-department list, grouped into one card per department
  // (ALL_DEPARTMENTS order, then anything else). Order inside a group is the
  // roster order, as before.
  const filteredByDept = [
    ...ALL_DEPARTMENTS.map(dept => ({ dept, list: filtered.filter(s => s.department === dept) })),
    { dept: 'Other', list: filtered.filter(s => !ALL_DEPARTMENTS.includes(s.department)) },
  ].filter(g => g.list.length > 0)

  const deptCard = (dept: string, count: number, children: React.ReactNode) => (
    <section key={dept} className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
      <header className="px-4 py-2.5 flex items-center gap-2" style={{ background: TH_BG, borderBottom: '1px solid var(--light-gray)' }}>
        <span aria-hidden className="w-1 h-4 rounded-full" style={{ background: deptColor(dept) }} />
        <h4 className="text-[13px] font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{dept}</h4>
        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          {count} clinician{count !== 1 ? 's' : ''}
        </span>
      </header>
      <div className="divide-y divide-[#EEF1F1]">{children}</div>
    </section>
  )

  const listSkeleton = (
    <div className="space-y-3" aria-busy="true" aria-label="Loading staff">
      {[0, 1].map(g => (
        <div key={g} className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          <div className="px-4 py-3" style={{ background: TH_BG, borderBottom: '1px solid var(--light-gray)' }}>
            <Skeleton className="h-3.5" style={{ width: 120 }} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? '1px solid #EEF1F1' : undefined }}>
              <Skeleton style={{ width: 34, height: 34, borderRadius: 999 }} />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5" style={{ width: 170 }} />
                <Skeleton className="h-3" style={{ width: 90 }} />
              </div>
              <Skeleton className="h-5 hidden sm:block" style={{ width: 84, borderRadius: 999 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Two relationships get decked on this page and are easy to confuse,
          because both put a second clinician in the room. Spelling them out
          here is cheaper than explaining it per card. */}
      <div className="rounded-xl px-4 py-3 text-xs flex gap-3" style={{ background: '#F3FAFA', border: '1px solid #D5EAEC' }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2 flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap mt-px leading-none"
              style={{ background: '#DBEAFE', color: '#1E40AF' }}>Clinical Supervisor</span>
            <span className="leading-relaxed" style={{ color: 'var(--charcoal)' }}>
              Licensed clinicians supervising <strong>students</strong>. Sessions are decked with the
              supervisor; the intern who ran it is recorded on the session.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap mt-px leading-none"
              style={{ background: '#FDE68A', color: '#78350F' }}>Mentee</span>
            <span className="leading-relaxed" style={{ color: 'var(--charcoal)' }}>
              Junior or newly licensed clinicians mentored by a senior clinician. Sessions are decked
              with the mentee; tick <strong>With Mentor</strong> when the mentor sits in.
            </span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <Toolbar right={!loading && !staffError ? (
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
          <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>
            {activeDept === 'Tomorrow' ? tomorrowClinicians.length : filtered.length}
          </strong>{' '}
          {activeDept === 'Tomorrow' ? 'on tomorrow’s deck' : 'clinicians'}
        </span>
      ) : undefined}>
        {/* Branch toggle (only for ADMIN / MARKETING_ADMIN) */}
        {branches.length > 1 && (
          <Field label="Branch">
            <PillTabs label="Branch" value={activeBranch} onChange={setActiveBranch}
              tabs={branches.map(b => ({ id: b, label: branchLabel(b) ?? b }))} />
          </Field>
        )}
        {/* Date picker */}
        <Field label="Date" htmlFor="dept-date">
          <div className="flex items-center gap-2">
            <input
              id="dept-date"
              type="date"
              value={selectedDate}
              onChange={e => onDateChange(e.target.value)}
              className={CONTROL}
              style={CONTROL_STYLE}
            />
            {isTodaySelected && <TodayTag />}
          </div>
        </Field>
        {/* Department filter */}
        {!loading && (
          <Field label="Show">
            <PillTabs label="Department" value={activeDept} onChange={setActiveDept}
              tabs={[
                { id: 'Tomorrow', label: <><CalendarClock size={13} /> Tomorrow</> },
                { id: 'All', label: 'All' },
                ...presentDepts.map(d => ({ id: d, label: d })),
              ]} />
          </Field>
        )}
      </Toolbar>

      {staffError && (
        <ErrorBanner message={staffError} onRetry={() => { setLoading(true); setStaffError(''); setReloadKey(k => k + 1) }} />
      )}

      {/* ── KPIs — from the roster and Decking schedules already loaded ── */}
      {loading ? <KpiSkeletonRow /> : !staffError && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Clinicians" icon={<Users size={15} />}
            value={branchStaff.length} sub={`in ${branchName}`} />
          <KpiCard label="On tomorrow's deck" icon={<CalendarClock size={15} />} accent="#ED6823"
            value={tomorrowClinicians.length} sub={WEEKDAY_FULL[tomorrowCode]} />
          <KpiCard label="Departments" icon={<Layers size={15} />} accent="var(--gold)"
            value={presentDepts.length} sub="with clinicians here" />
          <KpiCard label="Make-up sessions" icon={<UserPlus size={15} />} accent="#8B5CF6"
            value={makeupClinicians.length} sub={makeupClinicians.length ? 'added for tomorrow' : 'none added'} />
        </div>
      )}

      {/* "Tomorrow" view — clinicians working tomorrow + make-ups + Front Desk card */}
      {!loading && activeDept === 'Tomorrow' && !(staffError && staff.length === 0) ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] items-start">
          {/* Left — clinicians working tomorrow (+ make-up sessions) */}
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <div className="flex items-baseline justify-between mb-2.5 flex-wrap gap-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                  Clinicians tomorrow · {fmtDateShort(tomorrowDate)}
                </h3>
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {tomorrowClinicians.length} on schedule · {branchName}
                </span>
              </div>
              {tomorrowClinicians.length === 0 ? (
                <div className="rounded-xl py-12 px-6 flex flex-col items-center gap-2 text-center" style={CARD_STYLE}>
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center mb-1" style={{ background: 'var(--pale-teal)' }}>
                    <CalendarClock size={20} style={{ color: 'var(--teal)' }} />
                  </span>
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>No clinicians scheduled tomorrow</p>
                  <p className="text-xs max-w-sm" style={{ color: 'var(--mid-gray)' }}>
                    No {branchName} clinician has a {WEEKDAY_FULL[tomorrowCode]} in the Decking Module. Add a make-up session on the right if needed.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tomorrowByDept.map(g => deptCard(g.dept, g.list.length,
                    g.list.map(({ staff: s }) => (
                      <StaffCard key={s.id} flat staff={s} allStaff={staff} selectedDate={tomorrowDate} schedulingBranch={activeBranch} />
                    )),
                  ))}
                </div>
              )}
            </div>

            {/* Make-up sessions — manually added clinicians, with full scheduling */}
            {makeupClinicians.length > 0 && (
              <section className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #FBD5BC' }}>
                <header className="px-4 py-2.5 flex items-center gap-2" style={{ background: '#FFF7F1', borderBottom: '1px solid #FBD5BC' }}>
                  <UserPlus size={14} style={{ color: '#C2410C' }} />
                  <h3 className="text-[13px] font-bold" style={{ color: '#C2410C', fontFamily: 'var(--font-display)' }}>
                    Make-up sessions · {fmtDateShort(tomorrowDate)}
                  </h3>
                </header>
                <div className="divide-y divide-[#F6E3D6]">
                  {makeupClinicians.map(s => (
                    <div key={s.id}>
                      <div className="flex items-center justify-between gap-2 px-4 pt-2.5">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFF1E8', color: '#C2410C', border: '1px solid #FBD5BC' }}>
                          Make-up · {s.firstName} {s.lastName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMakeupIds(ids => ids.filter(id => id !== s.id))}
                          className={`${BTN_SM} cs-btn h-7`}
                          style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }}>
                          <X size={12} /> Remove
                        </button>
                      </div>
                      <StaffCard flat staff={s} allStaff={staff} selectedDate={tomorrowDate} schedulingBranch={activeBranch} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right — Front Desk card, reminder, and make-up search */}
          <div className="flex flex-col gap-3 min-w-0">
            <DeskShortcutCard />
            <div role="note" className="rounded-xl px-3.5 py-3 flex gap-2.5"
              style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #DC2626' }}>
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
              <p className="text-[13px] font-semibold m-0" style={{ color: '#B91C1C', lineHeight: 1.45 }}>
                Note: Don&apos;t forget to include new patients, especially to medical doctors,
                psychologists and physical therapists from clinic inquiries.
              </p>
            </div>

            {/* Make-up clinician search */}
            <div className="rounded-xl p-4" style={CARD_STYLE}>
              <p className="flex items-center gap-2 text-sm font-bold mb-2.5" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                <UserPlus size={15} style={{ color: 'var(--teal)' }} />
                Any clinicians who will do make up sessions?
              </p>
              <div style={{ position: 'relative' }}>
                <Search size={14} aria-hidden className="absolute left-2.5 top-[18px] -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                <input
                  type="text"
                  value={makeupQuery}
                  onChange={e => setMakeupQuery(e.target.value)}
                  placeholder="Search clinician name…"
                  aria-label="Search clinician name"
                  className={`${CONTROL} w-full pl-8`}
                  style={CONTROL_STYLE}
                />
                {makeupMatches.length > 0 && (
                  <div className="rounded-lg mt-1 overflow-hidden" style={{ border: '1px solid var(--light-gray)', background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
                    {makeupMatches.map(s => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => { setMakeupIds(ids => [...ids, s.id]); setMakeupQuery('') }}
                        className="cs-btn w-full text-left px-3 py-2 text-sm hover:bg-[#F5FAFA] flex items-center justify-between gap-2"
                        style={{ color: 'var(--charcoal)', borderTop: '1px solid #F1F4F4' }}>
                        <span className="flex items-center gap-2 min-w-0">
                          <Plus size={13} className="flex-shrink-0" style={{ color: 'var(--teal)' }} />
                          <span className="truncate">{s.firstName} {s.lastName}</span>
                        </span>
                        <DeptChip code={s.department} color={deptColor(s.department)} />
                      </button>
                    ))}
                  </div>
                )}
                {makeupQuery.trim().length > 0 && makeupMatches.length === 0 && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                    No matching clinician in {branchName} (already-scheduled clinicians are hidden).
                  </p>
                )}
              </div>
              <p className="text-[11px] mt-2.5" style={{ color: 'var(--mid-gray)', lineHeight: 1.45 }}>
                Add a clinician here to schedule a make-up session on a day that isn&apos;t part of their
                weekly schedule. They&apos;ll appear under <strong>Make-up sessions</strong> on the left.
              </p>
            </div>
          </div>
        </div>
      ) : loading ? (
        listSkeleton
      ) : staffError && staff.length === 0 ? (
        null
      ) : filtered.length === 0 ? (
        <div className="rounded-xl py-14 px-6 flex flex-col items-center gap-2 text-center" style={CARD_STYLE}>
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center mb-1" style={{ background: 'var(--pale-teal)' }}>
            <Users size={20} style={{ color: 'var(--teal)' }} />
          </span>
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            {activeDept === 'All' ? `No ${branchName} staff found` : `No ${activeDept} staff in ${branchName}`}
          </p>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {activeDept === 'All' ? 'Add staff in the Staff Module first.' : 'Try a different department filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredByDept.map(g => deptCard(g.dept, g.list.length,
            g.list.map(s => (
              <StaffCard key={s.id} flat staff={s} allStaff={staff} selectedDate={selectedDate} schedulingBranch={activeBranch} />
            )),
          ))}
        </div>
      )}
    </div>
  )
}
