'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import { TrendingUp, Loader2, BarChart3, Building2, CreditCard, Wallet, Users, ChevronUp, ChevronDown } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import { formatCurrency } from '@/lib/utils'

/* ── types ── */
interface Row { [k: string]: string | number }
interface AnalysisData {
  summary: { grossSales: number; netSales: number; orderCount: number }
  byDepartment: { key: string; label: string; gross: number; pct: number }[]
  byPayment: { method: string; label: string; amount: number; pct: number }[]
  unearnedRevenue: { walletType: string; label: string; amount: number; pct: number }[]
  totalUnearned: number
  ageGross: { key: string; label: string; amount: number; pct: number }[]
  ageNet: { key: string; label: string; amount: number; pct: number }[]
  ageDataAvailable: boolean
  unknownOrders?: { orderNumber: number; date: string; orderType: string; patientName: string; gross: number; net: number; reason: string }[]
}

const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

function today() { return new Date().toISOString().slice(0, 10) }
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface Column { key: string; label: string; align?: 'left' | 'right'; numeric?: boolean; fmt?: (v: string | number) => React.ReactNode }

/* ── sortable table (click any header to toggle asc/desc) ── */
function SortableTable({ rows, columns, initialKey, totalLabel, totalCols }: {
  rows: Row[]
  columns: Column[]
  initialKey: string
  totalLabel?: string
  totalCols?: Record<string, React.ReactNode>
}) {
  const [sortKey, setSortKey] = useState(initialKey)
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const r = [...rows]
    r.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
    return r
  }, [rows, sortKey, dir])

  const toggle = (k: string) => {
    if (k === sortKey) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setDir('desc') }
  }

  if (rows.length === 0) return <div className="px-4 py-10 text-center text-[13px]" style={{ color: 'var(--mid-gray)' }}>No data for this period.</div>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)' }}>
          {columns.map(c => (
            <th key={c.key}
              onClick={() => toggle(c.key)}
              aria-sort={sortKey === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
              className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] cursor-pointer select-none whitespace-nowrap hover:text-[var(--teal)] ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
              <span className={`inline-flex items-center gap-0.5 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                {c.label}
                {sortKey === c.key && (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={i} className="transition-colors hover:bg-[#fafcf6]" style={{ borderTop: '1px solid var(--hr-line)' }}>
            {columns.map(c => (
              <td key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right whitespace-nowrap' : 'text-left'} ${c.numeric ? 'font-mono' : ''}`}
                style={{ color: 'var(--charcoal)' }}>
                {c.fmt ? c.fmt(row[c.key]) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totalLabel && totalCols && (
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--light-gray)', background: 'var(--hr-head)' }}>
            {columns.map((c, i) => (
              <td key={c.key} className={`px-4 py-2.5 ${i === 0 ? 'text-[11px] font-bold uppercase tracking-[.4px]' : 'font-mono font-bold whitespace-nowrap'} ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                style={{ color: i === 0 ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                {i === 0 ? totalLabel : (totalCols[c.key] ?? '')}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <span className="flex-none w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>{icon}</span>
        <span className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{title}</span>
        <span className="hidden sm:inline text-[11px] ml-auto" style={{ color: 'var(--hr-faint)' }}>Click a column to sort</span>
      </div>
      <div className="overflow-x-auto relative">{children}</div>
    </div>
  )
}

export default function SalesAnalysisPage() {
  const { data: session } = useSession()
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)
  const [branch, setBranch] = useState(scope.enum || 'ALL')
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AnalysisData | null>(null)
  const [showUnknown, setShowUnknown] = useState(false)
  const [error, setError] = useState('')

  const allowed = ['ADMIN', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
  const role = (session?.user as { role?: string })?.role || ''
  const hasAccess = !!session?.user && allowed.includes(role)

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (branch !== 'ALL') params.set('branch', branch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/sales-analysis?${params}`)
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
    return <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>You do not have permission to view this page.</div>
  }

  const pctCol = (v: string | number) => `${Number(v).toFixed(1)}%`
  const moneyCol = (v: string | number) => formatCurrency(Number(v))
  const branchLabel = branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label || branch}` : ''

  const branchOptions = scope.enum ? BRANCHES.filter(b => b.value === scope.enum) : BRANCHES

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <TrendingUp size={22} style={{ color: 'var(--teal)' }} /> Sales Analysis
        </h1>
        <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>Sales by branch, department, payment method &amp; unearned revenue</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg border" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          {branchOptions.map(b => (
            <button key={b.value} onClick={() => setBranch(b.value)} aria-pressed={branch === b.value}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === b.value
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{b.label}</button>
          ))}
        </div>
        <span className="hidden sm:block w-px h-6 mx-1" style={{ background: 'var(--light-gray)' }} />
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>
          From
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 px-2 rounded-lg border text-xs font-normal normal-case tracking-normal bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>
          To
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 px-2 rounded-lg border text-xs font-normal normal-case tracking-normal bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </label>
        <button onClick={fetchData} disabled={loading} className={`${hrBtn.primary} sm:ml-auto`} style={{ background: 'var(--teal)' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
          {loading ? 'Loading…' : 'Generate'}
        </button>
      </div>

      {error && <div className="px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>}

      {!data && !loading && (
        <div className="rounded-lg border bg-white text-center py-16 px-4" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <TrendingUp size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-[13px]">Set your date range and click <strong>Generate</strong>.</p>
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <StatCard key={i} loading label="" value="" sub="" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard compact label="Gross sales" value={formatCurrency(data.summary.grossSales)} sub="Earned sales in range" accent={{ line: '#4A8073' }} />
            <StatCard compact label="Net sales" value={formatCurrency(data.summary.netSales)} sub="Gross less discounts" tone={data.summary.netSales ? 'green' : 'zero'} />
            <StatCard label="Orders" value={data.summary.orderCount.toLocaleString()} sub={`order${data.summary.orderCount !== 1 ? 's' : ''} behind the gross`} tone="zero" accent={data.summary.orderCount ? { line: '#2563eb' } : undefined} />
            <StatCard compact label="Unearned (wallets)" value={formatCurrency(data.totalUnearned)} sub="Current balance · excl. HMO/GL" tone="zero" accent={data.totalUnearned ? { line: '#d97706' } : undefined} />
          </div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{dateFrom} to {dateTo}{branchLabel}. Earned sales only — excludes voided/returned and unearned-revenue orders (VIP cards, prepaid reloads, downpayments, packages, advances).</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Per department */}
            <Section icon={<Building2 size={16} />} title="Gross Sales by Department">
              <SortableTable
                rows={data.byDepartment as unknown as Row[]}
                initialKey="gross"
                columns={[
                  { key: 'label', label: 'Department' },
                  { key: 'gross', label: 'Gross', align: 'right', numeric: true, fmt: moneyCol },
                  { key: 'pct', label: '%', align: 'right', numeric: true, fmt: pctCol },
                ]}
                totalLabel="TOTAL"
                totalCols={{ gross: formatCurrency(data.summary.grossSales), pct: '100.0%' }}
              />
            </Section>

            {/* Per payment */}
            <Section icon={<CreditCard size={16} />} title="By Form of Payment">
              <SortableTable
                rows={data.byPayment as unknown as Row[]}
                initialKey="amount"
                columns={[
                  { key: 'label', label: 'Payment Method' },
                  { key: 'amount', label: 'Amount', align: 'right', numeric: true, fmt: moneyCol },
                  { key: 'pct', label: '%', align: 'right', numeric: true, fmt: pctCol },
                ]}
                totalLabel="TOTAL"
                totalCols={{ amount: formatCurrency(data.byPayment.reduce((s, p) => s + p.amount, 0)), pct: '100.0%' }}
              />
            </Section>

            {/* Unearned revenue */}
            <Section icon={<Wallet size={16} />} title="Unearned Revenue (Digital Wallets · excl. HMO/GL)">
              <SortableTable
                rows={data.unearnedRevenue as unknown as Row[]}
                initialKey="amount"
                columns={[
                  { key: 'label', label: 'Wallet Type' },
                  { key: 'amount', label: 'Balance', align: 'right', numeric: true, fmt: moneyCol },
                  { key: 'pct', label: '%', align: 'right', numeric: true, fmt: pctCol },
                ]}
                totalLabel="TOTAL"
                totalCols={{ amount: formatCurrency(data.totalUnearned), pct: '100.0%' }}
              />
            </Section>

            {/* Gross Sales by Age */}
            <Section icon={<Users size={16} />} title="Gross Sales by Age (at time of order)">
              <SortableTable
                rows={data.ageGross as unknown as Row[]}
                initialKey="amount"
                columns={[
                  { key: 'label', label: 'Age Group' },
                  { key: 'amount', label: 'Gross', align: 'right', numeric: true, fmt: moneyCol },
                  { key: 'pct', label: '%', align: 'right', numeric: true, fmt: pctCol },
                ]}
                totalLabel="TOTAL"
                totalCols={{ amount: formatCurrency(data.summary.grossSales), pct: '100.0%' }}
              />
              {(data.unknownOrders?.length ?? 0) > 0 && (
                <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--hr-line)' }}>
                  <button onClick={() => setShowUnknown(v => !v)} className="text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
                    {showUnknown ? '▾ Hide' : '▸ Show'} the {data.unknownOrders!.length} “Unknown” order{data.unknownOrders!.length > 1 ? 's' : ''}
                  </button>
                  {showUnknown && (
                    <div className="mt-2 rounded-lg border overflow-auto relative" style={{ borderColor: 'var(--light-gray)', maxHeight: '340px' }}>
                      <table className="w-full text-xs">
                        <thead className="sticky top-0" style={{ background: 'var(--hr-head)' }}><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>
                          {['Order #', 'Date', 'Type', 'Patient / Customer', 'Gross', 'Why unknown'].map(h => <th key={h} className={`px-2.5 py-2 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap ${h === 'Gross' ? 'text-right' : ''}`}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {data.unknownOrders!.map(o => (
                            <tr key={o.orderNumber} className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                              <td className="px-2.5 py-1.5 font-mono">{o.orderNumber}</td>
                              <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{o.date}</td>
                              <td className="px-2.5 py-1.5">{o.orderType === 'PRODUCT' ? 'Product' : 'Service'}</td>
                              <td className="px-2.5 py-1.5" style={{ color: 'var(--charcoal)' }}>{o.patientName}</td>
                              <td className="px-2.5 py-1.5 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(o.gross)}</td>
                              <td className="px-2.5 py-1.5" style={{ color: 'var(--mid-gray)' }}>{o.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Net Sales by Age */}
            <Section icon={<Users size={16} />} title="Net Sales by Age (at time of order)">
              <SortableTable
                rows={data.ageNet as unknown as Row[]}
                initialKey="amount"
                columns={[
                  { key: 'label', label: 'Age Group' },
                  { key: 'amount', label: 'Net', align: 'right', numeric: true, fmt: moneyCol },
                  { key: 'pct', label: '%', align: 'right', numeric: true, fmt: pctCol },
                ]}
                totalLabel="TOTAL"
                totalCols={{ amount: formatCurrency(data.summary.netSales), pct: '100.0%' }}
              />
            </Section>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Unearned revenue is a current wallet-balance snapshot (date range not applied); HMO &amp; GL wallets are excluded as they are Accounts Receivable.</p>
          <p className="text-[11px] -mt-2" style={{ color: 'var(--mid-gray)' }}>Age is computed from the patient&apos;s date of birth (marketing hub) at the order date. &quot;Unknown&quot; = orders with no linked patient or no recorded DOB (e.g. walk-in product sales).{!data.ageDataAvailable && ' ⚠ Patient data was unavailable — ages may be incomplete.'}</p>
        </>
      )}
    </div>
  )
}
