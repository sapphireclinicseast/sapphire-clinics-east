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

export default function SpedClassBoard({
  slots, staff, branchName, onAddChild, onRemove, onCreateBlock,
}: {
  slots: SpedSlot[]
  staff: SpedStaff[]
  branchName: string
  onAddChild: (block: { staffId: string; dayOfWeek: string; startTime: string; endTime: string }, patientId: string) => Promise<void>
  onRemove: (slotId: string) => Promise<void>
  onCreateBlock: (block: { staffId: string; dayOfWeek: string; startTime: string; endTime: string }) => Promise<void>
}) {
  const [adding, setAdding] = useState<string | null>(null)   // "day|start|end"
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpedPatient[]>([])
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [form, setForm] = useState({ staffId: '', dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  interface Block { staffId: string; startTime: string; endTime: string }
  const blockKey = (s: Block) => `${s.staffId}|${s.startTime}|${s.endTime}`
  const teacherName = (staffId: string) => {
    const t = staff.find(x => x.id === staffId)
    return t ? `${t.lastName}, ${t.firstName}` : 'Unassigned teacher'
  }
  const blocks: Block[] = Array.from(new Set(live.map(blockKey)))
    .map(k => { const [staffId, startTime, endTime] = k.split('|'); return { staffId, startTime, endTime } })
    .sort((a, b) =>
      mins(a.startTime) - mins(b.startTime) ||
      mins(a.endTime) - mins(b.endTime) ||
      teacherName(a.staffId).localeCompare(teacherName(b.staffId)))

  const cell = (day: string, b: Block) =>
    live.filter(s =>
      s.dayOfWeek === day && s.staffId === b.staffId &&
      s.startTime === b.startTime && s.endTime === b.endTime)

  async function search(v: string) {
    setQuery(v)
    if (v.trim().length < 2) { setResults([]); return }
    try {
      const r = await fetch(`/api/patients/search?q=${encodeURIComponent(v)}`)
      if (r.ok) setResults(await r.json())
    } catch { setResults([]) }
  }

  async function pick(day: string, b: Block, p: SpedPatient) {
    // The row IS a teacher's class, so the child joins that teacher — no
    // guessing from the cell, the form or the first consultant on the roster.
    // That guesswork is what used to fail on any day the class did not already
    // run.
    const staffId = b.staffId
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
                  <td style={{ ...td, background: '#F7F8FA', minWidth: 160 }}>
                    {/* The teacher leads: with two classes running at the same
                        hour, the time alone does not identify the row. */}
                    <div style={{
                      display: 'inline-block', maxWidth: '100%', marginBottom: 3,
                      background: '#EFE9FA', border: '1px solid #D6C9F0', borderRadius: 4,
                      padding: '0.1rem 0.4rem', fontSize: '0.7rem', fontWeight: 800, color: '#4C1D95',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={teacherName(b.staffId)}>
                      {teacherName(b.staffId)}
                    </div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(b.startTime)} &ndash; {fmt(b.endTime)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--mid-gray)' }}>
                      {durationLabel(b.startTime, b.endTime)}
                    </div>
                  </td>
                  {DAYS.map(d => {
                    const kids = cell(d.key, b)
                    const key = `${d.key}|${b.staffId}|${b.startTime}|${b.endTime}`
                    const isAdding = adding === key
                    return (
                      <td key={d.key} style={td}>
                        {kids.length === 0 && !isAdding ? (
                          <button onClick={() => { setAdding(key); setQuery(''); setResults([]) }}
                            style={{ width: '100%', background: 'transparent', border: '1px dashed #D6DCE2', borderRadius: 5, color: '#9AA2AC', fontSize: '0.7rem', padding: '0.35rem', cursor: 'pointer' }}>
                            +
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {kids.map(s => (
                              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#EFE9FA', border: '1px solid #D6C9F0', borderRadius: 4, padding: '0.15rem 0.35rem' }}>
                                <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: '#4C1D95', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '(slot)'}>
                                  {s.patient ? `${s.patient.lastName}, ${s.patient.firstName[0]}.` : '(slot)'}
                                </span>
                                <button onClick={() => onRemove(s.id)} title="Remove from class"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0453A', padding: 0, lineHeight: 1 }}>
                                  <X size={9} />
                                </button>
                              </div>
                            ))}
                            {isAdding ? (
                              <div style={{ position: 'relative' }}>
                                <input autoFocus value={query} onChange={e => search(e.target.value)}
                                  placeholder="Search child…"
                                  onBlur={() => setTimeout(() => setAdding(null), 200)}
                                  style={{ width: '100%', padding: '0.2rem 0.4rem', fontSize: '0.72rem', border: '1.5px solid var(--teal)', borderRadius: 4, outline: 'none' }} />
                                {results.length > 0 && (
                                  <div style={{ position: 'absolute', zIndex: 40, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', top: '100%', left: 0, right: 0, maxHeight: 150, overflowY: 'auto' }}>
                                    {results.map(p => (
                                      <button key={p.id} onMouseDown={() => pick(d.key, b, p)}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.25rem 0.5rem', fontSize: '0.72rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                                        {p.lastName}, {p.firstName}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* No cap here — a class is as big as it is. */
                              <button onClick={() => { setAdding(key); setQuery(''); setResults([]) }}
                                title={`Add another child — ${kids.length} in this class`}
                                style={{ background: 'transparent', border: 'none', borderTop: '1px solid #E6E9ED', cursor: 'pointer', color: '#7C6BA8', fontSize: '0.68rem', fontWeight: 700, padding: '1px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                <Plus size={9} /> Add child
                              </button>
                            )}
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
      )}
    </div>
  )
}
