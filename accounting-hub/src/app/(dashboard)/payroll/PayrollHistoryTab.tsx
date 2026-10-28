'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Loader2, Download, BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { downloadXlsx } from '@/lib/export'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface HistoryRow {
  cutoffPeriod: string
  dateFrom: string | null
  dateTo: string | null
  consultantGross: number
  employeeGross: number
  totalGross: number
  consultantNet: number
  employeeNet: number
  totalNet: number
  sales: number
  payrollPctOfSales: number | null
}

const BRANCH_LABEL: Record<string, string> = { '': 'All Branches', SBEA: 'East Branch', SBGH: 'Greenhills Branch', VERDANA: 'Verdana' }

/** "2026-10-2" → "Oct 2026 · 2nd". */
function cutoffLabel(period: string): string {
  const [y, m, h] = period.split('-')
  const mon = MONTHS[parseInt(m, 10) - 1] ?? m
  return `${mon} ${y} · ${h === '1' ? '1st' : '2nd'}`
}
/** Compact axis label: "Oct·2". */
function cutoffShort(period: string): string {
  const [, m, h] = period.split('-')
  return `${MONTHS[parseInt(m, 10) - 1] ?? m}·${h}`
}
function fmtRange(from: string | null, to: string | null): string {
  if (!from || !to) return '—'
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${f.toLocaleDateString('en-US', opt)} – ${t.toLocaleDateString('en-US', opt)}`
}
/** ₱1.2M / ₱450K / ₱980 — for the chart axis, where full figures do not fit. */
function pesoCompact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `₱${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1_000) return `₱${Math.round(v / 1_000)}K`
  return `₱${Math.round(v)}`
}
function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * base
}

const PAYROLL_COLOR = '#0f766e' // teal-700
const SALES_COLOR = '#d97706' // amber-600

function TrendChart({ rows }: { rows: HistoryRow[] }) {
  const W = 880, H = 340
  const L = 72, R = 20, T = 20, B = 58
  const innerW = W - L - R
  const innerH = H - T - B
  const n = rows.length

  const yMax = niceMax(Math.max(1, ...rows.flatMap(r => [r.totalGross, r.sales])))
  const x = (i: number) => L + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => T + innerH - (Math.max(0, v) / yMax) * innerH

  const line = (key: 'totalGross' | 'sales') => rows.map((r, i) => `${x(i)},${y(r[key])}`).join(' ')
  const gridSteps = [0, 1, 2, 3, 4]
  // Avoid crowding the x-axis when there are many cutoffs.
  const labelEvery = n > 16 ? 3 : n > 10 ? 2 : 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Payroll and sales per cutoff" style={{ display: 'block', maxWidth: '100%' }}>
      {/* gridlines + y labels */}
      {gridSteps.map(k => {
        const v = (yMax * k) / 4
        const yy = y(v)
        return (
          <g key={k}>
            <line x1={L} y1={yy} x2={W - R} y2={yy} stroke="#e5e7eb" strokeWidth={1} />
            <text x={L - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="#6b7280">{pesoCompact(v)}</text>
          </g>
        )
      })}
      {/* x labels */}
      {rows.map((r, i) => (i % labelEvery === 0 || i === n - 1) ? (
        <text key={r.cutoffPeriod} x={x(i)} y={H - B + 20} textAnchor="middle" fontSize={10} fill="#6b7280">
          {cutoffShort(r.cutoffPeriod)}
        </text>
      ) : null)}

      {/* sales line (drawn first, under payroll) */}
      {n > 1 && <polyline points={line('sales')} fill="none" stroke={SALES_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {rows.map((r, i) => <circle key={`s${i}`} cx={x(i)} cy={y(r.sales)} r={3} fill={SALES_COLOR} />)}
      {/* payroll line */}
      {n > 1 && <polyline points={line('totalGross')} fill="none" stroke={PAYROLL_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {rows.map((r, i) => <circle key={`p${i}`} cx={x(i)} cy={y(r.totalGross)} r={3} fill={PAYROLL_COLOR} />)}

      {/* legend */}
      <g>
        <line x1={L} y1={T - 6} x2={L + 22} y2={T - 6} stroke={PAYROLL_COLOR} strokeWidth={3} />
        <text x={L + 28} y={T - 2} fontSize={12} fill="#374151" fontWeight={600}>Payroll (gross)</text>
        <line x1={L + 150} y1={T - 6} x2={L + 172} y2={T - 6} stroke={SALES_COLOR} strokeWidth={3} />
        <text x={L + 178} y={T - 2} fontSize={12} fill="#374151" fontWeight={600}>Net sales</text>
      </g>
    </svg>
  )
}

export default function PayrollHistoryTab({ branch }: { branch: string }) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cutoffs, setCutoffs] = useState(12)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ cutoffs: String(cutoffs) })
      if (branch) params.set('branch', branch)
      const res = await fetch(`/api/payroll/history?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to load payroll history')
      const data = await res.json()
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payroll history')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [branch, cutoffs])

  useEffect(() => { load() }, [load])

  // Newest-first for the table, with the change vs the chronologically previous cutoff.
  const tableRows = useMemo(() => {
    return rows.map((r, i) => ({
      ...r,
      deltaGross: i > 0 ? r.totalGross - rows[i - 1].totalGross : null,
      deltaPct: i > 0 && rows[i - 1].totalGross > 0 ? ((r.totalGross - rows[i - 1].totalGross) / rows[i - 1].totalGross) * 100 : null,
    })).reverse()
  }, [rows])

  const latest = rows.length ? rows[rows.length - 1] : null
  const prev = rows.length > 1 ? rows[rows.length - 2] : null
  const latestDelta = latest && prev ? latest.totalGross - prev.totalGross : null
  const latestDeltaPct = latest && prev && prev.totalGross > 0 ? (latestDelta! / prev.totalGross) * 100 : null

  function downloadExcel() {
    const headers = ['Cutoff', 'Date Range', 'Consultants (gross)', 'Employees (gross)', 'Total Payroll (gross)', 'Net Sales', 'Payroll % of Sales']
    const body = tableRows.map(r => [
      cutoffLabel(r.cutoffPeriod),
      fmtRange(r.dateFrom, r.dateTo),
      r.consultantGross.toFixed(2),
      r.employeeGross.toFixed(2),
      r.totalGross.toFixed(2),
      r.sales.toFixed(2),
      r.payrollPctOfSales != null ? r.payrollPctOfSales.toFixed(1) + '%' : '—',
    ])
    downloadXlsx(`Payroll History — ${BRANCH_LABEL[branch] ?? branch}`, [{ name: 'Payroll History', headers, rows: body }])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <BarChart3 size={20} style={{ color: 'var(--teal)' }} /> Payroll History
          </h2>
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
            Finalized gross payroll per cutoff vs net sales — {BRANCH_LABEL[branch] ?? branch}. Use the Branch filter above to switch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {[12, 24].map(c => (
              <button key={c} onClick={() => setCutoffs(c)}
                className="px-3 py-2 text-xs font-semibold transition-colors"
                style={cutoffs === c ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                Last {c}
              </button>
            ))}
          </div>
          <button onClick={downloadExcel} disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--mid-gray)' }}>
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border px-4 py-12 text-center" style={{ borderColor: 'var(--light-gray)', background: 'white', color: 'var(--mid-gray)' }}>
          <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
          <p>No finalized payroll yet for this branch.</p>
          <p className="text-xs mt-1">Once a cutoff is locked/finalized, it appears here.</p>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Latest cutoff payroll</p>
              <p className="text-xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>{latest ? formatCurrency(latest.totalGross) : '—'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{latest ? cutoffLabel(latest.cutoffPeriod) : ''}</p>
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Change vs previous cutoff</p>
              {latestDelta == null ? (
                <p className="text-xl font-bold mt-1" style={{ color: 'var(--mid-gray)' }}>—</p>
              ) : (
                <p className="text-xl font-bold mt-1 flex items-center gap-1" style={{ color: latestDelta > 0 ? '#b91c1c' : latestDelta < 0 ? '#166534' : 'var(--mid-gray)' }}>
                  {latestDelta > 0 ? <TrendingUp size={18} /> : latestDelta < 0 ? <TrendingDown size={18} /> : null}
                  {latestDelta > 0 ? '+' : ''}{formatCurrency(latestDelta)}
                  {latestDeltaPct != null && <span className="text-sm font-semibold">({latestDeltaPct > 0 ? '+' : ''}{latestDeltaPct.toFixed(1)}%)</span>}
                </p>
              )}
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Payroll % of sales (latest)</p>
              <p className="text-xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>{latest?.payrollPctOfSales != null ? latest.payrollPctOfSales.toFixed(1) + '%' : '—'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{latest ? `Sales ${formatCurrency(latest.sales)}` : ''}</p>
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <TrendChart rows={rows} />
          </div>

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Cutoff</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Dates</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Consultants</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Employees</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Total Payroll</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Δ vs prev</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Net Sales</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Payroll % of Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(r => (
                    <tr key={r.cutoffPeriod} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{cutoffLabel(r.cutoffPeriod)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{fmtRange(r.dateFrom, r.dateTo)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.consultantGross)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.employeeGross)}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.totalGross)}</td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: r.deltaGross == null ? 'var(--mid-gray)' : r.deltaGross > 0 ? '#b91c1c' : r.deltaGross < 0 ? '#166534' : 'var(--mid-gray)' }}>
                        {r.deltaGross == null ? '—' : `${r.deltaGross > 0 ? '+' : ''}${formatCurrency(r.deltaGross)}${r.deltaPct != null ? ` (${r.deltaPct > 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%)` : ''}`}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.sales)}</td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{r.payrollPctOfSales != null ? r.payrollPctOfSales.toFixed(1) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            Payroll = finalized gross pay (consultants + employees). Net sales = completed POS sales in each cutoff&rsquo;s date window
            (migrated/QuickBooks history excluded). Draft cutoffs and special runs (13th month, final pay) are not shown.
          </p>
        </>
      )}
    </div>
  )
}
