'use client'

// POS → Services → Uncharged Cancellations (lib/pos/uncharged-cancellations).
//
// Missed bookings a fee is owed on that nobody charged: no-shows, and the 3rd
// cancellation or reschedule onward in 180 days (GL-logged sessions from the
// first). Guarantee-letter patients are charged to their letter from here,
// dated on the booking; families pay at their next New Payment, which shows
// the same list for that patient. Admins and accountants can waive.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Ban, Loader2, RefreshCw, Search } from 'lucide-react'
import { HrNoticeModal, hrBtn } from '@/components/ui/hr-look'
import { formatCurrency } from '@/lib/utils'
import { PARKED_FEE_WAIVE_ROLES, RETRO_CANCEL_COLOR } from '@/lib/pos/retro-cancellation'

export interface UnchargedRow {
  scheduleId: string; patientId: string; patientName: string; branch: string
  date: string; startTime: string; status: 'CANCELLED' | 'RESCHEDULED' | 'NO_SHOW'
  detail: string; department: string; therapist: string; logged: boolean; why: string
  feeServiceId: string | null; feeName: string; amount: number
  state: 'UNCHARGED' | 'PAID' | 'PARKED' | 'WAIVED'; orderNumber: number | null; note: string | null
  gl: { walletId: string; letter: string; balance: number; canCharge: boolean } | null
}

const WHAT: Record<string, string> = { CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', NO_SHOW: 'No-show' }
const STATE_PILL: Record<string, { bg: string; fg: string; text: string }> = {
  UNCHARGED: { bg: '#fef3c7', fg: '#92400e', text: 'Not charged' },
  PAID: { bg: '#dcfce7', fg: '#166534', text: 'Charged' },
  PARKED: { bg: '#ede9fe', fg: RETRO_CANCEL_COLOR, text: 'Parked' },
  WAIVED: { bg: '#f1f5f9', fg: '#475569', text: 'Waived' },
}
const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills' }
const day = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

export default function UnchargedCancellations({ branch, canSelectBranch, role }: {
  branch: string; canSelectBranch: boolean; role: string
}) {
  const [branchFilter, setBranchFilter] = useState(canSelectBranch ? '' : branch)
  const [showSettled, setShowSettled] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<UnchargedRow[] | null>(null)
  const [summary, setSummary] = useState<{ uncharged: number; amount: number; patients: number; gl: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [waive, setWaive] = useState<UnchargedRow | null>(null)
  const [waiveReason, setWaiveReason] = useState('')
  const [waiveError, setWaiveError] = useState<string | null>(null)
  const canWaive = PARKED_FEE_WAIVE_ROLES.includes(role)

  // The schedule read behind the list is held on the server for a few minutes
  // (it is the slow part); Refresh asks for a fresh one.
  const [scheduleAsOf, setScheduleAsOf] = useState<string | null>(null)
  const load = useCallback(async (fresh = false) => {
    setRows(null); setError(null)
    try {
      const qs = new URLSearchParams()
      if (branchFilter) qs.set('branch', branchFilter)
      if (showSettled) qs.set('all', '1')
      if (fresh) qs.set('fresh', '1')
      const r = await fetch(`/api/pos/uncharged-cancellations?${qs}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || `Could not load (${r.status})`); setRows([]); return }
      setRows(d.rows || []); setSummary(d.summary || null); setScheduleAsOf(d.scheduleAsOf || null)
    } catch {
      setError('Could not reach the server.'); setRows([])
    }
  }, [branchFilter, showSettled])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const m = new Map<string, { name: string; rows: UnchargedRow[] }>()
    for (const r of rows || []) {
      if (term && !r.patientName.toLowerCase().includes(term)) continue
      if (!m.has(r.patientId)) m.set(r.patientId, { name: r.patientName, rows: [] })
      m.get(r.patientId)!.rows.push(r)
    }
    return [...m.entries()]
  }, [rows, q])

  const charge = async (r: UnchargedRow) => {
    setBusy(r.scheduleId); setConfirming(null); setNotice(null)
    try {
      const res = await fetch('/api/pos/uncharged-cancellations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'charge-gl', patientId: r.patientId, scheduleId: r.scheduleId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice(`${r.patientName}: ${d.error || 'Could not charge'}`); return }
      setNotice(d.outcome === 'CHARGED'
        ? `${r.patientName}: ${formatCurrency(r.amount)} charged to ${d.letter} on order #${d.orderNumber}, dated ${day(r.date)}.`
        : `${r.patientName}: no letter has room, so the ${formatCurrency(r.amount)} fee is parked — it goes on their next letter.`)
      load()
    } finally {
      setBusy(null)
    }
  }

  const confirmWaive = async () => {
    if (!waive) return
    if (waiveReason.trim().length < 3) { setWaiveError('Say why the fee is waived.'); return }
    setBusy(waive.scheduleId); setWaiveError(null)
    try {
      const res = await fetch('/api/pos/uncharged-cancellations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'waive', patientId: waive.patientId, scheduleId: waive.scheduleId, reason: waiveReason.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setWaiveError(d.error || 'Could not waive'); return }
      setNotice(`${waive.patientName}: ${formatCurrency(waive.amount)} for ${day(waive.date)} waived.`)
      setWaive(null); load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white px-5 py-4" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Uncharged cancellations</h2>
            <p className="text-xs mt-0.5 max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
              Missed bookings from the clinic schedule that a fee is owed on but nobody charged: every no-show, and the 3rd cancellation or
              reschedule onward in 180 days (a session logged as guarantee-letter-funded, from the first). Waived and therapist-cancelled
              bookings don&apos;t count. Guarantee-letter patients are charged to their letter here, dated on the booking; families pay at their next
              New Payment, which shows these for that patient. Before Nov 18, 2026 only fees a letter can still take are listed.
            </p>
          </div>
          {summary && (
            <div className="flex-none rounded-xl border px-4 py-2 text-right" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
              <p className="text-[11px] font-semibold uppercase tracking-[.4px]" style={{ color: '#92400e' }}>Not charged</p>
              <p className="text-lg font-bold font-mono" style={{ color: '#92400e' }}>{formatCurrency(summary.amount)}</p>
              <p className="text-[11px]" style={{ color: '#92400e' }}>
                <span className="font-mono">{summary.uncharged}</span> fee{summary.uncharged === 1 ? '' : 's'} · <span className="font-mono">{summary.patients}</span> patient{summary.patients === 1 ? '' : 's'}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a patient…"
              className="h-8 pl-8 pr-3 rounded-lg border text-[13px] bg-white w-56" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          {canSelectBranch && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="h-8 px-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">All branches</option>
              <option value="SANDBOX_EAST">East</option>
              <option value="SANDBOX_GREENHILLS">Greenhills</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} />
            Also show charged, parked and waived
          </label>
          <button onClick={() => load(true)} disabled={rows === null} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)' }}
            title="Read the clinic schedule again now"><RefreshCw size={12} /> Refresh</button>
          {scheduleAsOf && rows !== null && (
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              Schedule as of <span className="font-mono">{new Date(scheduleAsOf).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</span>
            </span>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border px-4 py-2.5 text-xs flex items-start justify-between gap-3" style={{ borderColor: '#ddd6fe', background: '#f5f3ff', color: RETRO_CANCEL_COLOR }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="flex-none font-semibold">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border px-4 py-2.5 text-xs flex items-center gap-2" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          <AlertCircle size={14} /> {error} — the list can&apos;t say what is owed until the schedule can be read.
        </div>
      )}

      <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {rows === null ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>{error ? '—' : 'No uncharged cancellations.'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <th className="px-4 py-2 text-left font-semibold">Booking</th>
                <th className="px-4 py-2 text-left font-semibold">Therapist</th>
                <th className="px-4 py-2 text-left font-semibold">Why a fee</th>
                <th className="px-4 py-2 text-left font-semibold">Fee</th>
                <th className="px-4 py-2 text-right font-semibold">Amount</th>
                <th className="px-4 py-2 text-left font-semibold">Pays</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {groups.flatMap(([pid, g]) => {
                const owed = g.rows.filter(r => r.state === 'UNCHARGED')
                return [
                  <tr key={`${pid}-h`} className="border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head, #f8faf5)' }}>
                    <td colSpan={4} className="px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {g.name}
                      <span className="ml-2 text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[g.rows[0].branch] || g.rows[0].branch}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: owed.length ? '#92400e' : 'var(--mid-gray)' }}>
                      {formatCurrency(owed.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      <span className="font-mono">{owed.length}</span> not charged
                    </td>
                  </tr>,
                  ...g.rows.map(r => {
                    const pill = STATE_PILL[r.state]
                    return (
                      <tr key={r.scheduleId} className="border-b text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-4 py-2" style={{ color: 'var(--charcoal)' }}>
                          <span className="font-medium">{WHAT[r.status]}</span> · <span className="font-mono">{day(r.date)}</span>
                          <span style={{ color: 'var(--mid-gray)' }}> {r.startTime}</span>
                          {!r.logged && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#f1f5f9', color: '#475569' }} title="Never logged in Patient Relationship — found on the clinic schedule">not logged</span>}
                        </td>
                        <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{r.department} · {r.therapist}</td>
                        <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{r.why}</td>
                        <td className="px-4 py-2" style={{ color: 'var(--charcoal)' }}>{r.feeName}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatCurrency(r.amount)}</td>
                        <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>
                          {r.state !== 'UNCHARGED' ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: pill.bg, color: pill.fg }}>{pill.text}</span>
                              {r.orderNumber ? <span className="font-mono">#{r.orderNumber}</span> : null}
                              {r.note && <span className="truncate max-w-[180px]" title={r.note}>{r.note}</span>}
                            </span>
                          ) : r.gl ? (
                            <span title={r.gl.letter}>
                              Letter <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{r.gl.letter}</span>
                              {' · '}<span className="font-mono">{formatCurrency(r.gl.balance)}</span> left
                            </span>
                          ) : 'Family — collect at New Payment'}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {r.state === 'UNCHARGED' && r.gl && (
                            confirming === r.scheduleId ? (
                              <span className="inline-flex items-center gap-1.5">
                                <button onClick={() => charge(r)} disabled={busy === r.scheduleId}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white" style={{ background: RETRO_CANCEL_COLOR }}>
                                  {busy === r.scheduleId ? <Loader2 size={11} className="animate-spin inline" /> : null} Confirm {formatCurrency(r.amount)}
                                </button>
                                <button onClick={() => setConfirming(null)} className="text-[11px] underline" style={{ color: 'var(--mid-gray)' }}>Cancel</button>
                              </span>
                            ) : (
                              <button onClick={() => setConfirming(r.scheduleId)} disabled={!!busy}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border" style={{ borderColor: RETRO_CANCEL_COLOR, color: RETRO_CANCEL_COLOR }}
                                title={r.gl.canCharge ? `Charge to ${r.gl.letter}, dated on the booking` : 'No room on this letter — it goes on a later application, or is parked for the next one'}>
                                {r.gl.canCharge ? 'Charge to letter' : 'Charge / park'}
                              </button>
                            )
                          )}
                          {r.state === 'UNCHARGED' && canWaive && (
                            <button onClick={() => { setWaive(r); setWaiveReason(''); setWaiveError(null) }} disabled={!!busy}
                              className="ml-2 text-[11px] font-semibold underline" style={{ color: '#b91c1c' }}>Waive</button>
                          )}
                        </td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>

      {waive && (
        <HrNoticeModal icon={<Ban size={18} />} tone="amber" title="Waive this fee?"
          subtitle="The booking won't be flagged again. The waiver is recorded with your name and reason."
          onClose={() => busy !== waive.scheduleId && setWaive(null)}
          footer={<>
            <button className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)' }} onClick={() => setWaive(null)}>Cancel</button>
            <button className={`${hrBtn.primary} ml-auto`} style={{ background: '#b91c1c' }} onClick={confirmWaive} disabled={busy === waive.scheduleId}>
              {busy === waive.scheduleId && <Loader2 size={14} className="animate-spin" />} Waive <span className="font-mono">{formatCurrency(waive.amount)}</span>
            </button>
          </>}>
          <div className="rounded-lg px-3 py-2.5 text-[13px]" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <p className="font-semibold">{waive.patientName}</p>
            <p style={{ color: 'var(--mid-gray)' }}>{waive.feeName} · <span className="font-mono">{formatCurrency(waive.amount)}</span></p>
            <p style={{ color: 'var(--mid-gray)' }}>{waive.detail}</p>
          </div>
          <label className="block pt-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Reason</span>
            <textarea value={waiveReason} onChange={e => setWaiveReason(e.target.value)} rows={2} maxLength={500} autoFocus
              placeholder="e.g. Therapist was on leave that day"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </label>
          {waiveError && <p className="text-[12px]" style={{ color: '#b91c1c' }}>{waiveError}</p>}
        </HrNoticeModal>
      )}
    </div>
  )
}
