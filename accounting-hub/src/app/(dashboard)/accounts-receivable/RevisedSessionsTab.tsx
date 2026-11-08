'use client'

// Accounts Receivable → Session Adjustments (was "Revised Session Amount";
// Hannah 2026-11-09: a more general name that also covers voided orders).
//
// Every HMO session whose amount was decreased to what the HMO actually paid,
// and every HMO session that was voided (e.g. a confirmed duplicate), with the
// amount before and after. Read-only on purpose: a session only lands here
// through "Decrease due to HMO Payment" (POS → Orders, or Payment History →
// Record Payment) or by voiding the order in POS — so the sale, the GL and the
// payroll PF alert all move together. Payroll roles also see the PF released on
// each session that is still to be recovered.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { downloadXlsx } from '@/lib/export'

interface RevisedRow {
  id: string
  kind: 'REVISED' | 'VOIDED'
  orderId: string
  orderNumber: number
  date: string
  branch: string
  service: string
  patient: string
  clinician: string
  hmo: string
  originalAmount: number
  revisedAmount: number
  difference: number
  reference: string | null
  note: string | null
  revisedBy: string | null
  revisedAt: string
  // Payroll roles only: PF released on the session — still to deduct / already deducted.
  pf?: { toRecover: number; recovered: number; cutoffs: string[]; consultants: string[]; outsideHub: boolean } | null
}

const KIND_LABEL: Record<RevisedRow['kind'], string> = { REVISED: 'Amount revised', VOIDED: 'Voided' }

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

export default function RevisedSessionsTab({ branch }: { branch: string }) {
  const [rows, setRows] = useState<RevisedRow[]>([])
  const [showPf, setShowPf] = useState(false)
  const [fKind, setFKind] = useState<'' | RevisedRow['kind']>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fHmo, setFHmo] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/accounts-receivable/revised-sessions${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not load session adjustments'); setRows([]) }
      else { setRows(d.rows ?? []); setShowPf(!!d.showPf) }
    } catch {
      setError('Could not load session adjustments.')
    } finally { setLoading(false) }
  }, [branch])

  useEffect(() => { load() }, [load])

  const hmos = useMemo(() => [...new Set(rows.map(r => r.hmo).filter(Boolean))].sort(), [rows])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      const day = r.date.slice(0, 10)
      if (fHmo && r.hmo !== fHmo) return false
      if (fKind && r.kind !== fKind) return false
      if (from && day < from) return false
      if (to && day > to) return false
      if (needle && !`${r.orderNumber} ${r.service} ${r.patient} ${r.clinician} ${r.hmo} ${r.reference ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, fHmo, fKind, from, to, q])
  const totals = useMemo(() => shown.reduce((t, r) => ({
    original: t.original + r.originalAmount, revised: t.revised + r.revisedAmount, diff: t.diff + r.difference,
    pf: t.pf + (r.pf?.toRecover || 0),
  }), { original: 0, revised: 0, diff: 0, pf: 0 }), [shown])
  const pfText = (r: RevisedRow) => {
    if (!r.pf) return ''
    const parts: string[] = []
    if (r.pf.toRecover > 0) parts.push(`${formatCurrency(r.pf.toRecover)} to recover${r.pf.outsideHub ? ' (paid outside the hub — check the payslip)' : ''}`)
    if (r.pf.recovered > 0) parts.push(`${formatCurrency(r.pf.recovered)} deducted${r.pf.cutoffs.length ? ` in ${r.pf.cutoffs.join(', ')}` : ''}`)
    return parts.join(' · ')
  }

  const exportXlsx = () => downloadXlsx('Session Adjustments.xlsx', [{
    name: 'Session Adjustments',
    headers: ['Date', 'Order #', 'Branch', 'Type', 'Service', 'Patient', 'Clinician', 'HMO', 'Original Amount', 'Adjusted Amount', 'Decrease',
      ...(showPf ? ['PF to Recover', 'PF Deducted'] : []), 'Reference', 'Note', 'Adjusted By', 'Adjusted On'],
    rows: shown.map(r => [
      r.date.slice(0, 10), r.orderNumber, branchLabel(r.branch), KIND_LABEL[r.kind], r.service, r.patient, r.clinician, r.hmo,
      r.originalAmount, r.revisedAmount, r.difference,
      ...(showPf ? [r.pf?.toRecover || 0, r.pf?.recovered || 0] : []),
      r.reference ?? '', r.note ?? '', r.revisedBy ?? '', r.revisedAt.slice(0, 10),
    ]),
  }])

  const inp = 'px-3 py-2 rounded-lg border text-sm'
  const inpStyle = { borderColor: 'var(--light-gray)', background: '#fff' }

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D' }}>
        <strong>How a session gets here:</strong> its amount is revised with <strong>&ldquo;Decrease due to HMO Payment&rdquo;</strong>
        (by the front desk in <strong>POS &rsaquo; Orders</strong>, or while recording the payment in
        <strong> Accounts Receivable &rsaquo; Payment History &rsaquo; Record Payment</strong>), or the HMO order is
        <strong> voided</strong> in POS &mdash; for example a confirmed duplicate flagged in Per HMO. Either way the sale and the
        ledger are corrected, and any PF already paid out on the session shows as overpaid in
        <strong> Payroll &rsaquo; HMO PF Adjustments</strong> so it is deducted from the next payslip. This list is read-only.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={inp} style={inpStyle} value={fHmo} onChange={e => setFHmo(e.target.value)}>
          <option value="">All HMOs</option>
          {hmos.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select className={inp} style={inpStyle} value={fKind} onChange={e => setFKind(e.target.value as '' | RevisedRow['kind'])} aria-label="Adjustment type">
          <option value="">Revised and voided</option>
          <option value="REVISED">Amount revised</option>
          <option value="VOIDED">Voided</option>
        </select>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Session from</label>
        <input type="date" className={inp} style={inpStyle} value={from} onChange={e => setFrom(e.target.value)} />
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</label>
        <input type="date" className={inp} style={inpStyle} value={to} onChange={e => setTo(e.target.value)} />
        <input className={inp} style={{ ...inpStyle, minWidth: 220 }} placeholder="Search patient, clinician, service, order #…"
          value={q} onChange={e => setQ(e.target.value)} />
        <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          {loading ? 'Loading…' : `${shown.length} session${shown.length === 1 ? '' : 's'}`}
        </span>
        <button onClick={exportXlsx} disabled={!shown.length}
          className="ml-auto px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)', background: '#fff' }}>
          Download Excel
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
          {error}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#F7F9FA' }}>
              {['Date', 'Type', 'Service', 'Patient', 'Clinician', 'HMO', 'Original Amount', 'Adjusted Amount', 'Decrease', ...(showPf ? ['PF to Recover'] : [])].map((h, i) => (
                <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 6 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--dark-gray)', borderBottom: '1px solid var(--light-gray)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && shown.length === 0 && !error && (
              <tr><td colSpan={showPf ? 10 : 9} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                No session adjustments{rows.length ? ' match these filters' : ' yet'}.
              </td></tr>
            )}
            {shown.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #EEF1F3' }}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {fmtDate(r.date)}
                  <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>#{r.orderNumber} · {branchLabel(r.branch)}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={r.kind === 'VOIDED' ? { background: '#FEE2E2', color: '#991B1B' } : { background: '#FEF3C7', color: '#92400E' }}
                    title={r.kind === 'VOIDED' ? (r.note || 'Order voided') : 'Decreased to what the HMO paid'}>
                    {KIND_LABEL[r.kind]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ maxWidth: 280 }}>{r.service || '—'}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: 'var(--dark-gray)' }}>{r.patient || '—'}</td>
                <td className="px-4 py-3">{r.clinician || '—'}</td>
                <td className="px-4 py-3">{r.hmo || '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.originalAmount)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap"
                    title={[r.revisedBy && `${r.kind === 'VOIDED' ? 'Voided' : 'Revised'} by ${r.revisedBy} on ${fmtDate(r.revisedAt)}`, r.reference && `Ref ${r.reference}`, r.note].filter(Boolean).join('\n')}>
                  <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.revisedAmount)}</span>
                  {r.reference && <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.reference}</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium" style={{ color: '#B91C1C' }}>−{formatCurrency(r.difference)}</td>
                {showPf && (
                  <td className="px-4 py-3 text-right whitespace-nowrap" title={[pfText(r), r.pf?.consultants.length ? `PF released to ${r.pf.consultants.join(', ')}` : ''].filter(Boolean).join('\n') || 'No PF paid out on this session'}>
                    {r.pf && r.pf.toRecover > 0
                      ? <span className="font-semibold" style={{ color: '#B91C1C' }}>{formatCurrency(r.pf.toRecover)}</span>
                      : r.pf && r.pf.recovered > 0
                        ? <span className="text-xs" style={{ color: '#166534' }}>deducted{r.pf.cutoffs.length ? ` ${r.pf.cutoffs.join(', ')}` : ''}</span>
                        : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                    {r.pf?.outsideHub && r.pf.toRecover > 0 && <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>paid outside the hub</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ background: '#F7F9FA', borderTop: '2px solid var(--light-gray)' }}>
                <td colSpan={6} className="px-4 py-3 font-semibold">Total</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(totals.original)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(totals.revised)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap" style={{ color: '#B91C1C' }}>−{formatCurrency(totals.diff)}</td>
                {showPf && <td className="px-4 py-3 text-right font-semibold whitespace-nowrap" style={{ color: totals.pf > 0 ? '#B91C1C' : 'var(--mid-gray)' }}>{totals.pf > 0 ? formatCurrency(totals.pf) : '—'}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
