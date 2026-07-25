'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Undo2, Plus, Loader2, X, Trash2, CheckCircle2, Circle, FileText, BadgeDollarSign, Receipt, Paperclip } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import { formatCurrency } from '@/lib/utils'

const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const PAYMENT_METHODS = ['Cash', 'Check', 'Bank Transfer', 'Telegraphic Transfer', 'GCash']

interface Refund {
  id: string; branch: string; date: string; patientId: string | null; patientName: string
  refundAmount: number; chargesDeducted: number; netAmount: number; reason: string | null
  proofUrls: string[] | null; audited: boolean; refundRfpId: string | null
  paidAt: string | null; rfpRefNumber: string | null; rfpStatus: string | null
}
interface Rfp { id: string; refNumber: string; grossTotal: number; payableTotal: number; status: string; payableTo: string | null; paidAt: string | null; paymentMethod: string | null; proofUrl: string | null; createdAt: string }
interface Bank { id: string; accountNumber: string; accountTitle: string }
interface Patient { id: string; name: string; email?: string; phone?: string }

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function RefundsPage() {
  const { data: session } = useSession()
  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [tab, setTab] = useState<'refunds' | 'rfp'>('refunds')
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [rfps, setRfps] = useState<Rfp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banks, setBanks] = useState<Bank[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // New / edit refund modal
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [fDate, setFDate] = useState(todayStr())
  const [fPatient, setFPatient] = useState('')
  const [fPatientId, setFPatientId] = useState<string | null>(null)
  const [fAmount, setFAmount] = useState('')
  const [fCharges, setFCharges] = useState('')
  const [fReason, setFReason] = useState('')
  const [fProofs, setFProofs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const proofsRef = useRef<string[]>([])
  proofsRef.current = fProofs

  // Patient typeahead
  const [pMatches, setPMatches] = useState<Patient[]>([])
  const [pOpen, setPOpen] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // RFP generation modal
  const [rfpOpen, setRfpOpen] = useState(false)
  const [rfpSeq, setRfpSeq] = useState('')
  const [creatingRfp, setCreatingRfp] = useState(false)

  // Pay modal
  const [payTarget, setPayTarget] = useState<Rfp | null>(null)
  const [payDate, setPayDate] = useState(todayStr())
  const [payMethod, setPayMethod] = useState('Bank Transfer')
  const [payBankId, setPayBankId] = useState('')
  const [payCheck, setPayCheck] = useState('')
  const [payProof, setPayProof] = useState('')
  const [paying, setPaying] = useState(false)

  // Billing voucher
  const [bvTarget, setBvTarget] = useState<{ refNumber: string; date: string; lines: { account: string; description: string; gross: number; vat: number; netVat: number; netEwt: number; payee?: string; memo?: string }[]; branch: string; defaultBilledTo: string; defaultMemo: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rf, rp] = await Promise.all([
        fetch(`/api/refunds?branch=${branch}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/refunds/rfp?branch=${branch}`).then(r => r.ok ? r.json() : []),
      ])
      setRefunds(Array.isArray(rf) ? rf : [])
      setRfps(Array.isArray(rp) ? rp : [])
    } catch { setRefunds([]); setRfps([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(new Set()) }, [branch])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])

  const searchPatients = (q: string) => {
    setFPatient(q); setFPatientId(null); setPOpen(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.trim().length < 2) { setPMatches([]); return }
    searchTimer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(q.trim())}`); setPMatches(r.ok ? await r.json() : []) }
      catch { setPMatches([]) }
    }, 250)
  }

  const openNew = () => {
    setEditId(null); setFDate(todayStr()); setFPatient(''); setFPatientId(null)
    setFAmount(''); setFCharges(''); setFReason(''); setFProofs([]); setPMatches([]); setFormOpen(true)
  }
  const openEdit = (r: Refund) => {
    setEditId(r.id); setFDate(r.date.slice(0, 10)); setFPatient(r.patientName); setFPatientId(r.patientId)
    setFAmount(String(r.refundAmount)); setFCharges(String(r.chargesDeducted)); setFReason(r.reason || ''); setFProofs(r.proofUrls || [])
    setFormOpen(true)
  }

  const fNet = Math.max(0, (parseFloat(fAmount) || 0) - (parseFloat(fCharges) || 0))

  const saveRefund = async () => {
    if (!fPatient.trim()) { setError('Patient name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { branch, date: fDate, patientId: fPatientId, patientName: fPatient.trim(), refundAmount: parseFloat(fAmount) || 0, chargesDeducted: parseFloat(fCharges) || 0, reason: fReason, proofUrls: proofsRef.current }
      const res = editId
        ? await fetch('/api/refunds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...payload }) })
        : await fetch('/api/refunds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to save') }
      // If editing, also persist any newly added proofs (PATCH generic update doesn't touch proofs)
      if (editId) await fetch('/api/refunds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, action: 'set-proof', proofUrls: proofsRef.current }) })
      setFormOpen(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save') } finally { setSaving(false) }
  }

  const toggleAudit = async (r: Refund) => {
    setError('')
    const res = await fetch('/api/refunds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'audit', audited: !r.audited }) })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); setError(e.error || 'Failed') }
  }
  const deleteRefund = async (r: Refund) => {
    if (!confirm(`Delete refund for ${r.patientName} (${formatCurrency(r.netAmount)})?`)) return
    const res = await fetch(`/api/refunds?id=${r.id}`, { method: 'DELETE' })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to delete') }
  }

  const eligible = refunds.filter(r => r.audited && !r.refundRfpId)
  const selRows = refunds.filter(r => selected.has(r.id))
  const selTotal = selRows.reduce((s, r) => s + r.netAmount, 0)
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const createRfp = async () => {
    if (selRows.length === 0) return
    setCreatingRfp(true); setError('')
    try {
      const res = await fetch('/api/refunds/rfp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, refundIds: [...selected], manualSeq: rfpSeq.trim() || undefined }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create RFP') }
      setRfpOpen(false); setSelected(new Set()); setRfpSeq(''); await load()
      setTab('rfp')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create RFP') } finally { setCreatingRfp(false) }
  }

  const openBillingVoucher = async (rfp: Rfp) => {
    try {
      const r = await fetch(`/api/refunds/rfp?id=${rfp.id}&items=1`)
      const d = r.ok ? await r.json() : { lines: [] }
      const first = (d.lines || [])[0]
      setBvTarget({ refNumber: rfp.refNumber, date: new Date(rfp.createdAt).toLocaleDateString('en-PH'), lines: d.lines || [], branch, defaultBilledTo: first?.payee || rfp.payableTo || '', defaultMemo: first?.memo || 'Patient refund' })
    } catch { setError('Failed to build billing voucher') }
  }

  const openPay = (rfp: Rfp) => { setPayTarget(rfp); setPayDate(todayStr()); setPayMethod('Bank Transfer'); setPayBankId(''); setPayCheck(''); setPayProof('') }
  const recordPaid = async () => {
    if (!payTarget) return
    if (!payBankId) { setError('Select the cash/bank account'); return }
    setPaying(true); setError('')
    try {
      const res = await fetch('/api/refunds/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: payTarget.id, action: 'pay', datePaid: payDate, paymentMethod: payMethod, paymentBankAccountId: payBankId, checkNumber: payCheck || null, proofUrl: payProof || null }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to record payment') }
      setPayTarget(null); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to record payment') } finally { setPaying(false) }
  }
  const unpayRfp = async (rfp: Rfp) => {
    if (!confirm(`Reverse payment for ${rfp.refNumber}? The refund journal entry (DR Unearned Revenue / CR Cash) will be deleted.`)) return
    const res = await fetch('/api/refunds/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'unpay' }) })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed') }
  }
  const deleteRfp = async (rfp: Rfp) => {
    if (!confirm(`Delete RFP ${rfp.refNumber}? Its refunds are released back to the list${rfp.status === 'PAID' ? ' and the journal entry is reversed' : ''}.`)) return
    const res = await fetch(`/api/refunds/rfp?id=${rfp.id}`, { method: 'DELETE' })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to delete') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Undo2 size={22} style={{ color: 'var(--teal)' }} /> Refunds
        </h1>
        {tab === 'refunds' && <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> New Refund</button>}
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Patient refunds of prepaid balances. On RFP payment we post <strong>DR Unearned Revenue / CR Cash</strong> — these are deductions from unearned revenue, not expenses, so they never appear in the Expense Report.</p>

      {/* Branch */}
      <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
        {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['refunds', 'Refunds'], ['rfp', 'RFP']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors" style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* ── REFUNDS TABLE ── */}
      {tab === 'refunds' && (
        <>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <th className="text-center px-2 py-2.5"><input type="checkbox" checked={eligible.length > 0 && eligible.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(eligible.map(r => r.id)) : new Set())} /></th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Patient</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Refund Amount</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Charges Deducted</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Net to Patient</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Proof</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>OK</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="inline animate-spin" /></td></tr>
                ) : refunds.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>No refunds yet. Click “New Refund”.</td></tr>
                ) : refunds.map(r => {
                  const locked = !!r.refundRfpId
                  return (
                    <tr key={r.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="text-center px-2 py-2.5"><input type="checkbox" disabled={!r.audited || locked} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{r.date.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{r.patientName}{r.reason ? <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>{r.reason}</span> : null}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.refundAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.chargesDeducted)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(r.netAmount)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {(r.proofUrls || []).length ? (r.proofUrls || []).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="inline-block mx-0.5" title="View proof"><Paperclip size={13} style={{ color: 'var(--teal)' }} /></a>) : <span style={{ color: 'var(--light-gray)' }}>—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => !locked && toggleAudit(r)} disabled={locked} title={r.audited ? 'Audited' : 'Mark OK'}>
                          {r.audited ? <CheckCircle2 size={16} className="inline" style={{ color: '#16a34a' }} /> : <Circle size={16} className="inline" style={{ color: 'var(--mid-gray)' }} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.paidAt ? <span className="text-[11px] font-medium" style={{ color: '#166534' }}>Paid</span>
                          : locked ? <span className="text-[11px] font-medium" style={{ color: '#c44b00' }}>In RFP {r.rfpRefNumber ? `(${r.rfpRefNumber})` : ''}</span>
                          : <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Pending</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {!locked && <button onClick={() => openEdit(r)} className="text-[11px] font-medium mr-2" style={{ color: 'var(--teal)' }}>Edit</button>}
                        {!locked && <button onClick={() => deleteRefund(r)} title="Delete"><Trash2 size={14} className="text-red-500 inline" /></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Selected: <strong style={{ color: 'var(--deep-teal)' }}>{formatCurrency(selTotal)}</strong> · {selected.size} refund{selected.size === 1 ? '' : 's'}</span>
              <button onClick={() => setRfpOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><BadgeDollarSign size={14} /> Generate RFP</button>
            </div>
          )}
        </>
      )}

      {/* ── RFP LIST ── */}
      {tab === 'rfp' && (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>RFP Number</th>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Payable To</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Total</th>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : rfps.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>No refund RFPs yet.</td></tr>
              ) : rfps.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--charcoal)' }}>{r.payableTo || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(r.payableTotal)}</td>
                  <td className="px-3 py-2.5">{r.status === 'PAID' ? <span className="text-[11px] font-medium" style={{ color: '#166534' }}>Paid</span> : <span className="text-[11px] font-medium" style={{ color: '#c44b00' }}>Pending</span>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => openBillingVoucher(r)} className="text-[11px] font-medium mr-2" style={{ color: 'var(--teal)' }} title="Billing Voucher"><FileText size={13} className="inline" /> BV</button>
                    {r.status !== 'PAID'
                      ? <button onClick={() => openPay(r)} className="text-[11px] font-medium mr-2" style={{ color: 'var(--deep-teal)' }}>Record as Paid</button>
                      : <button onClick={() => unpayRfp(r)} className="text-[11px] font-medium mr-2" style={{ color: '#c44b00' }}>Unpay</button>}
                    <button onClick={() => deleteRfp(r)} title="Delete"><Trash2 size={14} className="text-red-500 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New/Edit Refund modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{editId ? 'Edit Refund' : 'New Refund'}</h2><button onClick={() => setFormOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <div className="space-y-3 text-xs">
              <div className="relative">
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Patient (search CRM)</label>
                <input value={fPatient} onChange={e => searchPatients(e.target.value)} onFocus={() => setPOpen(true)} onBlur={() => setTimeout(() => setPOpen(false), 150)} placeholder="Type patient name…" className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
                {pOpen && pMatches.length > 0 && (
                  <div className="absolute z-[80] left-0 right-0 mt-0.5 rounded-lg border bg-white shadow-xl overflow-auto" style={{ maxHeight: 200, borderColor: 'var(--light-gray)' }}>
                    {pMatches.map(p => (
                      <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); setFPatient(p.name); setFPatientId(p.id); setPOpen(false) }} className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                        <div className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{p.name}</div>
                        {(p.email || p.phone) && <div className="text-[10px] truncate" style={{ color: 'var(--mid-gray)' }}>{[p.email, p.phone].filter(Boolean).join(' · ')}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Reason (optional)</label><input value={fReason} onChange={e => setFReason(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. cancelled package" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Refund Amount</label><input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="0.00" /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Charges Deducted</label><input type="number" value={fCharges} onChange={e => setFCharges(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="0.00" /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Net to Patient</label><div className="w-full px-3 py-2.5 rounded-xl border font-mono font-semibold" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)', color: 'var(--deep-teal)' }}>{formatCurrency(fNet)}</div></div>
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Proof (file or QR phone upload)</label>
                <ScanUpload section="refund" prefix="refund" existingCount={fProofs.length} onUploaded={(url) => setFProofs(prev => [...prev, url])} />
                {fProofs.length > 0 && <div className="mt-1 flex flex-wrap gap-2">{fProofs.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: 'var(--teal)' }}>Proof {i + 1}</a>)}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={saveRefund} disabled={saving || !fPatient.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{saving ? <Loader2 size={13} className="animate-spin" /> : 'Save Refund'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Generate RFP modal */}
      {rfpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate Refund RFP</h2><button onClick={() => setRfpOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{selRows.length} refund{selRows.length === 1 ? '' : 's'} · total <strong>{formatCurrency(selTotal)}</strong>. Creates an RFP under Refunds → RFP and locks these rows until paid (or the RFP is deleted).</p>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>RFP Number (optional)</label>
            <input value={rfpSeq} onChange={e => setRfpSeq(e.target.value)} placeholder="e.g. 000007" className="w-full px-3 py-2.5 rounded-xl border text-sm mb-4" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={createRfp} disabled={creatingRfp} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{creatingRfp ? <Loader2 size={15} className="inline animate-spin" /> : 'Generate RFP'}</button>
          </div>
        </div>
      )}

      {/* Record as Paid modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Record RFP as Paid — {payTarget.refNumber}</h2><button onClick={() => setPayTarget(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Posts <strong>DR Unearned Revenue / CR {banks.find(b => b.id === payBankId)?.accountTitle || 'Cash'}</strong> for {formatCurrency(payTarget.payableTotal)}.</p>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Date Paid</label><input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Method</label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Cash / Bank Account (credited)</label><select value={payBankId} onChange={e => setPayBankId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}><option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} · {b.accountTitle}</option>)}</select></div>
              <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Check / Ref No. (optional)</label><input value={payCheck} onChange={e => setPayCheck(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Proof (optional)</label><ScanUpload section="refund-payment" prefix="refund-payment" onUploaded={(url) => setPayProof(url)} />{payProof && <a href={payProof} target="_blank" rel="noreferrer" className="text-[11px] underline mt-1 inline-block" style={{ color: 'var(--teal)' }}>View proof</a>}</div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setPayTarget(null)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={recordPaid} disabled={paying || !payBankId} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--deep-teal)' }}>{paying ? <Loader2 size={13} className="animate-spin" /> : <><Receipt size={13} /> Record Paid</>}</button>
            </div>
          </div>
        </div>
      )}

      {bvTarget && <BillingVoucherModal refNumber={bvTarget.refNumber} date={bvTarget.date} lines={bvTarget.lines} branch={bvTarget.branch} defaultBilledTo={bvTarget.defaultBilledTo} defaultMemo={bvTarget.defaultMemo} preparedBy={session?.user?.name || ''} onClose={() => setBvTarget(null)} />}
    </div>
  )
}
