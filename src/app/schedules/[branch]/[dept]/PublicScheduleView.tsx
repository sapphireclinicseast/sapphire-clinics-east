'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  PENDING:     { background: '#FFF9EC', color: '#92400E' },
  CONFIRMED:   { background: '#ECFDF5', color: '#065F46' },
  CANCELLED:   { background: '#FEE2E2', color: '#DC2626' },
  RESCHEDULED: { background: '#EDE9FE', color: '#5B21B6' },
}

// Single-letter day labels so calendar fits on mobile
const CAL_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Departments where the satisfaction leaderboard is intentionally hidden
// on the public schedules page (too few clinicians / private context / etc.)
const HIDE_LEADERBOARD_DEPTS = new Set(['PSYCHOLOGY'])
// Per-department leaderboard is always capped at top 3 (keeps the page
// readable across depts regardless of how many clinicians they have).
const DEPT_TOP_N = 3

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function todayStr() { return new Date().toISOString().split('T')[0] }

// ── Types ─────────────────────────────────────────────────────────────────────
interface StaffInfo    { id: string; firstName: string; lastName: string; department: string; branch: string }
interface PatientInfo  { id: string; firstName: string; lastName: string }
interface PublicSchedule {
  id: string; date: string; startTime: string; endTime: string; sessionType: string; status: string
  staff: StaffInfo; patient: PatientInfo | null
}
interface LeaderboardEntry { id: string; name: string; dept: string; avgRating: number; surveyCount: number; score: number }
interface LeaderboardRankGroup { rank: number; score: number; members: LeaderboardEntry[] }
interface LeaderboardData  { year: number; branchTop5: LeaderboardRankGroup[]; deptTop5: LeaderboardRankGroup[] }

type SortCol = 'staff' | 'patient' | 'time' | 'sessionType' | 'status'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortCol; label: string }[] = [
  { key: 'staff',       label: 'Therapist' },
  { key: 'patient',     label: 'Patient' },
  { key: 'time',        label: 'Time' },
  { key: 'sessionType', label: 'Type of Session' },
  { key: 'status',      label: 'Status' },
]

function getSortVal(s: PublicSchedule, col: SortCol): string {
  switch (col) {
    case 'staff':       return `${s.staff.lastName} ${s.staff.firstName}`
    case 'patient':     return s.patient ? `${s.patient.firstName?.charAt(0)}${s.patient.lastName?.charAt(0)}` : ''
    case 'time':        return s.startTime
    case 'sessionType': return s.sessionType
    case 'status':      return s.status
  }
}

// ── Brand palette ─────────────────────────────────────────────────────────────
// 60% Paper/Narra · 25% Moss/Sage · 10% Ink · 5% Clay/Sun
const NARRA       = '#244952' // primary
const MOSS        = '#4a8073' // secondary
const SAGE        = '#7BA89A' // tertiary
const CLAY        = '#cf9d88' // accent warm
const SUN         = '#c69849' // accent light — single-point emphasis
const PAPER       = '#edf3d9' // neutral light
const INK         = '#1A1A1A' // neutral dark
const SAGE_TINT   = '#E4EEEA' // section-opener bg (Sage + Paper)
const SAGE_BORDER = '#CBDCD5' // soft sage border
// Back-compat aliases — kept so legacy references below stay readable.
const O  = NARRA
const OL = SAGE

const DISPLAY_FONT = 'var(--font-montserrat), system-ui, -apple-system, sans-serif'

const pillBtn = (active: boolean): CSSProperties => ({
  padding: '8px 18px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
  fontFamily: DISPLAY_FONT, letterSpacing: '0.04em', textTransform: 'uppercase',
  border: `1.5px solid ${active ? NARRA : SAGE_BORDER}`,
  background: active ? NARRA : '#fff',
  color: active ? '#fff' : NARRA,
  cursor: 'pointer', transition: 'all 0.15s',
})

const filterInput: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontSize: '11px', padding: '4px 7px', borderRadius: '6px',
  border: `1px solid ${SAGE_BORDER}`, background: '#fff', color: INK, outline: 'none',
}

// ── iOS-safe horizontal scroll helpers ───────────────────────────────────────
// Two-div pattern: outer scrolls, inner sets min-width so table can overflow.
// Using overflow:'scroll' (not 'auto') is required on iOS Safari.
const scrollOuter: CSSProperties = {
  overflowX: 'scroll',
  overflowY: 'visible',
  WebkitOverflowScrolling: 'touch' as any,
  width: '100%',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PublicScheduleView({
  branchCode, deptCode, branchLabel, deptLabel,
}: {
  branchCode: string; deptCode: string; branchLabel: string; deptLabel: string
}) {
  const [view,         setView]         = useState<'weekly' | 'daily' | 'calendar'>('weekly')
  const leaderboardHidden = HIDE_LEADERBOARD_DEPTS.has(deptCode)
  const deptTopN = DEPT_TOP_N
  const [showLb,       setShowLb]       = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [staffFilter,  setStaffFilter]  = useState('All')

  // calendar state
  const today     = new Date()
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [selDay,   setSelDay]   = useState<number | null>(null)

  // weekly state — weekStart is the Sunday of the viewed week (local time, midnight)
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay())
    return d
  })
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  // data
  const [schedules,    setSchedules]    = useState<PublicSchedule[]>([])
  const [loading,      setLoading]      = useState(false)
  const [leaderboard,  setLeaderboard]  = useState<LeaderboardData | null>(null)
  const [lbLoading,    setLbLoading]    = useState(false)

  // sort + filter state (daily)
  const [sortCol,  setSortCol]  = useState<SortCol | null>(null)
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')
  const [colFilters, setColFilters] = useState({ staff: '', patient: '', time: '', sessionType: '', status: '' })

  // ── Fetch leaderboard (once) ──
  useEffect(() => {
    setLbLoading(true)
    if (leaderboardHidden) return
    fetch(`/api/public-schedules/leaderboard?branch=${branchCode}&department=${deptCode}`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.branchTop5 ? d : null))
      .catch(() => setLeaderboard(null))
      .finally(() => setLbLoading(false))
  }, [branchCode, deptCode])

  // ── Fetch daily ──
  useEffect(() => {
    if (view !== 'daily') return
    setLoading(true)
    fetch(`/api/public-schedules?branch=${branchCode}&department=${deptCode}&date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [view, selectedDate, branchCode, deptCode])

  // ── Fetch calendar (full month) ──
  useEffect(() => {
    if (view !== 'calendar') return
    const firstDay = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
    const lastDay  = new Date(calYear, calMonth + 1, 0)
    const lastStr  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    setLoading(true)
    fetch(`/api/public-schedules?branch=${branchCode}&department=${deptCode}&startDate=${firstDay}&endDate=${lastStr}`)
      .then(r => r.json())
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [view, calYear, calMonth, branchCode, deptCode])

  // ── Fetch weekly (Sunday–Saturday) ──
  useEffect(() => {
    if (view !== 'weekly') return
    const startStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
    const end = new Date(weekStart); end.setDate(end.getDate() + 6)
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    setLoading(true)
    fetch(`/api/public-schedules?branch=${branchCode}&department=${deptCode}&startDate=${startStr}&endDate=${endStr}&withDecking=1`)
      .then(r => r.json())
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [view, weekStart, branchCode, deptCode])

  // ── Staff list for dropdown ──
  const allStaff = Array.from(
    new Map(schedules.map(s => [s.staff.id, s.staff])).values()
  ).sort((a, b) => a.lastName.localeCompare(b.lastName))

  // ── Daily processing ──
  const filtered = schedules.filter(s => {
    if (staffFilter !== 'All' && s.staff.id !== staffFilter) return false
    if (colFilters.staff) {
      const n = `${s.staff.lastName} ${s.staff.firstName}`.toLowerCase()
      if (!n.includes(colFilters.staff.toLowerCase())) return false
    }
    if (colFilters.patient) {
      const p = s.patient ? `${s.patient.firstName?.charAt(0)}.${s.patient.lastName?.charAt(0)}.`.toLowerCase() : ''
      if (!p.includes(colFilters.patient.toLowerCase())) return false
    }
    if (colFilters.time) {
      const t = `${formatTime(s.startTime)} ${formatTime(s.endTime)}`.toLowerCase()
      if (!t.includes(colFilters.time.toLowerCase())) return false
    }
    if (colFilters.sessionType && !s.sessionType.toLowerCase().includes(colFilters.sessionType.toLowerCase())) return false
    if (colFilters.status && !s.status.toLowerCase().includes(colFilters.status.toLowerCase())) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortCol) {
      const cmp = getSortVal(a, sortCol).localeCompare(getSortVal(b, sortCol))
      return sortDir === 'asc' ? cmp : -cmp
    }
    return a.staff.lastName.localeCompare(b.staff.lastName) || a.startTime.localeCompare(b.startTime)
  })

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: SortCol }) =>
    sortCol !== col
      ? <ChevronsUpDown size={12} style={{ color: '#bbb' }} />
      : sortDir === 'asc'
        ? <ChevronUp   size={12} style={{ color: O }} />
        : <ChevronDown size={12} style={{ color: O }} />

  // ── Calendar processing ──
  const byDay: Record<number, PublicSchedule[]> = {}
  schedules.forEach(s => {
    const day = s.date ? new Date(s.date).getUTCDate() : null
    if (day) {
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(s)
    }
  })

  const firstOfMonth = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate()
  const calCells: (number | null)[] = [
    ...Array(firstOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calCells.length % 7 !== 0) calCells.push(null)

  const todayDateObj = new Date()
  const isToday = (d: number) =>
    d === todayDateObj.getDate() && calMonth === todayDateObj.getMonth() && calYear === todayDateObj.getFullYear()

  const selDaySessions = selDay ? (byDay[selDay] ?? []) : []
  const selDayStr = selDay
    ? `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(selDay).padStart(2,'0')}`
    : ''

  // ── Weekly processing ──
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  })
  const weekStaff = Array.from(
    new Map(schedules.map(s => [s.staff.id, s.staff])).values()
  ).sort((a, b) =>
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  )
  // Auto-pick first therapist when data changes & current selection is absent
  useEffect(() => {
    if (view !== 'weekly') return
    if (weekStaff.length === 0) { if (selectedStaffId !== null) setSelectedStaffId(null); return }
    if (!selectedStaffId || !weekStaff.find(s => s.id === selectedStaffId)) {
      setSelectedStaffId(weekStaff[0].id)
    }
  }, [view, weekStaff, selectedStaffId])

  const weekSessionsByDay: Record<string, PublicSchedule[]> = {}
  if (selectedStaffId) {
    schedules
      .filter(s => s.staff.id === selectedStaffId)
      .forEach(s => {
        const key = s.date.split('T')[0]
        if (!weekSessionsByDay[key]) weekSessionsByDay[key] = []
        weekSessionsByDay[key].push(s)
      })
  }
  Object.values(weekSessionsByDay).forEach(list =>
    list.sort((a, b) => a.startTime.localeCompare(b.startTime))
  )

  function shiftWeek(n: number) {
    const d = new Date(weekStart); d.setDate(d.getDate() + n * 7)
    setWeekStart(d)
  }
  function gotoThisWeek() {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay())
    setWeekStart(d)
  }
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6)
  const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Global mobile tweaks */}
      <style>{`
        @media (max-width: 640px) {
          .cal-cell { min-height: 56px !important; padding: 4px 2px !important; }
          .cal-session-pill { font-size: 9px !important; }
          .cal-day-num { width: 20px !important; height: 20px !important; font-size: 11px !important; }
          .week-layout { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .week-sidebar { width: 100% !important; max-height: 180px !important; }
          .week-grid-col { width: 100% !important; min-width: 0 !important; }
          .week-grid-wrap { min-width: 560px !important; }
        }
      `}</style>

      {/* Page heading */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            background: NARRA, color: '#fff',
            fontFamily: DISPLAY_FONT, fontSize: '11px', fontWeight: 700,
            padding: '4px 11px', borderRadius: '999px',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {branchLabel}
          </span>
          <span style={{
            background: SAGE_TINT, color: NARRA,
            fontFamily: DISPLAY_FONT, fontSize: '11px', fontWeight: 700,
            padding: '4px 11px', borderRadius: '999px',
            border: `1px solid ${SAGE_BORDER}`,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {deptLabel}
          </span>
        </div>
        <h1 className="sched-display" style={{
          fontFamily: DISPLAY_FONT, fontSize: '26px', fontWeight: 700,
          color: NARRA, margin: '10px 0 0', letterSpacing: '-0.01em', lineHeight: 1.15,
        }}>
          {deptLabel} Schedule
        </h1>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={pillBtn(!showLb && view === 'weekly')}   onClick={() => { setView('weekly');   setShowLb(false) }}>Weekly View</button>
        <button style={pillBtn(!showLb && view === 'daily')}    onClick={() => { setView('daily');    setShowLb(false) }}>Daily View</button>
        <button style={pillBtn(!showLb && view === 'calendar')} onClick={() => { setView('calendar'); setShowLb(false) }}>Monthly View</button>
        {!leaderboardHidden && (
          <button style={pillBtn(showLb)} onClick={() => setShowLb(s => !s)}>🏆 Leaderboard</button>
        )}
      </div>

      {/* ── WEEKLY VIEW ── */}
      {!showLb && view === 'weekly' && (
        <>
          {/* Week nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button onClick={() => shiftWeek(-1)}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={16} style={{ color: O }} />
            </button>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#111', flex: 1, textAlign: 'center', minWidth: '200px' }}>
              {weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
              {' – '}
              {weekEnd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={() => shiftWeek(1)}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={16} style={{ color: O }} />
            </button>
            <button onClick={gotoThisWeek}
              style={{ background: '#fff', border: `1.5px solid ${OL}55`, borderRadius: '8px',
                padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: O, cursor: 'pointer' }}>
              This week
            </button>
            {loading && <span style={{ fontSize: '12px', color: '#aaa' }}>Loading…</span>}
          </div>

          {/* Main layout */}
          <div className="week-layout" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {/* Therapist sidebar */}
            <div className="week-sidebar" style={{
              width: '200px', flexShrink: 0,
              background: '#fff', border: '1px solid #f0f0f0', borderRadius: '12px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'auto', maxHeight: '560px',
            }}>
              <div style={{ background: '#E4EEEA', padding: '10px 14px',
                borderBottom: '1px solid #CBDCD5', fontSize: '11px', fontWeight: 700,
                color: O, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Therapists
              </div>
              {weekStaff.length === 0 ? (
                <div style={{ padding: '20px 14px', fontSize: '12px', color: '#aaa' }}>
                  {loading ? 'Loading…' : 'No therapists with schedules this week.'}
                </div>
              ) : (
                weekStaff.map(s => {
                  const active = s.id === selectedStaffId
                  return (
                    <button key={s.id} onClick={() => setSelectedStaffId(s.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '9px 14px', fontSize: '13px',
                        background: active ? '#E4EEEA' : '#fff',
                        color: active ? O : '#222',
                        fontWeight: active ? 700 : 500,
                        borderLeft: `3px solid ${active ? O : 'transparent'}`,
                        borderTop: 'none', borderRight: 'none', borderBottom: '1px solid #f5f5f5',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                      {s.lastName}, {s.firstName}
                    </button>
                  )
                })
              )}
            </div>

            {/* Weekly grid */}
            <div className="week-grid-col" style={{ flex: 1, minWidth: 0 }}>
              <div style={scrollOuter}>
                <div className="week-grid-wrap" style={{ minWidth: '700px' }}>
                  <div style={{
                    border: '1px solid #f0f0f0', borderRadius: '12px', overflow: 'hidden',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)', background: '#fff',
                  }}>
                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                      background: '#E4EEEA', borderBottom: '1px solid #CBDCD5' }}>
                      {weekDays.map((d, i) => {
                        const isToday = d.toDateString() === new Date().toDateString()
                        return (
                          <div key={i} style={{
                            padding: '10px 6px', textAlign: 'center',
                            borderRight: i < 6 ? '1px solid #CBDCD5' : 'none',
                          }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: O,
                              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {DAY_LABELS[i]}
                            </div>
                            <div style={{
                              fontSize: '14px', fontWeight: 700, marginTop: '2px',
                              color: isToday ? '#fff' : '#111',
                              background: isToday ? O : 'transparent',
                              borderRadius: '999px', display: 'inline-block',
                              minWidth: '22px', padding: '1px 6px',
                            }}>
                              {d.getDate()}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Day cells */}
                    {selectedStaffId ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                        {weekDays.map((d, i) => {
                          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                          const daySessions = weekSessionsByDay[key] ?? []
                          const todayMid = new Date(); todayMid.setHours(0,0,0,0)
                          const isPast = d < todayMid
                          return (
                            <div key={i} style={{
                              minHeight: '220px', padding: '6px',
                              borderRight: i < 6 ? '1px solid #f5f5f5' : 'none',
                              background: '#fff',
                            }}>
                              {daySessions.length === 0 ? (
                                <div style={{ height: '100%' }} />
                              ) : (
                                daySessions.map(s => {
                                  const isDecking = s.id.startsWith('decking-')
                                  const colors = (isPast && isDecking)
                                    ? { background: '#F3F4F6', color: '#6B7280' }
                                    : (STATUS_COLORS[s.status] ?? { background: '#f3f4f6', color: '#374151' })
                                  return (
                                    <div key={s.id} style={{
                                      background: colors.background, color: colors.color,
                                      borderRadius: '6px', padding: '5px 7px', marginBottom: '4px',
                                      fontSize: '11px', lineHeight: 1.35,
                                    }}>
                                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap',
                                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {formatTime(s.startTime)}
                                      </div>
                                      <div style={{ fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap',
                                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {s.patient
                                          ? `${s.patient.firstName?.charAt(0)}.${s.patient.lastName?.charAt(0)}.`
                                          : '—'}
                                      </div>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                        {loading ? 'Loading schedules…' : 'Select a therapist to view their week.'}
                      </div>
                    )}
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap',
                    padding: '10px 4px', fontSize: '11px', color: '#666' }}>
                    {[
                      ['Confirmed',   STATUS_COLORS.CONFIRMED],
                      ['Rescheduled', STATUS_COLORS.RESCHEDULED],
                      ['Cancelled',   STATUS_COLORS.CANCELLED],
                      ['Pending',     STATUS_COLORS.PENDING],
                    ].map(([label, c]) => {
                      const col = c as { background: string; color: string }
                      return (
                        <span key={label as string} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '12px', height: '12px', borderRadius: '3px',
                            background: col.background, border: `1px solid ${col.color}22` }} />
                          {label as string}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── DAILY VIEW ── */}
      {!showLb && view === 'daily' && (
        <>
          {/* Controls */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center',
            background: '#fff', border: '1px solid #f0f0f0', borderRadius: '12px',
            padding: '14px 16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Date</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '8px',
                  border: `1.5px solid ${OL}55`, color: '#111', background: '#fff', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Staff</label>
              <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: '8px',
                  border: `1.5px solid ${OL}55`, color: '#111', background: '#fff', outline: 'none', cursor: 'pointer' }}>
                <option value="All">All Therapists</option>
                {allStaff.map(s => (
                  <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', padding: '48px 0', color: '#aaa', fontSize: '14px' }}>Loading schedules…</p>
          ) : schedules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 0', background: '#fff',
              border: '1px solid #f0f0f0', borderRadius: '12px' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#333', margin: '0 0 4px' }}>No sessions scheduled</p>
              <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                })}
              </p>
            </div>
          ) : (
            <div style={{ borderRadius: '12px', border: '1px solid #f0f0f0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {/* Summary bar */}
              <div style={{ background: '#E4EEEA', padding: '10px 16px',
                borderBottom: '1px solid #CBDCD5', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: O }}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-PH', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                  })}
                </span>
                <span style={{ background: O, color: '#fff', fontSize: '11px', fontWeight: 700,
                  padding: '2px 10px', borderRadius: '999px' }}>
                  {sorted.length} session{sorted.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Horizontally scrollable table — two-div iOS pattern */}
              <div style={scrollOuter}>
                <div style={{ minWidth: '560px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: PAPER, borderBottom: `1px solid ${SAGE_BORDER}` }}>
                      {COLUMNS.map(({ key, label }) => (
                        <th key={key}
                          onClick={() => toggleSort(key)}
                          style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px',
                            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                            color: sortCol === key ? O : '#888', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {label} <SortIcon col={key} />
                          </span>
                        </th>
                      ))}
                    </tr>
                    {/* Filter row */}
                    <tr style={{ background: '#fdfdfd', borderBottom: '1px solid #f0f0f0' }}>
                      {COLUMNS.map(({ key }) => (
                        <th key={key} style={{ padding: '5px 10px' }}>
                          {key === 'status' ? (
                            <select value={colFilters.status}
                              onChange={e => setColFilters(p => ({ ...p, status: e.target.value }))}
                              style={filterInput}>
                              <option value="">All</option>
                              {['PENDING','CONFIRMED','CANCELLED','RESCHEDULED'].map(st => (
                                <option key={st} value={st.toLowerCase()}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>
                              ))}
                            </select>
                          ) : (
                            <input type="text" placeholder="Filter…"
                              value={colFilters[key as keyof typeof colFilters]}
                              onChange={e => setColFilters(p => ({ ...p, [key]: e.target.value }))}
                              style={filterInput} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                          No sessions match your filters.
                        </td>
                      </tr>
                    ) : sorted.map((s, i) => (
                      <tr key={s.id}
                        style={{ borderBottom: i < sorted.length - 1 ? '1px solid #f5f5f5' : 'none',
                          background: i % 2 === 0 ? '#fff' : '#fdfdfb' }}>
                        <td style={{ padding: '10px 14px', color: '#111', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {s.staff.lastName}, {s.staff.firstName}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#333', whiteSpace: 'nowrap' }}>
                          {s.patient
                            ? <span style={{ fontWeight: 500 }}>{s.patient.firstName?.charAt(0)}.{s.patient.lastName?.charAt(0)}.</span>
                            : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#444', whiteSpace: 'nowrap' }}>
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#444', whiteSpace: 'nowrap' }}>
                          {s.sessionType}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                            whiteSpace: 'nowrap',
                            ...(STATUS_COLORS[s.status] ?? { background: '#f3f4f6', color: '#374151' })
                          }}>
                            {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CALENDAR VIEW ── */}
      {!showLb && view === 'calendar' && (
        <>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button onClick={() => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) } else setCalMonth(m => m - 1) }}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <ChevronLeft size={16} style={{ color: O }} />
            </button>
            <span style={{ fontWeight: 700, fontSize: '16px', color: '#111', flex: 1, textAlign: 'center', minWidth: '120px' }}>
              {MONTHS[calMonth]} {calYear}
            </span>
            <button onClick={() => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) } else setCalMonth(m => m + 1) }}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <ChevronRight size={16} style={{ color: O }} />
            </button>
            {loading && <span style={{ fontSize: '12px', color: '#aaa' }}>Loading…</span>}
          </div>

          {/* Calendar grid — responsive, no horizontal scroll needed */}
          <div style={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)', background: '#fff', marginBottom: '16px' }}>
            {/* Day headers — single letters to fit mobile */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              background: '#E4EEEA', borderBottom: '1px solid #CBDCD5' }}>
              {CAL_DAYS.map((d, i) => (
                <div key={i} style={{ padding: '8px 4px', textAlign: 'center',
                  fontSize: '11px', fontWeight: 700, color: O, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {calCells.map((day, idx) => {
                const sessions = day ? (byDay[day] ?? []) : []
                const isTod    = day ? isToday(day) : false
                const isSel    = day === selDay
                return (
                  <div key={idx}
                    className="cal-cell"
                    onClick={() => day && setSelDay(selDay === day ? null : day)}
                    style={{
                      minHeight: '72px', padding: '5px 4px',
                      borderRight:  (idx + 1) % 7 !== 0 ? '1px solid #f5f5f5' : 'none',
                      borderBottom: idx < calCells.length - 7 ? '1px solid #f5f5f5' : 'none',
                      background: isSel ? '#E4EEEA' : '#fff',
                      cursor: day ? 'pointer' : 'default',
                    }}>
                    {day && (
                      <>
                        <div className="cal-day-num" style={{
                          width: '22px', height: '22px', borderRadius: '50%',
                          background: isTod ? O : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginBottom: '3px',
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: isTod ? 700 : 500,
                            color: isTod ? '#fff' : isSel ? O : '#333', lineHeight: 1 }}>
                            {day}
                          </span>
                        </div>
                        {sessions.slice(0, 2).map(s => (
                          <div key={s.id} className="cal-session-pill" style={{
                            fontSize: '10px', padding: '1px 4px', borderRadius: '3px', marginBottom: '2px',
                            background: STATUS_COLORS[s.status]?.background ?? '#f3f4f6',
                            color:      STATUS_COLORS[s.status]?.color      ?? '#374151',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {formatTime(s.startTime)} {s.staff.lastName}
                          </div>
                        ))}
                        {sessions.length > 2 && (
                          <div style={{ fontSize: '10px', color: OL, fontWeight: 600, padding: '1px 3px' }}>
                            +{sessions.length - 2} more
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selDay && (
            <div style={{ border: '1px solid #CBDCD5', borderRadius: '12px',
              boxShadow: '0 1px 4px rgba(36,73,82,0.08)', marginBottom: '16px' }}>
              <div style={{ background: '#E4EEEA', padding: '10px 16px',
                borderBottom: '1px solid #CBDCD5', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: O }}>
                  {new Date(selDayStr + 'T12:00:00').toLocaleDateString('en-PH', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                  })}
                </span>
                <span style={{ background: O, color: '#fff', fontSize: '11px', fontWeight: 700,
                  padding: '2px 10px', borderRadius: '999px' }}>
                  {selDaySessions.length} session{selDaySessions.length !== 1 ? 's' : ''}
                </span>
              </div>
              {selDaySessions.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '13px', background: '#fff' }}>
                  No sessions on this day.
                </div>
              ) : (
                /* Horizontally scrollable for mobile — two-div iOS pattern */
                <div style={scrollOuter}>
                  <div style={{ minWidth: '480px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff' }}>
                    <thead>
                      <tr style={{ background: PAPER, borderBottom: `1px solid ${SAGE_BORDER}` }}>
                        {['Therapist', 'Patient', 'Time', 'Type of Session', 'Status'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '11px',
                            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                            color: '#888', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selDaySessions
                        .sort((a, b) => a.staff.lastName.localeCompare(b.staff.lastName) || a.startTime.localeCompare(b.startTime))
                        .map((s, i, arr) => (
                          <tr key={s.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                            <td style={{ padding: '9px 14px', color: '#111', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {s.staff.lastName}, {s.staff.firstName}
                            </td>
                            <td style={{ padding: '9px 14px', color: '#333', whiteSpace: 'nowrap' }}>
                              {s.patient
                                ? <span style={{ fontWeight: 500 }}>{s.patient.firstName?.charAt(0)}.{s.patient.lastName?.charAt(0)}.</span>
                                : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ padding: '9px 14px', color: '#444', whiteSpace: 'nowrap' }}>
                              {formatTime(s.startTime)} – {formatTime(s.endTime)}
                            </td>
                            <td style={{ padding: '9px 14px', color: '#444', whiteSpace: 'nowrap' }}>{s.sessionType}</td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{
                                padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                                whiteSpace: 'nowrap',
                                ...(STATUS_COLORS[s.status] ?? { background: '#f3f4f6', color: '#374151' })
                              }}>
                                {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── LEADERBOARD ── */}
      {showLb && !leaderboardHidden && <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: `1px solid ${SAGE_BORDER}` }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: O, margin: '0 0 2px' }}>
              Customer Satisfaction
            </p>
            <h2 className="sched-display" style={{
              fontFamily: DISPLAY_FONT, fontSize: '20px', fontWeight: 700,
              color: NARRA, margin: 0, letterSpacing: '-0.01em',
            }}>
              Satisfaction Leaderboard
            </h2>
          </div>
          {leaderboard && (
            <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', flexShrink: 0 }}>
              {leaderboard.year} · Branch Top 5 · Dept Top 3
            </span>
          )}
        </div>

        {lbLoading ? (
          <p style={{ textAlign: 'center', padding: '32px 0', color: '#aaa', fontSize: '14px' }}>
            Loading leaderboard…
          </p>
        ) : !leaderboard ? (
          <div style={{ textAlign: 'center', padding: '32px', background: '#fff',
            border: '1px solid #f0f0f0', borderRadius: '12px', color: '#aaa', fontSize: '13px' }}>
            No leaderboard data available yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <LeaderboardCard
              title="Top 5 — Branch"
              subtitle={branchLabel}
              entries={leaderboard.branchTop5}
              highlightDept={deptCode}
            />
            <LeaderboardCard
              title={`Top ${deptTopN} — Department`}
              subtitle={deptLabel}
              entries={leaderboard.deptTop5.slice(0, deptTopN)}
            />
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          marginTop: '14px', padding: '12px 16px',
          background: PAPER, border: `1px solid ${SAGE_BORDER}`,
          borderRadius: '10px', fontSize: '11px', color: INK, opacity: 0.85, lineHeight: 1.6,
        }}>
          <strong style={{ color: NARRA, opacity: 1 }}>Note:</strong> Rankings are based on Customer Satisfaction Survey results
          from patients/clients chosen randomly by the system. If a therapist&apos;s name does not appear, it may also be possible that their
          patients/clients have not yet been asked to assess them. Rankings become more representative after at least 3 months of data collection.
        </div>
      </div>}
    </div>
  )
}

// ── Leaderboard Card sub-component ───────────────────────────────────────────
// Sun → Clay → Sage for the podium (warm-to-cool, brand-pure)
const RANK_COLORS = ['#c69849', '#cf9d88', '#7BA89A', '#aaa', '#aaa']
const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th']

function LeaderboardCard({
  title, subtitle, entries, highlightDept,
}: {
  title: string
  subtitle: string
  entries: LeaderboardRankGroup[]
  highlightDept?: string
}) {

  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Card header — Narra → Sun gradient (hero moment, warmth) */}
      <div style={{
        background: 'linear-gradient(135deg, #244952 0%, #4a8073 55%, #c69849 130%)',
        padding: '14px 16px',
      }}>
        <p className="sched-display" style={{
          fontFamily: 'var(--font-montserrat), system-ui, sans-serif',
          fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: 'rgba(244,236,221,0.75)', margin: '0 0 2px',
        }}>
          {title}
        </p>
        <p className="sched-display" style={{
          fontFamily: 'var(--font-montserrat), system-ui, sans-serif',
          fontSize: '15px', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.01em',
        }}>
          {subtitle}
        </p>
      </div>

      {/* Rows */}
      {entries.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#aaa' }}>
          No data available yet.
        </div>
      ) : (
        <div>
          {entries.map((group, i) => {
            const isTied = group.members.length > 1
            const rankIdx = group.rank - 1
            return (
              <div key={'r' + group.rank} style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                padding: '10px 16px',
                borderBottom: i < entries.length - 1 ? '1px solid #f0eee9' : 'none',
                background: group.rank === 1 ? '#edf3d9' : '#fff',
              }}>
                {/* Rank badge */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                  background: rankIdx < 3 ? RANK_COLORS[rankIdx] : '#f0f0f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: rankIdx < 3 ? '#fff' : '#999' }}>
                    {RANK_LABELS[rankIdx] ?? (group.rank + 'th')}
                  </span>
                </div>

                {/* Name(s) + dept — vertical stack for ties */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isTied ? (
                    <>
                      <p style={{
                        fontFamily: 'var(--font-montserrat), system-ui, sans-serif',
                        fontSize: '10px', color: '#cf9d88', margin: '0 0 4px',
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        Tied · {group.members.length} therapists
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {group.members.map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#7BA89A', flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A', lineHeight: 1.3 }}>
                              {m.name}
                            </span>
                            {highlightDept !== undefined && (
                              <span style={{ fontSize: '10px', color: '#7BA89A', opacity: 0.85 }}>{m.dept}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{
                        fontSize: '13px', fontWeight: 600, color: '#1A1A1A', margin: 0, lineHeight: 1.3,
                      }}>
                        {group.members[0].name}
                      </p>
                      {highlightDept !== undefined && (
                        <p style={{ fontSize: '10px', color: '#7BA89A', margin: 0, opacity: 0.85 }}>{group.members[0].dept}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Score — Sun for "key data, single-point emphasis" */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="sched-display" style={{
                    fontFamily: 'var(--font-montserrat), system-ui, sans-serif',
                    fontSize: '17px', fontWeight: 700, color: '#cf9d88',
                    margin: 0, lineHeight: 1, letterSpacing: '-0.01em',
                  }}>
                    {group.score.toFixed(1)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
