'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { localTodayStr } from '@/lib/utils'
import {
  BarChart2, CalendarDays, Users, Settings, Star,
  Filter, Lock, Activity, ChevronDown, ChevronUp, User,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Constants ────────────────────────────────────────────────────────────────

// INVESTOR is deliberately excluded — investor accounts are scoped to the
// Patient Dashboard only (hard-gated in (dashboard)/layout.tsx). This client
// check is the cosmetic backstop; the API routes exclude INVESTOR too.
const ALLOWED_ROLES = ['ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS'] as const
const DEPT_LABELS: Record<string, string> = {
  OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED', MD: 'MD',
  PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthosis Prosthesis',
}

const BRANCHES = ['SBEA', 'SBGH'] as const
const BRANCH_LABELS: Record<string, string> = { SBEA: 'East Branch', SBGH: 'Greenhills Branch' }

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00',
]
const TIME_LABELS: Record<string, string> = {
  '09:00': '9:00-10:00', '10:00': '10:00-11:00', '11:00': '11:00-12:00',
  '12:00': '12:00-1:00', '13:00': '1:00-2:00', '14:00': '2:00-3:00',
  '15:00': '3:00-4:00', '16:00': '4:00-5:00', '17:00': '5:00-6:00',
  '18:00': '6:00-7:00', '19:00': '7:00-8:00',
}

const DAY_SHORT = ['Sn', 'M', 'T', 'W', 'Th', 'F', 'St']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = localTodayStr
function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

function getSlotForTime(startTime: string): string {
  const h = parseInt(startTime.split(':')[0], 10)
  if (h >= 9 && h < 20) return `${h.toString().padStart(2, '0')}:00`
  return ''
}

function heatBg(count: number, max: number): string {
  if (count === 0) return ''
  const intensity = Math.min(count / Math.max(max, 5), 0.7)
  return `rgba(16, 185, 129, ${intensity})`
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ScheduleRow {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  sessionType: string
  staffId: string
  staffName: string
  department: string
  branch: string
}

interface MaxSessions { [branch: string]: { [dept: string]: number } }

// ── Component ────────────────────────────────────────────────────────────────

export default function SchedulingDashboardClient({ role }: { role: string }) {
  // Access check
  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
        <Lock size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          The Scheduling Dashboard is only available to Admin, AHEA Admin, AHGH Admin, Verdana Admin, and Marketing Admin users.
        </p>
      </div>
    )
  }

  return <DashboardContent role={role} />
}

function DashboardContent({ role }: { role: string }) {
  const isInvestor = role === 'INVESTOR'
  // ── Filter state ──
  const [startDate, setStartDate] = useState(monthAgoStr())
  const [endDate, setEndDate] = useState(todayStr())
  const [status, setStatus] = useState('CONFIRMED')
  const [branch, setBranch] = useState('all')
  const [selectedDepts, setSelectedDepts] = useState<string[]>([...DEPARTMENTS])
  const [allDepts, setAllDepts] = useState(true)
  const [selectedDay, setSelectedDay] = useState(todayStr())

  // ── Data state ──
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [uniqueStaff, setUniqueStaff] = useState(0)
  const [loading, setLoading] = useState(false)

  // ── Settings state ──
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [maxSessions, setMaxSessions] = useState<MaxSessions>(() => {
    // Seed from localStorage cache for instant render; DB fetch runs in useEffect below
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('sched_dash_max_sessions_hub')
        if (cached) return JSON.parse(cached)
      } catch { /* ignore */ }
    }
    const def: MaxSessions = {}
    BRANCHES.forEach(b => { def[b] = {}; DEPARTMENTS.forEach(d => { def[b][d] = 8 }) })
    return def
  })

  // Load persisted settings from DB on mount (source of truth)
  useEffect(() => {
    fetch('/api/scheduling-dashboard/cap-settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Object.keys(data).length) {
          setMaxSessions(data)
          localStorage.setItem('sched_dash_max_sessions_hub', JSON.stringify(data))
        }
      })
      .catch(() => { /* keep localStorage/default */ })
  }, [])

  // ── Top therapists tab ──
  const [therapistTab, setTherapistTab] = useState('all')

  // ── Fetch data ──
  // Retries once on failure: right after a post-login redirect chain (e.g.
  // investor's forced /dashboard → /scheduling-dashboard hop) the session
  // cookie can occasionally lag the very first client-side fetch, which
  // otherwise left this page silently blank until a manual refresh.
  const fetchData = useCallback(async (isRetry = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate, endDate,
        status,
        branch,
        departments: allDepts ? 'all' : selectedDepts.join(','),
      })
      const res = await fetch(`/api/scheduling-dashboard?${params}`)
      if (!res.ok) {
        if (!isRetry && (res.status === 401 || res.status === 403)) {
          await new Promise(r => setTimeout(r, 700))
          await fetchData(true)
          return
        }
        throw new Error('Failed to fetch')
      }
      const data = await res.json()
      setSchedules(data.schedules)
      setUniqueStaff(data.uniqueStaffCount)
    } catch (err) {
      console.error('Fetch error:', err)
      if (!isRetry) {
        await new Promise(r => setTimeout(r, 700))
        await fetchData(true)
        return
      }
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, status, branch, selectedDepts, allDepts])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Dept checkbox handlers ──
  function toggleAllDepts(checked: boolean) {
    setAllDepts(checked)
    setSelectedDepts(checked ? [...DEPARTMENTS] : [])
  }
  function toggleDept(dept: string, checked: boolean) {
    const next = checked ? [...selectedDepts, dept] : selectedDepts.filter(d => d !== dept)
    setSelectedDepts(next)
    setAllDepts(next.length === DEPARTMENTS.length)
  }

  // ── KPIs ──
  const totalSessions = schedules.length
  const activeBranches = branch === 'all' ? [...BRANCHES] : [branch]
  const activeDepts = allDepts ? [...DEPARTMENTS] : selectedDepts

  const workingDays = useMemo(() => {
    let count = 0
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 6) count++ // exclude Saturday
    }
    return count
  }, [startDate, endDate])

  const totalCapacity = useMemo(() => {
    let cap = 0
    activeBranches.forEach(b => {
      activeDepts.forEach(d => { cap += (maxSessions[b]?.[d] || 8) * workingDays })
    })
    return cap
  }, [activeBranches, activeDepts, maxSessions, workingDays])

  const utilization = totalCapacity > 0 ? (totalSessions / totalCapacity) * 100 : 0
  const avgPerTherapist = uniqueStaff > 0 ? totalSessions / uniqueStaff : 0
  // Avg sessions per OPERATING day — uses the same workingDays denominator as
  // the utilization calc (Saturday excluded), so the figure represents an
  // average over days the clinic actually operates. Reacts to the same
  // date / branch / department filters that drive totalSessions.
  const avgPerDay = workingDays > 0 ? totalSessions / workingDays : 0

  // ── Day options for daily table ──
  const dayOptions = useMemo(() => {
    const options: { value: string; label: string }[] = []
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split('T')[0]
      const label = `${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
      options.push({ value: iso, label })
    }
    return options
  }, [startDate, endDate])

  // ── Daily table data ──
  const dailyData = useMemo(() => {
    const daySessions = schedules.filter(s => s.date === selectedDay)
    const grid: Record<string, Record<string, number>> = {}
    const totals: Record<string, number> = {}
    TIME_SLOTS.forEach(slot => { grid[slot] = {}; activeDepts.forEach(d => { grid[slot][d] = 0 }) })
    activeDepts.forEach(d => { totals[d] = 0 })

    daySessions.forEach(s => {
      const slot = getSlotForTime(s.startTime)
      if (slot && grid[slot] && activeDepts.includes(s.department)) {
        grid[slot][s.department]++
        totals[s.department]++
      }
    })
    return { grid, totals }
  }, [schedules, selectedDay, activeDepts])

  // ── Weekly table data ──
  const weeklyData = useMemo(() => {
    const grid: Record<string, number[]> = {}
    const dayTotals = [0, 0, 0, 0, 0, 0, 0]
    TIME_SLOTS.forEach(slot => { grid[slot] = [0, 0, 0, 0, 0, 0, 0] })

    schedules.forEach(s => {
      const dow = new Date(s.date + 'T12:00:00').getDay()
      const slot = getSlotForTime(s.startTime)
      if (slot && grid[slot]) {
        grid[slot][dow]++
        dayTotals[dow]++
      }
    })
    return { grid, dayTotals }
  }, [schedules])

  // ── Chart data (sessions over time) ──
  const chartData = useMemo(() => {
    const dateMap: Record<string, number> = {}
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      dateMap[d.toISOString().split('T')[0]] = 0
    }
    schedules.forEach(sc => { if (dateMap[sc.date] !== undefined) dateMap[sc.date]++ })

    const dates = Object.keys(dateMap).sort()
    const counts = dates.map(d => dateMap[d])

    // Linear regression for trendline
    const n = counts.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    counts.forEach((y, i) => { sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i })
    const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0
    const intercept = n > 0 ? (sumY - slope * sumX) / n : 0

    // Capacity per day
    let dailyCap = 0
    activeBranches.forEach(b => { activeDepts.forEach(d => { dailyCap += (maxSessions[b]?.[d] || 8) }) })

    return dates.map((d, i) => {
      const dt = new Date(d + 'T12:00:00')
      return {
        label: DAY_SHORT[dt.getDay()] + dt.getDate(),
        total: dateMap[d],
        trend: Math.max(0, slope * i + intercept),
        utilization: dailyCap > 0 ? (dateMap[d] / dailyCap) * 100 : 0,
      }
    })
  }, [schedules, startDate, endDate, activeBranches, activeDepts, maxSessions])

  // ── Top therapists ──
  const topTherapists = useMemo(() => {
    const confirmed = schedules.filter(s => s.status === 'CONFIRMED')
    const filtered = therapistTab === 'all' ? confirmed : confirmed.filter(s => s.department === therapistTab)
    // Keyed by staffId, not staffName — investor sessions receive
    // initials-only names, and two different therapists can share initials.
    const counts: Record<string, { staffId: string; name: string; dept: string; count: number }> = {}
    filtered.forEach(s => {
      if (!counts[s.staffId]) counts[s.staffId] = { staffId: s.staffId, name: s.staffName, dept: s.department, count: 0 }
      counts[s.staffId].count++
    })
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [schedules, therapistTab])

  // ── Settings save ──
  async function saveSettings() {
    setSettingsOpen(false)
    try {
      const res = await fetch('/api/scheduling-dashboard/cap-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maxSessions),
      })
      if (res.ok) {
        const saved = await res.json()
        setMaxSessions(saved)
        localStorage.setItem('sched_dash_max_sessions_hub', JSON.stringify(saved))
      }
    } catch { /* best-effort; state already updated locally */ }
  }

  // ── Styles ──
  const cardStyle = 'bg-white border border-gray-200 rounded-xl overflow-hidden'
  const sectionH = 'text-sm font-bold text-gray-900 flex items-center gap-2'

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
            Clinic Utilization
          </h1>
          <p className="text-sm text-gray-500 mt-1">Clinic utilization analytics from Clinic Schedule data.</p>
        </div>
        {!isInvestor && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:bg-gray-100 border border-gray-200"
          >
            <Settings size={15} /> Settings
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className={`${cardStyle} p-4 mb-5`}>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" style={{ fontFamily: 'var(--font-body)' }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" style={{ fontFamily: 'var(--font-body)' }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
              <option value="all">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="RESCHEDULED">Rescheduled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase">Branch</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
              <option value="all">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] font-semibold text-gray-500 uppercase">Department</label>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <label className="flex items-center gap-1 text-xs font-medium text-gray-700 cursor-pointer">
                <input type="checkbox" checked={allDepts} onChange={e => toggleAllDepts(e.target.checked)} className="accent-blue-600" /> All
              </label>
              {DEPARTMENTS.map(d => (
                <label key={d} className="flex items-center gap-1 text-xs font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={selectedDepts.includes(d)} onChange={e => toggleDept(d, e.target.checked)} className="accent-blue-600" />
                  {DEPT_LABELS[d]}
                </label>
              ))}
            </div>
          </div>
          {/* Wrap, don't pass fetchData directly: onClick would hand it the
              MouseEvent as its `isRetry` arg (truthy), silently disabling the
              one-shot retry on 401/403. */}
          <button onClick={() => fetchData()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: 'var(--teal)' }}>
            <Filter size={14} /> Apply
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-sm text-gray-400">Loading...</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<BarChart2 size={20} />} value={`${utilization.toFixed(1)}%`} label="Clinic Utilization" color="teal" />
        <KpiCard icon={<CalendarDays size={20} />} value={totalSessions.toLocaleString()} label="Total Sessions" color="blue" />
        <KpiCard icon={<Users size={20} />} value={avgPerTherapist.toFixed(1)} label="Avg Sessions per Therapist" color="amber" />
        <KpiCard icon={<Activity size={20} />} value={avgPerDay.toFixed(1)} label="Avg Sessions per Day" color="purple" />
      </div>

      {/* Daily Table */}
      <div className={`${cardStyle} mb-6`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className={sectionH}><CalendarDays size={16} /> Daily Breakdown — Department by Time Slot</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-semibold">Day:</span>
            <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs" style={{ fontFamily: 'var(--font-body)' }}>
              {dayOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2 text-[11px] font-bold text-gray-500 uppercase" />
                {activeDepts.map(d => <th key={d} className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 uppercase">{DEPT_LABELS[d]}</th>)}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(slot => (
                <tr key={slot} className="border-t border-gray-100">
                  <td className="px-4 py-1.5 font-semibold text-gray-700 text-xs whitespace-nowrap">{TIME_LABELS[slot]}</td>
                  {activeDepts.map(d => {
                    const v = dailyData.grid[slot]?.[d] || 0
                    return <td key={d} className="px-3 py-1.5 text-center text-xs rounded" style={{ background: heatBg(v, 5) }}>{v}</td>
                  })}
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-yellow-300 bg-yellow-50 font-extrabold">
                <td className="px-4 py-2 text-xs">Total</td>
                {activeDepts.map(d => <td key={d} className="px-3 py-2 text-center text-xs">{dailyData.totals[d] || 0}</td>)}
              </tr>
              {/* % row */}
              <tr className="bg-gray-50 text-[11px] text-gray-500">
                <td className="px-4 py-1.5">%</td>
                {activeDepts.map(d => {
                  let cap = 0
                  activeBranches.forEach(b => { cap += maxSessions[b]?.[d] || 8 })
                  const pct = cap > 0 ? ((dailyData.totals[d] || 0) / cap * 100).toFixed(1) : '0.0'
                  return <td key={d} className="px-3 py-1.5 text-center">{pct}%</td>
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Table */}
      <div className={`${cardStyle} mb-6`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className={sectionH}><CalendarDays size={16} /> Weekly Breakdown — Sessions by Day of Week</h3>
          <span className="text-xs text-gray-400">{startDate} to {endDate}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2 text-[11px] font-bold text-gray-500 uppercase" />
                {DAY_SHORT.map(d => <th key={d} className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 uppercase">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(slot => (
                <tr key={slot} className="border-t border-gray-100">
                  <td className="px-4 py-1.5 font-semibold text-gray-700 text-xs whitespace-nowrap">{TIME_LABELS[slot]}</td>
                  {weeklyData.grid[slot]?.map((v, dow) => (
                    <td key={dow} className="px-3 py-1.5 text-center text-xs rounded" style={{ background: heatBg(v, 15) }}>{v}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-yellow-300 bg-yellow-50 font-extrabold">
                <td className="px-4 py-2 text-xs">Total</td>
                {weeklyData.dayTotals.map((t, i) => <td key={i} className="px-3 py-2 text-center text-xs">{t}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className={`${cardStyle} p-5`}>
          <h3 className={`${sectionH} mb-4`}>Total Number of Sessions Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="rgba(59,130,246,0.12)" strokeWidth={2} name="Sessions" />
              <ReferenceLine stroke="#94a3b8" strokeDasharray="6 3" segment={chartData.length > 1 ? [
                { x: chartData[0]?.label, y: chartData[0]?.trend },
                { x: chartData[chartData.length - 1]?.label, y: chartData[chartData.length - 1]?.trend },
              ] : undefined} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={`${cardStyle} p-5`}>
          <h3 className={`${sectionH} mb-4`}>Clinic Utilization Rate Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Area type="monotone" dataKey="utilization" stroke="#3b82f6" fill="rgba(59,130,246,0.12)" strokeWidth={2} name="Utilization" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Therapists */}
      <div className={cardStyle}>
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className={`${sectionH} mb-3`}><Star size={16} /> Top 5 Therapists by Completed Sessions</h3>
          <div className="flex gap-0 overflow-x-auto">
            <TabBtn active={therapistTab === 'all'} onClick={() => setTherapistTab('all')}>Overall</TabBtn>
            {activeDepts.map(d => (
              <TabBtn key={d} active={therapistTab === d} onClick={() => setTherapistTab(d)}>{DEPT_LABELS[d]}</TabBtn>
            ))}
          </div>
        </div>
        <div>
          {topTherapists.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No data for current filters</div>
          ) : topTherapists.map((t, i) => (
            <div key={t.staffId} className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-b-0">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                i === 0 ? 'bg-yellow-100 text-yellow-800' :
                i === 1 ? 'bg-gray-200 text-gray-700' :
                i === 2 ? 'bg-orange-100 text-orange-800' :
                'bg-gray-100 text-gray-500'
              }`}>{i + 1}</span>
              <div className="flex-1">
                {/* Names arrive pre-masked to initials from the API for INVESTOR
                    sessions — never mask client-side only, or the full name
                    still ships in the network response. */}
                <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-[11px] text-gray-400">{DEPT_LABELS[t.dept] || t.dept}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold" style={{ color: 'var(--teal)' }}>{t.count}</div>
                <div className="text-[10px] text-gray-400">sessions</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Therapist Utilization */}
      <div className="mt-6">
        <TherapistUtilizationSection startDate={startDate} endDate={endDate} />
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSettingsOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-[700px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-base font-bold text-gray-900">Dashboard Settings</h3>
                <p className="text-xs text-gray-500 mt-0.5">Set maximum daily sessions per department per branch</p>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-5">
              {BRANCHES.map(b => (
                <div key={b} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">{BRANCH_LABELS[b]}</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {DEPARTMENTS.map(d => (
                      <div key={d} className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">{DEPT_LABELS[d]}</label>
                        <input type="number" min={0} max={50}
                          value={maxSessions[b]?.[d] ?? 8}
                          onChange={e => setMaxSessions(prev => ({
                            ...prev, [b]: { ...prev[b], [d]: parseInt(e.target.value) || 0 },
                          }))}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-center"
                          style={{ fontFamily: 'var(--font-body)' }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button onClick={() => setSettingsOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={saveSettings} className="px-4 py-2 text-sm font-semibold text-white rounded-lg" style={{ background: 'var(--teal)' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: 'teal' | 'blue' | 'amber' | 'purple' }) {
  const colors = {
    teal: { border: 'border-t-teal-500', iconBg: 'bg-teal-50', iconColor: 'text-teal-600' },
    blue: { border: 'border-t-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    amber: { border: 'border-t-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
    purple: { border: 'border-t-purple-500', iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
  }[color]
  return (
    <div className={`bg-white border border-gray-200 ${colors.border} border-t-[3px] rounded-xl p-5 text-center hover:shadow-md transition-shadow`}>
      <div className={`w-10 h-10 rounded-lg ${colors.iconBg} ${colors.iconColor} flex items-center justify-center mx-auto mb-2`}>{icon}</div>
      <div className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
        active ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent hover:text-gray-600'
      }`}
    >{children}</button>
  )
}


// ── Therapist Utilization Section ───────────────────────────────────────────

interface TherapistUtil {
  staffId: string
  staffName: string
  department: string
  branch: string
  totalSlots: number
  confirmed: number
  rescheduled: number
  cancelled: number
  pending: number
  blank: number
}

interface UtilSummary {
  totalSlots: number
  confirmed: number
  rescheduled: number
  cancelled: number
  pending: number
  blank: number
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.00'
  return ((n / total) * 100).toFixed(2)
}

function UtilBar({ confirmed, rescheduled, cancelled, pending, blank, total }: {
  confirmed: number; rescheduled: number; cancelled: number; pending: number; blank: number; total: number
}) {
  if (total === 0) return <div className="h-5 bg-gray-100 rounded-full" />
  const segments = [
    { value: confirmed,   color: '#10b981', label: 'Confirmed' },
    { value: rescheduled, color: '#f59e0b', label: 'Rescheduled' },
    { value: cancelled,   color: '#ef4444', label: 'Cancelled' },
    { value: pending,     color: '#6366f1', label: 'Pending' },
    { value: blank,       color: '#e5e7eb', label: 'Blank' },
  ]
  return (
    <div className="flex h-5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
      {segments.map(seg => {
        const w = (seg.value / total) * 100
        if (w === 0) return null
        return (
          <div
            key={seg.label}
            title={`${seg.label}: ${seg.value} (${pct(seg.value, total)}%)`}
            style={{ width: `${w}%`, background: seg.color, transition: 'width 0.3s' }}
          />
        )
      })}
    </div>
  )
}

function TherapistUtilizationSection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [branch, setBranch]       = useState('all')
  const [department, setDepartment] = useState('all')
  const [staffFilter, setStaffFilter] = useState('')
  const [data, setData]           = useState<TherapistUtil[]>([])
  const [summary, setSummary]     = useState<UtilSummary | null>(null)
  const [loading, setLoading]     = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewMode, setViewMode]   = useState<'therapist' | 'department' | 'branch'>('therapist')

  // Retries once on 401/403/network failure — see fetchData above for why.
  const fetchUtil = useCallback(async (isRetry = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ startDate, endDate, branch, department })
      const res = await fetch(`/api/scheduling-dashboard/therapist-utilization?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.therapists ?? [])
        setSummary(json.summary ?? null)
      } else if (!isRetry && (res.status === 401 || res.status === 403)) {
        await new Promise(r => setTimeout(r, 700))
        await fetchUtil(true)
        return
      }
    } catch (err) {
      console.error('Fetch error:', err)
      if (!isRetry) {
        await new Promise(r => setTimeout(r, 700))
        await fetchUtil(true)
        return
      }
    } finally { setLoading(false) }
  }, [startDate, endDate, branch, department])

  useEffect(() => { fetchUtil() }, [fetchUtil])

  const byDept = useMemo(() => {
    const map = new Map<string, { therapists: TherapistUtil[]; totals: UtilSummary }>()
    for (const t of data) {
      if (!map.has(t.department)) map.set(t.department, { therapists: [], totals: { totalSlots: 0, confirmed: 0, rescheduled: 0, cancelled: 0, pending: 0, blank: 0 } })
      const g = map.get(t.department)!
      g.therapists.push(t)
      g.totals.totalSlots  += t.totalSlots
      g.totals.confirmed   += t.confirmed
      g.totals.rescheduled += t.rescheduled
      g.totals.cancelled   += t.cancelled
      g.totals.pending     += t.pending
      g.totals.blank       += t.blank
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const byBranch = useMemo(() => {
    const map = new Map<string, UtilSummary>()
    for (const t of data) {
      if (!map.has(t.branch)) map.set(t.branch, { totalSlots: 0, confirmed: 0, rescheduled: 0, cancelled: 0, pending: 0, blank: 0 })
      const g = map.get(t.branch)!
      g.totalSlots  += t.totalSlots
      g.confirmed   += t.confirmed
      g.rescheduled += t.rescheduled
      g.cancelled   += t.cancelled
      g.pending     += t.pending
      g.blank       += t.blank
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const filtered = staffFilter.trim()
    ? data.filter(t => t.staffName.toLowerCase().includes(staffFilter.toLowerCase()))
    : data

  const statBox = (label: string, value: number, total: number, color: string) => (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg" style={{ background: `${color}11`, border: `1px solid ${color}33` }}>
      <span className="text-lg font-extrabold" style={{ color }}>{pct(value, total)}%</span>
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-[10px] text-gray-400">{value}/{total}</span>
    </div>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
          <Activity size={16} /> Therapist Utilization
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Branch</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs">
              <option value="all">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs">
              <option value="all">All Departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Therapist</label>
            <input
              placeholder="Filter by name…"
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs min-w-[160px]"
            />
          </div>
          <div className="flex gap-0 ml-auto">
            {(['therapist', 'department', 'branch'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-[11px] font-semibold border transition-all first:rounded-l-md last:rounded-r-md ${
                  viewMode === mode
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {mode === 'therapist' ? 'Per Therapist' : mode === 'department' ? 'Per Department' : 'Per Branch'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading utilization data…</div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          No therapist configurations found. Set up therapists in the Decking Module first.
        </div>
      ) : (
        <div>
          {summary && summary.totalSlots > 0 && (
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  {viewMode === 'therapist' ? 'Overall' : 'Aggregate'} — {summary.totalSlots} total slots
                </span>
                <span className="text-xs text-gray-400">({startDate} to {endDate})</span>
              </div>
              <UtilBar {...summary} total={summary.totalSlots} />
              <div className="flex flex-wrap gap-3 mt-3">
                {statBox('Confirmed', summary.confirmed, summary.totalSlots, '#10b981')}
                {statBox('Rescheduled', summary.rescheduled, summary.totalSlots, '#f59e0b')}
                {statBox('Cancelled', summary.cancelled, summary.totalSlots, '#ef4444')}
                {statBox('Pending', summary.pending, summary.totalSlots, '#6366f1')}
                {statBox('Blank', summary.blank, summary.totalSlots, '#9ca3af')}
              </div>
            </div>
          )}

          {viewMode === 'therapist' && (
            <div>
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No therapists match the filter.</div>
              ) : filtered.map(t => {
                const isExpanded = expandedId === t.staffId
                const utilizationPct = t.totalSlots > 0 ? (t.confirmed / t.totalSlots) * 100 : 0
                return (
                  <div key={t.staffId} className="border-b border-gray-100 last:border-b-0">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : t.staffId)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{t.staffName}</div>
                        <div className="text-[11px] text-gray-400">{DEPT_LABELS[t.department] || t.department} · {BRANCH_LABELS[t.branch] || t.branch} · {t.totalSlots} slots</div>
                      </div>
                      <div className="flex-1 max-w-[200px] hidden sm:block">
                        <UtilBar {...t} total={t.totalSlots} />
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-base font-extrabold" style={{ color: utilizationPct >= 80 ? '#10b981' : utilizationPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {pct(t.confirmed, t.totalSlots)}%
                        </div>
                        <div className="text-[10px] text-gray-400">confirmed</div>
                      </div>
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-1">
                        <div className="flex flex-wrap gap-3">
                          {statBox('Confirmed', t.confirmed, t.totalSlots, '#10b981')}
                          {statBox('Rescheduled', t.rescheduled, t.totalSlots, '#f59e0b')}
                          {statBox('Cancelled', t.cancelled, t.totalSlots, '#ef4444')}
                          {statBox('Pending', t.pending, t.totalSlots, '#6366f1')}
                          {statBox('Blank', t.blank, t.totalSlots, '#9ca3af')}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === 'department' && (
            <div>
              {byDept.map(([dept, group]) => (
                <div key={dept} className="border-b border-gray-100 last:border-b-0">
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-bold text-gray-900">{DEPT_LABELS[dept] || dept}</span>
                      <span className="text-[11px] text-gray-400">{group.therapists.length} therapist{group.therapists.length !== 1 ? 's' : ''} · {group.totals.totalSlots} slots</span>
                      <span className="ml-auto text-base font-extrabold" style={{ color: '#10b981' }}>
                        {pct(group.totals.confirmed, group.totals.totalSlots)}%
                      </span>
                    </div>
                    <UtilBar {...group.totals} total={group.totals.totalSlots} />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {statBox('Confirmed', group.totals.confirmed, group.totals.totalSlots, '#10b981')}
                      {statBox('Rescheduled', group.totals.rescheduled, group.totals.totalSlots, '#f59e0b')}
                      {statBox('Cancelled', group.totals.cancelled, group.totals.totalSlots, '#ef4444')}
                      {statBox('Pending', group.totals.pending, group.totals.totalSlots, '#6366f1')}
                      {statBox('Blank', group.totals.blank, group.totals.totalSlots, '#9ca3af')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'branch' && (
            <div>
              {byBranch.map(([br, totals]) => (
                <div key={br} className="border-b border-gray-100 last:border-b-0">
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-bold text-gray-900">{BRANCH_LABELS[br] || br}</span>
                      <span className="text-[11px] text-gray-400">{totals.totalSlots} slots</span>
                      <span className="ml-auto text-base font-extrabold" style={{ color: '#10b981' }}>
                        {pct(totals.confirmed, totals.totalSlots)}%
                      </span>
                    </div>
                    <UtilBar {...totals} total={totals.totalSlots} />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {statBox('Confirmed', totals.confirmed, totals.totalSlots, '#10b981')}
                      {statBox('Rescheduled', totals.rescheduled, totals.totalSlots, '#f59e0b')}
                      {statBox('Cancelled', totals.cancelled, totals.totalSlots, '#ef4444')}
                      {statBox('Pending', totals.pending, totals.totalSlots, '#6366f1')}
                      {statBox('Blank', totals.blank, totals.totalSlots, '#9ca3af')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-4">
            {[
              { label: 'Confirmed', color: '#10b981' },
              { label: 'Rescheduled', color: '#f59e0b' },
              { label: 'Cancelled', color: '#ef4444' },
              { label: 'Pending', color: '#6366f1' },
              { label: 'Blank', color: '#e5e7eb' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                <span className="text-[10px] text-gray-500 font-medium">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
