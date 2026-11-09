'use client'

import { useEffect, useMemo, useState, useRef, useCallback, type CSSProperties, type ReactNode } from 'react'
import { localTodayStr } from '@/lib/utils'
import { branchForRole } from '@/lib/role-branch'
import {
  UserPlus, Trash2, ChevronUp, ChevronDown, Upload, Tv2,
  X, Plus, ExternalLink, ImageIcon, Film, RefreshCw,
  ListOrdered, Megaphone, CalendarDays, CalendarCheck, CheckCircle2, AlertTriangle,
  Loader2, Building2, Info, Clock, Users, Trophy, MessageSquareWarning, Timer, XCircle,
} from 'lucide-react'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

// ─── Department colours (light theme) ────────────────────────────────────────
const DEPT_COLORS: Record<string, { bg: string; color: string }> = {
  OT:         { bg: '#CCFBF1', color: '#0F766E' },
  PT:         { bg: '#DBEAFE', color: '#1D4ED8' },
  SLP:        { bg: '#EDE9FE', color: '#7C3AED' },
  SPED:       { bg: '#FED7AA', color: '#EA580C' },
  MD:         { bg: '#FEE2E2', color: '#DC2626' },
  PSYCHOLOGY: { bg: '#CFFAFE', color: '#0891B2' },
  ORTHOSIS:   { bg: '#FEF9C3', color: '#CA8A04' },
}
const DEPT_FALLBACK = { bg: '#F3F4F6', color: '#374151' }

// Appointment status badges — same bg/fg/border + dot vocabulary as LOA Submission.
const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  PENDING:     { bg: '#FFF7E6', fg: '#8A5A00', border: '#F3D9A5', label: 'Pending' },
  CONFIRMED:   { bg: '#DFF5E4', fg: '#166534', border: '#B6E5C2', label: 'Confirmed' },
  CANCELLED:   { bg: '#FDE4E4', fg: '#991B1B', border: '#F5C2C2', label: 'Cancelled' },
  RESCHEDULED: { bg: '#EFE8FB', fg: '#5B21B6', border: '#DDD0F3', label: 'Rescheduled' },
  NO_SHOW:     { bg: '#FFEDD5', fg: '#9A3412', border: '#FBD3AE', label: 'No-show' },   // amber: not cancelled, not rescheduled
}
const INACTIVE_STATUSES = new Set(['CANCELLED', 'RESCHEDULED', 'NO_SHOW'])

const TIME_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00',
]
const SESSION_TYPES: Record<string, string[]> = {
  OT: [
    'IE (Cash)', 'IE (HMO)',
    'Basic Session (Cash)', 'Basic Session (HMO)',
    'Specialized Session (Cash)', 'Specialized Session (HMO)',
    'Group Session (Cash)', 'Group Session (HMO)',
    'PTC (Cash)', 'PTC (HMO)',
    'Aquatherapy (Cash)', 'Aquatherapy (HMO)',
    'IE Intern', 'Session Intern',
  ],
  PT: [
    'IE (Cash)', 'IE (HMO)',
    'Basic Session (Cash)', 'Basic Session (HMO)',
    'Specialized Session (Cash)', 'Specialized Session (HMO)',
    'Group Session (Cash)', 'Group Session (HMO)',
    'PTC (Cash)', 'PTC (HMO)',
    'Aquatherapy (Cash)', 'Aquatherapy (HMO)',
    'IE Intern', 'Session Intern',
  ],
  SLP: [
    'IE (Cash)', 'IE (HMO)',
    'Basic Session (Cash)', 'Basic Session (HMO)',
    'Specialized Session (Cash)', 'Specialized Session (HMO)',
    'Group Session (Cash)', 'Group Session (HMO)',
    'PTC (Cash)', 'PTC (HMO)',
    'Aquatherapy (Cash)', 'Aquatherapy (HMO)',
    'IE Intern', 'Session Intern',
  ],
  SPED:       ['IE', 'Basic Session', 'PTC', 'Group Session'],
  MD:         ['Initial Consult', 'Follow Up'],
  PSYCHOLOGY: ['Individual', 'Couple', 'Family', 'Testing'],
  ORTHOSIS:   ['Initial Consult', 'Follow Up'],
}
const DURATION_MINUTES: Record<string, number> = { '1h': 60, '1.5h': 90, '2h': 120 }

function computeEndTime(start: string, duration: string): string {
  if (duration === 'custom') return ''
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + (DURATION_MINUTES[duration] ?? 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function formatTime(t: string): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
// Via branchForRole, not a prefix test of its own. The roles are actually named
// AHEA_FRONT_DESK / AHGH_ADMIN, so `role.startsWith('SBEA_')` matched none of
// the accounts it was meant to restrict and every branch-scoped user here could
// see — and post ads to — the other branch's screen.
function visibleBranches(role: string): string[] {
  const only = branchForRole(role)
  return only ? [only] : ['SBEA', 'SBGH']
}
/** "Mon, Nov 9" for a YYYY-MM-DD string, read as a local calendar date. */
function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
/** Local wall-clock time as "HH:MM", comparable with queue startTime/endTime. */
function nowHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface QueueEntry {
  id: string; startTime: string; endTime: string; sessionType: string; status: string
  department: string; therapist: string; initials: string; patientName: string | null
  staffId: string
}
interface StaffMember {
  id: string; firstName: string; lastName: string; department: string; branch: string
  employmentType?: string | null; active?: boolean
  dateHired?: string | null; contractExpiry?: string | null // interns: Start Month / End Month
}
interface Patient { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
interface Ad { id: string; fileName: string; mimeType: string; order: number; branch: string }

const INTERN_SESSION_TYPES = new Set(['IE Intern', 'Session Intern'])

// Interns are attached to a supervisor's session via the "Select Intern"
// field; they are never bookable clinicians in their own right. Deliberately
// date-independent, unlike isEligibleIntern below — an intern outside their
// Start/End Month is still an intern and must not fall back into the
// clinician list.
function isIntern(s: StaffMember): boolean {
  return s.employmentType === 'intern'
}

// Is this staff member an intern whose Start/End Month covers `forDate`
// (YYYY-MM-DD)? Falls back to today if no date is picked yet.
function isEligibleIntern(s: StaffMember, forDate: string): boolean {
  if (s.employmentType !== 'intern' || s.active === false) return false
  const d = forDate || localTodayStr()
  if (s.dateHired) {
    const startMonth = s.dateHired.split('T')[0].slice(0, 7)
    if (d < `${startMonth}-01`) return false
  }
  if (s.contractExpiry) {
    const endMonth = s.contractExpiry.split('T')[0].slice(0, 7)
    const [y, m] = endMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate() // last calendar day of the End Month
    if (d > `${endMonth}-${String(lastDay).padStart(2, '0')}`) return false
  }
  return true
}

// ─── Presentation ─────────────────────────────────────────────────────────────
// Same control/button vocabulary as Partner Institutions, LOA Submission and
// Patient Relationship, so the page reads as part of the same app.
const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60'
const BTN_ICON = 'inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed'
const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'

// Form fields (walk-in modal)
const FIELD = 'w-full h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const FIELD_STYLE: CSSProperties = CONTROL_STYLE
const FIELD_READONLY: CSSProperties = { ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }

function Label({ children }: { children: ReactNode }) {
  return (
    <label className={`block mb-1 ${SECTION_LABEL}`} style={{ color: 'var(--mid-gray)' }}>{children}</label>
  )
}

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLE[status] ?? {
    bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB',
    label: status.charAt(0) + status.slice(1).toLowerCase(),
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.fg }} />
      {st.label}
    </span>
  )
}

function DeptPill({ dept }: { dept: string }) {
  const c = DEPT_COLORS[dept] ?? DEPT_FALLBACK
  return (
    <span className="inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded leading-none whitespace-nowrap"
      style={{ background: c.bg, color: c.color }}>
      {dept}
    </span>
  )
}

/** Segmented control — the page tabs and the branch switcher. */
function Segmented<T extends string>({ items, value, onChange, label, size = 'sm' }: {
  items: { key: T; label: string; icon?: ReactNode }[]
  value: T; onChange: (k: T) => void; label: string; size?: 'md' | 'sm'
}) {
  return (
    <div role="tablist" aria-label={label}
      className="flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full w-fit"
      style={size === 'md' ? CARD_STYLE : { background: '#EEF3F1' }}>
      {items.map(({ key, label: l, icon }) => {
        const active = value === key
        return (
          <button key={key} type="button" role="tab" aria-selected={active} onClick={() => onChange(key)}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'} ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? size === 'md'
                ? { background: 'var(--teal)', color: '#fff' }
                : { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {icon}
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Visual on/off switch wrapped around the existing sr-only checkbox. */
function SwitchVisual({ on, busy }: { on: boolean; busy: boolean }) {
  return (
    <div aria-hidden style={{
      width: '2.5rem', height: '1.4rem', borderRadius: '99px',
      background: on ? 'var(--teal)' : '#D6DEDB',
      position: 'relative', transition: 'background 0.2s',
      opacity: busy ? 0.6 : 1,
      cursor: busy ? 'wait' : 'pointer',
    }}>
      <div style={{
        width: '1.05rem', height: '1.05rem', borderRadius: '50%',
        background: '#fff', position: 'absolute', top: '0.175rem',
        left: on ? '1.275rem' : '0.175rem',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function SettingRow({ icon, tone, title, hint, children }: {
  icon: ReactNode; tone: { bg: string; fg: string }; title: string; hint: ReactNode; children?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: tone.bg, color: tone.fg }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{hint}</p>
      </div>
      {children}
    </div>
  )
}

// ─── Patient search typeahead ─────────────────────────────────────────────────
function PatientSearch({ value, label, onChange }: {
  value: string; label: string
  onChange: (id: string, label: string, patient?: Patient) => void
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

  return (
    <div className="relative">
      <input className={FIELD} style={FIELD_STYLE} placeholder="Search existing patient…" value={query}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off" />
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          {results.map(p => (
            <button key={p.id} type="button"
              className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 text-sm hover:bg-[#F6F9F8] transition-colors"
              style={{ color: 'var(--charcoal)', borderBottom: '1px solid var(--light-gray)' }}
              onMouseDown={() => {
                onChange(p.id, `${p.lastName}, ${p.firstName}`, p)
                setQuery(`${p.lastName}, ${p.firstName}`)
                setOpen(false)
              }}>
              <span className="font-semibold truncate">{p.lastName}, {p.firstName}</span>
              {p.phone && <span className="text-xs flex-shrink-0 tabular-nums" style={{ color: 'var(--mid-gray)' }}>{p.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Walk-in modal ────────────────────────────────────────────────────────────
function WalkInModal({ staff, defaultBranch, defaultDate, onClose, onSaved }: {
  staff: StaffMember[]; defaultBranch: string; defaultDate: string
  onClose: () => void; onSaved: () => void
}) {
  const [patientId, setPatientId] = useState('')
  const [patientLabel, setPatientLabel] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Patient fields (new)
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [dob, setDob]               = useState('')
  const [sex, setSex]               = useState('')
  const [address, setAddress]       = useState('')
  const [diagnosis, setDiagnosis]   = useState('')

  // Schedule fields
  // Interns excluded — this list is the bookable-clinician dropdown. The
  // "Select Intern" picker below reads from the unfiltered `staff`, so it
  // still finds them.
  const branchStaff = staff.filter(s => !isIntern(s) && s.branch === defaultBranch)
  const [staffId, setStaffId]       = useState('')
  const [startTime, setStartTime]   = useState('08:00')
  const [duration, setDuration]     = useState('1h')
  const [endTime, setEndTime]       = useState(computeEndTime('08:00', '1h'))
  const [sessionType, setSessionType] = useState('')
  const [status, setStatus]         = useState('PENDING')
  const [notes, setNotes]           = useState('')
  const [internStaffId, setInternStaffId] = useState('')

  const selectedStaff = branchStaff.find(s => s.id === staffId)
  const deptTypes = selectedStaff ? (SESSION_TYPES[selectedStaff.department] ?? []) : []

  function handleDuration(dur: string) {
    setDuration(dur)
    setEndTime(dur === 'custom' ? endTime : computeEndTime(startTime, dur))
  }
  function handleStart(st: string) {
    setStartTime(st)
    setEndTime(duration === 'custom' ? endTime : computeEndTime(st, duration))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!staffId)      { setError('Please select a therapist.'); return }
    if (!sessionType)  { setError('Session type is required.'); return }
    if (isNew && (!firstName || !lastName)) { setError('Patient name is required.'); return }
    if (!isNew && !patientId) { setError('Please select or create a patient.'); return }

    setSaving(true)
    const body = {
      patientId: patientId || undefined,
      ...(isNew ? { firstName, lastName, phone, email, dob, sex, address, diagnosis } : {}),
      staffId, date: defaultDate, startTime, endTime, duration, sessionType, status, notes,
      internStaffId: INTERN_SESSION_TYPES.has(sessionType) ? (internStaffId || undefined) : undefined,
    }
    const res = await fetch('/api/queueing/walkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) { onSaved() }
    else { const d = await res.json(); setError(d.error ?? 'Failed to save.') }
  }

  const stepHeading = (n: number, title: string, right?: ReactNode) => (
    <div className="flex items-center justify-between gap-3 mb-3">
      <p className="flex items-center gap-2 text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{ background: 'var(--teal)', color: '#fff' }}>{n}</span>
        {title}
      </p>
      {right}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:py-8"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="walkin-title"
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
              <UserPlus size={17} />
            </span>
            <div className="min-w-0">
              <h3 id="walkin-title" className="text-lg font-bold leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Add Walk-in Patient
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                {BRANCH_LABEL[defaultBranch] ?? defaultBranch} · {formatDay(defaultDate)}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X size={16} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium"
                style={{ background: '#FDE4E4', color: '#991B1B', border: '1px solid #F5C2C2' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-px" /> {error}
              </div>
            )}

            {/* ── Patient section ─────────────────────────────────────────── */}
            <div>
              {stepHeading(1, 'Patient', isNew ? (
                <button type="button" onClick={() => setIsNew(false)}
                  className="text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
                  Search existing instead
                </button>
              ) : undefined)}
              {!isNew ? (
                <div>
                  <Label>Search Existing Patient</Label>
                  <PatientSearch value={patientId} label={patientLabel}
                    onChange={(id, lbl) => { setPatientId(id); setPatientLabel(lbl) }} />
                  <button type="button" onClick={() => { setIsNew(true); setPatientId(''); setPatientLabel('') }}
                    className="inline-flex items-center gap-1 text-xs font-semibold mt-2 hover:underline" style={{ color: 'var(--teal)' }}>
                    <Plus size={12} /> New patient (not in CRM)
                  </button>
                </div>
              ) : (
                <div className="rounded-xl p-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                  <p className={`mb-3 ${SECTION_LABEL}`} style={{ color: 'var(--teal)' }}>New Patient</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>First Name *</Label>
                      <input className={FIELD} style={FIELD_STYLE} value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    </div>
                    <div>
                      <Label>Last Name *</Label>
                      <input className={FIELD} style={FIELD_STYLE} value={lastName} onChange={e => setLastName(e.target.value)} required />
                    </div>
                    <div>
                      <Label>Phone / Cellphone No.</Label>
                      <input className={FIELD} style={FIELD_STYLE} value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <input className={FIELD} style={FIELD_STYLE} type="email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <Label>Date of Birth</Label>
                      <input className={FIELD} style={FIELD_STYLE} type="date" value={dob} onChange={e => setDob(e.target.value)} />
                    </div>
                    <div>
                      <Label>Sex</Label>
                      <select className={FIELD} style={FIELD_STYLE} value={sex} onChange={e => setSex(e.target.value)}>
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Address / Barangay</Label>
                      <input className={FIELD} style={FIELD_STYLE} value={address} onChange={e => setAddress(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Diagnosis</Label>
                      <input className={FIELD} style={FIELD_STYLE} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Schedule section ─────────────────────────────────────────── */}
            <div>
              {stepHeading(2, 'Schedule')}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Therapist *</Label>
                  <select className={FIELD} style={FIELD_STYLE} value={staffId} onChange={e => { setStaffId(e.target.value); setSessionType('') }}>
                    <option value="">Select therapist…</option>
                    {branchStaff.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.lastName}, {s.firstName} ({s.department})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Date</Label>
                  <input type="date" value={defaultDate} readOnly className={FIELD} style={FIELD_READONLY} />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <select className={FIELD} style={FIELD_STYLE} value={startTime} onChange={e => handleStart(e.target.value)}>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Duration</Label>
                  <select className={FIELD} style={FIELD_STYLE} value={duration} onChange={e => handleDuration(e.target.value)}>
                    <option value="1h">1 Hour</option>
                    <option value="1.5h">1.5 Hours</option>
                    <option value="2h">2 Hours</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <Label>End Time</Label>
                  {duration === 'custom' ? (
                    <input
                      type="time"
                      step="60"
                      className={FIELD}
                      style={FIELD_STYLE}
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                    />
                  ) : (
                    <input className={FIELD} style={FIELD_READONLY}
                      value={endTime ? formatTime(endTime) : '—'} readOnly />
                  )}
                </div>
                <div>
                  <Label>Session Type *</Label>
                  <select className={FIELD} style={FIELD_STYLE} value={sessionType} onChange={e => {
                    const val = e.target.value
                    setSessionType(val)
                    if (!INTERN_SESSION_TYPES.has(val)) setInternStaffId('')
                  }}>
                    <option value="">{selectedStaff ? 'Select type' : 'Pick a therapist first'}</option>
                    {deptTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {INTERN_SESSION_TYPES.has(sessionType) && (
                  <div>
                    <Label>Select Intern</Label>
                    {(() => {
                      const eligible = selectedStaff
                        ? staff
                            .filter(s => s.department === selectedStaff.department && isEligibleIntern(s, defaultDate))
                            .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
                        : []
                      return eligible.length === 0 ? (
                        <div className={`${FIELD} flex items-center text-xs`} style={FIELD_READONLY}>
                          No active {selectedStaff?.department} interns right now
                        </div>
                      ) : (
                        <select className={FIELD} style={FIELD_STYLE} value={internStaffId} onChange={e => setInternStaffId(e.target.value)}>
                          <option value="">Select intern…</option>
                          {eligible.map(s => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
                        </select>
                      )
                    })()}
                  </div>
                )}
                <div>
                  <Label>Status</Label>
                  <select className={FIELD} style={FIELD_STYLE} value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="PENDING">Pending</option>
                    <option value="CONFIRMED">Confirmed</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Notes (optional)</Label>
                  <textarea className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[var(--teal)]"
                    style={{ ...FIELD_STYLE, resize: 'vertical', minHeight: '64px' }}
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end px-6 py-3.5" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
            <button type="button" onClick={onClose} className={BTN_SECONDARY} style={CONTROL_STYLE}>Cancel</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Saving…' : 'Add to Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}
const BRANCH_OPTIONS = [
  { value: 'ALL',  label: 'All Branches',        color: '#6B7280' },
  { value: 'SBEA', label: 'East Branch Only',     color: '#0D9488' },
  { value: 'SBGH', label: 'Greenhills Branch Only', color: '#2563EB' },
]

// ─── Ads Manager ─────────────────────────────────────────────────────────────
function AdsManager({ role }: { role: string }) {
  const [ads, setAds]           = useState<Ad[]>([])
  const [adsLoaded, setAdsLoaded] = useState(false)
  const [adsError, setAdsError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [uploadErr, setUploadErr] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [togglingLb, setTogglingLb] = useState(false)
  const [showComplaintForm, setShowComplaintForm] = useState(false)
  const [togglingCf, setTogglingCf] = useState(false)
  const [adSlideDuration, setAdSlideDuration] = useState(12)
  const [savingDuration, setSavingDuration] = useState(false)
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Branch-restricted accounts can only manage ads for their own branch
  const ownBranch = branchForRole(role)
  const allowedBranches = ownBranch
    ? BRANCH_OPTIONS.filter(o => o.value === ownBranch)
    : BRANCH_OPTIONS
  const [uploadBranch, setUploadBranch] = useState(allowedBranches[0].value)

  // ── Waiting-room announcements ───────────────────────────────────────────
  // Three boxes per scope, saved together. The scope follows the ad upload
  // picker so front desk are never editing one branch's screen while looking at
  // the other branch's ads.
  const [annBranch, setAnnBranch] = useState(allowedBranches[0].value)
  const [annTexts, setAnnTexts] = useState<string[]>(['', '', ''])
  const [annLoaded, setAnnLoaded] = useState(false)
  const [annSaving, setAnnSaving] = useState(false)
  const [annSavedAt, setAnnSavedAt] = useState('')
  const [annErr, setAnnErr] = useState('')
  const annTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ANN_MAX = 160

  const loadAnnouncements = useCallback(async (scope: string) => {
    try {
      const res = await fetch('/api/queue-announcements')
      if (!res.ok) { setAnnErr(`Could not load the announcements (HTTP ${res.status}).`); return }
      const rows = await res.json() as { branch: string; slot: number; text: string }[]
      const mine = ['', '', '']
      for (const r of rows) if (r.branch === scope && r.slot >= 0 && r.slot < 3) mine[r.slot] = r.text
      setAnnTexts(mine)
      setAnnErr('')
    } catch (e) {
      setAnnErr(e instanceof Error ? e.message : 'Could not load the announcements.')
    } finally {
      setAnnLoaded(true)
    }
  }, [])

  // Saved on a delay rather than per keystroke: this text goes straight to a
  // screen in the waiting room, and writing it mid-sentence would put half a
  // word in front of patients.
  const saveAnnouncements = useCallback((scope: string, texts: string[]) => {
    if (annTimer.current) clearTimeout(annTimer.current)
    annTimer.current = setTimeout(async () => {
      setAnnSaving(true)
      try {
        const res = await fetch('/api/queue-announcements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch: scope, texts }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => null) as { error?: string } | null
          setAnnErr(j?.error ?? `Could not save (HTTP ${res.status}).`)
        } else {
          setAnnErr('')
          setAnnSavedAt(new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }))
        }
      } catch (e) {
        setAnnErr(e instanceof Error ? e.message : 'Could not save.')
      } finally {
        setAnnSaving(false)
      }
    }, 900)
  }, [])

  function handleAnnChange(i: number, value: string) {
    const next = annTexts.map((t, n) => (n === i ? value.slice(0, ANN_MAX) : t))
    setAnnTexts(next)
    saveAnnouncements(annBranch, next)
  }

  function handleAnnBranch(scope: string) {
    if (annTimer.current) clearTimeout(annTimer.current)   // don't save into the new scope
    setAnnBranch(scope)
    setAnnLoaded(false)
    setAnnSavedAt('')
    loadAnnouncements(scope)
  }

  const loadAds = useCallback(async () => {
    try {
      const res = await fetch('/api/queue-ads')
      if (res.ok) { setAds(await res.json()); setAdsError('') }
      else setAdsError(`Could not load the ad list (HTTP ${res.status}).`)
    } catch (e) {
      setAdsError(e instanceof Error ? e.message : 'Could not load the ad list.')
    } finally {
      setAdsLoaded(true)
    }
  }, [])

  // Load settings (leaderboard + complaint form)
  const loadLeaderboardSetting = useCallback(async () => {
    const res = await fetch('/api/queue-ads/settings')
    if (res.ok) {
      const data = await res.json()
      setShowLeaderboard(data.showLeaderboard ?? false)
      setShowComplaintForm(data.showComplaintForm ?? false)
      setAdSlideDuration(data.adSlideDuration ?? 12)
    }
  }, [])

  useEffect(() => { loadAds(); loadLeaderboardSetting(); loadAnnouncements(annBranch) },
    // annBranch is handled by handleAnnBranch, which reloads on its own; adding
    // it here would refetch and clobber whatever is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadAds, loadLeaderboardSetting, loadAnnouncements])

  async function handleToggleLeaderboard(checked: boolean) {
    setTogglingLb(true)
    setShowLeaderboard(checked)
    await fetch('/api/queue-ads/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showLeaderboard: checked }),
    })
    setTogglingLb(false)
  }

  async function handleToggleComplaintForm(checked: boolean) {
    setTogglingCf(true)
    setShowComplaintForm(checked)
    await fetch('/api/queue-ads/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showComplaintForm: checked }),
    })
    setTogglingCf(false)
  }

  function handleSlideDurationChange(val: number) {
    const clamped = Math.min(120, Math.max(5, val))
    setAdSlideDuration(clamped)
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current)
    durationTimerRef.current = setTimeout(async () => {
      setSavingDuration(true)
      await fetch('/api/queue-ads/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSlideDuration: clamped }),
      })
      setSavingDuration(false)
    }, 600)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadErr('')
    setUploading(true)
    setUploadTotal(files.length)
    setUploadCurrent(0)
    setUploadProgress(0)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadCurrent(i + 1)
      setUploadProgress(0)
      const err = await new Promise<string | null>((resolve) => {
        const form = new FormData()
        form.append('file', file)
        form.append('branch', uploadBranch)
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(null)
          } else {
            try {
              const d = JSON.parse(xhr.responseText)
              resolve(`${file.name}: ${d.error ?? `Upload failed (${xhr.status})`}`)
            } catch {
              resolve(`${file.name}: Upload failed (${xhr.status})`)
            }
          }
        }
        xhr.onerror = () => resolve(`${file.name}: Network error — check your connection`)
        xhr.open('POST', '/api/queue-ads')
        xhr.send(form)
      })
      if (err) { setUploadErr(err); break }
    }

    setUploading(false)
    setUploadProgress(0)
    setUploadCurrent(0)
    setUploadTotal(0)
    if (fileRef.current) fileRef.current.value = ''
    loadAds()
  }

  async function handleBranchChange(id: string, branch: string) {
    await fetch(`/api/queue-ads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    })
    loadAds()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/queue-ads/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    loadAds()
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    await fetch(`/api/queue-ads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    })
    loadAds()
  }

  const videoCount = ads.filter(a => a.mimeType.startsWith('video/')).length

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start min-w-0">
      <div className="space-y-5 min-w-0">
        {/* Upload */}
        <DashCard title="Upload ads" icon={<Upload size={15} />}
          description="Videos and images play in order on the TV queue display, next to the patient list.">
          <div className="space-y-4">
            {/* Branch selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Show on</span>
              <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: '#EEF3F1' }}>
                {allowedBranches.map(opt => {
                  const on = uploadBranch === opt.value
                  return (
                    <button key={opt.value} type="button" aria-pressed={on}
                      onClick={() => setUploadBranch(opt.value)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${on ? '' : 'hover:bg-black/[0.04]'}`}
                      style={on
                        ? { background: '#fff', color: opt.color, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                        : { background: 'transparent', color: 'var(--mid-gray)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: opt.color }} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Drop zone (clicking anywhere opens the file picker) */}
            <label className={`flex flex-col items-center gap-2 text-center rounded-xl px-5 py-7 transition-colors ${uploading ? 'cursor-wait' : 'cursor-pointer hover:bg-[#EAF4F2]'}`}
              style={{ border: '1.5px dashed rgba(25,72,80,0.28)', background: SUBTLE_BG }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)', color: '#fff' }}>
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                {uploading
                  ? uploadTotal > 1
                    ? `Uploading ${uploadCurrent}/${uploadTotal} (${uploadProgress}%)…`
                    : `Uploading ${uploadProgress}%…`
                  : 'Choose files to upload'}
              </span>
              {uploading ? (
                <span className="w-full max-w-xs h-1.5 rounded-full overflow-hidden" style={{ background: '#DCE7E4' }}>
                  <span className="block h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${uploadProgress}%`, background: 'var(--teal)' }} />
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  Video (.mp4, .webm, .mov) or Image (.jpg, .png, .gif, .webp) — max 200 MB
                </span>
              )}
              <input ref={fileRef} type="file" multiple className="hidden"
                accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.mov,image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                onChange={handleUpload} disabled={uploading} />
            </label>

            <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--pale-teal)' }}>
              <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--teal)' }}>
                Best size: <strong>square 1:1, 1080 × 1080 px</strong>. The TV shows every ad as a square (about 960 × 960 on a 1080p TV); other shapes are cropped from the centre, so keep text and logos away from the edges. Avoid portrait 9:16 and wide 16:9 — most of them gets cut off.
              </p>
            </div>

            {uploadErr && (
              <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium"
                style={{ background: '#FDE4E4', color: '#991B1B', border: '1px solid #F5C2C2' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-px" /> {uploadErr}
              </div>
            )}
          </div>
        </DashCard>

        {/* Ads list */}
        <DashCard title="Ad playlist" icon={<ListOrdered size={15} />} flush
          description="Plays top to bottom. Use the arrows to change the order."
          action={adsLoaded && ads.length > 0 ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums"
              style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
              {ads.length} ad{ads.length === 1 ? '' : 's'} · {videoCount} video{videoCount === 1 ? '' : 's'}
            </span>
          ) : undefined}>
          {adsError && (
            <div role="alert" className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-xs font-medium"
              style={{ background: '#FDE4E4', color: '#991B1B', borderBottom: '1px solid #F5C2C2' }}>
              <AlertTriangle size={13} /> {adsError}
              <button type="button" onClick={loadAds} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
                <RefreshCw size={11} /> Try again
              </button>
            </div>
          )}
          {!adsLoaded ? (
            <div aria-hidden>
              {Array.from({ length: 3 }).map((_, n) => (
                <div key={n} className="flex items-center gap-4 px-5 py-3.5" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                  <Skeleton className="h-4 w-5" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 flex-1" style={{ maxWidth: 260 }} />
                  <Skeleton className="h-7 w-32 rounded-full" />
                  <Skeleton className="h-7 w-24" />
                </div>
              ))}
            </div>
          ) : ads.length === 0 ? (
            !adsError && (
              <div className="flex flex-col items-center">
                <Megaphone size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                <EmptyState title="No ads uploaded yet." hint="Upload a video or image above and it will start playing on the TV display." />
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: SUBTLE_BG }}>
                    {['#', 'File', 'Show On', ''].map((h, i) => (
                      <th key={`${h}-${i}`} className={`px-4 py-2 text-left whitespace-nowrap ${SECTION_LABEL}`}
                        style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad, idx) => {
                    const isVideo = ad.mimeType.startsWith('video/')
                    const deleting = deletingId === ad.id
                    return (
                      <tr key={ad.id} className="transition-colors hover:bg-[#F8FAF9]"
                        style={{ borderTop: idx ? '1px solid var(--light-gray)' : undefined, opacity: deleting ? 0.5 : 1 }}>
                        <td className="pl-4 pr-2 py-2.5 w-10">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold tabular-nums"
                            style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-0 w-full">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={isVideo ? { background: '#EFE8FB', color: '#5B21B6' } : { background: '#E3EEFB', color: '#14507F' }}
                              title={isVideo ? 'Video' : 'Image'}>
                              {isVideo ? <Film size={14} /> : <ImageIcon size={14} />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }} title={ad.fileName}>{ad.fileName}</p>
                              <a href={`/api/queue-ads/stream/${ad.id}`} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                                style={{ color: 'var(--teal)' }}>
                                <ExternalLink size={10} /> {isVideo ? 'Play' : 'View'}
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <select
                            value={ad.branch ?? 'ALL'}
                            onChange={e => handleBranchChange(ad.id, e.target.value)}
                            disabled={allowedBranches.length === 1}
                            aria-label="Show on"
                            className="h-8 pl-2.5 pr-1 rounded-lg text-xs font-semibold outline-none focus:border-[var(--teal)] disabled:opacity-70"
                            style={{
                              ...CONTROL_STYLE,
                              cursor: allowedBranches.length === 1 ? 'default' : 'pointer',
                            }}>
                            {allowedBranches.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="pl-2 pr-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-0.5 justify-end">
                            <button type="button" onClick={() => handleReorder(ad.id, 'up')} disabled={idx === 0}
                              className={BTN_ICON} title="Move up" aria-label="Move up" style={{ color: 'var(--mid-gray)' }}>
                              <ChevronUp size={15} />
                            </button>
                            <button type="button" onClick={() => handleReorder(ad.id, 'down')} disabled={idx === ads.length - 1}
                              className={BTN_ICON} title="Move down" aria-label="Move down" style={{ color: 'var(--mid-gray)' }}>
                              <ChevronDown size={15} />
                            </button>
                            <button type="button" onClick={() => handleDelete(ad.id)} disabled={deleting}
                              className={BTN_ICON.replace('hover:bg-gray-100', 'hover:bg-red-50')} title="Delete" aria-label="Delete" style={{ color: '#DC2626' }}>
                              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashCard>
      </div>

      {/* Announcements — typed here, shown on the TV between the ads */}
      <DashCard title="Announcements" icon={<Megaphone size={15} />}
        description="Up to three lines, shown on the TV as its own slide in the same rotation as the videos and photos. Saves automatically."
        action={(() => {
          const filled = annTexts.filter(t => t.trim()).length
          return (
            <span className="inline-flex items-center gap-2">
              {annSaving && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>
                  <Loader2 size={11} className="animate-spin" /> Saving…
                </span>
              )}
              {!annSaving && annSavedAt && (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>Saved {annSavedAt}</span>
              )}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums"
                style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
                {filled} of 3
              </span>
            </span>
          )
        })()}>
        <div className="space-y-4">
          {/* Which screen these go on — same scopes as the ads. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Show on</span>
            <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: '#EEF3F1' }}>
              {allowedBranches.map(opt => {
                const on = annBranch === opt.value
                return (
                  <button key={opt.value} type="button" aria-pressed={on}
                    onClick={() => handleAnnBranch(opt.value)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${on ? '' : 'hover:bg-black/[0.04]'}`}
                    style={on
                      ? { background: '#fff', color: opt.color, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                      : { background: 'transparent', color: 'var(--mid-gray)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: opt.color }} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {annErr && (
            <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium"
              style={{ background: '#FDE4E4', color: '#991B1B', border: '1px solid #F5C2C2' }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-px" /> {annErr}
            </div>
          )}

          {!annLoaded ? (
            <div className="space-y-3" aria-hidden>
              {[0, 1, 2].map(n => <Skeleton key={n} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[0, 1, 2].map(i => {
                const val = annTexts[i] ?? ''
                const left = ANN_MAX - val.length
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label htmlFor={`ann-${i}`} className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
                        Announcement {i + 1}
                        {i > 0 && !val.trim() && (
                          <span className="font-normal ml-1.5" style={{ color: 'var(--mid-gray)' }}>optional</span>
                        )}
                      </label>
                      <span className="text-[11px] tabular-nums"
                        style={{ color: left <= 20 ? '#B45309' : 'var(--mid-gray)' }}>
                        {val.length}/{ANN_MAX}
                      </span>
                    </div>
                    <textarea
                      id={`ann-${i}`}
                      value={val}
                      rows={2}
                      maxLength={ANN_MAX}
                      onChange={e => handleAnnChange(i, e.target.value)}
                      placeholder={i === 0
                        ? 'e.g. The clinic is closed on 30 November for the holiday.'
                        : 'Leave blank to show nothing here.'}
                      className="w-full text-sm rounded-xl px-3 py-2 resize-y"
                      style={{ border: '1px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)' }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--pale-teal)' }}>
            <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--teal)' }}>
              Clearing a box takes it off the screen. A TV shows its own branch&rsquo;s lines first and fills any
              remaining slots from <strong>All branches</strong>, never more than three. The TV picks up changes
              within two minutes &mdash; no need to restart it.
            </p>
          </div>
        </div>
      </DashCard>

      {/* Display settings */}
      <DashCard title="TV display settings" icon={<Tv2 size={15} />}
        description="Applies to the TV queue display. Changes save automatically.">
        <div className="space-y-5">
          {/* Leaderboard toggle */}
          <SettingRow icon={<Trophy size={15} />} tone={{ bg: 'var(--pale-teal)', fg: 'var(--teal)' }}
            title="Show Leaderboard"
            hint="Display clinician satisfaction leaderboard on the TV queue display, alternating with ads.">
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
              <input
                type="checkbox"
                checked={showLeaderboard}
                onChange={e => handleToggleLeaderboard(e.target.checked)}
                disabled={togglingLb}
                className="sr-only peer"
                aria-label="Show Leaderboard"
              />
              <SwitchVisual on={showLeaderboard} busy={togglingLb} />
            </label>
          </SettingRow>

          <div style={{ borderTop: '1px solid var(--light-gray)' }} />

          {/* Patient Complaint Form toggle */}
          <SettingRow icon={<MessageSquareWarning size={15} />} tone={{ bg: 'rgba(198,128,119,0.14)', fg: '#A65B52' }}
            title="Show Patient Complaint Form"
            hint="Display a QR code on the TV for patients to submit concerns or incidents.">
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
              <input
                type="checkbox"
                checked={showComplaintForm}
                onChange={e => handleToggleComplaintForm(e.target.checked)}
                disabled={togglingCf}
                className="sr-only peer"
                aria-label="Show Patient Complaint Form"
              />
              <SwitchVisual on={showComplaintForm} busy={togglingCf} />
            </label>
          </SettingRow>

          <div style={{ borderTop: '1px solid var(--light-gray)' }} />

          {/* Image slide duration */}
          <div>
            <SettingRow icon={<Timer size={15} />} tone={{ bg: 'var(--pale-teal)', fg: 'var(--teal)' }}
              title="Image Slide Duration"
              hint="How many seconds each static image ad stays on screen before advancing to the next." />
            <div className="flex items-center gap-3 mt-3 pl-11">
              <input
                type="range"
                min={5} max={60} step={1}
                value={adSlideDuration}
                onChange={e => handleSlideDurationChange(Number(e.target.value))}
                aria-label="Image slide duration"
                className="min-w-0"
                style={{ flex: 1, accentColor: 'var(--teal)' }}
              />
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="number"
                  min={5} max={120}
                  value={adSlideDuration}
                  onChange={e => handleSlideDurationChange(Number(e.target.value))}
                  aria-label="Image slide duration in seconds"
                  className="h-8 w-16 px-2 rounded-lg text-sm font-bold text-center outline-none focus:border-[var(--teal)] tabular-nums"
                  style={CONTROL_STYLE}
                />
                <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>sec</span>
              </div>
            </div>
            <div className="flex justify-between mt-1 pl-11 pr-[5.5rem] text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              <span>5s</span>
              <span>60s</span>
            </div>
            <p className="pl-11 mt-1 h-4 text-[11px] font-semibold flex items-center gap-1" style={{ color: 'var(--teal)' }} aria-live="polite">
              {savingDuration && <><Loader2 size={11} className="animate-spin" /> Saving…</>}
            </p>
          </div>
        </div>
      </DashCard>
    </div>
  )
}

// ─── Main QueueingClient ──────────────────────────────────────────────────────
const BRANCH_TV_LABELS: Record<string, string> = {
  SBEA: 'Aura Health - East Branch',
  SBGH: 'Aura Health - Greenhills Branch',
}
const BRANCH_TV_COLORS: Record<string, { bg: string; color: string }> = {
  SBEA: { bg: '#CCFBF1', color: '#0F766E' },
  SBGH: { bg: '#DBEAFE', color: '#1D4ED8' },
}
// Public TV-display URL slug per branch — Aura Health Rehab branded
// (the SBEA/SBGH enum keys stay internal; legacy /sbea·/sbgh still resolve).
const BRANCH_TV_SLUGS: Record<string, string> = {
  SBEA: 'ahea',
  SBGH: 'ahgh',
}
const tvSlug = (b: string) => BRANCH_TV_SLUGS[b] ?? b.toLowerCase()

export default function QueueingClient({ role }: { role: string }) {
  const branches = visibleBranches(role)
  const [activeTab, setActiveTab]   = useState<'queue' | 'ads'>('queue')
  const [activeBranch, setActiveBranch] = useState(branches[0])
  const [selectedDate, setSelectedDate] = useState(() => localTodayStr())
  const [queue, setQueue]           = useState<QueueEntry[]>([])
  const [staff, setStaff]           = useState<StaffMember[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  // Display-only: which branch|date the list on screen belongs to (so a
  // refresh keeps the rows up instead of blanking them), and any load error.
  const [loadedKey, setLoadedKey]   = useState('')
  const [queueError, setQueueError] = useState('')
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [showTvMenu, setShowTvMenu] = useState(false)
  const tvMenuRef = useRef<HTMLDivElement>(null)

  // Close TV dropdown on outside click
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (tvMenuRef.current && !tvMenuRef.current.contains(e.target as Node)) {
        setShowTvMenu(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])
  const [toast, setToast]           = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Display-only clock so "In session" / "Up next" tags stay current. No fetch.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Load staff
  useEffect(() => {
    fetch('/api/staff').then(r => r.json()).then(setStaff)
  }, [])

  // Load queue for branch + date
  const loadQueue = useCallback(async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch(`/api/queue?branch=${activeBranch}&date=${selectedDate}`)
      if (res.ok) {
        const data = await res.json()
        // Enrich with full patient name from schedules API
        const sched = await fetch(`/api/clinic-schedule?date=${selectedDate}`)
        const allSched: Array<{
          id: string
          patient: { firstName: string; lastName: string } | null
          staff: { branch: string }
        }> = sched.ok ? await sched.json() : []

        const nameMap: Record<string, string> = {}
        for (const s of allSched) {
          if (s.patient) nameMap[s.id] = `${s.patient.lastName}, ${s.patient.firstName}`
        }

        setQueue((data.items ?? []).map((item: QueueEntry) => ({
          ...item,
          patientName: nameMap[item.id] ?? null,
        })))
        setQueueError('')
      } else {
        setQueueError(`The queue could not be loaded (HTTP ${res.status}).`)
      }
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : 'The queue could not be loaded.')
    } finally {
      setLoadingQueue(false)
      setLoadedKey(`${activeBranch}|${selectedDate}`)
    }
  }, [activeBranch, selectedDate])

  useEffect(() => { loadQueue() }, [loadQueue])

  const queueUrl = `https://queue.sapphireclinicseast.org/${tvSlug(activeBranch)}`
  const today = localTodayStr()
  const isToday = selectedDate === today
  // Until the first load for this branch + date lands, show skeletons rather
  // than the previous branch's rows. After that, refreshes keep rows on screen.
  const stale = loadedKey !== `${activeBranch}|${selectedDate}`

  // Headline numbers + now/next tags — derived from the rows already loaded.
  const stats = useMemo(() => {
    const by: Record<string, number> = {}
    const depts = new Set<string>()
    for (const e of queue) {
      by[e.status] = (by[e.status] ?? 0) + 1
      depts.add(e.department)
    }
    const active = queue.filter(e => !INACTIVE_STATUSES.has(e.status))
    const hhmm = nowHHMM(now)
    const inSession = new Set(
      isToday ? active.filter(e => e.startTime <= hhmm && hhmm < e.endTime).map(e => e.id) : [],
    )
    const upcoming = isToday ? active.filter(e => e.startTime > hhmm) : []
    const nextStart = upcoming.reduce<string | null>((m, e) => (m === null || e.startTime < m ? e.startTime : m), null)
    const upNext = new Set(upcoming.filter(e => e.startTime === nextStart).map(e => e.id))
    const firstStart = active.reduce<string | null>((m, e) => (m === null || e.startTime < m ? e.startTime : m), null)
    const lastEnd = active.reduce<string | null>((m, e) => (m === null || e.endTime > m ? e.endTime : m), null)
    return {
      total: queue.length, by, depts: depts.size, activeCount: active.length,
      inSession, upNext, nextStart, firstStart, lastEnd,
    }
  }, [queue, now, isToday])

  const cancelledOrNoShow = (stats.by.CANCELLED ?? 0) + (stats.by.NO_SHOW ?? 0)

  const tvButton = branches.length === 1 ? (
    <a href={`https://queue.sapphireclinicseast.org/${tvSlug(branches[0])}`}
      target="_blank" rel="noreferrer"
      className={BTN_PRIMARY}
      style={{ background: 'var(--teal)', textDecoration: 'none' }}>
      <Tv2 size={15} /> Open TV Display
    </a>
  ) : (
    <div ref={tvMenuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setShowTvMenu(v => !v)}
        aria-expanded={showTvMenu}
        className={BTN_PRIMARY}
        style={{ background: 'var(--teal)', border: 'none', cursor: 'pointer' }}>
        <Tv2 size={15} />
        Open TV Display
        <ChevronDown size={13} style={{
          transition: 'transform 0.2s',
          transform: showTvMenu ? 'rotate(180deg)' : 'rotate(0deg)',
        }} />
      </button>

      {showTvMenu && (
        <div className="absolute right-0 z-50 rounded-xl overflow-hidden shadow-xl"
          style={{ top: 'calc(100% + 0.4rem)', minWidth: '16rem', background: '#fff', border: '1px solid var(--light-gray)' }}>
          {branches.map((b, i) => {
            const col = BRANCH_TV_COLORS[b] ?? { bg: '#F3F4F6', color: '#374151' }
            return (
              <a key={b}
                href={`https://queue.sapphireclinicseast.org/${tvSlug(b)}`}
                target="_blank" rel="noreferrer"
                onClick={() => setShowTvMenu(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#F6F9F8] transition-colors"
                style={{
                  textDecoration: 'none',
                  borderBottom: i < branches.length - 1 ? '1px solid var(--light-gray)' : 'none',
                }}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: col.bg }}>
                  <Tv2 size={14} style={{ color: col.color }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold leading-tight" style={{ color: 'var(--charcoal)' }}>
                    {BRANCH_TV_LABELS[b] ?? b}
                  </span>
                  <span className="block text-[11px] mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>
                    queue.sapphireclinicseast.org/{tvSlug(b)}
                  </span>
                </span>
                <ExternalLink size={12} style={{ color: 'var(--mid-gray)', flexShrink: 0 }} />
              </a>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-[1200px] mx-auto min-w-0 space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Clinic Tools
          </p>
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <ListOrdered size={24} style={{ color: 'var(--teal)' }} />
            Queueing
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage today&apos;s patient queue and upload clinic ads for the TV display.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'queue' && (branches.length > 1 ? (
            <Segmented label="Branch" value={activeBranch} onChange={setActiveBranch}
              items={branches.map(b => ({ key: b, label: BRANCH_LABEL[b] ?? b }))} />
          ) : (
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
              title="Your account is scoped to this branch"
              style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
              <Building2 size={13} style={{ color: 'var(--teal)' }} />
              {BRANCH_LABEL[activeBranch] ?? activeBranch}
            </span>
          ))}
          {tvButton}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Segmented label="Queueing sections" size="md" value={activeTab} onChange={setActiveTab}
        items={[
          { key: 'queue', label: 'Patient Queue', icon: <ListOrdered size={15} /> },
          { key: 'ads',   label: 'Ads Manager',   icon: <Megaphone size={15} /> },
        ]} />

      {/* Toast */}
      {toast && (
        <div role="status" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ background: '#DFF5E4', color: '#166534', border: '1px solid #B6E5C2' }}>
          <CheckCircle2 size={15} className="flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* ── Queue tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-2" style={CARD_STYLE}>
            <div className="flex items-center gap-2">
              <CalendarDays size={15} style={{ color: 'var(--teal)' }} />
              <label htmlFor="queue-date" className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Date</label>
              <input id="queue-date" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className={CONTROL} style={CONTROL_STYLE} />
            </div>
            {!isToday && (
              <button type="button" onClick={() => setSelectedDate(localTodayStr())}
                className={`${BTN_SECONDARY} text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                Back to today
              </button>
            )}
            <span className="text-xs font-medium hidden sm:inline" style={{ color: 'var(--mid-gray)' }}>
              {formatDay(selectedDate)}{isToday ? ' · Today' : ''}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={loadQueue} disabled={loadingQueue}
                className={BTN_SECONDARY} style={CONTROL_STYLE} title="Refresh">
                <RefreshCw size={14} className={loadingQueue ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} />
                Refresh
              </button>
              <button type="button" onClick={() => setShowWalkIn(true)}
                className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
                <UserPlus size={14} /> Add Walk-in Patient
              </button>
            </div>
          </div>

          {/* KPIs */}
          {!queueError && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {stale ? (
                Array.from({ length: 4 }).map((_, n) => (
                  <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE} aria-hidden>
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-14 mt-2" />
                    <Skeleton className="h-3 w-24 mt-2" />
                  </div>
                ))
              ) : (
                <>
                  <KpiCard label="Appointments" icon={<Users size={16} />} value={stats.total}
                    sub={stats.total ? `${stats.depts} department${stats.depts === 1 ? '' : 's'}` : 'None booked'} />
                  <KpiCard label="Confirmed" icon={<CalendarCheck size={16} />} accent={STATUS_STYLE.CONFIRMED.fg}
                    value={stats.by.CONFIRMED ?? 0}
                    sub={(stats.by.PENDING ?? 0) > 0 ? `${stats.by.PENDING} still pending` : isToday ? 'Shown on the TV display' : 'None pending'} />
                  {isToday ? (
                    <KpiCard label="Up next" icon={<Clock size={16} />} accent="#14507F"
                      value={stats.nextStart ? formatTime(stats.nextStart) : '—'}
                      sub={stats.inSession.size > 0
                        ? `${stats.inSession.size} in session now`
                        : stats.nextStart ? `${stats.upNext.size} starting then` : stats.activeCount ? 'No more starts today' : 'Nothing scheduled'} />
                  ) : (
                    <KpiCard label="First appointment" icon={<Clock size={16} />} accent="#14507F"
                      value={stats.firstStart ? formatTime(stats.firstStart) : '—'}
                      sub={stats.lastEnd ? `Last ends ${formatTime(stats.lastEnd)}` : 'Nothing scheduled'} />
                  )}
                  <KpiCard label="Cancelled / no-show" icon={<XCircle size={16} />} accent={STATUS_STYLE.CANCELLED.fg}
                    value={cancelledOrNoShow}
                    sub={(stats.by.RESCHEDULED ?? 0) > 0 ? `${stats.by.RESCHEDULED} rescheduled` : 'None rescheduled'} />
                </>
              )}
            </div>
          )}

          {/* Queue list */}
          {queueError ? (
            <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
              <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t load the queue</p>
              <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: '#991B1B' }}>{queueError}</p>
              <button type="button" onClick={loadQueue} disabled={loadingQueue}
                className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                <RefreshCw size={12} className={loadingQueue ? 'animate-spin' : ''} /> Try again
              </button>
            </div>
          ) : (
            <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
              <header className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                <h2 className="text-[14px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  {stale ? 'Appointments' : `${queue.length} appointment${queue.length !== 1 ? 's' : ''}`}
                  <span className="font-normal text-xs" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>
                    · {BRANCH_LABEL[activeBranch] ?? activeBranch} · {formatDay(selectedDate)}
                  </span>
                  {loadingQueue && !stale && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
                </h2>
                {isToday && !stale && queue.length > 0 && (
                  <span className="inline-flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#16A34A' }} /> In session</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#2563EB' }} /> Up next</span>
                  </span>
                )}
              </header>

              {stale ? (
                <div aria-hidden>
                  {Array.from({ length: 6 }).map((_, n) => (
                    <div key={n} className="flex items-center gap-5 px-5 py-3.5" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                      <div className="w-24"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-12 mt-1.5" /></div>
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24 mt-1.5" /></div>
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : queue.length === 0 ? (
                <div className="flex flex-col items-center">
                  <CalendarDays size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                  <EmptyState title="No appointments for this day"
                    hint="Add a walk-in patient or check the Clinic Schedule module." />
                  <button type="button" onClick={() => setShowWalkIn(true)}
                    className={`${BTN_SECONDARY} -mt-6 mb-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                    <UserPlus size={12} /> Add Walk-in Patient
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto" style={{ opacity: loadingQueue ? 0.7 : 1, transition: 'opacity 0.15s' }}>
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 820 }}>
                    <thead>
                      <tr style={{ background: SUBTLE_BG }}>
                        {['#', 'Time', 'Patient', 'Department', 'Therapist', 'Session Type', 'Status'].map(h => (
                          <th key={h} className={`px-4 py-2 text-left whitespace-nowrap ${SECTION_LABEL}`}
                            style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((entry, i) => {
                        const deptColor = DEPT_COLORS[entry.department] ?? DEPT_FALLBACK
                        const inactive = INACTIVE_STATUSES.has(entry.status)
                        const live = stats.inSession.has(entry.id)
                        const next = stats.upNext.has(entry.id)
                        const accent = live ? '#16A34A' : next ? '#2563EB' : 'transparent'
                        return (
                          <tr key={entry.id} className="transition-colors hover:bg-[#F8FAF9]"
                            style={{
                              borderTop: i ? '1px solid var(--light-gray)' : undefined,
                              background: live ? '#F3FBF5' : next ? '#F5F8FE' : undefined,
                              boxShadow: `inset 3px 0 0 ${accent}`,
                            }}>
                            <td className="px-4 py-3 text-xs font-bold tabular-nums w-10" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-[13px] font-bold tabular-nums" style={{ color: inactive ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                                {formatTime(entry.startTime)}
                              </p>
                              <p className="text-[11px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                                to {formatTime(entry.endTime)}
                              </p>
                            </td>
                            <td className="px-4 py-3 min-w-[200px]">
                              <div className="flex items-center gap-2.5">
                                <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                                  style={{ background: deptColor.bg, color: deptColor.color }} title="Initials shown on the TV display">
                                  {entry.initials}
                                </span>
                                <div className="min-w-0">
                                  <p className={`text-[13.5px] font-semibold leading-snug ${inactive ? 'line-through decoration-1' : ''}`}
                                    style={{ color: entry.patientName ? (inactive ? 'var(--mid-gray)' : 'var(--charcoal)') : 'var(--mid-gray)' }}>
                                    {entry.patientName ?? '—'}
                                  </p>
                                  {(live || next) && (
                                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider mt-0.5"
                                      style={{ color: accent }}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${live ? 'animate-pulse' : ''}`} style={{ background: accent }} />
                                      {live ? 'In session' : 'Up next'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><DeptPill dept={entry.department} /></td>
                            <td className="px-4 py-3 text-[13px]" style={{ color: 'var(--charcoal)' }}>{entry.therapist}</td>
                            <td className="px-4 py-3 text-[13px]" style={{ color: 'var(--charcoal)' }}>{entry.sessionType}</td>
                            <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-5 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                <Tv2 size={12} style={{ color: 'var(--teal)' }} />
                TV display:
                <a href={queueUrl} target="_blank" rel="noreferrer" className="font-semibold hover:underline break-all" style={{ color: 'var(--teal)' }}>{queueUrl}</a>
                <span className="hidden md:inline">· shows today&apos;s confirmed appointments</span>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Ads tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'ads' && <AdsManager role={role} />}

      {/* Walk-in modal */}
      {showWalkIn && (
        <WalkInModal
          staff={staff}
          defaultBranch={activeBranch}
          defaultDate={selectedDate}
          onClose={() => setShowWalkIn(false)}
          onSaved={() => {
            setShowWalkIn(false)
            loadQueue()
            showToast('Walk-in patient added to queue!')
          }}
        />
      )}
    </div>
  )
}
