'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ChevronDown, Plus, X, Settings2, Ban, Search, Users, CalendarCheck, CalendarPlus, Percent, BarChart3, Info, Lock, Loader2, Clock, Rows3, Rows4, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { DashCard, KpiCard, Skeleton, EmptyState, DeptChip, CARD_STYLE } from '../patients/dashboard/ui'
import {
  CONTROL, CONTROL_SM, CONTROL_STYLE, LABEL, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, SUBTLE_BG, TEAL_HEX, DECK_CSS,
  displayName, personLabel, initials, Avatar, PillTabs, ErrorCard, CapacityBar,
} from './ui'
import PatientRequestsPanel from './PatientRequestsPanel'
import { DAY_KEYS, DAY_LABEL, DAY_SHORT, sortDays } from '@/lib/decking-days'
import SlotLoaPanel, { type LoaLite } from './SlotLoaPanel'
import { DECK_SECTIONS, DECK_GROUPS, inSection, arrangementFor, servesSectionAnywhere, slotInSection, isDualTagged, soleDeliveryMode, DELIVERY_MODES, type DeckSection } from '@/lib/work-arrangement'
import DeckingPerDay from './DeckingPerDay'
import SpedClassBoard from './SpedClassBoard'
import InterdepartmentBoard from './InterdepartmentBoard'
import DeckingHistory from './DeckingHistory'
import DepartedBookings from './DepartedBookings'
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
interface TherapistConfig { id: string; staffId: string; workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string; deliveryMode?: string | null }
interface DeckingSlot { id: string; staffId: string; patientId: string | null; patient: Patient | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled: boolean; paymentType?: string; isClass?: boolean; deliveryMode?: string | null }

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
// An open hour is the thing front desk is hunting for, so it stays green and
// labelled ("+ Available") — but as a calm outlined cell rather than a solid
// fill, so a mostly-open week no longer reads as a wall of colour. Green was
// previously GL's colour; GL moved to orange.
const OPEN_BG     = '#F5FBF6'
const OPEN_FG     = '#166534'
const OPEN_BORDER = '#B9DFC4'
const OFF_CELL_BG = '#EEF1F3'   // disabled / not working
// Hatched, so an unavailable hour cannot be mistaken for an empty white one.
const OFF_HATCH   = `repeating-linear-gradient(135deg, ${OFF_CELL_BG} 0 6px, #E5E9EC 6px 12px)`
const GRID_LINE   = '#E3EAE7'

type Density = 'comfortable' | 'compact'
const DENSITY_KEY = 'decking.density'
function payOf(s: DeckingSlot): PayType {
  return (PAY_TYPES as string[]).includes(s.paymentType ?? '') ? (s.paymentType as PayType) : 'CASH'
}
// ── Capacity card ────────────────────────────────────────────────────────────
// The total / booked / open counts now sit in the KPI row above the board, so
// this card carries what the KPIs cannot: the three buckets to scale (a board
// that is mostly unavailable looks mostly grey, which no arrangement of
// numerals conveys as fast) and what the booked hours are being paid for —
// the number that decides whether the branch is waiting on letters of
// authorization or taking money at the desk.
interface SlotSummary {
  total: number
  booked: number
  blocked: number
  open: number
  pay: Record<PayType | 'MIXED', number>
}

function SlotSummaryCard({ title, summary }: { title: React.ReactNode; summary: SlotSummary }) {
  const { total, booked, blocked, open, pay } = summary
  const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  // Mixed is only shown when it happens — a permanent zero would invite the
  // question of what it is on every board that never has one.
  const mix = ([
    { key: 'CASH'  as const, label: 'Cash', bg: PAY_STYLE.CASH.border, fg: PAY_STYLE.CASH.fg },
    { key: 'HMO'   as const, label: 'HMO',  bg: PAY_STYLE.HMO.border,  fg: PAY_STYLE.HMO.fg },
    { key: 'GL'    as const, label: 'GL',   bg: PAY_STYLE.GL.border,   fg: PAY_STYLE.GL.fg },
    { key: 'MIXED' as const, label: 'Mixed', bg: '#CBD5E1', fg: '#475569' },
  ]).filter(m => m.key !== 'MIXED' || pay.MIXED > 0)

  return (
    <DashCard title="Capacity" icon={<BarChart3 size={15} />} description={title}>
      {total === 0 ? (
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          No work days configured for this department yet, so there is no capacity to count.
        </p>
      ) : (
        <>
          <CapacityBar booked={booked} open={open} blocked={blocked} height={8} />
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--charcoal)' }}>
            {([
              { label: 'Booked', n: booked, c: '#7FB2E5' },
              { label: 'Open', n: open, c: '#9AD7AB' },
              { label: 'Unavailable', n: blocked, c: '#D2D7DC' },
            ]).map(k => (
              <span key={k.label} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: k.c }} />
                {k.label}
                <span className="font-bold tabular-nums">{k.n}</span>
                <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>{pctOf(k.n)}%</span>
              </span>
            ))}
          </div>
          {blocked > 0 && (
            /* Named rather than folded into "open": a blocked hour is not
               capacity anyone can book into. */
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {blocked} marked unavailable, not counted as open.
            </p>
          )}
        </>
      )}

      {booked > 0 && (
        <div className="mt-4 pt-3.5" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--mid-gray)' }}>
            Booked hours by payment
          </p>
          <div className="flex overflow-hidden rounded-full mb-2.5" style={{ height: 8 }}>
            {mix.filter(m => pay[m.key] > 0).map(m => (
              <div key={m.key} title={`${m.label}: ${pay[m.key]}`}
                style={{ width: `${(pay[m.key] / booked) * 100}%`, background: m.bg }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {mix.map(m => (
              <span key={m.key} className="inline-flex items-baseline gap-1.5 text-xs" style={{ color: 'var(--charcoal)' }}>
                <span className="self-center inline-block w-2.5 h-2.5 rounded-sm" style={{ background: m.bg }} />
                <span className="font-bold" style={{ color: m.fg }}>{m.label}</span>
                <span className="font-extrabold tabular-nums">{pay[m.key]}</span>
                <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                  {Math.round((pay[m.key] / booked) * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </DashCard>
  )
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

// Everyone sees both boards. A patient gets coordinated across branches, and
// front desk cannot do that while the other branch's week is hidden from them.
// What changes across branches is EDITING, not looking — see homeBranch below
// and canWriteSlot on the server, which is what actually enforces it.
function visibleBranches(_role: string): string[] {
  return ['SBEA', 'SBGH']
}

/**
 * Does this consultant belong on the roster for this branch + section?
 *
 * On-site and Homecare are cut by branch — those sessions occupy a room or a
 * travel radius that belongs to one clinic. Teletherapy is not: a remote
 * session can be run for either branch's patients, so that board lists every
 * teletherapy-tagged consultant from both branches, and each one carries a
 * separate set of days per branch (see the Configure panel).
 *
 * "All" deliberately skips the arrangement test entirely: untagged, hybrid and
 * WFH consultants match no service section, so All is the only board they
 * appear on. Filtering them everywhere would drop most of the roster off
 * Decking while HR tagging catches up.
 */
function onThisRoster(s: StaffMember, branch: string, section: DeckSection): boolean {
  const here = s.branch === branch || (s.extraBranches ?? []).includes(branch)
  if (section === 'all') return here
  if (section === 'teletherapy') return servesSectionAnywhere(s, 'teletherapy')
  return here && inSection(arrangementFor(s, branch), section)
}

/** The branch this role decks for, or null for an unrestricted admin. */
function homeBranch(role: string): string | null {
  if (role.startsWith('SBEA_') || role.startsWith('AHEA_')) return 'SBEA'
  if (role.startsWith('SBGH_') || role.startsWith('AHGH_')) return 'SBGH'
  return null
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
    <div style={{ position: 'relative', minWidth: '120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <input
          ref={inputRef}
          aria-label="Search patient"
          style={{ border: '1.5px solid var(--teal)', borderRadius: '0.4rem', padding: '0.2rem 0.45rem', fontSize: '0.75rem', flex: 1, outline: 'none', minWidth: 0, background: '#fff', color: 'var(--charcoal)', boxShadow: '0 0 0 3px rgba(26,123,138,0.12)' }}
          placeholder="Search patient…"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onBlur={() => setTimeout(() => { setOpen(false); onClose() }, 200)}
          autoComplete="off"
        />
        {current && (
          <button type="button" onClick={onClear} aria-label="Clear" style={{ color: '#DC2626', fontSize: '0.8rem', lineHeight: 1, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem' }}>
            <X size={12} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 50, background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', top: 'calc(100% + 2px)', left: 0, right: 0, minWidth: 180, maxHeight: '150px', overflowY: 'auto' }}>
          {results.map(p => (
            <button key={p.id} type="button"
              className="hover:bg-gray-50"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.35rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', color: 'var(--charcoal)' }}
              onMouseDown={() => { onSelect(p); setOpen(false) }}>
              {personLabel(p)}
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

  const inputStyle: React.CSSProperties = { ...CONTROL_STYLE, width: '100%' }
  const fieldClass = `${CONTROL} w-full`
  const labelStyle: React.CSSProperties = { color: 'var(--mid-gray)' }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={`custom-slot-${staff.id}`}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div className="w-full max-w-[420px] rounded-xl" style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="min-w-0">
            <h3 id={`custom-slot-${staff.id}`} className="text-[15px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Add custom slot
            </h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>{personLabel(staff)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="dk-icon-btn rounded-md p-1" style={{ color: 'var(--mid-gray)' }}><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <div className="col-span-2">
            <label className={LABEL} style={labelStyle} htmlFor={`cs-day-${staff.id}`}>Day</label>
            <select id={`cs-day-${staff.id}`} className={fieldClass} style={inputStyle} value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
              {(workDays.length > 0 ? workDays : DAYS).map(d => (
                <option key={d} value={d}>{DAY_LABEL[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} style={labelStyle} htmlFor={`cs-start-${staff.id}`}>Start time</label>
            <input id={`cs-start-${staff.id}`} type="time" step="900" className={fieldClass} style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className={LABEL} style={labelStyle} htmlFor={`cs-end-${staff.id}`}>End time</label>
            <input id={`cs-end-${staff.id}`} type="time" step="900" className={fieldClass} style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div className="col-span-2 relative">
            <label className={LABEL} style={labelStyle} htmlFor={`cs-patient-${staff.id}`}>Patient (optional)</label>
            <input
              id={`cs-patient-${staff.id}`}
              className={fieldClass}
              style={inputStyle}
              placeholder="Search patient name…"
              value={query}
              onChange={e => handlePatientInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              autoComplete="off"
            />
            {showResults && results.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 60, background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', top: 'calc(100% + 2px)', left: 0, right: 0, maxHeight: '150px', overflowY: 'auto' }}>
                {results.map(p => (
                  <button key={p.id} type="button"
                    className="hover:bg-gray-50"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', color: 'var(--charcoal)' }}
                    onMouseDown={() => { setPatient(p); setQuery(`${p.lastName}, ${p.firstName}`); setShowResults(false) }}>
                    {personLabel(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-2">
            <label className={LABEL} style={labelStyle} htmlFor={`cs-notes-${staff.id}`}>Notes (optional)</label>
            <input id={`cs-notes-${staff.id}`} className={fieldClass} style={inputStyle} placeholder="e.g. Group session, home program…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, borderRadius: '0 0 0.75rem 0.75rem' }}>
          <button type="button" onClick={onClose} className={BTN_SECONDARY} style={CONTROL_STYLE}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !dayOfWeek || !startTime || !endTime}
            className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Add slot'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Therapist Row ─────────────────────────────────────────────────────────────
function TherapistRow({ staff, activeBranch, sectionMode, config, slots, defaultHours, onSaveConfig, onClearServiceConfig, onSaveSlot, onDeleteSlot, onOpenLoa, density = 'comfortable', collapsed = false, onToggleCollapse }: {
  staff: StaffMember
  /** Row height / padding of the grid. Display only. */
  density?: Density
  /** Header-only card: the grid and config panel are hidden. Display only. */
  collapsed?: boolean
  onToggleCollapse?: () => void
  activeBranch: string
  /** The service this board is showing, or null on an aggregate view. */
  sectionMode: string | null
  config: TherapistConfig | undefined
  slots: DeckingSlot[]
  defaultHours: { startTime: string; endTime: string }
  onSaveConfig: (staffId: string, data: { workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string; deliveryMode?: string | null }) => Promise<void>
  /** Drop this service's own days so it follows the general schedule again. */
  onClearServiceConfig: (staffId: string, branch: string, deliveryMode: string) => Promise<void>
  onSaveSlot: (data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled?: boolean; isClass?: boolean; deliveryMode?: string | null }) => Promise<void>
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
  // Set when a patient is picked for a dual-tagged consultant: the booking waits
  // here until the kind of session is chosen. Asking after the patient — rather
  // than before — keeps the common path (search, pick, done) unchanged for the
  // consultants who only do one thing.
  const [pendingPatient, setPendingPatient] = useState<
    { dayOfWeek: string; slotTime: string; patient: Patient } | null
  >(null)
  const dualTagged = isDualTagged(arrangementFor(staff, activeBranch))

  function onPatientPicked(dayOfWeek: string, slotTime: string, patient: Patient) {
    // Only ask when the board itself cannot answer. On a service board the
    // section IS the answer — booking under Teletherapy is a teletherapy
    // session — so asking there was both a pointless click and a trap: picking
    // "On-site" filed the session onto a board the operator was not looking at,
    // and across branches the server refused it outright.
    if (dualTagged && !sectionMode) setPendingPatient({ dayOfWeek, slotTime, patient })
    else void handlePatientSelect(dayOfWeek, slotTime, patient)
  }

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
    // Saved against the SERVICE being viewed. Configuring while On-site is on
    // screen writes the on-site days; doing it under Teletherapy writes
    // teletherapy's, leaving the clinic days alone. Aggregate views have no
    // single service, so they write the general schedule.
    await onSaveConfig(staff.id, {
      workDays, startTime, endTime, useDefault,
      branch: activeBranch, department: staff.department,
      deliveryMode: sectionMode,
    })
    setSaving(false)
    if (workDays.length > 0) setConfigOpen(false)
  }

  // Calendar order, not the order the checkboxes were saved in — that is what
  // put Friday before Thursday on a consultant's board.
  const configuredDays = config ? sortDays(config.workDays as string[]) : []

  // The service this panel writes, and whether this consultant already has a
  // row for it. `config` is the resolved schedule — a service row if one
  // exists, otherwise the general one — so its own deliveryMode is what says
  // which of the two is on screen.
  const serviceLabel = DELIVERY_MODES.find(m => m.key === sectionMode)?.label ?? null
  const isHomeBranch = staff.branch === activeBranch || (staff.extraBranches ?? []).includes(activeBranch)
  const hasServiceRow = !!sectionMode && config?.deliveryMode === sectionMode

  async function resetToGeneral() {
    if (!sectionMode) return
    await onClearServiceConfig(staff.id, activeBranch, sectionMode)
    setConfigOpen(false)
  }

  // Asked once per booking, only for a consultant who serves more than one
  // section. Rendered inline rather than as a modal so the answer sits next to
  // the grid the booking was just made on.
  const modePrompt = pendingPatient && (
    <div role="group" aria-label="Choose the kind of session" className="flex flex-wrap items-center gap-2 px-4 py-2.5"
      style={{ background: '#FFF7E6', borderBottom: '1px solid #F3D9A5' }}>
      <span className="text-[13px]" style={{ color: '#8A5A00' }}>
        <strong>{personLabel(pendingPatient.patient)}</strong>{' '}
        at {formatTime(pendingPatient.slotTime)} &mdash; which kind of session?
      </span>
      {DELIVERY_MODES.filter(m => inSection(arrangementFor(staff, activeBranch), m.section)).map(m => (
        <button key={m.key} type="button"
          onClick={() => handlePatientSelect(pendingPatient.dayOfWeek, pendingPatient.slotTime, pendingPatient.patient, m.key)}
          className="h-7 px-3 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--teal)' }}>
          {m.label}
        </button>
      ))}
      <button type="button" onClick={() => setPendingPatient(null)}
        className="text-xs underline" style={{ color: '#8A5A00' }}>
        Cancel
      </button>
    </div>
  )
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
      // Blocking an hour is a write like any other, so it has to say which
      // service it belongs to. Without this it arrived unclassified and the
      // cross-branch check refused it — the other branch's teletherapy board
      // was editable for bookings but not for blocking out an hour.
      deliveryMode: sectionMode ?? soleDeliveryMode(arrangementFor(staff, activeBranch)),
    })
  }

  async function handleEnableSlot(disabledSlot: DeckingSlot) {
    await onDeleteSlot(disabledSlot.id)
  }

  async function handlePatientSelect(
    dayOfWeek: string, slotTime: string, patient: Patient, mode?: string | null,
  ) {
    await onSaveSlot({
      staffId: staff.id,
      patientId: patient.id,
      dayOfWeek,
      startTime: slotTime,
      endTime: addHour(slotTime),
      branch: activeBranch,
      department: staff.department,
      notes: null,
      // In order: the answer to the prompt, then the service board being
      // viewed, then the consultant's own single section. Only when all three
      // are silent — an aggregate board, a dual-tagged consultant, prompt
      // cancelled — does this stay unclassified.
      deliveryMode: mode ?? sectionMode ?? soleDeliveryMode(arrangementFor(staff, activeBranch)),
    })
    setAddingCell(null)
    setPendingPatient(null)
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

  // Custom slots (non-hourly — those not matching hourly start times)
  const hourlyStartSet = new Set(timeSlots)
  const customSlots = slots.filter(s => !hourlyStartSet.has(s.startTime))

  // "x of y booked" for the card header. Walks the same cells the grid draws
  // and classifies them the way the cell does (disabled wins, then any
  // occupant, else open) — the same rule as the page's capacity summary, so a
  // card and the totals above it can never disagree.
  const util = (() => {
    let total = 0, booked = 0, blocked = 0
    if (!config) return { total, booked, blocked, open: 0 }
    const byCell = new Map<string, DeckingSlot[]>()
    for (const r of slots.filter(sl => !sl.isClass)) {
      const key = `${r.dayOfWeek}|${r.startTime}`
      byCell.set(key, [...(byCell.get(key) ?? []), r])
    }
    for (const day of ((config.workDays as string[]) ?? [])) {
      for (const hour of timeSlots) {
        total++
        const cell = byCell.get(`${day}|${hour}`) ?? []
        if (cell.some(r => r.disabled)) blocked++
        else if (cell.length > 0) booked++
      }
    }
    return { total, booked, blocked, open: total - booked - blocked }
  })()
  const utilPct = util.total > 0 ? Math.round((util.booked / util.total) * 100) : 0

  const compact = density === 'compact'
  const rowH = compact ? 28 : 36          // every hour row is the same height
  const innerH = rowH - 6                 // cell content inside its 3px padding
  const TIME_COL = 72
  const DAY_COL_MIN = 132                 // below this the grid scrolls sideways
  const nameText = personLabel(staff)
  const showBody = !collapsed

  const tdBase: React.CSSProperties = {
    padding: 3, verticalAlign: 'middle', height: rowH,
    borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`,
  }
  const thBase: React.CSSProperties = {
    position: 'sticky', top: 0, background: '#F3F6F5',
    padding: compact ? '0.3rem 0.5rem' : '0.45rem 0.6rem',
    borderRight: `1px solid ${GRID_LINE}`, borderBottom: '1px solid var(--light-gray)',
  }
  const miniBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.7)', borderRadius: 4,
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.03em',
    padding: '0 4px', cursor: 'pointer', flexShrink: 0, lineHeight: 1.7,
  }

  function toggleConfig() {
    // Opening Configure on a collapsed card expands it, or the panel would
    // open somewhere the user cannot see.
    if (collapsed) { onToggleCollapse?.(); setConfigOpen(true); return }
    setConfigOpen(o => !o)
  }

  return (
    <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE} aria-label={nameText}>
      {/* Header */}
      <header className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
        style={{ borderBottom: showBody ? '1px solid var(--light-gray)' : 'none' }}>
        <Avatar text={initials(staff.firstName, staff.lastName)} size={compact ? 28 : 34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <h3 className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--charcoal)' }}
              title={`${staff.lastName}, ${staff.firstName}`}>
              {nameText}
            </h3>
            <DeptChip code={staff.department} color={TEAL_HEX} />
            {/* A teletherapy consultant based at the other branch. Says so
                plainly — front desk are otherwise booking someone they have
                never seen on this board with nothing explaining why she is
                here, or which branch to coordinate with. */}
            {!isHomeBranch && (
              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded leading-none uppercase tracking-wide"
                style={{ background: '#EFE4FA', color: '#5B2A86' }}>
                {branchLabel(staff.branch) ?? staff.branch}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 flex items-center gap-1 min-w-0" style={{ color: 'var(--mid-gray)' }}>
            {config && configuredDays.length > 0 ? (
              <>
                <Clock size={11} className="flex-shrink-0" />
                <span className="truncate">
                  {configuredDays.map(d => DAY_SHORT[d]).join(' · ')}
                  {' · '}{formatTime(config.startTime)} – {formatTime(config.endTime)}
                </span>
              </>
            ) : config ? 'No work days set' : 'Schedule not set up yet'}
          </p>
        </div>

        {util.total > 0 && (
          <div className="order-last w-full sm:order-none sm:w-44"
            title={`${util.booked} booked · ${util.open} open · ${util.blocked} unavailable`}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>
              <span>
                <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{util.booked}</strong> of{' '}
                <span className="tabular-nums">{util.total}</span> booked
              </span>
              <span className="tabular-nums font-semibold">{utilPct}%</span>
            </div>
            <CapacityBar booked={util.booked} open={util.open} blocked={util.blocked} />
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button type="button" onClick={toggleConfig} aria-expanded={configOpen && showBody}
            className={BTN_SM}
            style={configOpen && showBody
              ? { background: 'var(--pale-teal)', color: 'var(--teal)', border: '1px solid var(--teal)' }
              : { ...CONTROL_STYLE, color: 'var(--charcoal)' }}>
            <Settings2 size={13} />
            <span className="hidden sm:inline">Configure</span>
            <ChevronDown size={12} className="transition-transform" style={{ transform: configOpen && showBody ? 'rotate(180deg)' : 'none' }} />
          </button>
          {onToggleCollapse && (
            <button type="button" onClick={onToggleCollapse} aria-expanded={showBody}
              aria-label={showBody ? `Collapse ${nameText}` : `Expand ${nameText}`}
              title={showBody ? 'Collapse' : 'Expand'}
              className="dk-icon-btn inline-flex items-center justify-center h-8 w-8 rounded-lg focus-visible:outline-2"
              style={{ color: 'var(--mid-gray)' }}>
              <ChevronDown size={16} className="transition-transform" style={{ transform: showBody ? 'rotate(180deg)' : 'none' }} />
            </button>
          )}
        </div>
      </header>

      {/* Config panel */}
      {showBody && configOpen && (
        <div className="px-4 py-4 space-y-4" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
          {/* Work days */}
          <div>
            {/* Which schedule this panel writes. Without it the days look like
                one setting per consultant, and someone setting teletherapy days
                would believe they had changed the clinic days too. */}
            <div className="flex flex-wrap items-baseline gap-2 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                {serviceLabel ? `${serviceLabel} days — ${branchLabel(activeBranch) ?? activeBranch}` : 'Work days — all services'}
              </p>
              {hasServiceRow && (
                <button type="button" onClick={resetToGeneral}
                  className="text-[11px] font-semibold underline" style={{ color: '#8A5A00' }}>
                  use the general schedule instead
                </button>
              )}
            </div>
            {serviceLabel && !hasServiceRow && (
              <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                Following the general schedule. Saving here sets {serviceLabel.toLowerCase()} days
                for {branchLabel(activeBranch) ?? activeBranch} only — the other services keep theirs.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Work days">
              {DAYS.map(day => {
                const checked = workDays.includes(day)
                return (
                  <label key={day}
                    className="inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer select-none transition-colors focus-within:ring-2 focus-within:ring-offset-1"
                    style={checked
                      ? { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }
                      : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={e => setWorkDays(e.target.checked ? [...workDays, day] : workDays.filter(d => d !== day))}
                    />
                    {DAY_SHORT[day]}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Working hours */}
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Working hours</p>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                <input
                  type="checkbox"
                  checked={useDefault}
                  onChange={e => handleUseDefaultToggle(e.target.checked)}
                  style={{ accentColor: 'var(--teal)', width: 14, height: 14 }}
                />
                Use clinic default hours
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                aria-label="Start time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                disabled={useDefault}
                className={CONTROL_SM}
                style={{ ...CONTROL_STYLE, opacity: useDefault ? 0.55 : 1, cursor: useDefault ? 'not-allowed' : 'default' }}
              />
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
              <input
                type="time"
                aria-label="End time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                disabled={useDefault}
                className={CONTROL_SM}
                style={{ ...CONTROL_STYLE, opacity: useDefault ? 0.55 : 1, cursor: useDefault ? 'not-allowed' : 'default' }}
              />
              {!useDefault && startTime && endTime && (
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  ({generateHourlySlots(startTime, endTime).length} slots)
                </span>
              )}
            </div>
          </div>

          <button type="button" onClick={saveConfig} disabled={saving}
            className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      )}

      {/* No config yet */}
      {showBody && !config && !configOpen && (
        <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
          Use <strong>Configure</strong> to set up this therapist&apos;s work schedule.
        </p>
      )}

      {/* No work days configured */}
      {showBody && config && configuredDays.length === 0 && (
        <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
          No work days set. Use <strong>Configure</strong> to add work days.
        </p>
      )}

      {showBody && modePrompt}

      {/* Weekly decking table */}
      {showBody && config && configuredDays.length > 0 && (
        <div>
          {/* Scrolls sideways on narrow screens with the TIME column pinned,
              and vertically inside the card (header row pinned) only when a
              very long day would otherwise push the page. */}
          <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
            <table style={{
              width: '100%', minWidth: TIME_COL + configuredDays.length * DAY_COL_MIN,
              borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem', tableLayout: 'fixed',
            }}>
              <colgroup>
                <col style={{ width: TIME_COL }} />
                {configuredDays.map(d => <col key={d} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={{
                    ...thBase, left: 0, zIndex: 3, textAlign: 'left',
                    fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mid-gray)',
                  }}>
                    Time
                  </th>
                  {configuredDays.map(day => (
                    <th key={day} scope="col" style={{ ...thBase, zIndex: 2, textAlign: 'center', fontSize: '0.74rem', fontWeight: 700, color: 'var(--charcoal)' }}>
                      <span className="hidden sm:inline">{DAY_LABEL[day]}</span>
                      <span className="sm:hidden">{DAY_SHORT[day]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map(slot => (
                  <tr key={slot}>
                    <th scope="row" style={{
                      position: 'sticky', left: 0, zIndex: 1, background: '#F8FAF9',
                      padding: '0 0.6rem', textAlign: 'left', whiteSpace: 'nowrap',
                      color: 'var(--mid-gray)', fontSize: '0.68rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      borderRight: '1px solid var(--light-gray)', borderBottom: `1px solid ${GRID_LINE}`, height: rowH,
                    }}>
                      {formatTime(slot)}
                    </th>
                    {configuredDays.map(day => {
                      const disabledSlot = getDisabledSlot(day, slot)
                      const cellSlots = getSlotsForCell(day, slot)
                      const isAdding = addingCell?.dayOfWeek === day && addingCell?.startTime === slot
                      const where = `${DAY_LABEL[day] ?? day} ${formatTime(slot)}`

                      // ── Disabled cell ──
                      // Hatched + icon, so it reads as "not bookable" rather
                      // than as an empty white hour.
                      if (disabledSlot) {
                        const why = disabledSlot.notes || 'Unavailable'
                        return (
                          <td key={day} className="dk-cell" style={{ ...tdBase, background: OFF_HATCH }}>
                            <div className="flex items-center gap-1.5 px-1.5 min-w-0" style={{ minHeight: innerH, color: '#6B7785' }}
                              title={`${why} — ${where}`}>
                              <Ban size={11} className="flex-shrink-0" aria-hidden />
                              <span className="truncate text-[11px] font-semibold">{why}</span>
                              <button type="button"
                                onClick={() => handleEnableSlot(disabledSlot)}
                                className="dk-btn dk-reveal dk-icon-btn ml-auto rounded p-0.5 flex-shrink-0"
                                style={{ color: '#5A6470' }}
                                title="Re-enable this slot"
                                aria-label={`Re-enable ${where}`}
                              >
                                <X size={11} />
                              </button>
                            </div>
                          </td>
                        )
                      }

                      // ── Normal cell ──
                      // One line per patient, no stacked Add button underneath:
                      // that button was why every occupied hour was two rows
                      // tall. Adding a second patient is the exception, so it
                      // is a small "+" beside the last patient instead.
                      const empty = cellSlots.length === 0
                      return (
                        <td key={day} className="dk-cell" style={tdBase}>
                          {isAdding ? (
                            <PatientCellSearch
                              current={null}
                              onSelect={p => onPatientPicked(day, slot, p)}
                              onClear={() => setAddingCell(null)}
                              onClose={() => setAddingCell(null)}
                            />
                          ) : empty ? (
                            /* An empty cell is one click to fill. The block
                               control sits at the edge, and only appears on
                               hover/focus, so it can't be hit by accident when
                               aiming for the cell. */
                            <div className="dk-open flex items-stretch rounded-md min-w-0"
                              style={{ minHeight: innerH, background: OPEN_BG, border: `1px dashed ${OPEN_BORDER}` }}>
                              <button type="button"
                                onClick={() => setAddingCell({ dayOfWeek: day, startTime: slot })}
                                title="Add patient to this open slot"
                                aria-label={`Add patient — ${where}`}
                                className="dk-btn flex-1 min-w-0 flex items-center gap-1 px-1.5 text-left text-[11px] font-semibold"
                                style={{ color: OPEN_FG, cursor: 'pointer' }}>
                                <Plus size={11} className="flex-shrink-0" aria-hidden />
                                <span className="truncate">Available</span>
                              </button>
                              <button type="button"
                                onClick={() => handleDisableSlot(day, slot)}
                                title="Mark unavailable (break, blocked hour)"
                                aria-label={`Mark ${where} unavailable`}
                                className="dk-btn dk-reveal flex items-center px-1.5 flex-shrink-0"
                                style={{ color: OPEN_FG, cursor: 'pointer' }}>
                                <Ban size={11} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {cellSlots.map((s2, idx) => {
                                const pay = payOverride[s2.id] ?? payOf(s2)
                                const st = PAY_STYLE[pay]
                                const fullName = s2.patient ? personLabel(s2.patient) : '(slot)'
                                const initial = (s2.patient?.firstName ?? '').trim().charAt(0).toUpperCase()
                                const shortName = s2.patient
                                  ? (initial ? `${displayName(s2.patient.lastName)}, ${initial}.` : displayName(s2.patient.lastName))
                                  : '(slot)'
                                const isLast = idx === cellSlots.length - 1
                                return (
                                  <div key={s2.id} className="dk-booked flex items-center gap-1 rounded-md pl-1.5 pr-1 min-w-0"
                                    style={{ background: st.bg, color: st.fg, borderLeft: `3px solid ${st.border}`, minHeight: innerH }}>
                                    <span className="flex-1 min-w-0 truncate text-[11.5px] font-semibold" title={fullName}>
                                      {shortName}
                                    </span>
                                    {/* Payment type drives who gets chased for
                                        paperwork, so it stays visible. */}
                                    <select
                                      value={pay}
                                      onChange={e => handlePayChange(s2, e.target.value as PayType)}
                                      title="Payment type"
                                      aria-label={`Payment type for ${fullName}`}
                                      className="dk-btn"
                                      style={{
                                        ...miniBtn,
                                        appearance: 'none', WebkitAppearance: 'none',
                                        border: `1px solid ${st.border}`, color: st.fg,
                                      }}>
                                      {PAY_TYPES.map(t => <option key={t} value={t}>{PAY_STYLE[t].label}</option>)}
                                    </select>
                                    {/* An HMO session cannot proceed without an
                                        approved LOA on file, so the letter is
                                        raised from the slot that needs it rather
                                        than re-keyed in another module. Shown only
                                        for HMO — cash and GL do not use one. */}
                                    {pay === 'HMO' && (
                                      <button type="button"
                                        onClick={() => onOpenLoa?.(s2)}
                                        title="Letter of Authorization for this session"
                                        className="dk-btn"
                                        style={{ ...miniBtn, border: `1px solid ${st.border}`, color: st.fg, fontWeight: 800 }}>
                                        LOA
                                      </button>
                                    )}
                                    {isLast && cellSlots.length < 3 && (
                                      <button type="button"
                                        onClick={() => setAddingCell({ dayOfWeek: day, startTime: slot })}
                                        title="Add another patient to this hour"
                                        aria-label={`Add another patient — ${where}`}
                                        className="dk-btn dk-reveal dk-icon-btn rounded p-0.5 flex-shrink-0"
                                        style={{ color: st.fg }}>
                                        <Plus size={11} />
                                      </button>
                                    )}
                                    <button type="button" onClick={() => handleClearSlot(s2)}
                                      className="dk-btn dk-reveal dk-icon-btn rounded p-0.5 flex-shrink-0"
                                      style={{ color: '#B0453A' }}
                                      title="Remove"
                                      aria-label={`Remove ${fullName} from ${where}`}>
                                      <X size={11} />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Custom slots — one row per slot. Kept outside the scrolling grid
              so the row (and its remove button) stays on screen on a phone. */}
          {customSlots.length > 0 && (
            <div style={{ borderTop: '1px solid var(--light-gray)' }}>
              <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                Custom slots <span className="tabular-nums font-normal">· {customSlots.length}</span>
              </p>
              <ul>
                {[...customSlots]
                  .sort((x, y) => (DAY_KEYS.indexOf(x.dayOfWeek) - DAY_KEYS.indexOf(y.dayOfWeek)) || String(x.startTime).localeCompare(String(y.startTime)))
                  .map(slot => (
                  <li key={slot.id} className="px-4 py-2 transition-colors hover:bg-gray-50/70" style={{ borderTop: '1px solid #EEF2F1' }}>
                    {/* One row per custom slot: the whole slot is laid out
                        across the row. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', minWidth: 0 }}>
                      <span
                        title={DAY_LABEL[slot.dayOfWeek] || slot.dayOfWeek}
                        style={{ flex: '0 0 auto', minWidth: '2.6rem', textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--teal)', background: 'var(--pale-teal)', border: '1px solid var(--light-gray)', borderRadius: '999px', padding: '0.1rem 0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                      >
                        {DAY_SHORT[slot.dayOfWeek] || slot.dayOfWeek}
                      </span>
                      <span style={{ flex: '0 0 auto', fontSize: '0.78rem', fontWeight: 600, color: 'var(--charcoal)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                      </span>
                      <span
                        title={slot.patient ? personLabel(slot.patient) : undefined}
                        style={{ flex: '1 1 auto', minWidth: 0, fontSize: '0.78rem', color: slot.patient ? 'var(--charcoal)' : 'var(--mid-gray)', fontStyle: slot.patient ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {slot.patient ? personLabel(slot.patient) : 'No patient'}
                        {slot.notes && <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--mid-gray)', fontStyle: 'normal' }}>· {slot.notes}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteSlot(slot.id)}
                        className="dk-icon-btn dk-btn"
                        style={{ flex: '0 0 auto', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', borderRadius: '0.4rem', cursor: 'pointer', color: '#DC2626' }}
                        title="Remove custom slot"
                        aria-label="Remove custom slot"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom slot button */}
          <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
            <button type="button" onClick={() => setShowCustomModal(true)}
              className={BTN_SM}
              style={{ background: '#fff', border: '1px dashed var(--teal)', color: 'var(--teal)' }}>
              <Plus size={12} /> Custom slot
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
    </section>
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

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
      {['SBEA', 'SBGH'].map(branch => (
        <DashCard
          key={branch}
          title={`${branchLabel(branch) ?? branch}`}
          icon={<Clock size={15} />}
          description="Default clinic hours. Therapists set to “use clinic default hours” follow these."
          action={
            <button
              type="button"
              onClick={() => handleSave(branch)}
              disabled={saving === branch}
              className={BTN_PRIMARY}
              style={{ background: saved === branch ? '#16A34A' : 'var(--teal)', height: '2rem', fontSize: '0.78rem' }}
            >
              {saving === branch ? 'Saving…' : saved === branch ? 'Saved ✓' : 'Save'}
            </button>
          }
        >
          <div className="-my-1">
            {DAYS.map(day => {
              const dayData = data[branch]?.[day] ?? { open: false, openTime: '10:00', closeTime: '20:00' }
              return (
                <div key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2" style={{ borderBottom: '1px solid #EEF2F1' }}>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ width: '5.5rem', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={dayData.open}
                      onChange={e => update(branch, day, 'open', e.target.checked)}
                      style={{ accentColor: 'var(--teal)', width: 14, height: 14, flexShrink: 0 }}
                    />
                    <span className="text-sm font-medium" style={{ color: dayData.open ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                      {DAY_SHORT[day]}
                    </span>
                  </label>
                  {dayData.open ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input type="time" aria-label={`${DAY_LABEL[day]} opening time`} value={dayData.openTime} onChange={e => update(branch, day, 'openTime', e.target.value)} className={CONTROL_SM} style={CONTROL_STYLE} />
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
                      <input type="time" aria-label={`${DAY_LABEL[day]} closing time`} value={dayData.closeTime} onChange={e => update(branch, day, 'closeTime', e.target.value)} className={CONTROL_SM} style={CONTROL_STYLE} />
                    </div>
                  ) : (
                    <span className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>Closed</span>
                  )}
                </div>
              )
            })}
          </div>
        </DashCard>
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

  // Viewing another branch's board. Face-to-face sessions there belong to that
  // branch's rooms, so they are read-only here; teletherapy is not tied to a
  // room and stays editable from either side. The server enforces the same rule
  // — this only keeps the UI from offering an action that would be refused.
  const myBranch = homeBranch(role)
  const viewingOtherBranch = !!myBranch && myBranch !== activeBranch
  const readOnlyHere = viewingOtherBranch && activeSection !== 'teletherapy'

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
  // Which branch the configs/slots in state belong to. The board shows a
  // skeleton until it matches the branch selected, and otherwise stays on
  // screen during a refresh (after saving a schedule) instead of being torn
  // down and rebuilt — which used to flash the page and lose the scroll.
  const [loadedBranch, setLoadedBranch] = useState<string | null>(null)
  const [staffError, setStaffError] = useState(false)
  const [dataError, setDataError] = useState(false)
  // Only the latest branch request may write state: switching branches
  // quickly could otherwise let a slow East response land on the Greenhills board.
  const branchReq = useRef(0)

  // Display preferences — this viewer only, never shared or sent anywhere.
  const [density, setDensityState] = useState<Density>('comfortable')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DENSITY_KEY)
      if (v === 'compact' || v === 'comfortable') setDensityState(v)
    } catch { /* storage unavailable — keep the default */ }
  }, [])
  function setDensity(d: Density) {
    setDensityState(d)
    try { window.localStorage.setItem(DENSITY_KEY, d) } catch { /* ignore */ }
  }
  function toggleCollapsed(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Load staff + clinic hours on mount
  const loadStaff = useCallback(async () => {
    setLoadingStaff(true)
    setStaffError(false)
    try {
      const [staffData, hoursData] = await Promise.all([
        // Not /api/staff — that route is scoped to the caller's own branch, so a
        // branch account got an empty roster the moment it switched to the other
        // branch's board. /api/decking/staff returns both branches, limited to
        // the columns a schedule grid needs.
        fetch('/api/decking/staff').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() }),
        // Clinic hours only supply the default window; if they fail the board
        // falls back to DEFAULT_HOURS exactly as it does when none are saved.
        fetch('/api/decking/settings').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
      ])
      setStaff(Array.isArray(staffData) ? staffData : [])
      setClinicHoursData(hoursData && typeof hoursData === 'object' ? (hoursData as AllClinicHours) : {})
    } catch {
      setStaffError(true)
    } finally {
      setLoadingStaff(false)
    }
  }, [])

  useEffect(() => { void loadStaff() }, [loadStaff])

  const loadBranchData = useCallback(async (branch: string) => {
    const req = ++branchReq.current
    setLoadingData(true)
    try {
      const [cfgs, slts] = await Promise.all([
        fetch(`/api/decking/therapists?branch=${branch}`).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() }),
        fetch(`/api/decking/slots?branch=${branch}`).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() }),
      ])
      if (req !== branchReq.current) return
      setConfigs(Array.isArray(cfgs) ? cfgs : [])
      setSlots(Array.isArray(slts) ? slts : [])
      setLoadedBranch(branch)
      setDataError(false)
    } catch {
      if (req !== branchReq.current) return
      // Never leave one branch's slots on screen under the other's name.
      setConfigs([])
      setSlots([])
      setLoadedBranch(null)
      setDataError(true)
    } finally {
      if (req === branchReq.current) setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (!loadingStaff) loadBranchData(activeBranch)
  }, [activeBranch, loadingStaff, loadBranchData])

  // Filtered staff for display — interbranch staff (secondary branch in
  // extraBranches) must show up here too, not just under their primary branch.
  const branchStaff = staff
    .filter(s => !isIntern(s) && s.department === activeDept && onThisRoster(s, activeBranch, activeSection))
  const filteredStaff = nameFilter.trim()
    ? branchStaff.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(nameFilter.toLowerCase()))
    : branchStaff

  // Build maps
  // The schedule that applies to the section being viewed. A consultant may set
  // separate days for a service — teletherapy on Thursday and Friday while the
  // clinic days are Monday and Tuesday — and that row overrides the general one
  // HERE ONLY. Anywhere without a service-specific row falls back to the
  // general schedule, which is what every config was before this existed.
  const sectionMode: string | null =
    activeSection === 'onsite' ? 'ONSITE'
    : activeSection === 'teletherapy' ? 'TELETHERAPY'
    : activeSection === 'homecare' ? 'HOMECARE'
    : null

  const configMap = (() => {
    const general = new Map<string, TherapistConfig>()
    const forService = new Map<string, TherapistConfig>()
    for (const c of configs) {
      if (c.deliveryMode == null) general.set(c.staffId, c)
      else if (c.deliveryMode === sectionMode) forService.set(c.staffId, c)
    }
    // Aggregate views (All, Per Day, History) have no single service, so they
    // read the general schedule — mixing one service's days into a total that
    // claims to cover them all would misreport capacity.
    if (!sectionMode) return general
    const merged = new Map(general)
    for (const [staffId, c] of forService) merged.set(staffId, c)
    return merged
  })()
  const slotsByStaff = new Map<string, DeckingSlot[]>()
  // Sessions are filtered by how they are DELIVERED, not only by which sections
  // their consultant serves. Before this, a consultant tagged for two sections
  // had her one grid rendered under both, so an on-site booking appeared under
  // Teletherapy — nothing in the row said which it was.
  const staffArrangement = new Map(staff.map(st => [st.id, arrangementFor(st, activeBranch)]))
  const sectionIsService = activeSection === 'onsite' || activeSection === 'teletherapy' || activeSection === 'homecare'
  for (const slot of slots.filter(s =>
    s.department === activeDept
    && !s.isClass
    && (!sectionIsService || slotInSection(s.deliveryMode, staffArrangement.get(s.staffId), activeSection))
  )) {
    const arr = slotsByStaff.get(slot.staffId) ?? []
    arr.push(slot)
    slotsByStaff.set(slot.staffId, arr)
  }

  // Same roster rule as the board below, or the department chip for a visiting
  // teletherapy consultant would be missing and there would be no way to
  // navigate to the board she is on.
  const presentDepts = DEPARTMENTS.filter(d => staff.some(s => !isIntern(s) && s.department === d && onThisRoster(s, activeBranch, activeSection)))
  // Per Day is an aggregate of the whole branch, not a roster cut. Asking the
  // roster question with section='perday' answers false for every consultant —
  // inSection() says so deliberately, since nobody "belongs" to an aggregate —
  // so the list came back empty and every figure routed through it read 0: the
  // day table, the week total, the department count and both capacity tables,
  // while the payment split beside them (counted straight off the slots) showed
  // 198 Cash and 33 GL. The same screen contradicted itself.
  const perDayDepts = DEPARTMENTS.filter(d =>
    staff.some(s => !isIntern(s) && s.department === d && onThisRoster(s, activeBranch, 'all')))
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
    // How the booked hours are being paid for. Counted per booked CELL rather
    // than per patient, so Cash + HMO + GL + Mixed adds up to Booked exactly —
    // a mix that did not reconcile with the number above it would be read as a
    // bug in the board. A shared hour whose occupants pay differently is the
    // only thing that lands in Mixed, and it is rare enough to be worth naming
    // rather than silently assigning to one of the three.
    const pay: Record<PayType | 'MIXED', number> = { CASH: 0, HMO: 0, GL: 0, MIXED: 0 }
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
          else if (cell.length > 0) {
            booked++
            const kinds = new Set(cell.map(payOf))
            if (kinds.size === 1) pay[[...kinds][0]]++
            else pay.MIXED++
          }
        }
      }
    }
    // Every counted cell fell into exactly one bucket, so this cannot go
    // negative and needs no clamp to hide an inconsistency.
    return { total, booked, blocked, open: total - booked - blocked, pay }
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

  async function handleSaveConfig(staffId: string, data: { workDays: string[]; startTime: string; endTime: string; useDefault: boolean; branch: string; department: string; deliveryMode?: string | null }) {
    await fetch('/api/decking/therapists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, ...data }),
    })
    await loadBranchData(activeBranch)
  }

  async function handleClearServiceConfig(staffId: string, branch: string, deliveryMode: string) {
    const res = await fetch('/api/decking/therapists', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, branch, deliveryMode }),
    })
    await reportIfRefused(res)
    await loadBranchData(activeBranch)
  }

  // Both of these used to throw the response away. A refusal — the cross-branch
  // rule, the 3-per-slot cap — then looked exactly like success: the board
  // reloaded and the name simply was not there, with nothing on screen saying
  // why. Say what the server said instead.
  async function reportIfRefused(res: Response): Promise<boolean> {
    if (res.ok) return true
    const body = await res.json().catch(() => null)
    alert(body?.error ?? 'That change could not be saved.')
    return false
  }

  async function handleSaveSlot(data: { staffId: string; patientId: string | null; dayOfWeek: string; startTime: string; endTime: string; branch: string; department: string; notes: string | null; disabled?: boolean; isClass?: boolean; deliveryMode?: string | null }) {
    const res = await fetch('/api/decking/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const ok = await reportIfRefused(res)
    if (!ok) return
    // Splice the new row into state rather than refetching the whole branch.
    // loadBranchData replaces every config and slot on the board, so adding one
    // child to a SPED class rebuilt the entire page — the table flashed and the
    // scroll position jumped, on every single add. The POST already returns the
    // created slot in the same shape the list holds, patient included.
    const created = await res.json().catch(() => null)
    if (created?.id) setSlots(prev => [...prev, created as DeckingSlot])
    else await loadBranchData(activeBranch)   // shape unexpected — fall back
  }

  async function handleDeleteSlot(id: string) {
    const res = await fetch('/api/decking/slots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const ok = await reportIfRefused(res)
    if (!ok) return
    // Same reason as the add above: drop the one row instead of rebuilding.
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  async function handleSaveClinicHours(branch: string, schedule: ClinicSchedule) {
    await fetch('/api/decking/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, schedule }),
    })
    setClinicHoursData(prev => ({ ...prev, [branch]: schedule }))
  }

  // ── Page-level view state (display only) ──────────────────────────────────
  // Sections that list consultants and their grids. Everything else (Per Day,
  // SPED Class, Interdepartment, History, Departed staff) is its own board.
  const isRosterSection = activeSection === 'onsite' || activeSection === 'teletherapy' || activeSection === 'homecare' || activeSection === 'all'
  const hasSideColumn = activeSection === 'onsite' || activeSection === 'teletherapy' || activeSection === 'homecare'
  const branchName = branchLabel(activeBranch) ?? activeBranch
  const boardLoading = loadingStaff || (!staffError && !dataError && loadedBranch !== activeBranch)
  const boardRefreshing = !boardLoading && loadingData
  const staffDecked = filteredStaff.filter(st => ((configMap.get(st.id)?.workDays as string[] | undefined)?.length ?? 0) > 0).length
  const pctBooked = slotSummary.total > 0 ? Math.round((slotSummary.booked / slotSummary.total) * 100) : 0
  const deptOptions = presentDepts.includes(activeDept) ? presentDepts : [activeDept, ...presentDepts]
  const allCollapsed = filteredStaff.length > 0 && filteredStaff.every(st => collapsed.has(st.id))
  const activeSectionMeta = DECK_SECTIONS.find(sec => sec.key === activeSection)

  function clearFilters() {
    setNameFilter('')
  }

  const legend = [
    { label: 'Available', style: { background: OPEN_BG, border: `1px dashed ${OPEN_BORDER}` } },
    { label: 'Cash', style: { background: PAY_STYLE.CASH.bg, borderLeft: `3px solid ${PAY_STYLE.CASH.border}` } },
    { label: 'HMO', style: { background: PAY_STYLE.HMO.bg, borderLeft: `3px solid ${PAY_STYLE.HMO.border}` } },
    { label: 'Guarantee Letter', style: { background: PAY_STYLE.GL.bg, borderLeft: `3px solid ${PAY_STYLE.GL.border}` } },
    { label: 'Unavailable', style: { background: OFF_HATCH, border: `1px solid ${GRID_LINE}` } },
  ] as { label: string; style: React.CSSProperties }[]

  const boardSkeleton = (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the decking board">
      {[0, 1].map(i => (
        <div key={i} className="rounded-xl p-4" style={CARD_STYLE}>
          <div className="flex items-center gap-3 mb-4">
            <Skeleton style={{ width: 34, height: 34, borderRadius: 999 }} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5" style={{ width: 160 }} />
              <Skeleton className="h-3" style={{ width: 220, maxWidth: '80%' }} />
            </div>
            <Skeleton className="h-8 hidden sm:block" style={{ width: 110 }} />
          </div>
          <Skeleton className="h-44" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="max-w-[1400px] space-y-5">
      <style>{DECK_CSS}</style>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Decking
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            The weekly slot board — set each therapist&apos;s days and hours, then fill their hours with patients.
          </p>
        </div>
        <PillTabs
          label="Decking view"
          value={activeMainTab}
          onChange={id => setActiveMainTab(id as 'decking' | 'settings')}
          tabs={[
            { id: 'decking', label: 'Weekly Decking' },
            { id: 'settings', label: <><Settings2 size={13} /> Clinic Hours</> },
          ]}
        />
      </div>

      {/* Settings Tab */}
      {activeMainTab === 'settings' && (
        <SettingsTab initialData={clinicHoursData} onSave={handleSaveClinicHours} />
      )}

      {/* Decking Tab */}
      {activeMainTab === 'decking' && (
        <div className="space-y-4">
          {/* Two groups, because the board does two different jobs: Decking is
              where the week gets filled, Analysis is where the same slots are
              read back.

              A consultant tagged "On-site + Teletherapy" still appears under
              BOTH of those — the combined arrangements are genuinely two roles,
              not a third category. */}
          <div className="rounded-xl px-4 py-3" style={CARD_STYLE}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {DECK_GROUPS.map(group => (
                <div key={group.key} className="flex items-center gap-2 min-w-0 max-w-full">
                  <span className="text-[11px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
                    {group.label}
                  </span>
                  <PillTabs
                    label={group.label}
                    value={activeSection}
                    onChange={id => setActiveSection(id as DeckSection)}
                    tabs={DECK_SECTIONS.filter(sec => sec.group === group.key).map(sec => ({ id: sec.key, label: sec.label, title: sec.blurb }))}
                  />
                </div>
              ))}
            </div>
            {activeSectionMeta && (
              <p className="text-xs mt-2" style={{ color: 'var(--mid-gray)' }}>{activeSectionMeta.blurb}.</p>
            )}
          </div>

          {/* ── Toolbar ── */}
          <div className="rounded-xl px-4 py-3" style={CARD_STYLE}>
            <div className="flex flex-wrap items-end gap-3">
              {/* Branch toggle */}
              {branches.length > 1 && (
                <div>
                  <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Branch</span>
                  <PillTabs
                    label="Branch"
                    value={activeBranch}
                    onChange={b => { setActiveBranch(b); setNameFilter('') }}
                    tabs={branches.map(b => ({ id: b, label: branchLabel(b) ?? b }))}
                  />
                </div>
              )}
              {/* Department + name search — hidden on Per Day and the other
                  analysis boards, which total slots rather than listing people,
                  so filtering by either would change nothing. */}
              {isRosterSection && (
                <div>
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="dk-dept">Department</label>
                  <select id="dk-dept" value={activeDept} onChange={e => setActiveDept(e.target.value)}
                    disabled={loadingStaff}
                    className={CONTROL} style={CONTROL_STYLE}>
                    {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              {isRosterSection && (
                <div className="flex-1 min-w-[12rem] sm:flex-none">
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="dk-name">Staff</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                    <input
                      id="dk-name"
                      type="search"
                      className={`${CONTROL} pl-8 w-full sm:w-[14rem]`}
                      style={CONTROL_STYLE}
                      placeholder="Filter by name…"
                      value={nameFilter}
                      onChange={e => setNameFilter(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {isRosterSection && (
                <button type="button" onClick={clearFilters} disabled={!nameFilter}
                  className={BTN_SECONDARY} style={CONTROL_STYLE}>
                  <X size={14} /> Clear filters
                </button>
              )}
              <div className="flex items-center gap-3 ml-auto h-9">
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
                  {boardRefreshing && <><Loader2 size={12} className="animate-spin" /> Updating…</>}
                </span>
                {isRosterSection && !boardLoading && !staffError && !dataError && (
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                    <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{filteredStaff.length}</strong>
                    {nameFilter.trim() ? <> of <span className="tabular-nums">{branchStaff.length}</span></> : null} staff
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── KPIs — computed from the slots already on the board ── */}
          {isRosterSection && !staffError && !dataError && (
            boardLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden>
                {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
              </div>
            ) : (
              <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${boardRefreshing ? 'opacity-60' : ''}`}>
                <KpiCard label="Staff decked" icon={<Users size={15} />}
                  value={<>{staffDecked}<span className="text-sm font-semibold" style={{ color: 'var(--mid-gray)' }}> / {filteredStaff.length}</span></>}
                  sub="with work days set" />
                <KpiCard label="Open slots" icon={<CalendarPlus size={15} />} accent={OPEN_FG}
                  value={slotSummary.open}
                  sub={slotSummary.blocked > 0 ? `${slotSummary.blocked} more marked unavailable` : 'ready to book'} />
                <KpiCard label="Booked slots" icon={<CalendarCheck size={15} />} accent={PAY_STYLE.CASH.fg}
                  value={slotSummary.booked}
                  sub={`of ${slotSummary.total} hourly slots`} />
                <KpiCard label="Booked this week" icon={<Percent size={15} />}
                  value={`${pctBooked}%`}
                  sub={<>{branchName} &middot; {activeDept}{activeSection === 'all' ? ' · all modes' : ''}</>} />
              </div>
            )
          )}

          {/* On-site / Teletherapy / Homecare split the width 2:1 — board on the
              left, capacity and the client-portal requests for that service on
              the right. "All" is the consolidated roster and takes the full
              width: it is not tied to one service's payments. Single column
              until lg, so the side panel drops below the board on laptops and
              tablets instead of squeezing it. */}
          <div className={`grid gap-4 items-start ${hasSideColumn ? 'grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {/* While a refresh is in flight (after saving a schedule) the board
                stays on screen but cannot be clicked: a booking made now could
                be overwritten by the reload's older copy of the slots. The old
                board guaranteed the same by hiding itself behind "Loading…". */}
            <div className={`min-w-0 space-y-3 transition-opacity ${boardRefreshing ? 'opacity-60 pointer-events-none' : ''}`}
              aria-busy={boardRefreshing || undefined}>
            {/* On All the capacity card cannot sit in the right column — that
                section is full width — so it runs across the top instead. Same
                numbers, same derivation; All simply has no arrangement filter,
                so this totals every mode of delivery at once. */}
            {activeSection === 'all' && !boardLoading && !staffError && !dataError && (
              <div style={{ maxWidth: 560 }}>
                <SlotSummaryCard
                  summary={slotSummary}
                  title={<>{branchName} &middot; {activeDept} &middot; all modes of delivery</>}
                />
              </div>
            )}
            {viewingOtherBranch && (
              <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5"
                style={{
                  background: readOnlyHere ? SUBTLE_BG : '#E6F2F4',
                  border: `1px solid ${readOnlyHere ? 'var(--light-gray)' : '#A9CBEC'}`,
                  color: readOnlyHere ? '#5A6470' : '#14507F',
                }}>
                {readOnlyHere ? <Lock size={14} className="mt-0.5 flex-shrink-0" /> : <Info size={14} className="mt-0.5 flex-shrink-0" />}
                <span className="text-[13px] leading-relaxed">
                  {readOnlyHere
                    ? <>Viewing <strong>{branchName}</strong> — read only. Face-to-face sessions are decked by the branch that runs them; switch to <strong>Teletherapy</strong> to book across branches.</>
                    : <>Viewing <strong>{branchName}</strong> — teletherapy can be booked from either branch, so this board is editable.</>}
                </span>
              </div>
            )}
            {/* Staff list */}
            {staffError ? (
              <ErrorCard title="Couldn't load the decking board" hint="Check your connection, then try again." onRetry={() => { void loadStaff() }} />
            ) : dataError ? (
              <ErrorCard title={`Couldn't load the ${branchName} board`} hint="Check your connection, then try again." onRetry={() => { void loadBranchData(activeBranch) }} />
            ) : boardLoading ? (
              boardSkeleton
            ) : activeSection === 'history' ? (
              /* The board over time, from the daily snapshots — the board
                 itself keeps no dated record. */
              <DeckingHistory branch={activeBranch} />
            ) : activeSection === 'departed' ? (
              <DepartedBookings branch={activeBranch} />
            ) : activeSection === 'crosssell' ? (
              /* A patient list, not a roster: which patients on this branch's
                 board see more than one department, and which do not yet. */
              <InterdepartmentBoard branch={activeBranch} />
            ) : activeSection === 'sped' ? (
              /* SPED gets the branch's SPED slots and SPED staff, whatever the
                 department filter says — it is hidden here precisely because
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
                branchName={branchName}
                onAddChild={async (block, patientId) => {
                  await handleSaveSlot({ ...block, patientId, branch: activeBranch, department: 'SPED', notes: null, isClass: true })
                }}
                onRemove={handleDeleteSlot}
                onReassign={async (slotId, staffId) => {
                  const r = await fetch('/api/decking/slots', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: slotId, staffId }),
                  })
                  if (!r.ok) throw new Error((await r.json()).error ?? 'Could not move the child')
                  // Swap the one row. Reassigning a class moves each child in
                  // turn, so a refetch per child rebuilt the board N times over.
                  const moved = await r.json().catch(() => null)
                  if (moved?.id) setSlots(prev => prev.map(s => (s.id === moved.id ? moved as DeckingSlot : s)))
                  else await loadBranchData(activeBranch)
                }}
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
                departments={perDayDepts}
                branchName={branchName}
                capacity={perDayCapacity}
              />
            ) : filteredStaff.length === 0 ? (
              <div className="rounded-xl" style={CARD_STYLE}>
                <EmptyState
                  title={nameFilter ? `No ${activeDept} staff match “${nameFilter}” in ${branchName}` : `No ${activeDept} staff in ${branchName}`}
                  hint={nameFilter ? 'Try a different name, or clear the filter.' : 'Add staff in the Staff Module first, or pick another department.'}
                />
                {nameFilter && (
                  <div className="-mt-6 pb-8 text-center">
                    <button type="button" onClick={clearFilters} className={BTN_SM} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                      <X size={12} /> Clear filters
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Colour key + density. The grid is scanned, not read —
                    without a key the fills are decoration, and front desk keeps
                    going back to the sheet they already know how to interpret. */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px]" style={{ color: 'var(--mid-gray)' }} aria-label="Colour key">
                    {legend.map(k => (
                      <span key={k.label} className="inline-flex items-center gap-1.5">
                        <span className="inline-block rounded-sm" style={{ width: 14, height: 12, ...k.style }} />
                        {k.label}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PillTabs size="sm" label="Row density" value={density} onChange={id => setDensity(id as Density)}
                      tabs={[
                        { id: 'comfortable', label: <><Rows3 size={12} /> Comfortable</>, title: 'Taller rows' },
                        { id: 'compact', label: <><Rows4 size={12} /> Compact</>, title: 'Fit more therapists on screen' },
                      ]} />
                    <button type="button"
                      onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(filteredStaff.map(st => st.id)))}
                      className={BTN_SM} style={CONTROL_STYLE}
                      title={allCollapsed ? 'Show every grid' : 'Show headers only'}>
                      {allCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
                      <span className="hidden sm:inline">{allCollapsed ? 'Expand all' : 'Collapse all'}</span>
                    </button>
                  </div>
                </div>
                <div className={`flex flex-col ${density === 'compact' ? 'gap-2' : 'gap-3'}`}>
                  {filteredStaff.map(s => (
                    <TherapistRow
                      key={s.id}
                      staff={s}
                      activeBranch={activeBranch}
                      sectionMode={sectionMode}
                      config={configMap.get(s.id)}
                      slots={slotsByStaff.get(s.id) ?? []}
                      defaultHours={resolvedDefaultHours}
                      onSaveConfig={handleSaveConfig}
                      onClearServiceConfig={handleClearServiceConfig}
                      onSaveSlot={handleSaveSlot}
                      onDeleteSlot={handleDeleteSlot}
                      onOpenLoa={openLoaForSlot}
                      density={density}
                      collapsed={collapsed.has(s.id)}
                      onToggleCollapse={() => toggleCollapsed(s.id)}
                    />
                  ))}
                </div>
              </>
            )}
            </div>
            {hasSideColumn && (
              <div className="min-w-0 flex flex-col gap-3">
                {/* Capacity for the current branch / department / section.
                    Open is derived (total - booked - blocked) rather than
                    counted separately, so the three numbers always add up. */}
                {boardLoading ? (
                  <Skeleton className="h-44 rounded-xl" />
                ) : !staffError && !dataError ? (
                  <SlotSummaryCard
                    summary={slotSummary}
                    title={<>{branchName} &middot; {activeDept}</>}
                  />
                ) : null}
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
        <div role="status" className="fixed bottom-[18px] right-[18px] z-[60] inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: '#1C2B30', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          <Loader2 size={13} className="animate-spin" /> Opening LOA…
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
