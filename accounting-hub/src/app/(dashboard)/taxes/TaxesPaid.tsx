'use client'

// Taxes → Taxes Paid, in the HR Hub look (Hannah 11/17: "make the Taxes Paid
// view look like this too"): summary cards, one white card with a toolbar,
// soft amount chips instead of solid cells, and year totals per tax and month.
// The data rule is unchanged: a paid RFP sits in the month it was paid, an
// unpaid one in the month it was raised.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { StatCard, hrBtn } from '@/components/ui/hr-look'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BRANCHES = [{ value: '', label: 'All' }, { value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const peso2 = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)
const TYPES: { key: string; label: string; forms: string }[] = [
  { key: 'WC', label: 'Withholding — Compensation', forms: '1601-C · monthly' },
  { key: 'EWT', label: 'Expanded Withholding (EWT)', forms: '0619-E · 1601-EQ' },
  { key: 'VAT', label: 'Value-Added Tax', forms: '2550Q · quarterly' },
  { key: 'IT', label: 'Corporate Income Tax', forms: '1702Q · 1702-RT' },
]
const SHORT: Record<string, string> = { WC: 'Withholding on compensation', EWT: 'EWT', VAT: 'VAT', IT: 'Income tax' }

interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; meta: { taxType?: string } | null; createdAt: string }
const typeOf = (r: TaxRfp) => r.meta?.taxType || (r.refNumber.endsWith('-WC') ? 'WC' : r.refNumber.endsWith('-EWT') ? 'EWT' : r.refNumber.endsWith('-VAT') ? 'VAT' : r.refNumber.endsWith('-IT') ? 'IT' : '')
type Cell = { paid: number; pending: number }
type Show = 'all' | 'paid' | 'pending'

const chipCls = 'inline-block px-1.5 py-0.5 rounded-md font-semibold tabular-nums whitespace-nowrap'
const PAID = { background: '#dcfce7', color: '#166534' }
const PENDING = { background: '#fef3c7', color: '#92400e' }
const thCls = 'px-2 py-2 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'
const thStyle = { color: 'var(--mid-gray)', borderBottom: '1px solid var(--hr-line)' }

export default function TaxesPaid() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchRfps = useCallback(async () => {
    try { const res = await fetch(`/api/taxes/rfp?all=1${branch ? `&payrollBranch=${branch}` : ''}`); setRfps(res.ok ? await res.json() : []) } catch { setRfps([]) }
    setLoaded(true)
  }, [branch])
  useEffect(() => { fetchRfps() }, [fetchRfps])

  // cell[type][month] = { paid, pending } totals. A paid RFP sits in its paidAt
  // month; an unpaid one in its createdAt month.
  const { grid, inYear } = useMemo(() => {
    const g: Record<string, Cell[]> = {}
    const list: TaxRfp[] = []
    for (const t of TYPES) g[t.key] = Array.from({ length: 12 }, () => ({ paid: 0, pending: 0 }))
    for (const r of rfps) {
      const t = typeOf(r); if (!g[t]) continue
      const paid = r.status === 'PAID'
      const d = new Date(paid && r.paidAt ? r.paidAt : r.createdAt)
      if (d.getUTCFullYear() !== year) continue
      const cell = g[t][d.getUTCMonth()]
      if (paid) cell.paid += num(r.grossTotal); else cell.pending += num(r.grossTotal)
      list.push(r)
    }
    return { grid: g, inYear: list }
  }, [rfps, year])

  const years: number[] = []
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) years.push(y)

  // Summary for the cards.
  const paidRfps = inYear.filter(r => r.status === 'PAID')
  const pendingRfps = inYear.filter(r => r.status !== 'PAID')
  const paidTotal = paidRfps.reduce((s, r) => s + num(r.grossTotal), 0)
  const pendingTotal = pendingRfps.reduce((s, r) => s + num(r.grossTotal), 0)
  const last = [...paidRfps].sort((a, b) => (b.paidAt || b.createdAt).localeCompare(a.paidAt || a.createdAt))[0]
  const lastDate = last ? new Date(last.paidAt || last.createdAt) : null
  const monthsSoFar = year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0
  const covered = MONTHS.filter((_, i) => i < monthsSoFar && TYPES.some(t => grid[t.key][i].paid > 0)).length
  const thisMonth = year === now.getFullYear() ? now.getMonth() : -1

  // What the cells and totals show under the Show switch.
  const view = (c: Cell): Cell => ({ paid: show === 'pending' ? 0 : c.paid, pending: show === 'paid' ? 0 : c.pending })
  const add = (a: Cell, b: Cell): Cell => ({ paid: a.paid + b.paid, pending: a.pending + b.pending })
  const ZERO: Cell = { paid: 0, pending: 0 }
  const rowTotal = (k: string) => grid[k].map(view).reduce(add, ZERO)
  const monthTotal = (i: number) => TYPES.map(t => view(grid[t.key][i])).reduce(add, ZERO)
  const grand = TYPES.map(t => rowTotal(t.key)).reduce(add, ZERO)

  const amounts = (c: Cell, size: 'cell' | 'total') => {
    if (!c.paid && !c.pending) return <span className="text-[11px]" style={{ color: '#c9d3cf' }}>—</span>
    const text = size === 'total' ? 'text-[12px]' : 'text-[11.5px]'
    return (
      <div className="flex flex-col items-center gap-1">
        {c.paid > 0 && <span className={`${chipCls} ${text}`} style={PAID}>₱{peso(c.paid)}</span>}
        {c.pending > 0 && <span className={`${chipCls} text-[10.5px]`} style={PENDING}>₱{peso(c.pending)} pending</span>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={`Paid in ${year}`} value={`₱${peso2(paidTotal)}`} compact
          sub={paidRfps.length ? `${paidRfps.length} tax RFP${paidRfps.length === 1 ? '' : 's'} paid` : 'Nothing paid yet'}
          tone={paidTotal ? 'green' : 'zero'} active={show === 'paid'}
          onClick={() => setShow(s => (s === 'paid' ? 'all' : 'paid'))} title="Show only what was paid" />
        <StatCard label="Pending" value={`₱${peso2(pendingTotal)}`} compact
          sub={pendingRfps.length ? `${pendingRfps.length} tax RFP${pendingRfps.length === 1 ? '' : 's'} not yet paid` : 'Nothing waiting to be paid'}
          tone={pendingTotal ? 'amber' : 'zero'} active={show === 'pending'}
          onClick={() => setShow(s => (s === 'pending' ? 'all' : 'pending'))} title="Show only RFPs not yet paid" />
        <StatCard label="Last payment" compact
          value={lastDate ? lastDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          sub={last ? `₱${peso2(num(last.grossTotal))} · ${SHORT[typeOf(last)] || typeOf(last)}` : `No tax paid in ${year}`}
          tone={last ? 'blue' : 'zero'} />
        <StatCard label="Months with a payment" compact
          value={monthsSoFar ? `${covered} of ${monthsSoFar}` : '—'}
          sub={monthsSoFar ? `${year === now.getFullYear() ? 'Jan to this month' : `All of ${year}`} with a tax paid` : `${year} hasn't started`}
          tone={!monthsSoFar || !covered ? 'zero' : covered === monthsSoFar ? 'green' : 'amber'} />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-b" style={{ background: 'var(--hr-head)', borderColor: 'var(--hr-line)' }}>
          <span className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Branch</span>
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => (
              <button key={b.value} onClick={() => setBranch(b.value)} className="h-8 px-3 text-xs font-semibold"
                style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>
            ))}
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[.4px] ml-1" style={{ color: 'var(--mid-gray)' }}>Year</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Year"
            className="h-8 px-2 rounded-lg border text-xs font-semibold bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex rounded-lg border overflow-hidden ml-auto" style={{ borderColor: 'var(--light-gray)' }}>
            {([['all', 'All'], ['paid', 'Paid'], ['pending', 'Pending']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setShow(v)} className="h-8 px-3 text-xs font-semibold"
                style={show === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{label}</button>
            ))}
          </div>
          <button onClick={fetchRfps} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} title="Reload the tax RFPs">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {!loaded ? (
          <div className="py-12 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  <th className={`${thCls} px-4 text-left sticky left-0 z-10`} style={{ ...thStyle, background: 'var(--hr-head)', minWidth: 230 }}>Tax</th>
                  {MONTHS.map((m, i) => (
                    <th key={m} className={`${thCls} text-center`} style={{ ...thStyle, minWidth: 82, color: i === thisMonth ? 'var(--teal)' : 'var(--mid-gray)' }}
                      title={i === thisMonth ? 'This month' : undefined}>
                      <span className="block">{m}</span>
                      <span className="block text-[10px] font-medium normal-case" style={{ color: 'var(--hr-faint)' }}>’{String(year).slice(2)}</span>
                    </th>
                  ))}
                  <th className={`${thCls} px-4 text-center`} style={{ ...thStyle, minWidth: 110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map(t => {
                  const tot = rowTotal(t.key)
                  const all = grid[t.key].reduce(add, ZERO)
                  const edge = all.pending > 0 ? '#d97706' : all.paid > 0 ? '#059669' : 'var(--light-gray)'
                  return (
                    <tr key={t.key} className="group" style={{ borderTop: '1px solid var(--hr-line)' }}>
                      <td className="px-4 py-2.5 sticky left-0 z-10 bg-white group-hover:bg-[var(--off-white)]" style={{ boxShadow: `inset 3px 0 0 ${edge}` }}>
                        <span className="block text-[13px] font-semibold leading-tight" style={{ color: 'var(--charcoal)' }}>{t.label}</span>
                        <span className="block text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{t.forms}</span>
                      </td>
                      {grid[t.key].map((c, i) => (
                        <td key={i} className="px-1.5 py-2.5 text-center group-hover:bg-[var(--off-white)]">{amounts(view(c), 'cell')}</td>
                      ))}
                      <td className="px-3 py-2.5 text-center group-hover:bg-[var(--off-white)]" style={{ borderLeft: '1px solid var(--hr-line)' }}>{amounts(tot, 'total')}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '1px solid var(--light-gray)', background: 'var(--hr-head)' }}>
                  <td className="px-4 py-2.5 sticky left-0 z-10 text-[11px] font-bold uppercase tracking-[.4px]" style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)' }}>All taxes</td>
                  {MONTHS.map((_, i) => <td key={i} className="px-1.5 py-2.5 text-center">{amounts(monthTotal(i), 'cell')}</td>)}
                  <td className="px-3 py-2.5 text-center" style={{ borderLeft: '1px solid var(--hr-line)' }}>{amounts(grand, 'total')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-t text-[11px]" style={{ borderColor: 'var(--hr-line)', color: 'var(--mid-gray)' }}>
          <span className="inline-flex items-center gap-1.5"><span className={`${chipCls} text-[10.5px]`} style={PAID}>₱</span> Paid, in the month it was paid</span>
          <span className="inline-flex items-center gap-1.5"><span className={`${chipCls} text-[10.5px]`} style={PENDING}>₱</span> Pending, in the month the RFP was raised</span>
          <span className="inline-flex items-center gap-1.5"><span style={{ color: '#c9d3cf' }}>—</span> Nothing</span>
          <span className="ml-auto" style={{ color: 'var(--hr-faint)' }}>From the tax RFPs · mark them paid in the RFP tab or each tax tab</span>
        </div>
      </div>
    </div>
  )
}
