'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  source: 'HUB' | 'OUTSIDE_HUB'
  consultant: string
  cutoffPeriod: string | null
  entryStatus: string | null
  unitPayName: string | null
  quantity: number
  pfPaid: number
  pfPolicy: number
  overpaid: number
  settled: boolean
  deductedCutoff: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  resolvedNote: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-10-2" → "Oct 2026 · 2nd". */
function cutoffLabel(period: string): string {
  const [y, m, h] = period.split('-')
  return `${MONTHS[parseInt(m, 10) - 1] ?? m} ${y} · ${h === '1' ? '1st' : '2nd'}`
}
/** Cutoffs from three months back to two ahead, newest first. */
function cutoffOptions(today = new Date()): string[] {
  const out: string[] = []
  for (let k = 2; k >= -3; k--) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, 1)
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push(`${p}-2`, `${p}-1`)
  }
  return out
}

/**
 * Payroll → HMO PF Adjustments: PF already released at a session's billed amount
 * when the sale was later decreased to what the HMO paid ("Decrease due to HMO
 * Payment"). The payroll officer tags the cutoff the overpaid PF was deducted in;
 * tagged rows drop out of the list (and the bell) unless "Show settled" is ticked.
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
  const [showSettled, setShowSettled] = useState(false)
  const [cutoffFor, setCutoffFor] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const options = useMemo(() => cutoffOptions(), [])

  const load = useCallback(() => {
    fetch(`/api/payroll/hmo-settlement-alerts${showSettled && variant === 'full' ? '?settled=1' : ''}`)
      .then(r => (r.ok ? r.json() : { alerts: [] }))
      .then(d => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => setAlerts([]))
  }, [showSettled, variant])
  useEffect(() => { load() }, [load])

  const open = useMemo(() => (alerts || []).filter(a => !a.settled), [alerts])
  useEffect(() => { if (alerts) onCount?.(open.length) }, [alerts, open.length, onCount])

  const patch = async (body: Record<string, unknown>) => {
    setBusyId(String(body.settlementId)); setError('')
    try {
      const r = await fetch('/api/payroll/hmo-settlement-alerts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not save')
      load()
    } finally {
      setBusyId('')
    }
  }
  const record = (settlementId: string) => {
    const cutoff = cutoffFor[settlementId]
    if (!cutoff) { setError('Choose the cutoff the PF was deducted in first.'); return }
    patch({ settlementId, cutoff })
  }
  const undo = (settlementId: string) => {
    if (!confirm('Reopen this PF adjustment? It goes back on the to-recover list.')) return
    patch({ settlementId, undo: true })
  }

  const total = open.reduce((s, a) => s + a.overpaid, 0)
  const byConsultant = open.reduce<Record<string, number>>((m, a) => { m[a.consultant] = (m[a.consultant] || 0) + a.overpaid; return m }, {})
  const headline = `PF overpaid after HMO decreases: ${formatCurrency(total)} across ${open.length} session${open.length === 1 ? '' : 's'} — ${Object.entries(byConsultant).map(([n, v]) => `${n} ${formatCurrency(v)}`).join(' · ')}`

  if (variant === 'banner') {
    if (!open.length) return null
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
  const list = alerts
  const settledToggle = (
    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
      <input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} />
      Show settled
    </label>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {open.length
          ? <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#92400e' }}><AlertTriangle size={16} /> {headline}</p>
          : <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No PF left to recover.</p>}
        {settledToggle}
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
        These sessions were decreased to what the HMO paid after their PF was released at the billed amount. Deduct the overpaid PF
        from the consultant&apos;s payout, then pick the cutoff it was deducted in and press <strong>Record</strong> — the row then
        hides (tick <strong>Show settled</strong> to see it again). <strong>Outside hub</strong> = the session&apos;s payroll was run
        before the hub (Jan–Mar 2026): PF paid is the rule at the billed amount, so confirm it against the payslip.
      </p>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}

      {!list.length ? (
        <div className="rounded-xl border px-4 py-6 text-sm text-center" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          {showSettled ? 'Nothing recorded yet.' : 'When a session is decreased with “Decrease due to HMO Payment” after its PF was released, it appears here.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: '#fde68a' }}>
          <table className="w-full text-xs" style={{ color: 'var(--charcoal)' }}>
            <thead>
              <tr style={{ background: '#fef3c7', color: '#92400e' }}>
                {['Consultant', 'PF paid in', 'Order', 'Session', 'Patient', 'Billed → HMO paid', 'PF paid', 'PF per rule', 'Overpaid', 'Deducted in cutoff'].map(h => (
                  <th key={h} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={`${a.settlementId}-${a.consultant}-${a.cutoffPeriod}-${i}`} className="border-t"
                  style={{ borderColor: '#fef3c7', ...(a.settled ? { background: '#f8fafc', color: 'var(--mid-gray)' } : {}) }}>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium">{a.consultant}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {a.source === 'HUB' && a.cutoffPeriod
                      ? cutoffLabel(a.cutoffPeriod)
                      : <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}
                          title="Payroll for this session was run outside the hub (Jan–Mar 2026). PF paid is assumed at the rule for the billed amount — confirm against the payslip.">
                          Outside hub</span>}
                  </td>
                  <td className="px-2 py-1.5">#{a.orderNumber}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(a.sessionDate)}</td>
                  <td className="px-2 py-1.5">{a.patientName || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.billedAmount)} → {formatCurrency(a.paidAmount)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.pfPaid)}{a.quantity !== 1 ? ` × ${a.quantity}` : ''}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.pfPolicy)}</td>
                  <td className={`px-2 py-1.5 font-semibold whitespace-nowrap ${a.settled ? '' : 'text-red-700'}`}>{formatCurrency(a.overpaid)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {a.settled ? (
                      <span className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }}
                          title={[a.resolvedBy && `Recorded by ${a.resolvedBy}`, a.resolvedAt && formatDate(a.resolvedAt), a.resolvedNote].filter(Boolean).join(' · ')}>
                          {a.deductedCutoff ? cutoffLabel(a.deductedCutoff) : 'Settled'}
                        </span>
                        {canWrite && (
                          <button onClick={() => undo(a.settlementId)} disabled={busyId === a.settlementId}
                            className="text-[11px] underline" style={{ color: 'var(--mid-gray)' }}>Undo</button>
                        )}
                      </span>
                    ) : canWrite ? (
                      <span className="flex items-center gap-1.5">
                        <select value={cutoffFor[a.settlementId] || ''} onChange={e => setCutoffFor(m => ({ ...m, [a.settlementId]: e.target.value }))}
                          className="px-1.5 py-1 rounded-lg border text-[11px] bg-white" style={{ borderColor: '#fde68a' }}>
                          <option value="">Choose cutoff…</option>
                          {options.map(o => <option key={o} value={o}>{cutoffLabel(o)}</option>)}
                        </select>
                        <button onClick={() => record(a.settlementId)} disabled={busyId === a.settlementId || !cutoffFor[a.settlementId]}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-white flex items-center gap-1 disabled:opacity-50"
                          style={{ background: '#b45309' }}>
                          {busyId === a.settlementId && <Loader2 size={11} className="animate-spin" />} Record
                        </button>
                      </span>
                    ) : <span style={{ color: 'var(--mid-gray)' }}>Not yet deducted</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
