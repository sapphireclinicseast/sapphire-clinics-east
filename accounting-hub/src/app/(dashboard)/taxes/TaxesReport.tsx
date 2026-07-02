'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Eye } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { DownloadBar } from '@/components/DownloadBar'
import { downloadXlsx, downloadPdf, inDateRange, type ExportFormat } from '@/lib/export'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = [{ value: '', label: 'All' }, { value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)
const TYPE_LABEL: Record<string, string> = { WC: 'Withholding — Compensation', EWT: 'Expanded Withholding (EWT)', VAT: 'Value-Added Tax', IT: 'Corporate Income Tax' }

interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; payableTo: string | null; filingStatus: string | null; meta: { taxType?: string } | null; createdAt: string }
const typeOf = (r: TaxRfp) => r.meta?.taxType || (r.refNumber.match(/-(WC|EWT|VAT|IT)$/)?.[1] ?? '')

// Paid taxes report — mirrors the Expense Report format (From/To, Excel/PDF, filing toggle).
export default function TaxesReport() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')
  const [branch, setBranch] = useState('')
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'paidAt', dir: 'desc' })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'type', label: 'Tax Type' }, { key: 'payableTo', label: 'Payable to' },
    { key: 'paidAt', label: 'Date Paid' }, { key: 'grossTotal', label: 'Amount' }, { key: 'paymentMethod', label: 'Payment Method' }, { key: 'filing', label: 'Filing' },
  ]
  const get = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber : k === 'type' ? (TYPE_LABEL[typeOf(r)] || typeOf(r))
      : k === 'payableTo' ? (r.payableTo || '') : k === 'paidAt' ? (r.paidAt ? String(r.paidAt).slice(0, 10) : '')
      : k === 'grossTotal' ? num(r.grossTotal) : k === 'paymentMethod' ? (r.paymentMethod || '')
      : k === 'filing' ? (r.filingStatus === 'FILED' ? 'Filed' : 'For Filing') : ''
  const shown = applySortFilter(rfps.filter(r => r.status === 'PAID' && inDateRange(r.paidAt, from, to)), get, sort.key, sort.dir, filters)
  const total = shown.reduce((s, r) => s + num(r.grossTotal), 0)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch(`/api/taxes/rfp?all=1${branch ? `&payrollBranch=${branch}` : ''}`); setRfps(res.ok ? await res.json() : []) }
    catch { setRfps([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])

  const setFiling = async (id: string, filingStatus: string) => {
    setRfps(prev => prev.map(r => r.id === id ? { ...r, filingStatus } : r))
    try { await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'set-filing', filingStatus }) }) } catch { /* ignore */ }
  }

  const exportRep = (fmt: ExportFormat) => {
    const headers = ['Reference Number', 'Tax Type', 'Payable to', 'Date Paid', 'Amount', 'Payment Method', 'Filing']
    const body = shown.map(r => [r.refNumber, TYPE_LABEL[typeOf(r)] || typeOf(r), r.payableTo || '', r.paidAt ? String(r.paidAt).slice(0, 10) : '', num(r.grossTotal).toFixed(2), r.paymentMethod || '', r.filingStatus === 'FILED' ? 'Filed' : 'For Filing'])
    if (fmt === 'xlsx') downloadXlsx('taxes-report', [{ name: 'Taxes Report', headers, rows: body }])
    else downloadPdf({ title: 'Taxes Report — Paid', subtitle: `Range: ${from || 'start'} → ${to || 'end'} · ${body.length} payment(s) · ₱${peso(total)}`, headers, rows: body, landscape: true })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
        </div>
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Paid taxes. {shown.length} payment(s) · ₱{peso(total)}</p>
      </div>
      <DownloadBar from={from} to={to} onFrom={setFrom} onTo={setTo} onExport={exportRep} dateLabel="Date paid" note={`${shown.length} in range`} />
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing />
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.map(r => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{TYPE_LABEL[typeOf(r)] || typeOf(r)}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{r.payableTo || '—'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-PH') : ''}</td>
                <td className="px-3 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.paymentMethod || ''}{r.checkNumber ? ` · ${r.checkNumber}` : r.transferRef ? ` · ${r.transferRef}` : ''}</td>
                <td className="px-3 py-2.5">
                  {canWrite ? (
                    <select value={r.filingStatus || 'FOR_FILING'} onChange={e => setFiling(r.id, e.target.value)} className="px-2 py-1 rounded-lg border text-[11px] font-semibold" style={{ borderColor: 'var(--light-gray)', color: r.filingStatus === 'FILED' ? '#166534' : '#92400e' }}>
                      <option value="FOR_FILING">For Filing</option>
                      <option value="FILED">Filed</option>
                    </select>
                  ) : <span className="text-[11px]" style={{ color: r.filingStatus === 'FILED' ? '#166534' : '#92400e' }}>{r.filingStatus === 'FILED' ? 'Filed' : 'For Filing'}</span>}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {r.proofUrl && <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={12} /> Proof</a>}
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No paid taxes in range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
