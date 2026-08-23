'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Download, CheckCircle2, Trash2, RefreshCw, X, Eye, Pencil, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import { taxRfpLines, type BVLine , type RfpMemoParts } from '@/lib/billing-voucher'
import { useRfpOtherFees, RfpOtherFeesSection, type CleanRfpFee } from '@/components/RfpOtherFees'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
// Corporate income tax is filed as one entity; default combined, file under East.
const BRANCHES = [{ value: 'ALL', label: 'All Branches' }, { value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)

interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; payableTo: string | null; meta: { taxType: string; period?: { from: string; to: string } | null; itAmount?: number; otherFees?: CleanRfpFee[]; feesTotal?: number } | null; createdAt: string }

export default function IncomeTaxCorporate() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')
  const yr = new Date().getFullYear()

  const [branch, setBranch] = useState('ALL')
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(`${yr}-01-01`)
  const [to, setTo] = useState(`${yr}-12-31`)
  const [manualSeq, setManualSeq] = useState('')
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [busy, setBusy] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const otherFees = useRfpOtherFees()
  const [payTarget, setPayTarget] = useState<TaxRfp | null>(null)
  const [bv, setBv] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch: string ; payment?: RfpMemoParts } | null>(null)

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'date', label: 'Date' }, { key: 'payableTo', label: 'Payable to' },
    { key: 'period', label: 'Period' }, { key: 'grossTotal', label: 'Income Tax Payable' }, { key: 'status', label: 'Status' },
  ]
  const get = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'payableTo' ? (r.payableTo || '') : k === 'period' ? (r.meta?.period ? `${r.meta.period.from}–${r.meta.period.to}` : '')
      : k === 'grossTotal' ? num(r.grossTotal) : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'For Payment') : ''
  const shown = applySortFilter(rfps, get, sort.key, sort.dir, filters)

  const fetchRfps = useCallback(async () => {
    try { const res = await fetch(`/api/taxes/rfp?taxType=IT${branch === 'ALL' ? '' : `&payrollBranch=${branch}`}`); setRfps(res.ok ? await res.json() : []) } catch { setRfps([]) }
  }, [branch])
  useEffect(() => { fetchRfps() }, [fetchRfps])

  const buildPdf = (r: TaxRfp): jsPDF => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP) — Corporate Income Tax', 14, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text('BIR Form: 1702', 14, 21)
    doc.text(`Ref No: ${r.refNumber}`, 120, 21)
    doc.text(`Date: ${new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, 120, 25)
    if (r.meta?.period) doc.text(`Period: ${r.meta.period.from} to ${r.meta.period.to}`, 14, 25)
    const fees = r.meta?.otherFees || []
    const feesTotal = fees.reduce((s, f) => s + f.grossAmount, 0)
    autoTable(doc, {
      startY: 31, head: [['Description', 'Amount']],
      body: [
        ['Corporate Income Tax Payable', peso(r.meta?.itAmount ?? (num(r.grossTotal) - feesTotal))],
        ...fees.map(f => [`Other fee — ${f.description || f.requestor || 'Fee'}`, peso(f.grossAmount)]),
      ],
      foot: [['TOTAL PAYABLE', peso(num(r.grossTotal))]],
      styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } }, margin: { left: 10, right: 10 },
    })
    return doc
  }

  const generateRfp = async () => {
    const amt = num(amount)
    if (!amt || amt <= 0) { alert('Enter the income tax payable amount.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/taxes/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxType: 'IT', payrollBranch: branch === 'ALL' ? 'SBEA' : branch, amount: amt, period: { from, to }, manualSeq: manualSeq.trim() || undefined, otherFees: otherFees.cleaned() }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to create RFP'); return }
      try {
        const created: TaxRfp = { id: data.id, refNumber: data.refNumber, grossTotal: data.grossTotal, status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, transferRef: null, proofUrl: null, payableTo: 'Bureau of Internal Revenue', createdAt: new Date().toISOString(), meta: { taxType: 'IT', period: { from, to }, itAmount: amt, otherFees: otherFees.cleaned(), feesTotal: otherFees.feesTotal } }
        await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, pdfData: buildPdf(created).output('datauristring') }) })
      } catch { /* best effort */ }
      setShowModal(false); setManualSeq(''); setAmount('')
      await fetchRfps()
    } finally { setBusy(false) }
  }

  const downloadPdf = async (r: TaxRfp) => {
    try { const res = await fetch(`/api/taxes/rfp?id=${r.id}`); const d = await res.json(); if (d.pdfData) { const a = document.createElement('a'); a.href = d.pdfData; a.download = `${r.refNumber}.pdf`; a.click(); return } } catch { /* fall through */ }
    buildPdf(r).save(`${r.refNumber}.pdf`)
  }
  const deleteRfp = async (r: TaxRfp) => { if (!confirm(`Delete ${r.refNumber}?`)) return; await fetch(`/api/taxes/rfp?id=${r.id}`, { method: 'DELETE' }); await fetchRfps() }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
        </div>
        <button onClick={fetchRfps} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Corporate Income Tax (BIR 1702) — filed as one corporation. Record the payable and raise an RFP; paid ones show in Taxes Paid / Taxes Report.</p>
      </div>

      {canWrite && (
        <div className="rounded-2xl border bg-white p-4 flex items-end gap-3 flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Period from <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>to <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Income tax payable</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="px-3 py-2 rounded-xl border text-sm font-mono" style={{ borderColor: 'var(--light-gray)', minWidth: 180 }} />
          </div>
          <button onClick={() => { otherFees.loadTemplate(branch === 'ALL' ? 'SBEA' : branch); setShowModal(true) }} disabled={!num(amount)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#c44b00' }}>Generate Income Tax RFP</button>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Income Tax RFPs</p>
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{r.payableTo || 'Bureau of Internal Revenue'}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.meta?.period ? `${r.meta.period.from} – ${r.meta.period.to}` : ''}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{r.status === 'PAID' ? 'Paid' : 'For Payment'}</span>{r.status === 'PAID' && r.paidAt && <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{new Date(r.paidAt).toLocaleDateString('en-PH')}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}</div>}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => downloadPdf(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Download size={13} /> PDF</button>
                    <button onClick={() => setBv({ refNumber: r.refNumber, date: new Date(r.createdAt).toLocaleDateString('en-PH'), lines: taxRfpLines(r.meta, num(r.grossTotal)), branch , payment: { payee: r.payableTo || 'Bureau of Internal Revenue', purpose: 'payment of Corporate Income Tax', paymentMode: r.paymentMethod || '', reference: r.transferRef || r.checkNumber || '' } })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><FileText size={13} /> Billing Voucher</button>
                    {r.proofUrl && <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={13} /> Proof</a>}
                    {canWrite && r.status !== 'PAID' && <button onClick={() => setPayTarget(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}><CheckCircle2 size={13} /> Record as Paid</button>}
                    {canWrite && r.status === 'PAID' && <button onClick={() => setPayTarget(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Pencil size={13} /> Edit</button>}
                    {canWrite && <button onClick={() => deleteRfp(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}><Trash2 size={13} /></button>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>{rfps.length === 0 ? 'No income tax RFPs yet.' : 'No RFPs match the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate Income Tax RFP</h2><button onClick={() => setShowModal(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>Income tax payable <strong>₱{peso(num(amount))}</strong>{otherFees.feesTotal > 0 && <> · fees <strong>₱{peso(otherFees.feesTotal)}</strong> · total <strong>₱{peso(num(amount) + otherFees.feesTotal)}</strong></>} for {from} – {to} (BIR 1702).</p>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>RFP Number (optional)</label>
            <p className="text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>From your pre-printed form. Leave blank to auto-number. Keep leading zeros.</p>
            <input value={manualSeq} onChange={e => setManualSeq(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 000007" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
            <RfpOtherFeesSection state={otherFees} branch={branch === 'ALL' ? 'SBEA' : branch} />
            <button onClick={generateRfp} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 mt-1" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : `Generate RFP · ₱${peso(num(amount) + otherFees.feesTotal)}`}</button>
          </div>
        </div>
      )}
      {payTarget && <ITRecordPaidModal rfp={payTarget} onClose={() => setPayTarget(null)} onSaved={async () => { setPayTarget(null); await fetchRfps() }} />}
      {bv && <BillingVoucherModal refNumber={bv.refNumber} date={bv.date} lines={bv.lines} branch={bv.branch} payment={bv.payment} preparedBy={session?.user?.name || ''} onClose={() => setBv(null)} />}
    </div>
  )
}

function ITRecordPaidModal({ rfp, onClose, onSaved }: { rfp: TaxRfp; onClose: () => void; onSaved: () => void }) {
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
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Income Tax Payment</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{rfp.refNumber} · ₱{(typeof rfp.grossTotal === 'number' ? rfp.grossTotal : parseFloat(rfp.grossTotal)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment date</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}><option>Online Fund Transfer</option><option>Check</option><option>Cash</option></select>
        {method === 'Check' && <><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Check number</label><input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} /></>}
        {method === 'Online Fund Transfer' && <><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Reference number</label><input value={transferRef} onChange={e => setTransferRef(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} /></>}
        <div className="flex gap-2 mt-2">
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save payment'}</button>
          {rfp.status === 'PAID' && <button onClick={unpay} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Unpay</button>}
        </div>
      </div>
    </div>
  )
}
