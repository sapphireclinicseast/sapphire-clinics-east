'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Plus, Pencil, Trash2, Mail, MailCheck, MessageSquare, ChevronDown, ChevronUp, X, Smartphone, Video } from 'lucide-react'
import DeskShortcutCard from '@/components/DeskShortcutCard'

// ─── Branch display labels (enum values must stay SBEA / SBGH in the DB) ────
const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}

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
  if (role.startsWith('SBEA_')) return ['SBEA']
  if (role.startsWith('SBGH_')) return ['SBGH']
  return ['SBEA', 'SBGH']
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StaffMember { id: string; firstName: string; lastName: string; department: string; branch: string; extraBranches: string[]; phone: string | null }
interface Patient { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
interface Schedule {
  id: string; staffId: string; patientId: string | null; patient: Patient | null
  date: string; startTime: string; endTime: string; duration: string
  sessionType: string; status: string; notes: string | null
  isTeletherapy: boolean; meetLink: string | null
}

const EMPTY_FORM = {
  patientId: '', patientLabel: '', date: '',
  startTime: '08:00', duration: '1h', endTime: '09:00',
  sessionType: '', status: 'PENDING', notes: '',
  isTeletherapy: false,
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:     { bg: '#FFF9EC', color: '#92400E' },
  CONFIRMED:   { bg: 'var(--pale-teal)', color: 'var(--teal)' },
  CANCELLED:   { bg: '#FEE2E2', color: '#DC2626' },
  RESCHEDULED: { bg: '#EDE9FE', color: '#5B21B6' },
}

// ─── Patient search typeahead ─────────────────────────────────────────────────
function PatientSearch({ value, label, onChange }: {
  value: string; label: string
  onChange: (id: string, label: string) => void
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

  const inputStyle = {
    border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff',
    color: 'var(--charcoal)', borderRadius: '0.5rem',
    padding: '0.45rem 0.7rem', fontSize: '0.85rem', width: '100%',
  }

  return (
    <div className="relative">
      <input
        style={inputStyle}
        placeholder="Search patient name…"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          {results.map(p => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              style={{ color: 'var(--charcoal)', borderBottom: '1px solid var(--light-gray)' }}
              onMouseDown={() => {
                onChange(p.id, `${p.lastName}, ${p.firstName}`)
                setQuery(`${p.lastName}, ${p.firstName}`)
                setOpen(false)
              }}>
              <span className="font-medium">{p.lastName}, {p.firstName}</span>
              {p.email && <span className="ml-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{p.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Schedule form ─────────────────────────────────────────────────────────────
function ScheduleForm({ dept, values, onChange, onSubmit, onCancel, error, submitting, submitLabel }: {
  dept: string
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

  const inputStyle = {
    border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff',
    color: 'var(--charcoal)', borderRadius: '0.5rem',
    padding: '0.45rem 0.7rem', fontSize: '0.85rem', width: '100%',
  }
  const labelStyle = {
    display: 'block', fontSize: '0.72rem', fontWeight: 600,
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
      {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#FEE2E2', color: '#DC2626' }}>{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label style={labelStyle}>Patient</label>
          <PatientSearch
            value={values.patientId}
            label={values.patientLabel}
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
          <select style={inputStyle} value={values.sessionType} onChange={e => onChange({ ...values, sessionType: e.target.value })}>
            <option value="">Select type</option>
            {(SESSION_TYPES[dept] ?? []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={values.status} onChange={e => onChange({ ...values, status: e.target.value })}>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="RESCHEDULED">Rescheduled</option>
          </select>
        </div>
        <div className="col-span-2">
          <label style={labelStyle}>Mode</label>
          <button type="button" onClick={() => onChange({ ...values, isTeletherapy: !values.isTeletherapy })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold w-full justify-center"
            style={{
              background: values.isTeletherapy ? '#EFF6FF' : '#F8FAFC',
              color: values.isTeletherapy ? '#1D4ED8' : '#9ca3af',
              border: `1.5px solid ${values.isTeletherapy ? '#93C5FD' : '#E2E8F0'}`,
              cursor: 'pointer',
            }}>
            <Video size={15} />
            {values.isTeletherapy ? 'Teletherapy (Jitsi Meet link will be generated)' : 'In-Person (click to switch to Teletherapy)'}
          </button>
        </div>
        <div className="col-span-2">
          <label style={labelStyle}>Notes (optional)</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
            value={values.notes} onChange={e => onChange({ ...values, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
        <button type="submit" disabled={submitting} className="px-4 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--teal)', color: '#fff', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Staff card with schedules ─────────────────────────────────────────────────
function StaffCard({ staff, selectedDate }: { staff: StaffMember; selectedDate: string }) {
  const [open, setOpen] = useState(false)
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
  const [deckingSuggestions, setDeckingSuggestions] = useState<{ id: string; patient: Patient | null; startTime: string; endTime: string; dayOfWeek: string }[]>([])

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true)
    const res = await fetch(`/api/clinic-schedule?staffId=${staff.id}&date=${selectedDate}`)
    if (res.ok) setSchedules(await res.json())
    setLoadingSchedules(false)
  }, [staff.id, selectedDate])

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
      const res = await fetch(`/api/clinic-schedule?staffId=${staff.id}&date=${lastWeekDate}`)
      if (res.ok) setLastWeekSuggestions(await res.json())
    } catch { /* silent */ }
    // Fetch decking suggestions for this day of week
    const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const dow = DOW_NAMES[new Date(selectedDate + 'T12:00:00').getDay()]
    try {
      const res = await fetch(`/api/decking/slots?staffId=${staff.id}&dayOfWeek=${dow}`)
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
      body: JSON.stringify({ staffId: staff.id, ...form, isTeletherapy: form.isTeletherapy }),
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
      body: JSON.stringify({ id: editId, ...editForm }),
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
      body: JSON.stringify({ scheduleId }),
    })
    setSendingId(null)
    if (res.ok) showToast('Reminder sent!')
    else { const d = await res.json(); showToast(d.error ?? 'Failed to send email') }
  }

  async function sendAllReminders() {
    setSendingAll(true)
    const res = await fetch('/api/clinic-schedule/send-reminder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate }),
    })
    setSendingAll(false)
    if (res.ok) { const d = await res.json(); showToast(`Sent ${d.sent} email reminder(s)`) }
    else { const d = await res.json(); showToast(d.error ?? 'Failed to send emails') }
  }

  async function sendSmsReminder(scheduleId: string) {
    setSendingSmsId(scheduleId)
    const res = await fetch('/api/clinic-schedule/send-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId }),
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
      body: JSON.stringify({ staffId: staff.id, date: selectedDate }),
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
      body: JSON.stringify({ staffId: staff.id, date: selectedDate }),
    })
    setSendingClinicianSms(false)
    if (res.ok) {
      const d = await res.json()
      showToast(`Schedule sent to ${staff.firstName} (${d.patients} patient${d.patients !== 1 ? 's' : ''})`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send schedule to clinician')
    }
  }

  async function sendAbsentSms() {
    setSendingAbsentSms(true)
    const res = await fetch('/api/clinic-schedule/send-absent-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date: selectedDate }),
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
      body: JSON.stringify({ staffId: staff.id, date: selectedDate }),
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
      body: JSON.stringify({ staffId: staff.id, date: selectedDate }),
    })
    setSendingClinicianEmail(false)
    if (res.ok) {
      const d = await res.json()
      showToast(`Email sent to ${staff.firstName} (${d.patients} patient${d.patients !== 1 ? 's' : ''})`)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Failed to send email to clinician')
    }
  }

  const isMultiBranch = (staff.extraBranches ?? []).length > 0
  const isSBEA = staff.branch === 'SBEA'

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      {/* Staff header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--pale-teal)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>
            {staff.firstName[0]}{staff.lastName[0]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            {staff.lastName}, {staff.firstName}
          </p>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{staff.department}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold mr-2"
          style={isMultiBranch
            ? { background: '#EDE9FE', color: '#5B21B6' }
            : isSBEA
              ? { background: 'var(--pale-teal)', color: 'var(--teal)' }
              : { background: '#FFF3CD', color: '#92400E' }}>
          {isMultiBranch ? 'Both Branches' : (BRANCH_LABEL[staff.branch] ?? staff.branch)}
        </span>
        {open ? <ChevronUp size={16} style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={16} style={{ color: 'var(--mid-gray)' }} />}
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: 'var(--light-gray)' }}>
          {/* Toast */}
          {toast && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
              style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
              <MailCheck size={14} />{toast}
            </div>
          )}

          {/* Add Schedule toggle */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              Schedules for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <button onClick={() => showAdd ? closeAddForm() : openAddForm()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: showAdd ? 'var(--light-gray)' : 'var(--teal)', color: showAdd ? 'var(--charcoal)' : '#fff' }}>
              {showAdd ? <><X size={12} /> Cancel</> : <><Plus size={12} /> Add Schedule</>}
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--pale-teal)', border: '1px solid rgba(26,123,138,0.2)' }}>
              {/* ── Last-week suggestions ── */}
              {lastWeekSuggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--teal)' }}>
                    📋 Re-use from last week ({new Date(new Date(selectedDate + 'T12:00:00').setDate(new Date(selectedDate + 'T12:00:00').getDate() - 7)).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lastWeekSuggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => applyLastWeekSuggestion(s)}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80"
                        style={{ background: 'var(--teal)', color: '#fff' }}
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
                  <p className="text-xs font-semibold mb-1.5" style={{ color: '#ED6823' }}>
                    📋 From Decking Schedule ({['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(selectedDate + 'T12:00:00').getDay()]})
                  </p>
                  <div className="flex flex-wrap gap-2">
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
                        })}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80"
                        style={{ background: '#ED6823', color: '#fff' }}
                      >
                        {s.patient ? `${s.patient.lastName}, ${s.patient.firstName[0]}.` : '(slot)'}
                        {' · '}{formatTime(s.startTime)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ScheduleForm dept={staff.department} values={form} onChange={setForm}
                onSubmit={handleAdd} onCancel={closeAddForm}
                error={formError} submitting={saving} submitLabel="Save Schedule" />
            </div>
          )}

          {/* Schedules table */}
          {loadingSchedules ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--mid-gray)' }}>Loading…</p>
          ) : schedules.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--mid-gray)' }}>No schedules for this day.</p>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                    {['Patient', 'Time', 'Session Type', 'Status', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--mid-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => (
                    <>
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors"
                        style={{ borderBottom: editId === s.id ? 'none' : '1px solid var(--light-gray)' }}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                          {s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)', whiteSpace: 'nowrap' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                          <span className="flex items-center gap-1.5">
                            {s.sessionType}
                            {s.isTeletherapy && (
                              s.meetLink
                                ? <a href={s.meetLink} target="_blank" rel="noopener noreferrer" title="Join Meeting" className="hover:opacity-70"><Video size={13} style={{ color: '#1D4ED8' }} /></a>
                                : <Video size={13} style={{ color: '#93C5FD' }} title="Teletherapy (no link yet)" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={STATUS_COLORS[s.status] ?? { bg: '#f3f4f6', color: '#374151' }}>
                            {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => editId === s.id ? setEditId(null) : startEdit(s)}
                              className="p-1 rounded hover:bg-gray-100" title="Edit">
                              <Pencil size={13} style={{ color: 'var(--teal)' }} />
                            </button>
                            <button onClick={() => setDeleteTarget(s)}
                              className="p-1 rounded hover:bg-red-50" title="Delete">
                              <Trash2 size={13} style={{ color: '#DC2626' }} />
                            </button>
                            {s.patient?.email && (
                              <button onClick={() => sendReminder(s.id)} disabled={sendingId === s.id}
                                className="p-1 rounded hover:bg-blue-50" title="Send reminder email">
                                <Mail size={13} style={{ color: sendingId === s.id ? 'var(--mid-gray)' : '#2563EB' }} />
                              </button>
                            )}
                            {s.patient?.phone && (
                              <button onClick={() => sendSmsReminder(s.id)} disabled={sendingSmsId === s.id}
                                className="p-1 rounded hover:bg-green-50" title="Send mobile text reminder">
                                <MessageSquare size={13} style={{ color: sendingSmsId === s.id ? 'var(--mid-gray)' : '#16A34A' }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editId === s.id && (
                        <tr key={`${s.id}-edit`} style={{ borderBottom: '1px solid var(--light-gray)' }}>
                          <td colSpan={5} className="px-3 py-3" style={{ background: 'var(--pale-teal)' }}>
                            <ScheduleForm dept={staff.department} values={editForm} onChange={setEditForm}
                              onSubmit={handleEdit} onCancel={() => { setEditId(null); setEditError('') }}
                              error={editError} submitting={editSaving} submitLabel="Save Changes" />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              {/* Send all buttons — grouped by recipient */}
              <div className="px-3 py-3 space-y-2" style={{ borderTop: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                {/* Patients section */}
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Patients</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={sendAllReminders} disabled={sendingAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#2563EB', color: '#fff', opacity: sendingAll ? 0.6 : 1 }}>
                    <MailCheck size={13} />
                    {sendingAll ? 'Sending…' : 'Email All Patients'}
                  </button>
                  <button onClick={sendAllSmsReminders} disabled={sendingSmsAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#2563EB', color: '#fff', opacity: sendingSmsAll ? 0.6 : 1 }}>
                    <MessageSquare size={13} />
                    {sendingSmsAll ? 'Sending…' : 'Text All Patients'}
                  </button>
                  <button onClick={sendAbsentSms} disabled={sendingAbsentSms}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    title={`Notify all of ${staff.firstName}'s patients today via SMS that they are absent`}
                    style={{ background: '#DC2626', color: '#fff', opacity: sendingAbsentSms ? 0.5 : 1 }}>
                    <Smartphone size={13} />
                    {sendingAbsentSms ? 'Sending…' : 'Text: Clinician Absent Notice'}
                  </button>
                  <button onClick={sendAbsentEmail} disabled={sendingAbsentEmail}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    title={`Notify all of ${staff.firstName}'s patients today via email that they are absent`}
                    style={{ background: '#DC2626', color: '#fff', opacity: sendingAbsentEmail ? 0.5 : 1 }}>
                    <Mail size={13} />
                    {sendingAbsentEmail ? 'Sending…' : 'Email: Clinician Absent Notice'}
                  </button>
                </div>
                {/* Clinician section */}
                <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--mid-gray)' }}>Clinician</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={sendClinicianSms} disabled={sendingClinicianSms || !staff.phone}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    title={!staff.phone ? 'No mobile number on file for this clinician' : `Send schedule to ${staff.firstName}`}
                    style={{ background: '#16A34A', color: '#fff', opacity: (sendingClinicianSms || !staff.phone) ? 0.5 : 1 }}>
                    <Smartphone size={13} />
                    {sendingClinicianSms ? 'Sending…' : 'Text Clinician'}
                  </button>
                  <button onClick={sendClinicianEmail} disabled={sendingClinicianEmail}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    title={`Email schedule to ${staff.firstName}`}
                    style={{ background: '#16A34A', color: '#fff', opacity: sendingClinicianEmail ? 0.5 : 1 }}>
                    <Mail size={13} />
                    {sendingClinicianEmail ? 'Sending…' : 'Email Clinician'}
                  </button>
                  <span className="text-[10px] italic" style={{ color: 'var(--mid-gray)' }}>
                    *Patient status change will automatically send SMS to clinician
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
              <div className="rounded-2xl p-6 w-full max-w-sm shadow-xl" style={{ background: '#fff' }}>
                <p className="font-semibold text-sm mb-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                  Delete Schedule
                </p>
                <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
                  {deleteTarget.patient
                    ? `Remove ${deleteTarget.patient.lastName}, ${deleteTarget.patient.firstName}'s appointment at ${formatTime(deleteTarget.startTime)}?`
                    : `Remove appointment at ${formatTime(deleteTarget.startTime)}?`}
                  {' '}This cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                  <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: '#DC2626', color: '#fff', opacity: deleting ? 0.7 : 1 }}>
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
function tomorrowStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
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

  useEffect(() => {
    fetch('/api/staff').then(r => r.json()).then(setStaff).finally(() => setLoading(false))
  }, [])

  // Decking weekly schedules — drives the "Tomorrow" view.
  useEffect(() => {
    fetch('/api/decking/therapists')
      .then(r => r.json())
      .then((rows: TherapistConfig[]) => setConfigs(Array.isArray(rows) ? rows : []))
      .catch(() => setConfigs([]))
  }, [])

  // Reset dept filter + make-up picks when branch changes
  useEffect(() => { setActiveDept('Tomorrow'); setMakeupIds([]); setMakeupQuery('') }, [activeBranch])

  const branchStaff = staff.filter(s => s.branch === activeBranch || (s.extraBranches ?? []).includes(activeBranch))
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
    .filter((x): x is { cfg: TherapistConfig; staff: StaffMember } => !!x.staff && (x.staff.branch === activeBranch || (x.staff.extraBranches ?? []).includes(activeBranch)))
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
    .filter((s): s is StaffMember => !!s && (s.branch === activeBranch || (s.extraBranches ?? []).includes(activeBranch)) && !autoIds.has(s.id))
  // Type-ahead matches for the make-up search (exclude already-listed staff).
  const makeupMatches = makeupQuery.trim().length > 0
    ? branchStaff
        .filter(s => !autoIds.has(s.id) && !makeupIds.includes(s.id) &&
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(makeupQuery.trim().toLowerCase()))
        .slice(0, 8)
    : []

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Branch toggle (only for ADMIN / MARKETING_ADMIN) */}
        {branches.length > 1 && (
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
            {branches.map(b => (
              <button key={b} onClick={() => setActiveBranch(b)}
                className="px-4 py-1.5 text-sm font-medium transition-colors"
                style={activeBranch === b
                  ? { background: 'var(--teal)', color: '#fff' }
                  : { background: '#fff', color: 'var(--mid-gray)' }}>
                {BRANCH_LABEL[b] ?? b}
              </button>
            ))}
          </div>
        )}
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => onDateChange(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
          />
        </div>
      </div>

      {/* Department filter chips */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveDept('Tomorrow')}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={activeDept === 'Tomorrow'
              ? { background: 'var(--teal)', color: '#fff' }
              : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
            Tomorrow
          </button>
          <button
            onClick={() => setActiveDept('All')}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={activeDept === 'All'
              ? { background: 'var(--teal)', color: '#fff' }
              : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
            All
          </button>
          {presentDepts.map(d => (
            <button key={d}
              onClick={() => setActiveDept(d)}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
              style={activeDept === d
                ? { background: 'var(--teal)', color: '#fff' }
                : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
              {d}
            </button>
          ))}
        </div>
      )}

      {/* "Tomorrow" view — clinicians working tomorrow + make-ups + Front Desk card */}
      {!loading && activeDept === 'Tomorrow' ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          {/* Left — clinicians working tomorrow (+ make-up sessions) */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                  Clinicians tomorrow · {fmtDateShort(tomorrowDate)}
                </h3>
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {tomorrowClinicians.length} on schedule · {BRANCH_LABEL[activeBranch] ?? activeBranch}
                </span>
              </div>
              {tomorrowClinicians.length === 0 ? (
                <div className="rounded-xl py-12 flex flex-col items-center gap-2"
                  style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>No clinicians scheduled tomorrow</p>
                  <p className="text-xs text-center px-4" style={{ color: 'var(--mid-gray)' }}>
                    No {activeBranch} clinician has a {WEEKDAY_FULL[tomorrowCode]} in the Decking Module. Add a make-up session on the right if needed.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {tomorrowByDept.map(g => (
                    <div key={g.dept}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>{g.dept}</span>
                        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                          {g.list.length} clinician{g.list.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'var(--light-gray)' }} />
                      </div>
                      <div className="space-y-2">
                        {g.list.map(({ staff: s }) => (
                          <StaffCard key={s.id} staff={s} selectedDate={tomorrowDate} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Make-up sessions — manually added clinicians, with full scheduling */}
            {makeupClinicians.length > 0 && (
              <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #FED7AA' }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: '#C2410C', fontFamily: 'var(--font-display)' }}>
                  Make-up sessions · {fmtDateShort(tomorrowDate)}
                </h3>
                <div className="space-y-3">
                  {makeupClinicians.map(s => (
                    <div key={s.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                          Make-up · {s.firstName} {s.lastName}
                        </span>
                        <button
                          onClick={() => setMakeupIds(ids => ids.filter(id => id !== s.id))}
                          className="text-xs font-medium"
                          style={{ color: 'var(--mid-gray)' }}>
                          Remove
                        </button>
                      </div>
                      <StaffCard staff={s} selectedDate={tomorrowDate} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — Front Desk card, reminder, and make-up search */}
          <div className="flex flex-col gap-3">
            <DeskShortcutCard />
            <div className="rounded-lg p-3" style={{ background: '#FEF2F2', border: '2px solid #DC2626' }}>
              <p className="text-sm font-bold m-0" style={{ color: '#DC2626', lineHeight: 1.45 }}>
                Note: Don&apos;t forget to include new patients, especially to medical doctors,
                psychologists and physical therapists from clinic inquiries.
              </p>
            </div>

            {/* Make-up clinician search */}
            <div className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
              <p className="text-sm font-bold mb-2" style={{ color: 'var(--charcoal)' }}>
                Any clinicians who will do make up sessions?
              </p>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={makeupQuery}
                  onChange={e => setMakeupQuery(e.target.value)}
                  placeholder="Search clinician name…"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1.5px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)' }}
                />
                {makeupMatches.length > 0 && (
                  <div className="rounded-lg mt-1 overflow-hidden" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
                    {makeupMatches.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setMakeupIds(ids => [...ids, s.id]); setMakeupQuery('') }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 flex items-center justify-between gap-2"
                        style={{ color: 'var(--charcoal)' }}>
                        <span>{s.firstName} {s.lastName}</span>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{s.department}</span>
                      </button>
                    ))}
                  </div>
                )}
                {makeupQuery.trim().length > 0 && makeupMatches.length === 0 && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                    No matching clinician in {activeBranch} (already-scheduled clinicians are hidden).
                  </p>
                )}
              </div>
              <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)', lineHeight: 1.4 }}>
                Add a clinician here to schedule a make-up session on a day that isn&apos;t part of their
                weekly schedule. They&apos;ll appear under <strong>Make-up sessions</strong> on the left.
              </p>
            </div>
          </div>
        </div>
      ) : loading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Loading staff…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl py-16 flex flex-col items-center gap-3"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
            {activeDept === 'All' ? `No ${activeBranch} staff found` : `No ${activeDept} staff in ${activeBranch}`}
          </p>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {activeDept === 'All' ? 'Add staff in the Staff Module first.' : 'Try a different department filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <StaffCard key={s.id} staff={s} selectedDate={selectedDate} />
          ))}
        </div>
      )}
    </div>
  )
}
