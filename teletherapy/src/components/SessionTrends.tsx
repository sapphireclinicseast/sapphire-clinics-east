'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'

interface Point { period: string; label: string; count: number }
interface Clinician { id: string; name: string; department: string }
interface TrendData {
  series: Point[]
  total: number
  grain: 'month' | 'year'
  filters: { departments: string[]; clinicians: Clinician[]; years: number[] }
}

const DEPT_LABEL: Record<string, string> = {
  OT: 'Occupational Therapy', PT: 'Physical Therapy', SLP: 'Speech & Language',
  SPED: 'SPED', MD: 'Medical', PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthosis',
  FRONT_DESK: 'Front Desk', ADMINISTRATION: 'Administration', PSYCHIATRY: 'Psychiatry',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrics', REHABILITATION_MEDICINE: 'Rehabilitation Medicine',
}
const deptLabel = (d: string) => DEPT_LABEL[d] ?? d

export default function SessionTrends() {
  const [department, setDepartment] = useState('all')
  const [staffId, setStaffId] = useState('all')
  const [year, setYear] = useState('all')
  const [data, setData] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    setLoading(true)
    const qs = new URLSearchParams({ department, staffId, year })
    fetch(`/api/clinic-schedule/trends?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (ok) { setData(d); setLoading(false) } })
      .catch(() => { if (ok) setLoading(false) })
    return () => { ok = false }
  }, [department, staffId, year])

  // Clinicians are narrowed to the selected department for the person dropdown.
  const clinicianOptions = useMemo(() => {
    const all = data?.filters.clinicians ?? []
    return department === 'all' ? all : all.filter((c) => c.department === department)
  }, [data, department])

  // When the department changes, drop a person selection that no longer fits.
  function onDepartment(v: string) {
    setDepartment(v)
    if (v !== 'all' && staffId !== 'all') {
      const stillValid = (data?.filters.clinicians ?? []).some((c) => c.id === staffId && c.department === v)
      if (!stillValid) setStaffId('all')
    }
  }

  const series = data?.series ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Department">
          <select value={department} onChange={(e) => onDepartment(e.target.value)} className={selectCls}>
            <option value="all">All departments</option>
            {(data?.filters.departments ?? []).map((d) => (
              <option key={d} value={d}>{deptLabel(d)}</option>
            ))}
          </select>
        </Field>
        <Field label="Clinician">
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={selectCls}>
            <option value="all">All clinicians</option>
            {clinicianOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Year">
          <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
            <option value="all">All years</option>
            {(data?.filters.years ?? []).map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </Field>
        <div className="ml-auto flex items-center gap-2 rounded-lg bg-teal-50 px-4 py-2 text-teal-800">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm">
            <span className="font-semibold tabular-nums">{(data?.total ?? 0).toLocaleString()}</span> sessions
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        {loading ? (
          <div className="flex h-72 items-center justify-center text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-gray-400">
            No sessions match these filters.
          </div>
        ) : (
          <LineChart series={series} grain={data!.grain} />
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  )
}

const selectCls =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

function LineChart({ series, grain }: { series: Point[]; grain: 'month' | 'year' }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760, H = 300
  const padL = 44, padR = 20, padT = 20, padB = 40
  const innerW = W - padL - padR, innerH = H - padT - padB
  const n = series.length
  const maxCount = Math.max(1, ...series.map((p) => p.count))
  const yMax = niceMax(maxCount)
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number) => padT + innerH * (1 - v / yMax)

  const linePath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`
  const yTicks = [0, yMax / 2, yMax]
  // Thin x labels if there are many so they don't collide.
  const labelEvery = n > 12 ? Math.ceil(n / 12) : 1

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sessions over time">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f8f7f" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2f8f7f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#eef2f1" strokeWidth={1} />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#9aa8a4">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke="#2f8f7f" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => (
          <g key={p.period}>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - padB + 18} textAnchor="middle" fontSize="11" fill="#8a978f">{p.label}</text>
            )}
            <circle cx={x(i)} cy={y(p.count)} r={hover === i ? 5 : 3.5} fill="#fff" stroke="#2f8f7f" strokeWidth={2} />
            {/* wide invisible hit area */}
            <rect x={x(i) - innerW / (2 * Math.max(1, n - 1))} y={padT} width={innerW / Math.max(1, n - 1)} height={innerH}
              fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(series[hover].count) / H) * 100}%` }}
        >
          <div className="font-semibold tabular-nums">{series[hover].count} sessions</div>
          <div className="text-gray-300">{grain === 'month' ? fullMonth(series[hover].period) : series[hover].label}</div>
        </div>
      )}
    </div>
  )
}

function niceMax(v: number) {
  if (v <= 5) return 5
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fullMonth(period: string) {
  const [y, m] = period.split('-')
  return `${FULL_MONTHS[Number(m) - 1]} ${y}`
}
