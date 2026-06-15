'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { TrendingUp, Filter, Loader2, BarChart3, Building2, CreditCard, Wallet, Users, ChevronUp, ChevronDown } from 'lucide-react'
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
}

const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
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

  if (rows.length === 0) return <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No data for this period.</div>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ color: 'var(--mid-gray)' }}>
          {columns.map(c => (
            <th key={c.key}
              onClick={() => toggle(c.key)}
              className={`px-3 py-2 text-xs font-semibold uppercase cursor-pointer select-none hover:text-[var(--teal)] ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
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
          <tr key={i} style={{ borderTop: '1px solid var(--light-gray)' }}>
            {columns.map(c => (
              <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.numeric ? 'font-mono' : ''}`}
                style={{ color: c.align === 'right' ? 'var(--charcoal)' : 'var(--charcoal)' }}>
                {c.fmt ? c.fmt(row[c.key]) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totalLabel && totalCols && (
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--light-gray)', background: 'var(--off-white)' }}>
            {columns.map((c, i) => (
              <td key={c.key} className={`px-3 py-2 text-xs font-bold ${c.align === 'right' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--charcoal)' }}>
                {i === 0 ? totalLabel : (totalCols[c.key] ?? '')}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: accent ? 'var(--off-white)' : 'white' }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: accent ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{sub}</p>}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>
        <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{title}</span>
        <span className="text-[10px] ml-auto" style={{ color: 'var(--mid-gray)' }}>Click a column to sort ↕</span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  )
}

export default function SalesAnalysisPage() {
  const { data: session } = useSession()
  const [branch, setBranch] = useState('ALL')
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AnalysisData | null>(null)
  const [error, setError] = useState('')

  const allowed = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}>
          <TrendingUp size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Sales Analysis</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Sales by branch, department, payment method & unearned revenue</p>
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
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
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
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>}

      {!data && !loading && (
        <div className="text-center py-20" style={{ color: 'var(--mid-gray)' }}>
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Set your date range and click <strong>Generate</strong>.</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Kpi label="Gross Sales" value={formatCurrency(data.summary.grossSales)} sub={`${data.summary.orderCount.toLocaleString()} order${data.summary.orderCount !== 1 ? 's' : ''}`} />
            <Kpi label="Net Sales" value={formatCurrency(data.summary.netSales)} sub="Gross less discounts" accent />
          </div>
          <p className="text-xs mb-6" style={{ color: 'var(--mid-gray)' }}>{dateFrom} to {dateTo}{branchLabel}. Excludes voided / returned orders.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>Unearned revenue is a current wallet-balance snapshot (date range not applied); HMO &amp; GL wallets are excluded as they are Accounts Receivable.</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Age is computed from the patient&apos;s date of birth (marketing hub) at the order date. &quot;Unknown&quot; = orders with no linked patient or no recorded DOB (e.g. walk-in product sales).{!data.ageDataAvailable && ' ⚠ Patient data was unavailable — ages may be incomplete.'}</p>
        </>
      )}
    </div>
  )
}
