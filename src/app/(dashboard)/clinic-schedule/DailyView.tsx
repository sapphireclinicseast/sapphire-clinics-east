'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronUp, ChevronDown, ChevronsUpDown, Pencil, X } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

const ALL_DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
const ALL_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED']

const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  PENDING:     { background: '#FFF9EC', color: '#92400E' },
  CONFIRMED:   { background: 'var(--pale-teal)', color: 'var(--teal)' },
  CANCELLED:   { background: '#FEE2E2', color: '#DC2626' },
  RESCHEDULED: { background: '#EDE9FE', color: '#5B21B6' },
}

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
interface PatientInfo { id: string; firstName: string; lastName: string; email: string | null }
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

  const [sortCol, setSortCol] = useState<SortCol>('time')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [colFilters, setColFilters] = useState<ColFilters>({
    therapist: '', patient: '', time: '', sessionType: '', status: '',
  })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clinic-schedule?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => setSchedules(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [selectedDate])

  useEffect(() => {
    setSelectedDept('All')
    setSelectedStaffId('All')
  }, [viewMode, activeBranch])

  useEffect(() => {
    setSelectedStaffId('All')
  }, [selectedDept])

  async function handleStatusChange(id: string, newStatus: string) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s))
    try {
      await fetch('/api/clinic-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
    } catch (err) {
      console.error('[DailyView] Failed to update status', err)
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

  const selectStyle = {
    border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff',
    color: 'var(--charcoal)', borderRadius: '0.5rem',
    padding: '0.4rem 0.7rem', fontSize: '0.85rem',
  }

  const filterInputStyle: CSSProperties = {
    width: '100%', fontSize: '0.75rem', padding: '0.25rem 0.5rem',
    border: '1px solid rgba(26,123,138,0.25)', borderRadius: '0.375rem',
    background: '#fff', color: 'var(--charcoal)', outline: 'none',
  }

  return (
    <div className="space-y-5">
      {/* Filter panel */}
      <div className="rounded-xl p-4 space-y-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        {/* Row 1: Date + Branch */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              Choose Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => onDateChange(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
            />
          </div>

          {isMultiBranch && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                Branch
              </label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
                {['All', ...branches].map(b => (
                  <button key={b} onClick={() => setActiveBranch(b)}
                    className="px-4 py-1.5 text-sm font-medium transition-colors"
                    style={activeBranch === b
                      ? { background: 'var(--teal)', color: '#fff' }
                      : { background: '#fff', color: 'var(--mid-gray)' }}>
                    {branchLabel(b) ?? b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Row 2: View mode */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              View
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="viewMode" checked={viewMode === 'all'}
                onChange={() => setViewMode('all')} style={{ accentColor: 'var(--teal)' }} />
              <span className="text-sm" style={{ color: 'var(--charcoal)' }}>All</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="viewMode" checked={viewMode === 'per-department'}
                onChange={() => setViewMode('per-department')} style={{ accentColor: 'var(--teal)' }} />
              <span className="text-sm" style={{ color: 'var(--charcoal)' }}>Per Department</span>
            </label>
          </div>
        </div>

        {/* Row 3: Dept + Staff (Per Department only) */}
        {viewMode === 'per-department' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                Department
              </label>
              <select style={selectStyle} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                <option value="All">All Departments</option>
                {presentDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                Choose Staff
              </label>
              <select style={selectStyle} value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                <option value="All">All Staff</option>
                {staffInDept.map(s => (
                  <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Loading schedules…</p>
      ) : schedules.filter(s => branches.includes(s.staff.branch)).length === 0 ? (
        <div className="rounded-xl py-16 flex flex-col items-center gap-3"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
            <CalendarDays size={22} style={{ color: 'var(--teal)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>No sessions scheduled</p>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            No appointments found for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
          {/* Summary bar */}
          <div className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'var(--pale-teal)', borderBottom: '1px solid rgba(26,123,138,0.15)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--teal)', color: '#fff' }}>
              {filtered.length} session{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              {/* Sortable header row */}
              <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid rgba(26,123,138,0.1)' }}>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none"
                    style={{ color: sortCol === col.key ? 'var(--teal)' : 'var(--mid-gray)' }}
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
              <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--light-gray)' }}>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-3 py-1.5" style={{ fontWeight: 'normal' }}>
                    {col.key === 'status' ? (
                      <select
                        value={colFilters.status}
                        onChange={e => setColFilters(f => ({ ...f, status: e.target.value }))}
                        style={filterInputStyle}>
                        <option value="">All statuses</option>
                        {ALL_STATUSES.map(st => (
                          <option key={st} value={st}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder={`Filter ${col.label.toLowerCase()}…`}
                        value={colFilters[col.key]}
                        onChange={e => setColFilters(f => ({ ...f, [col.key]: e.target.value }))}
                        style={filterInputStyle}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                    No sessions match the current filters.
                  </td>
                </tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id}
                  className="hover:bg-gray-50 transition-colors"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--light-gray)' : 'none' }}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                      {s.staff.lastName}, {s.staff.firstName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.staff.department}</p>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                    {s.patient
                      ? <span className="font-medium">{s.patient.lastName}, {s.patient.firstName}</span>
                      : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                    {formatTime(s.startTime)} – {formatTime(s.endTime)}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                    {s.sessionType}
                  </td>
                  <td className="px-4 py-3">
                    {editingStatusId === s.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          autoFocus
                          value={s.status}
                          onChange={async e => {
                            await handleStatusChange(s.id, e.target.value)
                            setEditingStatusId(null)
                          }}
                          onBlur={() => setEditingStatusId(null)}
                          className="text-xs rounded-lg px-2 py-1 cursor-pointer"
                          style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}>
                          {ALL_STATUSES.map(st => (
                            <option key={st} value={st}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>
                          ))}
                        </select>
                        <button onClick={() => setEditingStatusId(null)}
                          className="p-1 rounded hover:bg-gray-100" title="Cancel">
                          <X size={12} style={{ color: 'var(--mid-gray)' }} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={STATUS_COLORS[s.status] ?? { background: '#f3f4f6', color: '#374151' }}>
                          {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                        </span>
                        <button onClick={() => setEditingStatusId(s.id)}
                          className="p-1 rounded hover:bg-gray-100" title="Edit status">
                          <Pencil size={12} style={{ color: 'var(--teal)' }} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
