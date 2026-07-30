'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Eye, ChevronRight } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { DownloadBar } from '@/components/DownloadBar'
import { downloadXlsx, downloadPdf, inDateRange, type ExportFormat } from '@/lib/export'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = [{ value: '', label: 'All' }, { value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)
const TYPE_LABEL: Record<string, string> = { WC: 'Withholding — Compensation', EWT: 'Expanded Withholding (EWT)', VAT: 'Value-Added Tax', IT: 'Corporate Income Tax' }

// WC items carry gross/tax, EWT items carry base/rate/ewt; VAT & IT RFPs are
// single-amount filings with no per-person items.
interface RfpItem { id: string; source?: string; name: string; period: string; gross?: number; tax?: number; base?: number; rate?: number | null; ewt?: number }
interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; payableTo: string | null; filingStatus: string | null; meta: { taxType?: string; items?: RfpItem[] } | null; createdAt: string }
const typeOf = (r: TaxRfp) => r.meta?.taxType || (r.refNumber.match(/-(WC|EWT|VAT|IT)$/)?.[1] ?? '')
const itemsOf = (r: TaxRfp) => (Array.isArray(r.meta?.items) ? r.meta!.items! : [])
const itemBase = (i: RfpItem) => num(i.base ?? i.gross ?? 0)
const itemTax = (i: RfpItem) => num(i.ewt ?? i.tax ?? 0)
const taxBaseOf = (r: TaxRfp) => itemsOf(r).reduce((s, i) => s + itemBase(i), 0)

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
    { key: 'paidAt', label: 'Date Paid' }, { key: 'taxBase', label: 'Tax Base' }, { key: 'grossTotal', label: 'Amount' },
    { key: 'paymentMethod', label: 'Payment Method' }, { key: 'filing', label: 'Filing' },
  ]
  const get = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber : k === 'type' ? (TYPE_LABEL[typeOf(r)] || typeOf(r))
      : k === 'payableTo' ? (r.payableTo || '') : k === 'paidAt' ? (r.paidAt ? String(r.paidAt).slice(0, 10) : '')
      : k === 'taxBase' ? taxBaseOf(r) : k === 'grossTotal' ? num(r.grossTotal) : k === 'paymentMethod' ? (r.paymentMethod || '')
      : k === 'filing' ? (r.filingStatus === 'FILED' ? 'Filed' : 'For Filing') : ''
  const shown = applySortFilter(rfps.filter(r => r.status === 'PAID' && inDateRange(r.paidAt, from, to)), get, sort.key, sort.dir, filters)
  const total = shown.reduce((s, r) => s + num(r.grossTotal), 0)
  const totalBase = shown.reduce((s, r) => s + taxBaseOf(r), 0)

  // Click a row to expand it into the individuals bundled in that RFP.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

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
    const headers = ['Reference Number', 'Tax Type', 'Payable to', 'Date Paid', 'Tax Base', 'Amount', 'Payment Method', 'Filing']
    const body = shown.map(r => [r.refNumber, TYPE_LABEL[typeOf(r)] || typeOf(r), r.payableTo || '', r.paidAt ? String(r.paidAt).slice(0, 10) : '', itemsOf(r).length ? taxBaseOf(r).toFixed(2) : '', num(r.grossTotal).toFixed(2), r.paymentMethod || '', r.filingStatus === 'FILED' ? 'Filed' : 'For Filing'])
    if (fmt === 'xlsx') {
      // Second sheet: the individuals behind every RFP in range, for filing.
      const detailHeaders = ['RFP Reference', 'Name', 'Period', 'Tax Base', 'Rate', 'Tax Withheld']
      const detailRows = shown.flatMap(r => itemsOf(r).map(i => [r.refNumber, i.name, i.period || '', itemBase(i).toFixed(2), i.rate != null ? `${i.rate}%` : '', itemTax(i).toFixed(2)]))
      downloadXlsx('taxes-report', [{ name: 'Taxes Report', headers, rows: body }, { name: 'Individuals', headers: detailHeaders, rows: detailRows }])
    } else downloadPdf({ title: 'Taxes Report — Paid', subtitle: `Range: ${from || 'start'} → ${to || 'end'} · ${body.length} payment(s) · base ₱${peso(totalBase)} · tax ₱${peso(total)}`, headers, rows: body, landscape: true })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
        </div>
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Paid taxes. {shown.length} payment(s) · tax base ₱{peso(totalBase)} · tax ₱{peso(total)} · click a row for its individuals</p>
      </div>
      <DownloadBar from={from} to={to} onFrom={setFrom} onTo={setTo} onExport={exportRep} dateLabel="Date paid" note={`${shown.length} in range`} />
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing />
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.map(r => {
              const its = itemsOf(r)
              const isOpen = expanded.has(r.id)
              return (
                <Fragment key={r.id}>
                  <tr className={`border-t${its.length ? ' cursor-pointer hover:bg-gray-50' : ''}`} style={{ borderColor: 'var(--light-gray)' }}
                    onClick={its.length ? () => toggleExpand(r.id) : undefined}
                    title={its.length ? 'Click to show the individuals in this RFP' : undefined}>
                    <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                      {its.length > 0 && <ChevronRight size={13} className="inline mr-1 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, color: 'var(--mid-gray)' }} />}
                      {r.refNumber}
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{TYPE_LABEL[typeOf(r)] || typeOf(r)}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{r.payableTo || '—'}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-PH') : ''}</td>
                    <td className="px-3 py-2.5 text-right text-xs" style={{ color: 'var(--charcoal)' }}>{its.length ? `₱${peso(taxBaseOf(r))}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.paymentMethod || ''}{r.checkNumber ? ` · ${r.checkNumber}` : r.transferRef ? ` · ${r.transferRef}` : ''}</td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      {canWrite ? (
                        <select value={r.filingStatus || 'FOR_FILING'} onChange={e => setFiling(r.id, e.target.value)} className="px-2 py-1 rounded-lg border text-[11px] font-semibold" style={{ borderColor: 'var(--light-gray)', color: r.filingStatus === 'FILED' ? '#166534' : '#92400e' }}>
                          <option value="FOR_FILING">For Filing</option>
                          <option value="FILED">Filed</option>
                        </select>
                      ) : <span className="text-[11px]" style={{ color: r.filingStatus === 'FILED' ? '#166534' : '#92400e' }}>{r.filingStatus === 'FILED' ? 'Filed' : 'For Filing'}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {r.proofUrl && <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={12} /> Proof</a>}
                    </td>
                  </tr>
                  {isOpen && its.length > 0 && (
                    <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td colSpan={9} className="px-6 py-3" style={{ background: 'var(--off-white)' }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ color: 'var(--mid-gray)' }}>
                              <th className="text-left py-1 pr-3 font-semibold">Name</th>
                              <th className="text-left py-1 pr-3 font-semibold">Period</th>
                              <th className="text-right py-1 pr-3 font-semibold">Tax Base</th>
                              <th className="text-right py-1 pr-3 font-semibold">Rate</th>
                              <th className="text-right py-1 font-semibold">Tax Withheld</th>
                            </tr>
                          </thead>
                          <tbody>
                            {its.map((i, idx) => (
                              <tr key={`${i.id}-${idx}`} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                <td className="py-1 pr-3" style={{ color: 'var(--charcoal)' }}>{i.name}</td>
                                <td className="py-1 pr-3" style={{ color: 'var(--mid-gray)' }}>{i.period || ''}</td>
                                <td className="py-1 pr-3 text-right" style={{ color: 'var(--charcoal)' }}>₱{peso(itemBase(i))}</td>
                                <td className="py-1 pr-3 text-right" style={{ color: 'var(--mid-gray)' }}>{i.rate != null ? `${i.rate}%` : ''}</td>
                                <td className="py-1 text-right font-semibold" style={{ color: '#c44b00' }}>₱{peso(itemTax(i))}</td>
                              </tr>
                            ))}
                            <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="py-1 pr-3 font-semibold" style={{ color: 'var(--charcoal)' }}>TOTAL · {its.length} individual{its.length === 1 ? '' : 's'}</td>
                              <td />
                              <td className="py-1 pr-3 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(taxBaseOf(r))}</td>
                              <td />
                              <td className="py-1 text-right font-semibold" style={{ color: '#c44b00' }}>₱{peso(its.reduce((s, i) => s + itemTax(i), 0))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!loading && shown.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No paid taxes in range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
