'use client'

// SPED Class — one table for the whole branch, not one per consultant.
//
// The other Decking sections are per-therapist boards because a therapy session
// is one clinician with one child. A SPED session is a class: several children
// in one room, for a block that is usually longer than an hour. Rendering it the
// same way produced a page of near-empty single-child grids and no view of the
// class itself.
//
// So: rows are class blocks (a start–end time), columns are days, and a cell
// lists every child enrolled in that block on that day.
//
// Visually it follows the main Decking board (pinned TIME column, calm grid
// lines, soft blocks with a left accent, dashed open cells, hatched "nothing
// possible here" cells, hover-only remove controls) so front desk reads both
// boards the same way.

import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { X, Plus, CalendarDays, Users, GraduationCap, AlertTriangle, Ban } from 'lucide-react'

// Sunday → Saturday, shared with the rest of the module.
import { DAYS } from '@/lib/decking-days'
import {
  Avatar, initials, displayName, personLabel, PillTabs,
  CONTROL_SM, CONTROL_STYLE, LABEL, BTN_PRIMARY, BTN_SM,
} from './ui'
import { DashCard, EmptyState } from '../patients/dashboard/ui'

export interface SpedPatient { id: string; firstName: string; lastName: string }
export interface SpedSlot {
  id: string
  staffId: string
  patientId: string | null
  patient: SpedPatient | null
  dayOfWeek: string
  startTime: string
  endTime: string
  disabled: boolean
}
export interface SpedStaff { id: string; firstName: string; lastName: string }

// ── Look ─────────────────────────────────────────────────────────────────────
// SPED keeps the lavender it has had since the board was introduced, softened
// to the main board's block style: a pale fill with a stronger left accent.
const CLASS_BG     = '#F5F0FC'
const CLASS_FG     = '#4C1D95'
const CLASS_SUB    = '#6D4FA8'
const CLASS_BORDER = '#D9CCF1'
const CLASS_ACCENT = '#9B7BD6'
// Same open / unavailable treatment as the main board.
const OPEN_BG      = '#F5FBF6'
const OPEN_FG      = '#166534'
const OPEN_BORDER  = '#B9DFC4'
const OFF_HATCH    = 'repeating-linear-gradient(135deg, #EEF1F3 0 6px, #E5E9EC 6px 12px)'
const GRID_LINE    = '#E3EAE7'
const HEAD_BG      = '#F3F6F5'
const AXIS_BG      = '#F8FAF9'

function fmt(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// Minutes since midnight, for sorting blocks and measuring their length.
function mins(t: string): number {
  const [h, m] = (t ?? '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}

function durationLabel(start: string, end: string): string {
  const d = mins(end) - mins(start)
  if (d <= 0) return ''
  const h = Math.floor(d / 60), m = d % 60
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${m}m`
}

/**
 * Row height for a class block, display only. A 3-hour class is drawn taller
 * than a 1-hour one so a long block reads as one span of time, not as a row
 * the same size as everything else.
 */
function blockRowHeight(start: string, end: string): number {
  const hours = Math.max(mins(end) - mins(start), 0) / 60
  return Math.max(84, Math.round(hours * 52))
}

// ─── Week calendar ───────────────────────────────────────────────────────────
// The table stacks each class block on its own row, which is the right shape
// for editing but hides concurrency: Ponce 1–4 and Abarca 2–4 are two rows, and
// nothing on screen says both classes are in the building between 2 and 4.
//
// This lays the week out against a real time axis instead. Classes that overlap
// sit side by side in the same day, so the 2–4 pile-up is visible, and each day
// carries the peak number of children present at once — which is the number
// that decides whether the room works.

interface Run {
  day: string
  start: number
  end: number
  startTime: string
  endTime: string
  staffId: string
  children: number
  lane: number
}

/**
 * Assign overlapping runs to side-by-side lanes.
 *
 * Greedy: reuse the first lane whose previous class has already finished,
 * otherwise open a new one. `end <= start` rather than `<` so a class ending at
 * 12:00 and one starting at 12:00 share a lane — they do not overlap, they are
 * back to back, and giving them separate columns would claim a clash.
 */
function packLanes(runs: Omit<Run, 'lane'>[]): { runs: Run[]; lanes: number } {
  const sorted = [...runs].sort((a, b) => a.start - b.start || a.end - b.end)
  const laneEnds: number[] = []
  const out: Run[] = []
  for (const r of sorted) {
    let lane = laneEnds.findIndex(end => end <= r.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(r.end) }
    else laneEnds[lane] = r.end
    out.push({ ...r, lane })
  }
  return { runs: out, lanes: Math.max(laneEnds.length, 1) }
}

/**
 * The most children in the building at one moment on this day.
 *
 * Only class boundaries can change the count, so sweeping those instants is
 * exact — no need to walk every minute. Each instant is measured as [start,end)
 * so a class ending at 2:00 is not counted against one starting at 2:00.
 */
function peakChildren(runs: { start: number; end: number; children: number }[]): number {
  let peak = 0
  for (const t of [...new Set(runs.map(r => r.start))]) {
    const n = runs.reduce((sum, r) => sum + (r.start <= t && t < r.end ? r.children : 0), 0)
    if (n > peak) peak = n
  }
  return peak
}

function WeekCalendar({ runs, teacherName }: {
  runs: Omit<Run, 'lane'>[]
  teacherName: (staffId: string) => string
}) {
  if (runs.length === 0) {
    return <EmptyState title="Nothing scheduled yet" hint="Classes appear here once a block has a teacher." />
  }

  // One axis for the whole week, so a bar at the same height means the same
  // time in every column. Padded to whole hours to keep the tick labels round.
  const dayStart = Math.floor(Math.min(...runs.map(r => r.start)) / 60) * 60
  const dayEnd = Math.ceil(Math.max(...runs.map(r => r.end)) / 60) * 60
  const PX_PER_MIN = 0.95
  const height = Math.max((dayEnd - dayStart) * PX_PER_MIN, 120)
  const ticks: number[] = []
  for (let t = dayStart; t <= dayEnd; t += 60) ticks.push(t)
  const HEAD_H = 48
  const AXIS_W = 56

  const byDay = DAYS.map(d => {
    const packed = packLanes(runs.filter(r => r.day === d.key))
    return { day: d, ...packed, peak: peakChildren(packed.runs) }
  })

  const tickLabel = (t: number) => {
    const h = Math.floor(t / 60)
    return `${h % 12 || 12}${h >= 12 ? 'pm' : 'am'}`
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
      <div style={{ display: 'flex', minWidth: AXIS_W + DAYS.length * 120 }}>
        {/* Time axis — pinned while the week scrolls sideways. */}
        <div style={{
          width: AXIS_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
          background: AXIS_BG, borderRight: '1px solid var(--light-gray)',
        }}>
          <div style={{
            height: HEAD_H, background: HEAD_BG, borderBottom: '1px solid var(--light-gray)',
            display: 'flex', alignItems: 'center', padding: '0 0.6rem',
            fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mid-gray)',
          }}>
            Time
          </div>
          <div style={{ position: 'relative', height }}>
            {ticks.map(t => (
              <div key={t} style={{
                position: 'absolute', top: Math.max((t - dayStart) * PX_PER_MIN - 6, 0), right: 8,
                fontSize: '0.66rem', fontWeight: 600, color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums',
              }}>{tickLabel(t)}</div>
            ))}
          </div>
        </div>

        {byDay.map(({ day, runs: dayRuns, lanes, peak }) => (
          <div key={day.key} style={{ flex: 1, minWidth: 120, borderRight: `1px solid ${GRID_LINE}` }}>
            <div style={{
              height: HEAD_H, background: HEAD_BG, borderBottom: '1px solid var(--light-gray)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--charcoal)' }}>
                <span className="hidden sm:inline">{day.label}</span>
                <span className="sm:hidden">{day.short}</span>
              </div>
              {/* The point of the view: how many children are in at once. */}
              {peak > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full px-1.5 leading-none tabular-nums"
                  style={{ fontSize: '0.62rem', fontWeight: 700, background: '#FEF3C7', color: '#8A5A00', paddingTop: 3, paddingBottom: 3 }}>
                  <Users size={9} aria-hidden /> {peak} at peak
                </span>
              ) : (
                <span style={{ fontSize: '0.62rem', color: '#A3ACB5' }}>No class</span>
              )}
            </div>
            <div style={{ position: 'relative', height, background: '#fff' }}>
              {ticks.map(t => (
                <div key={t} style={{
                  position: 'absolute', top: (t - dayStart) * PX_PER_MIN, left: 0, right: 0,
                  borderTop: `1px solid ${GRID_LINE}`,
                }} />
              ))}
              {dayRuns.map(r => {
                const top = (r.start - dayStart) * PX_PER_MIN
                const h = Math.max((r.end - r.start) * PX_PER_MIN, 20)
                const w = 100 / lanes
                return (
                  <div key={`${r.staffId}|${r.startTime}|${r.endTime}`}
                    title={`${teacherName(r.staffId)} · ${fmt(r.startTime)}–${fmt(r.endTime)} · ${r.children} ${r.children === 1 ? 'child' : 'children'}`}
                    style={{
                      position: 'absolute', top: top + 1, height: h - 2,
                      left: `calc(${r.lane * w}% + 3px)`, width: `calc(${w}% - 6px)`,
                      background: CLASS_BG, borderLeft: `3px solid ${CLASS_ACCENT}`, borderRadius: 6,
                      boxShadow: `inset 0 0 0 1px ${CLASS_BORDER}`,
                      padding: '0.25rem 0.35rem', overflow: 'hidden',
                    }}>
                    <div style={{ fontSize: '0.66rem', fontWeight: 700, color: CLASS_FG, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(teacherName(r.staffId).split(',')[0])}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: CLASS_SUB, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fmt(r.startTime).replace(':00', '')}–{fmt(r.endTime).replace(':00', '')}
                    </div>
                    {h > 44 && (
                      <div className="inline-flex items-center gap-1" style={{ fontSize: '0.6rem', color: CLASS_SUB, marginTop: 2, fontWeight: 600 }}>
                        <Users size={9} aria-hidden /> {r.children} {r.children === 1 ? 'child' : 'children'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One small number in the header strip — counted from what is already loaded. */
function StatChip({ icon, value, label, title }: { icon: ReactNode; value: number; label: string; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-xs whitespace-nowrap"
      style={{ background: '#F3F6F5', color: 'var(--mid-gray)' }}>
      <span className="flex-shrink-0" style={{ color: 'var(--teal)' }}>{icon}</span>
      <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{value}</strong>
      {label}
    </span>
  )
}

export default function SpedClassBoard({
  slots, staff, branchName, onAddChild, onRemove, onReassign, onCreateBlock,
}: {
  slots: SpedSlot[]
  staff: SpedStaff[]
  branchName: string
  onAddChild: (block: { staffId: string; dayOfWeek: string; startTime: string; endTime: string }, patientId: string) => Promise<void>
  onRemove: (slotId: string) => Promise<void>
  /** Move one child to a different teacher. */
  onReassign: (slotId: string, staffId: string) => Promise<void>
  onCreateBlock: (block: { staffId: string; dayOfWeek: string; startTime: string; endTime: string }) => Promise<void>
}) {
  const [adding, setAdding] = useState<string | null>(null)   // "day|start|end"
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpedPatient[]>([])
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [form, setForm] = useState({ staffId: '', dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00' })
  const [busy, setBusy] = useState(false)
  const [newGroupStaff, setNewGroupStaff] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Table edits; Calendar answers "how many children are in at once". Two jobs,
  // two shapes — the table cannot show overlap and the calendar cannot take a
  // child out of a class.
  const [view, setView] = useState<'table' | 'calendar'>('table')

  const live = slots.filter(s => !s.disabled)

  // A row is ONE TEACHER'S class at one time, not "everything happening at
  // 10am". Keying on time alone merged two teachers running simultaneously into
  // a single cell, so their groups appeared as one long list of children with
  // no way to tell whose class was whose — and 10-12 with both teachers looked
  // the same as 10-12 with one.
  //
  // Still derived from the slots rather than a fixed hourly ladder: a class runs
  // 10-12, not 10-11 and 11-12, and splitting it would misrepresent one session
  // as two.
  // A row is the TIME BLOCK — 10-12 appears once, however many teachers run
  // then. Inside a day's cell the children are wrapped in one card per teacher,
  // headed by that teacher's name, so "whose class is this child in" is answered
  // by the card around them rather than by the row they happen to sit in.
  interface Block { startTime: string; endTime: string }
  const blockKey = (s: Block) => `${s.startTime}|${s.endTime}`
  const teacherName = (staffId: string) => {
    const t = staff.find(x => x.id === staffId)
    return t ? `${t.lastName}, ${t.firstName}` : 'Unassigned teacher'
  }
  // Display only: re-cased "Last, First" (records are often typed in caps).
  // teacherName stays the raw value because the card order sorts on it.
  const teacher = (staffId: string) => staff.find(x => x.id === staffId)
  const teacherLabel = (staffId: string) => {
    const t = teacher(staffId)
    return t ? personLabel(t) : 'Unassigned teacher'
  }
  const blocks: Block[] = Array.from(new Set(live.map(blockKey)))
    .map(k => { const [startTime, endTime] = k.split('|'); return { startTime, endTime } })
    .sort((a, b) => mins(a.startTime) - mins(b.startTime) || mins(a.endTime) - mins(b.endTime))

  const cell = (day: string, b: Block) =>
    live.filter(s => s.dayOfWeek === day && s.startTime === b.startTime && s.endTime === b.endTime)

  /** The children in one cell, split into a card per teacher. */
  const groupsIn = (day: string, b: Block) => {
    const byTeacher = new Map<string, typeof live>()
    for (const s of cell(day, b)) {
      byTeacher.set(s.staffId, [...(byTeacher.get(s.staffId) ?? []), s])
    }
    return [...byTeacher.entries()]
      .map(([staffId, kids]) => ({ staffId, kids }))
      .sort((x, y) => teacherName(x.staffId).localeCompare(teacherName(y.staffId)))
  }

  // One entry per teacher's class per day, which is what the calendar draws.
  // Counted on patient rather than row: an empty "(slot)" placeholder is a
  // class with nobody in it yet, and counting it as a child would inflate the
  // peak the room is being judged against.
  const calendarRuns = DAYS.flatMap(d =>
    blocks.flatMap(b => groupsIn(d.key, b).map(g => ({
      day: d.key,
      start: mins(b.startTime),
      end: mins(b.endTime),
      startTime: b.startTime,
      endTime: b.endTime,
      staffId: g.staffId,
      children: g.kids.filter(k => k.patientId).length,
    }))),
  )

  // Header numbers — counted from the loaded slots only. There is no class
  // capacity in the data, so no "seats used" figure is shown.
  const childrenEnrolled = new Set(live.filter(s => s.patientId).map(s => s.patientId)).size
  const teachersRunning = new Set(calendarRuns.map(r => r.staffId)).size

  /** Move every child in one teacher's card to another teacher. */
  async function reassign(kids: { id: string }[], staffId: string) {
    if (!staffId) return
    setBusy(true); setError(null)
    try {
      // One request per child: the endpoint validates each against the branch
      // and department, and a partial failure leaves the rest correctly moved
      // rather than rolling the whole group back to the wrong teacher.
      for (const k of kids) await onReassign(k.id, staffId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the class to that teacher.')
    } finally { setBusy(false) }
  }

  async function search(v: string) {
    setQuery(v)
    if (v.trim().length < 2) { setResults([]); return }
    try {
      const r = await fetch(`/api/patients/search?q=${encodeURIComponent(v)}`)
      if (r.ok) setResults(await r.json())
    } catch { setResults([]) }
  }

  async function pick(day: string, b: Block, p: SpedPatient, staffId: string) {
    // The card being added to names its teacher, so there is nothing to guess
    // from the cell, the form, or the first consultant on the roster. That
    // guesswork is what used to fail on any day a class did not already run.
    setBusy(true); setError(null)
    try {
      await onAddChild({ staffId, dayOfWeek: day, startTime: b.startTime, endTime: b.endTime }, p.id)
      setAdding(null); setQuery(''); setResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the child to this class.')
    } finally { setBusy(false) }
  }

  async function createBlock() {
    if (!form.staffId) { setError('Pick the teacher running this class.'); return }
    if (mins(form.endTime) <= mins(form.startTime)) { setError('The class has to end after it starts.'); return }
    setBusy(true); setError(null)
    try {
      await onCreateBlock(form)
      setShowBlockForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the class block.')
    } finally { setBusy(false) }
  }

  // ── Shared pieces ──────────────────────────────────────────────────────────
  const TIME_COL = 112
  const DAY_COL_MIN = 136               // below this the grid scrolls sideways
  const thBase: CSSProperties = {
    position: 'sticky', top: 0, background: HEAD_BG, padding: '0.45rem 0.6rem',
    borderRight: `1px solid ${GRID_LINE}`, borderBottom: '1px solid var(--light-gray)',
  }
  const tdBase: CSSProperties = {
    padding: 4, verticalAlign: 'top',
    borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`,
  }
  const searchInput = `${CONTROL_SM} w-full`
  const searchInputStyle: CSSProperties = { ...CONTROL_STYLE, height: 28, fontSize: 12, borderColor: 'var(--teal)' }
  const resultsBox: CSSProperties = {
    position: 'absolute', zIndex: 40, top: 'calc(100% + 2px)', left: 0, right: 0, maxHeight: 180, overflowY: 'auto',
    background: '#fff', border: '1px solid var(--light-gray)', borderRadius: 8, boxShadow: '0 6px 18px rgba(16,24,40,0.12)',
    padding: 3,
  }
  const resultBtn = 'flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded-md text-xs hover:bg-gray-50 focus-visible:outline-2'
  const resultRow = (p: SpedPatient) => (
    <>
      <Avatar text={initials(p.firstName, p.lastName)} size={18} />
      <span className="truncate" style={{ color: 'var(--charcoal)' }}>{personLabel(p)}</span>
    </>
  )

  const viewTabs = (
    <PillTabs size="sm" label="SPED view" value={view} onChange={id => setView(id as 'table' | 'calendar')}
      tabs={[
        { id: 'table', label: 'Table', title: 'Edit classes — add, move and remove children' },
        { id: 'calendar', label: 'Calendar', title: 'See which classes overlap and how many children are in at once' },
      ]} />
  )

  return (
    <DashCard
      flush
      className="overflow-hidden"
      icon={<GraduationCap size={16} />}
      title={`SPED Class — ${branchName}`}
      description="One board for SPED classes — many children per block. A block can run longer than an hour."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {busy && <span className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }} aria-live="polite">Saving…</span>}
          {viewTabs}
          <button type="button" onClick={() => { setShowBlockForm(v => !v); setError(null) }}
            aria-expanded={showBlockForm}
            className={BTN_SM}
            style={showBlockForm
              ? { background: 'var(--pale-teal)', color: 'var(--teal)', border: '1px solid var(--teal)' }
              : { ...CONTROL_STYLE, color: 'var(--teal)' }}>
            <Plus size={13} /> Class block
          </button>
        </div>
      }
    >
      {/* Numbers from the loaded board — no extra request. */}
      {blocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <StatChip icon={<CalendarDays size={13} />} value={calendarRuns.length}
            label={calendarRuns.length === 1 ? 'class this week' : 'classes this week'}
            title="One teacher's class on one day counts once" />
          <StatChip icon={<Users size={13} />} value={childrenEnrolled}
            label={childrenEnrolled === 1 ? 'child enrolled' : 'children enrolled'}
            title="Different children across all classes this week" />
          <StatChip icon={<GraduationCap size={13} />} value={teachersRunning}
            label={teachersRunning === 1 ? 'teacher' : 'teachers'}
            title={`Teachers running a class this week · ${staff.length} SPED teacher${staff.length === 1 ? '' : 's'} on this branch`} />
          {/* Colour key, as on the main board. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ml-auto" style={{ color: 'var(--mid-gray)' }} aria-label="Colour key">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block rounded-sm" style={{ width: 14, height: 12, background: CLASS_BG, borderLeft: `3px solid ${CLASS_ACCENT}` }} />
              Teacher&apos;s class
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block rounded-sm" style={{ width: 14, height: 12, background: OPEN_BG, border: `1px dashed ${OPEN_BORDER}` }} />
              No class yet
            </span>
          </div>
        </div>
      )}

      {showBlockForm && (
        <div className="px-5 py-3.5 flex flex-wrap items-end gap-3" style={{ background: '#F8FAF9', borderBottom: '1px solid var(--light-gray)' }}>
          <label>
            <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Teacher</span>
            <select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
              className={CONTROL_SM} style={{ ...CONTROL_STYLE, minWidth: 190 }}>
              <option value="">Select…</option>
              {staff.map(s => <option key={s.id} value={s.id}>{personLabel(s)}</option>)}
            </select>
          </label>
          <label>
            <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Day</span>
            <select value={form.dayOfWeek} onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))}
              className={CONTROL_SM} style={{ ...CONTROL_STYLE, minWidth: 120 }}>
              {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
          <label>
            <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Start</span>
            <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
              className={CONTROL_SM} style={CONTROL_STYLE} />
          </label>
          <label>
            <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>End</span>
            <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
              className={CONTROL_SM} style={CONTROL_STYLE} />
          </label>
          {durationLabel(form.startTime, form.endTime) && (
            <span className="h-8 inline-flex items-center text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>
              {durationLabel(form.startTime, form.endTime)} class
            </span>
          )}
          <button type="button" onClick={createBlock} disabled={busy}
            className={BTN_PRIMARY} style={{ background: 'var(--teal)', height: 32, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Adding…' : 'Add block'}
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 px-5 py-2.5 text-[13px]"
          style={{ background: '#FEF2F2', color: '#B91C1C', borderBottom: '1px solid #FECACA' }}>
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {blocks.length === 0 ? (
        <EmptyState
          title="No SPED classes set up for this branch yet"
          hint={staff.length === 0
            ? 'There are no SPED teachers on this branch yet — add them in the Staff Module, then use “+ Class block” to set the first class time.'
            : 'Use “+ Class block” to set the first class time — for example Monday 9:00 to 11:00.'}
        />
      ) : view === 'calendar' ? (
        <WeekCalendar teacherName={teacherName} runs={calendarRuns} />
      ) : (
        /* Scrolls sideways inside the card with the TIME column pinned, so
           the page itself never scrolls horizontally. */
        <div className="overflow-x-auto">
          <table style={{
            width: '100%', minWidth: TIME_COL + DAYS.length * DAY_COL_MIN,
            borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem', tableLayout: 'fixed',
          }}>
            <colgroup>
              <col style={{ width: TIME_COL }} />
              {DAYS.map(d => <col key={d.key} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={{
                  ...thBase, left: 0, zIndex: 3, textAlign: 'left', background: HEAD_BG,
                  fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mid-gray)',
                }}>
                  Time
                </th>
                {DAYS.map(d => (
                  <th key={d.key} scope="col" style={{ ...thBase, zIndex: 2, textAlign: 'center', fontSize: '0.74rem', fontWeight: 700, color: 'var(--charcoal)' }}>
                    <span className="hidden sm:inline">{d.label}</span>
                    <span className="sm:hidden">{d.short}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map(b => {
                const rowH = blockRowHeight(b.startTime, b.endTime)
                const dur = durationLabel(b.startTime, b.endTime)
                return (
                  <tr key={blockKey(b)}>
                    {/* The block as one span: start at the top, end at the
                        bottom, joined by a rail, with its length between. */}
                    <th scope="row" style={{
                      position: 'sticky', left: 0, zIndex: 1, background: AXIS_BG,
                      padding: '0.5rem 0.6rem', textAlign: 'left', verticalAlign: 'top', height: rowH,
                      borderRight: '1px solid var(--light-gray)', borderBottom: `1px solid ${GRID_LINE}`,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      <div className="flex gap-2" style={{ minHeight: rowH - 16 }}>
                        <span aria-hidden className="flex-shrink-0 rounded-full" style={{ width: 3, background: CLASS_ACCENT, opacity: 0.55 }} />
                        <div className="flex flex-col justify-between min-w-0">
                          <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{fmt(b.startTime)}</span>
                          {dur && (
                            <span className="self-start rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap"
                              style={{ background: CLASS_BG, color: CLASS_SUB, border: `1px solid ${CLASS_BORDER}` }}>
                              {dur}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                            to {fmt(b.endTime)}
                          </span>
                        </div>
                      </div>
                    </th>
                    {DAYS.map(d => {
                      const groups = groupsIn(d.key, b)
                      const where = `${d.label} ${fmt(b.startTime)}–${fmt(b.endTime)}`
                      return (
                        <td key={d.key} className="dk-cell" style={{ ...tdBase, height: rowH }}>
                          <div className="flex flex-col gap-1.5 h-full">
                            {groups.map(g => {
                              const key = `${d.key}|${g.staffId}|${b.startTime}|${b.endTime}`
                              const isAdding = adding === key
                              const t = teacher(g.staffId)
                              const childCount = g.kids.filter(k => k.patientId).length
                              return (
                                /* The card IS the answer to "whose class is this":
                                   the children sit inside it, under the teacher's
                                   name, instead of being one flat list. */
                                <div key={g.staffId} className="rounded-lg min-w-0"
                                  style={{
                                    background: CLASS_BG, borderLeft: `3px solid ${CLASS_ACCENT}`,
                                    boxShadow: `inset 0 0 0 1px ${CLASS_BORDER}`, padding: '5px 5px 4px 6px',
                                  }}>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Avatar text={t ? initials(t.firstName, t.lastName) : '?'} size={22} />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[11.5px] font-bold leading-tight" style={{ color: CLASS_FG }}
                                        title={`${teacherName(g.staffId)} · ${g.kids.length} child${g.kids.length === 1 ? '' : 'ren'}`}>
                                        {teacherLabel(g.staffId)}
                                      </p>
                                      <p className="truncate text-[10px] leading-tight" style={{ color: CLASS_SUB }}>
                                        {t ? `${displayName(t.lastName)}’s class` : 'Class'}
                                      </p>
                                    </div>
                                    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums flex-shrink-0"
                                      style={{ background: '#fff', color: CLASS_SUB, border: `1px solid ${CLASS_BORDER}` }}
                                      title={`${childCount} ${childCount === 1 ? 'child' : 'children'} in this class`}>
                                      <Users size={9} aria-hidden /> {childCount}
                                    </span>
                                  </div>

                                  {/* Moves the whole group. Every class child added
                                      before the board tracked teachers landed on
                                      the first consultant on the roster, so the
                                      common correction is a whole card at once —
                                      not one child at a time. */}
                                  <select
                                    value={g.staffId} disabled={busy}
                                    onChange={e => reassign(g.kids, e.target.value)}
                                    title="Move this group to another teacher"
                                    aria-label={`Move ${teacherLabel(g.staffId)}'s class on ${where} to another teacher`}
                                    className={`${CONTROL_SM} w-full mt-1.5`}
                                    style={{ ...CONTROL_STYLE, height: 26, fontSize: 11, paddingLeft: 6, paddingRight: 4, color: CLASS_SUB, cursor: busy ? 'not-allowed' : 'pointer' }}>
                                    {!staff.some(x => x.id === g.staffId) && (
                                      <option value={g.staffId}>{teacherName(g.staffId)}</option>
                                    )}
                                    {staff.map(x => (
                                      <option key={x.id} value={x.id}>{personLabel(x)}</option>
                                    ))}
                                  </select>

                                  <div className="flex flex-col gap-1 mt-1.5">
                                    {g.kids.map(sl => {
                                      const full = sl.patient ? personLabel(sl.patient) : ''
                                      const short = sl.patient
                                        ? `${displayName(sl.patient.lastName)}, ${(sl.patient.firstName ?? '').trim().charAt(0).toUpperCase()}.`
                                        : ''
                                      return (
                                        <div key={sl.id} className="flex items-center gap-1 rounded-full min-w-0"
                                          style={sl.patient
                                            ? { background: '#fff', border: `1px solid ${CLASS_BORDER}`, padding: '2px 3px 2px 2px' }
                                            : { background: 'transparent', border: `1px dashed ${CLASS_BORDER}`, padding: '2px 3px 2px 6px' }}>
                                          {sl.patient && (
                                            <span aria-hidden className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
                                              style={{ width: 18, height: 18, fontSize: 8, background: '#EDE4FA', color: CLASS_FG }}>
                                              {initials(sl.patient.firstName, sl.patient.lastName)}
                                            </span>
                                          )}
                                          <span className="flex-1 min-w-0 truncate text-[11px] font-semibold"
                                            style={{ color: sl.patient ? CLASS_FG : '#8B93A0', fontStyle: sl.patient ? 'normal' : 'italic' }}
                                            title={sl.patient ? `${sl.patient.lastName}, ${sl.patient.firstName}` : 'Empty class — no child yet'}>
                                            {sl.patient ? short : 'No child yet'}
                                          </span>
                                          <button type="button" onClick={() => onRemove(sl.id)} title="Remove from class"
                                            aria-label={sl.patient ? `Remove ${full} from ${where}` : `Remove the empty placeholder from ${where}`}
                                            className="dk-btn dk-reveal dk-icon-btn rounded-full p-0.5 flex-shrink-0"
                                            style={{ color: '#B0453A', lineHeight: 1 }}>
                                            <X size={10} />
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {isAdding ? (
                                    <div style={{ position: 'relative', marginTop: 6 }}>
                                      <input autoFocus value={query} onChange={e => search(e.target.value)}
                                        placeholder="Search child…"
                                        aria-label={`Search for a child to add to ${teacherLabel(g.staffId)}'s class`}
                                        onBlur={() => setTimeout(() => setAdding(null), 200)}
                                        className={searchInput} style={searchInputStyle} />
                                      {results.length > 0 && (
                                        <div style={resultsBox}>
                                          {results.map(p => (
                                            <button key={p.id} type="button" onMouseDown={() => pick(d.key, b, p, g.staffId)} className={resultBtn}>
                                              {resultRow(p)}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button type="button" onClick={() => { setAdding(key); setQuery(''); setResults([]) }}
                                      title={`Add a child to ${teacherName(g.staffId)}'s class`}
                                      className="dk-btn dk-icon-btn w-full mt-1.5 inline-flex items-center justify-center gap-1 rounded-md text-[11px] font-semibold"
                                      style={{ color: CLASS_SUB, padding: '3px 0', cursor: 'pointer' }}>
                                      <Plus size={11} /> Add child
                                    </button>
                                  )}
                                </div>
                              )
                            })}

                            {/* Starting a group for a teacher who is not yet running
                                this block — the case where two teachers share an
                                hour with different children. */}
                            {(() => {
                              const spare = staff.filter(x => !groups.some(g => g.staffId === x.id))
                              if (spare.length === 0) {
                                // Nothing can be started here: no SPED teacher on
                                // this branch. Hatched, as on the main board, so
                                // it does not read as an open slot.
                                return groups.length === 0 ? (
                                  <div className="flex items-center gap-1.5 px-1.5 rounded-md flex-1"
                                    style={{ background: OFF_HATCH, color: '#6B7785', minHeight: 30 }}
                                    title="No SPED teacher on this branch to run a class">
                                    <Ban size={11} className="flex-shrink-0" aria-hidden />
                                    <span className="truncate text-[11px] font-semibold">No teacher</span>
                                  </div>
                                ) : null
                              }
                              const key = `${d.key}|NEW|${b.startTime}|${b.endTime}`
                              return adding === key ? (
                                <div style={{ position: 'relative' }}>
                                  <select defaultValue="" disabled={busy}
                                    onChange={e => setNewGroupStaff(e.target.value)}
                                    aria-label="Which teacher runs this class?"
                                    className={`${CONTROL_SM} w-full`}
                                    style={{ ...CONTROL_STYLE, height: 28, fontSize: 11.5, borderColor: 'var(--teal)', marginBottom: 4 }}>
                                    <option value="">Which teacher?</option>
                                    {spare.map(x => <option key={x.id} value={x.id}>{personLabel(x)}</option>)}
                                  </select>
                                  {newGroupStaff && (
                                    <>
                                      <input autoFocus value={query} onChange={e => search(e.target.value)}
                                        placeholder="Search child…"
                                        aria-label="Search for a child to add"
                                        className={searchInput} style={searchInputStyle} />
                                      {results.length > 0 && (
                                        <div style={resultsBox}>
                                          {results.map(p => (
                                            <button key={p.id} type="button" onMouseDown={() => { pick(d.key, b, p, newGroupStaff); setNewGroupStaff('') }} className={resultBtn}>
                                              {resultRow(p)}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : groups.length === 0 ? (
                                /* An empty day in this block: one click to start
                                   a class, styled like the main board's open hour. */
                                <button type="button" onClick={() => { setAdding(key); setQuery(''); setResults([]); setNewGroupStaff('') }}
                                  title="Start another teacher's group in this block"
                                  aria-label={`Start a class — ${where}`}
                                  className="dk-btn dk-open flex-1 w-full flex items-center justify-center gap-1 rounded-md text-[11px] font-semibold"
                                  style={{ background: OPEN_BG, border: `1px dashed ${OPEN_BORDER}`, color: OPEN_FG, minHeight: 30, cursor: 'pointer' }}>
                                  <Plus size={11} aria-hidden /> Add class
                                </button>
                              ) : (
                                <button type="button" onClick={() => { setAdding(key); setQuery(''); setResults([]); setNewGroupStaff('') }}
                                  title="Start another teacher's group in this block"
                                  aria-label={`Add another teacher's class — ${where}`}
                                  className="dk-btn dk-reveal dk-open w-full flex items-center justify-center gap-1 rounded-md text-[10.5px] font-semibold"
                                  style={{ background: 'transparent', border: `1px dashed ${OPEN_BORDER}`, color: OPEN_FG, padding: '3px 0', cursor: 'pointer' }}>
                                  <Plus size={10} aria-hidden /> Teacher
                                </button>
                              )
                            })()}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  )
}
