'use client'

/**
 * Settled PayMongo payments that haven't been recorded as a POS sale yet.
 *
 * Appears in POS so the cashier can turn each one into an order in a click. The payment is
 * tagged to the matching "Paymongo - <BRANCH> (<METHOD>)" mode based on what the payer
 * actually used (QRPh / GCash / Card), so the sale lands on the right account.
 * Renders nothing when the queue is empty, to stay out of the way.
 */

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Loader2, RefreshCw, ArrowRight } from 'lucide-react'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Pending {
  id: string; checkoutId: string; referenceCode: string | null; account: string | null; branch: string | null
  itemName: string | null; quantity: number
  customerName: string; customerEmail: string | null; customerPhone: string | null
  voucherCode: string | null; grossAmount: number | null; discountAmount: number | null
  amount: number; fee: number | null; netAmount: number | null
  paidAt: string | null; paymentMethodUsed: string | null; paymentModeName: string | null
}

const METHOD_LABEL: Record<string, string> = { QRPH: 'QRPh', GCASH: 'GCash', PAYMAYA: 'Maya', CARD: 'Credit Card' }

export function PaymongoConvertQueue({ branch, onConverted }: { branch: string; onConverted?: () => void }) {
  const [rows, setRows] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/paymongo/convert-to-order?branch=${encodeURIComponent(branch || '')}`)
      setRows(r.ok ? await r.json() : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])

  const convert = async (p: Pending, revenueType: 'EARNED' | 'UNEARNED') => {
    setBusyId(p.id); setError('')
    try {
      const r = await fetch('/api/paymongo/convert-to-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId: p.checkoutId, revenueType }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to convert')
      if (j.warning) alert(j.warning)
      await load()
      onConverted?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to convert') } finally { setBusyId('') }
  }

  // Nothing waiting → don't clutter the cashier's screen.
  if (!loading && rows.length === 0 && !error) return null

  return (
    <div className="rounded-2xl border" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>
          <CreditCard size={15} /> PayMongo payments to record
          {rows.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'var(--teal)', color: '#fff' }}>{rows.length}</span>}
        </span>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr style={{ color: 'var(--mid-gray)' }}>
            <th className="px-3 py-2 text-left font-semibold uppercase">Paid</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Customer</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Item</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Method</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">Amount</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">Record as</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-6" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="inline animate-spin" /></td></tr>
            ) : rows.map(p => (
              <tr key={p.id} className="border-t bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-PH') : '—'}</td>
                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                  {p.customerName || '—'}
                  {(p.customerEmail || p.customerPhone) && (
                    <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>{[p.customerEmail, p.customerPhone].filter(Boolean).join(' · ')}</span>
                  )}
                </td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>
                  {p.itemName || '—'}{p.quantity > 1 ? ` ×${p.quantity}` : ''}
                  {p.voucherCode && <span className="block text-[10px] font-mono" style={{ color: '#c44b00' }}>voucher {p.voucherCode} −{peso(p.discountAmount || 0)}</span>}
                </td>
                <td className="px-3 py-2">
                  {p.paymentMethodUsed
                    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#eff6ff', color: '#1e40af' }}>{METHOD_LABEL[p.paymentMethodUsed] || p.paymentMethodUsed}</span>
                    : <span className="text-[10px]" style={{ color: '#92400e' }}>not reported</span>}
                  {p.paymentModeName && <span className="block text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{p.paymentModeName}</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(p.amount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => convert(p, 'EARNED')} disabled={busyId === p.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50 mr-1" style={{ background: 'var(--teal)' }}>
                    {busyId === p.id ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />} Convert to Order
                  </button>
                  <button onClick={() => convert(p, 'UNEARNED')} disabled={busyId === p.id}
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-medium border bg-white disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
                    title="Record as a downpayment — revenue stays unearned until the service is delivered">
                    as Downpayment
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
        These were paid online through a PayMongo link. Converting creates the POS sale with the payment already tagged to the matching PayMongo mode.
      </p>
    </div>
  )
}
