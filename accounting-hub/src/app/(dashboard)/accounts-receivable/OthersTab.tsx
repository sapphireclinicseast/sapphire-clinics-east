'use client'

// Accounts Receivable → Others: receivables from outside customers (e.g. bulk
// sales to Sandbox Clark) that aren't HMO/GL wallets. Created automatically by
// POS product orders paid via "Receivable", or added by hand. Supports a
// staggered monthly plan (months + interest as % of principal or an absolute
// add-on) with the monthly equivalent shown, and per-installment payments.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, X, Plus, Trash2, CalendarClock, HandCoins, ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ORPayment { id: string; date: string; amount: number; method: string | null; reference: string | null; proofUrl: string | null; notes: string | null }
interface OtherRec {
  id: string; branch: string; customerName: string; orderId: string | null; orderNumber: number | null
  principal: number; totalDue: number; months: number | null; interestType: string | null; interestValue: number | null
  monthlyAmount: number | null; startDate: string | null; notes: string | null; status: string; createdAt: string
  paid: number; balance: number; payments: ORPayment[]
}

const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'AHI' }

export default function OthersTab({ branch, canWrite }: { branch: string; canWrite: boolean }) {
  const [rows, setRows] = useState<OtherRec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showSettled, setShowSettled] = useState(true)

  const [planFor, setPlanFor] = useState<OtherRec | null>(null)
  const [payFor, setPayFor] = useState<OtherRec | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounts-receivable/others${branch ? `?branch=${branch}` : ''}`)
      setRows(res.ok ? await res.json() : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => rows.filter(r => showSettled || r.status !== 'SETTLED'), [rows, showSettled])
  const totalOutstanding = useMemo(() => rows.filter(r => r.status !== 'SETTLED').reduce((s, r) => s + r.balance, 0), [rows])

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const deleteRec = async (r: OtherRec) => {
    if (!confirm(`Delete receivable for ${r.customerName} (${formatCurrency(r.totalDue)})?`)) return
    const res = await fetch(`/api/accounts-receivable/others?id=${r.id}`, { method: 'DELETE' })
    if (!res.ok) { setError((await res.json()).error || 'Failed to delete'); return }
    load()
  }

  const deletePayment = async (r: OtherRec, paymentId: string) => {
    if (!confirm('Delete this payment?')) return
    await fetch('/api/accounts-receivable/others', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'delete-payment', paymentId }) })
    load()
  }

  const planLabel = (r: OtherRec) => {
    if (!r.months) return '—'
    const inter = r.interestType === 'PERCENT' ? ` +${r.interestValue}%` : r.interestType === 'ABSOLUTE' ? ` +${formatCurrency(r.interestValue || 0)}` : ''
    return `${r.months} mo${inter} · ${formatCurrency(r.monthlyAmount || 0)}/mo`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          Receivables from other customers (bulk / credit sales, e.g. Sandbox Clark) — created by POS product orders paid via <strong>Receivable</strong>, or added here.
          {' '}Outstanding: <strong style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalOutstanding)}</strong>
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} /> Show settled
          </label>
          {canWrite && (
            <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
              <Plus size={14} /> New Receivable
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="px-3 py-2.5 w-8" />
              {['Customer', 'Branch', 'Order #', 'Date', 'Principal', 'Total Due', 'Paid', 'Balance', 'Plan', 'Status', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No other receivables yet. Sell products via POS with payment “Receivable”, or add one here.</td></tr>
            ) : shown.map(r => (
              <>
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggle(r.id)} title="Payments">{expanded.has(r.id) ? <ChevronDown size={14} style={{ color: 'var(--mid-gray)' }} /> : <ChevronRight size={14} style={{ color: 'var(--mid-gray)' }} />}</button>
                  </td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{r.customerName}{r.notes && <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.notes}</div>}</td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[r.branch] || r.branch}</td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{r.orderNumber ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.principal)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.totalDue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: '#166534' }}>{formatCurrency(r.paid)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold" style={{ color: r.balance > 0.005 ? '#c44b00' : '#166534' }}>{formatCurrency(r.balance)}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{planLabel(r)}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={r.status === 'SETTLED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {r.status === 'SETTLED' ? 'Settled' : 'Open'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canWrite && <button onClick={() => setPlanFor(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} title="Staggered payment plan"><CalendarClock size={13} /> Plan</button>}
                    {canWrite && r.status !== 'SETTLED' && <button onClick={() => setPayFor(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}><HandCoins size={13} /> Record Payment</button>}
                    {canWrite && r.payments.length === 0 && <button onClick={() => deleteRec(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}><Trash2 size={13} /></button>}
                  </td>
                </tr>
                {expanded.has(r.id) && (
                  <tr key={`${r.id}-pay`} className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                    <td />
                    <td colSpan={11} className="px-3 py-2.5">
                      {r.payments.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No payments recorded yet.</p>
                      ) : (
                        <table className="text-xs w-full" style={{ maxWidth: 720 }}>
                          <thead><tr>{['Date', 'Amount', 'Method', 'Reference', ''].map(h => <th key={h} className="text-left pr-4 pb-1 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {r.payments.map(p => (
                              <tr key={p.id}>
                                <td className="pr-4 py-0.5">{new Date(p.date).toLocaleDateString('en-PH')}</td>
                                <td className="pr-4 py-0.5 font-mono">{formatCurrency(p.amount)}</td>
                                <td className="pr-4 py-0.5">{p.method || '—'}</td>
                                <td className="pr-4 py-0.5">{p.reference || '—'}</td>
                                <td className="py-0.5">
                                  {p.proofUrl && <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mr-2" style={{ color: 'var(--teal)' }}><Eye size={12} /> Proof</a>}
                                  {canWrite && <button onClick={() => deletePayment(r, p.id)} className="text-red-500"><Trash2 size={12} /></button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {planFor && <PlanModal rec={planFor} onClose={() => setPlanFor(null)} onSaved={() => { setPlanFor(null); load() }} />}
      {payFor && <PaymentModal rec={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load() }} />}
      {showNew && <NewReceivableModal branch={branch} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
    </div>
  )
}

// Staggered payment plan: months + interest (% of principal or absolute add-on),
// with the monthly equivalent previewed live.
function PlanModal({ rec, onClose, onSaved }: { rec: OtherRec; onClose: () => void; onSaved: () => void }) {
  const [months, setMonths] = useState(rec.months ? String(rec.months) : '')
  const [interestType, setInterestType] = useState<'NONE' | 'PERCENT' | 'ABSOLUTE'>(rec.interestType === 'PERCENT' ? 'PERCENT' : rec.interestType === 'ABSOLUTE' ? 'ABSOLUTE' : 'NONE')
  const [interestValue, setInterestValue] = useState(rec.interestValue != null ? String(rec.interestValue) : '')
  const [startDate, setStartDate] = useState(rec.startDate || new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const m = parseInt(months) || 0
  const iv = parseFloat(interestValue) || 0
  const interest = interestType === 'PERCENT' ? rec.principal * (iv / 100) : interestType === 'ABSOLUTE' ? iv : 0
  const totalDue = rec.principal + interest
  const monthly = m > 0 ? totalDue / m : 0

  const save = async () => {
    if (!(m > 0)) { alert('Enter the number of months.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/accounts-receivable/others', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, action: 'plan', months: m, interestType: interestType === 'NONE' ? null : interestType, interestValue: interestType === 'NONE' ? null : iv, startDate }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to save plan'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const clearPlan = async () => {
    setBusy(true)
    try { await fetch('/api/accounts-receivable/others', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rec.id, action: 'clear-plan' }) }); onSaved() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Staggered Payment Plan</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{rec.customerName} · principal <strong>{formatCurrency(rec.principal)}</strong></p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Number of months</label>
        <input type="number" min={1} value={months} onChange={e => setMonths(e.target.value)} placeholder="e.g. 6" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Interest</label>
        <div className="flex gap-2 mb-3">
          <select value={interestType} onChange={e => setInterestType(e.target.value as 'NONE' | 'PERCENT' | 'ABSOLUTE')} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="NONE">No interest</option>
            <option value="PERCENT">% of principal</option>
            <option value="ABSOLUTE">Absolute (₱)</option>
          </select>
          {interestType !== 'NONE' && (
            <input type="number" min={0} step="0.01" value={interestValue} onChange={e => setInterestValue(e.target.value)} placeholder={interestType === 'PERCENT' ? 'e.g. 5' : 'e.g. 2500'} className="flex-1 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          )}
        </div>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>First installment month</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        <div className="rounded-xl border p-3 mb-4 space-y-1" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div className="flex justify-between text-xs" style={{ color: 'var(--mid-gray)' }}><span>Interest</span><span className="font-mono">{formatCurrency(interest)}</span></div>
          <div className="flex justify-between text-xs" style={{ color: 'var(--charcoal)' }}><span className="font-semibold">Total due</span><span className="font-mono font-semibold">{formatCurrency(totalDue)}</span></div>
          <div className="flex justify-between text-sm" style={{ color: 'var(--deep-teal)' }}><span className="font-semibold">Monthly equivalent</span><span className="font-mono font-bold">{m > 0 ? `${formatCurrency(monthly)} × ${m}` : '—'}</span></div>
        </div>

        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save plan'}</button>
          {rec.months && <button onClick={clearPlan} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Remove plan</button>}
        </div>
      </div>
    </div>
  )
}

function PaymentModal({ rec, onClose, onSaved }: { rec: OtherRec; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(rec.monthlyAmount != null ? String(Number(rec.monthlyAmount.toFixed(2))) : '')
  const [method, setMethod] = useState('Bank Transfer')
  const [reference, setReference] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try { const fd = new FormData(); fd.append('file', file); const r = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await r.json(); if (r.ok && (d.url || d.fileUrl)) setProofUrl(d.url || d.fileUrl); else alert('Upload failed') } catch { alert('Upload failed') } finally { setUploading(false) }
  }

  const save = async () => {
    const amt = parseFloat(amount)
    if (!(amt > 0)) { alert('Enter a positive amount.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/accounts-receivable/others', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, action: 'payment', date, amount: amt, method, reference: reference.trim() || null, proofUrl: proofUrl || null }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to record payment'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Payment</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{rec.customerName} · balance <strong>{formatCurrency(rec.balance)}</strong>{rec.monthlyAmount != null && <> · monthly <strong>{formatCurrency(rec.monthlyAmount)}</strong></>}</p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount</label>
        <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option>Bank Transfer</option><option>Cash</option><option>Check</option><option>GCash</option>
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Reference (optional)</label>
        <input value={reference} onChange={e => setReference(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Proof (optional)</label>
        <div className="flex items-center gap-2 mb-4">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => upload(e.target.files?.[0] || null)} className="text-xs" />
          {uploading && <Loader2 size={13} className="animate-spin" />}
          {proofUrl && <span className="text-xs" style={{ color: '#166534' }}>Uploaded ✓</span>}
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Record payment'}</button>
      </div>
    </div>
  )
}

function NewReceivableModal({ branch, onClose, onSaved }: { branch: string; onClose: () => void; onSaved: () => void }) {
  const [customerName, setCustomerName] = useState('')
  const [recBranch, setRecBranch] = useState(branch || 'VERDANA_STORE')
  const [principal, setPrincipal] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/accounts-receivable/others', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: recBranch, customerName, principal: parseFloat(principal) || 0, notes: notes.trim() || null }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to create'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>New Other Receivable</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Customer / Sold to</label>
        <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. SANDBOX CLARK" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Branch</label>
        <select value={recBranch} onChange={e => setRecBranch(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="SANDBOX_EAST">East</option><option value="SANDBOX_GREENHILLS">Greenhills</option><option value="VERDANA_STORE">Verdana</option><option value="AURA_INSTITUTE">Aura Health Institute</option>
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount (principal)</label>
        <input type="number" min={0} step="0.01" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-xl border text-sm mb-3 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Notes (optional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-4" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Create receivable'}</button>
      </div>
    </div>
  )
}
