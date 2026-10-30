'use client'

// Accounts Receivable → Revised Session Amount.
//
// Every HMO session whose amount was decreased to what the HMO actually paid,
// with the amount the hub had before and after. Read-only on purpose: a session
// only lands here through "Decrease due to HMO Payment" — at the front desk
// (POS → Orders) or while recording the payment (Payment History → Record
// Payment) — so the sale, the GL and the payroll alert all move together.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { downloadXlsx } from '@/lib/export'

interface RevisedRow {
  id: string
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
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

export default function RevisedSessionsTab({ branch }: { branch: string }) {
  const [rows, setRows] = useState<RevisedRow[]>([])
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
      if (!r.ok) { setError(d.error ?? 'Could not load revised sessions'); setRows([]) }
      else setRows(d.rows ?? [])
    } catch {
      setError('Could not load revised sessions.')
    } finally { setLoading(false) }
  }, [branch])

  useEffect(() => { load() }, [load])

  const hmos = useMemo(() => [...new Set(rows.map(r => r.hmo).filter(Boolean))].sort(), [rows])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      const day = r.date.slice(0, 10)
      if (fHmo && r.hmo !== fHmo) return false
      if (from && day < from) return false
      if (to && day > to) return false
      if (needle && !`${r.orderNumber} ${r.service} ${r.patient} ${r.clinician} ${r.hmo} ${r.reference ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, fHmo, from, to, q])
  const totals = useMemo(() => shown.reduce((t, r) => ({
    original: t.original + r.originalAmount, revised: t.revised + r.revisedAmount, diff: t.diff + r.difference,
  }), { original: 0, revised: 0, diff: 0 }), [shown])

  const exportXlsx = () => downloadXlsx('Revised Session Amounts.xlsx', [{
    name: 'Revised Sessions',
    headers: ['Date', 'Order #', 'Branch', 'Service', 'Patient', 'Clinician', 'HMO', 'Original Amount', 'Revised Amount', 'Decrease', 'Reference', 'Note', 'Revised By', 'Revised On'],
    rows: shown.map(r => [
      r.date.slice(0, 10), r.orderNumber, branchLabel(r.branch), r.service, r.patient, r.clinician, r.hmo,
      r.originalAmount, r.revisedAmount, r.difference, r.reference ?? '', r.note ?? '', r.revisedBy ?? '', r.revisedAt.slice(0, 10),
    ]),
  }])

  const inp = 'px-3 py-2 rounded-lg border text-sm'
  const inpStyle = { borderColor: 'var(--light-gray)', background: '#fff' }

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D' }}>
        <strong>How a session gets here:</strong> its amount has to be revised with <strong>&ldquo;Decrease due to HMO Payment&rdquo;</strong>,
        either by the front desk (<strong>POS &rsaquo; Orders</strong>) or while recording the payment
        (<strong>Accounts Receivable &rsaquo; Payment History &rsaquo; Record Payment</strong>). Revising there also corrects the sale,
        the ledger and flags any PF overpaid in Payroll. This list is read-only.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={inp} style={inpStyle} value={fHmo} onChange={e => setFHmo(e.target.value)}>
          <option value="">All HMOs</option>
          {hmos.map(h => <option key={h} value={h}>{h}</option>)}
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
              {['Date', 'Service', 'Patient', 'Clinician', 'HMO', 'Original Amount', 'Revised Amount', 'Decrease'].map((h, i) => (
                <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 5 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--dark-gray)', borderBottom: '1px solid var(--light-gray)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && shown.length === 0 && !error && (
              <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                No revised sessions{rows.length ? ' match these filters' : ' yet'}.
              </td></tr>
            )}
            {shown.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #EEF1F3' }}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {fmtDate(r.date)}
                  <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>#{r.orderNumber} · {branchLabel(r.branch)}</span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ maxWidth: 280 }}>{r.service || '—'}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: 'var(--dark-gray)' }}>{r.patient || '—'}</td>
                <td className="px-4 py-3">{r.clinician || '—'}</td>
                <td className="px-4 py-3">{r.hmo || '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.originalAmount)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap"
                    title={[r.revisedBy && `Revised by ${r.revisedBy} on ${fmtDate(r.revisedAt)}`, r.reference && `Ref ${r.reference}`, r.note].filter(Boolean).join('\n')}>
                  <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.revisedAmount)}</span>
                  {r.reference && <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.reference}</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium" style={{ color: '#B91C1C' }}>−{formatCurrency(r.difference)}</td>
              </tr>
            ))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ background: '#F7F9FA', borderTop: '2px solid var(--light-gray)' }}>
                <td colSpan={5} className="px-4 py-3 font-semibold">Total</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(totals.original)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(totals.revised)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap" style={{ color: '#B91C1C' }}>−{formatCurrency(totals.diff)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
