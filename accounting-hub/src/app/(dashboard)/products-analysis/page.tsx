'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import {
  PackageSearch, Loader2, BarChart3, TrendingUp, TrendingDown,
  PackageX, Gift, Sparkles, CreditCard, Globe, RotateCcw, CalendarDays, Layers, Ban,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

/* ── types ── */
interface ProductRow { name: string; sku: string; units: number; gross: number; net: number }
interface NamedQty { name: string; qty: number }
interface PayMode { method: string; label: string; amount: number; count: number }
interface PlatformRow { platform: string; qty: number }
interface AnalysisData {
  summary: {
    unitsSold: number
    distinctProductsSold: number
    totalGross: number
    totalNet: number
    avgGrossPerUnit: number
    avgNetPerUnit: number
    marketingExpense: number
    marketingRoi: number | null
  }
  refunds: {
    grossProductSales: number
    refundedAmount: number
    returnedUnits: number
    refundRateAmount: number
    refundRateUnits: number
    topRefunded: { name: string; sku: string; units: number; amount: number }[]
    byPlatform: { platform: string; grossProductSales: number; refundedAmount: number; returnedUnits: number; refundRateAmount: number; refundRateUnits: number }[]
  }
  monthlySales: {
    months: string[]
    totals: { month: string; units: number; gross: number; net: number }[]
    byClassification: { label: string; unitsByMonth: Record<string, number>; units: number; gross: number; net: number }[]
  }
  fastMoving: ProductRow[]
  slowMoving: ProductRow[]
  topByGross: ProductRow[]
  topByNet: ProductRow[]
  noPurchase: { name: string; sku: string }[]
  freeSamples: NamedQty[]
  rewardPoints: NamedQty[]
  paymentModes: PayMode[]
  topPlatforms: PlatformRow[]
  purchaseHeatmap?: { grid: number[][]; noTime: number }
  cancellations: {
    total: number
    topReasons: { reason: string; count: number; orderAmount: number }[]
    cancelledOrders: number
    cancelledAmount: number
    failedDeliveryOrders: number
    failedDeliveryAmount: number
    completedOrders: number
    cancelledPct: number
    failedDeliveryPct: number
  } | null
}

const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function today() { return new Date().toISOString().slice(0, 10) }
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
/** First day of the month 11 months back — a rolling 12-month window including this month. */
function last12MonthsStart() {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/* ── KPI card: the HR stat card (same label, value and line under it) ── */
const KPI_LINE = { line: '#4A8073' }
const KPI_ACCENT = { line: '#4A8073', bg: '#f8fbf1', fg: '#3C6A5F' }
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return <StatCard compact label={label} value={value} sub={sub || ''} accent={accent ? KPI_ACCENT : KPI_LINE} title={sub ? `${label} — ${sub}` : label} />
}

/* ── section shell: HR card with a header row ── */
function Section({ icon, title, count, note, children }: { icon: React.ReactNode; title: string; count?: number; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <span className="flex" style={{ color: 'var(--teal)' }}>{icon}</span>
        <span className="text-[14px] font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{title}</span>
        {count != null && (
          <span className="px-1.5 rounded-full text-[11px] font-bold font-mono" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{count}</span>
        )}
        {note && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{note}</span>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--mid-gray)' }}>{text}</div>
}

// Table header row (HR look) and row rule.
const HEAD_ROW: React.CSSProperties = { background: 'var(--hr-head)', color: 'var(--mid-gray)' }
const ROW_RULE: React.CSSProperties = { borderTop: '1px solid var(--hr-line)' }
const MINI_HEAD = 'px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-[.4px]'

export default function ProductsAnalysisPage() {
  const { data: session } = useSession()
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)

  const [branch, setBranch] = useState(scope.enum || 'ALL')
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AnalysisData | null>(null)
  const [error, setError] = useState('')

  const allowed = ['ADMIN', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
  const role = (session?.user as { role?: string })?.role || ''
  const hasAccess = !!session?.user && allowed.includes(role)

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (branch !== 'ALL') params.set('branch', branch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/products-analysis?${params}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to load data'); return }
      setData(json)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [branch, dateFrom, dateTo])

  if (!hasAccess) {
    return (
      <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
        <div className="rounded-lg border bg-white p-8 text-center text-[13px]" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          You do not have permission to view this page.
        </div>
      </div>
    )
  }

  const branchLabel = branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label || branch}` : ''

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <PackageSearch size={22} style={{ color: 'var(--teal)' }} /> Products Analysis
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>Physical product sales — movement, samples, reward redemptions &amp; payment modes</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(scope.enum ? BRANCHES.filter(b => b.value === scope.enum) : BRANCHES).map(b => (
            <button key={b.value} onClick={() => setBranch(b.value)} aria-pressed={branch === b.value}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === b.value
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{b.label}</button>
          ))}
        </div>
      </div>

      {/* Filters: date range, quick ranges, Generate */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-lg border" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
        <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Date from
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 block h-8 px-2.5 rounded-lg border text-xs bg-white font-normal normal-case tracking-normal focus:outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Date to
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 block h-8 px-2.5 rounded-lg border text-xs bg-white font-normal normal-case tracking-normal focus:outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </label>
        {/* Quick ranges — the monthly breakdown needs a multi-month span to be useful. */}
        <div className="inline-flex flex-wrap rounded-lg border p-0.5 bg-white" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Quick range">
          {[
            { label: 'This month', from: firstOfMonth(), to: today() },
            { label: 'Year to date', from: `${new Date().getFullYear()}-01-01`, to: today() },
            { label: 'Last 12 months', from: last12MonthsStart(), to: today() },
            { label: `${new Date().getFullYear() - 1} (full year)`, from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear() - 1}-12-31` },
          ].map(r => {
            const on = dateFrom === r.from && dateTo === r.to
            return (
              <button key={r.label} onClick={() => { setDateFrom(r.from); setDateTo(r.to) }} aria-pressed={on}
                className="h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors"
                style={on ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}>{r.label}</button>
            )
          })}
        </div>
        <button onClick={fetchData} disabled={loading} className={`${hrBtn.primary} ml-auto`} style={{ background: 'var(--teal)' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
          {loading ? 'Loading…' : 'Generate'}
        </button>
      </div>

      {error && <div className="px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>}

      {!data && !loading && (
        <div className="rounded-lg border bg-white text-center py-16" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}><PackageSearch size={24} /></span>
          <p className="text-[13px]">Set your date range and click <strong style={{ color: 'var(--charcoal)' }}>Generate</strong>.</p>
        </div>
      )}
      {!data && loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => <StatCard key={i} loading label="" value="" sub="" />)}
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="Products Sold" value={data.summary.unitsSold.toLocaleString()} sub={`${data.summary.distinctProductsSold} distinct product${data.summary.distinctProductsSold !== 1 ? 's' : ''} · units sold`} />
            <Kpi label="Avg Gross Sales / Unit" value={formatCurrency(data.summary.avgGrossPerUnit)} sub={`Total gross ${formatCurrency(data.summary.totalGross)}`} />
            <Kpi label="Avg Net Sales / Unit" value={formatCurrency(data.summary.avgNetPerUnit)} sub={`Total net ${formatCurrency(data.summary.totalNet)} (gross less discounts)`} accent />
          </div>
          {/* Marketing ROI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="Marketing ROI" accent
              value={data.summary.marketingRoi != null ? `${data.summary.marketingRoi.toFixed(2)}×` : '—'}
              sub={data.summary.marketingRoi != null
                ? `${formatCurrency(data.summary.totalGross)} gross ÷ ${formatCurrency(data.summary.marketingExpense)} marketing`
                : 'No marketing expense (8120) booked for this period/branch'} />
            <Kpi label="Marketing Expense" value={formatCurrency(data.summary.marketingExpense)} sub="Account 8120 · GL + petty-cash/RFP ads, whole month(s)" />
            <Kpi label="Gross Revenue" value={formatCurrency(data.summary.totalGross)} sub="Gross product sales — the ROI numerator" />
          </div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}><span className="font-mono">{dateFrom}</span> to <span className="font-mono">{dateTo}</span>{branchLabel}. Marketing ROI = gross revenue ÷ Marketing &amp; Advertising expense (account 8120: journal lines plus petty-cash/RFP ad spend, with CEO-fund ads attributed to their branch), summed over the whole calendar month(s) the filter touches. Free samples are excluded from sold/average figures and shown separately below.</p>

          {/* Refund rate */}
          <Section icon={<RotateCcw size={16} />} title="Refund Rate" note="refunded ÷ gross product sales">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
              <Kpi label="Refund Rate (by ₱)" value={`${data.refunds.refundRateAmount}%`} sub={`${formatCurrency(data.refunds.refundedAmount)} of ${formatCurrency(data.refunds.grossProductSales)}`} accent />
              <Kpi label="Refund Rate (by units)" value={`${data.refunds.refundRateUnits}%`} sub={`${data.refunds.returnedUnits} unit${data.refunds.returnedUnits !== 1 ? 's' : ''} returned`} />
              <Kpi label="Refunded Amount" value={formatCurrency(data.refunds.refundedAmount)} />
              <Kpi label="Gross Product Sales" value={formatCurrency(data.refunds.grossProductSales)} sub="incl. returned items" />
            </div>
            {data.refunds.topRefunded.length > 0 && (
              <div className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                <p className={MINI_HEAD} style={{ color: 'var(--mid-gray)' }}>Most Refunded Products</p>
                <div className="overflow-x-auto relative">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left" style={HEAD_ROW}>
                      <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]">Product</th><th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]">SKU</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right whitespace-nowrap">Units Returned</th><th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right">Refunded</th>
                    </tr></thead>
                    <tbody>
                      {data.refunds.topRefunded.map((r, i) => (
                        <tr key={i} style={ROW_RULE}>
                          <td className="px-4 py-2" style={{ color: 'var(--charcoal)', boxShadow: 'inset 4px 0 0 #dc2626' }}>{r.name}</td>
                          <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{r.sku}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{r.units}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {data.refunds.byPlatform.length > 0 && (
              <div className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                <p className={MINI_HEAD} style={{ color: 'var(--mid-gray)' }}>Refund Rate by Platform</p>
                <div className="overflow-x-auto relative">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left" style={HEAD_ROW}>
                      <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]">Platform</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right whitespace-nowrap">Gross Sales</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right">Refunded</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right whitespace-nowrap">Rate (by ₱)</th>
                      <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right whitespace-nowrap">Rate (by units)</th>
                    </tr></thead>
                    <tbody>
                      {data.refunds.byPlatform.map((p, i) => (
                        <tr key={i} style={ROW_RULE}>
                          <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.platform}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(p.grossProductSales)}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.refundedAmount)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: p.refundRateAmount > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{p.refundRateAmount}%</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: p.refundRateUnits > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{p.refundRateUnits}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          {/* Top Cancellation Reasons (TikTok) — orders that never became a sale.
              Verdana/TikTok-only; upload via POS > Products > Bulk Upload TikTok Shop. */}
          {data.cancellations && data.cancellations.total > 0 && (
            <Section icon={<Ban size={16} />} title="Top Cancellation Reasons (TikTok)" note={`${data.cancellations.total} order${data.cancellations.total !== 1 ? 's' : ''} that never became a sale`}>
              {/* Cancelled vs failed-delivery rates, against ALL TikTok orders placed
                  (completed sales in the range + these never-became-sales orders). */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                <StatCard compact label="Cancelled" value={`${data.cancellations.cancelledPct.toFixed(1)}%`}
                  sub={`of TikTok orders · ${data.cancellations.cancelledOrders} order${data.cancellations.cancelledOrders !== 1 ? 's' : ''} · ${formatCurrency(data.cancellations.cancelledAmount)} lost`}
                  tone={data.cancellations.cancelledOrders ? 'amber' : 'zero'} />
                <StatCard compact label="Failed delivery" value={`${data.cancellations.failedDeliveryPct.toFixed(1)}%`}
                  sub={`of TikTok orders · ${data.cancellations.failedDeliveryOrders} order${data.cancellations.failedDeliveryOrders !== 1 ? 's' : ''} · ${formatCurrency(data.cancellations.failedDeliveryAmount)} lost`}
                  tone={data.cancellations.failedDeliveryOrders ? 'red' : 'zero'} />
              </div>
              <div className="overflow-x-auto relative border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-sm">
                  <thead><tr className="text-left" style={HEAD_ROW}>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]">Reason</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right">Orders</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right whitespace-nowrap">% of total</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-right whitespace-nowrap">Order Amount (lost)</th>
                  </tr></thead>
                  <tbody>
                    {data.cancellations.topReasons.map((r, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-4 py-2" style={{ color: 'var(--charcoal)' }}>{r.reason}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.count}</td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{((r.count / data.cancellations!.total) * 100).toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.orderAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-[11px] border-t" style={{ color: 'var(--mid-gray)', borderColor: 'var(--hr-line)' }}>
                From TikTok&apos;s own Cancelled / Failed Delivery exports — informational, not part of gross/net sales above. &quot;Package delivery failed&quot; and &quot;Failed delivery — not yet formally cancelled&quot; are the same underlying problem at different stages (TikTok auto-cancels most failed deliveries within a few days); both count under the Failed Delivery rate above. The percentages are of all TikTok orders placed: {data.cancellations.completedOrders} completed sale{data.cancellations.completedOrders !== 1 ? 's' : ''} in this range + the {data.cancellations.total} that never became sales.
              </p>
            </Section>
          )}

          {/* ── Purchase-time heatmap: hour-of-day rows x day-of-week columns ── */}
          {data.purchaseHeatmap && (() => {
            const grid = data.purchaseHeatmap.grid
            const dayOrder = [1, 2, 3, 4, 5, 6, 0] // Mon..Sun (grid is Sun-first)
            const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            const max = Math.max(1, ...grid.flat())
            const total = grid.flat().reduce((x, y) => x + y, 0)
            if (total === 0) {
              return (
                <div>
                  <Section icon={<CalendarDays size={16} />} title="Purchase Times — Heatmap">
                    <Empty text={`No orders with a recorded purchase time in this period yet${data.purchaseHeatmap.noTime > 0 ? ` — the ${data.purchaseHeatmap.noTime} order${data.purchaseHeatmap.noTime !== 1 ? 's' : ''} here carry only a date (onsite sales and older marketplace imports)` : ''}. New TikTok/marketplace bulk uploads record the actual purchase time and will fill this grid in.`} />
                  </Section>
                </div>
              )
            }
            const hourLabel = (h: number) => {
              const f = (v: number) => `${v % 12 === 0 ? 12 : v % 12}:00`
              const mer = (v: number) => (v % 24) < 12 ? 'AM' : 'PM'
              return mer(h) === mer(h + 1)
                ? `${f(h)}–${f(h + 1)} ${mer(h)}`
                : `${f(h)} ${mer(h)}–${f(h + 1)} ${mer(h + 1)}`
            }
            // Peak cell for the caption
            let peak = { d: 0, h: 0, n: 0 }
            grid.forEach((row, d) => row.forEach((n, h) => { if (n > peak.n) peak = { d, h, n } }))
            return (
              <div>
                <Section icon={<CalendarDays size={16} />} title="Purchase Times — Heatmap" count={total}>
                  <p className="px-4 pt-3 pb-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    Orders by hour of purchase (rows) and day of the week (columns) — darker means more purchases.
                    {peak.n > 0 && <> Busiest: <strong style={{ color: 'var(--charcoal)' }}>{DAY_LABELS[peak.d]} {hourLabel(peak.h)}</strong> ({peak.n} order{peak.n !== 1 ? 's' : ''}).</>}
                  </p>
                  <div className="overflow-x-auto relative px-3 pb-3">
                    <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
                      <thead><tr>
                        <th className="py-1.5 pr-2 text-left text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)', minWidth: 118 }}>Time</th>
                        {dayOrder.map(d => <th key={d} className="py-1.5 text-center text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)', minWidth: 52 }}>{DAY_LABELS[d]}</th>)}
                      </tr></thead>
                      <tbody>
                        {Array.from({ length: 24 }, (_, h) => (
                          <tr key={h}>
                            <td className="py-0.5 pr-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{hourLabel(h)}</td>
                            {dayOrder.map(d => {
                              const n = grid[d][h]
                              const t = n / max
                              return (
                                <td key={d} className="py-1 text-center rounded font-medium"
                                  title={`${DAY_LABELS[d]} ${hourLabel(h)} — ${n} order${n !== 1 ? 's' : ''}`}
                                  style={{
                                    background: n === 0 ? 'var(--off-white)' : `rgba(74, 128, 115, ${0.12 + 0.88 * t})`,
                                    color: n === 0 ? 'var(--light-gray)' : t > 0.55 ? '#fff' : 'var(--deep-teal)',
                                  }}>
                                  {n || ''}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.purchaseHeatmap.noTime > 0 && (
                    <p className="px-4 pb-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {data.purchaseHeatmap.noTime} order{data.purchaseHeatmap.noTime !== 1 ? 's' : ''} have no recorded time of day (onsite sales and older imports store only the date) and are not on the grid.
                    </p>
                  )}
                </Section>
              </div>
            )
          })()}

          {/* ── Monthly products sold: overall + per SKU classification ── */}
          {(() => {
            const ms = data.monthlySales
            if (!ms || ms.months.length === 0) {
              return (
                <div>
                  <Section icon={<CalendarDays size={16} />} title="Products Sold per Month">
                    <Empty text="No product sales in this period." />
                  </Section>
                </div>
              )
            }
            const monthLabel = (m: string) => {
              const [y, mo] = m.split('-')
              return `${MONTH_NAMES[parseInt(mo, 10) - 1] || mo} ${y}`
            }
            const grand = ms.totals.reduce((a, t) => ({ units: a.units + t.units, gross: a.gross + t.gross, net: a.net + t.net }), { units: 0, gross: 0, net: 0 })
            return (
              <div className="space-y-4">
                {/* Overall per month */}
                <Section icon={<CalendarDays size={16} />} title="Products Sold per Month (Overall)" count={ms.months.length}>
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-sm">
                      <thead><tr style={HEAD_ROW}>
                        <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Month</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Items Sold</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Gross ₱</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Net ₱</th>
                      </tr></thead>
                      <tbody>
                        {ms.totals.map(t => (
                          <tr key={t.month} className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                            <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{monthLabel(t.month)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{t.units.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.gross)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.net)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                          <td className="px-3 py-2 font-bold" style={{ color: 'var(--charcoal)' }}>Total</td>
                          <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{grand.units.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(grand.gross)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(grand.net)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* Per SKU classification × month (units) */}
                <Section icon={<Layers size={16} />} title="Items Sold per Month by SKU Classification" count={ms.byClassification.length}>
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-sm">
                      <thead><tr style={HEAD_ROW}>
                        <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px] sticky left-0 whitespace-nowrap" style={{ background: 'var(--hr-head)' }}>SKU Classification</th>
                        {ms.months.map(m => <th key={m} className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap">{monthLabel(m)}</th>)}
                        <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Total</th>
                      </tr></thead>
                      <tbody>
                        {ms.byClassification.map(c => (
                          <tr key={c.label} className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                            <td className="px-3 py-2 sticky left-0" style={{ color: 'var(--charcoal)', background: 'white' }}>{c.label}</td>
                            {ms.months.map(m => (
                              <td key={m} className="px-3 py-2 text-right" style={{ color: (c.unitsByMonth[m] || 0) > 0 ? 'var(--charcoal)' : 'var(--light-gray)' }}>
                                {(c.unitsByMonth[m] || 0) > 0 ? (c.unitsByMonth[m] || 0).toLocaleString() : '—'}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>{c.units.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                          <td className="px-3 py-2 font-bold sticky left-0" style={{ color: 'var(--charcoal)', background: 'var(--hr-head)' }}>Total</td>
                          {ms.months.map(m => {
                            const col = ms.byClassification.reduce((a, c) => a + (c.unitsByMonth[m] || 0), 0)
                            return <td key={m} className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{col.toLocaleString()}</td>
                          })}
                          <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{grand.units.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2.5 text-xs border-t" style={{ color: 'var(--mid-gray)', borderColor: 'var(--hr-line)' }}>Units are paid sales (free samples excluded) and include returned units. Classification is the product&apos;s SKU Department · Category.</p>
                </Section>
              </div>
            )
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 10 by ₱ Gross Sales */}
            <Section icon={<BarChart3 size={16} />} title="Top 10 Products by ₱ Gross Sales" count={data.topByGross.length}>
              {data.topByGross.length === 0 ? <Empty text="No product sales in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">#</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Product</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Units</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Gross ₱</th>
                  </tr></thead>
                  <tbody>
                    {data.topByGross.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}{p.sku && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{p.sku}</span>}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{p.units.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Top 10 by ₱ Net Sales */}
            <Section icon={<BarChart3 size={16} />} title="Top 10 Products by ₱ Net Sales" count={data.topByNet.length}>
              {data.topByNet.length === 0 ? <Empty text="No product sales in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">#</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Product</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Units</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Net ₱</th>
                  </tr></thead>
                  <tbody>
                    {data.topByNet.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}{p.sku && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{p.sku}</span>}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{p.units.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Fast moving */}
            <Section icon={<TrendingUp size={16} />} title="Top 10 Products Sold (Fast Moving)" count={data.fastMoving.length}>
              {data.fastMoving.length === 0 ? <Empty text="No product sales in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">#</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Product</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Units</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Gross</th>
                  </tr></thead>
                  <tbody>
                    {data.fastMoving.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}{p.sku && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{p.sku}</span>}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{p.units.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Slow moving */}
            <Section icon={<TrendingDown size={16} />} title="Lowest 10 Products (Slow Moving)" count={data.slowMoving.length}>
              {data.slowMoving.length === 0 ? <Empty text="No product sales in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Product</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Units</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Gross</th>
                  </tr></thead>
                  <tbody>
                    {data.slowMoving.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}{p.sku && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{p.sku}</span>}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{p.units.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* No purchase */}
            <Section icon={<PackageX size={16} />} title="Products with No Purchase" count={data.noPurchase.length}>
              {data.noPurchase.length === 0 ? <Empty text="Every active product sold at least once. 🎉" /> : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {data.noPurchase.map((p, i) => (
                        <tr key={i} style={i ? ROW_RULE : undefined}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}</td>
                          <td className="px-3 py-2 text-right text-[10px] font-mono" style={{ color: 'var(--mid-gray)' }}>{p.sku}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Top modes of payment */}
            <Section icon={<CreditCard size={16} />} title="Top Modes of Payment" count={data.paymentModes.length}>
              {data.paymentModes.length === 0 ? <Empty text="No payments recorded for product orders." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Method</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Txns</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Amount</th>
                  </tr></thead>
                  <tbody>
                    {data.paymentModes.map((m, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{m.label}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{m.count.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(m.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Top platforms */}
            <Section icon={<Globe size={16} />} title="Top 5 Platforms (by Qty Purchased)" count={data.topPlatforms.length}>
              {data.topPlatforms.length === 0 ? <Empty text="No product sales in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">#</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Platform</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Qty Purchased</th>
                  </tr></thead>
                  <tbody>
                    {data.topPlatforms.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.platform}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{p.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Free samples */}
            <Section icon={<Gift size={16} />} title="Products Sent as Free Sample" count={data.freeSamples.length}>
              {data.freeSamples.length === 0 ? <Empty text="No free samples in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Product</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Qty</th>
                  </tr></thead>
                  <tbody>
                    {data.freeSamples.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{p.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Reward points */}
            <Section icon={<Sparkles size={16} />} title="Products Purchased Using Reward Points" count={data.rewardPoints.length}>
              {data.rewardPoints.length === 0 ? <Empty text="No reward-point redemptions in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={HEAD_ROW}>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px]">Product</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[.4px]">Qty</th>
                  </tr></thead>
                  <tbody>
                    {data.rewardPoints.map((p, i) => (
                      <tr key={i} style={ROW_RULE}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{p.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
