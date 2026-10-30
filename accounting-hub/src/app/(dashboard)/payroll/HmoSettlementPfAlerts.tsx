'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface PfAlert {
  settlementId: string
  orderId: string
  orderNumber: number
  sessionDate: string
  patientName: string | null
  billedAmount: number
  paidAmount: number
  consultant: string
  cutoffPeriod: string
  entryStatus: string
  unitPayName: string | null
  quantity: number
  pfPaid: number
  pfPolicy: number
  overpaid: number
}

/**
 * Banner on Consultant payroll: PF already released at a session's billed amount
 * when the sale was later decreased to what the HMO paid ("Decrease due to HMO
 * Payment" in POS Order History). Shows what to deduct from the next payout.
 */
export default function HmoSettlementPfAlerts({ canWrite, variant = 'full', onOpen, onCount }: {
  canWrite: boolean
  // 'banner' = one line above the consultant sub-tabs pointing to the section;
  // 'full' = the HMO PF Adjustments sub-tab itself.
  variant?: 'banner' | 'full'
  onOpen?: () => void
  onCount?: (n: number) => void
}) {
  const [alerts, setAlerts] = useState<PfAlert[] | null>(null)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(() => {
    fetch('/api/payroll/hmo-settlement-alerts')
      .then(r => (r.ok ? r.json() : { alerts: [] }))
      .then(d => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => setAlerts([]))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (alerts) onCount?.(alerts.length) }, [alerts, onCount])

  const resolve = async (settlementId: string) => {
    if (!confirm('Mark this PF overpayment as deducted? The alert will clear.')) return
    setBusyId(settlementId)
    try {
      await fetch('/api/payroll/hmo-settlement-alerts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settlementId }),
      })
      load()
    } finally {
      setBusyId('')
    }
  }

  const list = alerts || []
  const total = list.reduce((s, a) => s + a.overpaid, 0)
  const byConsultant = list.reduce<Record<string, number>>((m, a) => { m[a.consultant] = (m[a.consultant] || 0) + a.overpaid; return m }, {})
  const headline = `PF overpaid after HMO decreases: ${formatCurrency(total)} across ${list.length} session${list.length === 1 ? '' : 's'} — ${Object.entries(byConsultant).map(([n, v]) => `${n} ${formatCurrency(v)}`).join(' · ')}`

  if (variant === 'banner') {
    if (!list.length) return null
    return (
      <button onClick={onOpen} className="w-full rounded-xl border px-4 py-2.5 text-sm flex items-center justify-between gap-2 text-left"
        style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
        <span className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> {headline}</span>
        <span className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap">Open <ChevronRight size={14} /></span>
      </button>
    )
  }

  if (alerts === null) {
    return <p className="text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading…</p>
  }
  if (!list.length) {
    return (
      <div className="rounded-xl border px-4 py-6 text-sm text-center" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
        No PF to recover. When a session is decreased with &quot;Decrease due to HMO Payment&quot; after its PF was released, it appears here.
      </div>
    )
  }

  return (
    <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> {headline}</p>
      <div className="mt-3 space-y-2">
          <p className="text-xs">These sessions were decreased to what the HMO paid after their PF was released at the billed amount. Deduct the overpaid PF from the consultant&apos;s next payout, then mark it deducted.</p>
          <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: '#fde68a' }}>
            <table className="w-full text-xs" style={{ color: 'var(--charcoal)' }}>
              <thead>
                <tr style={{ background: '#fef3c7' }}>
                  {['Consultant', 'Cutoff', 'Order', 'Session', 'Patient', 'Billed → HMO paid', 'PF paid', 'PF per rule', 'Overpaid', ''].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={`${a.settlementId}-${a.cutoffPeriod}-${i}`} className="border-t" style={{ borderColor: '#fef3c7' }}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{a.consultant}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{a.cutoffPeriod}</td>
                    <td className="px-2 py-1.5">#{a.orderNumber}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(a.sessionDate)}</td>
                    <td className="px-2 py-1.5">{a.patientName || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.billedAmount)} → {formatCurrency(a.paidAmount)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.pfPaid)}{a.quantity !== 1 ? ` × ${a.quantity}` : ''}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.pfPolicy)}</td>
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap text-red-700">{formatCurrency(a.overpaid)}</td>
                    <td className="px-2 py-1.5">
                      {canWrite && (
                        <button onClick={() => resolve(a.settlementId)} disabled={busyId === a.settlementId}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium border whitespace-nowrap flex items-center gap-1" style={{ borderColor: '#fde68a' }}>
                          {busyId === a.settlementId && <Loader2 size={11} className="animate-spin" />} Mark deducted
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  )
}
