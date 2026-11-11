'use client'

// Bookings left behind by consultants who have gone.
//
// Grouped by the departed consultant rather than listed flat, because the
// question is always "what happens to Lenz's children now" — one person's
// caseload is the unit somebody actually works through.
//
// Moving a child is one row at a time, with the replacement chosen explicitly.
// There is no bulk move and no clear-all: these are real children with a
// standing slot, and the fastest way to do the wrong thing to sixteen of them
// at once would be a button that did all sixteen.

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Check, Clock, Layers, RefreshCw, RotateCcw, UserMinus, UserX, Users } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import type { DiscontinuedTag } from '@/app/api/decking/departed/route'
import { DashCard, KpiCard, Skeleton, EmptyState, DeptChip, CARD_STYLE } from '../patients/dashboard/ui'
import { Avatar, displayName, ErrorCard, CONTROL_SM, CONTROL_STYLE, BTN_SM, TEAL_HEX } from './ui'

interface Row {
  slotId: string
  staffId: string
  staffName: string
  branch: string
  department: string
  dayOfWeek: string
  startTime: string
  /** Already in the API response; read here for display only. */
  deliveryMode?: string | null
  patientId: string | null
  patientName: string
}
interface Replacement { id: string; name: string }
/** The board's own data for this branch, for the "who is free then" hints. Display only. */
interface BoardConfig { staffId: string; workDays: string[]; startTime: string; endTime: string }
interface BoardSlot { staffId: string; dayOfWeek: string; startTime: string; endTime: string; disabled: boolean; isClass?: boolean; date?: string | null }
type Fit = 'free' | 'booked' | 'off' | 'blocked'
const FIT_NOTE: Record<Exclude<Fit, 'free'>, string> = {
  booked: 'already has a patient then',
  blocked: 'marked unavailable then',
  off: 'not scheduled then',
}

/** Whole hours from start up to (not including) end: "10:00","11:00",… */
function hoursIn(start: string, end: string): string[] {
  const sh = Number(start.slice(0, 2)), eh = Number(end.slice(0, 2))
  const out: string[] = []
  for (let h = sh; h < eh; h++) out.push(`${String(h).padStart(2, '0')}:00`)
  return out
}

const DAY_LABEL: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}
const DAY_SHORT: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
}
// Same wording as the board's section tabs (lib/work-arrangement).
const MODE_LABEL: Record<string, string> = {
  ONSITE: 'On-site', TELETHERAPY: 'Teletherapy', HOMECARE: 'Homecare',
}

// Amber = "needs a decision", the same tone the original banner used.
const AMBER = { fg: '#B45309', bg: '#FEF6E7', border: '#F3D9A4' }
const DONE = { fg: '#166534', bg: '#F0FAF3', border: '#B9DFC4' }

function prettyTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function deptLabel(code: string): string {
  return code ? code.replace(/_/g, ' ') : 'No department'
}

/** Initials from a "First … Last" display name. */
function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const a = parts[0][0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (a + b).toUpperCase() || '?'
}

function Pill({ children, tone, title }: { children: ReactNode; tone: { fg: string; bg: string; border: string }; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 leading-none whitespace-nowrap"
      style={{ color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}` }}>
      {children}
    </span>
  )
}

function DepartedSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading bookings under departed staff">
      <Skeleton className="h-[64px] rounded-xl" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3" aria-hidden>
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
      </div>
      {[0, 1].map(i => (
        <div key={i} className="rounded-xl p-5" style={CARD_STYLE} aria-hidden>
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="rounded-full" style={{ width: 34, height: 34 }} />
            <div className="flex-1">
              <Skeleton className="h-3.5 mb-2" style={{ width: 180 }} />
              <Skeleton className="h-3" style={{ width: 120 }} />
            </div>
            <Skeleton className="h-5" style={{ width: 90 }} />
          </div>
          {[0, 1, 2].map(j => <Skeleton key={j} className="h-9 mb-2" />)}
        </div>
      ))}
    </div>
  )
}

export default function DepartedBookings({ branch, boardConfigs = [], boardSlots = [] }: {
  branch: string
  /** This branch's consultant schedules, as the board holds them. Display only. */
  boardConfigs?: BoardConfig[]
  /** This branch's weekly slots, as the board holds them. Display only. */
  boardSlots?: BoardSlot[]
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [replacements, setReplacements] = useState<Record<string, Replacement[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moved, setMoved] = useState<Record<string, string>>({})
  // Families who are not continuing. Keyed by slot id, seeded from the server
  // so the decision survives a reload — the whole point is that the next
  // person to open this page knows it was decided, not lost.
  const [stopped, setStopped] = useState<Record<string, DiscontinuedTag>>({})
  // Which row is having its reason typed, and what has been typed so far.
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/decking/departed?branch=${encodeURIComponent(branch)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load')
        setRows(d.rows ?? [])
        setReplacements(d.replacements ?? {})
        setStopped(d.discontinued ?? {})
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
    // Refetches when the board's branch toggle changes. Without `branch` here
    // the callback is created once and keeps the branch it closed over, so
    // switching tabs would leave the first branch's list on screen — which is
    // the other half of how Greenhills came to show East's bookings.
  }, [branch])

  useEffect(load, [load])

  // Per-branch UI state. These are keyed by slot id, and slot ids do not repeat
  // across branches — but leaving a previous branch's selections in place makes
  // the new list look part-filled, so they are cleared with the data.
  useEffect(() => { setPicked({}); setMoved({}); setNoteFor(null); setNoteText('') }, [branch])

  /** Record (or correct) a family's decision not to continue. */
  async function saveStopped(row: Row) {
    setSavingNote(true)
    try {
      const res = await fetch('/api/decking/departed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: row.slotId, remarks: noteText }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save that')
      setStopped(m => ({ ...m, [row.slotId]: d.discontinued }))
      setNoteFor(null); setNoteText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that')
    } finally {
      setSavingNote(false)
    }
  }

  /** Put the booking back on the list — they changed their mind, or it was the wrong row. */
  async function undoStopped(row: Row) {
    setSavingNote(true)
    try {
      const res = await fetch(`/api/decking/departed?slotId=${encodeURIComponent(row.slotId)}`,
        { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not undo that')
      setStopped(m => { const n = { ...m }; delete n[row.slotId]; return n })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo that')
    } finally {
      setSavingNote(false)
    }
  }

  async function move(row: Row) {
    const staffId = picked[row.slotId]
    if (!staffId) return
    setMovingId(row.slotId)
    try {
      const res = await fetch('/api/decking/slots', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.slotId, staffId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not move this booking')
      const to = (replacements[`${row.branch}||${row.department}`] ?? [])
        .find(r => r.id === staffId)
      // Marked done in place rather than vanishing: a row that disappears the
      // instant you press the button gives no chance to check it went where
      // you meant.
      setMoved(m => ({ ...m, [row.slotId]: to?.name ?? 'the new consultant' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move this booking')
    } finally {
      setMovingId(null)
    }
  }

  // Who could take a child at that day and hour, read from the board: free
  // (scheduled, nobody in it), booked, marked unavailable, or not scheduled.
  // Only a hint — Move still lets any consultant be chosen, as before.
  const offered = new Map<string, Set<string>>()
  for (const c of boardConfigs) {
    const set = offered.get(c.staffId) ?? new Set<string>()
    for (const d of c.workDays ?? []) for (const h of hoursIn(c.startTime, c.endTime)) set.add(`${d}|${h}`)
    offered.set(c.staffId, set)
  }
  const taken = new Map<string, 'booked' | 'blocked'>()
  for (const sl of boardSlots) {
    if (sl.date) continue
    const hrs = sl.isClass ? hoursIn(sl.startTime, sl.endTime) : [sl.startTime.slice(0, 5)]
    for (const h of hrs) {
      const k = `${sl.staffId}|${sl.dayOfWeek}|${h}`
      if (sl.disabled) taken.set(k, 'blocked')
      else if (!taken.has(k)) taken.set(k, 'booked')
    }
  }
  const haveBoard = boardConfigs.length > 0
  const fitOf = (staffId: string, day: string, start: string): Fit => {
    const hour = `${start.slice(0, 2)}:00`
    const t = taken.get(`${staffId}|${day}|${hour}`)
    if (t) return t
    // A child moved here a moment ago is not in the board data yet.
    if (rows.some(r => moved[r.slotId] && picked[r.slotId] === staffId && r.dayOfWeek === day && r.startTime.slice(0, 2) === start.slice(0, 2))) return 'booked'
    return offered.get(staffId)?.has(`${day}|${hour}`) ? 'free' : 'off'
  }

  if (loading) return <DepartedSkeleton />

  // Nothing loaded at all and the request failed: say so, rather than showing
  // the "all clear" state for a list we never received.
  if (error && rows.length === 0) {
    return (
      <ErrorCard title="Couldn't load bookings under departed staff" hint={error} onRetry={load} />
    )
  }

  // Not to move, and not outstanding: a family who are not continuing need no
  // consultant. They stay on the page, marked, so the decision is visible —
  // but every count here is about work left to do, and this is not work left.
  const outstanding = rows.filter(r => !moved[r.slotId] && !stopped[r.slotId])
  const stoppedCount = rows.filter(r => stopped[r.slotId] && !moved[r.slotId]).length

  if (rows.length === 0) {
    return (
      <div className="rounded-xl" style={CARD_STYLE}>
        <div className="pt-10 flex justify-center">
          <span className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: DONE.bg, color: DONE.fg, border: `1px solid ${DONE.border}` }}>
            <Check size={20} />
          </span>
        </div>
        <EmptyState
          title="No bookings left under departed staff — all clear"
          hint="Every booking on the board belongs to a consultant who still works here."
        />
      </div>
    )
  }

  // Grouped in render order, which the API already sorted by name then day.
  const groups: { key: string; rows: Row[] }[] = []
  for (const r of rows) {
    const key = `${r.staffId}||${r.branch}||${r.department}`
    const g = groups.find(x => x.key === key)
    if (g) g.rows.push(r); else groups.push({ key, rows: [r] })
  }

  // KPI figures — derived from the rows already loaded, and counted on what is
  // still to move so they fall as bookings are rehomed.
  // Counted directly, not as "rows minus outstanding". Outstanding now also
  // excludes the families who are not continuing, and subtracting would report
  // those as moved — which is the opposite of what happened to them.
  const movedCount = rows.filter(r => moved[r.slotId]).length
  const consultantsLeft = new Set(outstanding.map(r => r.staffId)).size
  const consultantsAll = new Set(rows.map(r => r.staffId)).size
  const childrenLeft = new Set(outstanding.map(r => r.patientId ?? `name:${r.patientName}`)).size
  const byDept = new Map<string, number>()
  for (const r of outstanding) byDept.set(r.department, (byDept.get(r.department) ?? 0) + 1)
  const deptList = [...byDept.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Why this list exists and what to do with it. */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}` }}>
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: AMBER.fg }} />
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
            {outstanding.length} booking{outstanding.length === 1 ? '' : 's'} under consultants who have left
          </p>
          <p className="text-[13px] leading-relaxed mt-0.5" style={{ color: '#5A6470' }}>
            These children still hold a standing slot, but the consultant no longer appears on the board, so
            nobody at the desk can see them. Move each one to a consultant who works that department at that
            branch, or leave it and handle the family directly — this page does nothing on its own.
          </p>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Departed consultants" icon={<UserX size={15} />} accent={AMBER.fg}
          value={consultantsLeft}
          sub={`with bookings still to move · ${consultantsAll} in all`} />
        <KpiCard label="Children affected" icon={<Users size={15} />}
          value={childrenLeft}
          sub={`${childrenLeft === 1 ? 'child' : 'children'} still to rehome`
            // Named beside the figure rather than hidden in the rows: a desk
            // that has worked through the list should be able to see WHY the
            // number fell, and "we stopped chasing them" is a different
            // outcome from "we found them a consultant".
            + (stoppedCount > 0 ? ` · ${stoppedCount} not continuing` : '')} />
        <KpiCard label="Weekly slots booked" icon={<Clock size={15} />}
          value={outstanding.length}
          sub={movedCount > 0 ? `${movedCount} moved just now`
            : stoppedCount > 0 ? `${stoppedCount} not continuing, not counted`
            : 'standing slots each week'} />
        <KpiCard label="By department" icon={<Layers size={15} />}
          value={
            deptList.length === 0
              ? <span className="text-sm font-semibold" style={{ color: DONE.fg }}>All moved</span>
              : (
                <span className="flex flex-wrap gap-1.5 pt-1">
                  {deptList.map(([dept, n]) => (
                    <span key={dept || 'none'} className="inline-flex items-center gap-1">
                      <DeptChip code={deptLabel(dept)} color={TEAL_HEX} />
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{n}</span>
                    </span>
                  ))}
                </span>
              )
          } />
      </div>

      {/* A failed move (or a failed reload) while the list is on screen. */}
      {error && (
        <div role="alert" className="rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertTriangle size={15} className="flex-shrink-0" style={{ color: '#DC2626' }} />
          <p className="text-[13px] flex-1 min-w-0" style={{ color: '#991B1B' }}>{error}</p>
          <button type="button" onClick={load} className={BTN_SM} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      )}

      {groups.map(g => {
        const head = g.rows[0]
        const options = replacements[`${head.branch}||${head.department}`] ?? []
        const left = g.rows.filter(r => !moved[r.slotId] && !stopped[r.slotId]).length
        const name = displayName(head.staffName)
        const where = branchLabel(head.branch) ?? head.branch
        return (
          <DashCard
            key={g.key}
            flush
            icon={<Avatar text={nameInitials(head.staffName)} size={34} />}
            title={name}
            description={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <DeptChip code={deptLabel(head.department)} color={TEAL_HEX} />
                <span>{where}</span>
                <span aria-hidden>·</span>
                <Pill tone={AMBER}>no longer active</Pill>
              </span>
            }
            action={
              left === 0
                ? <Pill tone={DONE}><Check size={11} /> All {g.rows.length} moved</Pill>
                : (
                  <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                    <span style={{ color: 'var(--charcoal)', fontSize: '0.95rem' }}>{left}</span> of {g.rows.length} still to move
                  </span>
                )
            }
          >
            {options.length === 0 && left > 0 ? (
              <p className="px-5 py-2.5 text-xs leading-relaxed flex items-start gap-2"
                style={{ color: AMBER.fg, background: AMBER.bg, borderBottom: `1px solid ${AMBER.border}` }}>
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  No active consultant works {head.department} at {where}, so there is
                  nobody to move these to from here. This needs a staffing decision first.
                </span>
              </p>
            ) : left > 0 && (
              <p className="px-5 py-2 text-xs flex items-center gap-1.5"
                style={{ color: 'var(--mid-gray)', background: '#F6F9F8', borderBottom: '1px solid #EEF2F1' }}>
                <ArrowRight size={12} style={{ color: 'var(--teal)' }} />
                Pick a {deptLabel(head.department)} consultant at {where} for each child, then press <strong style={{ color: 'var(--charcoal)' }}>Move</strong>.
              </p>
            )}

            <ul>
              {g.rows.map((r, i) => {
                const done = moved[r.slotId]
                const stop = stopped[r.slotId]
                const noting = noteFor === r.slotId
                const isMoving = movingId === r.slotId
                const mode = r.deliveryMode ? MODE_LABEL[r.deliveryMode] ?? r.deliveryMode : null
                return (
                  <li key={r.slotId}
                    className={`px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${done ? '' : 'transition-colors hover:bg-gray-50/70'}`}
                    style={{ borderTop: i === 0 ? undefined : '1px solid #EEF2F1',
                             background: done ? DONE.bg : stop ? '#F7F8F9' : undefined,
                             opacity: stop && !noting ? 0.72 : 1 }}>
                    {/* Who and when */}
                    <div className="flex items-center gap-3 min-w-0" style={{ flex: '1 1 16rem' }}>
                      <span
                        title={DAY_LABEL[r.dayOfWeek] ?? r.dayOfWeek}
                        className="flex-shrink-0 text-center text-[11px] font-bold uppercase rounded-full px-2 py-0.5"
                        style={{ minWidth: '2.8rem', letterSpacing: '0.03em', color: 'var(--teal)', background: 'var(--pale-teal)', border: '1px solid var(--light-gray)' }}>
                        {DAY_SHORT[r.dayOfWeek] ?? r.dayOfWeek}
                      </span>
                      <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)', minWidth: '4.6rem' }}>
                        {prettyTime(r.startTime)}
                      </span>
                      <span className="text-[13px] font-semibold truncate min-w-0" title={r.patientName} style={{ color: 'var(--charcoal)' }}>
                        {displayName(r.patientName)}
                      </span>
                      {mode && (
                        <span className="flex-shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap"
                          style={{ color: '#5A6470', background: '#F3F6F5', border: '1px solid var(--light-gray)' }}>
                          {mode}
                        </span>
                      )}
                    </div>

                    {/* Move to */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0" style={{ flex: '0 1 auto', marginLeft: 'auto' }}>
                      {done ? (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: DONE.fg }}>
                          <Check size={14} /> Moved to {done}
                        </span>
                      ) : noting ? (
                        // Asked for in the same row rather than a dialog: the
                        // reason is short, and a modal would hide the child's
                        // name and hour while it is being typed.
                        <>
                          <label htmlFor={`dp-note-${r.slotId}`} className="sr-only">
                            Why {displayName(r.patientName)} is not continuing
                          </label>
                          <input
                            id={`dp-note-${r.slotId}`}
                            autoFocus
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveStopped(r)
                              if (e.key === 'Escape') { setNoteFor(null); setNoteText('') }
                            }}
                            placeholder="Reason — moved away, finished, transferred…"
                            className={CONTROL_SM}
                            style={{ ...CONTROL_STYLE, minWidth: 260, maxWidth: '100%' }}
                          />
                          <button type="button" onClick={() => saveStopped(r)} disabled={savingNote}
                            className={BTN_SM}
                            style={{ background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }}>
                            {savingNote ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setNoteFor(null); setNoteText('') }}
                            disabled={savingNote} className={BTN_SM}
                            style={{ background: '#F3F6F5', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
                            Cancel
                          </button>
                        </>
                      ) : stop ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: '#7A5C00' }}>
                            <UserMinus size={14} aria-hidden /> Not continuing
                          </span>
                          {stop.remarks && (
                            <span className="text-[12px] truncate" title={stop.remarks}
                              style={{ color: 'var(--mid-gray)', maxWidth: '22rem' }}>
                              &ldquo;{stop.remarks}&rdquo;
                            </span>
                          )}
                          <span className="text-[11px] whitespace-nowrap" style={{ color: '#9AA0A6' }}>
                            {stop.setByName ? `${stop.setByName} · ` : ''}
                            {new Date(stop.at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <button type="button" disabled={savingNote}
                            onClick={() => { setNoteFor(r.slotId); setNoteText(stop.remarks) }}
                            className={BTN_SM}
                            style={{ background: '#F3F6F5', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
                            Edit note
                          </button>
                          {/* Not a delete: the booking was never changed, so
                              putting it back is removing the tag. */}
                          <button type="button" onClick={() => undoStopped(r)} disabled={savingNote}
                            className={BTN_SM}
                            style={{ background: '#fff', color: 'var(--teal)', border: '1px solid var(--light-gray)' }}>
                            <RotateCcw size={13} aria-hidden /> Put back
                          </button>
                        </>
                      ) : (
                        <>
                          <label htmlFor={`dp-move-${r.slotId}`} className="sr-only">
                            Move {displayName(r.patientName)} to
                          </label>
                          <select
                            id={`dp-move-${r.slotId}`}
                            value={picked[r.slotId] ?? ''}
                            onChange={e => setPicked(p => ({ ...p, [r.slotId]: e.target.value }))}
                            disabled={options.length === 0}
                            className={`${CONTROL_SM} disabled:opacity-60`}
                            style={{ ...CONTROL_STYLE, minWidth: 200, maxWidth: '100%' }}
                          >
                            <option value="">Choose a consultant…</option>
                            {haveBoard ? (() => {
                              // Free first, so the obvious choice is at the top.
                              const when = `${DAY_SHORT[r.dayOfWeek] ?? r.dayOfWeek} ${prettyTime(r.startTime)}`
                              const by = (f: Fit) => options.filter(o => fitOf(o.id, r.dayOfWeek, r.startTime) === f)
                              const free = by('free'), busy = [...by('booked'), ...by('blocked')], off = by('off')
                              return (
                                <>
                                  {free.length > 0 && <optgroup label={`Free ${when}`}>{free.map(o => <option key={o.id} value={o.id}>{displayName(o.name)}</option>)}</optgroup>}
                                  {busy.length > 0 && <optgroup label={`Busy ${when}`}>{busy.map(o => <option key={o.id} value={o.id}>{displayName(o.name)}</option>)}</optgroup>}
                                  {off.length > 0 && <optgroup label={`Not scheduled ${when}`}>{off.map(o => <option key={o.id} value={o.id}>{displayName(o.name)}</option>)}</optgroup>}
                                </>
                              )
                            })() : options.map(o => <option key={o.id} value={o.id}>{displayName(o.name)}</option>)}
                          </select>
                          {haveBoard && !picked[r.slotId] && options.length > 0 && !options.some(o => fitOf(o.id, r.dayOfWeek, r.startTime) === 'free') && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: AMBER.fg }}
                              title="No one in this department is scheduled and empty at this day and hour — the child may need a new time as well as a new consultant">
                              <Clock size={12} aria-hidden /> No one free then
                            </span>
                          )}
                          {haveBoard && picked[r.slotId] && (() => {
                            const fit = fitOf(picked[r.slotId], r.dayOfWeek, r.startTime)
                            return fit === 'free' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: DONE.fg }}>
                                <Check size={12} aria-hidden /> Free then
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: AMBER.fg }}
                                title="You can still move them — this is only a heads-up">
                                <AlertTriangle size={12} aria-hidden /> {FIT_NOTE[fit]}
                              </span>
                            )
                          })()}
                          <button
                            type="button"
                            onClick={() => move(r)}
                            disabled={!picked[r.slotId] || isMoving}
                            className={BTN_SM}
                            style={picked[r.slotId]
                              ? { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }
                              : { background: '#F3F6F5', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)', cursor: 'default' }}
                          >
                            <ArrowRight size={13} />
                            {isMoving ? 'Moving…' : 'Move'}
                          </button>
                          {/* The other outcome. Quiet rather than competing
                              with Move — rehoming is what should usually
                              happen, and this is the exception. */}
                          <button type="button" onClick={() => { setNoteFor(r.slotId); setNoteText('') }}
                            disabled={isMoving} className={BTN_SM}
                            title={`${displayName(r.patientName)} is not continuing with us`}
                            style={{ background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
                            <UserMinus size={13} aria-hidden /> Not continuing
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </DashCard>
        )
      })}
    </div>
  )
}
