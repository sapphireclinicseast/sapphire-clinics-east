'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Plus, X, Settings2, Layers, Ban } from 'lucide-react'
import PatientRequestsPanel from './PatientRequestsPanel'

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_LABEL: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' }
const DAY_SHORT: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }
const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']

const DEFAULT_HOURS: Record<string, { startTime: string; endTime: string }> = {
  SBEA: { startTime: '10:00', endTime: '20:00' },
  SBGH: { startTime: '09:00', endTime: '19:00' },
}
const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StaffMember { id: string; firstName: string; lastName: string; department: string; branch: string }
interface Patient { id: string; firstName: string; lastName: string }
interface TherapistConfig { id: string; staffId: string; workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string }
interface DeckingSlot { id: string; staffId: string; patientId: string | null; patient: Patient | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled: boolean }
interface DayHours { open: boolean; openTime: string; closeTime: string }
type ClinicSchedule = Record<string, DayHours>
type AllClinicHours = Record<string, ClinicSchedule>

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  if (role.startsWith('SBEA_')) return ['SBEA']
  if (role.startsWith('SBGH_')) return ['SBGH']
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
function CustomSlotModal({ staff, workDays, onClose, onSave }: {
  staff: StaffMember
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
    await onSave({ staffId: staff.id, patientId: patient?.id ?? null, dayOfWeek, startTime, endTime, branch: staff.branch, department: staff.department, notes: notes || null })
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
function TherapistRow({ staff, config, slots, defaultHours, onSaveConfig, onSaveSlot, onDeleteSlot }: {
  staff: StaffMember
  config: TherapistConfig | undefined
  slots: DeckingSlot[]
  defaultHours: { startTime: string; endTime: string }
  onSaveConfig: (staffId: string, data: { workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string }) => Promise<void>
  onSaveSlot: (data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled?: boolean }) => Promise<void>
  onDeleteSlot: (id: string) => Promise<void>
}) {
  const [configOpen, setConfigOpen] = useState(!config)
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
    await onSaveConfig(staff.id, { workDays, startTime, endTime, useDefault, branch: staff.branch, department: staff.department })
    setSaving(false)
    if (workDays.length > 0) setConfigOpen(false)
  }

  const configuredDays = config ? (config.workDays as string[]) : []
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
      branch: staff.branch,
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
      branch: staff.branch,
      department: staff.department,
      notes: null,
    })
    setAddingCell(null)
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
                <th style={{ padding: '0.45rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--mid-gray)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #FDE4CC', borderRight: '1px solid #FDE4CC' }}>
                  Time
                </th>
                {configuredDays.map(day => (
                  <th key={day} style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#ED6823', fontSize: '0.78rem', borderBottom: '2px solid #FDE4CC', borderRight: '1px solid #FDE4CC' }}>
                    {DAY_LABEL[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot, idx) => (
                <tr key={slot} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '0.35rem 0.75rem', color: 'var(--mid-gray)', fontSize: '0.72rem', fontWeight: 500, whiteSpace: 'nowrap', borderRight: '1px solid #f3f4f6' }}>
                    {formatTime(slot)}
                  </td>
                  {configuredDays.map(day => {
                    const disabledSlot = getDisabledSlot(day, slot)
                    const cellSlots = getSlotsForCell(day, slot)
                    const isAdding = addingCell?.dayOfWeek === day && addingCell?.startTime === slot

                    // ── Disabled cell ──
                    if (disabledSlot) {
                      return (
                        <td key={day} style={{ padding: '0.25rem 0.4rem', verticalAlign: 'top', borderRight: '1px solid #f3f4f6', background: '#f3f4f6' }}>
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
                    return (
                      <td key={day} style={{ padding: '0.25rem 0.4rem', verticalAlign: 'top', borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {/* Existing patients */}
                          {cellSlots.map(s => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#FFF3E8', border: '1px solid #FDE4CC', borderRadius: '0.3rem', padding: '0.18rem 0.4rem' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ED6823', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '(slot)'}>
                                {s.patient ? `${s.patient.lastName}, ${s.patient.firstName[0]}.` : <span style={{ color: 'var(--mid-gray)' }}>(slot)</span>}
                              </span>
                              <button onClick={() => handleClearSlot(s)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 0, lineHeight: 1, flexShrink: 0 }}
                                title="Remove">
                                <X size={10} />
                              </button>
                            </div>
                          ))}

                          {/* Patient search input (while adding) */}
                          {isAdding && (
                            <PatientCellSearch
                              current={null}
                              onSelect={p => handlePatientSelect(day, slot, p)}
                              onClear={() => setAddingCell(null)}
                              onClose={() => setAddingCell(null)}
                            />
                          )}

                          {/* Add / Disable buttons — shown when < 3 patients and not currently searching */}
                          {!isAdding && cellSlots.length < 3 && (
                            <div style={{ display: 'flex', gap: '2px' }}>
                              <button
                                onClick={() => setAddingCell({ dayOfWeek: day, startTime: slot })}
                                style={{
                                  background: 'transparent',
                                  border: `1px ${cellSlots.length === 0 ? 'dashed' : 'solid'} ${cellSlots.length === 0 ? '#d1d5db' : '#FDE4CC'}`,
                                  borderRadius: '0.3rem',
                                  padding: '0.18rem 0.4rem',
                                  fontSize: '0.7rem',
                                  color: cellSlots.length === 0 ? '#9ca3af' : '#ED6823',
                                  cursor: 'pointer',
                                  flex: 1,
                                  textAlign: 'center',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '2px',
                                }}
                              >
                                <Plus size={9} />
                                {cellSlots.length === 0 ? '' : <span style={{ fontSize: '0.65rem' }}>Add</span>}
                              </button>
                              {cellSlots.length === 0 && (
                                <button
                                  onClick={() => handleDisableSlot(day, slot)}
                                  style={{
                                    background: 'transparent',
                                    border: '1px dashed #d1d5db',
                                    borderRadius: '0.3rem',
                                    padding: '0.18rem 0.35rem',
                                    fontSize: '0.6rem',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '2px',
                                    flexShrink: 0,
                                  }}
                                  title="Disable this slot (e.g. lunch break)"
                                >
                                  <Ban size={8} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
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
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ED6823' }}>{BRANCH_LABEL[branch] ?? branch} — Default Clinic Hours</h3>
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

  // Filtered staff for display
  const branchStaff = staff.filter(s => s.branch === activeBranch && s.department === activeDept)
  const filteredStaff = nameFilter.trim()
    ? branchStaff.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(nameFilter.toLowerCase()))
    : branchStaff

  // Build maps
  const configMap = new Map(configs.map(c => [c.staffId, c]))
  const slotsByStaff = new Map<string, DeckingSlot[]>()
  for (const slot of slots.filter(s => s.department === activeDept)) {
    const arr = slotsByStaff.get(slot.staffId) ?? []
    arr.push(slot)
    slotsByStaff.set(slot.staffId, arr)
  }

  const presentDepts = DEPARTMENTS.filter(d => staff.some(s => s.branch === activeBranch && s.department === d))
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

  async function handleSaveConfig(staffId: string, data: { workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string }) {
    await fetch('/api/decking/therapists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, ...data }),
    })
    await loadBranchData(activeBranch)
  }

  async function handleSaveSlot(data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled?: boolean }) {
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
          {/* Patient appointment requests from client portal */}
          {/* Admin sees all branches merged; branch admins see only their own */}
          <PatientRequestsPanel branch={branches.length > 1 ? 'ALL' : activeBranch as 'SBEA' | 'SBGH'} />
          {/* Controls row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* Branch toggle */}
            {branches.length > 1 && (
              <div style={{ display: 'flex', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--light-gray)' }}>
                {branches.map(b => (
                  <button key={b} onClick={() => { setActiveBranch(b); setNameFilter('') }}
                    style={{ padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeBranch === b ? 'var(--teal)' : '#fff', color: activeBranch === b ? '#fff' : 'var(--mid-gray)' }}>
                    {BRANCH_LABEL[b] ?? b}
                  </button>
                ))}
              </div>
            )}
            {/* Name search */}
            <input
              style={{ border: '1.5px solid rgba(26,123,138,0.3)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', fontSize: '0.82rem', outline: 'none', color: 'var(--charcoal)', minWidth: '180px' }}
              placeholder="Filter by name…"
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
            />
          </div>

          {/* Department chips */}
          {!loadingStaff && presentDepts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {presentDepts.map(d => (
                <button key={d} onClick={() => setActiveDept(d)}
                  style={{ padding: '0.3rem 0.875rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: activeDept === d ? 'none' : '1px solid var(--light-gray)', background: activeDept === d ? '#ED6823' : '#fff', color: activeDept === d ? '#fff' : 'var(--mid-gray)', transition: 'all 0.15s' }}>
                  {d}
                </button>
              ))}
            </div>
          )}

          {/* Staff list */}
          {loadingStaff || loadingData ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--mid-gray)', fontSize: '0.85rem' }}>Loading…</div>
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
                  config={configMap.get(s.id)}
                  slots={slotsByStaff.get(s.id) ?? []}
                  defaultHours={resolvedDefaultHours}
                  onSaveConfig={handleSaveConfig}
                  onSaveSlot={handleSaveSlot}
                  onDeleteSlot={handleDeleteSlot}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
