'use client'

/**
 * Settled PayMongo payments that haven't been put on the patient's advance yet.
 *
 * Paying online isn't the session — it's money on account. Converting loads the amount onto
 * the patient's ADVANCE wallet; when they actually come in, the order raised from the Clinic
 * Schedule is paid from that wallet, which is what recognises the revenue.
 *
 * Renders nothing when the queue is empty, to stay out of the cashier's way.
 */

import { useCallback, useEffect, useState } from 'react'
import { Wallet, Loader2, RefreshCw, ArrowRight, Pencil } from 'lucide-react'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Pending {
  id: string; checkoutId: string; referenceCode: string | null; account: string | null; branch: string | null
  itemName: string | null; description: string | null; quantity: number
  customerName: string; customerEmail: string | null; customerPhone: string | null
  voucherCode: string | null; grossAmount: number | null; discountAmount: number | null
  amount: number; fee: number | null; netAmount: number | null
  paidAt: string | null; paymentMethodUsed: string | null
}

const METHOD_LABEL: Record<string, string> = { QRPH: 'QRPh', GCASH: 'GCash', PAYMAYA: 'Maya', CARD: 'Credit Card' }

export function PaymongoAdvanceQueue({ branch, onConverted }: { branch: string; onConverted?: () => void }) {
  const [rows, setRows] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/paymongo/convert-to-advance?branch=${encodeURIComponent(branch || '')}`)
      setRows(r.ok ? await r.json() : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])

  const convert = async (p: Pending) => {
    setBusyId(p.id); setError('')
    try {
      const r = await fetch('/api/paymongo/convert-to-advance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId: p.checkoutId, patientName: names[p.id] || undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to record the advance')
      alert(j.message || 'Advance recorded.')
      await load()
      onConverted?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusyId('') }
  }

  if (!loading && rows.length === 0 && !error) return null

  return (
    <div className="rounded-2xl border" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>
          <Wallet size={15} /> Online payments to put on advance
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
            <th className="px-3 py-2 text-left font-semibold uppercase">Patient</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Paid for</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Via</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">Amount</th>
            <th className="px-3 py-2 text-right font-semibold uppercase"></th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-6" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="inline animate-spin" /></td></tr>
            ) : rows.map(p => (
              <tr key={p.id} className="border-t bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-PH') : '—'}</td>
                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                  {/* The payer typed their own name — let the cashier correct it to the patient
                      on record, so the advance lands on the right wallet. */}
                  {editing === p.id ? (
                    <input autoFocus value={names[p.id] ?? p.customerName}
                      onChange={e => setNames(s => ({ ...s, [p.id]: e.target.value }))}
                      onBlur={() => setEditing('')}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditing('') }}
                      className="px-2 py-1 rounded border text-xs w-48" style={{ borderColor: 'var(--teal)' }} />
                  ) : (
                    <button onClick={() => setEditing(p.id)} className="text-left group">
                      <span className="font-medium">{names[p.id] || p.customerName || '—'}</span>
                      <Pencil size={10} className="inline ml-1 opacity-40 group-hover:opacity-100" />
                    </button>
                  )}
                  {(p.customerEmail || p.customerPhone) && (
                    <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>{[p.customerEmail, p.customerPhone].filter(Boolean).join(' · ')}</span>
                  )}
                </td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>
                  {p.itemName || p.description || '—'}{p.quantity > 1 ? ` ×${p.quantity}` : ''}
                  {p.voucherCode && <span className="block text-[10px] font-mono" style={{ color: '#c44b00' }}>voucher {p.voucherCode} −{peso(p.discountAmount || 0)}</span>}
                </td>
                <td className="px-3 py-2">
                  {p.paymentMethodUsed
                    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#eff6ff', color: '#1e40af' }}>{METHOD_LABEL[p.paymentMethodUsed] || p.paymentMethodUsed}</span>
                    : <span className="text-[10px]" style={{ color: '#92400e' }}>not reported</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(p.amount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => convert(p)} disabled={busyId === p.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                    {busyId === p.id ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />} Convert to Advance
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
        These were paid online. Converting adds the amount to the patient&apos;s <strong>Advance</strong> wallet —
        no sale is recorded yet. When the session happens, raise the order from the Clinic Schedule and pay it
        from the advance; that is what books the revenue.
      </p>
    </div>
  )
}
