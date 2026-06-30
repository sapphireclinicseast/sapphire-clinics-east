'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Download, CheckCircle2, Trash2, RefreshCw, X, Eye, Pencil, FileText } from 'lucide-react'
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
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)

interface Item { id: string; source: 'CONSULTANT' | 'EXPENSE'; name: string; ref: string; ym: string; periodLabel: string; base: number; rate: number | null; ewt: number; remitted: boolean }
interface MetaItem { id: string; source: string; name: string; period: string; base: number; rate: number | null; ewt: number }
interface TaxRfp { id: string; refNumber: string; grossTotal: string | number; status: string; paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; transferRef: string | null; proofUrl: string | null; meta: { taxType: string; payrollBranch: string; items: MetaItem[] } | null; createdAt: string }

export default function ExpandedWithholding() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')

  const [branch, setBranch] = useState('SBEA')
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState('')
  const [showRemitted, setShowRemitted] = useState(false)

  const [items, setItems] = useState<Item[]>([])
  const [rfps, setRfps] = useState<TaxRfp[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showRfpModal, setShowRfpModal] = useState(false)
  const [showOtherIncome, setShowOtherIncome] = useState(false)
  const [siStatus, setSiStatus] = useState<Record<string, string>>({}) // `${ym}|${NAME}` → Submitted|Pending|No SI
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState('')
  const [manualSeq, setManualSeq] = useState('')
  const [busy, setBusy] = useState(false)
  const [payTarget, setPayTarget] = useState<TaxRfp | null>(null)
  const [bv, setBv] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch: string } | null>(null)

  const [rfpSort, setRfpSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [rfpFilters, setRfpFilters] = useState<Record<string, string>>({})
  const rfpToggleSort = (k: string) => setRfpSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const rfpCols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'date', label: 'Date' },
    { key: 'count', label: 'Items' }, { key: 'grossTotal', label: 'EWT Total' }, { key: 'status', label: 'Status' },
  ]
  const rfpGet = (r: TaxRfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'count' ? (r.meta?.items?.length || 0) : k === 'grossTotal' ? num(r.grossTotal)
      : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'For Payment') : ''
  const shownRfps = applySortFilter(rfps, rfpGet, rfpSort.key, rfpSort.dir, rfpFilters)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch(`/api/taxes/ewt-items?payrollBranch=${branch}`); const d = res.ok ? await res.json() : { items: [] }; setItems(d.items || []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [branch])
  const fetchRfps = useCallback(async () => {
    try { const res = await fetch(`/api/taxes/rfp?taxType=EWT&payrollBranch=${branch}`); setRfps(res.ok ? await res.json() : []) } catch { setRfps([]) }
  }, [branch])
  useEffect(() => { fetchItems(); fetchRfps(); setSelected(new Set()) }, [fetchItems, fetchRfps])

  const filtered = useMemo(() => {
    const prefix = month ? `${year}-${month}` : `${year}-`
    return items.filter(e => e.ym.startsWith(prefix) && (showRemitted || !e.remitted))
  }, [items, year, month, showRemitted])

  const selectable = filtered.filter(e => !e.remitted)
  const allSel = selectable.length > 0 && selectable.every(e => selected.has(e.id))
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(selectable.map(e => e.id)))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectedTotal = filtered.filter(e => selected.has(e.id)).reduce((s, e) => s + e.ewt, 0)
  const years = useMemo(() => { const ys = new Set<string>([String(now.getFullYear())]); items.forEach(e => e.ym && ys.add(e.ym.slice(0, 4))); return [...ys].sort().reverse() }, [items, now])

  const normName = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
  const siOf = (e: Item) => e.source === 'CONSULTANT' ? (siStatus[`${e.ym}|${normName(e.name)}`] || '') : ''
  // Pull consultant Service-Invoice submission status from the HR Hub for the
  // months currently shown (matched per consultant + EWT month).
  const syncHrHub = async () => {
    const months = [...new Set(filtered.filter(e => e.source === 'CONSULTANT').map(e => e.ym).filter(Boolean))]
    if (months.length === 0) { alert('No consultant EWT rows in view to match.'); return }
    setSyncing(true)
    try {
      const map: Record<string, string> = {}
      let reached = false
      for (const m of months) {
        const r = await fetch(`/api/taxes/ewt-si-status?month=${m}`)
        if (!r.ok) continue
        reached = true
        const d = await r.json()
        for (const s of (d.statuses || [])) map[`${m}|${normName(s.name)}`] = s.status
      }
      if (!reached) { alert('Could not reach the HR Hub. Check the connection / API key.'); return }
      setSiStatus(prev => ({ ...prev, ...map }))
      setSyncedAt(new Date().toLocaleTimeString('en-PH'))
    } finally { setSyncing(false) }
  }

  const buildPdf = (r: TaxRfp): jsPDF => {
    const doc = new jsPDF()
    const its = r.meta?.items || []
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP) — Expanded Withholding Tax', 14, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Branch: ${BRANCH_FULL[r.meta?.payrollBranch || branch] || branch}`, 14, 21)
    doc.text(`BIR Form: 0619-E / 1601-EQ`, 14, 25)
    doc.text(`Ref No: ${r.refNumber}`, 120, 21)
    doc.text(`Date: ${new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, 120, 25)
    autoTable(doc, {
      startY: 30,
      head: [['Source', 'Payee', 'Period', 'Tax Base', 'EWT %', 'EWT Amount']],
      body: its.map(i => [i.source === 'CONSULTANT' ? 'Consultant' : 'Expense', i.name, i.period, peso(i.base), i.rate != null ? `${i.rate}%` : '', peso(i.ewt)]),
      foot: [['', '', '', '', 'TOTAL', peso(its.reduce((s, i) => s + i.ewt, 0))]],
      styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    })
    return doc
  }

  const generateRfp = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const chosen = filtered.filter(e => selected.has(e.id))
      const consultantIds = chosen.filter(e => e.source === 'CONSULTANT').map(e => e.id)
      const expenseIds = chosen.filter(e => e.source === 'EXPENSE').map(e => e.id)
      const res = await fetch('/api/taxes/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxType: 'EWT', payrollBranch: branch, consultantIds, expenseIds, manualSeq: manualSeq.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to create RFP'); return }
      try {
        const created: TaxRfp = { id: data.id, refNumber: data.refNumber, grossTotal: data.grossTotal, status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, transferRef: null, proofUrl: null, createdAt: new Date().toISOString(), meta: { taxType: 'EWT', payrollBranch: branch, items: chosen.map(e => ({ id: e.id, source: e.source, name: e.name, period: e.periodLabel, base: e.base, rate: e.rate, ewt: e.ewt })) } }
        await fetch('/api/taxes/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, pdfData: buildPdf(created).output('datauristring') }) })
      } catch { /* best effort */ }
      setShowRfpModal(false); setManualSeq(''); setSelected(new Set())
      await Promise.all([fetchItems(), fetchRfps()])
    } finally { setBusy(false) }
  }

  const downloadPdf = async (r: TaxRfp) => {
    try { const res = await fetch(`/api/taxes/rfp?id=${r.id}`); const d = await res.json(); if (d.pdfData) { const a = document.createElement('a'); a.href = d.pdfData; a.download = `${r.refNumber}.pdf`; a.click(); return } } catch { /* fall through */ }
    buildPdf(r).save(`${r.refNumber}.pdf`)
  }
  const deleteRfp = async (r: TaxRfp) => {
    if (!confirm(`Delete ${r.refNumber}? Its items return to "unremitted".`)) return
    await fetch(`/api/taxes/rfp?id=${r.id}`, { method: 'DELETE' })
    await Promise.all([fetchItems(), fetchRfps()])
  }

  const srcBadge = (s: string) => s === 'CONSULTANT' ? { background: '#ede9fe', color: '#6d28d9', text: 'Consultant' } : { background: '#e0f2fe', color: '#075985', text: 'Expense' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
          </div>
          <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
          <select value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">All months</option>{MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}><input type="checkbox" checked={showRemitted} onChange={e => setShowRemitted(e.target.checked)} /> Show remitted</label>
          <button onClick={() => { fetchItems(); fetchRfps() }} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
          <button onClick={syncHrHub} disabled={syncing} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            {syncing ? <Loader2 size={13} className="inline animate-spin" /> : <RefreshCw size={13} />} Sync with HR Hub
          </button>
          {syncedAt && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>synced {syncedAt}</span>}
        </div>
        {canWrite && selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRfpModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#c44b00' }}>Generate EWT RFP ({selected.size}) · ₱{peso(selectedTotal)}</button>
            <button onClick={() => setShowOtherIncome(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#6d28d9' }}>Declare as Other Income</button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="px-4 py-2.5 w-10">{canWrite && <input type="checkbox" checked={allSel} onChange={toggleAll} />}</th>
              {['Source', 'Payee', 'Period', 'Tax Base', 'EWT %', 'EWT Amount', 'SI (HR Hub)', 'Status'].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{showRemitted ? 'No EWT records for this period.' : 'No unremitted EWT — all caught up.'}</td></tr>
            ) : filtered.map(e => {
              const b = srcBadge(e.source)
              return (
                <tr key={e.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5">{canWrite && !e.remitted && <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} />}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: b.background, color: b.color }}>{b.text}</span></td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{e.name}<div className="text-[11px] font-mono" style={{ color: 'var(--mid-gray)' }}>{e.ref}</div></td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{e.periodLabel}</td>
                  <td className="px-4 py-2.5 text-right text-xs" style={{ color: 'var(--charcoal)' }}>₱{peso(e.base)}</td>
                  <td className="px-4 py-2.5 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>{e.rate != null ? `${e.rate}%` : ''}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-xs" style={{ color: '#c44b00' }}>₱{peso(e.ewt)}</td>
                  <td className="px-4 py-2.5">{e.source === 'CONSULTANT' ? (() => { const st = siOf(e); const sty = st === 'Submitted' ? { background: '#dcfce7', color: '#166534' } : st === 'No SI' ? { background: '#e5e7eb', color: '#374151' } : st === 'Pending' ? { background: '#fef3c7', color: '#92400e' } : null; return sty ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={sty}>{st}</span> : <span className="text-[11px]" style={{ color: 'var(--light-gray)' }}>—</span> })() : <span className="text-[11px]" style={{ color: 'var(--light-gray)' }}>n/a</span>}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={e.remitted ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{e.remitted ? 'In RFP / Remitted' : 'Unremitted'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>EWT RFPs</p>
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={rfpCols} sortKey={rfpSort.key} sortDir={rfpSort.dir} filters={rfpFilters} onToggleSort={rfpToggleSort} onFilter={(k, v) => setRfpFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shownRfps.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.meta?.items?.length || 0}</td>
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
              {shownRfps.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>{rfps.length === 0 ? 'No EWT RFPs yet.' : 'No RFPs match the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showRfpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRfpModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate EWT RFP</h2><button onClick={() => setShowRfpModal(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{selected.size} item{selected.size === 1 ? '' : 's'} · total EWT <strong>₱{peso(selectedTotal)}</strong> (BIR 0619-E / 1601-EQ).</p>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>RFP Number (optional)</label>
            <p className="text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>From your pre-printed form. Leave blank to auto-number. Keep leading zeros.</p>
            <input value={manualSeq} onChange={e => setManualSeq(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 000007" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={generateRfp} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Generate RFP'}</button>
          </div>
        </div>
      )}
      {payTarget && <RecordPaidModal rfp={payTarget} onClose={() => setPayTarget(null)} onSaved={async () => { setPayTarget(null); await fetchRfps() }} />}
      {bv && <BillingVoucherModal refNumber={bv.refNumber} date={bv.date} lines={bv.lines} branch={bv.branch} onClose={() => setBv(null)} />}
      {showOtherIncome && (
        <OtherIncomeModal payrollBranch={branch} total={selectedTotal}
          consultantIds={filtered.filter(e => selected.has(e.id) && e.source === 'CONSULTANT').map(e => e.id)}
          expenseIds={filtered.filter(e => selected.has(e.id) && e.source === 'EXPENSE').map(e => e.id)}
          onClose={() => setShowOtherIncome(false)}
          onDone={async () => { setShowOtherIncome(false); setSelected(new Set()); await fetchItems() }} />
      )}
    </div>
  )
}

function OtherIncomeModal({ payrollBranch, total, consultantIds, expenseIds, onClose, onDone }: { payrollBranch: string; total: number; consultantIds: string[]; expenseIds: string[]; onClose: () => void; onDone: () => void }) {
  const [accts, setAccts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [q, setQ] = useState('')
  const [incomeAccountId, setAcct] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(d => setAccts((d.data || []).filter((a: { accountType: string }) => a.accountType === 'REVENUE').map((a: { id: string; accountNumber: string; accountTitle: string }) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle })))).catch(() => {}) }, [])
  const filtered = accts.filter(a => !q || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  const save = async () => {
    if (!incomeAccountId) { alert('Choose the Other Income account.'); return }
    setBusy(true)
    try { const r = await fetch('/api/taxes/ewt-other-income', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payrollBranch, consultantIds, expenseIds, incomeAccountId }) }); if (!r.ok) { alert((await r.json()).error || 'Failed'); return } onDone() } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Declare as Other Income</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{consultantIds.length + expenseIds.length} item(s) · total <strong>₱{peso(total)}</strong>. Posts Dr Withholding Tax Payable / Cr the chosen income account — <strong>no bank movement</strong>.</p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Other Income account title</label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search income accounts…" className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <div className="rounded-xl border overflow-auto mb-4" style={{ borderColor: 'var(--light-gray)', maxHeight: 220 }}>
          {filtered.map(a => <button key={a.id} onClick={() => setAcct(a.id)} className="block w-full text-left px-3 py-1.5 text-xs" style={{ background: incomeAccountId === a.id ? 'var(--pale-teal)' : '#fff', color: 'var(--charcoal)' }}>{a.accountNumber} — {a.accountTitle}</button>)}
          {filtered.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>No revenue accounts found.</p>}
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#6d28d9' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Declare as Other Income'}</button>
      </div>
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
