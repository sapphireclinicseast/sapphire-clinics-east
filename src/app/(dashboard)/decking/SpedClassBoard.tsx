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

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

// Sunday → Saturday, shared with the rest of the module.
import { DAYS } from '@/lib/decking-days'

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
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mid-gray)', fontSize: '0.82rem' }}>
      Nothing scheduled yet.
    </div>
  }

  // One axis for the whole week, so a bar at the same height means the same
  // time in every column. Padded to whole hours to keep the tick labels round.
  const dayStart = Math.floor(Math.min(...runs.map(r => r.start)) / 60) * 60
  const dayEnd = Math.ceil(Math.max(...runs.map(r => r.end)) / 60) * 60
  const PX_PER_MIN = 0.95
  const height = Math.max((dayEnd - dayStart) * PX_PER_MIN, 120)
  const ticks: number[] = []
  for (let t = dayStart; t <= dayEnd; t += 60) ticks.push(t)

  const byDay = DAYS.map(d => {
    const packed = packLanes(runs.filter(r => r.day === d.key))
    return { day: d, ...packed, peak: peakChildren(packed.runs) }
  })

  const tickLabel = (t: number) => {
    const h = Math.floor(t / 60)
    return `${h % 12 || 12}${h >= 12 ? 'pm' : 'am'}`
  }

  return (
    <div style={{ overflowX: 'auto', padding: '0 1rem 1rem' }}>
      <div style={{ display: 'flex', minWidth: 900 }}>
        {/* Time axis */}
        <div style={{ width: 52, flexShrink: 0, position: 'relative', height, marginTop: 44 }}>
          {ticks.map(t => (
            <div key={t} style={{
              position: 'absolute', top: (t - dayStart) * PX_PER_MIN - 6, right: 6,
              fontSize: '0.64rem', color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums',
            }}>{tickLabel(t)}</div>
          ))}
        </div>

        {byDay.map(({ day, runs: dayRuns, lanes, peak }) => (
          <div key={day.key} style={{ flex: 1, minWidth: 110, borderLeft: '1px solid #E4E8EC' }}>
            <div style={{ height: 44, padding: '0.3rem 0.4rem', textAlign: 'center', borderBottom: '1px solid #E4E8EC' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--charcoal)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{day.short}</div>
              {/* The point of the view: how many children are in at once. */}
              <div style={{ fontSize: '0.63rem', color: peak > 0 ? '#8A5A00' : 'var(--mid-gray)', fontWeight: peak > 0 ? 700 : 400 }}>
                {peak > 0 ? `${peak} at peak` : '—'}
              </div>
            </div>
            <div style={{ position: 'relative', height, background: '#FCFDFD' }}>
              {ticks.map(t => (
                <div key={t} style={{
                  position: 'absolute', top: (t - dayStart) * PX_PER_MIN, left: 0, right: 0,
                  borderTop: '1px solid #EEF1F3',
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
                      position: 'absolute', top, height: h,
                      left: `calc(${r.lane * w}% + 2px)`, width: `calc(${w}% - 4px)`,
                      background: '#EDE4FA', border: '1px solid #C9B6E8', borderRadius: 6,
                      padding: '0.2rem 0.3rem', overflow: 'hidden',
                    }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#4C1D95', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {teacherName(r.staffId).split(',')[0]}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: '#6D28D9', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(r.startTime).replace(':00', '')}–{fmt(r.endTime).replace(':00', '')}
                    </div>
                    {h > 44 && (
                      <div style={{ fontSize: '0.58rem', color: '#6D28D9', marginTop: 1 }}>
                        {r.children} {r.children === 1 ? 'child' : 'children'}
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

  const th: React.CSSProperties = {
    padding: '0.4rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: '#5A6470', background: '#F0F2F5',
    borderBottom: '1px solid #C4CBD3', borderRight: '1px solid #C4CBD3', textAlign: 'center',
  }
  const td: React.CSSProperties = {
    borderRight: '1px solid #D6DCE2', borderBottom: '1px solid #D6DCE2',
    verticalAlign: 'top', padding: '0.3rem', minWidth: 140,
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--light-gray)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.9rem', margin: 0 }}>
            SPED Class &mdash; {branchName}
          </p>
          <p style={{ color: 'var(--mid-gray)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
            One board for the whole branch. A class holds as many children as it needs, and a block can run longer than an hour.
          </p>
        </div>
        <div style={{ display: 'flex', border: '1.5px solid #D6DCE2', borderRadius: '0.5rem', overflow: 'hidden' }}>
          {(['table', 'calendar'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{
                padding: '0.35rem 0.8rem', fontSize: '0.76rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--teal)' : '#fff', color: view === v ? '#fff' : 'var(--mid-gray)',
              }}>
              {v === 'table' ? 'Table' : 'Calendar'}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowBlockForm(v => !v); setError(null) }}
          style={{
            padding: '0.4rem 0.9rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 700,
            border: '1.5px solid var(--teal)', background: showBlockForm ? 'var(--teal)' : '#fff',
            color: showBlockForm ? '#fff' : 'var(--teal)', cursor: 'pointer',
          }}>
          + Class block
        </button>
      </div>

      {showBlockForm && (
        <div style={{ padding: '0.75rem 1rem', background: '#F8FAFC', borderBottom: '1px solid var(--light-gray)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mid-gray)' }}>
            Teacher<br />
            <select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
              style={{ marginTop: 3, padding: '0.35rem 0.5rem', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.8rem', minWidth: 170 }}>
              <option value="">Select…</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mid-gray)' }}>
            Day<br />
            <select value={form.dayOfWeek} onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))}
              style={{ marginTop: 3, padding: '0.35rem 0.5rem', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.8rem' }}>
              {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mid-gray)' }}>
            Start<br />
            <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
              style={{ marginTop: 3, padding: '0.3rem 0.5rem', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.8rem' }} />
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mid-gray)' }}>
            End<br />
            <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
              style={{ marginTop: 3, padding: '0.3rem 0.5rem', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.8rem' }} />
          </label>
          <button onClick={createBlock} disabled={busy}
            style={{ padding: '0.4rem 0.9rem', borderRadius: '0.5rem', border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Adding…' : 'Add block'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '0.5rem 1rem', background: '#FEF2F2', color: '#B91C1C', fontSize: '0.78rem', borderBottom: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {blocks.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: '0.875rem' }}>No SPED classes yet</p>
          <p style={{ color: 'var(--mid-gray)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
            Use &ldquo;+ Class block&rdquo; to set the first class time &mdash; for example Monday 9:00 to 11:00.
          </p>
        </div>
      ) : view === 'calendar' ? (
        <WeekCalendar teacherName={teacherName} runs={calendarRuns} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', minWidth: 130 }}>Class block</th>
                {DAYS.map(d => <th key={d.key} style={th}>{d.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {blocks.map(b => (
                <tr key={blockKey(b)}>
                  <td style={{ ...td, background: '#F7F8FA', minWidth: 130 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(b.startTime)} &ndash; {fmt(b.endTime)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--mid-gray)' }}>
                      {durationLabel(b.startTime, b.endTime)}
                    </div>
                  </td>
                  {DAYS.map(d => {
                    const groups = groupsIn(d.key, b)
                    return (
                      <td key={d.key} style={{ ...td, verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {groups.map(g => {
                            const key = `${d.key}|${g.staffId}|${b.startTime}|${b.endTime}`
                            const isAdding = adding === key
                            return (
                              /* The card IS the answer to "whose class is this":
                                 the children sit inside it, under the teacher's
                                 name, instead of being one flat list. */
                              <div key={g.staffId} style={{
                                border: '1px solid #D6C9F0', borderRadius: 6, background: '#FBFAFE',
                                padding: '0.3rem', minWidth: 0,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                                  <span style={{
                                    flex: 1, fontSize: '0.66rem', fontWeight: 800, color: '#4C1D95',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }} title={`${teacherName(g.staffId)} · ${g.kids.length} child${g.kids.length === 1 ? '' : 'ren'}`}>
                                    {teacherName(g.staffId)}
                                  </span>
                                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7C6BA8' }}>
                                    {g.kids.length}
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
                                  style={{
                                    width: '100%', fontSize: '0.62rem', padding: '0.1rem 0.15rem',
                                    border: '1px solid #E6E1F2', borderRadius: 4, background: '#fff',
                                    color: '#5B4B8A', marginBottom: 3, cursor: 'pointer',
                                  }}>
                                  {!staff.some(t => t.id === g.staffId) && (
                                    <option value={g.staffId}>{teacherName(g.staffId)}</option>
                                  )}
                                  {staff.map(t => (
                                    <option key={t.id} value={t.id}>{t.lastName}, {t.firstName}</option>
                                  ))}
                                </select>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {g.kids.map(sl => (
                                    <div key={sl.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#EFE9FA', border: '1px solid #D6C9F0', borderRadius: 4, padding: '0.15rem 0.35rem' }}>
                                      <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: '#4C1D95', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={sl.patient ? `${sl.patient.lastName}, ${sl.patient.firstName}` : '(slot)'}>
                                        {sl.patient ? `${sl.patient.lastName}, ${sl.patient.firstName[0]}.` : '(slot)'}
                                      </span>
                                      <button onClick={() => onRemove(sl.id)} title="Remove from class"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0453A', padding: 0, lineHeight: 1 }}>
                                        <X size={9} />
                                      </button>
                                    </div>
                                  ))}
                                </div>

                                {isAdding ? (
                                  <div style={{ position: 'relative', marginTop: 3 }}>
                                    <input autoFocus value={query} onChange={e => search(e.target.value)}
                                      placeholder="Search child…"
                                      onBlur={() => setTimeout(() => setAdding(null), 200)}
                                      style={{ width: '100%', padding: '0.2rem 0.4rem', fontSize: '0.72rem', border: '1.5px solid var(--teal)', borderRadius: 4, outline: 'none' }} />
                                    {results.length > 0 && (
                                      <div style={{ position: 'absolute', zIndex: 40, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', top: '100%', left: 0, right: 0, maxHeight: 150, overflowY: 'auto' }}>
                                        {results.map(p => (
                                          <button key={p.id} onMouseDown={() => pick(d.key, b, p, g.staffId)}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.25rem 0.5rem', fontSize: '0.72rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            {p.lastName}, {p.firstName}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button onClick={() => { setAdding(key); setQuery(''); setResults([]) }}
                                    title={`Add a child to ${teacherName(g.staffId)}'s class`}
                                    style={{ width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid #E6E9ED', cursor: 'pointer', color: '#7C6BA8', fontSize: '0.66rem', fontWeight: 700, padding: '2px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 3 }}>
                                    <Plus size={9} /> Add child
                                  </button>
                                )}
                              </div>
                            )
                          })}

                          {/* Starting a group for a teacher who is not yet running
                              this block — the case where two teachers share an
                              hour with different children. */}
                          {(() => {
                            const spare = staff.filter(t => !groups.some(g => g.staffId === t.id))
                            if (spare.length === 0) return null
                            const key = `${d.key}|NEW|${b.startTime}|${b.endTime}`
                            return adding === key ? (
                              <div style={{ position: 'relative' }}>
                                <select defaultValue="" disabled={busy}
                                  onChange={e => setNewGroupStaff(e.target.value)}
                                  style={{ width: '100%', fontSize: '0.66rem', padding: '0.2rem', border: '1.5px solid var(--teal)', borderRadius: 4, marginBottom: 3 }}>
                                  <option value="">Which teacher?</option>
                                  {spare.map(t => <option key={t.id} value={t.id}>{t.lastName}, {t.firstName}</option>)}
                                </select>
                                {newGroupStaff && (
                                  <>
                                    <input autoFocus value={query} onChange={e => search(e.target.value)}
                                      placeholder="Search child…"
                                      style={{ width: '100%', padding: '0.2rem 0.4rem', fontSize: '0.72rem', border: '1.5px solid var(--teal)', borderRadius: 4, outline: 'none' }} />
                                    {results.length > 0 && (
                                      <div style={{ position: 'absolute', zIndex: 40, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', top: '100%', left: 0, right: 0, maxHeight: 150, overflowY: 'auto' }}>
                                        {results.map(p => (
                                          <button key={p.id} onMouseDown={() => { pick(d.key, b, p, newGroupStaff); setNewGroupStaff('') }}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.25rem 0.5rem', fontSize: '0.72rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            {p.lastName}, {p.firstName}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <button onClick={() => { setAdding(key); setQuery(''); setResults([]); setNewGroupStaff('') }}
                                title="Start another teacher's group in this block"
                                style={{ width: '100%', background: 'transparent', border: '1px dashed #D6DCE2', borderRadius: 5, color: '#9AA2AC', fontSize: '0.66rem', padding: '0.3rem', cursor: 'pointer' }}>
                                + Teacher
                              </button>
                            )
                          })()}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
