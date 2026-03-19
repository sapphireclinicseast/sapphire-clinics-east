'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart2, CalendarDays, Users, Settings, Star,
  Filter, Lock,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS'] as const
const DEPT_LABELS: Record<string, string> = {
  OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED', MD: 'MD',
  PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthosis Prosthesis',
}

const BRANCHES = ['SBEA', 'SBGH'] as const
const BRANCH_LABELS: Record<string, string> = { SBEA: 'Sandbox East', SBGH: 'Sandbox Greenhills' }

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

function todayStr() { return new Date().toISOString().split('T')[0] }
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
          The Scheduling Dashboard is only available to Admin, SBEA Admin, SBGH Admin, Verdana Admin, and Marketing Admin users.
        </p>
      </div>
    )
  }

  return <DashboardContent />
}

function DashboardContent() {
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
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sched_dash_max_sessions_hub')
        if (saved) return JSON.parse(saved)
      } catch { /* ignore */ }
    }
    const def: MaxSessions = {}
    BRANCHES.forEach(b => { def[b] = {}; DEPARTMENTS.forEach(d => { def[b][d] = 8 }) })
    return def
  })

  // ── Top therapists tab ──
  const [therapistTab, setTherapistTab] = useState('all')

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate, endDate,
        status,
        branch,
        departments: allDepts ? 'all' : selectedDepts.join(','),
      })
      const res = await fetch(`/api/scheduling-dashboard?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSchedules(data.schedules)
      setUniqueStaff(data.uniqueStaffCount)
    } catch (err) {
      console.error('Fetch error:', err)
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
    const counts: Record<string, { name: string; dept: string; count: number }> = {}
    filtered.forEach(s => {
      if (!counts[s.staffName]) counts[s.staffName] = { name: s.staffName, dept: s.department, count: 0 }
      counts[s.staffName].count++
    })
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [schedules, therapistTab])

  // ── Settings save ──
  function saveSettings() {
    localStorage.setItem('sched_dash_max_sessions_hub', JSON.stringify(maxSessions))
    setSettingsOpen(false)
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
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:bg-gray-100 border border-gray-200"
        >
          <Settings size={15} /> Settings
        </button>
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
          <button onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: 'var(--teal)' }}>
            <Filter size={14} /> Apply
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-sm text-gray-400">Loading...</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KpiCard icon={<BarChart2 size={20} />} value={`${utilization.toFixed(1)}%`} label="Clinic Utilization" color="teal" />
        <KpiCard icon={<CalendarDays size={20} />} value={totalSessions.toLocaleString()} label="Total Sessions" color="blue" />
        <KpiCard icon={<Users size={20} />} value={avgPerTherapist.toFixed(1)} label="Avg Sessions per Therapist" color="amber" />
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
            <div key={t.name} className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-b-0">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                i === 0 ? 'bg-yellow-100 text-yellow-800' :
                i === 1 ? 'bg-gray-200 text-gray-700' :
                i === 2 ? 'bg-orange-100 text-orange-800' :
                'bg-gray-100 text-gray-500'
              }`}>{i + 1}</span>
              <div className="flex-1">
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

function KpiCard({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: 'teal' | 'blue' | 'amber' }) {
  const colors = {
    teal: { border: 'border-t-teal-500', iconBg: 'bg-teal-50', iconColor: 'text-teal-600' },
    blue: { border: 'border-t-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    amber: { border: 'border-t-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
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
