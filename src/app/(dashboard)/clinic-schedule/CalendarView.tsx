'use client'

import { useEffect, useState } from 'react'
import { statusLabel } from '@/lib/schedule-status'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

const ALL_DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  PENDING:     { background: '#FFF9EC', color: '#92400E' },
  CONFIRMED:   { background: 'var(--pale-teal)', color: 'var(--teal)' },
  CANCELLED:   { background: '#FEE2E2', color: '#DC2626' },
  RESCHEDULED: { background: '#EDE9FE', color: '#5B21B6' },
  NO_SHOW: { background: '#FFEDD5', color: '#9A3412' },   // amber: not cancelled, not rescheduled
}

const STATUS_DOT: Record<string, string> = {
  PENDING:     '#92400E',
  CONFIRMED:   '#1a7b8a',
  CANCELLED:   '#DC2626',
  RESCHEDULED: '#5B21B6',
  NO_SHOW: '#9A3412',
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
interface CalSchedule {
  id: string; startTime: string; endTime: string; sessionType: string; status: string
  staff: StaffInfo; patient: PatientInfo | null
  date: string // YYYY-MM-DD (normalised after fetch)
}

export default function CalendarView({ role }: { role: string }) {
  const branches = visibleBranches(role)
  const isMultiBranch = branches.length > 1

  const today = new Date()
  const [year, setYear]           = useState(today.getFullYear())
  const [month, setMonth]         = useState(today.getMonth()) // 0-indexed
  const [activeBranch, setActiveBranch] = useState<string>('All')
  const [viewMode, setViewMode]   = useState<'all' | 'per-department'>('all')
  const [selectedDept, setSelectedDept]   = useState('All')
  const [selectedStaffId, setSelectedStaffId] = useState('All')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const [schedules, setSchedules] = useState<CalSchedule[]>([])
  const [loading, setLoading]     = useState(false)

  const daysInMonth   = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0=Sunday

  useEffect(() => {
    setLoading(true)
    setSelectedDay(null)
    const mm = String(month + 1).padStart(2, '0')
    const startDate = `${year}-${mm}-01`
    const endDate   = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`
    fetch(`/api/clinic-schedule?startDate=${startDate}&endDate=${endDate}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSchedules(data.map((s: CalSchedule & { date: string }) => ({
            ...s,
            date: new Date(s.date).toISOString().split('T')[0],
          })))
        }
      })
      .finally(() => setLoading(false))
  }, [year, month, daysInMonth])

  useEffect(() => {
    setSelectedDept('All')
    setSelectedStaffId('All')
  }, [viewMode, activeBranch])

  useEffect(() => { setSelectedStaffId('All') }, [selectedDept])

  // Branch filter
  const branchSchedules = schedules.filter(s => {
    if (!branches.includes(s.staff.branch)) return false
    if (isMultiBranch && activeBranch !== 'All') return s.staff.branch === activeBranch
    return true
  })

  const presentDepts = ALL_DEPARTMENTS.filter(d => branchSchedules.some(s => s.staff.department === d))

  // Dept/staff filter
  const deptBase = viewMode === 'per-department' && selectedDept !== 'All'
    ? branchSchedules.filter(s => s.staff.department === selectedDept)
    : branchSchedules

  let filtered = deptBase
  if (viewMode === 'per-department' && selectedStaffId !== 'All') {
    filtered = filtered.filter(s => s.staff.id === selectedStaffId)
  }

  const staffInDept: StaffInfo[] = []
  const seen = new Set<string>()
  for (const s of deptBase) {
    if (!seen.has(s.staff.id)) { seen.add(s.staff.id); staffInDept.push(s.staff) }
  }
  staffInDept.sort((a, b) => a.lastName.localeCompare(b.lastName))

  // Group by calendar day number
  const byDay: Record<number, CalSchedule[]> = {}
  for (const s of filtered) {
    const day = parseInt(s.date.split('-')[2], 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(s)
  }
  for (const d of Object.keys(byDay)) {
    byDay[parseInt(d)].sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  const selectedDaySessions = selectedDay ? (byDay[selectedDay] ?? []) : []

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const todayStr = today.toISOString().split('T')[0]
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const todayDay = todayStr.startsWith(currentMonthPrefix) ? today.getDate() : null

  const selectStyle = {
    border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff',
    color: 'var(--charcoal)', borderRadius: '0.5rem',
    padding: '0.4rem 0.7rem', fontSize: '0.85rem',
  }

  // Build cell array (nulls for empty lead/trail cells)
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7
  const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - firstDayOfWeek + 1
    return d >= 1 && d <= daysInMonth ? d : null
  })

  return (
    <div className="space-y-5">
      {/* Filter panel */}
      <div className="rounded-xl p-4 space-y-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        {/* Row 1: Month nav + Branch */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              Month
            </label>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100">
                <ChevronLeft size={16} style={{ color: 'var(--charcoal)' }} />
              </button>
              <span className="text-sm font-semibold min-w-[140px] text-center" style={{ color: 'var(--charcoal)' }}>
                {MONTH_NAMES[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100">
                <ChevronRight size={16} style={{ color: 'var(--charcoal)' }} />
              </button>
            </div>
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
        <div className="flex items-center gap-4">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
            View
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="calViewMode" checked={viewMode === 'all'}
              onChange={() => setViewMode('all')} style={{ accentColor: 'var(--teal)' }} />
            <span className="text-sm" style={{ color: 'var(--charcoal)' }}>All</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="calViewMode" checked={viewMode === 'per-department'}
              onChange={() => setViewMode('per-department')} style={{ accentColor: 'var(--teal)' }} />
            <span className="text-sm" style={{ color: 'var(--charcoal)' }}>Per Department</span>
          </label>
        </div>

        {/* Row 3: Dept + Staff */}
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

      {/* Calendar */}
      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Loading…</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
          {/* Month header bar */}
          <div className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'var(--pale-teal)', borderBottom: '1px solid rgba(26,123,138,0.15)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
              {MONTH_NAMES[month]} {year}
            </p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--teal)', color: '#fff' }}>
              {filtered.length} session{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--mid-gray)', background: 'var(--off-white)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const isToday    = day === todayDay
              const isSelected = day === selectedDay
              const daySessions = day ? (byDay[day] ?? []) : []
              const MAX_SHOW = 3
              const extra = daySessions.length - MAX_SHOW

              return (
                <div key={i}
                  onClick={() => { if (day) setSelectedDay(day === selectedDay ? null : day) }}
                  className={day ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}
                  style={{
                    minHeight: '90px',
                    padding: '6px',
                    borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--light-gray)' : 'none',
                    borderBottom: i < cells.length - 7 ? '1px solid var(--light-gray)' : 'none',
                    background: isSelected ? 'rgba(26,123,138,0.05)' : undefined,
                  }}>
                  {day && (
                    <>
                      <div className="mb-1">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                          style={isToday
                            ? { background: 'var(--teal)', color: '#fff' }
                            : isSelected
                            ? { background: 'rgba(26,123,138,0.15)', color: 'var(--teal)' }
                            : { color: 'var(--charcoal)' }}>
                          {day}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {daySessions.slice(0, MAX_SHOW).map(s => (
                          <div key={s.id} className="flex items-center gap-1 rounded px-1 py-0.5"
                            style={{ background: STATUS_COLORS[s.status]?.background ?? '#f3f4f6' }}>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: STATUS_DOT[s.status] ?? '#374151' }} />
                            <span className="truncate" style={{
                              color: STATUS_DOT[s.status] ?? '#374151',
                              fontSize: '0.65rem', lineHeight: 1.4,
                            }}>
                              {s.staff.lastName} · {formatTime(s.startTime)}
                            </span>
                          </div>
                        ))}
                        {extra > 0 && (
                          <p style={{ color: 'var(--mid-gray)', fontSize: '0.65rem', paddingLeft: '4px' }}>
                            +{extra} more
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Day detail panel */}
          {selectedDay && (
            <div style={{ borderTop: '2px solid var(--teal)' }}>
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ background: 'rgba(26,123,138,0.05)', borderBottom: '1px solid var(--light-gray)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                  {MONTH_NAMES[month]} {selectedDay}, {year}
                  <span className="ml-2 text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>
                    {selectedDaySessions.length} session{selectedDaySessions.length !== 1 ? 's' : ''}
                  </span>
                </p>
                <button onClick={() => setSelectedDay(null)}
                  className="text-xs px-2 py-1 rounded hover:bg-gray-100"
                  style={{ color: 'var(--mid-gray)' }}>
                  Close
                </button>
              </div>

              {selectedDaySessions.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
                  No sessions on this day.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                      {['Therapist', 'Patient', 'Time', 'Type of Session', 'Status'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--mid-gray)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDaySessions.map((s, i) => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors"
                        style={{ borderBottom: i < selectedDaySessions.length - 1 ? '1px solid var(--light-gray)' : 'none' }}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                            {s.staff.lastName}, {s.staff.firstName}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.staff.department}</p>
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--charcoal)' }}>
                          {s.patient
                            ? <span className="font-medium">{s.patient.lastName}, {s.patient.firstName}</span>
                            : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--charcoal)' }}>
                          {s.sessionType}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={STATUS_COLORS[s.status] ?? { background: '#f3f4f6', color: '#374151' }}>
                            {statusLabel(s.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
