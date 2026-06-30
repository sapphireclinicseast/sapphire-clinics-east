'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BRANCHES = [{ value: '', label: 'All' }, { value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)
const TYPES: { key: string; label: string }[] = [
  { key: 'WC', label: 'Withholding — Compensation' }, { key: 'EWT', label: 'Expanded Withholding (EWT)' }, { key: 'VAT', label: 'Value-Added Tax' },
]

interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; meta: { taxType?: string } | null; createdAt: string }
const typeOf = (r: TaxRfp) => r.meta?.taxType || (r.refNumber.endsWith('-WC') ? 'WC' : r.refNumber.endsWith('-EWT') ? 'EWT' : r.refNumber.endsWith('-VAT') ? 'VAT' : '')

export default function TaxesPaid() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState('')
  const [rfps, setRfps] = useState<TaxRfp[]>([])

  const fetchRfps = useCallback(async () => {
    try { const res = await fetch(`/api/taxes/rfp?all=1${branch ? `&payrollBranch=${branch}` : ''}`); setRfps(res.ok ? await res.json() : []) } catch { setRfps([]) }
  }, [branch])
  useEffect(() => { fetchRfps() }, [fetchRfps])

  // cell[type][month] = { paid, pending } totals. A paid RFP sits in its paidAt
  // month; an unpaid one in its createdAt month.
  const grid = useMemo(() => {
    const g: Record<string, { paid: number; pending: number }[]> = {}
    for (const t of TYPES) g[t.key] = Array.from({ length: 12 }, () => ({ paid: 0, pending: 0 }))
    for (const r of rfps) {
      const t = typeOf(r); if (!g[t]) continue
      const paid = r.status === 'PAID'
      const d = new Date(paid && r.paidAt ? r.paidAt : r.createdAt)
      if (d.getUTCFullYear() !== year) continue
      const cell = g[t][d.getUTCMonth()]
      if (paid) cell.paid += num(r.grossTotal); else cell.pending += num(r.grossTotal)
    }
    return g
  }, [rfps, year])

  const years: number[] = []
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) years.push(y)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        <button onClick={fetchRfps} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
        <div className="flex items-center gap-3 ml-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#dcfce7' }} /> Paid</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#fef3c7' }} /> Pending</span>
        </div>
      </div>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10">
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="border-r border-b px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>Tax Type</th>
              {MONTHS.map(m => <th key={m} className="border-r border-b px-2 py-2 text-center font-semibold" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)', minWidth: 78 }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {TYPES.map(t => (
              <tr key={t.key} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="border-r border-b px-3 py-2 font-semibold whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{t.label}</td>
                {grid[t.key].map((c, i) => {
                  const has = c.paid > 0 || c.pending > 0
                  const bg = !has ? 'transparent' : c.pending > 0 ? '#fef3c7' : '#dcfce7'
                  const color = c.pending > 0 ? '#92400e' : '#166534'
                  return (
                    <td key={i} className="border-r border-b px-2 py-2 text-center" style={{ borderColor: 'var(--light-gray)', background: bg }}>
                      {has ? (
                        <div style={{ color }}>
                          {c.paid > 0 && <div className="font-semibold">₱{peso(c.paid)}</div>}
                          {c.pending > 0 && <div className="text-[10px]">pending ₱{peso(c.pending)}</div>}
                        </div>
                      ) : <span style={{ color: 'var(--light-gray)' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Driven by the tax RFPs: a paid RFP appears in the month it was paid; an unpaid RFP shows as pending in the month it was raised. Mark RFPs paid in the RFP tab or each tax tab.</p>
    </div>
  )
}
