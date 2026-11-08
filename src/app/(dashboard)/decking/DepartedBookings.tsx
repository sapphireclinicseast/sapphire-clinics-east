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
import { AlertTriangle, ArrowRight, Check, Clock, Layers, RefreshCw, UserX, Users } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
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

export default function DepartedBookings({ branch }: { branch: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [replacements, setReplacements] = useState<Record<string, Replacement[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moved, setMoved] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/decking/departed?branch=${encodeURIComponent(branch)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load')
        setRows(d.rows ?? [])
        setReplacements(d.replacements ?? {})
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
  useEffect(() => { setPicked({}); setMoved({}) }, [branch])

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

  if (loading) return <DepartedSkeleton />

  // Nothing loaded at all and the request failed: say so, rather than showing
  // the "all clear" state for a list we never received.
  if (error && rows.length === 0) {
    return (
      <ErrorCard title="Couldn't load bookings under departed staff" hint={error} onRetry={load} />
    )
  }

  const outstanding = rows.filter(r => !moved[r.slotId])

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
  const movedCount = rows.length - outstanding.length
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
          sub={childrenLeft === 1 ? 'child still to rehome' : 'children still to rehome'} />
        <KpiCard label="Weekly slots booked" icon={<Clock size={15} />}
          value={outstanding.length}
          sub={movedCount > 0 ? `${movedCount} moved just now` : 'standing slots each week'} />
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
        const left = g.rows.filter(r => !moved[r.slotId]).length
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
                const isMoving = movingId === r.slotId
                const mode = r.deliveryMode ? MODE_LABEL[r.deliveryMode] ?? r.deliveryMode : null
                return (
                  <li key={r.slotId}
                    className={`px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${done ? '' : 'transition-colors hover:bg-gray-50/70'}`}
                    style={{ borderTop: i === 0 ? undefined : '1px solid #EEF2F1', background: done ? DONE.bg : undefined }}>
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
                            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
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
