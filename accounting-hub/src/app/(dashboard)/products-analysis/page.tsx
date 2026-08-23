'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import {
  PackageSearch, Filter, Loader2, BarChart3, TrendingUp, TrendingDown,
  PackageX, Gift, Sparkles, CreditCard, Globe, RotateCcw, CalendarDays, Layers, Ban,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

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
  cancellations: {
    total: number
    topReasons: { reason: string; count: number; orderAmount: number }[]
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

/* ── KPI card ── */
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: accent ? 'var(--off-white)' : 'white' }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: accent ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{sub}</p>}
    </div>
  )
}

/* ── section shell ── */
function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>
        <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{title}</span>
        {count != null && (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{count}</span>
        )}
      </div>
      <div className="p-2">{children}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>{text}</div>
}

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
      <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
        You do not have permission to view this page.
      </div>
    )
  }

  const branchLabel = branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label || branch}` : ''

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}>
          <PackageSearch size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Products Analysis</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Physical product sales — movement, samples, reward redemptions & payment modes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: 'var(--mid-gray)' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
            <select value={branch} onChange={e => setBranch(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              {(scope.enum ? BRANCHES.filter(b => b.value === scope.enum) : BRANCHES).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <button onClick={fetchData} disabled={loading} className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            {loading ? 'Loading...' : 'Generate'}
          </button>
        </div>
        {/* Quick ranges — the monthly breakdown needs a multi-month span to be useful. */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Quick range:</span>
          {[
            { label: 'This month', from: firstOfMonth(), to: today() },
            { label: 'Year to date', from: `${new Date().getFullYear()}-01-01`, to: today() },
            { label: 'Last 12 months', from: last12MonthsStart(), to: today() },
            { label: `${new Date().getFullYear() - 1} (full year)`, from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear() - 1}-12-31` },
          ].map(r => (
            <button key={r.label} onClick={() => { setDateFrom(r.from); setDateTo(r.to) }}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors"
              style={dateFrom === r.from && dateTo === r.to
                ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)', borderColor: 'var(--teal)' }
                : { background: 'white', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>}

      {!data && !loading && (
        <div className="text-center py-20" style={{ color: 'var(--mid-gray)' }}>
          <PackageSearch size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Set your date range and click <strong>Generate</strong>.</p>
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Kpi label="Products Sold" value={data.summary.unitsSold.toLocaleString()} sub={`${data.summary.distinctProductsSold} distinct product${data.summary.distinctProductsSold !== 1 ? 's' : ''} · units sold`} />
            <Kpi label="Avg Gross Sales / Unit" value={formatCurrency(data.summary.avgGrossPerUnit)} sub={`Total gross ${formatCurrency(data.summary.totalGross)}`} />
            <Kpi label="Avg Net Sales / Unit" value={formatCurrency(data.summary.avgNetPerUnit)} sub={`Total net ${formatCurrency(data.summary.totalNet)} (gross less discounts)`} accent />
          </div>
          <p className="text-xs mb-6" style={{ color: 'var(--mid-gray)' }}>{dateFrom} to {dateTo}{branchLabel}. Free samples are excluded from sold/average figures and shown separately below.</p>

          {/* Refund rate */}
          <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={16} style={{ color: 'var(--teal)' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Refund Rate</h3>
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>(refunded ÷ gross product sales)</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Refund Rate (by ₱)" value={`${data.refunds.refundRateAmount}%`} sub={`${formatCurrency(data.refunds.refundedAmount)} of ${formatCurrency(data.refunds.grossProductSales)}`} accent />
              <Kpi label="Refund Rate (by units)" value={`${data.refunds.refundRateUnits}%`} sub={`${data.refunds.returnedUnits} unit${data.refunds.returnedUnits !== 1 ? 's' : ''} returned`} />
              <Kpi label="Refunded Amount" value={formatCurrency(data.refunds.refundedAmount)} />
              <Kpi label="Gross Product Sales" value={formatCurrency(data.refunds.grossProductSales)} sub="incl. returned items" />
            </div>
            {data.refunds.topRefunded.length > 0 && (
              <div className="mt-4 overflow-auto">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Most Refunded Products</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>
                    <th className="py-1.5 pr-3 font-semibold">Product</th><th className="py-1.5 pr-3 font-semibold">SKU</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Units Returned</th><th className="py-1.5 font-semibold text-right">Refunded</th>
                  </tr></thead>
                  <tbody>
                    {data.refunds.topRefunded.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="py-1.5 pr-3" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{r.sku}</td>
                        <td className="py-1.5 pr-3 text-right" style={{ color: 'var(--charcoal)' }}>{r.units}</td>
                        <td className="py-1.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.refunds.byPlatform.length > 0 && (
              <div className="mt-4 overflow-auto">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Refund Rate by Platform</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>
                    <th className="py-1.5 pr-3 font-semibold">Platform</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Gross Sales</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Refunded</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Rate (by ₱)</th>
                    <th className="py-1.5 font-semibold text-right">Rate (by units)</th>
                  </tr></thead>
                  <tbody>
                    {data.refunds.byPlatform.map((p, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="py-1.5 pr-3 font-medium" style={{ color: 'var(--charcoal)' }}>{p.platform}</td>
                        <td className="py-1.5 pr-3 text-right" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(p.grossProductSales)}</td>
                        <td className="py-1.5 pr-3 text-right" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.refundedAmount)}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: p.refundRateAmount > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{p.refundRateAmount}%</td>
                        <td className="py-1.5 text-right font-semibold" style={{ color: p.refundRateUnits > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{p.refundRateUnits}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Cancellation Reasons (TikTok) — orders that never became a sale.
              Verdana/TikTok-only; upload via POS > Products > Bulk Upload TikTok Shop. */}
          {data.cancellations && data.cancellations.total > 0 && (
            <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
              <div className="flex items-center gap-2 mb-3">
                <Ban size={16} style={{ color: 'var(--teal)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Top Cancellation Reasons (TikTok)</h3>
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{data.cancellations.total} order{data.cancellations.total !== 1 ? 's' : ''} that never became a sale</span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>
                    <th className="py-1.5 pr-3 font-semibold">Reason</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Orders</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">% of total</th>
                    <th className="py-1.5 font-semibold text-right">Order Amount (lost)</th>
                  </tr></thead>
                  <tbody>
                    {data.cancellations.topReasons.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="py-1.5 pr-3" style={{ color: 'var(--charcoal)' }}>{r.reason}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{r.count}</td>
                        <td className="py-1.5 pr-3 text-right" style={{ color: 'var(--mid-gray)' }}>{((r.count / data.cancellations!.total) * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.orderAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>
                From TikTok&apos;s own Cancelled / Failed Delivery exports — informational, not part of gross/net sales above. &quot;Package delivery failed&quot; and &quot;Failed delivery — not yet formally cancelled&quot; are the same underlying problem at different stages (TikTok auto-cancels most failed deliveries within a few days).
              </p>
            </div>
          )}

          {/* ── Monthly products sold: overall + per SKU classification ── */}
          {(() => {
            const ms = data.monthlySales
            if (!ms || ms.months.length === 0) {
              return (
                <div className="mb-4">
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
              <div className="mb-4 space-y-4">
                {/* Overall per month */}
                <Section icon={<CalendarDays size={16} />} title="Products Sold per Month (Overall)" count={ms.months.length}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr style={{ color: 'var(--mid-gray)' }}>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Month</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Items Sold</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Gross ₱</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Net ₱</th>
                      </tr></thead>
                      <tbody>
                        {ms.totals.map(t => (
                          <tr key={t.month} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{monthLabel(t.month)}</td>
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>{t.units.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.gross)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.net)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                          <td className="px-3 py-2 font-bold" style={{ color: 'var(--charcoal)' }}>Total</td>
                          <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--deep-teal)' }}>{grand.units.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(grand.gross)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(grand.net)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* Per SKU classification × month (units) */}
                <Section icon={<Layers size={16} />} title="Items Sold per Month by SKU Classification" count={ms.byClassification.length}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr style={{ color: 'var(--mid-gray)' }}>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase sticky left-0" style={{ background: 'white' }}>SKU Classification</th>
                        {ms.months.map(m => <th key={m} className="px-3 py-2 text-right text-xs font-semibold uppercase whitespace-nowrap">{monthLabel(m)}</th>)}
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Total</th>
                      </tr></thead>
                      <tbody>
                        {ms.byClassification.map(c => (
                          <tr key={c.label} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-3 py-2 sticky left-0" style={{ color: 'var(--charcoal)', background: 'white' }}>{c.label}</td>
                            {ms.months.map(m => (
                              <td key={m} className="px-3 py-2 text-right" style={{ color: (c.unitsByMonth[m] || 0) > 0 ? 'var(--charcoal)' : 'var(--light-gray)' }}>
                                {(c.unitsByMonth[m] || 0) > 0 ? (c.unitsByMonth[m] || 0).toLocaleString() : '—'}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>{c.units.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                          <td className="px-3 py-2 font-bold sticky left-0" style={{ color: 'var(--charcoal)', background: 'var(--off-white)' }}>Total</td>
                          {ms.months.map(m => {
                            const col = ms.byClassification.reduce((a, c) => a + (c.unitsByMonth[m] || 0), 0)
                            return <td key={m} className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>{col.toLocaleString()}</td>
                          })}
                          <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--deep-teal)' }}>{grand.units.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>Units are paid sales (free samples excluded) and include returned units. Classification is the product&apos;s SKU Department · Category.</p>
                </Section>
              </div>
            )
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Top 10 by ₱ Gross Sales */}
            <Section icon={<BarChart3 size={16} />} title="Top 10 Products by ₱ Gross Sales" count={data.topByGross.length}>
              {data.topByGross.length === 0 ? <Empty text="No product sales in this period." /> : (
                <table className="w-full text-sm">
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Units</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Gross ₱</th>
                  </tr></thead>
                  <tbody>
                    {data.topByGross.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Units</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Net ₱</th>
                  </tr></thead>
                  <tbody>
                    {data.topByNet.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Units</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Gross</th>
                  </tr></thead>
                  <tbody>
                    {data.fastMoving.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Units</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Gross</th>
                  </tr></thead>
                  <tbody>
                    {data.slowMoving.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                        <tr key={i} style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Method</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Txns</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Amount</th>
                  </tr></thead>
                  <tbody>
                    {data.paymentModes.map((m, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Platform</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Qty Purchased</th>
                  </tr></thead>
                  <tbody>
                    {data.topPlatforms.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Qty</th>
                  </tr></thead>
                  <tbody>
                    {data.freeSamples.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Qty</th>
                  </tr></thead>
                  <tbody>
                    {data.rewardPoints.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
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
