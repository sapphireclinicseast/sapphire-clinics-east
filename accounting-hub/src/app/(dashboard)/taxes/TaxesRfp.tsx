'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Download, CheckCircle2, Trash2, RefreshCw, X, Eye, Pencil, FileText } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import { taxRfpLines, type BVLine , type RfpMemoParts } from '@/lib/billing-voucher'

const TAX_PURPOSE: Record<string, string> = {
  WC: 'remittance of Withholding Tax on Compensation',
  EWT: 'remittance of Expanded Withholding Tax',
  VAT: 'remittance of Value-Added Tax',
  IT: 'payment of Corporate Income Tax',
}

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = [{ value: '', label: 'All' }, { value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)
const TYPE_LABEL: Record<string, string> = { WC: 'Withholding — Compensation', EWT: 'Expanded Withholding (EWT)', VAT: 'Value-Added Tax' }

interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; payableTo: string | null; meta: { taxType?: string; payrollBranch?: string } | null; createdAt: string }

const typeOf = (r: TaxRfp) => r.meta?.taxType || (r.refNumber.endsWith('-WC') ? 'WC' : r.refNumber.endsWith('-EWT') ? 'EWT' : r.refNumber.endsWith('-VAT') ? 'VAT' : '')

export default function TaxesRfp() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')
  const [branch, setBranch] = useState('')
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [payTarget, setPayTarget] = useState<TaxRfp | null>(null)
  const [bv, setBv] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch: string ; payment?: RfpMemoParts } | null>(null)

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'type', label: 'Tax Type' }, { key: 'date', label: 'Date' },
    { key: 'payableTo', label: 'Payable to' }, { key: 'grossTotal', label: 'Amount' }, { key: 'status', label: 'Status' },
  ]
  const get = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber : k === 'type' ? (TYPE_LABEL[typeOf(r)] || typeOf(r)) : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'payableTo' ? (r.payableTo || '') : k === 'grossTotal' ? num(r.grossTotal) : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'For Payment') : ''
  const shown = applySortFilter(rfps, get, sort.key, sort.dir, filters)

  const fetchRfps = useCallback(async () => {
    try { const res = await fetch(`/api/taxes/rfp?all=1${branch ? `&payrollBranch=${branch}` : ''}`); setRfps(res.ok ? await res.json() : []) } catch { setRfps([]) }
  }, [branch])

  const savePayable = async (rfp: TaxRfp, value: string) => {
    const v = value.trim()
    if ((rfp.payableTo || '') === v) return
    setRfps(prev => prev.map(x => x.id === rfp.id ? { ...x, payableTo: v || null } : x))
    try { await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'set-payable', payableTo: v }) }) } catch { /* ignore */ }
  }
  useEffect(() => { fetchRfps() }, [fetchRfps])

  const downloadPdf = async (r: TaxRfp) => {
    try { const res = await fetch(`/api/taxes/rfp?id=${r.id}`); const d = await res.json(); if (d.pdfData) { const a = document.createElement('a'); a.href = d.pdfData; a.download = `${r.refNumber}.pdf`; a.click() } else alert('No stored PDF for this RFP.') } catch { alert('Could not load PDF.') }
  }
  const deleteRfp = async (r: TaxRfp) => { if (!confirm(`Delete ${r.refNumber}? Its items return to "unremitted".`)) return; await fetch(`/api/taxes/rfp?id=${r.id}`, { method: 'DELETE' }); await fetchRfps() }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
        </div>
        <button onClick={fetchRfps} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>All tax RFPs (Withholding on Compensation, EWT, VAT) — same numbering series as petty cash & expense RFPs.</p>
      </div>
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing />
          <tbody>
            {shown.map(r => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{TYPE_LABEL[typeOf(r)] || typeOf(r)}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                <td className="px-4 py-2.5">
                  {canWrite ? (
                    <input defaultValue={r.payableTo || ''} placeholder="Payable to…" onBlur={e => savePayable(r, e.target.value)}
                      className="w-36 px-2 py-1 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                  ) : <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{r.payableTo || '—'}</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{r.status === 'PAID' ? 'Paid' : 'For Payment'}</span>{r.status === 'PAID' && r.paidAt && <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{new Date(r.paidAt).toLocaleDateString('en-PH')}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}</div>}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => downloadPdf(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Download size={13} /> PDF</button>
                  <button onClick={() => setBv({ refNumber: r.refNumber, date: new Date(r.createdAt).toLocaleDateString('en-PH'), lines: taxRfpLines(r.meta, num(r.grossTotal)), branch: r.meta?.payrollBranch || branch, payment: { payee: r.payableTo || 'Bureau of Internal Revenue', purpose: TAX_PURPOSE[r.meta?.taxType || ''] || 'tax remittance', paymentMode: r.paymentMethod || '', reference: r.transferRef || r.checkNumber || '' } })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><FileText size={13} /> Billing Voucher</button>
                  {r.proofUrl && <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={13} /> Proof</a>}
                  {canWrite && r.status !== 'PAID' && <button onClick={() => setPayTarget(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}><CheckCircle2 size={13} /> Record as Paid</button>}
                  {canWrite && r.status === 'PAID' && <button onClick={() => setPayTarget(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Pencil size={13} /> Edit</button>}
                  {canWrite && <button onClick={() => deleteRfp(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}><Trash2 size={13} /></button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{rfps.length === 0 ? 'No tax RFPs yet.' : 'No RFPs match the current filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {payTarget && <RecordPaidModal rfp={payTarget} onClose={() => setPayTarget(null)} onSaved={async () => { setPayTarget(null); await fetchRfps() }} />}
      {bv && <BillingVoucherModal refNumber={bv.refNumber} date={bv.date} lines={bv.lines} branch={bv.branch} payment={bv.payment} preparedBy={session?.user?.name || ''} onClose={() => setBv(null)} />}
    </div>
  )
}

function RecordPaidModal({ rfp, onClose, onSaved }: { rfp: TaxRfp; onClose: () => void; onSaved: () => void }) {
  const [datePaid, setDatePaid] = useState(rfp.paidAt ? String(rfp.paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState(rfp.paymentMethod || 'Online Fund Transfer')
  const [checkNumber, setCheckNumber] = useState(rfp.checkNumber || '')
  const [transferRef, setTransferRef] = useState(rfp.transferRef || '')
  const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); try { await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'pay', datePaid, paymentMethod: method, checkNumber: checkNumber || null, transferRef: transferRef || null }) }); onSaved() } finally { setBusy(false) } }
  const unpay = async () => { setBusy(true); try { await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'unpay' }) }); onSaved() } finally { setBusy(false) } }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Tax Payment</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{rfp.refNumber} · ₱{(typeof rfp.grossTotal === 'number' ? rfp.grossTotal : parseFloat(rfp.grossTotal)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment date</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}><option>Online Fund Transfer</option><option>Check</option><option>Cash</option></select>
        {method === 'Check' && <><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Check number</label><input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} /></>}
        {method === 'Online Fund Transfer' && <><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Reference number</label><input value={transferRef} onChange={e => setTransferRef(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} /></>}
        <div className="flex gap-2 mt-2">
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? 'Saving…' : 'Save payment'}</button>
          {rfp.status === 'PAID' && <button onClick={unpay} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Unpay</button>}
        </div>
      </div>
    </div>
  )
}
