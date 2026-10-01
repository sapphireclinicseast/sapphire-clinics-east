'use client'

import { useEffect, useState } from 'react'
import { X, Upload, Loader2, CheckCircle2 } from 'lucide-react'

// Pay modal for a petty-cash reimbursement (PCF RFP). Self-contained: it uploads
// the proof and PATCHes /api/petty-cash/reimbursements (action=pay) itself, so it
// can be used from the unified Expenses → RFP list as well. Keeps the petty-cash
// "debited-from / deposited-to" account pair that expense RFPs don't have.
const PAYMENT_METHODS = ['Check deposit', 'Check encashment to deposit as cash', 'Online Fund Transfer']
const toChequeInput = (v: string) => v.replace(/\D/g, '')

export interface ReimbPayReport {
  id: string; refNumber: string; status: string
  debitAccount?: string | null; depositAccount?: string | null; paidAt?: string | null
  paymentMethod?: string | null; checkNumber?: string | null; transferRef?: string | null; proofUrl?: string | null
}

export function ReimbursementPayModal({ report, bankOptions, onClose, onDone }: {
  report: ReimbPayReport; bankOptions: string[]; onClose: () => void; onDone: () => void
}) {
  const isEdit = report.status === 'PAID'
  // Draft insurance: everything typed is kept in sessionStorage per RFP.
  const draftKey = `pc-rfp-pay-draft:${report.id}`
  const draft: Record<string, string> | null = (() => { try { return JSON.parse(sessionStorage.getItem(draftKey) || 'null') } catch { return null } })()
  const [debit, setDebit] = useState(draft?.debit ?? (report.debitAccount || ''))
  const [deposit, setDeposit] = useState(draft?.deposit ?? (report.depositAccount || ''))
  const [datePaid, setDatePaid] = useState(draft?.datePaid ?? (report.paidAt ? String(report.paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10)))
  const [paymentMethod, setPaymentMethod] = useState(draft?.paymentMethod ?? (report.paymentMethod || ''))
  const [checkNumber, setCheckNumber] = useState(draft?.checkNumber ?? (report.checkNumber || ''))
  const [transferRef, setTransferRef] = useState(draft?.transferRef ?? (report.transferRef || ''))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ debit, deposit, datePaid, paymentMethod, checkNumber, transferRef })) } catch { /* storage unavailable */ }
  }, [draftKey, debit, deposit, datePaid, paymentMethod, checkNumber, transferRef])
  const isCheck = paymentMethod === 'Check deposit' || paymentMethod === 'Check encashment to deposit as cash'
  const isTransfer = paymentMethod === 'Online Fund Transfer'

  const submit = async () => {
    if (!datePaid) { alert('Enter the Date Paid.'); return }
    if (!paymentMethod) { alert('Select a Payment Method.'); return }
    if (isCheck && !checkNumber.trim()) { alert('Enter the Check Number.'); return }
    if (isTransfer && !transferRef.trim()) { alert('Enter the transfer Reference Number.'); return }
    if (!debit || !deposit) { alert('Select both the debit (from) and deposit (to) accounts.'); return }
    setSaving(true)
    try {
      let proofUrl: string | null = report.proofUrl ?? null
      if (file) {
        const fd = new FormData(); fd.append('file', file)
        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!up.ok) { alert((await up.json()).error || 'Proof upload failed'); setSaving(false); return }
        proofUrl = (await up.json()).url
      }
      const res = await fetch('/api/petty-cash/reimbursements', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: report.id, action: 'pay', debitAccount: debit, depositAccount: deposit, proofUrl, datePaid, paymentMethod, checkNumber: isCheck ? checkNumber.trim() : '', transferRef: isTransfer ? transferRef.trim() : '' }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to record payment'); setSaving(false); return }
      try { sessionStorage.removeItem(draftKey) } catch { /* ignore */ }
      onDone(); onClose()
    } catch { alert('Failed to record payment') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{isEdit ? 'Edit Payment Details' : 'Record as Paid'} — {report.refNumber}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-[11px] mb-3 px-2 py-1 rounded-lg" style={{ background: '#eff6ff', color: '#1e40af' }}>Petty Cash reimbursement — replenishes the branch float.</p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date Paid</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Method</label>
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select method…</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {isCheck && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Check Number</label>
            <input type="text" inputMode="numeric" value={checkNumber} onChange={e => setCheckNumber(toChequeInput(e.target.value))}
              placeholder="e.g. 0001234" className="w-full px-3 py-2 rounded-xl border text-sm mb-1 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Leading zeros are preserved. The check&apos;s bank is the &quot;Debited from&quot; account below.</p>
          </>
        )}
        {isTransfer && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Reference Number</label>
            <input type="text" value={transferRef} onChange={e => setTransferRef(e.target.value)}
              placeholder="Transfer reference no." className="w-full px-3 py-2 rounded-xl border text-sm mb-3 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
          </>
        )}

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Debited from (bank account)</label>
        <select value={debit} onChange={e => setDebit(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>
          {bankOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Deposited to (bank account)</label>
        <input list="reimb-deposit-bank-accounts" value={deposit} onChange={e => setDeposit(e.target.value)}
          placeholder="Select a company account or type any external account"
          className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <datalist id="reimb-deposit-bank-accounts">{bankOptions.map(a => <option key={a} value={a} />)}</datalist>
        <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Pick one of our accounts, or type the payee&apos;s / any bank account not in the chart of accounts.</p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of deposit (image / PDF)</label>
        <label className="flex items-center gap-2 cursor-pointer mb-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <Upload size={13} /> Choose File
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--mid-gray)', maxWidth: 220 }}>{file ? file.name : (report.proofUrl ? 'Current proof kept' : 'No file chosen')}</span>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>{report.proofUrl ? 'A proof is already attached — choose a new file to replace it. ' : 'Optional, but recommended. '}Max 10MB.</p>

        <button onClick={submit} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--teal)' }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Record as Paid')}
        </button>
      </div>
    </div>
  )
}
