'use client'

// Interdepartment — who on this branch's decking board already sees more than
// one department, and who does not yet.
//
// The second list is the point of the screen: it is the cross-sell list, and it
// leads, because the patients who are already interdepartment need nothing
// doing.
//
// This is the one analysis tab front desk can see, so it is laid out for the
// desk rather than for an analyst: a one-line purpose, three numbers, and two
// short patient lists. Search and the department filter are display-only —
// they narrow the rows already loaded and never refetch.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Users, Search, X, Plus, Lightbulb, Link2, UserPlus } from 'lucide-react'
import { DashCard, KpiCard, Skeleton, EmptyState, DeptChip } from '../patients/dashboard/ui'
import { Avatar, initials, displayName, PillTabs, ErrorCard, CONTROL, CONTROL_STYLE, LABEL, BTN_SECONDARY, BTN_SM } from './ui'
import { deptColor } from '@/lib/dept-colors'

interface Row {
  id: string
  name: string
  departments: string[]
  otherBranchDepartments: string[]
  departmentCount: number
  suggestions: string[]
}

interface Payload {
  interdepartment: Row[]
  singleDepartment: Row[]
  summary: { total: number; interdepartment: number; singleDepartment: number; withSuggestion: number }
  pairs: string[]
}

type Group = 'cross' | 'multi'

/** A suggested department: outlined and dashed, so it never reads as one the patient already has. */
function AddChip({ code }: { code: string }) {
  const color = deptColor(code)
  return (
    <span title={`Could add ${code}`}
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-px rounded leading-none align-middle"
      style={{ border: `1px dashed ${color}`, color, background: '#fff' }}>
      <Plus size={9} strokeWidth={3} aria-hidden />{code}
      <span className="sr-only"> (suggested)</span>
    </span>
  )
}

function ChipRow({ children }: { children: ReactNode }) {
  return <span className="inline-flex flex-wrap items-center gap-1">{children}</span>
}

const NONE = <span className="text-xs" style={{ color: '#9ca3af' }}>—</span>

function PatientRow({ r, group }: { r: Row; group: Group }) {
  // Names arrive as "Last, First".
  const [last = '', first = ''] = r.name.split(',').map(s => s.trim())
  return (
    <li className="grid items-center gap-x-4 gap-y-1.5 px-5 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]"
      style={{ borderTop: '1px solid #F1F3F5' }}>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar text={initials(first, last)} size={32} />
        <span className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }} title={displayName(r.name)}>
          {displayName(r.name)}
        </span>
      </div>

      <div className="flex items-baseline gap-2 min-w-0 pl-11 md:pl-0">
        <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>Sees</span>
        <ChipRow>
          {r.departments.map(d => <DeptChip key={d} code={d} color={deptColor(d)} />)}
          {/* Named explicitly rather than blended in: front desk here cannot
              see the other branch's board, so an unexplained department would
              look like an error. */}
          {r.otherBranchDepartments.length > 0 && (
            <>
              <span className="text-[11px]" style={{ color: '#9ca3af' }}>· other branch:</span>
              {r.otherBranchDepartments.map(d => (
                <span key={d} style={{ opacity: 0.55 }} title={`${d} at the other branch`}>
                  <DeptChip code={d} color={deptColor(d)} />
                </span>
              ))}
            </>
          )}
        </ChipRow>
      </div>

      <div className="flex items-baseline gap-2 min-w-0 pl-11 md:pl-0">
        <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
          {group === 'cross' ? 'Could add' : 'Could still add'}
        </span>
        {r.suggestions.length === 0 ? NONE : (
          <ChipRow>{r.suggestions.map(d => <AddChip key={d} code={d} />)}</ChipRow>
        )}
      </div>
    </li>
  )
}

function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i ? '1px solid #F1F3F5' : undefined }}>
          <Skeleton style={{ width: 32, height: 32, borderRadius: 999 }} />
          <Skeleton className="h-3.5" style={{ width: 170, maxWidth: '40%' }} />
          <Skeleton className="h-3.5 ml-auto" style={{ width: 70 }} />
          <Skeleton className="h-3.5 hidden md:block" style={{ width: 70 }} />
        </li>
      ))}
    </ul>
  )
}

export default function InterdepartmentBoard({ branch }: { branch: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  // Display-only: which list is showing, and a department to narrow it to.
  const [group, setGroup] = useState<Group>('cross')
  const [dept, setDept] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/decking/interdepartment?branch=${encodeURIComponent(branch)}`, { signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load')
        setData(d)
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [branch])

  // Name search: every typed word must appear, so "Juan Cruz" finds
  // "Cruz, Juan". Department: the patient sees it (either branch) or it is
  // suggested for them.
  const { cross, multi } = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filt = (rows: Row[]) => rows.filter(r => {
      if (words.length) {
        const name = r.name.toLowerCase()
        if (!words.every(w => name.includes(w))) return false
      }
      if (dept && !r.departments.includes(dept) && !r.otherBranchDepartments.includes(dept) && !r.suggestions.includes(dept)) return false
      return true
    })
    return { cross: filt(data?.singleDepartment ?? []), multi: filt(data?.interdepartment ?? []) }
  }, [data, q, dept])

  // Every department that appears anywhere in the loaded rows — the filter only
  // offers what can match.
  const deptOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of [...(data?.interdepartment ?? []), ...(data?.singleDepartment ?? [])]) {
      for (const d of [...r.departments, ...r.otherBranchDepartments, ...r.suggestions]) set.add(d)
    }
    return [...set].sort()
  }, [data])

  // The pairing seen most often among patients already in 2+ departments,
  // counted across both branches (the same basis that makes them
  // interdepartment).
  const topPair = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of data?.interdepartment ?? []) {
      const all = [...new Set([...r.departments, ...r.otherBranchDepartments])].sort()
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const key = `${all[i]} + ${all[j]}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
    let best: { pair: string; n: number } | null = null
    for (const [pair, n] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!best || n > best.n) best = { pair, n }
    }
    return best
  }, [data])

  const filtering = q.trim() !== '' || dept !== ''
  const clearFilters = () => { setQ(''); setDept('') }

  const intro = (
    <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5" style={{ background: '#E6F2F4', border: '1px solid #A9CBEC', color: '#14507F' }}>
      <Lightbulb size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
      <span className="text-[13px] leading-relaxed">
        Patients who could also benefit from another department — a starting point for a conversation at the desk.
      </span>
    </div>
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading interdepartment list">
        {intro}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-hidden>
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
        </div>
        <Skeleton className="h-14 rounded-xl" />
        <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <ListSkeleton />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {intro}
        <ErrorCard title="Couldn't load the interdepartment list" hint={error} />
      </div>
    )
  }
  if (!data) return null

  const s = data.summary
  const rows = group === 'cross' ? cross : multi
  const groupTotal = group === 'cross' ? data.singleDepartment.length : data.interdepartment.length

  const countBadge = (n: number, active: boolean) => (
    <span className="tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
      style={{ background: active ? 'var(--pale-teal)' : 'rgba(0,0,0,0.06)', color: active ? 'var(--teal)' : 'var(--mid-gray)' }}>
      {n}
    </span>
  )

  return (
    <div className="flex flex-col gap-4">
      {intro}

      {/* ── KPIs — from the loaded list only ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Could add a department" icon={<UserPlus size={15} />}
          value={s.withSuggestion}
          sub={`of ${s.singleDepartment} seeing one department`} />
        <KpiCard label="Already in 2+ departments" icon={<Users size={15} />}
          value={s.interdepartment}
          sub={`of ${s.total} patients on this board`} />
        <KpiCard label="Most common pairing" icon={<Link2 size={15} />}
          value={topPair ? topPair.pair : '—'}
          sub={topPair ? `${topPair.n} ${topPair.n === 1 ? 'patient sees' : 'patients see'} both` : 'No patient in 2+ departments yet'} />
      </div>

      {/* ── Toolbar ── */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-end gap-3" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <div className="flex-1 min-w-[12rem] sm:flex-none">
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="ix-name">Patient</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              id="ix-name"
              type="search"
              className={`${CONTROL} pl-8 w-full sm:w-[15rem]`}
              style={CONTROL_STYLE}
              placeholder="Search by name…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="min-w-[9rem]">
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="ix-dept" title="Departments a patient sees, or could add">Department</label>
          <select id="ix-dept" value={dept} onChange={e => setDept(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
            <option value="">All departments</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button type="button" onClick={clearFilters} disabled={!filtering} className={BTN_SECONDARY} style={CONTROL_STYLE}>
          <X size={14} /> Clear
        </button>
        <span className="ml-auto h-9 flex items-center text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
          <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{rows.length}</strong>
          {filtering ? <>{' of '}<span className="tabular-nums">{groupTotal}</span></> : null}{' patients'}
        </span>
      </div>

      {/* ── The two lists. Cross-sell first: it is the one with work in it. ── */}
      <DashCard
        title={group === 'cross' ? 'Could add a department' : 'Already in 2+ departments'}
        icon={<Users size={15} />}
        description={group === 'cross'
          ? 'Seeing one department only. The outlined + chips are what could be offered next.'
          : 'Already seeing more than one department, here or at the other branch.'}
        action={
          <PillTabs label="Patient group" value={group} onChange={id => setGroup(id as Group)} tabs={[
            { id: 'cross', label: <>Could add a department {countBadge(cross.length, group === 'cross')}</> },
            { id: 'multi', label: <>Already in 2+ {countBadge(multi.length, group === 'multi')}</> },
          ]} />
        }
        flush
        footer={<>
          Suggestions come from the combinations this clinic actually sees — {data.pairs.join(', ')} — rather than
          every department a patient does not have. A patient already seeing a department at the other branch counts as
          interdepartment, so nothing is suggested that they are getting elsewhere.
        </>}
      >
        {rows.length === 0 ? (
          filtering ? (
            <div>
              <EmptyState title="No patients match" hint="Try a different name or department, or clear the filters." />
              <div className="-mt-6 pb-8 text-center">
                <button type="button" onClick={clearFilters} className={BTN_SM} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                  <X size={12} /> Clear filters
                </button>
              </div>
            </div>
          ) : s.total === 0 ? (
            <EmptyState title="No patients on this board yet" hint="Patients appear here once they have a slot on the decking board." />
          ) : group === 'cross' ? (
            <EmptyState title="Every patient on this board already sees more than one department." />
          ) : (
            <EmptyState title="No patient on this board sees more than one department yet." />
          )
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--mid-gray)', background: '#F7F9FA' }}>
              <span>Patient</span>
              <span>{group === 'cross' ? 'Sees now' : 'Departments'}</span>
              <span>{group === 'cross' ? 'Could add' : 'Could still add'}</span>
            </div>
            <ul className="-mt-px">
              {rows.map(r => <PatientRow key={r.id} r={r} group={group} />)}
            </ul>
          </>
        )}
      </DashCard>
    </div>
  )
}
