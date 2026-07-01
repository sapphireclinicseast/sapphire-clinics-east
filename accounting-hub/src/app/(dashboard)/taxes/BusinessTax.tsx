'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Download, CheckCircle2, Trash2, RefreshCw, X, Eye, Pencil, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import { taxRfpLines, type BVLine } from '@/lib/billing-voucher'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = [{ value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const BRANCH_FULL: Record<string, string> = { SBEA: 'Aura Health Rehab — East', SBGH: 'Aura Health Rehab — Greenhills', VERDANA: 'Verdana Store' }
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)

interface Summary { outputGross: number; outputVat: number; orderCount: number; inputGross: number; inputVat: number; expenseCount: number; computedPayable: number }
interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; meta: { taxType: string; period?: { from: string; to: string } | null; vatAmount?: number } | null; createdAt: string }

// Default to the current calendar quarter.
function currentQuarter() {
  const n = new Date(), q = Math.floor(n.getUTCMonth() / 3)
  const from = new Date(Date.UTC(n.getUTCFullYear(), q * 3, 1))
  const to = new Date(Date.UTC(n.getUTCFullYear(), q * 3 + 3, 0))
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export default function BusinessTax() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')

  const [branch, setBranch] = useState('SBEA')
  const q = currentQuarter()
  const [from, setFrom] = useState(q.from)
  const [to, setTo] = useState(q.to)
  const [sum, setSum] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState('')
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [busy, setBusy] = useState(false)
  const [manualSeq, setManualSeq] = useState('')
  const [showRfpModal, setShowRfpModal] = useState(false)
  const [payTarget, setPayTarget] = useState<TaxRfp | null>(null)
  const [bv, setBv] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch: string } | null>(null)

  const [rfpSort, setRfpSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [rfpFilters, setRfpFilters] = useState<Record<string, string>>({})
  const rfpToggleSort = (k: string) => setRfpSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const rfpCols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'date', label: 'Date' },
    { key: 'period', label: 'Period' }, { key: 'grossTotal', label: 'VAT Payable' }, { key: 'status', label: 'Status' },
  ]
  const rfpGet = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'period' ? (r.meta?.period ? `${r.meta.period.from}–${r.meta.period.to}` : '') : k === 'grossTotal' ? num(r.grossTotal)
      : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'For Payment') : ''
  const shownRfps = applySortFilter(rfps, rfpGet, rfpSort.key, rfpSort.dir, rfpFilters)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/taxes/vat-summary?payrollBranch=${branch}&from=${from}&to=${to}`)
      const d = res.ok ? await res.json() : null
      setSum(d); setManual(d ? (d.computedPayable > 0 ? d.computedPayable.toFixed(2) : '0.00') : '')
    } catch { setSum(null) } finally { setLoading(false) }
  }, [branch, from, to])
  const fetchRfps = useCallback(async () => {
    try { const res = await fetch(`/api/taxes/rfp?taxType=VAT&payrollBranch=${branch}`); setRfps(res.ok ? await res.json() : []) } catch { setRfps([]) }
  }, [branch])
  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { fetchRfps() }, [fetchRfps])

  const buildPdf = (r: TaxRfp): jsPDF => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP) — Value-Added Tax', 14, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Branch: ${BRANCH_FULL[branch] || branch}`, 14, 21)
    doc.text(`BIR Form: 2550Q`, 14, 25)
    doc.text(`Ref No: ${r.refNumber}`, 120, 21)
    doc.text(`Date: ${new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, 120, 25)
    if (r.meta?.period) doc.text(`Period: ${r.meta.period.from} to ${r.meta.period.to}`, 14, 29)
    autoTable(doc, {
      startY: 33,
      head: [['Description', 'Amount']],
      body: [['VAT Payable (Output VAT less creditable Input VAT)', peso(num(r.grossTotal))]],
      foot: [['TOTAL PAYABLE', peso(num(r.grossTotal))]],
      styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } }, margin: { left: 10, right: 10 },
    })
    return doc
  }

  const generateRfp = async () => {
    const amt = num(manual)
    if (!amt || amt <= 0) { alert('Enter the VAT payable amount.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/taxes/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxType: 'VAT', payrollBranch: branch, amount: amt, period: { from, to }, manualSeq: manualSeq.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to create RFP'); return }
      try {
        const created: TaxRfp = { id: data.id, refNumber: data.refNumber, grossTotal: data.grossTotal, status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, transferRef: null, proofUrl: null, createdAt: new Date().toISOString(), meta: { taxType: 'VAT', period: { from, to }, vatAmount: amt } }
        await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, pdfData: buildPdf(created).output('datauristring') }) })
      } catch { /* best effort */ }
      setShowRfpModal(false); setManualSeq('')
      await fetchRfps()
    } finally { setBusy(false) }
  }

  const downloadPdf = async (r: TaxRfp) => {
    try { const res = await fetch(`/api/taxes/rfp?id=${r.id}`); const d = await res.json(); if (d.pdfData) { const a = document.createElement('a'); a.href = d.pdfData; a.download = `${r.refNumber}.pdf`; a.click(); return } } catch { /* fall through */ }
    buildPdf(r).save(`${r.refNumber}.pdf`)
  }
  const deleteRfp = async (r: TaxRfp) => { if (!confirm(`Delete ${r.refNumber}?`)) return; await fetch(`/api/taxes/rfp?id=${r.id}`, { method: 'DELETE' }); await fetchRfps() }

  const Card = ({ label, gross, vat, sub }: { label: string; gross: number; vat: number; sub: string }) => (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
      <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(vat)}</p>
      <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>{sub}: ₱{peso(gross)}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
        </div>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
        <button onClick={() => { fetchSummary(); fetchRfps() }} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 size={18} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></div>
      ) : sum && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card label={`Output VAT (12%) · ${sum.orderCount} product sale(s)`} gross={sum.outputGross} vat={sum.outputVat} sub="Product sales, net of platform discounts (services VAT-exempt)" />
            <Card label={`Creditable Input VAT · ${sum.expenseCount} expense(s)`} gross={sum.inputGross} vat={sum.inputVat} sub="VAT-inclusive purchases" />
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--deep-teal)', background: 'var(--pale-teal)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--deep-teal)' }}>Computed VAT Payable (Output − Input)</p>
              <p className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>₱{peso(sum.computedPayable)}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--deep-teal)' }}>Estimate — confirm against 2550Q before filing.</p>
            </div>
          </div>

          {canWrite && (
            <div className="rounded-2xl border bg-white p-4 flex items-end gap-3 flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Final VAT payable (keyed by accountant)</label>
                <input value={manual} onChange={e => setManual(e.target.value)} inputMode="decimal" className="px-3 py-2 rounded-xl border text-sm font-mono" style={{ borderColor: 'var(--light-gray)', minWidth: 180 }} />
              </div>
              <button onClick={() => setShowRfpModal(true)} disabled={!num(manual)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#c44b00' }}>Generate VAT RFP</button>
            </div>
          )}
        </>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>VAT RFPs</p>
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={rfpCols} sortKey={rfpSort.key} sortDir={rfpSort.dir} filters={rfpFilters} onToggleSort={rfpToggleSort} onFilter={(k, v) => setRfpFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shownRfps.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.meta?.period ? `${r.meta.period.from} – ${r.meta.period.to}` : ''}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{r.status === 'PAID' ? 'Paid' : 'For Payment'}</span>{r.status === 'PAID' && r.paidAt && <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{new Date(r.paidAt).toLocaleDateString('en-PH')}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}</div>}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => downloadPdf(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Download size={13} /> PDF</button>
                    <button onClick={() => setBv({ refNumber: r.refNumber, date: new Date(r.createdAt).toLocaleDateString("en-PH"), lines: taxRfpLines(r.meta, num(r.grossTotal)), branch })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><FileText size={13} /> Billing Voucher</button>
                    {r.proofUrl && <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={13} /> Proof</a>}
                    {canWrite && r.status !== 'PAID' && <button onClick={() => setPayTarget(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}><CheckCircle2 size={13} /> Record as Paid</button>}
                    {canWrite && r.status === 'PAID' && <button onClick={() => setPayTarget(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Pencil size={13} /> Edit</button>}
                    {canWrite && <button onClick={() => deleteRfp(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}><Trash2 size={13} /></button>}
                  </td>
                </tr>
              ))}
              {shownRfps.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>{rfps.length === 0 ? 'No VAT RFPs yet.' : 'No RFPs match the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showRfpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRfpModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate VAT RFP</h2><button onClick={() => setShowRfpModal(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>VAT payable <strong>₱{peso(num(manual))}</strong> for {from} – {to} (BIR 2550Q).</p>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>RFP Number (optional)</label>
            <p className="text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>From your pre-printed form. Leave blank to auto-number. Keep leading zeros.</p>
            <input value={manualSeq} onChange={e => setManualSeq(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 000007" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={generateRfp} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Generate RFP'}</button>
          </div>
        </div>
      )}
      {payTarget && <RecordPaidModal rfp={payTarget} onClose={() => setPayTarget(null)} onSaved={async () => { setPayTarget(null); await fetchRfps() }} />}
      {bv && <BillingVoucherModal refNumber={bv.refNumber} date={bv.date} lines={bv.lines} branch={bv.branch} onClose={() => setBv(null)} />}
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
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save payment'}</button>
          {rfp.status === 'PAID' && <button onClick={unpay} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Unpay</button>}
        </div>
      </div>
    </div>
  )
}
