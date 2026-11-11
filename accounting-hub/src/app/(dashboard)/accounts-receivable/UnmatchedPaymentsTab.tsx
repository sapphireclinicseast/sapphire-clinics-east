'use client'

// Accounts Receivable → HMO → Unmatched Payments (Hannah 2026-11-11: "a
// subsection for the amount paid to us but we can't reconcile with any sessions
// we have").
//
// Money an HMO paid us that is not matched to any of our sessions — a claim paid
// twice, a voucher line with no session left. Record Payment parks it as the
// payment's overpayment in 4050 Unearned Revenue: owed back to the HMO until they
// confirm which sessions it is for, or it is refunded. Excess already explained
// and booked elsewhere (e.g. a VAT top-up to 4080) is shown on request.
// Read-only: the amounts come from Payment History → Record Payment.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { downloadXlsx } from '@/lib/export'

interface UnmatchedRow {
  id: string
  paymentDate: string
  hmo: string
  branch: string | null
  ref: string
  notes: string
  cash: number
  ewt: number
  gross: number
  matched: number
  unmatched: number
  sessions: number
  account: string
  held: boolean
  cashAccount: string
  inLedger: boolean
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

export default function UnmatchedPaymentsTab({ branch }: { branch: string }) {
  const [rows, setRows] = useState<UnmatchedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fHmo, setFHmo] = useState('')
  const [showBooked, setShowBooked] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/accounts-receivable/unmatched?type=HMO${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not load unmatched payments'); setRows([]) }
      else setRows(d.rows ?? [])
    } catch {
      setError('Could not load unmatched payments.')
    } finally { setLoading(false) }
  }, [branch])

  useEffect(() => { load() }, [load])

  const hmos = useMemo(() => [...new Set(rows.map(r => r.hmo))].sort(), [rows])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (!showBooked && !r.held) return false
      if (fHmo && r.hmo !== fHmo) return false
      if (needle && !`${r.hmo} ${r.ref} ${r.notes} ${r.account}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, showBooked, fHmo, q])
  // Held totals per HMO — what is still owed back / waiting to be matched.
  const heldByHmo = useMemo(() => {
    const m = new Map<string, { amount: number; count: number }>()
    for (const r of rows) {
      if (!r.held) continue
      const t = m.get(r.hmo) || { amount: 0, count: 0 }
      m.set(r.hmo, { amount: t.amount + r.unmatched, count: t.count + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount)
  }, [rows])
  const heldTotal = heldByHmo.reduce((s, [, t]) => s + t.amount, 0)
  const bookedCount = rows.filter(r => !r.held).length
  const totals = useMemo(() => shown.reduce((t, r) => ({
    cash: t.cash + r.cash, gross: t.gross + r.gross, matched: t.matched + r.matched, unmatched: t.unmatched + r.unmatched,
  }), { cash: 0, gross: 0, matched: 0, unmatched: 0 }), [shown])

  const status = (r: UnmatchedRow) => r.held ? 'Held — owed to the HMO' : `Booked to ${r.account || '—'}`
  const exportXlsx = () => downloadXlsx('Unmatched Payments.xlsx', [{
    name: 'Unmatched Payments',
    headers: ['Date', 'HMO', 'Branch', 'AR Ref', 'Cash Received', 'EWT', 'Gross Paid', 'Matched to Sessions', 'Sessions', 'Unmatched', 'Status', 'Account', 'In Ledger', 'Notes'],
    rows: shown.map(r => [
      r.paymentDate.slice(0, 10), r.hmo, branchLabel(r.branch || '') || '', r.ref, r.cash, r.ewt, r.gross, r.matched, r.sessions,
      r.unmatched, status(r), r.account, r.inLedger ? 'Yes' : 'No', r.notes,
    ]),
  }])
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const inp = 'px-3 py-2 rounded-lg border text-sm'
  const inpStyle = { borderColor: 'var(--light-gray)', background: '#fff' }

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#EFF6FF', color: '#1E3A8A', border: '1px solid #BFDBFE' }}>
        <strong>What is here:</strong> money an HMO paid us that we <strong>could not match to any of our sessions</strong> &mdash; for example a
        claim the HMO paid twice, or a voucher line with no session left. When the payment is recorded
        (<strong>Payment History &rsaquo; Record Payment</strong>), the sessions it really covers are tagged and the rest is kept as
        the payment&apos;s <strong>overpayment</strong> in <strong>4050 Unearned Revenue</strong> &mdash; owed back to the HMO until they
        confirm which sessions it is for, or it is refunded. Nothing here is counted as sales. This list is read-only.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl px-4 py-3 border" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Held — not matched to sessions</p>
          <p className="text-xl font-bold tabular-nums" style={{ color: '#1E3A8A' }}>{formatCurrency(heldTotal)}</p>
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            {heldByHmo.reduce((s, [, t]) => s + t.count, 0)} payment{heldByHmo.reduce((s, [, t]) => s + t.count, 0) === 1 ? '' : 's'} · 4050 Unearned Revenue
          </p>
        </div>
        {heldByHmo.map(([hmo, t]) => (
          <button key={hmo} type="button" onClick={() => setFHmo(f => (f === hmo ? '' : hmo))}
            className="rounded-xl px-4 py-3 border text-left"
            style={{ borderColor: fHmo === hmo ? '#1E3A8A' : 'var(--light-gray)', background: fHmo === hmo ? '#EFF6FF' : '#fff' }}
            title={fHmo === hmo ? 'Show all HMOs' : `Show only ${hmo}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>{hmo}</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.amount)}</p>
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{t.count} payment{t.count === 1 ? '' : 's'}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={inp} style={inpStyle} value={fHmo} onChange={e => setFHmo(e.target.value)} aria-label="HMO">
          <option value="">All HMOs</option>
          {hmos.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <input className={inp} style={{ ...inpStyle, minWidth: 220 }} placeholder="Search reference, notes…" value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
          title="Excess that was explained and booked to another account, e.g. a VAT top-up to 4080 Output VAT">
          <input type="checkbox" checked={showBooked} onChange={e => setShowBooked(e.target.checked)} />
          Also show excess already booked elsewhere{bookedCount ? ` (${bookedCount})` : ''}
        </label>
        <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          {loading ? 'Loading…' : `${shown.length} payment${shown.length === 1 ? '' : 's'}`}
        </span>
        <button onClick={exportXlsx} disabled={!shown.length}
          className="ml-auto px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)', background: '#fff' }}>
          Download Excel
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>{error}</div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#F7F9FA' }}>
              {['Date', 'HMO', 'Reference', 'Gross Paid', 'Matched to Sessions', 'Unmatched', 'Status'].map((h, i) => (
                <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--dark-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && shown.length === 0 && !error && (
              <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                {rows.length ? 'No unmatched payments match these filters.' : 'No unmatched payments — every peso received is matched to sessions.'}
              </td></tr>
            )}
            {shown.map(r => (
              <tr key={r.id} className="align-top" style={{ borderBottom: '1px solid #EEF1F3' }}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {fmtDate(r.paymentDate)}
                  <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{branchLabel(r.branch || '') || '—'}</span>
                </td>
                <td className="px-4 py-3 font-semibold" style={{ color: 'var(--dark-gray)' }}>{r.hmo}</td>
                <td className="px-4 py-3" style={{ maxWidth: 420 }}>
                  <span className="font-medium">{r.ref || '—'}</span>
                  {r.notes && (
                    <button type="button" onClick={() => toggle(r.id)} className="block text-left text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}
                      title={open.has(r.id) ? 'Show less' : 'Show the full note'}>
                      <span className={open.has(r.id) ? 'whitespace-pre-wrap' : 'line-clamp-2'}>{r.notes}</span>
                    </button>
                  )}
                  {!r.inLedger && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#FEE2E2', color: '#991B1B' }}
                      title="This payment has no standing journal entry, so the ledger does not show it yet">
                      not in the ledger
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums" title={`Cash ${formatCurrency(r.cash)} + EWT ${formatCurrency(r.ewt)}${r.cashAccount ? ` · ${r.cashAccount}` : ''}`}>
                  {formatCurrency(r.gross)}
                  <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>cash {formatCurrency(r.cash)}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {formatCurrency(r.matched)}
                  <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.sessions} session{r.sessions === 1 ? '' : 's'}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold tabular-nums" style={{ color: r.held ? '#1E3A8A' : 'var(--mid-gray)' }}>
                  {formatCurrency(r.unmatched)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={r.held ? { background: '#DBEAFE', color: '#1E3A8A' } : { background: '#F1F5F9', color: '#475569' }}>
                    {r.held ? 'Held — owed to the HMO' : 'Booked'}
                  </span>
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{r.account || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ background: '#F7F9FA', borderTop: '2px solid var(--light-gray)' }}>
                <td colSpan={3} className="px-4 py-3 font-semibold">Total</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{formatCurrency(totals.gross)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{formatCurrency(totals.matched)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums" style={{ color: '#1E3A8A' }}>{formatCurrency(totals.unmatched)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
