'use client'

import { useEffect, useState } from 'react'
import { statusLabel, NON_ATTENDED_STATUSES } from '@/lib/schedule-status'
import SessionOutcomePrompt, { type OutcomeTarget } from '@/components/SessionOutcomePrompt'
import { CalendarDays, ChevronUp, ChevronDown, ChevronsUpDown, Pencil, X, Users, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { localTodayStr } from '@/lib/utils'
import { KpiCard, EmptyState, CARD_STYLE } from '../patients/dashboard/ui'
import { PillTabs, CONTROL, CONTROL_SM, CONTROL_STYLE } from '../decking/ui'
import {
  Toolbar, Field, UpdatingHint, ErrorBanner, KpiSkeletonRow, TableSkeleton, StatusBadge, statusStyle,
  CardBar, TodayTag, fmtLongDate, STATUS_STYLE, TH, TH_BG,
} from './ui'

const ALL_DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
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
interface PatientInfo { id: string; firstName: string; lastName: string; email: string | null ; branch?: string | null; branches?: string[] }
interface DailySchedule {
  id: string
  startTime: string
  endTime: string
  sessionType: string
  status: string
  staff: StaffInfo
  patient: PatientInfo | null
}

type SortCol = 'therapist' | 'patient' | 'time' | 'sessionType' | 'status'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortCol; label: string }[] = [
  { key: 'therapist',   label: 'Therapist' },
  { key: 'patient',     label: 'Patient' },
  { key: 'time',        label: 'Time' },
  { key: 'sessionType', label: 'Type of Session' },
  { key: 'status',      label: 'Status' },
]

type ColFilters = { therapist: string; patient: string; time: string; sessionType: string; status: string }

function applySortFn(rows: DailySchedule[], col: SortCol, dir: SortDir): DailySchedule[] {
  return [...rows].sort((a, b) => {
    let va = '', vb = ''
    if (col === 'therapist')   { va = a.staff.lastName;          vb = b.staff.lastName }
    else if (col === 'patient') { va = a.patient?.lastName ?? ''; vb = b.patient?.lastName ?? '' }
    else if (col === 'time')    { va = a.startTime;               vb = b.startTime }
    else if (col === 'sessionType') { va = a.sessionType;         vb = b.sessionType }
    else if (col === 'status')  { va = a.status;                  vb = b.status }
    const cmp = va.localeCompare(vb)
    return dir === 'asc' ? cmp : -cmp
  })
}

function applyColFiltersFn(rows: DailySchedule[], f: ColFilters): DailySchedule[] {
  return rows.filter(s => {
    if (f.therapist && !`${s.staff.lastName} ${s.staff.firstName}`.toLowerCase().includes(f.therapist.toLowerCase())) return false
    if (f.patient) {
      if (!s.patient) return false
      if (!`${s.patient.lastName} ${s.patient.firstName}`.toLowerCase().includes(f.patient.toLowerCase())) return false
    }
    if (f.time && !`${formatTime(s.startTime)} – ${formatTime(s.endTime)}`.toLowerCase().includes(f.time.toLowerCase())) return false
    if (f.sessionType && !s.sessionType.toLowerCase().includes(f.sessionType.toLowerCase())) return false
    if (f.status && s.status !== f.status) return false
    return true
  })
}

export default function DailyView({ role, selectedDate, onDateChange }: { role: string; selectedDate: string; onDateChange: (d: string) => void }) {
  const branches = visibleBranches(role)
  const isMultiBranch = branches.length > 1
  const [activeBranch, setActiveBranch]   = useState<string>('All')
  const [viewMode, setViewMode]           = useState<'all' | 'per-department'>('all')
  const [selectedDept, setSelectedDept]   = useState('All')
  const [selectedStaffId, setSelectedStaffId] = useState('All')

  const [schedules, setSchedules] = useState<DailySchedule[]>([])
  const [loading, setLoading]     = useState(false)
  // Display-only: first-load flag, last error, and a retry counter.
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [sortCol, setSortCol] = useState<SortCol>('time')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<OutcomeTarget | null>(null)
  const [colFilters, setColFilters] = useState<ColFilters>({
    therapist: '', patient: '', time: '', sessionType: '', status: '',
  })

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

  useEffect(() => {
    setSelectedDept('All')
    setSelectedStaffId('All')
  }, [viewMode, activeBranch])

  useEffect(() => {
    setSelectedStaffId('All')
  }, [selectedDept])

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
      console.error('[DailyView] Failed to update status', err)
      return   // status did not save — do not offer to log an outcome that is not recorded
    }

    // Same prompt as StatusView: these three statuses carry a fee consequence
    // and belong in Patient Relationship.
    if ((NON_ATTENDED_STATUSES as readonly string[]).includes(newStatus)) {
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
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // Branch-filtered base
  const branchSchedules = schedules.filter(s => {
    if (!branches.includes(s.staff.branch)) return false
    if (isMultiBranch && activeBranch !== 'All') return s.staff.branch === activeBranch
    return true
  })

  const presentDepts = ALL_DEPARTMENTS.filter(d => branchSchedules.some(s => s.staff.department === d))

  const deptSchedules = selectedDept === 'All'
    ? branchSchedules
    : branchSchedules.filter(s => s.staff.department === selectedDept)

  const staffInDept: StaffInfo[] = []
  const staffIdsSeen = new Set<string>()
  for (const s of deptSchedules) {
    if (!staffIdsSeen.has(s.staff.id)) {
      staffIdsSeen.add(s.staff.id)
      staffInDept.push(s.staff)
    }
  }
  staffInDept.sort((a, b) => a.lastName.localeCompare(b.lastName))

  let filtered = viewMode === 'all' ? branchSchedules : deptSchedules
  if (viewMode === 'per-department' && selectedStaffId !== 'All') {
    filtered = filtered.filter(s => s.staff.id === selectedStaffId)
  }
  filtered = applyColFiltersFn(filtered, colFilters)
  filtered = applySortFn(filtered, sortCol, sortDir)

  // ── Display-only derived values ──
  const isToday = selectedDate === localTodayStr()
  const refreshing = loading && hasLoaded
  const kpiConfirmed = branchSchedules.filter(s => s.status === 'CONFIRMED').length
  const kpiPending = branchSchedules.filter(s => s.status === 'PENDING').length
  const kpiNotAttended = branchSchedules.filter(s => (NON_ATTENDED_STATUSES as readonly string[]).includes(s.status)).length
  const kpiClinicians = new Set(branchSchedules.map(s => s.staff.id)).size
  // "Now" marker for sessions in progress — only meaningful on today's date.
  const nowHM = (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })()
  const hasActiveFilters = Object.values(colFilters).some(Boolean)
  const totalForBranches = schedules.filter(s => branches.includes(s.staff.branch)).length

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <Toolbar right={<>
        <UpdatingHint show={refreshing} />
        {hasLoaded && (
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
            <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{filtered.length}</strong> session{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </>}>
        <Field label="Choose Date" htmlFor="daily-date">
          <div className="flex items-center gap-2">
            <input
              id="daily-date"
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

        <Field label="View">
          <PillTabs label="Daily view mode" value={viewMode} onChange={id => setViewMode(id as 'all' | 'per-department')}
            tabs={[{ id: 'all', label: 'All' }, { id: 'per-department', label: 'Per Department' }]} />
        </Field>

        {/* Dept + Staff (Per Department only) */}
        {viewMode === 'per-department' && (
          <>
            <Field label="Department" htmlFor="daily-dept">
              <select id="daily-dept" className={CONTROL} style={CONTROL_STYLE} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                <option value="All">All Departments</option>
                {presentDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Choose Staff" htmlFor="daily-staff">
              <select id="daily-staff" className={`${CONTROL} max-w-[14rem]`} style={CONTROL_STYLE} value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                <option value="All">All Staff</option>
                {staffInDept.map(s => (
                  <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Toolbar>

      {loadError && <ErrorBanner message={loadError} onRetry={() => setReloadKey(k => k + 1)} />}

      {/* ── KPIs — from the day already loaded (respects the branch tab) ── */}
      {!hasLoaded ? <KpiSkeletonRow /> : (
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <KpiCard label={isToday ? 'Sessions today' : 'Sessions'} icon={<CalendarDays size={15} />}
            value={branchSchedules.length} sub={new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} />
          <KpiCard label="Clinicians on duty" icon={<Users size={15} />} accent="var(--gold)"
            value={kpiClinicians} sub="with at least one session" />
          <KpiCard label="Confirmed" icon={<CheckCircle2 size={15} />} accent={STATUS_STYLE.CONFIRMED.dot}
            value={kpiConfirmed} sub={kpiPending > 0 ? <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {kpiPending} still pending</span> : 'none pending'} />
          <KpiCard label="Cancelled / no-show" icon={<XCircle size={15} />} accent={STATUS_STYLE.CANCELLED.dot}
            value={kpiNotAttended} sub="incl. rescheduled" />
        </div>
      )}

      {/* ── Results ── */}
      {!hasLoaded ? (
        <section className="rounded-xl overflow-hidden" style={CARD_STYLE}><TableSkeleton cols={5} /></section>
      ) : totalForBranches === 0 && loadError ? (
        null
      ) : totalForBranches === 0 ? (
        <section className={`rounded-xl transition-opacity ${loading ? 'opacity-55' : ''}`} style={CARD_STYLE}>
          <div className="py-14 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
              <CalendarDays size={22} style={{ color: 'var(--teal)' }} />
            </div>
            <div className="text-center px-6">
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>No sessions scheduled</p>
              <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                No appointments found for {fmtLongDate(selectedDate)}.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
          <CardBar title={fmtLongDate(selectedDate)}
            count={hasActiveFilters ? `${filtered.length} of ${branchSchedules.length} after filters` : undefined}>
            {isToday && <TodayTag />}
          </CardBar>

          <div className={`overflow-auto max-h-[70vh] transition-opacity ${loading ? 'opacity-55' : ''}`} aria-busy={loading || undefined}>
            <table className="cs-table w-full text-sm min-w-[760px]">
              <thead>
                {/* Sortable header row */}
                <tr>
                  {COLUMNS.map((col, ci) => (
                    <th key={col.key}
                      className={`${TH} cursor-pointer select-none ${ci === 0 ? 'cs-pin' : ''}`}
                      style={{ color: sortCol === col.key ? 'var(--teal)' : 'var(--mid-gray)', background: TH_BG, height: 38 }}
                      aria-sort={sortCol === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      onClick={() => toggleSort(col.key)}>
                      <div className="flex items-center gap-1">
                        {col.label}
                        {sortCol === col.key
                          ? (sortDir === 'asc'
                              ? <ChevronUp size={12} style={{ color: 'var(--teal)' }} />
                              : <ChevronDown size={12} style={{ color: 'var(--teal)' }} />)
                          : <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />}
                      </div>
                    </th>
                  ))}
                </tr>
                {/* Column filter row */}
                <tr className="cs-filter-row">
                  {COLUMNS.map((col, ci) => (
                    <th key={col.key} className={`px-3 py-2 ${ci === 0 ? 'cs-pin' : ''}`}
                      style={{ fontWeight: 'normal', background: '#fff', boxShadow: 'inset 0 -1px 0 var(--light-gray)' }}>
                      {col.key === 'status' ? (
                        <select
                          aria-label="Filter by status"
                          value={colFilters.status}
                          onChange={e => setColFilters(f => ({ ...f, status: e.target.value }))}
                          className={`${CONTROL_SM} w-full`}
                          style={CONTROL_STYLE}>
                          <option value="">All statuses</option>
                          {ALL_STATUSES.map(st => (
                            <option key={st} value={st}>{statusLabel(st)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          aria-label={`Filter ${col.label.toLowerCase()}`}
                          placeholder={`Filter ${col.label.toLowerCase()}…`}
                          value={colFilters[col.key]}
                          onChange={e => setColFilters(f => ({ ...f, [col.key]: e.target.value }))}
                          className={`${CONTROL_SM} w-full`}
                          style={CONTROL_STYLE}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="No sessions match the current filters." hint="Clear a column filter or switch the view above." />
                    </td>
                  </tr>
                ) : filtered.map((s, i) => {
                  const st = statusStyle(s.status)
                  const inProgress = isToday && s.startTime <= nowHM && nowHM < s.endTime
                  return (
                    <tr key={s.id} className="transition-colors"
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid #EEF1F1' : 'none' }}>
                      <td className="cs-pin px-4 py-3 h-[60px]">
                        <p className="font-semibold text-sm whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                          {s.staff.lastName}, {s.staff.firstName}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.staff.department}</p>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                        {s.patient
                          ? <span className="font-medium">{s.patient.lastName}, {s.patient.firstName}</span>
                          : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 rounded-md pl-2 pr-2.5 py-1 text-[13px] tabular-nums"
                          style={{ background: st.bg, borderLeft: `3px solid ${st.dot}`, color: 'var(--charcoal)' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </span>
                        {inProgress && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>
                            <span aria-hidden className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />Now
                          </span>
                        )}
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
