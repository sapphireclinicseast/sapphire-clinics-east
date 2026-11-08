'use client'

import { useEffect, useState } from 'react'
import { statusLabel, NON_ATTENDED_STATUSES } from '@/lib/schedule-status'
import SessionOutcomePrompt, { type OutcomeTarget } from '@/components/SessionOutcomePrompt'
import { Pencil, X, ChevronUp, ChevronDown, ChevronsUpDown, Activity } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { localTodayStr } from '@/lib/utils'
import { EmptyState, DeptChip, Skeleton, CARD_STYLE } from '../patients/dashboard/ui'
import { PillTabs, CONTROL, CONTROL_SM, CONTROL_STYLE } from '../decking/ui'
import {
  Toolbar, Field, UpdatingHint, ErrorBanner, TableSkeleton, StatusBadge, CardBar, TodayTag,
  fmtLongDate, statusStyle, deptColor, TH, TH_BG,
} from './ui'

const ALL_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW']

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

interface StaffInfo { id: string; firstName: string; lastName: string; department: string; branch: string }
interface PatientInfo { id: string; firstName: string; lastName: string; email: string | null; branch?: string | null; branches?: string[] }
interface StatusSchedule {
  id: string; startTime: string; endTime: string; sessionType: string; status: string
  staff: StaffInfo; patient: PatientInfo | null
}

type SortCol = 'department' | 'staff' | 'patient' | 'time' | 'sessionType' | 'status'
type SortDir = 'asc' | 'desc'

interface ColFilters {
  department: string
  staff: string
  patient: string
  time: string
  sessionType: string
  status: string
}

const COLUMNS: { key: SortCol; label: string }[] = [
  { key: 'department',  label: 'Department' },
  { key: 'staff',       label: 'Staff' },
  { key: 'patient',     label: 'Patient' },
  { key: 'time',        label: 'Time' },
  { key: 'sessionType', label: 'Type of Session' },
  { key: 'status',      label: 'Status' },
]

function getSortValue(s: StatusSchedule, col: SortCol): string {
  switch (col) {
    case 'department':  return s.staff.department
    case 'staff':       return `${s.staff.lastName} ${s.staff.firstName}`
    case 'patient':     return s.patient ? `${s.patient.lastName} ${s.patient.firstName}` : ''
    case 'time':        return s.startTime
    case 'sessionType': return s.sessionType
    case 'status':      return s.status
  }
}

export default function StatusView({ role, selectedDate, onDateChange }: { role: string; selectedDate: string; onDateChange: (d: string) => void }) {
  const branches = visibleBranches(role)
  const isMultiBranch = branches.length > 1
  const [activeBranch, setActiveBranch] = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<OutcomeTarget | null>(null)

  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [colFilters, setColFilters] = useState<ColFilters>({
    department: '', staff: '', patient: '', time: '', sessionType: '', status: '',
  })

  const [schedules, setSchedules] = useState<StatusSchedule[]>([])
  const [loading, setLoading]     = useState(false)
  // Display-only: first-load flag, last error, and a retry counter.
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clinic-schedule?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => {
        setSchedules(Array.isArray(data) ? data : [])
        setLoadError(Array.isArray(data) ? '' : ((data && typeof data.error === 'string' && data.error) || "Couldn't load this day's schedule."))
      })
      .catch(() => setLoadError("Couldn't load this day's schedule. Check your connection, then try again."))
      .finally(() => { setLoading(false); setHasLoaded(true) })
  }, [selectedDate, reloadKey])

  async function handleStatusChange(id: string, newStatus: string) {
    const sched = schedules.find(s => s.id === id)
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s))
    try {
      await fetch('/api/clinic-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
    } catch (err) {
      console.error('[StatusView] Failed to update status', err)
      return   // status did not save — do not offer to log an outcome that is not recorded
    }

    // Offer the Patient Relationship log only for statuses that carry a fee
    // consequence, and only after the status itself is safely saved.
    if ((NON_ATTENDED_STATUSES as readonly string[]).includes(newStatus)) {
      // Patient.branches is the current multi-branch field; .branch is the
      // legacy single-branch column kept for older records.
      const branch = sched?.patient?.branches?.[0] ?? sched?.patient?.branch ?? null
      setOutcome({
        scheduleId: id,
        status: newStatus as OutcomeTarget['status'],
        patientId: sched?.patient?.id ?? null,
        patientName: sched?.patient ? `${sched.patient.firstName} ${sched.patient.lastName}` : 'This session',
        branch,
      })
    }
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function setFilter(col: SortCol, val: string) {
    setColFilters(prev => ({ ...prev, [col]: val }))
  }

  // Branch filter
  const branchSchedules = schedules.filter(s => {
    if (!branches.includes(s.staff.branch)) return false
    if (isMultiBranch && activeBranch !== 'All') return s.staff.branch === activeBranch
    return true
  })

  // Status pill filter
  const pillFiltered = statusFilter === 'All'
    ? branchSchedules
    : branchSchedules.filter(s => s.status === statusFilter)

  // Column text filters
  const colFiltered = pillFiltered.filter(s => {
    if (colFilters.department && !s.staff.department.toLowerCase().includes(colFilters.department.toLowerCase())) return false
    if (colFilters.staff) {
      const name = `${s.staff.lastName} ${s.staff.firstName}`.toLowerCase()
      if (!name.includes(colFilters.staff.toLowerCase())) return false
    }
    if (colFilters.patient) {
      const pname = s.patient ? `${s.patient.lastName} ${s.patient.firstName}`.toLowerCase() : ''
      if (!pname.includes(colFilters.patient.toLowerCase())) return false
    }
    if (colFilters.time) {
      const display = `${formatTime(s.startTime)} ${formatTime(s.endTime)}`.toLowerCase()
      if (!display.includes(colFilters.time.toLowerCase())) return false
    }
    if (colFilters.sessionType && !s.sessionType.toLowerCase().includes(colFilters.sessionType.toLowerCase())) return false
    if (colFilters.status && !s.status.toLowerCase().includes(colFilters.status.toLowerCase())) return false
    return true
  })

  // Sort
  const sorted = [...colFiltered].sort((a, b) => {
    if (sortCol) {
      const cmp = getSortValue(a, sortCol).localeCompare(getSortValue(b, sortCol))
      return sortDir === 'asc' ? cmp : -cmp
    }
    // Default: department → staff name → time
    const dept = a.staff.department.localeCompare(b.staff.department)
    if (dept !== 0) return dept
    const name = a.staff.lastName.localeCompare(b.staff.lastName)
    if (name !== 0) return name
    return a.startTime.localeCompare(b.startTime)
  })

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ChevronsUpDown size={12} style={{ color: 'var(--mid-gray)', opacity: 0.5 }} />
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ color: 'var(--teal)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--teal)' }} />
  }

  // ── Display-only derived values ──
  const isToday = selectedDate === localTodayStr()
  const refreshing = loading && hasLoaded
  const countFor = (st: string) => st === 'All' ? branchSchedules.length : branchSchedules.filter(s => s.status === st).length
  const hasColFilters = Object.values(colFilters).some(Boolean)

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <Toolbar right={<>
        <UpdatingHint show={refreshing} />
        {hasLoaded && (
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
            <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{sorted.length}</strong> session{sorted.length !== 1 ? 's' : ''}
          </span>
        )}
      </>}>
        <Field label="Choose Date" htmlFor="status-date">
          <div className="flex items-center gap-2">
            <input
              id="status-date"
              type="date"
              value={selectedDate}
              onChange={e => onDateChange(e.target.value)}
              className={CONTROL}
              style={CONTROL_STYLE}
            />
            {isToday && <TodayTag />}
          </div>
        </Field>

        {isMultiBranch && (
          <Field label="Branch">
            <PillTabs label="Branch" value={activeBranch} onChange={setActiveBranch}
              tabs={['All', ...branches].map(b => ({ id: b, label: b === 'All' ? 'All' : (branchLabel(b) ?? b) }))} />
          </Field>
        )}
      </Toolbar>

      {loadError && <ErrorBanner message={loadError} onRetry={() => setReloadKey(k => k + 1)} />}

      {/* ── Status filter — each tile is a filter and a count of the day ── */}
      <div role="group" aria-label="Filter by status"
        className={`grid grid-cols-3 lg:grid-cols-6 gap-2.5 transition-opacity ${loading && hasLoaded ? 'opacity-60' : ''}`}>
        {['All', ...ALL_STATUSES].map(st => {
          const isActive = statusFilter === st
          const colors = st !== 'All' ? statusStyle(st) : null
          const accent = colors ? colors.dot : 'var(--teal)'
          return (
            <button key={st} type="button" onClick={() => setStatusFilter(st)} aria-pressed={isActive}
              className="cs-btn rounded-xl px-3.5 py-2.5 text-left transition-colors min-w-0"
              style={isActive
                ? { background: colors ? colors.bg : 'var(--pale-teal)', border: `1.5px solid ${accent}` }
                : { ...CARD_STYLE }}>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider truncate"
                style={{ color: isActive && colors ? colors.fg : 'var(--mid-gray)' }}>
                {colors
                  ? <span aria-hidden className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.dot }} />
                  : <Activity size={12} className="flex-shrink-0" style={{ color: 'var(--teal)' }} />}
                {st === 'All' ? 'All' : statusLabel(st)}
              </span>
              {hasLoaded
                ? <span className="block text-xl font-bold mt-0.5 tabular-nums leading-tight"
                    style={{ fontFamily: 'var(--font-display)', color: isActive && colors ? colors.fg : 'var(--charcoal)' }}>
                    {countFor(st)}
                  </span>
                : <Skeleton className="h-6 w-8 mt-1" />}
            </button>
          )
        })}
      </div>

      {/* ── Results ── */}
      {!hasLoaded ? (
        <section className="rounded-xl overflow-hidden" style={CARD_STYLE}><TableSkeleton cols={6} /></section>
      ) : pillFiltered.length === 0 && loadError ? (
        null
      ) : pillFiltered.length === 0 ? (
        <section className={`rounded-xl transition-opacity ${loading ? 'opacity-55' : ''}`} style={CARD_STYLE}>
          <EmptyState
            title="No sessions found"
            hint={`No ${statusFilter !== 'All' ? statusFilter.toLowerCase() + ' ' : ''}sessions for ${fmtLongDate(selectedDate)}.`} />
        </section>
      ) : (
        <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
          <CardBar title={fmtLongDate(selectedDate)}
            count={hasColFilters ? `${sorted.length} of ${pillFiltered.length} after filters` : undefined}>
            {isToday && <TodayTag />}
          </CardBar>

          <div className={`overflow-auto max-h-[70vh] transition-opacity ${loading ? 'opacity-55' : ''}`} aria-busy={loading || undefined}>
            <table className="cs-table w-full text-sm min-w-[820px]">
              <thead>
                {/* Sort header row */}
                <tr>
                  {COLUMNS.map(({ key, label }) => (
                    <th key={key}
                      className={`${TH} cursor-pointer select-none`}
                      style={{ color: sortCol === key ? 'var(--teal)' : 'var(--mid-gray)', background: TH_BG, height: 38 }}
                      aria-sort={sortCol === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      onClick={() => toggleSort(key)}>
                      <div className="flex items-center gap-1">
                        {label}
                        <SortIcon col={key} />
                      </div>
                    </th>
                  ))}
                </tr>
                {/* Column filter row */}
                <tr className="cs-filter-row">
                  {COLUMNS.map(({ key, label }) => (
                    <th key={key} className="px-3 py-2"
                      style={{ fontWeight: 'normal', background: '#fff', boxShadow: 'inset 0 -1px 0 var(--light-gray)' }}>
                      {key === 'status' ? (
                        <select
                          aria-label="Filter by status"
                          value={colFilters.status}
                          onChange={e => setFilter('status', e.target.value)}
                          className={`${CONTROL_SM} w-full`}
                          style={CONTROL_STYLE}>
                          <option value="">All</option>
                          {ALL_STATUSES.map(st => (
                            <option key={st} value={st.toLowerCase()}>{statusLabel(st)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          aria-label={`Filter ${label.toLowerCase()}`}
                          placeholder={`Filter…`}
                          value={colFilters[key]}
                          onChange={e => setFilter(key, e.target.value)}
                          className={`${CONTROL_SM} w-full`}
                          style={CONTROL_STYLE}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState title="No sessions match your filters." hint="Clear a column filter or pick another status above." />
                    </td>
                  </tr>
                ) : sorted.map((s, i) => {
                  const st = statusStyle(s.status)
                  return (
                    <tr key={s.id} className="transition-colors"
                      style={{ borderBottom: i < sorted.length - 1 ? '1px solid #EEF1F1' : 'none' }}>
                      <td className="px-4 py-3 h-[56px]">
                        <DeptChip code={s.staff.department} color={deptColor(s.staff.department)} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sm whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                          {s.staff.lastName}, {s.staff.firstName}
                        </p>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                        {s.patient
                          ? <span className="font-medium">{s.patient.lastName}, {s.patient.firstName}</span>
                          : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md pl-2 pr-2.5 py-1 text-[13px] tabular-nums"
                          style={{ background: st.bg, borderLeft: `3px solid ${st.dot}`, color: 'var(--charcoal)' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                        {s.sessionType}
                      </td>
                      <td className="px-4 py-3">
                        {editingStatusId === s.id ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              autoFocus
                              aria-label="Status"
                              value={s.status}
                              onChange={async e => {
                                await handleStatusChange(s.id, e.target.value)
                                setEditingStatusId(null)
                              }}
                              onBlur={() => setEditingStatusId(null)}
                              className={`${CONTROL_SM} cursor-pointer`}
                              style={{ ...CONTROL_STYLE, borderColor: 'var(--teal)' }}>
                              {ALL_STATUSES.map(st => (
                                <option key={st} value={st}>{statusLabel(st)}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => setEditingStatusId(null)}
                              className="cs-btn w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-100" title="Cancel" aria-label="Cancel">
                              <X size={13} style={{ color: 'var(--mid-gray)' }} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={s.status} />
                            <button type="button" onClick={() => setEditingStatusId(s.id)}
                              className="cs-btn w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-100" title="Edit status" aria-label="Edit status">
                              <Pencil size={12} style={{ color: 'var(--teal)' }} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {outcome && (
        <SessionOutcomePrompt target={outcome} onClose={() => setOutcome(null)} />
      )}
    </div>
  )
}
