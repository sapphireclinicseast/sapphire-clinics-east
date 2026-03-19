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
interface LeaderboardData  { year: number; branchTop5: LeaderboardEntry[]; deptTop5: LeaderboardEntry[] }

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

// ── Orange theme helpers ──────────────────────────────────────────────────────
const O  = '#ED6823'
const OL = '#FFA235'

// ── Enter Code overlay ────────────────────────────────────────────────────────
function CodeGate({ onVerified }: { onVerified: () => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (input.trim() === 'scei') {
      // Set a session cookie (no maxAge = expires when browser closes)
      document.cookie = 'sched_access=scei; path=/; SameSite=Strict'
      onVerified()
    } else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        border: '1px solid #f0e8e2', borderRadius: '16px',
        overflow: 'hidden', boxShadow: '0 8px 32px rgba(237,104,35,0.15)',
        background: '#fff',
      }}>
        <div style={{ height: '5px', background: `linear-gradient(90deg,${O},${OL})` }} />
        <div style={{ padding: '28px 24px 24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#000', margin: '0 0 4px' }}>
            Schedule Access
          </h2>
          <p style={{ fontSize: '13px', color: '#777', margin: '0 0 20px' }}>
            Enter the access code to continue.
          </p>
          <form onSubmit={submit}>
            <input
              autoFocus
              autoComplete="off"
              type="text"
              placeholder="Access code"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false) }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 13px', fontSize: '15px', marginBottom: '8px',
                border: error ? '1.5px solid #dc2626' : '1.5px solid #e5e7eb',
                borderRadius: '8px', outline: 'none', color: '#111',
              }}
            />
            {error && (
              <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 10px' }}>
                Incorrect code. Please try again.
              </p>
            )}
            <button type="submit" style={{
              width: '100%', padding: '10px',
              background: O, color: '#fff', fontWeight: 700,
              fontSize: '14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
            }}>
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const pillBtn = (active: boolean): CSSProperties => ({
  padding: '7px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
  border: `2px solid ${active ? O : '#e5e7eb'}`,
  background: active ? O : '#fff',
  color: active ? '#fff' : '#888',
  cursor: 'pointer', transition: 'all 0.15s',
})

const filterInput: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontSize: '11px', padding: '3px 6px', borderRadius: '6px',
  border: '1px solid #e5e7eb', background: '#fff', color: '#111', outline: 'none',
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
  // ── Passcode gate — resets on every page refresh (React state is not persisted) ──
  const [verified, setVerified] = useState(false)

  // Clear the cookie on every mount so API calls are blocked until code is re-entered
  useEffect(() => {
    document.cookie = 'sched_access=; path=/; max-age=0; SameSite=Strict'
  }, [])

  const [view,         setView]         = useState<'daily' | 'calendar'>('daily')
  const [showLb,       setShowLb]       = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [staffFilter,  setStaffFilter]  = useState('All')

  // calendar state
  const today     = new Date()
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [selDay,   setSelDay]   = useState<number | null>(null)

  // data
  const [schedules,    setSchedules]    = useState<PublicSchedule[]>([])
  const [loading,      setLoading]      = useState(false)
  const [leaderboard,  setLeaderboard]  = useState<LeaderboardData | null>(null)
  const [lbLoading,    setLbLoading]    = useState(false)

  // sort + filter state (daily)
  const [sortCol,  setSortCol]  = useState<SortCol | null>(null)
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')
  const [colFilters, setColFilters] = useState({ staff: '', patient: '', time: '', sessionType: '', status: '' })

  // ── Fetch leaderboard (once, on verify) ──
  useEffect(() => {
    if (!verified) return
    setLbLoading(true)
    fetch(`/api/public-schedules/leaderboard?branch=${branchCode}&department=${deptCode}`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.branchTop5 ? d : null))
      .catch(() => setLeaderboard(null))
      .finally(() => setLbLoading(false))
  }, [verified, branchCode, deptCode])

  // ── Fetch daily ──
  useEffect(() => {
    if (!verified) return
    if (view !== 'daily') return
    setLoading(true)
    fetch(`/api/public-schedules?branch=${branchCode}&department=${deptCode}&date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [verified, view, selectedDate, branchCode, deptCode])

  // ── Fetch calendar (full month) ──
  useEffect(() => {
    if (!verified) return
    if (view !== 'calendar') return
    const firstDay = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
    const lastDay  = new Date(calYear, calMonth + 1, 0)
    const lastStr  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    setLoading(true)
    fetch(`/api/public-schedules?branch=${branchCode}&department=${deptCode}&startDate=${firstDay}&endDate=${lastStr}`)
      .then(r => r.json())
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [verified, view, calYear, calMonth, branchCode, deptCode])

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

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {!verified && (
        <CodeGate onVerified={() => setVerified(true)} />
      )}

      {/* Global mobile tweaks */}
      <style>{`
        @media (max-width: 640px) {
          .cal-cell { min-height: 56px !important; padding: 4px 2px !important; }
          .cal-session-pill { font-size: 9px !important; }
          .cal-day-num { width: 20px !important; height: 20px !important; font-size: 11px !important; }
        }
      `}</style>

      {/* Page heading */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ background: '#FFF0E8', color: O, fontSize: '12px', fontWeight: 700,
            padding: '3px 10px', borderRadius: '999px', border: `1px solid ${OL}` }}>
            {branchLabel}
          </span>
          <span style={{ background: '#f5f5f5', color: '#444', fontSize: '12px', fontWeight: 600,
            padding: '3px 10px', borderRadius: '999px' }}>
            {deptLabel}
          </span>
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', margin: '8px 0 0' }}>
          {deptLabel} Schedule
        </h1>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={pillBtn(!showLb && view === 'daily')}    onClick={() => { setView('daily');    setShowLb(false) }}>Daily View</button>
        <button style={pillBtn(!showLb && view === 'calendar')} onClick={() => { setView('calendar'); setShowLb(false) }}>Calendar View</button>
        <button style={pillBtn(showLb)} onClick={() => setShowLb(s => !s)}>🏆 Leaderboard</button>
      </div>

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
              <div style={{ background: '#FFF0E8', padding: '10px 16px',
                borderBottom: '1px solid #F5D5C0', display: 'flex', justifyContent: 'space-between',
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
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
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
              background: '#FFF0E8', borderBottom: '1px solid #F5D5C0' }}>
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
                      background: isSel ? '#FFF0E8' : '#fff',
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
            <div style={{ border: '1px solid #F5D5C0', borderRadius: '12px',
              boxShadow: '0 1px 4px rgba(237,104,35,0.08)', marginBottom: '16px' }}>
              <div style={{ background: '#FFF0E8', padding: '10px 16px',
                borderBottom: '1px solid #F5D5C0', display: 'flex', justifyContent: 'space-between',
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
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
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
      {showLb && <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '2px solid #F5E8D8' }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: O, margin: '0 0 2px' }}>
              Customer Satisfaction
            </p>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111', margin: 0 }}>
              Satisfaction Leaderboard
            </h2>
          </div>
          {leaderboard && (
            <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', flexShrink: 0 }}>
              {leaderboard.year} · Top 5
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
              title="Overall for Branch"
              subtitle={branchLabel}
              entries={leaderboard.branchTop5}
              highlightDept={deptCode}
            />
            <LeaderboardCard
              title="Overall for Department"
              subtitle={deptLabel}
              entries={leaderboard.deptTop5}
            />
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          marginTop: '14px', padding: '12px 16px',
          background: '#FFFBF5', border: '1px solid #F5E8D8',
          borderRadius: '10px', fontSize: '11px', color: '#888', lineHeight: 1.6,
        }}>
          <strong style={{ color: '#666' }}>Note:</strong> Rankings are based on Customer Satisfaction Survey results
          from patients/clients chosen randomly by the system. If a therapist&apos;s name does not appear, it may also be possible that their
          patients/clients have not yet been asked to assess them. Rankings become more representative after at least 3 months of data collection.
        </div>
      </div>}
    </div>
  )
}

// ── Leaderboard Card sub-component ───────────────────────────────────────────
const RANK_COLORS = ['#ED6823', '#FFA235', '#FFDE59', '#aaa', '#aaa']
const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th']

function LeaderboardCard({
  title, subtitle, entries, highlightDept,
}: {
  title: string
  subtitle: string
  entries: LeaderboardEntry[]
  highlightDept?: string
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Card header */}
      <div style={{
        background: 'linear-gradient(135deg, #ED6823, #FFA235)',
        padding: '12px 16px',
      }}>
        <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'rgba(255,255,255,0.75)', margin: '0 0 2px' }}>
          {title}
        </p>
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff', margin: 0 }}>{subtitle}</p>
      </div>

      {/* Rows */}
      {entries.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#aaa' }}>
          No data available yet.
        </div>
      ) : (
        <div>
          {entries.map((e, i) => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 16px',
              borderBottom: i < entries.length - 1 ? '1px solid #f5f5f5' : 'none',
              background: i === 0 ? '#FFFBF5' : '#fff',
            }}>
              {/* Rank badge */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: i < 3 ? RANK_COLORS[i] : '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: i < 3 ? '#fff' : '#999' }}>
                  {RANK_LABELS[i]}
                </span>
              </div>

              {/* Name + dept */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name}
                </p>
                {highlightDept !== undefined && (
                  <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>{e.dept}</p>
                )}
              </div>

              {/* Score */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#ED6823', margin: 0, lineHeight: 1 }}>
                  {e.score.toFixed(1)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
