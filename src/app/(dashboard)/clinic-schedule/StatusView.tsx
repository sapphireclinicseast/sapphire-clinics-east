'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { Pencil, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

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

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East Branch', SBGH: 'Greenhills Branch' }

function visibleBranches(role: string): string[] {
  if (role.startsWith('SBEA_')) return ['SBEA']
  if (role.startsWith('SBGH_')) return ['SBGH']
  return ['SBEA', 'SBGH']
}

interface StaffInfo { id: string; firstName: string; lastName: string; department: string; branch: string }
interface PatientInfo { id: string; firstName: string; lastName: string; email: string | null }
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

  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [colFilters, setColFilters] = useState<ColFilters>({
    department: '', staff: '', patient: '', time: '', sessionType: '', status: '',
  })

  const [schedules, setSchedules] = useState<StatusSchedule[]>([])
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clinic-schedule?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => setSchedules(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [selectedDate])

  async function handleStatusChange(id: string, newStatus: string) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s))
    try {
      await fetch('/api/clinic-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
    } catch (err) {
      console.error('[StatusView] Failed to update status', err)
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

  const filterInputStyle: CSSProperties = {
    width: '100%', fontSize: '11px', padding: '3px 6px', borderRadius: '6px',
    border: '1px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)',
    outline: 'none',
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
                    {BRANCH_LABEL[b] ?? b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Status filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--mid-gray)' }}>
            Status
          </label>
          {['All', ...ALL_STATUSES].map(st => {
            const isActive = statusFilter === st
            const colors   = st !== 'All' ? STATUS_COLORS[st] : null
            return (
              <button key={st} onClick={() => setStatusFilter(st)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                style={isActive
                  ? (colors
                      ? { background: colors.background, color: colors.color, border: `2px solid ${colors.color}` }
                      : { background: 'var(--teal)', color: '#fff', border: '2px solid var(--teal)' })
                  : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
                {st === 'All' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Loading schedules…</p>
      ) : sorted.length === 0 && colFiltered.length === 0 && pillFiltered.length === 0 ? (
        <div className="rounded-xl py-16 flex flex-col items-center gap-3"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>No sessions found</p>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            No {statusFilter !== 'All' ? statusFilter.toLowerCase() + ' ' : ''}sessions for{' '}
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
          {/* Summary bar */}
          <div className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'var(--pale-teal)', borderBottom: '1px solid rgba(26,123,138,0.15)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--teal)', color: '#fff' }}>
              {sorted.length} session{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              {/* Sort header row */}
              <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                {COLUMNS.map(({ key, label }) => (
                  <th key={key}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none"
                    style={{ color: sortCol === key ? 'var(--teal)' : 'var(--mid-gray)' }}
                    onClick={() => toggleSort(key)}>
                    <div className="flex items-center gap-1">
                      {label}
                      <SortIcon col={key} />
                    </div>
                  </th>
                ))}
              </tr>
              {/* Column filter row */}
              <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--light-gray)' }}>
                {COLUMNS.map(({ key }) => (
                  <th key={key} className="px-3 py-1.5">
                    {key === 'status' ? (
                      <select
                        value={colFilters.status}
                        onChange={e => setFilter('status', e.target.value)}
                        style={{ ...filterInputStyle }}>
                        <option value="">All</option>
                        {ALL_STATUSES.map(st => (
                          <option key={st} value={st.toLowerCase()}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder={`Filter…`}
                        value={colFilters[key]}
                        onChange={e => setFilter(key, e.target.value)}
                        style={filterInputStyle}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
                    No sessions match your filters.
                  </td>
                </tr>
              ) : sorted.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors"
                  style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--light-gray)' : 'none' }}>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                      {s.staff.department}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                      {s.staff.lastName}, {s.staff.firstName}
                    </p>
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
