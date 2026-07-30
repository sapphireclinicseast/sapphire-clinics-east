'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, FileText, Download, CheckCircle2, Trash2, RefreshCw, X, Eye, Pencil } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import { taxRfpLines, type BVLine } from '@/lib/billing-voucher'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BRANCHES = [{ value: 'SBEA', label: 'East' }, { value: 'SBGH', label: 'Greenhills' }, { value: 'VERDANA', label: 'Verdana' }]
const BRANCH_FULL: Record<string, string> = { SBEA: 'Aura Health Rehab — East', SBGH: 'Aura Health Rehab — Greenhills', VERDANA: 'Verdana Store' }
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cutoffLabel = (p: string) => { const [y, m, h] = p.split('-'); return `${MONTHS[parseInt(m) - 1]} ${y} — ${h === '1' ? '1st' : '2nd'} cutoff` }
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)

interface Entry { payrollEntryId: string; consultantName: string; department: string; branch: string; cutoffPeriod: string; grossPay: number; taxAmount: number; netPay: number; taxRemitted: boolean; status: string }
interface MetaItem { id: string; name: string; period: string; gross: number; tax: number }
interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; meta: { taxType: string; payrollBranch: string; items: MetaItem[] } | null; createdAt: string }

export default function WithholdingCompensation() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')

  const [branch, setBranch] = useState('SBEA')
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState('') // '' = all
  const [monthTo, setMonthTo] = useState('') // optional range end — '' = single month
  const [showRemitted, setShowRemitted] = useState(false)

  const [entries, setEntries] = useState<Entry[]>([])
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [showRfpModal, setShowRfpModal] = useState(false)
  const [manualSeq, setManualSeq] = useState('')
  const [busy, setBusy] = useState(false)
  const [payTarget, setPayTarget] = useState<TaxRfp | null>(null)
  const [bv, setBv] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch: string } | null>(null)

  // RFP list sort/filter
  const [rfpSort, setRfpSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [rfpFilters, setRfpFilters] = useState<Record<string, string>>({})
  const rfpToggleSort = (k: string) => setRfpSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const rfpCols = [
    { key: 'refNumber', label: 'Reference Number' },
    { key: 'date', label: 'Date' },
    { key: 'count', label: 'Employees' },
    { key: 'grossTotal', label: 'Tax Total' },
    { key: 'status', label: 'Status' },
  ]
  const rfpGet = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber
      : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'count' ? (r.meta?.items?.length || 0)
      : k === 'grossTotal' ? num(r.grossTotal)
      : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'For Payment')
      : ''
  const shownRfps = applySortFilter(rfps, rfpGet, rfpSort.key, rfpSort.dir, rfpFilters)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll/tax-payable?payrollType=EMPLOYEE&branch=${branch}`)
      setEntries(res.ok ? await res.json() : [])
    } catch { setEntries([]) } finally { setLoading(false) }
  }, [branch])

  const fetchRfps = useCallback(async () => {
    try {
      const res = await fetch(`/api/taxes/rfp?taxType=WC&payrollBranch=${branch}`)
      setRfps(res.ok ? await res.json() : [])
    } catch { setRfps([]) }
  }, [branch])

  useEffect(() => { fetchEntries(); fetchRfps(); setSelected(new Set()) }, [fetchEntries, fetchRfps])

  // year/month-range + remitted filter
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (!e.cutoffPeriod.startsWith(`${year}-`)) return false
      if (month) {
        // Range: from `month` to `monthTo` (inclusive); a blank monthTo = single month.
        const [lo, hi] = [month, monthTo || month].sort()
        const mm = e.cutoffPeriod.slice(5, 7)
        if (mm < lo || mm > hi) return false
      }
      return showRemitted || !e.taxRemitted
    })
  }, [entries, year, month, monthTo, showRemitted])

  // Column sort + filter over the period-filtered rows — what you see is what
  // select-all / totals / RFP generation act on.
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' })
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'name', label: 'Employee' }, { key: 'period', label: 'Cutoff Period' },
    { key: 'gross', label: 'Gross Pay' }, { key: 'tax', label: 'Withholding Tax (1601-C)' }, { key: 'status', label: 'Status' },
  ]
  const colGet = useCallback((e: Entry, k: string): string | number =>
    k === 'name' ? e.consultantName : k === 'period' ? e.cutoffPeriod : k === 'gross' ? e.grossPay
      : k === 'tax' ? e.taxAmount : k === 'status' ? (e.taxRemitted ? 'In RFP / Remitted' : 'Unremitted') : '', [])
  // Filter the cutoff by its displayed label ("Jul 2026 — 1st cutoff"), not the raw key.
  const colFilterGet = useCallback((e: Entry, k: string): string | number => k === 'period' ? cutoffLabel(e.cutoffPeriod) : colGet(e, k), [colGet])
  const shown = useMemo(() => applySortFilter(filtered, colGet, sort.key, sort.dir, colFilters, colFilterGet), [filtered, colGet, sort, colFilters, colFilterGet])

  const selectable = shown.filter(e => !e.taxRemitted)
  const allSel = selectable.length > 0 && selectable.every(e => selected.has(e.payrollEntryId))
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(selectable.map(e => e.payrollEntryId)))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectedTotal = shown.filter(e => selected.has(e.payrollEntryId)).reduce((s, e) => s + e.taxAmount, 0)
  const years = useMemo(() => {
    const ys = new Set<string>([String(now.getFullYear())]); entries.forEach(e => ys.add(e.cutoffPeriod.slice(0, 4))); return [...ys].sort().reverse()
  }, [entries, now])

  const buildPdf = (r: TaxRfp): jsPDF => {
    const doc = new jsPDF()
    const items = r.meta?.items || []
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP) — Withholding Tax on Compensation', 14, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Branch: ${BRANCH_FULL[r.meta?.payrollBranch || branch] || branch}`, 14, 21)
    doc.text(`BIR Form: 1601-C`, 14, 25)
    doc.text(`Ref No: ${r.refNumber}`, 120, 21)
    doc.text(`Date: ${new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, 120, 25)
    autoTable(doc, {
      startY: 30,
      head: [['Employee', 'Cutoff Period', 'Gross Pay', 'Withholding Tax']],
      body: items.map(i => [i.name, cutoffLabel(i.period), peso(i.gross), peso(i.tax)]),
      foot: [['', 'TOTAL', '', peso(items.reduce((s, i) => s + i.tax, 0))]],
      styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    })
    return doc
  }

  const generateRfp = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/taxes/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxType: 'WC', payrollBranch: branch, ids: [...selected], manualSeq: manualSeq.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to create RFP'); return }
      // persist PDF
      try {
        const created: TaxRfp = { id: data.id, refNumber: data.refNumber, grossTotal: data.grossTotal, status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, transferRef: null, proofUrl: null, createdAt: new Date().toISOString(), meta: { taxType: 'WC', payrollBranch: branch, items: shown.filter(e => selected.has(e.payrollEntryId)).map(e => ({ id: e.payrollEntryId, name: e.consultantName, period: e.cutoffPeriod, gross: e.grossPay, tax: e.taxAmount })) } }
        const pdf = buildPdf(created)
        await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, pdfData: pdf.output('datauristring') }) })
      } catch { /* pdf persist best-effort */ }
      setShowRfpModal(false); setManualSeq(''); setSelected(new Set())
      await Promise.all([fetchEntries(), fetchRfps()])
    } finally { setBusy(false) }
  }

  const downloadPdf = async (r: TaxRfp) => {
    try {
      const res = await fetch(`/api/taxes/rfp?id=${r.id}`)
      const d = await res.json()
      if (d.pdfData) { const a = document.createElement('a'); a.href = d.pdfData; a.download = `${r.refNumber}.pdf`; a.click(); return }
    } catch { /* fall through */ }
    buildPdf(r).save(`${r.refNumber}.pdf`)
  }

  const deleteRfp = async (r: TaxRfp) => {
    if (!confirm(`Delete ${r.refNumber}? Its employee entries return to "unremitted".`)) return
    await fetch(`/api/taxes/rfp?id=${r.id}`, { method: 'DELETE' })
    await Promise.all([fetchEntries(), fetchRfps()])
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => (
              <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold"
                style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>
            ))}
          </div>
          <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => { setMonth(e.target.value); if (!e.target.value) setMonthTo('') }} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
          <select value={monthTo} onChange={e => setMonthTo(e.target.value)} disabled={!month} title={month ? 'End of the month range (optional)' : 'Pick a starting month first'}
            className="px-3 py-2 rounded-xl border text-xs font-semibold disabled:opacity-40" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">— (single month)</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={showRemitted} onChange={e => setShowRemitted(e.target.checked)} /> Show remitted
          </label>
          <button onClick={() => { fetchEntries(); fetchRfps() }} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        {canWrite && selected.size > 0 && (
          <button onClick={() => setShowRfpModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#c44b00' }}>
            <FileText size={14} /> Generate RFP ({selected.size}) · ₱{peso(selectedTotal)}
          </button>
        )}
      </div>

      {/* Entries table */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={colFilters}
            onToggleSort={toggleSort} onFilter={(k, v) => setColFilters(f => ({ ...f, [k]: v }))}
            leading={canWrite ? <input type="checkbox" checked={allSel} onChange={toggleAll} /> : null} />
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{filtered.length > 0 ? 'No rows match the column filters.' : showRemitted ? 'No employee withholding records for this period.' : 'No unremitted employee withholding — all caught up.'}</td></tr>
            ) : shown.map(e => (
              <tr key={e.payrollEntryId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-4 py-2.5">{canWrite && !e.taxRemitted && <input type="checkbox" checked={selected.has(e.payrollEntryId)} onChange={() => toggleOne(e.payrollEntryId)} />}</td>
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{e.consultantName}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{cutoffLabel(e.cutoffPeriod)}</td>
                <td className="px-4 py-2.5 text-right text-xs" style={{ color: 'var(--charcoal)' }}>₱{peso(e.grossPay)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-xs" style={{ color: '#c44b00' }}>₱{peso(e.taxAmount)}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={e.taxRemitted ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{e.taxRemitted ? 'In RFP / Remitted' : 'Unremitted'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RFP list */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Withholding Compensation RFPs</p>
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={rfpCols} sortKey={rfpSort.key} sortDir={rfpSort.dir} filters={rfpFilters}
              onToggleSort={rfpToggleSort} onFilter={(k, v) => setRfpFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shownRfps.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.meta?.items?.length || 0}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{r.status === 'PAID' ? 'Paid' : 'For Payment'}</span>
                    {r.status === 'PAID' && r.paidAt && <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{new Date(r.paidAt).toLocaleDateString('en-PH')}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}</div>}
                  </td>
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
              {shownRfps.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>{rfps.length === 0 ? 'No withholding-compensation RFPs yet.' : 'No RFPs match the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showRfpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRfpModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate Withholding RFP</h2><button onClick={() => setShowRfpModal(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{selected.size} employee withholding entr{selected.size === 1 ? 'y' : 'ies'} · total <strong>₱{peso(selectedTotal)}</strong> (BIR 1601-C).</p>
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
  const save = async () => {
    setBusy(true)
    try {
      await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'pay', datePaid, paymentMethod: method, checkNumber: checkNumber || null, transferRef: transferRef || null }) })
      onSaved()
    } finally { setBusy(false) }
  }
  const unpay = async () => { setBusy(true); try { await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'unpay' }) }); onSaved() } finally { setBusy(false) } }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Tax Payment</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{rfp.refNumber} · ₱{(typeof rfp.grossTotal === 'number' ? rfp.grossTotal : parseFloat(rfp.grossTotal)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment date</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option>Online Fund Transfer</option><option>Check</option><option>Cash</option>
        </select>
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
