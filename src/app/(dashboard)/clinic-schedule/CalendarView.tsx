'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, Users, TrendingUp, X } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { localTodayStr } from '@/lib/utils'
import { KpiCard, EmptyState, CARD_STYLE } from '../patients/dashboard/ui'
import { PillTabs, CONTROL, CONTROL_STYLE, BTN_SM } from '../decking/ui'
import {
  Toolbar, Field, UpdatingHint, ErrorBanner, KpiSkeletonRow, StatusBadge, statusStyle, CardBar,
  STATUS_STYLE, TH, TH_BG, TD, TodayTag,
} from './ui'
import { statusLabel } from '@/lib/schedule-status'

const ALL_DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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

const MAX_SHOW = 3

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
  // Display-only: whether the first load has finished, the last load's error,
  // and a counter the "Try again" button bumps to re-run the same request.
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

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
          setLoadError('')
          setSchedules(data.map((s: CalSchedule & { date: string }) => ({
            ...s,
            date: new Date(s.date).toISOString().split('T')[0],
          })))
        } else {
          setLoadError((data && typeof data.error === 'string' && data.error) || "Couldn't load this month's schedule.")
        }
      })
      .catch(() => setLoadError("Couldn't load this month's schedule. Check your connection, then try again."))
      .finally(() => { setLoading(false); setHasLoaded(true) })
  }, [year, month, daysInMonth, reloadKey])

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

  // Local calendar date, so the "today" marker doesn't slip a day in the
  // early-morning hours when UTC is still on the previous date.
  const todayStr = localTodayStr()
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const todayDay = todayStr.startsWith(currentMonthPrefix) ? Number(todayStr.slice(8, 10)) : null

  // While a different month loads, the sessions still in memory belong to the
  // previous month — keep the grid on screen (dimmed) but don't paint last
  // month's sessions onto this month's days.
  const staleMonth = loading && schedules.length > 0 && !schedules[0].date.startsWith(currentMonthPrefix)
  const refreshing = loading && hasLoaded

  // KPIs — all from the month already loaded.
  const confirmed = filtered.filter(s => s.status === 'CONFIRMED').length
  const clinicianCount = new Set(filtered.map(s => s.staff.id)).size
  let busiestDay: number | null = null
  for (const d of Object.keys(byDay).map(Number)) {
    if (busiestDay === null || byDay[d].length > byDay[busiestDay].length) busiestDay = d
  }
  const todayCount = todayDay ? (byDay[todayDay]?.length ?? 0) : null

  // Build cell array (nulls for empty lead/trail cells)
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7
  const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - firstDayOfWeek + 1
    return d >= 1 && d <= daysInMonth ? d : null
  })

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <Toolbar right={<>
        <UpdatingHint show={refreshing} />
        {hasLoaded && !staleMonth && (
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
            <strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{filtered.length}</strong> session{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </>}>
        <Field label="Month">
          <div className="flex items-center h-9 rounded-lg" style={CONTROL_STYLE}>
            <button type="button" onClick={prevMonth} aria-label="Previous month"
              className="cs-btn h-full px-2 rounded-l-lg hover:bg-gray-50 transition-colors">
              <ChevronLeft size={16} style={{ color: 'var(--charcoal)' }} />
            </button>
            <span className="text-sm font-semibold min-w-[132px] text-center tabular-nums" style={{ color: 'var(--charcoal)' }}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button type="button" onClick={nextMonth} aria-label="Next month"
              className="cs-btn h-full px-2 rounded-r-lg hover:bg-gray-50 transition-colors">
              <ChevronRight size={16} style={{ color: 'var(--charcoal)' }} />
            </button>
          </div>
        </Field>

        {isMultiBranch && (
          <Field label="Branch">
            <PillTabs label="Branch" value={activeBranch} onChange={setActiveBranch}
              tabs={['All', ...branches].map(b => ({ id: b, label: b === 'All' ? 'All' : (branchLabel(b) ?? b) }))} />
          </Field>
        )}

        <Field label="View">
          <PillTabs label="Calendar view mode" value={viewMode} onChange={id => setViewMode(id as 'all' | 'per-department')}
            tabs={[{ id: 'all', label: 'All' }, { id: 'per-department', label: 'Per Department' }]} />
        </Field>

        {viewMode === 'per-department' && (
          <>
            <Field label="Department" htmlFor="cal-dept">
              <select id="cal-dept" className={CONTROL} style={CONTROL_STYLE} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                <option value="All">All Departments</option>
                {presentDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Choose Staff" htmlFor="cal-staff">
              <select id="cal-staff" className={`${CONTROL} max-w-[14rem]`} style={CONTROL_STYLE} value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
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

      {/* ── KPIs — from the month already loaded ── */}
      {!hasLoaded ? <KpiSkeletonRow /> : (
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <KpiCard label="Sessions this month" icon={<CalendarDays size={15} />}
            value={staleMonth ? '—' : filtered.length}
            sub={`${MONTH_NAMES[month]} ${year}`} />
          <KpiCard label="Confirmed" icon={<CheckCircle2 size={15} />} accent={STATUS_STYLE.CONFIRMED.dot}
            value={staleMonth ? '—' : confirmed}
            sub={!staleMonth && filtered.length > 0 ? `${Math.round((confirmed / filtered.length) * 100)}% of sessions` : 'of sessions'} />
          <KpiCard label="Clinicians" icon={<Users size={15} />} accent="var(--gold)"
            value={staleMonth ? '—' : clinicianCount}
            sub="with at least one session" />
          <KpiCard label={todayCount !== null ? 'Today' : 'Busiest day'} icon={<TrendingUp size={15} />} accent="#8B5CF6"
            value={staleMonth ? '—' : todayCount !== null ? todayCount : (busiestDay ? byDay[busiestDay].length : 0)}
            sub={staleMonth ? '' : todayCount !== null
              ? `sessions on ${MONTH_NAMES[month].slice(0, 3)} ${todayDay}`
              : busiestDay ? `sessions on ${MONTH_NAMES[month].slice(0, 3)} ${busiestDay}` : 'no sessions yet'} />
        </div>
      )}

      {/* ── Calendar ── */}
      <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
        <CardBar title={`${MONTH_NAMES[month]} ${year}`}
          count={
            <span className="hidden sm:flex items-center gap-3">
              {Object.entries(STATUS_STYLE).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: v.dot }} />
                  {statusLabel(k)}
                </span>
              ))}
            </span>
          } />

        <div className="overflow-x-auto">
          <div className={`min-w-[760px] transition-opacity ${loading ? 'opacity-55' : ''}`} aria-busy={loading || undefined}>
            {/* Weekday headers */}
            <div className="grid grid-cols-7" style={{ background: TH_BG, borderBottom: '1px solid var(--light-gray)' }}>
              {WEEKDAYS.map((d, i) => (
                <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: i === 0 || i === 6 ? '#9CA3AF' : 'var(--mid-gray)' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const isToday    = day !== null && day === todayDay
                const isSelected = day !== null && day === selectedDay
                const isWeekend  = i % 7 === 0 || i % 7 === 6
                const daySessions = day && !staleMonth ? (byDay[day] ?? []) : []
                const extra = daySessions.length - MAX_SHOW
                const borders = {
                  borderRight: (i + 1) % 7 !== 0 ? '1px solid #EEF1F1' : 'none',
                  borderBottom: i < cells.length - 7 ? '1px solid #EEF1F1' : 'none',
                }

                if (!day) {
                  return <div key={i} aria-hidden className="h-[118px]" style={{ ...borders, background: '#FAFBFB' }} />
                }

                return (
                  <button key={i} type="button"
                    onClick={() => { if (day) setSelectedDay(day === selectedDay ? null : day) }}
                    aria-pressed={isSelected}
                    aria-label={`${MONTH_NAMES[month]} ${day}: ${daySessions.length} session${daySessions.length !== 1 ? 's' : ''}`}
                    className="cs-day h-[118px] p-1.5 text-left flex flex-col gap-1 overflow-hidden transition-colors hover:bg-[#F5FAFA]"
                    style={{
                      ...borders,
                      background: isSelected ? '#EAF5F6' : isToday ? '#F3FAFA' : isWeekend ? '#FCFCFC' : '#fff',
                      boxShadow: isSelected ? 'inset 0 0 0 2px var(--teal)' : isToday ? 'inset 0 2px 0 var(--teal)' : undefined,
                    }}>
                    <div className="flex items-center justify-between gap-1 flex-shrink-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums"
                        style={isToday
                          ? { background: 'var(--teal)', color: '#fff' }
                          : { color: isWeekend ? '#9CA3AF' : 'var(--charcoal)' }}>
                        {day}
                      </span>
                      {isToday
                        ? <TodayTag />
                        : daySessions.length > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums pr-0.5" style={{ color: 'var(--mid-gray)' }}>{daySessions.length}</span>
                        )}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      {daySessions.slice(0, MAX_SHOW).map(s => {
                        const st = statusStyle(s.status)
                        return (
                          <div key={s.id} className="flex items-center gap-1 rounded px-1.5 h-[18px] min-w-0"
                            title={`${s.staff.lastName} · ${formatTime(s.startTime)} – ${formatTime(s.endTime)} · ${statusLabel(s.status)}`}
                            style={{ background: st.bg, borderLeft: `2px solid ${st.dot}` }}>
                            <span className="truncate text-[10.5px] leading-none" style={{ color: st.fg }}>
                              <span className="font-semibold tabular-nums">{formatTime(s.startTime)}</span> · {s.staff.lastName}
                            </span>
                          </div>
                        )
                      })}
                      {extra > 0 && (
                        <p className="text-[10.5px] font-semibold pl-1.5" style={{ color: 'var(--teal)' }}>
                          +{extra} more
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div style={{ borderTop: '1px solid var(--light-gray)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: '#F3FAFA', borderBottom: '1px solid var(--light-gray)' }}>
              <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                {MONTH_NAMES[month]} {selectedDay}, {year}
                {selectedDay === todayDay && <TodayTag />}
                <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>
                  {selectedDaySessions.length} session{selectedDaySessions.length !== 1 ? 's' : ''}
                </span>
              </p>
              <button type="button" onClick={() => setSelectedDay(null)}
                className={BTN_SM} style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }}>
                <X size={12} /> Close
              </button>
            </div>

            {selectedDaySessions.length === 0 ? (
              <EmptyState title="No sessions on this day." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: TH_BG, borderBottom: '1px solid var(--light-gray)' }}>
                      {['Therapist', 'Patient', 'Time', 'Type of Session', 'Status'].map(h => (
                        <th key={h} className={TH} style={{ color: 'var(--mid-gray)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDaySessions.map((s, i) => (
                      <tr key={s.id} className="hover:bg-[#F7FAFA] transition-colors"
                        style={{ borderBottom: i < selectedDaySessions.length - 1 ? '1px solid #EEF1F1' : 'none' }}>
                        <td className={TD}>
                          <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>
                            {s.staff.lastName}, {s.staff.firstName}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.staff.department}</p>
                        </td>
                        <td className={TD} style={{ color: 'var(--charcoal)' }}>
                          {s.patient
                            ? <span className="font-medium">{s.patient.lastName}, {s.patient.firstName}</span>
                            : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                        <td className={`${TD} whitespace-nowrap tabular-nums`} style={{ color: 'var(--charcoal)' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </td>
                        <td className={TD} style={{ color: 'var(--charcoal)' }}>
                          {s.sessionType}
                        </td>
                        <td className={TD}>
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
      {hasLoaded && !loading && !loadError && filtered.length === 0 && (
        <p className="text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
          No sessions in {MONTH_NAMES[month]} {year}{viewMode === 'per-department' && (selectedDept !== 'All' || selectedStaffId !== 'All') ? ' for this filter' : ''}.
        </p>
      )}
    </div>
  )
}
