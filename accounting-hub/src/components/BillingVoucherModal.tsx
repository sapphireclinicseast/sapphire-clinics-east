'use client'

import { useState } from 'react'
import { X, Loader2, FileText } from 'lucide-react'
import { buildBillingVoucher, type BVLine } from '@/lib/billing-voucher'

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Prompts for "Billed to" + "Description" (memo), then generates the A4 Billing
// Voucher PDF for the given RFP line items.
export function BillingVoucherModal({ refNumber, date, lines, branch, defaultBilledTo, defaultMemo, onClose }: {
  refNumber: string; date: string; lines: BVLine[]; branch?: string
  defaultBilledTo?: string; defaultMemo?: string; onClose: () => void
}) {
  const [billedTo, setBilledTo] = useState(defaultBilledTo || '')
  const [memo, setMemo] = useState(defaultMemo || '')
  const [busy, setBusy] = useState(false)
  const total = lines.reduce((s, l) => s + l.netEwt, 0)

  const generate = async () => {
    setBusy(true)
    try {
      const doc = await buildBillingVoucher({ refNumber, date, billedTo, memo, lines, branch })
      doc.save(`Billing-Voucher-${refNumber}.pdf`)
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}><FileText size={18} style={{ color: 'var(--teal)' }} /> Billing Voucher</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{refNumber} · {lines.length} line(s) · total <strong>₱{peso(total)}</strong></p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Billed to</label>
        <textarea value={billedTo} onChange={e => setBilledTo(e.target.value)} rows={2} placeholder="e.g. Heraldina Cabria&#10;Uno Accounting Services" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Description (Memo)</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="e.g. Paid to Heraldine Cabria due to remittance of government contribution for the month of January 2026; No valid SI" className="w-full px-3 py-2 rounded-xl border text-sm mb-4" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={generate} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Generate Billing Voucher PDF'}</button>
      </div>
    </div>
  )
}
