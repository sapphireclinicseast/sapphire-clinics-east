'use client'

/**
 * Enter or correct the SI number and amount of an invoice that is already
 * recorded (e.g. saved before amounts were asked for). Same check as Upload SI.
 */

import { useMemo, useState } from 'react'
import { Loader2, X, Eye } from 'lucide-react'
import { carriedInto, describeCutoffs, type CutoffPay, type SiAdjustment } from '@/lib/payroll/si-coverage'
import { SiAmountCheck, amountPayload, evaluateAmount, type AmountState } from './SiAmountCheck'

export function SiAmountDialog({ consultant, invoice, pay, covered, adjustments, onClose, onSaved }: {
  consultant: { id: string; name: string }
  invoice: { keys: string[]; cutoffs: string[]; siUrl: string | null; siNumber: string | null; invoiceAmount: number | null }
  pay: Record<string, CutoffPay>
  covered: Set<string>
  adjustments: SiAdjustment[]
  onClose: () => void
  onSaved: () => void
}) {
  const [amt, setAmt] = useState<AmountState>(() => ({
    siNumber: invoice.siNumber || '',
    amount: invoice.invoiceAmount === null ? '' : String(invoice.invoiceAmount),
    skipIds: [], target: '', note: '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Differences this invoice raised or absorbed are recomputed on save, so
  // leave them out of what the check shows now.
  const others = useMemo(() => adjustments.filter(a =>
    !a.sourceKeys.some(k => invoice.keys.includes(k)) &&
    !(a.status === 'APPLIED' && a.appliedKeys.some(k => invoice.keys.includes(k)))), [adjustments, invoice.keys])
  const reopened = useMemo(() => adjustments
    .filter(a => a.status === 'APPLIED' && a.appliedKeys.some(k => invoice.keys.includes(k)))
    .map(a => ({ ...a, status: 'OPEN' as const })), [adjustments, invoice.keys])
  const pool = useMemo(() => [...others, ...reopened], [others, reopened])
  const ev = useMemo(() => evaluateAmount(amt, invoice.cutoffs, pay, pool, covered), [amt, invoice.cutoffs, pay, pool, covered])
  const carriedIn = useMemo(() => carriedInto(invoice.cutoffs, pool), [invoice.cutoffs, pool])

  const save = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/payroll/si-submissions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: consultant.id, keys: invoice.keys, ...amountPayload(amt, ev) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Failed to save the amount'); setBusy(false); return }
      onSaved()
    } catch { setError('Failed to save the amount'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Invoice amount</h2>
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>{consultant.name} · {describeCutoffs(invoice.cutoffs)}</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {invoice.siUrl && (
            <a href={invoice.siUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline" style={{ color: 'var(--teal)' }}>
              <Eye size={12} /> Open the invoice copy
            </a>
          )}
          <SiAmountCheck st={amt} setSt={setAmt} ev={ev} allCarriedIn={carriedIn} />
          {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
            <button onClick={save} disabled={busy || !ev.ready}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {busy ? <Loader2 size={14} className="inline animate-spin" /> : 'Save amount'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
