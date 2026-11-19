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
// The amounts are read-only (Payment History → Record Payment). The Reason
// column — why the excess exists, split by amount (Hannah 2026-11-19) — can be
// set here by accounting and the HMO officer (lib/unmatched-reasons).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Pencil } from 'lucide-react'
import { UNMATCHED_REASONS, REASON_WRITE_ROLES, reasonMeta, reasonsText, type UnmatchedReason, type UnmatchedReasonKey } from '@/lib/unmatched-reasons'
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
  reasons: UnmatchedReason[]
  /** No reasons saved yet; `reasons` is the hub's suggestion (12% of the sessions = VAT). */
  reasonsSuggested: boolean
}

type ReasonDraft = { reason: UnmatchedReasonKey; amount: string; note: string }

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

export default function UnmatchedPaymentsTab({ branch }: { branch: string }) {
  const [rows, setRows] = useState<UnmatchedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fHmo, setFHmo] = useState('')
  const [showBooked, setShowBooked] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const { data: session } = useSession()
  const canEditReasons = REASON_WRITE_ROLES.includes((session?.user as { role?: string })?.role || '')
  const [editing, setEditing] = useState<{ row: UnmatchedRow; lines: ReasonDraft[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const startEdit = (r: UnmatchedRow) => {
    setEditError('')
    const from = r.reasons.length ? r.reasons : [{ reason: 'PAID_TWICE' as UnmatchedReasonKey, amount: r.unmatched }]
    setEditing({ row: r, lines: from.map(l => ({ reason: l.reason, amount: String(l.amount), note: l.note || '' })) })
  }
  const saveReasons = async () => {
    if (!editing) return
    const lines = editing.lines
      .map(l => ({ reason: l.reason, amount: Math.round((Number(l.amount) || 0) * 100) / 100, note: l.note.trim() }))
      .filter(l => l.amount > 0)
    const sum = lines.reduce((t, l) => t + l.amount, 0)
    if (sum > editing.row.unmatched + 0.005) { setEditError(`The amounts add up to ${formatCurrency(sum)}, more than the ${formatCurrency(editing.row.unmatched)} unmatched.`); return }
    setSaving(true); setEditError('')
    try {
      const res = await fetch('/api/accounts-receivable/unmatched', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.row.id, reasons: lines }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setEditError(d.error || 'Could not save the reasons'); return }
      setRows(rs => rs.map(x => (x.id === editing.row.id ? { ...x, reasons: d.reasons ?? lines, reasonsSuggested: false } : x)))
      setEditing(null)
    } catch { setEditError('Could not reach the server.') } finally { setSaving(false) }
  }

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
    headers: ['Date', 'HMO', 'Branch', 'AR Ref', 'Cash Received', 'EWT', 'Gross Paid', 'Matched to Sessions', 'Sessions', 'Unmatched', 'Reason', 'Status', 'Account', 'In Ledger', 'Notes'],
    rows: shown.map(r => [
      r.paymentDate.slice(0, 10), r.hmo, branchLabel(r.branch || '') || '', r.ref, r.cash, r.ewt, r.gross, r.matched, r.sessions,
      r.unmatched, `${reasonsText(r.reasons, r.unmatched)}${r.reasonsSuggested && r.reasons.length ? ' (suggested)' : ''}`, status(r), r.account, r.inLedger ? 'Yes' : 'No', r.notes,
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
        confirm which sessions it is for, or it is refunded. Nothing here is counted as sales. The amounts are read-only; the
        <strong> Reason</strong> column says why each excess exists (VAT the HMO added, a claim paid twice, paid above what we billed).
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
              {['Date', 'HMO', 'Reference', 'Gross Paid', 'Matched to Sessions', 'Unmatched', 'Reason', 'Status'].map((h, i) => (
                <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--dark-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && shown.length === 0 && !error && (
              <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
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
                <td className="px-4 py-3" style={{ minWidth: 200, maxWidth: 300 }}>
                  {(() => {
                    const rest = Math.round((r.unmatched - r.reasons.reduce((t, x) => t + x.amount, 0)) * 100) / 100
                    return (
                      <div className="flex flex-col gap-1">
                        {r.reasons.map((x, i) => {
                          const m = reasonMeta(x.reason)
                          return (
                            <div key={i} className="text-[11px] leading-snug">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: m.bg, color: m.fg }}
                                title={m.label}>
                                {m.short} <span className="tabular-nums font-mono">{formatCurrency(x.amount)}</span>
                              </span>
                              {x.note && <span className="block mt-0.5" style={{ color: 'var(--mid-gray)' }}>{x.note}</span>}
                            </div>
                          )
                        })}
                        {rest > 0.005 && (
                          <span className="w-fit px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: '#F1F5F9', color: '#475569' }}>
                            Not yet identified <span className="tabular-nums font-mono">{formatCurrency(rest)}</span>
                          </span>
                        )}
                        {r.reasonsSuggested && r.reasons.length > 0 && (
                          <span className="text-[10px] italic" style={{ color: 'var(--mid-gray)' }}>Suggested — not saved yet</span>
                        )}
                        {canEditReasons && (
                          <button type="button" onClick={() => startEdit(r)}
                            className="w-fit inline-flex items-center gap-1 text-[11px] font-medium hover:underline" style={{ color: 'var(--teal)' }}>
                            <Pencil size={10} /> {r.reasons.length && !r.reasonsSuggested ? 'Edit' : 'Set reason'}
                          </button>
                        )}
                      </div>
                    )
                  })()}
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
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (() => {
        const sum = editing.lines.reduce((t, l) => t + (Number(l.amount) || 0), 0)
        const rest = Math.round((editing.row.unmatched - sum) * 100) / 100
        const setLine = (i: number, patch: Partial<ReasonDraft>) =>
          setEditing(e => (e ? { ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : e))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.45)' }}
            onClick={() => { if (!saving) setEditing(null) }}>
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reason-title">
              <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                <h3 id="reason-title" className="text-base font-semibold" style={{ color: 'var(--charcoal)' }}>Why was this paid above the sessions?</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                  {editing.row.ref || 'Payment'} · {editing.row.hmo} · <span className="font-mono">{formatCurrency(editing.row.unmatched)}</span> unmatched.
                  Split it by reason; anything left reads &ldquo;Not yet identified&rdquo;. Only the reason is saved — no amount or journal entry changes.
                </p>
              </div>
              <div className="px-5 py-4 space-y-2">
                {editing.lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_28px] gap-2 items-start">
                    <div className="space-y-1">
                      <select value={l.reason} onChange={e => setLine(i, { reason: e.target.value as UnmatchedReasonKey })}
                        className="w-full px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} aria-label="Reason">
                        {UNMATCHED_REASONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                      <input value={l.note} onChange={e => setLine(i, { note: e.target.value })} maxLength={300}
                        placeholder="Note — e.g. Trillanes Apr 22 LOA paid again"
                        className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <input value={l.amount} onChange={e => setLine(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal"
                      className="px-2 py-1.5 rounded-lg border text-sm text-right font-mono" style={{ borderColor: 'var(--light-gray)' }} aria-label="Amount" />
                    <button type="button" onClick={() => setEditing(e => (e ? { ...e, lines: e.lines.filter((_, j) => j !== i) } : e))}
                      className="py-1.5 text-sm" style={{ color: 'var(--mid-gray)' }} aria-label="Remove this reason">✕</button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={() => setEditing(e => (e ? { ...e, lines: [...e.lines, { reason: 'PAID_TWICE', amount: rest > 0 ? String(rest) : '', note: '' }] } : e))}
                    className="text-xs font-medium hover:underline" style={{ color: 'var(--teal)' }}>+ Add a reason</button>
                  <span className="text-xs" style={{ color: rest < -0.005 ? '#B91C1C' : 'var(--mid-gray)' }}>
                    {rest < -0.005 ? `${formatCurrency(-rest)} over the unmatched amount` : rest > 0.005 ? `${formatCurrency(rest)} not yet identified` : 'All of it explained'}
                  </span>
                </div>
                {editError && <p className="text-xs font-medium" style={{ color: '#B91C1C' }}>{editError}</p>}
              </div>
              <div className="px-5 pb-5 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                <button type="button" onClick={saveReasons} disabled={saving || rest < -0.005}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
