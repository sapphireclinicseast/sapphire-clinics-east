'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Plus, X, Settings2, Layers, Ban } from 'lucide-react'
import PatientRequestsPanel from './PatientRequestsPanel'
import { DAY_KEYS, DAY_LABEL, DAY_SHORT, sortDays } from '@/lib/decking-days'
import SlotLoaPanel, { type LoaLite } from './SlotLoaPanel'
import { DECK_SECTIONS, inSection, arrangementFor, type DeckSection } from '@/lib/work-arrangement'
import DeckingPerDay from './DeckingPerDay'
import SpedClassBoard from './SpedClassBoard'
import InterdepartmentBoard from './InterdepartmentBoard'
import DeckingHistory from './DeckingHistory'
import { branchLabel } from '@/lib/branch-label'

// ─── Constants ────────────────────────────────────────────────────────────────
// Days come from @/lib/decking-days so this board, Per Day and the SPED class
// board all run Sunday → Saturday. They used to hold three separate lists in
// two different orders.
const DAYS = DAY_KEYS
const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']

const DEFAULT_HOURS: Record<string, { startTime: string; endTime: string }> = {
  SBEA: { startTime: '10:00', endTime: '20:00' },
  SBGH: { startTime: '09:00', endTime: '19:00' },
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StaffMember { id: string; firstName: string; lastName: string; department: string; branch: string; extraBranches?: string[]; employmentType?: string | null; workArrangement?: string | null; branchEmployment?: Record<string, { arrangement?: string | null } | null> }
interface Patient { id: string; firstName: string; lastName: string }
interface TherapistConfig { id: string; staffId: string; workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string }
interface DeckingSlot { id: string; staffId: string; patientId: string | null; patient: Patient | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled: boolean; paymentType?: string; isClass?: boolean }

// Cell colouring, the way front desk reads their spreadsheet: what needs
// paperwork chased before the session stands out from what doesn't.
// Empty is deliberately a fill rather than white — an unfilled hour is the
// thing they are hunting for, so it should read as a state, not as absence.
type PayType = 'CASH' | 'HMO' | 'GL'
const PAY_TYPES: PayType[] = ['CASH', 'HMO', 'GL']
const PAY_STYLE: Record<PayType, { bg: string; fg: string; border: string; label: string }> = {
  CASH: { bg: '#E3EEFB', fg: '#14507F', border: '#A9CBEC', label: 'Cash' },
  HMO:  { bg: '#EFE4FA', fg: '#5B2A86', border: '#C9AEE6', label: 'HMO' },
  GL:   { bg: '#FDEAD6', fg: '#93460B', border: '#F3C69B', label: 'GL' },
}
// An open hour is the thing front desk is hunting for, so it is the loudest
// state on the board rather than the quietest — green, labelled, and readable
// from across the grid. Green was previously GL's colour; GL moved to orange.
const OPEN_BG     = '#DFF5E4'
const OPEN_FG     = '#166534'
const OPEN_BORDER = '#A9DDB7'
const OFF_CELL_BG = '#EDEFF1'   // disabled / not working
function payOf(s: DeckingSlot): PayType {
  return (PAY_TYPES as string[]).includes(s.paymentType ?? '') ? (s.paymentType as PayType) : 'CASH'
}
interface DayHours { open: boolean; openTime: string; closeTime: string }
type ClinicSchedule = Record<string, DayHours>
type AllClinicHours = Record<string, ClinicSchedule>

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Interns never get their own decking schedule — they're attached to a
// supervisor's session through the "Select Intern" field in Clinic Schedule
// and Queueing. This matters doubly here: decking therapist configs are what
// drive the Clinic Schedule "Tomorrow" list, so an intern given a config here
// would reappear there as a standalone clinician.
function isIntern(s: StaffMember): boolean {
  return s.employmentType === 'intern'
}

function formatTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function generateHourlySlots(startTime: string, endTime: string): string[] {
  const slots: string[] = []
  if (!startTime || !endTime) return slots
  const [sh] = startTime.split(':').map(Number)
  const [eh] = endTime.split(':').map(Number)
  for (let h = sh; h < eh; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
  }
  return slots
}

function visibleBranches(role: string): string[] {
  if (role.startsWith('SBEA_') || role.startsWith('AHEA_')) return ['SBEA']
  if (role.startsWith('SBGH_') || role.startsWith('AHGH_')) return ['SBGH']
  return ['SBEA', 'SBGH']
}

// ─── Patient Search (inline cell use) ─────────────────────────────────────────
function PatientCellSearch({ current, onSelect, onClear, onClose }: {
  current: Patient | null
  onSelect: (p: Patient) => void
  onClear: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(current ? `${current.lastName}, ${current.firstName}` : '')
  const [results, setResults] = useState<Patient[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleInput(val: string) {
    setQuery(val)
    if (timer.current) clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(val)}`)
      if (res.ok) { setResults(await res.json()); setOpen(true) }
    }, 250)
  }

  return (
    <div style={{ position: 'relative', minWidth: '160px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <input
          ref={inputRef}
          style={{ border: '1.5px solid #ED6823', borderRadius: '0.375rem', padding: '0.2rem 0.4rem', fontSize: '0.75rem', flex: 1, outline: 'none', minWidth: 0 }}
          placeholder="Search patient…"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onBlur={() => setTimeout(() => { setOpen(false); onClose() }, 200)}
          autoComplete="off"
        />
        {current && (
          <button type="button" onClick={onClear} style={{ color: '#DC2626', fontSize: '0.8rem', lineHeight: 1, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem' }}>
            <X size={12} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 50, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', top: '100%', left: 0, right: 0, maxHeight: '150px', overflowY: 'auto' }}>
          {results.map(p => (
            <button key={p.id} type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: 'none' }}
              onMouseDown={() => { onSelect(p); setOpen(false) }}>
              {p.lastName}, {p.firstName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Custom Slot Modal ────────────────────────────────────────────────────────
function CustomSlotModal({ staff, activeBranch, workDays, onClose, onSave }: {
  staff: StaffMember
  activeBranch: string
  workDays: string[]
  onClose: () => void
  onSave: (data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null }) => Promise<void>
}) {
  const [dayOfWeek, setDayOfWeek] = useState(workDays[0] ?? 'MON')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [showResults, setShowResults] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handlePatientInput(val: string) {
    setQuery(val)
    if (patient) setPatient(null)
    if (timer.current) clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); setShowResults(false); return }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(val)}`)
      if (res.ok) { setResults(await res.json()); setShowResults(true) }
    }, 250)
  }

  async function handleSave() {
    if (!dayOfWeek || !startTime || !endTime) return
    setSaving(true)
    await onSave({ staffId: staff.id, patientId: patient?.id ?? null, dayOfWeek, startTime, endTime, branch: activeBranch, department: staff.department, notes: notes || null })
    setSaving(false)
    onClose()
  }

  const inputStyle: React.CSSProperties = { border: '1.5px solid rgba(26,123,138,0.3)', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', fontSize: '0.85rem', width: '100%', color: 'var(--charcoal)', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--mid-gray)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--charcoal)' }}>
            Custom Slot — {staff.lastName}, {staff.firstName}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mid-gray)' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Day</label>
            <select style={inputStyle} value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
              {(workDays.length > 0 ? workDays : DAYS).map(d => (
                <option key={d} value={d}>{DAY_LABEL[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Start Time</label>
            <input type="time" step="900" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <input type="time" step="900" style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div style={{ gridColumn: 'span 2', position: 'relative' }}>
            <label style={labelStyle}>Patient (optional)</label>
            <input
              style={inputStyle}
              placeholder="Search patient name…"
              value={query}
              onChange={e => handlePatientInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              autoComplete="off"
            />
            {showResults && results.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 60, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', top: '100%', left: 0, right: 0, maxHeight: '150px', overflowY: 'auto' }}>
                {results.map(p => (
                  <button key={p.id} type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: 'none' }}
                    onMouseDown={() => { setPatient(p); setQuery(`${p.lastName}, ${p.firstName}`); setShowResults(false) }}>
                    {p.lastName}, {p.firstName}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Notes (optional)</label>
            <input style={inputStyle} placeholder="e.g. Group session, home program…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={{ padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.82rem', fontWeight: 600, background: 'var(--light-gray)', color: 'var(--charcoal)', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !dayOfWeek || !startTime || !endTime}
            style={{ padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.82rem', fontWeight: 600, background: '#ED6823', color: '#fff', border: 'none', cursor: 'pointer', opacity: (saving || !startTime || !endTime) ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Add Slot'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Therapist Row ─────────────────────────────────────────────────────────────
function TherapistRow({ staff, activeBranch, config, slots, defaultHours, onSaveConfig, onSaveSlot, onDeleteSlot, onOpenLoa }: {
  staff: StaffMember
  activeBranch: string
  config: TherapistConfig | undefined
  slots: DeckingSlot[]
  defaultHours: { startTime: string; endTime: string }
  onSaveConfig: (staffId: string, data: { workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string }) => Promise<void>
  onSaveSlot: (data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled?: boolean; isClass?: boolean }) => Promise<void>
  onDeleteSlot: (id: string) => Promise<void>
  /** Raise / open the Letter of Authorization for an HMO slot. */
  onOpenLoa?: (slot: DeckingSlot) => void
}) {
  const [configOpen, setConfigOpen] = useState(!config)
  // Optimistic: the grid is scanned constantly, and a colour that lags a click
  // by a round-trip reads as the click not registering. Reverted on failure.
  const [payOverride, setPayOverride] = useState<Record<string, PayType>>({})
  const [workDays, setWorkDays] = useState<string[]>((config?.workDays as string[]) ?? [])
  const [startTime, setStartTime] = useState(config?.startTime ?? defaultHours.startTime)
  const [endTime, setEndTime] = useState(config?.endTime ?? defaultHours.endTime)
  const [useDefault, setUseDefault] = useState(config?.useDefault ?? true)
  const [saving, setSaving] = useState(false)
  // Which cell currently has the patient-search input open (for adding a new patient)
  const [addingCell, setAddingCell] = useState<{ dayOfWeek: string; startTime: string } | null>(null)
  const [showCustomModal, setShowCustomModal] = useState(false)

  useEffect(() => {
    if (config) {
      setWorkDays(config.workDays as string[])
      setStartTime(config.startTime)
      setEndTime(config.endTime)
      setUseDefault(config.useDefault)
    }
  }, [config])

  function handleUseDefaultToggle(checked: boolean) {
    setUseDefault(checked)
    if (checked) {
      setStartTime(defaultHours.startTime)
      setEndTime(defaultHours.endTime)
    }
  }

  async function saveConfig() {
    setSaving(true)
    await onSaveConfig(staff.id, { workDays, startTime, endTime, useDefault, branch: activeBranch, department: staff.department })
    setSaving(false)
    if (workDays.length > 0) setConfigOpen(false)
  }

  // Calendar order, not the order the checkboxes were saved in — that is what
  // put Friday before Thursday on a consultant's board.
  const configuredDays = config ? sortDays(config.workDays as string[]) : []
  const timeSlots = config ? generateHourlySlots(config.startTime, config.endTime) : []

  // Returns ALL patients assigned to this time slot (up to 3)
  function getSlotsForCell(dayOfWeek: string, slotTime: string): DeckingSlot[] {
    return slots.filter(s => s.dayOfWeek === dayOfWeek && s.startTime === slotTime && !s.disabled)
  }

  // Check if a cell is disabled
  function getDisabledSlot(dayOfWeek: string, slotTime: string): DeckingSlot | undefined {
    return slots.find(s => s.dayOfWeek === dayOfWeek && s.startTime === slotTime && s.disabled)
  }

  async function handleDisableSlot(dayOfWeek: string, slotTime: string) {
    await onSaveSlot({
      staffId: staff.id,
      patientId: null,
      dayOfWeek,
      startTime: slotTime,
      endTime: addHour(slotTime),
      branch: activeBranch,
      department: staff.department,
      notes: null,
      disabled: true,
    })
  }

  async function handleEnableSlot(disabledSlot: DeckingSlot) {
    await onDeleteSlot(disabledSlot.id)
  }

  async function handlePatientSelect(dayOfWeek: string, slotTime: string, patient: Patient) {
    await onSaveSlot({
      staffId: staff.id,
      patientId: patient.id,
      dayOfWeek,
      startTime: slotTime,
      endTime: addHour(slotTime),
      branch: activeBranch,
      department: staff.department,
      notes: null,
    })
    setAddingCell(null)
  }

  async function handlePayChange(slot: DeckingSlot, next: PayType) {
    const previous = payOf(slot)
    setPayOverride(o => ({ ...o, [slot.id]: next }))
    try {
      const res = await fetch('/api/decking/slots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slot.id, paymentType: next }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      // Put the cell back rather than leaving a colour that says the change
      // saved when it didn't — this drives who gets chased for paperwork.
      setPayOverride(o => ({ ...o, [slot.id]: previous }))
    }
  }

  async function handleClearSlot(slot: DeckingSlot) {
    await onDeleteSlot(slot.id)
  }

  const inputStyle: React.CSSProperties = { border: '1.5px solid rgba(26,123,138,0.3)', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', fontSize: '0.82rem', outline: 'none', color: 'var(--charcoal)' }

  // Custom slots (non-hourly — those not matching hourly start times)
  const hourlyStartSet = new Set(timeSlots)
  const customSlots = slots.filter(s => !hourlyStartSet.has(s.startTime))

  return (
    <div style={{ border: '1px solid var(--light-gray)', borderRadius: '0.75rem', overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
        <div style={{ width: '2rem', height: '2rem', borderRadius: '0.4rem', background: '#FFF3E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#ED6823', fontWeight: 700, fontSize: '0.75rem' }}>{staff.firstName[0]}{staff.lastName[0]}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--charcoal)' }}>{staff.lastName}, {staff.firstName}</p>
          {config && configuredDays.length > 0 && (
            <p style={{ fontSize: '0.68rem', color: 'var(--mid-gray)', marginTop: '0.05rem' }}>
              {configuredDays.map(d => DAY_SHORT[d]).join(' · ')}
              {' · '}{formatTime(config.startTime)} – {formatTime(config.endTime)}
            </p>
          )}
        </div>
        <button
          onClick={() => setConfigOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', color: configOpen ? '#ED6823' : 'var(--mid-gray)', fontWeight: 600, background: configOpen ? '#FFF3E8' : 'transparent', border: `1px solid ${configOpen ? '#FDE4CC' : 'var(--light-gray)'}`, cursor: 'pointer', padding: '0.25rem 0.6rem', borderRadius: '0.375rem' }}
        >
          <Settings2 size={12} />
          Configure
          {configOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Config panel */}
      {configOpen && (
        <div style={{ padding: '1rem', background: '#FFFAF6', borderBottom: '1px solid #FDE4CC' }}>
          {/* Work days */}
          <div style={{ marginBottom: '0.875rem' }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--mid-gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Work Days</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {DAYS.map(day => {
                const checked = workDays.includes(day)
                return (
                  <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => setWorkDays(e.target.checked ? [...workDays, day] : workDays.filter(d => d !== day))}
                      style={{ accentColor: '#ED6823', width: '14px', height: '14px' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: checked ? '#ED6823' : 'var(--charcoal)', fontWeight: checked ? 700 : 400 }}>
                      {DAY_SHORT[day]}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Working hours */}
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--mid-gray)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Working Hours</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useDefault}
                  onChange={e => handleUseDefaultToggle(e.target.checked)}
                  style={{ accentColor: '#ED6823', width: '14px', height: '14px' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#ED6823', fontWeight: 600 }}>Use clinic default hours</span>
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                disabled={useDefault}
                style={{ ...inputStyle, opacity: useDefault ? 0.5 : 1, cursor: useDefault ? 'not-allowed' : 'default' }}
              />
              <span style={{ color: 'var(--mid-gray)', fontSize: '0.82rem' }}>–</span>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                disabled={useDefault}
                style={{ ...inputStyle, opacity: useDefault ? 0.5 : 1, cursor: useDefault ? 'not-allowed' : 'default' }}
              />
              {!useDefault && startTime && endTime && (
                <span style={{ fontSize: '0.72rem', color: 'var(--mid-gray)' }}>
                  ({generateHourlySlots(startTime, endTime).length} slots)
                </span>
              )}
            </div>
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            style={{ background: '#ED6823', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.4rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      )}

      {/* No config yet */}
      {!config && !configOpen && (
        <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--mid-gray)', fontSize: '0.82rem' }}>
          Click Configure to set up this therapist&apos;s work schedule.
        </div>
      )}

      {/* No work days configured */}
      {config && configuredDays.length === 0 && (
        <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--mid-gray)', fontSize: '0.82rem' }}>
          No work days set. Click Configure to add work days.
        </div>
      )}

      {/* Weekly decking table */}
      {config && configuredDays.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '90px' }} />
              {configuredDays.map(d => <col key={d} style={{ minWidth: '150px' }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: '#FFF3E8' }}>
                <th style={{ padding: '0.35rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#5A6470', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F0F2F5', borderBottom: '1px solid #C4CBD3', borderRight: '1px solid #C4CBD3' }}>
                  Time
                </th>
                {configuredDays.map(day => (
                  <th key={day} style={{ padding: '0.35rem 0.6rem', textAlign: 'center', fontWeight: 700, color: '#2C3540', fontSize: '0.74rem', background: '#F0F2F5', borderBottom: '1px solid #C4CBD3', borderRight: '1px solid #C4CBD3' }}>
                    {DAY_LABEL[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot, idx) => (
                <tr key={slot} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '0 0.6rem', color: '#5A6470', fontSize: '0.68rem', fontWeight: 600, whiteSpace: 'nowrap', background: '#F7F8FA', borderRight: '1px solid #C4CBD3', borderBottom: '1px solid #D6DCE2', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(slot)}
                  </td>
                  {configuredDays.map(day => {
                    const disabledSlot = getDisabledSlot(day, slot)
                    const cellSlots = getSlotsForCell(day, slot)
                    const isAdding = addingCell?.dayOfWeek === day && addingCell?.startTime === slot

                    // ── Disabled cell ──
                    if (disabledSlot) {
                      return (
                        <td key={day} style={{ padding: 0, verticalAlign: 'middle', borderRight: '1px solid #D6DCE2', borderBottom: '1px solid #D6DCE2', background: OFF_CELL_BG, height: 30 }}>
                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              background: '#e5e7eb', border: '1px solid #d1d5db', borderRadius: '0.3rem',
                              padding: '0.18rem 0.4rem', justifyContent: 'center',
                            }}
                          >
                            <Ban size={10} style={{ color: '#9ca3af', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af' }}>
                              {disabledSlot.notes || 'Disabled'}
                            </span>
                            <button
                              onClick={() => handleEnableSlot(disabledSlot)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, lineHeight: 1, flexShrink: 0, marginLeft: 'auto' }}
                              title="Re-enable this slot"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        </td>
                      )
                    }

                    // ── Normal cell ──
                    // Spreadsheet cell, not a card: the fill IS the cell, one
                    // row per patient, no rounded pill and no stacked Add button
                    // underneath. That button was why every occupied hour was
                    // two rows tall and the grid read half as dense as the sheet
                    // front desk actually prefers.
                    const empty = cellSlots.length === 0
                    return (
                      <td key={day} style={{
                        padding: 0, verticalAlign: 'middle',
                        borderRight: '1px solid #D6DCE2', borderBottom: '1px solid #D6DCE2',
                        background: empty ? OPEN_BG : 'transparent',
                        height: 30,
                      }}>
                        {isAdding ? (
                          <div style={{ padding: '2px 3px' }}>
                            <PatientCellSearch
                              current={null}
                              onSelect={p => handlePatientSelect(day, slot, p)}
                              onClear={() => setAddingCell(null)}
                              onClose={() => setAddingCell(null)}
                            />
                          </div>
                        ) : empty ? (
                          /* An empty cell is one click to fill. The disable
                             control sits at the edge so it can't be hit by
                             accident when aiming for the cell. */
                          <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
                            <button
                              onClick={() => setAddingCell({ dayOfWeek: day, startTime: slot })}
                              title="Add patient to this open slot"
                              style={{
                                flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                                color: OPEN_FG, fontSize: '0.7rem', fontWeight: 700,
                                letterSpacing: '0.02em', padding: '0 6px', textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                              <Plus size={10} />
                              Available
                            </button>
                            <button
                              onClick={() => handleDisableSlot(day, slot)}
                              title="Mark unavailable (break, blocked hour)"
                              style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: OPEN_FG, opacity: 0.45, padding: '0 5px', display: 'flex', alignItems: 'center',
                              }}>
                              <Ban size={9} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {cellSlots.map((s2, idx) => {
                              const pay = payOverride[s2.id] ?? payOf(s2)
                              const st = PAY_STYLE[pay]
                              return (
                                <div key={s2.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  background: st.bg, color: st.fg,
                                  borderTop: idx === 0 ? 'none' : `1px solid ${st.border}`,
                                  padding: '0 4px 0 6px', flex: 1, minHeight: 28,
                                }}>
                                  <span style={{
                                    fontSize: '0.72rem', fontWeight: 600, flex: 1,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}
                                    title={s2.patient ? `${s2.patient.lastName}, ${s2.patient.firstName}` : '(slot)'}>
                                    {s2.patient ? `${s2.patient.lastName}, ${s2.patient.firstName[0]}.` : '(slot)'}
                                  </span>
                                  {/* Payment type: shown only when it needs chasing.
                                      A "Cash" badge on most of the grid would be
                                      noise, so cash reads as the plain cell. */}
                                  <select
                                    value={pay}
                                    onChange={e => handlePayChange(s2, e.target.value as PayType)}
                                    title="Payment type"
                                    style={{
                                      appearance: 'none', WebkitAppearance: 'none',
                                      background: 'rgba(255,255,255,0.65)',
                                      border: `1px solid ${st.border}`,
                                      borderRadius: 3, color: st.fg,
                                      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.03em',
                                      padding: '0 3px', cursor: 'pointer', flexShrink: 0,
                                      opacity: 1,
                                    }}>
                                    {PAY_TYPES.map(t => <option key={t} value={t}>{PAY_STYLE[t].label}</option>)}
                                  </select>
                                  {/* An HMO session cannot proceed without an
                                      approved LOA on file, so the letter is
                                      raised from the slot that needs it rather
                                      than re-keyed in another module. Shown only
                                      for HMO — cash and GL do not use one. */}
                                  {pay === 'HMO' && (
                                    <button
                                      onClick={() => onOpenLoa?.(s2)}
                                      title="Letter of Authorization for this session"
                                      style={{
                                        background: 'rgba(255,255,255,0.65)',
                                        border: `1px solid ${st.border}`, borderRadius: 3,
                                        color: st.fg, fontSize: '0.6rem', fontWeight: 800,
                                        letterSpacing: '0.03em', padding: '0 3px',
                                        cursor: 'pointer', flexShrink: 0, lineHeight: 1.6,
                                      }}>
                                      LOA
                                    </button>
                                  )}
                                  <button onClick={() => handleClearSlot(s2)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0453A', padding: 0, lineHeight: 1, flexShrink: 0 }}
                                    title="Remove">
                                    <X size={10} />
                                  </button>
                                </div>
                              )
                            })}
                            {/* Second patient is the exception, so it's a thin
                                edge control rather than a row of its own. */}
                            {cellSlots.length < 3 && (
                              <button
                                onClick={() => setAddingCell({ dayOfWeek: day, startTime: slot })}
                                title="Add another patient to this hour"
                                style={{
                                  background: 'transparent', border: 'none', borderTop: '1px solid #E6E9ED',
                                  cursor: 'pointer', color: '#9AA2AC', fontSize: '0.6rem', lineHeight: 1,
                                  padding: '1px 0', flexShrink: 0,
                                }}>
                                +
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}

              {/* Custom slots rows */}
              {customSlots.length > 0 && (
                <tr style={{ background: '#FFFAF6' }}>
                  <td colSpan={configuredDays.length + 1} style={{ padding: '0.3rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, color: '#ED6823', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #FDE4CC' }}>
                    Custom Slots
                  </td>
                </tr>
              )}
              {customSlots.map(slot => (
                <tr key={slot.id} style={{ background: '#FFFAF6', borderBottom: '1px solid #FDE4CC' }}>
                  <td style={{ padding: '0.35rem 0.75rem', fontSize: '0.72rem', color: 'var(--mid-gray)', whiteSpace: 'nowrap', borderRight: '1px solid #FDE4CC' }}>
                    {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                  </td>
                  <td colSpan={configuredDays.length} style={{ padding: '0.25rem 0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ED6823' }}>
                        {DAY_SHORT[slot.dayOfWeek]}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--charcoal)' }}>
                        {slot.patient ? `${slot.patient.lastName}, ${slot.patient.firstName}` : '(no patient)'}
                      </span>
                      {slot.notes && <span style={{ fontSize: '0.7rem', color: 'var(--mid-gray)' }}>{slot.notes}</span>}
                      <button
                        onClick={() => onDeleteSlot(slot.id)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '0.1rem' }}
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Custom slot button */}
          <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
            <button
              onClick={() => setShowCustomModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#ED6823', background: 'none', border: '1px dashed #ED6823', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', cursor: 'pointer' }}
            >
              <Plus size={12} /> Custom Slot
            </button>
          </div>
        </div>
      )}

      {showCustomModal && (
        <CustomSlotModal
          staff={staff}
          activeBranch={activeBranch}
          workDays={configuredDays}
          onClose={() => setShowCustomModal(false)}
          onSave={async data => {
            await onSaveSlot(data)
            setShowCustomModal(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ initialData, onSave }: {
  initialData: AllClinicHours
  onSave: (branch: string, schedule: ClinicSchedule) => Promise<void>
}) {
  const [data, setData] = useState<AllClinicHours>(initialData)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => { setData(initialData) }, [initialData])

  function update(branch: string, day: string, field: string, value: unknown) {
    setData(prev => ({
      ...prev,
      [branch]: {
        ...prev[branch],
        [day]: { ...(prev[branch]?.[day] ?? {}), [field]: value },
      },
    }))
  }

  async function handleSave(branch: string) {
    setSaving(branch)
    await onSave(branch, data[branch])
    setSaving(null)
    setSaved(branch)
    setTimeout(() => setSaved(null), 2000)
  }

  const inputStyle: React.CSSProperties = { border: '1.5px solid rgba(26,123,138,0.3)', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', fontSize: '0.82rem', outline: 'none', color: 'var(--charcoal)' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
      {['SBEA', 'SBGH'].map(branch => (
        <div key={branch} style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1rem', background: '#FFF3E8', borderBottom: '1px solid #FDE4CC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ED6823' }}>{branchLabel(branch) ?? branch} — Default Clinic Hours</h3>
            <button
              onClick={() => handleSave(branch)}
              disabled={saving === branch}
              style={{ background: saving === branch ? '#e5e7eb' : saved === branch ? '#22C55E' : '#ED6823', color: '#fff', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving === branch ? 'Saving…' : saved === branch ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          <div style={{ padding: '0.75rem 1rem' }}>
            {DAYS.map(day => {
              const dayData = data[branch]?.[day] ?? { open: false, openTime: '10:00', closeTime: '20:00' }
              return (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0', borderBottom: '1px solid #f9fafb' }}>
                  <input
                    type="checkbox"
                    checked={dayData.open}
                    onChange={e => update(branch, day, 'open', e.target.checked)}
                    style={{ accentColor: '#ED6823', width: '14px', height: '14px', flexShrink: 0 }}
                  />
                  <span style={{ width: '3rem', fontSize: '0.8rem', fontWeight: 500, color: dayData.open ? 'var(--charcoal)' : 'var(--mid-gray)', flexShrink: 0 }}>
                    {DAY_SHORT[day]}
                  </span>
                  {dayData.open ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                      <input type="time" value={dayData.openTime} onChange={e => update(branch, day, 'openTime', e.target.value)} style={inputStyle} />
                      <span style={{ color: 'var(--mid-gray)', fontSize: '0.8rem' }}>–</span>
                      <input type="time" value={dayData.closeTime} onChange={e => update(branch, day, 'closeTime', e.target.value)} style={inputStyle} />
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--mid-gray)', fontStyle: 'italic' }}>Closed</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main DeckingClient ───────────────────────────────────────────────────────
export default function DeckingClient({ role }: { role: string }) {
  const branches = visibleBranches(role)
  const [activeBranch, setActiveBranch] = useState(branches[0])
  const [activeDept, setActiveDept] = useState(DEPARTMENTS[0])
  const [activeMainTab, setActiveMainTab] = useState<'decking' | 'settings'>('decking')
  const [nameFilter, setNameFilter] = useState('')
  const [activeSection, setActiveSection] = useState<DeckSection>('onsite')
  // LOA raised from an HMO slot — kept on the board rather than routing to the
  // LOA module, because front desk are mid-scan of the grid when they need it.
  const [loaPanel, setLoaPanel] = useState<{ loa: LoaLite; slot: DeckingSlot } | null>(null)
  const [loaBusy, setLoaBusy] = useState<string | null>(null)

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [configs, setConfigs] = useState<TherapistConfig[]>([])
  const [slots, setSlots] = useState<DeckingSlot[]>([])
  const [clinicHoursData, setClinicHoursData] = useState<AllClinicHours>({})

  const [loadingStaff, setLoadingStaff] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  // Load staff + clinic hours on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/staff').then(r => r.json()),
      fetch('/api/decking/settings').then(r => r.json()),
    ]).then(([staffData, hoursData]) => {
      setStaff(staffData)
      setClinicHoursData(hoursData)
    }).finally(() => setLoadingStaff(false))
  }, [])

  const loadBranchData = useCallback(async (branch: string) => {
    setLoadingData(true)
    const [cfgs, slts] = await Promise.all([
      fetch(`/api/decking/therapists?branch=${branch}`).then(r => r.json()),
      fetch(`/api/decking/slots?branch=${branch}`).then(r => r.json()),
    ])
    setConfigs(cfgs)
    setSlots(slts)
    setLoadingData(false)
  }, [])

  useEffect(() => {
    if (!loadingStaff) loadBranchData(activeBranch)
  }, [activeBranch, loadingStaff, loadBranchData])

  // Filtered staff for display — interbranch staff (secondary branch in
  // extraBranches) must show up here too, not just under their primary branch.
  const branchStaff = staff
    .filter(s => !isIntern(s) && (s.branch === activeBranch || (s.extraBranches ?? []).includes(activeBranch)) && s.department === activeDept)
    // "All" is the consolidated board and deliberately skips the arrangement
    // filter: untagged, hybrid and WFH consultants match no service section, so
    // All is the only place they appear. Filtering them everywhere would drop
    // most of the roster off Decking entirely while HR tagging catches up.
    .filter(s => activeSection === 'all' || inSection(arrangementFor(s, activeBranch), activeSection))
  const filteredStaff = nameFilter.trim()
    ? branchStaff.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(nameFilter.toLowerCase()))
    : branchStaff

  // Build maps
  const configMap = new Map(configs.map(c => [c.staffId, c]))
  const slotsByStaff = new Map<string, DeckingSlot[]>()
  for (const slot of slots.filter(s => s.department === activeDept && !s.isClass)) {
    const arr = slotsByStaff.get(slot.staffId) ?? []
    arr.push(slot)
    slotsByStaff.set(slot.staffId, arr)
  }

  const presentDepts = DEPARTMENTS.filter(d => staff.some(s => !isIntern(s) && (s.branch === activeBranch || (s.extraBranches ?? []).includes(activeBranch)) && s.department === d))
  const defaultHours = clinicHoursData[activeBranch]
    ? (() => {
        const schedule = clinicHoursData[activeBranch]
        const firstOpen = DAYS.find(d => schedule[d]?.open)
        if (firstOpen) return { startTime: schedule[firstOpen].openTime, closeTime: schedule[firstOpen].closeTime }
        return null
      })()
    : null
  const resolvedDefaultHours = defaultHours
    ? { startTime: defaultHours.startTime, endTime: defaultHours.closeTime }
    : DEFAULT_HOURS[activeBranch] ?? { startTime: '10:00', endTime: '20:00' }

  // Capacity for whatever the filters currently show. A "slot" here is an hour
  // cell on a therapist's grid, not a DeckingSlot row: empty cells have no row,
  // and a cell holding two patients is still one slot. Counting rows would
  // report a booked pair as two slots and miss every open hour entirely.
  // Hours each consultant has given this branch, per department per day. This
  // is CAPACITY — the time offered — as opposed to the decked sessions Per Day
  // already totals. Built from the same stored config times the grid draws
  // from, so the two can never describe different weeks.
  const perDayCapacity = (() => {
    const cap: Record<string, Record<string, number>> = {}
    for (const st of staff) {
      if (isIntern(st)) continue
      if (!(st.branch === activeBranch || (st.extraBranches ?? []).includes(activeBranch))) continue
      const cfg = configMap.get(st.id)
      if (!cfg) continue                       // no work days set — offered nothing
      const hours = generateHourlySlots(cfg.startTime, cfg.endTime).length
      for (const d of ((cfg.workDays as string[]) ?? [])) {
        cap[st.department] ??= {}
        cap[st.department][d] = (cap[st.department][d] ?? 0) + hours
      }
    }
    return cap
  })()

  const slotSummary = (() => {
    let total = 0, booked = 0, blocked = 0
    for (const st of filteredStaff) {
      const cfg = configMap.get(st.id)
      if (!cfg) continue                       // no work days set — no capacity yet

      // Walk exactly the cells TherapistRow draws, and classify each the way
      // the cell itself does. Deriving capacity separately is what made Open
      // read 0 on a board full of green: the grid builds its rows from the
      // stored config times, while this counted the clinic default window
      // whenever useDefault was set. Where that window was the narrower of the
      // two, booked + blocked swallowed the whole total.
      const hours = generateHourlySlots(cfg.startTime, cfg.endTime)
      const days = (cfg.workDays as string[]) ?? []

      const byCell = new Map<string, DeckingSlot[]>()
      for (const r of (slotsByStaff.get(st.id) ?? []).filter(sl => !sl.isClass)) {
        const key = `${r.dayOfWeek}|${r.startTime}`
        byCell.set(key, [...(byCell.get(key) ?? []), r])
      }

      for (const day of days) {
        for (const hour of hours) {
          total++
          const cell = byCell.get(`${day}|${hour}`) ?? []
          // Same precedence as the cell: disabled wins, then any occupant
          // (a cell holding three children is still one filled slot), else open.
          if (cell.some(r => r.disabled)) blocked++
          else if (cell.length > 0) booked++
        }
      }
    }
    // Every counted cell fell into exactly one bucket, so this cannot go
    // negative and needs no clamp to hide an inconsistency.
    return { total, booked, blocked, open: total - booked - blocked }
  })()

  // Raise (or reopen) the Letter of Authorization for an HMO slot.
  //
  // Reuses an existing letter for the same slot rather than creating a second
  // one — front desk click this to check on a letter at least as often as to
  // start one, and two records for one session would split the paper trail.
  async function openLoaForSlot(slot: DeckingSlot) {
    setLoaBusy(slot.id)
    try {
      const found = await fetch(`/api/loa?slotId=${slot.id}`).then(r => r.json()).catch(() => null)
      let loa = found?.submissions?.[0]

      if (!loa) {
        const res = await fetch('/api/loa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deckingSlotId: slot.id,
            branch: activeBranch,
            // The board knows the department; the HMO itself is what front desk
            // fills in, so the letter starts unnamed rather than guessing.
            hmoName: 'UNSPECIFIED',
            patientName: slot.patient ? `${slot.patient.lastName}, ${slot.patient.firstName}` : null,
          }),
        })
        if (!res.ok) {
          alert((await res.json()).error ?? 'Could not create the LOA')
          return
        }
        loa = await res.json()
      }
      setLoaPanel({ loa, slot })
    } finally {
      setLoaBusy(null)
    }
  }

  async function handleSaveConfig(staffId: string, data: { workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string }) {
    await fetch('/api/decking/therapists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, ...data }),
    })
    await loadBranchData(activeBranch)
  }

  async function handleSaveSlot(data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled?: boolean; isClass?: boolean }) {
    await fetch('/api/decking/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await loadBranchData(activeBranch)
  }

  async function handleDeleteSlot(id: string) {
    await fetch('/api/decking/slots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadBranchData(activeBranch)
  }

  async function handleSaveClinicHours(branch: string, schedule: ClinicSchedule) {
    await fetch('/api/decking/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, schedule }),
    })
    setClinicHoursData(prev => ({ ...prev, [branch]: schedule }))
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '0.45rem 1rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    borderRadius: '0.5rem',
    background: active ? '#ED6823' : 'transparent',
    color: active ? '#fff' : 'var(--mid-gray)',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--teal)', marginBottom: '0.25rem' }}>Clinic Tools</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', color: 'var(--charcoal)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={22} style={{ color: '#ED6823' }} /> Decking Module
          </h1>
          {/* Main tab switcher */}
          <div style={{ display: 'flex', background: 'var(--off-white)', borderRadius: '0.6rem', padding: '0.25rem', border: '1px solid var(--light-gray)', gap: '0.2rem' }}>
            <button style={tabBtn(activeMainTab === 'decking')} onClick={() => setActiveMainTab('decking')}>
              Weekly Decking
            </button>
            <button style={tabBtn(activeMainTab === 'settings')} onClick={() => setActiveMainTab('settings')}>
              <Settings2 size={13} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'middle' }} />
              Clinic Hours
            </button>
          </div>
        </div>
      </div>

      {/* Settings Tab */}
      {activeMainTab === 'settings' && (
        <SettingsTab initialData={clinicHoursData} onSave={handleSaveClinicHours} />
      )}

      {/* Decking Tab */}
      {activeMainTab === 'decking' && (
        <div>
          {/* Service sections. A consultant tagged "On-site + Teletherapy"
              appears under BOTH On-site and Teletherapy — the combined
              arrangements are genuinely two roles, not a third category. */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {DECK_SECTIONS.map(sec => {
              const active = activeSection === sec.key
              return (
                <button key={sec.key} onClick={() => setActiveSection(sec.key)} title={sec.blurb}
                  style={{
                    padding: '0.45rem 1.1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                    borderRadius: '0.5rem', border: `1.5px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
                    background: active ? 'var(--teal)' : '#fff',
                    color: active ? '#fff' : 'var(--mid-gray)',
                  }}>
                  {sec.label}
                </button>
              )
            })}
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* Branch toggle */}
            {branches.length > 1 && (
              <div style={{ display: 'flex', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--light-gray)' }}>
                {branches.map(b => (
                  <button key={b} onClick={() => { setActiveBranch(b); setNameFilter('') }}
                    style={{ padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeBranch === b ? 'var(--teal)' : '#fff', color: activeBranch === b ? '#fff' : 'var(--mid-gray)' }}>
                    {branchLabel(b) ?? b}
                  </button>
                ))}
              </div>
            )}
            {/* Name search — hidden on Per Day, which totals slots rather than
                listing people, so filtering by name would change nothing. */}
            {activeSection !== 'perday' && activeSection !== 'sped' && activeSection !== 'crosssell' && activeSection !== 'history' && (
            <input
              style={{ border: '1.5px solid rgba(26,123,138,0.3)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', fontSize: '0.82rem', outline: 'none', color: 'var(--charcoal)', minWidth: '180px' }}
              placeholder="Filter by name…"
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
            />
            )}
          </div>

          {/* Colour key. The grid is scanned, not read — without a key the fills
              are decoration, and front desk keeps going back to the sheet they
              already know how to interpret. */}
          {activeSection !== 'perday' && activeSection !== 'sped' && activeSection !== 'crosssell' && activeSection !== 'history' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.9rem', marginBottom: '0.85rem', fontSize: '0.72rem', color: 'var(--mid-gray)' }}>
              {([
                { bg: OPEN_BG, border: OPEN_BORDER, label: 'Available' },
                { bg: PAY_STYLE.CASH.bg, border: PAY_STYLE.CASH.border, label: 'Cash' },
                { bg: PAY_STYLE.HMO.bg, border: PAY_STYLE.HMO.border, label: 'HMO' },
                { bg: PAY_STYLE.GL.bg, border: PAY_STYLE.GL.border, label: 'Guarantee Letter' },
                { bg: OFF_CELL_BG, border: '#D6DCE2', label: 'Unavailable' },
              ]).map(k => (
                <span key={k.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 13, height: 13, background: k.bg, border: `1px solid ${k.border}`, display: 'inline-block' }} />
                  {k.label}
                </span>
              ))}
            </div>
          )}

          {/* Department chips — hidden on Per Day, which is an all-department
              aggregate: a department filter there would contradict the table. */}
          {activeSection !== 'perday' && activeSection !== 'sped' && activeSection !== 'crosssell' && activeSection !== 'history' && !loadingStaff && presentDepts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {presentDepts.map(d => (
                <button key={d} onClick={() => setActiveDept(d)}
                  style={{ padding: '0.3rem 0.875rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: activeDept === d ? 'none' : '1px solid var(--light-gray)', background: activeDept === d ? '#ED6823' : '#fff', color: activeDept === d ? '#fff' : 'var(--mid-gray)', transition: 'all 0.15s' }}>
                  {d}
                </button>
              ))}
            </div>
          )}
          {/* On-site / Teletherapy / Homecare split the width 2:1 — board on the
              left, the client-portal requests for that service on the right. "All"
              is the consolidated roster and takes the full width: it is not tied to
              one service's payments. The board itself renders once either way. */}
          {/* Single column until lg, so the requests panel drops below the
              board on laptops and tablets instead of squeezing it. */}
          <div className={`grid gap-4 items-start ${
            activeSection === 'all' || activeSection === 'perday' || activeSection === 'sped' || activeSection === 'crosssell' || activeSection === 'history'
              ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
          }`}>
            <div style={{ minWidth: 0 }}>
            {/* On All the card cannot sit in the right column — that section is
                full width — so it runs across the top instead. Same numbers,
                same derivation; All simply has no arrangement filter, so this
                totals every mode of delivery at once. */}
            {activeSection === 'all' && !loadingStaff && !loadingData && (
              <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mid-gray)', marginBottom: '0.6rem' }}>
                  Slots &mdash; {branchLabel(activeBranch) ?? activeBranch} &middot; {activeDept} &middot; all modes of delivery
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', maxWidth: 520 }}>
                  {([
                    // Percentages are of TOTAL, named on the tile, so booked and open
                    // read as shares of the same capacity, not of each other.
                    { label: 'Total',  value: slotSummary.total,  fg: '#1F2937', bg: '#F1F3F5', pct: null },
                    { label: 'Booked', value: slotSummary.booked, fg: '#14507F', bg: '#E3EEFB', pct: slotSummary.total > 0 ? Math.round((slotSummary.booked / slotSummary.total) * 100) : null },
                    { label: 'Open',   value: slotSummary.open,   fg: '#166534', bg: '#DFF5E4', pct: slotSummary.total > 0 ? Math.round((slotSummary.open / slotSummary.total) * 100) : null },
                  ]).map(k => (
                    <div key={k.label} style={{ background: k.bg, borderRadius: '0.5rem', padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: k.fg, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: k.fg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                      {k.pct !== null && (
                        <div style={{ fontSize: '0.64rem', fontWeight: 600, color: k.fg, opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{k.pct}% of total</div>
                      )}
                    </div>
                  ))}
                </div>
                {slotSummary.blocked > 0 && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--mid-gray)', marginTop: '0.5rem' }}>
                    {slotSummary.blocked} marked unavailable, not counted as open.
                  </p>
                )}
              </div>
            )}
            {/* Staff list */}
            {loadingStaff || loadingData ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--mid-gray)', fontSize: '0.85rem' }}>Loading…</div>
            ) : activeSection === 'history' ? (
              /* The board over time, from the daily snapshots — the board
                 itself keeps no dated record. */
              <DeckingHistory branch={activeBranch} />
            ) : activeSection === 'crosssell' ? (
              /* A patient list, not a roster: which patients on this branch's
                 board see more than one department, and which do not yet. */
              <InterdepartmentBoard branch={activeBranch} />
            ) : activeSection === 'sped' ? (
              /* SPED gets the branch's SPED slots and SPED staff, whatever the
                 department chip says — the chip is hidden here precisely because
                 the board is SPED by definition. */
              <SpedClassBoard
                /* Classes only. Filtering on department alone put every 1-on-1
                   SPED therapy session on this board — a different booking for a
                   different group of patients. */
                slots={slots.filter(sl => sl.department === 'SPED' && sl.isClass)}
                staff={staff
                  .filter(st => !isIntern(st)
                    && (st.branch === activeBranch || (st.extraBranches ?? []).includes(activeBranch))
                    && st.department === 'SPED')
                  .map(st => ({ id: st.id, firstName: st.firstName, lastName: st.lastName }))}
                branchName={branchLabel(activeBranch) ?? activeBranch}
                onAddChild={async (block, patientId) => {
                  await handleSaveSlot({ ...block, patientId, branch: activeBranch, department: 'SPED', notes: null, isClass: true })
                }}
                onRemove={handleDeleteSlot}
                onCreateBlock={async (block) => {
                  // An empty block: the row has to exist before children can be
                  // dropped into it, and a class with no one in it yet is a real
                  // state (next term's timetable) rather than a placeholder.
                  await handleSaveSlot({ ...block, patientId: null, branch: activeBranch, department: 'SPED', notes: null, isClass: true })
                }}
              />
            ) : activeSection === 'perday' ? (
              /* `slots` is the branch's full set; the per-department filtering
                 that feeds the boards happens in slotsByStaff, so this passes the
                 unfiltered list — a day total that only counted the selected
                 department would be the wrong number to set a target against. */
              <DeckingPerDay
                slots={slots}
                departments={presentDepts}
                branchName={branchLabel(activeBranch) ?? activeBranch}
                capacity={perDayCapacity}
              />
            ) : filteredStaff.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
                <p style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: '0.875rem' }}>
                  {nameFilter ? `No ${activeDept} staff match "${nameFilter}" in ${activeBranch}` : `No ${activeDept} staff in ${activeBranch}`}
                </p>
                <p style={{ color: 'var(--mid-gray)', fontSize: '0.8rem', marginTop: '0.35rem' }}>Add staff in the Staff Module first.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {filteredStaff.map(s => (
                  <TherapistRow
                    key={s.id}
                    staff={s}
                    activeBranch={activeBranch}
                    config={configMap.get(s.id)}
                    slots={slotsByStaff.get(s.id) ?? []}
                    defaultHours={resolvedDefaultHours}
                    onSaveConfig={handleSaveConfig}
                    onSaveSlot={handleSaveSlot}
                    onDeleteSlot={handleDeleteSlot}
                    onOpenLoa={openLoaForSlot}
                  />
                ))}
              </div>
            )}
            </div>
            {activeSection !== 'all' && activeSection !== 'perday' && activeSection !== 'sped' && activeSection !== 'crosssell' && activeSection !== 'history' && (
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Capacity for the current branch / department / section, in the
                    space this column used to leave empty. Open is derived
                    (total − booked − blocked) rather than counted separately, so
                    the three numbers always add up. */}
                <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', padding: '0.85rem 1rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mid-gray)', marginBottom: '0.6rem' }}>
                    Slots &mdash; {branchLabel(activeBranch) ?? activeBranch} &middot; {activeDept}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {([
                      // Percentages are of TOTAL, named on the tile, so booked and open
                      // read as shares of the same capacity, not of each other.
                      { label: 'Total',  value: slotSummary.total,  fg: '#1F2937', bg: '#F1F3F5', pct: null },
                      { label: 'Booked', value: slotSummary.booked, fg: '#14507F', bg: '#E3EEFB', pct: slotSummary.total > 0 ? Math.round((slotSummary.booked / slotSummary.total) * 100) : null },
                      { label: 'Open',   value: slotSummary.open,   fg: '#166534', bg: '#DFF5E4', pct: slotSummary.total > 0 ? Math.round((slotSummary.open / slotSummary.total) * 100) : null },
                    ]).map(k => (
                      <div key={k.label} style={{ background: k.bg, borderRadius: '0.5rem', padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: k.fg, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: k.fg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                      {k.pct !== null && (
                        <div style={{ fontSize: '0.64rem', fontWeight: 600, color: k.fg, opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{k.pct}% of total</div>
                      )}
                      </div>
                    ))}
                  </div>
                  {slotSummary.blocked > 0 && (
                    /* Named rather than folded into "open": a blocked hour is not
                       capacity anyone can book into. */
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--mid-gray)' }}>
                      {slotSummary.blocked} marked unavailable, not counted as open.
                    </p>
                  )}
                  {slotSummary.total === 0 && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--mid-gray)' }}>
                      No work days configured for this department yet, so there is no capacity to count.
                    </p>
                  )}
                </div>
                {/* Follows the branch toggle above. This used to send 'ALL'
                    whenever the account could see more than one branch, so for
                    any admin the panel ignored the toggle completely: filtering
                    the board to Greenhills still listed East bookings next to
                    it, with an "All Branches" badge contradicting the button
                    that was clearly selected. */}
                <PatientRequestsPanel
                  branch={activeBranch as 'SBEA' | 'SBGH'}
                  service={activeSection}
                  compact
                />
              </div>
            )}
          </div>
        </div>
      )}
      {/* Opening an LOA does a round trip (find-or-create), and the board gives
          no other sign the click registered. */}
      {loaBusy && !loaPanel && (
        <div style={{
          position: 'fixed', bottom: 18, right: 18, zIndex: 60,
          background: '#1C2B30', color: '#fff', borderRadius: 8,
          padding: '0.5rem 0.85rem', fontSize: '0.8rem', fontWeight: 600,
        }}>
          Opening LOA…
        </div>
      )}

      {/* Raised from an HMO cell — see openLoaForSlot. */}
      {loaPanel && (
        <SlotLoaPanel
          loa={loaPanel.loa}
          patientLabel={loaPanel.slot.patient
            ? `${loaPanel.slot.patient.lastName}, ${loaPanel.slot.patient.firstName}`
            : '(slot)'}
          sessionLabel={`${loaPanel.slot.department} · ${loaPanel.slot.dayOfWeek} ${loaPanel.slot.startTime}–${loaPanel.slot.endTime}`}
          onClose={() => setLoaPanel(null)}
        />
      )}
    </div>
  )
}
