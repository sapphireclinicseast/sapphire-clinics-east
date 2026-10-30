'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
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
export default function HmoSettlementPfAlerts({ canWrite }: { canWrite: boolean }) {
  const [alerts, setAlerts] = useState<PfAlert[]>([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(() => {
    fetch('/api/payroll/hmo-settlement-alerts')
      .then(r => (r.ok ? r.json() : { alerts: [] }))
      .then(d => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => setAlerts([]))
  }, [])
  useEffect(() => { load() }, [load])

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

  if (!alerts.length) return null
  const total = alerts.reduce((s, a) => s + a.overpaid, 0)
  const byConsultant = alerts.reduce<Record<string, number>>((m, a) => { m[a.consultant] = (m[a.consultant] || 0) + a.overpaid; return m }, {})

  return (
    <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} />
          PF overpaid after HMO decreases: {formatCurrency(total)} across {alerts.length} session{alerts.length === 1 ? '' : 's'} —
          {' '}{Object.entries(byConsultant).map(([n, v]) => `${n} ${formatCurrency(v)}`).join(' · ')}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
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
                {alerts.map((a, i) => (
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
      )}
    </div>
  )
}
