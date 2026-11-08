'use client'

import { branchForRole } from '@/lib/role-branch'
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { localTodayStr } from '@/lib/utils'
import { DAYS } from '@/lib/decking-days'
import {
  BarChart2, CalendarDays, Users, Settings, Star, Filter, Lock, Activity,
  ChevronDown, ChevronUp, Columns2, TrendingUp, LineChart as LineChartIcon,
  Grid3x3, AlertTriangle, RefreshCw, Loader2, X, Search,
} from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

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

const STATUS_LABELS: Record<string, string> = {
  all: 'All statuses', CONFIRMED: 'Confirmed', PENDING: 'Pending',
  CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', NO_SHOW: 'No-Show',
}

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

// Day names are indexed by Date.getDay() (0 = Sunday) everywhere on this page.
// decking-days.ts DAYS is Sunday-first in the same order, so DAYS[getDay()] is a
// straight display swap for the old local 'Sn/M/T/…' arrays.

// ── Presentation tokens (display only) ───────────────────────────────────────

const CHART_COLOR = '#1A7B8A'
const AXIS_TICK = { fontSize: 10, fill: '#7a9e94' }
const GRID_STROKE = '#EEF2F1'
const TOOLTIP_STYLE: CSSProperties = {
  fontSize: 12, borderRadius: 8, border: '1px solid var(--light-gray)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
}
const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_SM = 'h-8 px-2.5 rounded-lg text-xs outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1'
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50'
const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap'
const SUBTLE_BG = '#F6F9F8'

const POS = '#15803D'
const NEG = '#B91C1C'

// ── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = localTodayStr
function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

/** "YYYY-MM" for the current month. */
function thisMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "YYYY-MM" for N months back. setMonth handles the year rollover. */
function monthsAgoMonthStr(n: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getSlotForTime(startTime: string): string {
  const h = parseInt(startTime.split(':')[0], 10)
  if (h >= 9 && h < 20) return `${h.toString().padStart(2, '0')}:00`
  return ''
}

// Heatmap shading. The intensity curve is unchanged (count / max(max, 5),
// capped at 0.7); only the hue moved from emerald to the page's teal, with the
// figure flipped to white once the cell is dark enough to need it.
function heatAlpha(count: number, max: number): number {
  if (count === 0) return 0
  return Math.min(count / Math.max(max, 5), 0.7)
}
function heatBg(count: number, max: number): string {
  const a = heatAlpha(count, max)
  return a === 0 ? '' : `rgba(26, 123, 138, ${a})`
}
function heatInk(count: number, max: number): string {
  return heatAlpha(count, max) >= 0.42 ? '#fff' : 'var(--charcoal)'
}

/** "Oct 9" / "Oct 9, 2026" from a YYYY-MM-DD string, read as a local date. */
function fmtDay(iso: string, withYear = false) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
}
function fmtRange(start: string, end: string) {
  return `${fmtDay(start)} – ${fmtDay(end, true)}`
}

/** Two-letter avatar text from a display name (names may already be initials). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).map(p => p.replace(/[^A-Za-z]/g, '')).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const signedColor = (v: number | null) => v === null ? 'var(--mid-gray)' : v > 0 ? POS : v < 0 ? NEG : 'var(--mid-gray)'

// ── Types ────────────────────────────────────────────────────────────────────

interface SlotUtilPoint {
  month: string
  label: string
  slots: number
  delta: number | null
  pctChange: number | null
}

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
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="rounded-xl px-8 py-10 text-center max-w-md" style={CARD_STYLE}>
          <Lock size={36} className="mx-auto mb-3" style={{ color: 'var(--mid-gray)' }} />
          <h2 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Access Restricted</h2>
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
            The Scheduling Dashboard is only available to Admin, AHEA Admin, AHGH Admin, Verdana Admin, and Marketing Admin users.
          </p>
        </div>
      </div>
    )
  }

  return <DashboardContent role={role} />
}

function DashboardContent({ role }: { role: string }) {
  const isInvestor = role === 'INVESTOR'
  // null for unrestricted roles. Drives the branch control below; the API
  // enforces the same rule server-side, which is what actually matters.
  const scopedBranch = branchForRole(role)
  // ── Filter state ──
  const [startDate, setStartDate] = useState(monthAgoStr())
  const [endDate, setEndDate] = useState(todayStr())
  const [status, setStatus] = useState('CONFIRMED')
  // Seeded from the role so a branch-scoped account's first request is already
  // its own branch, rather than asking for 'all' and being silently overridden.
  const [branch, setBranch] = useState(() => branchForRole(role) ?? 'all')
  const [selectedDepts, setSelectedDepts] = useState<string[]>([...DEPARTMENTS])
  const [allDepts, setAllDepts] = useState(true)
  const [selectedDay, setSelectedDay] = useState(todayStr())

  // ── Slot Utilization subsection ──
  // Its own month range: the filter bar above is day-grained and usually set to
  // a few weeks, which cannot answer a month-on-month question. Branch and
  // department are deliberately NOT duplicated here — this reads the same two
  // filters as the rest of the page, so the whole screen describes one cut of
  // the clinic rather than two that disagree.
  const [slotFrom, setSlotFrom] = useState(monthsAgoMonthStr(11))
  const [slotTo, setSlotTo] = useState(thisMonthStr())
  const [slotIncludeCancelled, setSlotIncludeCancelled] = useState(false)
  // Its own branch and department, rather than reading the filter bar at the
  // top of the page. That bar is a long scroll away by the time this chart is
  // on screen, so "filtered by the selection above" was a filter nobody could
  // see or reach — it read as having no filter at all.
  const [slotBranch, setSlotBranch] = useState(() => branchForRole(role) ?? 'all')
  const [slotDept, setSlotDept] = useState('all')
  const [slotData, setSlotData] = useState<SlotUtilPoint[]>([])
  const [slotSummary, setSlotSummary] = useState<{ total: number; netChange: number | null; netPctChange: number | null } | null>(null)
  const [slotLoading, setSlotLoading] = useState(false)
  const [slotError, setSlotError] = useState('')
  // Bumped by "Try again" to re-run the same request; not sent to the API.
  const [slotReload, setSlotReload] = useState(0)

  // ── Data state ──
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [uniqueStaff, setUniqueStaff] = useState(0)
  const [loading, setLoading] = useState(false)
  // Display-only: whether any load has succeeded yet (drives skeletons), and
  // whether the last one failed after its retry (drives the error card).
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

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
      setHasLoaded(true)
      setLoadError(false)
    } catch (err) {
      console.error('Fetch error:', err)
      if (!isRetry) {
        await new Promise(r => setTimeout(r, 700))
        await fetchData(true)
        return
      }
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, status, branch, selectedDepts, allDepts])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Slot Utilization fetch ──
  // Shares the page's branch/department filters, so changing either redraws
  // this line too; the month range is its own.
  useEffect(() => {
    if (slotFrom > slotTo) { setSlotError('“From” month is after “To” month.'); setSlotData([]); return }
    const ctl = new AbortController()
    setSlotLoading(true); setSlotError('')
    const params = new URLSearchParams({
      from: slotFrom, to: slotTo, branch: slotBranch,
      departments: slotDept,
    })
    if (slotIncludeCancelled) params.set('includeCancelled', '1')
    fetch(`/api/scheduling-dashboard/slot-utilization?${params}`, { signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load slot utilization')
        setSlotData(d.points ?? [])
        setSlotSummary({ total: d.total ?? 0, netChange: d.netChange ?? null, netPctChange: d.netPctChange ?? null })
      })
      .catch(err => { if (err.name !== 'AbortError') { setSlotError(err.message); setSlotData([]) } })
      .finally(() => setSlotLoading(false))
    return () => ctl.abort()
  }, [slotFrom, slotTo, slotBranch, slotDept, slotIncludeCancelled, slotReload])

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

  // ── Branch Comparison ──────────────────────────────────────────────────────
  // The same cut the filter bar describes, split by branch and shown side by
  // side, so the two boards can be read against each other without switching
  // the branch filter back and forth and holding the first set of numbers in
  // your head.
  //
  // Hidden for a branch-scoped account. The API overrides the requested branch
  // from the role, so the other column could only ever come back empty — and an
  // empty column reads as "Greenhills ran nothing", not "you cannot see
  // Greenhills". Same reasoning as the Slot Utilization branch selector.
  const canCompare = !scopedBranch

  // Comparison needs BOTH branches. When the page filter is already 'all' the
  // rows on screen are exactly that, so they are reused rather than fetched a
  // second time; only a narrowed filter needs its own request.
  const [compareRows, setCompareRows] = useState<ScheduleRow[]>([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')

  const deptParam = allDepts ? 'all' : selectedDepts.join(',')
  useEffect(() => {
    if (!canCompare || branch === 'all') { setCompareRows([]); setCompareError(''); return }
    const ctl = new AbortController()
    setCompareLoading(true); setCompareError('')
    const params = new URLSearchParams({ startDate, endDate, status, branch: 'all', departments: deptParam })
    fetch(`/api/scheduling-dashboard?${params}`, { signal: ctl.signal })
      .then(async r => {
        if (!r.ok) throw new Error('Could not load the other branch')
        const d = await r.json()
        setCompareRows(d.schedules ?? [])
      })
      .catch(err => { if (err.name !== 'AbortError') { setCompareError(err.message); setCompareRows([]) } })
      .finally(() => setCompareLoading(false))
    return () => ctl.abort()
  }, [canCompare, branch, startDate, endDate, status, deptParam])

  const rowsForCompare = branch === 'all' ? schedules : compareRows

  const branchMetrics = useMemo(() => {
    return BRANCHES.map(b => {
      const rows = rowsForCompare.filter(r => r.branch === b && activeDepts.includes(r.department))
      const sessions = rows.length
      // Counted from the rows rather than the API's uniqueStaffCount, which is
      // one figure for the whole filtered set and cannot be split. A row's
      // branch is the CONSULTANT's branch (api/scheduling-dashboard sets it
      // from s.staff.branch), not where the session was held, so every
      // consultant lands in exactly one column and the two columns add back up
      // to the headline figures above.
      const staff = new Set(rows.map(r => r.staffId)).size
      const capacity = activeDepts.reduce((sum, d) => sum + (maxSessions[b]?.[d] || 8) * workingDays, 0)
      const byDept: Record<string, { sessions: number; utilization: number }> = {}
      for (const d of activeDepts) {
        const n = rows.filter(r => r.department === d).length
        const cap = (maxSessions[b]?.[d] || 8) * workingDays
        byDept[d] = { sessions: n, utilization: cap > 0 ? (n / cap) * 100 : 0 }
      }
      return {
        branch: b,
        sessions,
        staff,
        utilization: capacity > 0 ? (sessions / capacity) * 100 : 0,
        perTherapist: staff > 0 ? sessions / staff : 0,
        perDay: workingDays > 0 ? sessions / workingDays : 0,
        byDept,
      }
    })
  }, [rowsForCompare, activeDepts, maxSessions, workingDays])

  // ── Day options for daily table ──
  const dayOptions = useMemo(() => {
    const options: { value: string; label: string }[] = []
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split('T')[0]
      const label = `${DAYS[d.getDay()].label}, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
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
        label: `${DAYS[dt.getDay()].short} ${dt.getDate()}`,
        total: dateMap[d],
        trend: Math.max(0, slope * i + intercept),
        utilization: dailyCap > 0 ? (dateMap[d] / dailyCap) * 100 : 0,
      }
    })
  }, [schedules, startDate, endDate, activeBranches, activeDepts, maxSessions])

  // ── Trendline equations ──
  // Least-squares fit y = mx + b over the same x index the chart plots (x = 0 is
  // the first day in range), so the printed equation describes the dashed line
  // on the chart rather than a separate calculation. Utilization is fitted on
  // its own series instead of being scaled off the session fit: daily capacity
  // shifts with the branch/department filters, so the two slopes are not a
  // fixed multiple of each other.
  const trendStats = useMemo(() => {
    const n = chartData.length
    if (n < 2) return null

    const fit = (ys: number[]) => {
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
      ys.forEach((y, i) => { sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i })
      const denom = n * sumX2 - sumX * sumX
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
      const intercept = (sumY - slope * sumX) / n
      // R² — how much of the movement the straight line actually explains. A
      // steep slope over scattered data is not a trend worth acting on.
      const meanY = sumY / n
      let ssTot = 0, ssRes = 0
      ys.forEach((y, i) => {
        ssTot += (y - meanY) ** 2
        ssRes += (y - (slope * i + intercept)) ** 2
      })
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
      return { slope, intercept, r2, change: slope * (n - 1) }
    }

    return {
      n,
      sessions: fit(chartData.map(d => d.total)),
      utilization: fit(chartData.map(d => d.utilization)),
    }
  }, [chartData])

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

  // ── Display-only derived bits ──
  const initialLoad = loading && !hasLoaded
  const showMain = !loadError
  const rangeLabel = fmtRange(startDate, endDate)
  const noDepts = activeDepts.length === 0
  const dayTotal = activeDepts.reduce((s, d) => s + (dailyData.totals[d] || 0), 0)

  const deptPill = (active: boolean) =>
    `h-7 px-2.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${active ? '' : 'hover:bg-gray-50'}`
  const deptPillStyle = (active: boolean): CSSProperties => active
    ? { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }
    : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Clinic Utilization
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Clinic utilization analytics from Clinic Schedule data.
          </p>
        </div>
        {!isInvestor && (
          <button onClick={() => setSettingsOpen(true)} className={BTN_SECONDARY} style={{ ...CONTROL_STYLE }}>
            <Settings size={15} style={{ color: 'var(--teal)' }} /> Settings
          </button>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="rounded-xl px-4 py-3 space-y-3" style={CARD_STYLE}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="sd-start">Date range</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <input id="sd-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                aria-label="Start date" className={`${CONTROL} w-[9.5rem]`} style={CONTROL_STYLE} />
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                aria-label="End date" className={`${CONTROL} w-[9.5rem]`} style={CONTROL_STYLE} />
            </div>
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="sd-status">Status</label>
            <select id="sd-status" value={status} onChange={e => setStatus(e.target.value)}
              className={CONTROL} style={CONTROL_STYLE}>
              <option value="all">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="RESCHEDULED">Rescheduled</option>
              {/* NO_SHOW is in the ScheduleStatus enum but was missing here, so
                  there was no way to filter for the sessions patients never
                  turned up to — the ones the fee policy cares about most. */}
              <option value="NO_SHOW">No-Show</option>
            </select>
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="sd-branch">Branch</label>
            {scopedBranch ? (
              /* Branch-scoped account: one branch, not a choice. Rendered as a
                 plain field rather than a disabled select so it reads as "this
                 is your branch" instead of "this control is broken". The server
                 overrides the branch regardless — this only keeps the UI honest
                 about what it can do. */
              <div className={`${CONTROL} flex items-center`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}
                title="Your account is scoped to this branch">
                {BRANCH_LABELS[scopedBranch] ?? scopedBranch}
              </div>
            ) : (
              <select id="sd-branch" value={branch} onChange={e => setBranch(e.target.value)}
                className={CONTROL} style={CONTROL_STYLE}>
                <option value="all">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
              {loading && <><Loader2 size={12} className="animate-spin" /> Updating…</>}
            </span>
            {/* Wrap, don't pass fetchData directly: onClick would hand it the
                MouseEvent as its `isRetry` arg (truthy), silently disabling the
                one-shot retry on 401/403. */}
            <button onClick={() => fetchData()} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
              <Filter size={14} /> Apply
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-3" style={{ borderTop: '1px solid var(--light-gray)' }}
          role="group" aria-label="Department filter">
          <span className="text-[11px] font-semibold uppercase tracking-wider mr-1.5" style={{ color: 'var(--mid-gray)' }}>Department</span>
          <button type="button" aria-pressed={allDepts} onClick={() => toggleAllDepts(!allDepts)}
            className={deptPill(allDepts)} style={deptPillStyle(allDepts)}>
            All
          </button>
          {DEPARTMENTS.map(d => {
            const on = selectedDepts.includes(d)
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => toggleDept(d, !on)}
                className={deptPill(on)} style={deptPillStyle(on)}>
                {DEPT_LABELS[d]}
              </button>
            )
          })}
        </div>
      </div>

      {loadError && (
        <ErrorCard
          title="Couldn't load the clinic schedule"
          hint="The request failed twice. Check your connection, then try again."
          onRetry={() => fetchData()}
        />
      )}

      {showMain && (
        <>
          {/* ── KPI Cards ── each jumps to the section that breaks it down. */}
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3">
            {initialLoad ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-24 mt-2" />
                  <Skeleton className="h-3 w-28 mt-2" />
                </div>
              ))
            ) : (
              <>
                <KpiLink target="util-trend" title="Jump to the utilization trend">
                  <KpiCard label="Clinic Utilization" icon={<BarChart2 size={16} />}
                    value={`${utilization.toFixed(1)}%`} sub="of daily caps set in Settings" />
                </KpiLink>
                <KpiLink target="daily-breakdown" title="Jump to the daily breakdown">
                  <KpiCard label="Total Sessions" icon={<CalendarDays size={16} />} accent="var(--bright-teal)"
                    value={totalSessions.toLocaleString()} sub={`${STATUS_LABELS[status] ?? status} · ${rangeLabel}`} />
                </KpiLink>
                <KpiLink target="top-therapists" title="Jump to the top therapists">
                  <KpiCard label="Avg per Therapist" icon={<Users size={16} />} accent="var(--gold)"
                    value={avgPerTherapist.toFixed(1)} sub="sessions per therapist" />
                </KpiLink>
                <KpiLink target="sessions-trend" title="Jump to sessions over time">
                  <KpiCard label="Avg per Day" icon={<Activity size={16} />} accent="#8B5CF6"
                    value={avgPerDay.toFixed(1)} sub="per operating day (Sat excluded)" />
                </KpiLink>
              </>
            )}
          </div>

          {/* ── Branch Comparison ──────────────────────────────────────────────
              The cards above, once per branch, side by side. Reads the same date
              range, status and departments as the filter bar — only the branch
              filter is bypassed, because comparing needs both. */}
          {canCompare && (
            <DashCard
              title="Branch Comparison"
              icon={<Columns2 size={15} />}
              description={<>Same range, status and departments as the filters above &mdash; both branches at once, whatever the Branch filter is set to. A session counts to the consultant&apos;s own branch, not to where it was held.</>}
            >
              {compareError ? (
                <ErrorCard compact title={compareError} onRetry={() => fetchData()} />
              ) : (initialLoad || (compareLoading && rowsForCompare.length === 0)) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[0, 1].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
                </div>
              ) : (
                <>
                  {(() => {
                    const [a, b] = branchMetrics
                    if (!a || !b || a.sessions + b.sessions === 0) return null
                    const gap = a.utilization - b.utilization
                    if (Math.abs(gap) < 0.05) {
                      return <Callout>Both branches level on utilization</Callout>
                    }
                    const lead = gap > 0 ? a : b
                    return (
                      <Callout>
                        <TrendingUp size={13} /> {BRANCH_LABELS[lead.branch]} leads by {Math.abs(gap).toFixed(1)} pp utilization
                      </Callout>
                    )
                  })()}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {branchMetrics.map(m => {
                      const other = branchMetrics.find(x => x.branch !== m.branch)
                      return (
                        <div key={m.branch} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
                          <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{BRANCH_LABELS[m.branch]}</span>
                            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                              {m.staff} {m.staff === 1 ? 'therapist' : 'therapists'} with sessions in range
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--light-gray)' }}>
                            {[
                              { label: 'Clinic Utilization', value: `${m.utilization.toFixed(1)}%`, delta: other ? m.utilization - other.utilization : null, unit: 'pp' },
                              { label: 'Total Sessions', value: m.sessions.toLocaleString(), delta: other ? m.sessions - other.sessions : null, unit: '' },
                              { label: 'Avg per Therapist', value: m.perTherapist.toFixed(1), delta: other ? m.perTherapist - other.perTherapist : null, unit: '' },
                              { label: 'Avg per Day', value: m.perDay.toFixed(1), delta: other ? m.perDay - other.perDay : null, unit: '' },
                            ].map(k => (
                              <div key={k.label} className="bg-white px-4 py-3 min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--mid-gray)' }}>{k.label}</div>
                                <div className="text-lg font-bold mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                                {/* Signed against the other branch, so each card says
                                    where it stands rather than leaving the reader to
                                    subtract two columns by eye. */}
                                {k.delta !== null && Math.abs(k.delta) >= 0.05 && (
                                  <div className="text-[11px] font-semibold mt-0.5" style={{ color: k.delta > 0 ? POS : NEG }}>
                                    {k.delta > 0 ? '▲' : '▼'} {Math.abs(k.delta).toFixed(k.unit === 'pp' ? 1 : 1)}{k.unit} vs {BRANCH_LABELS[other!.branch].replace(' Branch', '')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Per department — where a headline gap actually comes from. */}
                  {activeDepts.length > 0 && (
                    <div className="overflow-x-auto mt-5 rounded-lg" style={{ border: '1px solid var(--light-gray)' }}>
                      <table className="w-full text-sm" style={{ minWidth: 520 }}>
                        <thead>
                          <tr style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                            <th className={`${TH} text-left sticky left-0`} style={{ background: SUBTLE_BG }}>Department</th>
                            {branchMetrics.map(m => (
                              <th key={m.branch} colSpan={2} className={`${TH} text-center`} style={{ borderLeft: '1px solid var(--light-gray)' }}>
                                {BRANCH_LABELS[m.branch]}
                              </th>
                            ))}
                          </tr>
                          <tr style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                            <th className="sticky left-0" style={{ background: SUBTLE_BG }} />
                            {branchMetrics.map(m => (
                              <Fragment key={m.branch}>
                                <th className="px-3 pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ borderLeft: '1px solid var(--light-gray)' }}>Sessions</th>
                                <th className="px-3 pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider">Util.</th>
                              </Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeDepts.map(d => (
                            <tr key={d} className="hover:bg-gray-50/60" style={{ borderTop: '1px solid #EEF2F1' }}>
                              <td className="px-3 py-2 font-semibold sticky left-0 bg-white whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{DEPT_LABELS[d]}</td>
                              {branchMetrics.map(m => (
                                <Fragment key={m.branch}>
                                  <td className="px-3 py-2 text-center tabular-nums" style={{ borderLeft: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>{m.byDept[d]?.sessions ?? 0}</td>
                                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: 'var(--charcoal)' }}>{(m.byDept[d]?.utilization ?? 0).toFixed(1)}%</td>
                                </Fragment>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </DashCard>
          )}

          {/* ── Heatmaps ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Daily Table */}
            <div id="daily-breakdown" className="scroll-mt-4 min-w-0">
            <DashCard
              className="h-full"
              title="Daily Breakdown — Department by Time Slot"
              icon={<Grid3x3 size={15} />}
              description={`Sessions per hour for one day${dayTotal > 0 ? ` · ${dayTotal} in total` : ''}. The % row is against the daily cap per department.`}
              action={
                <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} aria-label="Day"
                  className={`${CONTROL_SM} max-w-[15rem]`} style={CONTROL_STYLE}>
                  {dayOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              }
              flush
              footer={<HeatLegend max={5} />}
            >
              {initialLoad ? (
                <div className="p-5"><Skeleton className="h-72" /></div>
              ) : noDepts ? (
                <EmptyState title="No departments selected" hint="Pick at least one department in the toolbar above." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 120 + activeDepts.length * 64 }}>
                    <thead>
                      <tr style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                        <th className={`${TH} text-left sticky left-0`} style={{ background: SUBTLE_BG }}>Time</th>
                        {activeDepts.map(d => <th key={d} className={`${TH} text-center`}>{DEPT_LABELS[d]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(slot => (
                        <tr key={slot}>
                          <td className="px-3 py-1 font-semibold whitespace-nowrap sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>{TIME_LABELS[slot]}</td>
                          {activeDepts.map(d => {
                            const v = dailyData.grid[slot]?.[d] || 0
                            return (
                              <HeatCell key={d} v={v} max={5}
                                tip={`${DEPT_LABELS[d]} · ${TIME_LABELS[slot]} — ${v} session${v === 1 ? '' : 's'}`} />
                            )
                          })}
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr style={{ background: SUBTLE_BG, borderTop: '1px solid var(--light-gray)' }}>
                        <td className="px-3 py-2 font-bold sticky left-0" style={{ background: SUBTLE_BG, color: 'var(--charcoal)' }}>Total</td>
                        {activeDepts.map(d => (
                          <td key={d} className="px-2 py-2 text-center font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>{dailyData.totals[d] || 0}</td>
                        ))}
                      </tr>
                      {/* % row */}
                      <tr style={{ background: SUBTLE_BG }}>
                        <td className="px-3 pb-2 sticky left-0" style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>% of cap</td>
                        {activeDepts.map(d => {
                          let cap = 0
                          activeBranches.forEach(b => { cap += maxSessions[b]?.[d] || 8 })
                          const pct = cap > 0 ? ((dailyData.totals[d] || 0) / cap * 100).toFixed(1) : '0.0'
                          return <td key={d} className="px-2 pb-2 text-center tabular-nums" style={{ color: 'var(--charcoal)' }}>{pct}%</td>
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </DashCard>
            </div>

            {/* Weekly Table */}
            <DashCard
              title="Weekly Breakdown — Sessions by Day of Week"
              icon={<CalendarDays size={15} />}
              description={`Every session in ${rangeLabel}, stacked by weekday and hour.`}
              flush
              footer={<HeatLegend max={15} />}
            >
              {initialLoad ? (
                <div className="p-5"><Skeleton className="h-72" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 520 }}>
                    <thead>
                      <tr style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                        <th className={`${TH} text-left sticky left-0`} style={{ background: SUBTLE_BG }}>Time</th>
                        {DAYS.map(d => <th key={d.key} className={`${TH} text-center`} title={d.label}>{d.short}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(slot => (
                        <tr key={slot}>
                          <td className="px-3 py-1 font-semibold whitespace-nowrap sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>{TIME_LABELS[slot]}</td>
                          {weeklyData.grid[slot]?.map((v, dow) => (
                            <HeatCell key={dow} v={v} max={15}
                              tip={`${DAYS[dow].label} · ${TIME_LABELS[slot]} — ${v} session${v === 1 ? '' : 's'}`} />
                          ))}
                        </tr>
                      ))}
                      <tr style={{ background: SUBTLE_BG, borderTop: '1px solid var(--light-gray)' }}>
                        <td className="px-3 py-2 font-bold sticky left-0" style={{ background: SUBTLE_BG, color: 'var(--charcoal)' }}>Total</td>
                        {weeklyData.dayTotals.map((t, i) => (
                          <td key={i} className="px-2 py-2 text-center font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>{t}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </DashCard>
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div id="sessions-trend" className="scroll-mt-4 min-w-0">
            <DashCard
              className="h-full"
              title="Total Number of Sessions Over Time"
              icon={<LineChartIcon size={15} />}
              description="Sessions per day; the dashed line is the least-squares trend."
            >
              {initialLoad ? <Skeleton className="h-[290px]" /> : totalSessions === 0 ? (
                <EmptyState title="No sessions in this range" hint="Widen the dates or change the status filter." />
              ) : (
                <>
                  <TrendEquation fit={trendStats?.sessions ?? null} unit="sessions" />
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={8} />
                      <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="total" stroke={CHART_COLOR} fill="rgba(26,123,138,0.12)" strokeWidth={2} name="Sessions" />
                      <ReferenceLine stroke="#94a3b8" strokeDasharray="6 3" segment={chartData.length > 1 ? [
                        { x: chartData[0]?.label, y: chartData[0]?.trend },
                        { x: chartData[chartData.length - 1]?.label, y: chartData[chartData.length - 1]?.trend },
                      ] : undefined} />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}
            </DashCard>
            </div>

            <div id="util-trend" className="scroll-mt-4 min-w-0">
            <DashCard
              className="h-full"
              title="Clinic Utilization Rate Over Time"
              icon={<BarChart2 size={15} />}
              description="Each day's sessions as a share of that day's combined caps."
            >
              {initialLoad ? <Skeleton className="h-[290px]" /> : totalSessions === 0 ? (
                <EmptyState title="No sessions in this range" hint="Widen the dates or change the status filter." />
              ) : (
                <>
                  <TrendEquation fit={trendStats?.utilization ?? null} unit="pp" />
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={8} />
                      <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                      {/* `unknown`, not `number`: recharts' Formatter generic
                          expects `any` here and a narrower type fails tsc. */}
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => `${Number(v).toFixed(1)}%`} />
                      <Area type="monotone" dataKey="utilization" stroke={CHART_COLOR} fill="rgba(26,123,138,0.12)" strokeWidth={2} name="Utilization" />
                      <ReferenceLine stroke="#94a3b8" strokeDasharray="6 3" segment={trendStats ? [
                        { x: chartData[0]?.label, y: Math.max(0, trendStats.utilization.intercept) },
                        { x: chartData[chartData.length - 1]?.label, y: Math.max(0, trendStats.utilization.slope * (trendStats.n - 1) + trendStats.utilization.intercept) },
                      ] : undefined} />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}
            </DashCard>
            </div>
          </div>
        </>
      )}

      {/* ── Slot Utilization ──────────────────────────────────────────────
          Month on month, over a range of the user's choosing. Separate from the
          charts above, which are day-grained over the filter bar's short window
          and so cannot show a trend across a year. */}
      <DashCard
        title="Slot Utilization"
        icon={<TrendingUp size={15} />}
        description={`Slots run each month${slotIncludeCancelled ? ' · including cancelled' : ' · cancelled excluded, no-shows counted'}. Has its own filters.`}
      >
        <div className="flex flex-wrap gap-3 items-end mb-4">
          {/* Hidden for a branch-scoped account: the server pins their branch
              anyway, so offering a choice that cannot take effect would be a
              lie in the UI. */}
          {!branchForRole(role) && (
            <div>
              <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="slot-branch">Branch</label>
              <select id="slot-branch" value={slotBranch} onChange={e => setSlotBranch(e.target.value)}
                className={CONTROL_SM} style={CONTROL_STYLE}>
                <option value="all">All branches</option>
                {BRANCHES.map(b => (
                  <option key={b} value={b}>
                    {b === 'SBEA' ? 'East Branch' : b === 'SBGH' ? 'Greenhills Branch' : b}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="slot-dept">Department</label>
            <select id="slot-dept" value={slotDept} onChange={e => setSlotDept(e.target.value)}
              className={CONTROL_SM} style={CONTROL_STYLE}>
              <option value="all">All departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="slot-from">From</label>
            <input id="slot-from" type="month" value={slotFrom} onChange={e => setSlotFrom(e.target.value)}
              className={CONTROL_SM} style={CONTROL_STYLE} />
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="slot-to">To</label>
            <input id="slot-to" type="month" value={slotTo} onChange={e => setSlotTo(e.target.value)}
              className={CONTROL_SM} style={CONTROL_STYLE} />
          </div>
          <label className="flex items-center gap-1.5 h-8 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={slotIncludeCancelled}
              onChange={e => setSlotIncludeCancelled(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
            Include cancelled
          </label>
          {slotLoading && slotData.length > 0 && (
            <span className="flex items-center gap-1.5 h-8 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              <Loader2 size={12} className="animate-spin" /> Updating…
            </span>
          )}
        </div>

        {slotError ? (
          slotFrom > slotTo
            ? <EmptyState title={slotError} hint="Pick a “From” month on or before the “To” month." />
            : <ErrorCard compact title="Couldn't load slot utilization" hint={slotError} onRetry={() => setSlotReload(n => n + 1)} />
        ) : slotLoading && slotData.length === 0 ? (
          <div className="space-y-3">
            <div className="flex gap-3"><Skeleton className="h-14 w-36" /><Skeleton className="h-14 w-44" /></div>
            <Skeleton className="h-[280px]" />
          </div>
        ) : slotData.length === 0 ? (
          <EmptyState title="No sessions in this range." hint="Try a wider month range or another department." />
        ) : (
          <>
            {slotSummary && (
              <div className="flex flex-wrap gap-3 mb-4">
                <MiniStat label="Total slots" value={slotSummary.total.toLocaleString()} />
                <MiniStat
                  label="First → last month"
                  color={signedColor(slotSummary.netChange)}
                  value={<>
                    {slotSummary.netChange === null ? '—'
                      : `${slotSummary.netChange > 0 ? '+' : ''}${slotSummary.netChange.toLocaleString()}`}
                    {slotSummary.netPctChange !== null && (
                      <span className="text-sm font-semibold ml-1">
                        ({slotSummary.netPctChange > 0 ? '+' : ''}{slotSummary.netPctChange.toFixed(1)}%)
                      </span>
                    )}
                  </>}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-5 items-start">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={slotData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  {/* Params typed as `unknown`, not `number`/`string`: recharts'
                      Formatter generic expects `any` there, and a narrower
                      parameter type does not satisfy it. */}
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: unknown) => [Number(v).toLocaleString(), 'Slots'] as [string, string]}
                    labelFormatter={(label: unknown) => {
                      const p = slotData.find(x => x.label === label)
                      if (!p || p.delta === null) return String(label ?? '')
                      const sign = p.delta > 0 ? '+' : ''
                      const pct = p.pctChange === null ? '' : ` (${p.pctChange > 0 ? '+' : ''}${p.pctChange.toFixed(1)}%)`
                      return `${label} — ${sign}${p.delta} vs previous month${pct}`
                    }}
                  />
                  {/* Animation off: recharts draws a Line by animating
                      stroke-dasharray from a stub, and here it stalled on the
                      first frame — a 21px dash of a 1189px path, i.e. a line
                      chart with no visible line. The page's Area charts do not
                      hit this. Rendering it statically is worth more than the
                      draw-in. */}
                  <Line type="monotone" dataKey="slots" stroke={CHART_COLOR} strokeWidth={2.5}
                    dot={{ r: 3 }} activeDot={{ r: 5 }} name="Slots" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>

              {/* The line shows the shape; the table is where a month-on-month
                  figure can actually be read off and quoted. */}
              <div className="overflow-auto max-h-[300px] rounded-lg" style={{ border: '1px solid var(--light-gray)' }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10" style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                    <tr className="text-left">
                      <th className={TH}>Month</th>
                      <th className={`${TH} text-right`}>Slots</th>
                      <th className={`${TH} text-right`}>Change</th>
                      <th className={`${TH} text-right`}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotData.map(p => (
                      <tr key={p.month} style={{ borderTop: '1px solid #EEF2F1' }}>
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{p.label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--charcoal)' }}>{p.slots.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: signedColor(p.delta) }}>
                          {p.delta === null ? '—' : `${p.delta > 0 ? '+' : ''}${p.delta.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: signedColor(p.pctChange) }}>
                          {p.pctChange === null ? '—' : `${p.pctChange > 0 ? '+' : ''}${p.pctChange.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </DashCard>

      {/* Top Therapists */}
      {showMain && (
        <div id="top-therapists" className="scroll-mt-4">
        <DashCard
          title="Top 5 Therapists by Completed Sessions"
          icon={<Star size={15} />}
          description={`Confirmed sessions in ${rangeLabel}.`}
          flush
        >
          <div className="px-5 pt-4">
            <PillTabs
              label="Department"
              value={therapistTab}
              onChange={setTherapistTab}
              tabs={[{ id: 'all', label: 'Overall' }, ...activeDepts.map(d => ({ id: d, label: DEPT_LABELS[d] }))]}
            />
          </div>
          <div className="py-2">
            {initialLoad ? (
              <div className="px-5 py-2 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : topTherapists.length === 0 ? (
              <EmptyState title="No data for current filters" hint="Only confirmed sessions count here." />
            ) : (
              <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                {topTherapists.map((t, i) => {
                  const medal = ['#B45309', '#6B7280', '#9A3412'][i]
                  return (
                    <li key={t.staffId} className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: '1px solid #EEF2F1' }}>
                      <span className="w-5 text-center text-xs font-bold tabular-nums flex-shrink-0" style={{ color: medal ?? 'var(--mid-gray)' }}>{i + 1}</span>
                      <Avatar name={t.name} />
                      <div className="flex-1 min-w-0">
                        {/* Names arrive pre-masked to initials from the API for INVESTOR
                            sessions — never mask client-side only, or the full name
                            still ships in the network response. */}
                        <div className="text-sm font-semibold break-words" style={{ color: 'var(--charcoal)' }}>{t.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <DeptTag code={t.dept} />
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[10rem]" style={{ background: '#EEF2F1' }}>
                            <div className="h-full rounded-full" style={{ width: `${(t.count / topTherapists[0].count) * 100}%`, background: CHART_COLOR }} />
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold leading-tight tabular-nums" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{t.count}</div>
                        <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>sessions</div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </DashCard>
        </div>
      )}

      {/* Therapist Utilization */}
      <TherapistUtilizationSection startDate={startDate} endDate={endDate} role={role} />

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSettingsOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="sd-settings-title"
            className="bg-white rounded-xl w-full max-w-[700px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-6 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div>
                <h3 id="sd-settings-title" className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Dashboard Settings</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Set maximum daily sessions per department per branch</p>
              </div>
              <button onClick={() => setSettingsOpen(false)} aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {BRANCHES.map(b => (
                <div key={b} className="rounded-xl p-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                  <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--charcoal)' }}>{BRANCH_LABELS[b]}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {DEPARTMENTS.map(d => (
                      <div key={d} className="flex flex-col gap-1 min-w-0">
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[d]}</label>
                        <input type="number" min={0} max={50}
                          value={maxSessions[b]?.[d] ?? 8}
                          onChange={e => setMaxSessions(prev => ({
                            ...prev, [b]: { ...prev[b], [d]: parseInt(e.target.value) || 0 },
                          }))}
                          className={`${CONTROL} text-center w-full`}
                          style={CONTROL_STYLE} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <button onClick={() => setSettingsOpen(false)} className={BTN_SECONDARY} style={CONTROL_STYLE}>Cancel</button>
              <button onClick={saveSettings} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** Makes a KPI card a jump link to the section that breaks the figure down. */
function KpiLink({ target, title, children }: { target: string; title: string; children: ReactNode }) {
  return (
    <a href={`#${target}`} title={title}
      onClick={e => { e.preventDefault(); scrollToSection(target) }}
      className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--teal)]">
      {children}
    </a>
  )
}

function ErrorCard({ title, hint, onRetry, compact = false }: { title: string; hint?: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={`rounded-xl text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'}`} style={{ background: '#fff', border: '1px solid #FECACA' }}>
      <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      {onRetry && (
        <button onClick={onRetry} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 mb-4 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
      {children}
    </div>
  )
}

function MiniStat({ label, value, color = 'var(--charcoal)' }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="rounded-lg px-3.5 py-2.5 min-w-[9rem]" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-xl font-bold tabular-nums leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)', color }}>{value}</p>
    </div>
  )
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span aria-hidden className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--pale-teal)', color: 'var(--teal)' }}>
      {initialsOf(name)}
    </span>
  )
}

function DeptTag({ code }: { code: string }) {
  return (
    <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded leading-none whitespace-nowrap"
      style={{ background: '#EEF2F1', color: 'var(--teal)' }}>
      {DEPT_LABELS[code] || code}
    </span>
  )
}

function PillTabs({ tabs, value, onChange, label }: {
  tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void; label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full" style={{ background: '#F3F6F5' }}>
      {tabs.map(t => {
        const active = value === t.id
        return (
          <button key={t.id} role="tab" aria-selected={active} onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function HeatCell({ v, max, tip }: { v: number; max: number; tip: string }) {
  return (
    <td className="p-0.5 text-center">
      <div title={tip} aria-label={tip}
        className="h-7 min-w-[2.75rem] rounded-md flex items-center justify-center tabular-nums transition-shadow hover:ring-2 hover:ring-[color:var(--teal)]"
        style={{ background: heatBg(v, max) || '#F7F9F8', color: v === 0 ? '#B8C7C2' : heatInk(v, max), fontWeight: v === 0 ? 400 : 600 }}>
        {v}
      </div>
    </td>
  )
}

/** Swatches for the heatmap scale. `top` is the count at which shading maxes out. */
function HeatLegend({ max }: { max: number }) {
  const top = Math.ceil(0.7 * Math.max(max, 5))
  const steps = Array.from(new Set([1, Math.round(top * 0.25), Math.round(top * 0.5), Math.round(top * 0.75), top].filter(n => n >= 1)))
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Sessions per cell:</span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: '#F7F9F8', border: '1px solid var(--light-gray)' }} />0
      </span>
      <span className="flex items-center gap-0.5">
        {steps.map(n => <span key={n} className="inline-block w-4 h-3 rounded-sm" style={{ background: heatBg(n, max) }} title={`${n}`} />)}
      </span>
      <span>1 → {top}+ (darkest)</span>
      <span>· hover a cell for details</span>
    </div>
  )
}

const tone = (p: number) => p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'

// Module-level (not declared inside DeckingVsAttendance) so React keeps one
// component identity across renders.
function Meter({ label, frame, value, detail }: { label: string; frame: string; value: number; detail: string }) {
  return (
    <div className="flex-1 min-w-[200px]">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: tone(value) }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#E5ECEA' }}>
        <div style={{ width: `${Math.min(100, value)}%`, background: tone(value), height: '100%', transition: 'width 0.3s' }} />
      </div>
      <div className="text-[11px] mt-1" style={{ color: 'var(--charcoal)' }}>{detail}</div>
      <div className="text-[10px] italic" style={{ color: 'var(--mid-gray)' }}>{frame}</div>
    </div>
  )
}

// Two measures that answer different questions and are easy to conflate:
//
//   Decking fill  = decked / available     — how full the WEEK is. A permanent
//                                            patient holds the hour. Low fill is
//                                            a caseload problem.
//   Show-up rate  = confirmed / booked     — how often those patients actually
//                                            come. Low show-up is an attendance
//                                            problem, and no amount of decking
//                                            fixes it.
//
// A therapist can be 100% decked and still half-empty in practice, which is
// precisely the case the single utilization figure used to hide.
function DeckingVsAttendance({ rosteredPerWeek, deckedPerWeek, deckedOffRoster, confirmed, rescheduled, cancelled, pending }: {
  rosteredPerWeek: number; deckedPerWeek: number; deckedOffRoster: number
  confirmed: number; rescheduled: number; cancelled: number; pending: number
}) {
  const booked  = confirmed + rescheduled + cancelled + pending
  // Fill is a CURRENT-WEEK snapshot; the decking module stores no history, so it
  // cannot be re-expanded over a past date range. Show-up is measured over the
  // selected range. The labels say which is which, because mixing the two
  // frames is exactly what makes these numbers untrustworthy.
  const fillPct = rosteredPerWeek > 0 ? (deckedPerWeek / rosteredPerWeek) * 100 : 0
  const showPct = booked > 0 ? (confirmed / booked) * 100 : 0

  return (
    <div className="flex flex-wrap gap-5 items-start">
      <Meter
        label="Decking fill"
        frame="current week — decking has no history"
        value={fillPct}
        detail={`${deckedPerWeek} of ${rosteredPerWeek} rostered hours held by a permanent patient`}
      />
      <Meter
        label="Show-up rate"
        frame="selected date range"
        value={showPct}
        detail={`${confirmed} confirmed of ${booked} booked`}
      />
      {deckedOffRoster > 0 && (
        <div className="min-w-[170px] rounded-lg px-3 py-2" style={{ background: '#FFF1F2', border: '1px solid #FECDD3' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#be123c' }}>
            Off-roster decking
          </div>
          <div className="text-sm font-bold" style={{ color: '#be123c' }}>{deckedOffRoster}h</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--charcoal)' }}>
            decked on days no longer in the roster — usually left behind when someone reduces their days
          </div>
        </div>
      )}
    </div>
  )
}

// Prints the fitted line as an equation plus a plain-language reading of it.
// `unit` is the y-axis unit per day — "sessions", or "pp" (percentage points)
// for the utilization chart, where "%/week" would be ambiguous between a
// relative change and a change in the rate itself.
function TrendEquation({ fit, unit }: {
  fit: { slope: number; intercept: number; r2: number; change: number } | null
  unit: string
}) {
  if (!fit) return <div className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Not enough days in range to fit a trend</div>

  const { slope, intercept, r2, change } = fit
  // "Flat" is judged on total movement across the whole range, not on the raw
  // slope: 0.02/day reads as flat over a week and as real over a quarter. Less
  // than one unit of net change across the period is noise, not direction.
  const flat = Math.abs(change) < 1
  const dir = flat ? 'Flat' : change > 0 ? 'Rising' : 'Falling'
  const dirStyle = flat
    ? { background: '#F3F4F6', color: '#4B5563' }
    : change > 0 ? { background: '#DCFCE7', color: POS } : { background: '#FEE2E2', color: NEG }
  const arrow = flat ? '→' : change > 0 ? '↑' : '↓'

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mb-3">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold" style={dirStyle}>{arrow} {dir}</span>
      {!flat && (
        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>
          {slope > 0 ? '+' : '−'}{Math.abs(slope * 7).toFixed(1)} {unit}/week
        </span>
      )}
      <code className="text-[11px] font-medium rounded px-1.5 py-0.5" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
        y = {slope.toFixed(2)}x {intercept < 0 ? '−' : '+'} {Math.abs(intercept).toFixed(2)}
      </code>
      <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }} title="How closely the points follow the line (1.00 = perfect fit)">R² {r2.toFixed(2)}</span>
    </div>
  )
}


// ── Therapist Utilization Section ───────────────────────────────────────────

interface TherapistUtil {
  staffId: string
  staffName: string
  department: string
  branch: string
  totalSlots: number
  deckedPerWeek: number
  rosteredPerWeek: number
  deckedOffRoster: number
  confirmed: number
  rescheduled: number
  cancelled: number
  pending: number
  blank: number
  overbooked: number
}

interface UtilSummary {
  totalSlots: number
  deckedPerWeek: number
  rosteredPerWeek: number
  deckedOffRoster: number
  confirmed: number
  rescheduled: number
  cancelled: number
  pending: number
  blank: number
  overbooked: number
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.00'
  return ((n / total) * 100).toFixed(2)
}

const UTIL_LEGEND = [
  { label: 'Confirmed', color: '#10b981' },
  { label: 'Rescheduled', color: '#f59e0b' },
  { label: 'Cancelled', color: '#ef4444' },
  { label: 'Pending', color: '#6366f1' },
  { label: 'Blank', color: '#e5e7eb' },
]

function UtilBar({ confirmed, rescheduled, cancelled, pending, blank, total }: {
  confirmed: number; rescheduled: number; cancelled: number; pending: number; blank: number; total: number
}) {
  if (total === 0) return <div className="h-3 rounded-full" style={{ background: '#F3F4F6' }} />
  const used = confirmed + rescheduled + cancelled + pending
  // Only CONFIRMED + PENDING actually hold the hour — a cancelled session
  // releases its slot and a rescheduled one has moved elsewhere — so this,
  // not `used`, is what counts as over capacity.
  const occupied = confirmed + pending
  // Widths still scale by `used` so the bar can show cancelled/rescheduled
  // history without overflowing: as flex children the segments would otherwise
  // shrink to fit, quietly renormalising the proportions so an over-full bar
  // looked exactly like a perfectly full one. flexShrink is pinned off for the
  // same reason.
  const scale = Math.max(total, used)
  const segments = [
    { value: confirmed,   color: '#10b981', label: 'Confirmed' },
    { value: rescheduled, color: '#f59e0b', label: 'Rescheduled' },
    { value: cancelled,   color: '#ef4444', label: 'Cancelled' },
    { value: pending,     color: '#6366f1', label: 'Pending' },
    { value: blank,       color: '#e5e7eb', label: 'Blank' },
  ]
  return (
    <div className="relative flex h-3 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
      {segments.map(seg => {
        const w = (seg.value / scale) * 100
        if (w === 0) return null
        return (
          <div
            key={seg.label}
            title={`${seg.label}: ${seg.value} (${pct(seg.value, total)}%)`}
            style={{ width: `${w}%`, background: seg.color, flexShrink: 0, transition: 'width 0.3s' }}
          />
        )
      })}
      {occupied > total && (
        <div
          title={`Capacity ${total} slots — ${occupied - total} live booking${occupied - total === 1 ? '' : 's'} beyond it (confirmed + pending; cancelled and rescheduled do not hold a slot)`}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${(total / scale) * 100}%`,
            width: 2, background: '#881337',
          }}
        />
      )}
    </div>
  )
}

function TherapistUtilizationSection({ startDate, endDate, role }: { startDate: string; endDate: string; role: string }) {
  // Scoped exactly like the summary above. The API overrides the branch for
  // these roles regardless; seeding from the role keeps this panel's own filter
  // from claiming a breadth it will not get back.
  const scopedBranch = branchForRole(role)
  const [branch, setBranch]       = useState(() => branchForRole(role) ?? 'all')
  const [department, setDepartment] = useState('all')
  const [staffFilter, setStaffFilter] = useState('')
  const [data, setData]           = useState<TherapistUtil[]>([])
  // The server summary is kept in state as before but not rendered — see
  // visibleSummary below for why the headline is derived client-side.
  const [, setSummary]            = useState<UtilSummary | null>(null)
  const [loading, setLoading]     = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
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
        setLoadFailed(false)
      } else if (!isRetry && (res.status === 401 || res.status === 403)) {
        await new Promise(r => setTimeout(r, 700))
        await fetchUtil(true)
        return
      } else {
        setLoadFailed(true)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      if (!isRetry) {
        await new Promise(r => setTimeout(r, 700))
        await fetchUtil(true)
        return
      }
      setLoadFailed(true)
    } finally { setLoading(false) }
  }, [startDate, endDate, branch, department])

  useEffect(() => { fetchUtil() }, [fetchUtil])

  const byDept = useMemo(() => {
    const map = new Map<string, { therapists: TherapistUtil[]; totals: UtilSummary }>()
    for (const t of data) {
      if (!map.has(t.department)) map.set(t.department, { therapists: [], totals: { totalSlots: 0, deckedPerWeek: 0, rosteredPerWeek: 0, deckedOffRoster: 0, confirmed: 0, rescheduled: 0, cancelled: 0, pending: 0, blank: 0, overbooked: 0 } })
      const g = map.get(t.department)!
      g.therapists.push(t)
      g.totals.totalSlots  += t.totalSlots
      g.totals.deckedPerWeek   += t.deckedPerWeek
      g.totals.rosteredPerWeek += t.rosteredPerWeek
      g.totals.deckedOffRoster += t.deckedOffRoster
      g.totals.confirmed   += t.confirmed
      g.totals.rescheduled += t.rescheduled
      g.totals.cancelled   += t.cancelled
      g.totals.pending     += t.pending
      g.totals.blank       += t.blank
      g.totals.overbooked  += t.overbooked
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const byBranch = useMemo(() => {
    const map = new Map<string, UtilSummary>()
    for (const t of data) {
      if (!map.has(t.branch)) map.set(t.branch, { totalSlots: 0, deckedPerWeek: 0, rosteredPerWeek: 0, deckedOffRoster: 0, confirmed: 0, rescheduled: 0, cancelled: 0, pending: 0, blank: 0, overbooked: 0 })
      const g = map.get(t.branch)!
      g.totalSlots  += t.totalSlots
      g.deckedPerWeek   += t.deckedPerWeek
      g.rosteredPerWeek += t.rosteredPerWeek
      g.deckedOffRoster += t.deckedOffRoster
      g.confirmed   += t.confirmed
      g.rescheduled += t.rescheduled
      g.cancelled   += t.cancelled
      g.pending     += t.pending
      g.blank       += t.blank
      g.overbooked  += t.overbooked
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const filtered = staffFilter.trim()
    ? data.filter(t => t.staffName.toLowerCase().includes(staffFilter.toLowerCase()))
    : data

  // The Overall block used the server's `summary`, which is computed before the
  // therapist-name filter is applied — that filter is client-side only. So
  // narrowing to one therapist left a headline still covering everybody: a total
  // describing rows the user could no longer see.
  //
  // Derived from `filtered` instead, so the headline always summarises exactly
  // the rows beneath it, under every filter.
  const visibleSummary = useMemo<UtilSummary | null>(() => {
    if (filtered.length === 0) return null
    const acc: UtilSummary = {
      totalSlots: 0, deckedPerWeek: 0, rosteredPerWeek: 0, deckedOffRoster: 0,
      confirmed: 0, rescheduled: 0, cancelled: 0, pending: 0, blank: 0, overbooked: 0,
    }
    for (const t of filtered) {
      acc.totalSlots       += t.totalSlots
      acc.deckedPerWeek    += t.deckedPerWeek
      acc.rosteredPerWeek  += t.rosteredPerWeek
      acc.deckedOffRoster  += t.deckedOffRoster
      acc.confirmed        += t.confirmed
      acc.rescheduled      += t.rescheduled
      acc.cancelled        += t.cancelled
      acc.pending          += t.pending
      acc.blank            += t.blank
      acc.overbooked       += t.overbooked
    }
    return acc
  }, [filtered])

  const statBox = (label: string, value: number, total: number, color: string) => (
    <div key={label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg min-w-0" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>{pct(value, total)}%</span>
      <span className="text-[10px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>{value}/{total}</span>
    </div>
  )

  const groupRow = (key: string, title: string, sub: string, totals: UtilSummary) => (
    <div key={key} className="px-5 py-3.5" style={{ borderBottom: '1px solid #EEF2F1' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{title}</span>
        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{sub}</span>
        <span className="ml-auto text-base font-bold tabular-nums" style={{ color: '#10b981' }}>
          {pct(totals.confirmed, totals.totalSlots)}%
        </span>
      </div>
      <UtilBar {...totals} total={totals.totalSlots} />
      <div className="flex flex-wrap gap-2 mt-2.5">
        {statBox('Confirmed', totals.confirmed, totals.totalSlots, '#10b981')}
        {statBox('Rescheduled', totals.rescheduled, totals.totalSlots, '#f59e0b')}
        {statBox('Cancelled', totals.cancelled, totals.totalSlots, '#ef4444')}
        {statBox('Pending', totals.pending, totals.totalSlots, '#6366f1')}
        {statBox('Blank', totals.blank, totals.totalSlots, '#9ca3af')}
      </div>
    </div>
  )

  return (
    <DashCard
      title="Therapist Utilization"
      icon={<Activity size={15} />}
      description={`Decked slots versus what actually happened, ${fmtRange(startDate, endDate)}. Uses the page's date range; branch and department are set here.`}
      flush
      footer={
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {UTIL_LEGEND.map(l => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0.5 h-3" style={{ background: '#881337' }} /> capacity line (shown when over)
          </span>
        </div>
      }
    >
      <div className="px-5 py-3 flex flex-wrap gap-3 items-end" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div>
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="tu-branch">Branch</label>
          {scopedBranch ? (
            <div className={`${CONTROL_SM} flex items-center`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}
              title="Your account is scoped to this branch">
              {BRANCH_LABELS[scopedBranch] ?? scopedBranch}
            </div>
          ) : (
            <select id="tu-branch" value={branch} onChange={e => setBranch(e.target.value)}
              className={CONTROL_SM} style={CONTROL_STYLE}>
              <option value="all">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="tu-dept">Department</label>
          <select id="tu-dept" value={department} onChange={e => setDepartment(e.target.value)}
            className={CONTROL_SM} style={CONTROL_STYLE}>
            <option value="all">All Departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="tu-name">Therapist</label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              id="tu-name"
              placeholder="Filter by name…"
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className={`${CONTROL_SM} pl-7 w-[12rem]`}
              style={CONTROL_STYLE}
            />
          </div>
        </div>
        <div className="sm:ml-auto max-w-full">
          <PillTabs
            label="Group by"
            value={viewMode}
            onChange={id => setViewMode(id as 'therapist' | 'department' | 'branch')}
            tabs={[
              { id: 'therapist', label: 'Per Therapist' },
              { id: 'department', label: 'Per Department' },
              { id: 'branch', label: 'Per Branch' },
            ]}
          />
        </div>
      </div>

      {loading && data.length === 0 ? (
        <div className="p-5 space-y-3" aria-hidden>
          <Skeleton className="h-24" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : loadFailed && data.length === 0 ? (
        <div className="p-5">
          <ErrorCard compact title="Couldn't load therapist utilization" hint="Check your connection, then try again." onRetry={() => fetchUtil()} />
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="No therapist configurations found." hint="Set up therapists in the Decking Module first." />
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {loadFailed && (
            <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
              Couldn&apos;t refresh — showing the last loaded figures.
              <button onClick={() => fetchUtil()} className="inline-flex items-center gap-1 font-semibold underline">
                <RefreshCw size={11} /> Try again
              </button>
            </div>
          )}
          {visibleSummary && visibleSummary.totalSlots > 0 && (
            <div className="px-5 py-4" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                  {viewMode === 'therapist' ? 'Overall' : 'Aggregate'} — {visibleSummary.totalSlots} total slots
                </span>
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>({startDate} to {endDate})</span>
              </div>
              <div className="mb-4">
                <DeckingVsAttendance {...visibleSummary} />
              </div>
              <UtilBar {...visibleSummary} total={visibleSummary.totalSlots} />
              <div className="flex flex-wrap gap-2 mt-3">
                {statBox('Confirmed', visibleSummary.confirmed, visibleSummary.totalSlots, '#10b981')}
                {statBox('Rescheduled', visibleSummary.rescheduled, visibleSummary.totalSlots, '#f59e0b')}
                {statBox('Cancelled', visibleSummary.cancelled, visibleSummary.totalSlots, '#ef4444')}
                {statBox('Pending', visibleSummary.pending, visibleSummary.totalSlots, '#6366f1')}
                {statBox('Blank', visibleSummary.blank, visibleSummary.totalSlots, '#9ca3af')}
              </div>
            </div>
          )}

          {viewMode === 'therapist' && (
            <div>
              {filtered.length === 0 ? (
                <EmptyState title="No therapists match the filter." hint="Clear the name filter to see everyone." />
              ) : filtered.map(t => {
                const isExpanded = expandedId === t.staffId
                const utilizationPct = t.totalSlots > 0 ? (t.confirmed / t.totalSlots) * 100 : 0
                return (
                  <div key={t.staffId} style={{ borderBottom: '1px solid #EEF2F1' }}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : t.staffId)}
                      aria-expanded={isExpanded}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50/70 transition-colors"
                    >
                      <Avatar name={t.staffName} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold break-words" style={{ color: 'var(--charcoal)' }}>{t.staffName}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                          <DeptTag code={t.department} />
                          <span>{BRANCH_LABELS[t.branch] || t.branch} · {t.totalSlots} slots</span>
                        </div>
                      </div>
                      <div className="flex-1 max-w-[220px] hidden sm:block">
                        <UtilBar {...t} total={t.totalSlots} />
                      </div>
                      <div className="text-right min-w-[64px]">
                        <div className="text-base font-bold tabular-nums" style={{ color: utilizationPct > 100 ? '#be123c' : utilizationPct >= 80 ? '#10b981' : utilizationPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {pct(t.confirmed, t.totalSlots)}%
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                          {t.overbooked > 0
                            ? <span className="inline-block px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide" style={{ background: '#FFE4E6', color: '#BE123C' }}>over capacity</span>
                            : 'confirmed'}
                        </div>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={14} className="flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />
                        : <ChevronDown size={14} className="flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />}
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-1 sm:pl-16">
                        <div className="sm:hidden mb-3"><UtilBar {...t} total={t.totalSlots} /></div>
                        <div className="mb-3 pb-3" style={{ borderBottom: '1px solid #EEF2F1' }}>
                          <DeckingVsAttendance {...t} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {statBox('Confirmed', t.confirmed, t.totalSlots, '#10b981')}
                          {statBox('Rescheduled', t.rescheduled, t.totalSlots, '#f59e0b')}
                          {statBox('Cancelled', t.cancelled, t.totalSlots, '#ef4444')}
                          {statBox('Pending', t.pending, t.totalSlots, '#6366f1')}
                          {statBox('Blank', t.blank, t.totalSlots, '#9ca3af')}
                          {t.overbooked > 0 && statBox('Over capacity', t.overbooked, t.totalSlots, '#be123c')}
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
              {byDept.map(([dept, group]) => groupRow(
                dept,
                DEPT_LABELS[dept] || dept,
                `${group.therapists.length} therapist${group.therapists.length !== 1 ? 's' : ''} · ${group.totals.totalSlots} slots`,
                group.totals,
              ))}
            </div>
          )}

          {viewMode === 'branch' && (
            <div>
              {byBranch.map(([br, totals]) => groupRow(br, BRANCH_LABELS[br] || br, `${totals.totalSlots} slots`, totals))}
            </div>
          )}
        </div>
      )}
    </DashCard>
  )
}
