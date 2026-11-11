'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface PfAlert {
  settlementId: string
  orderId: string
  orderNumber: number
  sessionDate: string
  patientName: string | null
  billedAmount: number
  paidAmount: number
  voided?: boolean // the HMO order was voided (e.g. a confirmed duplicate) — no PF is earned
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
 * Payment"). Nothing is deducted until the payroll officer picks the cutoff to
 * deduct it in and presses Record — that cutoff's payslip then carries the PF
 * recovery line. Recorded rows stay listed in green with their cutoff and an
 * Undo that takes the line off the payslip again — the same as PF Above Price
 * (Hannah 2026-11-11); "Hide deducted" leaves only the open ones. The bell and
 * the banner count open rows only.
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
  const [hideDeducted, setHideDeducted] = useState(false)
  const [cutoffFor, setCutoffFor] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const options = useMemo(() => cutoffOptions(), [])

  const load = useCallback(() => {
    // The full section always loads the recorded rows too, so each can be undone.
    fetch(`/api/payroll/hmo-settlement-alerts${variant === 'full' ? '?settled=1' : ''}`)
      .then(r => (r.ok ? r.json() : { alerts: [] }))
      .then(d => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => setAlerts([]))
  }, [variant])
  useEffect(() => { load() }, [load])

  const open = useMemo(() => (alerts || []).filter(a => !a.settled), [alerts])
  useEffect(() => { if (alerts) onCount?.(open.length) }, [alerts, open.length, onCount])

  const patch = async (body: Record<string, unknown>): Promise<void> => {
    setBusyId(String(body.settlementId)); setError('')
    try {
      const r = await fetch('/api/payroll/hmo-settlement-alerts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (r.status === 409 && !body.byHand) {
        // That cutoff's payslip is already final/locked — nothing can be added to it.
        const d = await r.json().catch(() => ({}))
        if (confirm(`${d.error || 'That payslip is already final.'}\n\nOK = it was already deducted on that payslip by hand. Cancel = pick another cutoff.`)) {
          return await patch({ ...body, byHand: true })
        }
      } else if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not save')
      load()
    } finally {
      setBusyId('')
    }
  }
  const record = (settlementId: string) => {
    const cutoff = cutoffFor[settlementId]
    if (!cutoff) { setError('Choose the cutoff to deduct it in first.'); return }
    patch({ settlementId, cutoff })
  }
  const undo = (settlementId: string) => {
    if (!confirm('Reopen this PF adjustment? It comes off that cutoff\'s payslip and goes back on the to-recover list.')) return
    patch({ settlementId, undo: true })
  }

  const total = open.reduce((s, a) => s + a.overpaid, 0)
  const byConsultant = open.reduce<Record<string, number>>((m, a) => { m[a.consultant] = (m[a.consultant] || 0) + a.overpaid; return m }, {})
  const headline = `PF overpaid after HMO decreases & voids: ${formatCurrency(total)} across ${open.length} session${open.length === 1 ? '' : 's'} — ${Object.entries(byConsultant).map(([n, v]) => `${n} ${formatCurrency(v)}`).join(' · ')}`

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
  const deducted = alerts.filter(a => a.settled).length
  const list = hideDeducted ? open : alerts
  const settledToggle = (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
      <input type="checkbox" checked={hideDeducted} onChange={e => setHideDeducted(e.target.checked)} />
      Hide deducted
    </label>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold" style={{ color: open.length ? '#92400e' : 'var(--mid-gray)' }}>
          {open.length ? <><AlertTriangle size={16} /> {headline}</> : <span className="font-normal">No PF left to recover.</span>}
          {deducted > 0 && <span className="text-xs" style={{ color: '#166534' }}>· {deducted} deducted</span>}
        </p>
        {settledToggle}
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
        These sessions were decreased to what the HMO paid, or voided (e.g. a confirmed duplicate), after their PF was released at the
        billed amount — a voided session earns no PF, so all of it is overpaid (unless it was re-entered as a corrected order for the
        same patient, day and clinician, which keeps the PF). Nothing is deducted until you pick the cutoff to deduct it in and
        press <strong>Record</strong>: that cutoff&apos;s payslip for the consultant, at the branch that paid the PF, then carries a
        highlighted <strong>PF recovery</strong> line (generate or re-save it to pick the line up) and the row turns green.
        <strong> Undo</strong> takes the line off that payslip again and puts the row back to open. If that cutoff&apos;s payslip is
        already final or locked you&apos;ll be asked whether it was deducted there by hand. <strong>Outside hub</strong> = the session&apos;s payroll was run
        before the hub (Jan–Mar 2026): PF paid is the rule at the billed amount, so confirm it against the payslip.
      </p>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}

      {!list.length ? (
        <div className="rounded-xl border px-4 py-6 text-sm text-center" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          {hideDeducted && alerts.length ? 'Every session here has been deducted.' : 'When a session is decreased with “Decrease due to HMO Payment”, or its HMO order is voided, after its PF was released, it appears here.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: '#fde68a' }}>
          <table className="w-full text-xs" style={{ color: 'var(--charcoal)' }}>
            <thead>
              <tr style={{ background: '#fef3c7', color: '#92400e' }}>
                {['Consultant', 'PF paid in', 'Order', 'Session', 'Patient', 'Billed → HMO paid', 'PF paid', 'PF per rule', 'Overpaid', 'Deduct in cutoff'].map(h => (
                  <th key={h} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={`${a.settlementId}-${a.consultant}-${a.cutoffPeriod}-${i}`} className="border-t"
                  style={a.settled ? { borderColor: '#bbf7d0', background: '#dcfce7' } : { borderColor: '#fef3c7' }}>
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
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {formatCurrency(a.billedAmount)} → {a.voided ? <span className="font-semibold" style={{ color: '#991b1b' }}>voided</span> : formatCurrency(a.paidAmount)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.pfPaid)}{a.quantity !== 1 ? ` × ${a.quantity}` : ''}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCurrency(a.pfPolicy)}</td>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ color: a.settled ? '#166534' : '#b91c1c' }}>{formatCurrency(a.overpaid)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {a.settled ? (
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#bbf7d0', color: '#166534' }}
                          title={[a.resolvedBy && `Recorded by ${a.resolvedBy}`, a.resolvedAt && formatDate(a.resolvedAt),
                            a.resolvedNote?.toLowerCase().startsWith('by hand') ? `Deducted by hand${a.resolvedNote.length > 7 ? ` ${a.resolvedNote.slice(7)}` : ''}` : 'On that cutoff\'s payslip as a PF recovery line',
                            a.resolvedNote && !a.resolvedNote.toLowerCase().startsWith('by hand') ? a.resolvedNote : null].filter(Boolean).join(' · ')}>
                          <CheckCircle2 size={11} /> {a.deductedCutoff ? cutoffLabel(a.deductedCutoff) : 'Settled'}
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
                          {options.filter(o => a.source !== 'HUB' || !a.cutoffPeriod || o > a.cutoffPeriod).map(o => <option key={o} value={o}>{cutoffLabel(o)}</option>)}
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
