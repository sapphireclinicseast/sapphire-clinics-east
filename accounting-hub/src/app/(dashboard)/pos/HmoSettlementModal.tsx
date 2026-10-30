'use client'

import { useMemo, useState } from 'react'
import { X, Loader2, TrendingDown, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export interface HmoSettlementNote {
  id: string
  billedAmount: string | number
  paidAmount: string | number
  difference: string | number
  reference?: string | null
  note?: string | null
  createdAt: string
  createdByName?: string | null
}

interface SettleOrder {
  id: string
  orderNumber: string
  transactionDate: string
  patientName?: string
  items: { id: string; name: string; quantity: number; lineTotal: string | number }[]
  payments: { id: string; method: string; amount: string | number; reference?: string }[]
  arPaymentItems?: { paymentId: string }[]
}

const num = (v: string | number | null | undefined) => Number(v) || 0
const round2 = (n: number) => Math.round(n * 100) / 100

/** Mirrors the API's split: a line that alone equals the decrease takes all of
 *  it, otherwise the decrease is spread in proportion to each line. Preview only. */
function previewSplit(items: SettleOrder['items'], reduction: number): Map<string, number> {
  const open = items.map(i => ({ id: i.id, room: num(i.lineTotal) })).filter(x => x.room > 0)
  const total = open.reduce((s, x) => s + x.room, 0)
  const take = new Map<string, number>()
  if (reduction <= 0 || total <= 0) return take
  const exact = open.filter(x => Math.abs(x.room - reduction) < 0.005)
  if (exact.length === 1) { take.set(exact[0].id, reduction); return take }
  let allocated = 0
  for (const x of open) {
    const t = Math.floor((x.room / total) * reduction * 100) / 100
    take.set(x.id, t)
    allocated = round2(allocated + t)
  }
  const largest = open.reduce((a, b) => (b.room > a.room ? b : a))
  take.set(largest.id, round2((take.get(largest.id) || 0) + reduction - allocated))
  return take
}

export function HmoSettlementModal({ order, onClose, onDone }: { order: SettleOrder; onClose: () => void; onDone: () => void }) {
  const hmoPayments = order.payments.filter(p => p.method === 'HMO' && num(p.amount) > 0)
  const [paymentId, setPaymentId] = useState(hmoPayments[0]?.id || '')
  const [paid, setPaid] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ reduction: number; glStatus: string } | null>(null)

  const payment = hmoPayments.find(p => p.id === paymentId)
  const billed = num(payment?.amount)
  const paidNum = paid.trim() === '' ? NaN : round2(Number(paid))
  const valid = Number.isFinite(paidNum) && paidNum >= 0 && paidNum < billed
  const reduction = valid ? round2(billed - paidNum) : 0
  const split = useMemo(() => previewSplit(order.items, reduction), [order.items, reduction])
  const onPayment = (order.arPaymentItems || []).length > 0

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/pos/orders/${order.id}/hmo-settlement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAmount: paidNum, reference, note, paymentId }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Could not save'); return }
      setResult({ reduction: j.reduction, glStatus: j.glStatus })
      onDone()
    } catch {
      setError('Could not save — check your connection')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-auto relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
          <TrendingDown size={18} className="text-red-500" /> Decrease due to HMO Payment
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          Order #{order.orderNumber} · {order.patientName || '—'} · {formatDate(order.transactionDate)}
        </p>

        {result ? (
          <div className="space-y-3">
            <div className="text-sm px-3 py-2 rounded-lg" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
              Sale decreased by {formatCurrency(result.reduction)}. The order history now notes the HMO settlement.
            </div>
            {result.glStatus !== 'REPOSTED' && result.glStatus !== 'POSTED' && (
              <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                Ledger: {result.glStatus}
              </div>
            )}
            <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Close</button>
          </div>
        ) : (
          <div className="space-y-3">
            {hmoPayments.length > 1 && (
              <label className="block text-xs" style={{ color: 'var(--mid-gray)' }}>HMO payment
                <select value={paymentId} onChange={e => setPaymentId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                  {hmoPayments.map(p => <option key={p.id} value={p.id}>{p.reference || 'HMO'} — {formatCurrency(num(p.amount))}</option>)}
                </select>
              </label>
            )}
            <div className="flex justify-between text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--off-white)' }}>
              <span style={{ color: 'var(--mid-gray)' }}>Billed to {payment?.reference || 'the HMO'}</span>
              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(billed)}</span>
            </div>
            <label className="block text-xs" style={{ color: 'var(--mid-gray)' }}>Amount the HMO paid for this session (₱)
              <input type="number" min={0} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} autoFocus
                className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. 1800" />
              <span className="block mt-1" style={{ color: 'var(--mid-gray)' }}>The approved amount on the payment voucher, before the HMO&apos;s 5% discount and 2% withholding.</span>
            </label>
            <label className="block text-xs" style={{ color: 'var(--mid-gray)' }}>Voucher / reference no. (optional)
              <input value={reference} onChange={e => setReference(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. PV-00-001464545" />
            </label>
            <label className="block text-xs" style={{ color: 'var(--mid-gray)' }}>Reason (optional)
              <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. Shockwave not covered" />
            </label>

            {paid.trim() !== '' && !valid && (
              <p className="text-xs text-red-600">Enter an amount below {formatCurrency(billed)}.</p>
            )}
            {valid && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Line</th>
                    <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Now</th>
                    <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>After</th>
                  </tr></thead>
                  <tbody>
                    {order.items.filter(i => num(i.lineTotal) > 0).map(i => (
                      <tr key={i.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>{i.name}</td>
                        <td className="text-right px-3 py-1.5" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(num(i.lineTotal))}</td>
                        <td className="text-right px-3 py-1.5 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(round2(num(i.lineTotal) - (split.get(i.id) || 0)))}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>Sale</td>
                      <td className="text-right px-3 py-1.5" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(billed)}</td>
                      <td className="text-right px-3 py-1.5 text-red-600">{formatCurrency(paidNum)} (−{formatCurrency(reduction)})</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              The sale is re-posted at the new amount on its own date, so sales, revenue and commissions use what the HMO paid. If PF was already released at the higher amount, Payroll will flag it.
            </p>
            {onPayment && (
              <p className="text-xs px-3 py-2 rounded-lg flex gap-1.5" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> This session is already tagged to a recorded HMO payment. Tell Accounting so that payment&apos;s entry credits only the amount paid.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={submit} disabled={!valid || busy} className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: '#b91c1c' }}>
                {busy && <Loader2 size={14} className="animate-spin" />} Decrease sale{valid ? ` by ${formatCurrency(reduction)}` : ''}
              </button>
              <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
