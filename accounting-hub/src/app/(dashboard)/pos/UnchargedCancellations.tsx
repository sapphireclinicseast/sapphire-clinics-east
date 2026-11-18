'use client'

// POS → Services → Uncharged Cancellations (lib/pos/uncharged-cancellations).
//
// Missed bookings a fee is owed on that nobody charged: no-shows, and the 3rd
// cancellation or reschedule onward in 180 days (GL-logged sessions from the
// first). Guarantee-letter patients are charged to their letter from here,
// dated on the booking; families pay at their next New Payment, which shows
// the same list for that patient. Admins and accountants can waive.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Ban, ChevronDown, Info, Loader2, RefreshCw, Search } from 'lucide-react'
import { HrNoticeModal, StatCard, hrBtn } from '@/components/ui/hr-look'
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

/** Shared with the New Payment reminder (pos/page.tsx). */
export const WHAT: Record<string, string> = { CANCELLED: 'Cancelled', RESCHEDULED: 'Rescheduled', NO_SHOW: 'No-show' }
const STATE_PILL: Record<string, { bg: string; fg: string; text: string }> = {
  UNCHARGED: { bg: '#fef3c7', fg: '#92400e', text: 'Not charged' },
  PAID: { bg: '#dcfce7', fg: '#166534', text: 'Charged' },
  PARKED: { bg: '#ede9fe', fg: RETRO_CANCEL_COLOR, text: 'Parked' },
  WAIVED: { bg: '#f1f5f9', fg: '#475569', text: 'Waived' },
}
const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills' }
// HR Hub look (Hannah 11/18: "improve this UI it seems difficult for the
// eyes"): stat cards that filter, one card for toolbar + table, a light
// patient line, two-line booking cells and a coloured edge per state.
type Show = UnchargedRow['state'] | 'ALL'
const STATES: UnchargedRow['state'][] = ['UNCHARGED', 'PAID', 'PARKED', 'WAIVED']
const EDGE: Record<string, string> = { UNCHARGED: '#d97706', PAID: '#059669', PARKED: RETRO_CANCEL_COLOR, WAIVED: '#cbd5e1' }
const SHOW_LABEL: Record<Show, string> = { UNCHARGED: 'Not charged', PAID: 'Charged', PARKED: 'Parked', WAIVED: 'Waived', ALL: 'All' }
const EMPTY: Record<Show, string> = {
  UNCHARGED: 'No uncharged cancellations.', PAID: 'Nothing charged yet.', PARKED: 'Nothing parked.', WAIVED: 'Nothing waived.', ALL: 'No fee-bearing cancellations.',
}
const BRANCH_OPTIONS = [['', 'All'], ['SANDBOX_EAST', 'East'], ['SANDBOX_GREENHILLS', 'Greenhills']] as const
const segOn = { background: 'var(--teal)', color: '#fff' }
const segOff = { background: '#fff', color: 'var(--mid-gray)' }
/** The reason a fee is owed, as shown under the booking. "no-show" would just repeat the status. */
export const whyText = (why: string) => (why.toLowerCase() === 'no-show' ? 'Fee on every no-show' : why.charAt(0).toUpperCase() + why.slice(1))
export const day = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

export default function UnchargedCancellations({ branch, canSelectBranch, role }: {
  branch: string; canSelectBranch: boolean; role: string
}) {
  const [branchFilter, setBranchFilter] = useState(canSelectBranch ? '' : branch)
  const [show, setShow] = useState<Show>('UNCHARGED')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<UnchargedRow[] | null>(null)
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
      // Every state, so the cards can count charged / parked / waived too.
      qs.set('all', '1')
      if (fresh) qs.set('fresh', '1')
      const r = await fetch(`/api/pos/uncharged-cancellations?${qs}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || `Could not load (${r.status})`); setRows([]); return }
      setRows(d.rows || []); setScheduleAsOf(d.scheduleAsOf || null)
    } catch {
      setError('Could not reach the server.'); setRows([])
    }
  }, [branchFilter])
  useEffect(() => { load() }, [load])

  // Per-state totals for the cards (the branch filter applies; search doesn't).
  const totals = useMemo(() => {
    const t = Object.fromEntries(STATES.map(k => [k, { n: 0, amount: 0, patients: new Set<string>() }])) as Record<string, { n: number; amount: number; patients: Set<string> }>
    for (const r of rows || []) { const x = t[r.state]; if (!x) continue; x.n++; x.amount += r.amount; x.patients.add(r.patientId) }
    return t
  }, [rows])
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const m = new Map<string, { name: string; rows: UnchargedRow[] }>()
    for (const r of rows || []) {
      if (show !== 'ALL' && r.state !== show) continue
      if (term && !r.patientName.toLowerCase().includes(term)) continue
      if (!m.has(r.patientId)) m.set(r.patientId, { name: r.patientName, rows: [] })
      m.get(r.patientId)!.rows.push(r)
    }
    return [...m.entries()]
  }, [rows, q, show])

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

  const loading = rows === null
  const nOf = (k: string) => totals[k]?.n || 0
  const pesoOf = (k: string) => formatCurrency(totals[k]?.amount || 0)
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  const toggle = (k: Show) => setShow(cur => (cur === k ? 'UNCHARGED' : k))

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Uncharged cancellations</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            Missed bookings that owe a fee nobody has charged yet.{' '}
            <button onClick={() => setRulesOpen(o => !o)} className="inline-flex items-center gap-0.5 font-semibold hover:underline" style={{ color: 'var(--teal)' }} aria-expanded={rulesOpen}>
              <Info size={12} /> How fees are counted <ChevronDown size={12} className={rulesOpen ? 'rotate-180' : ''} />
            </button>
          </p>
        </div>
        {scheduleAsOf && !loading && (
          <span className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>
            Clinic schedule as of <span className="font-mono">{new Date(scheduleAsOf).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</span>
          </span>
        )}
      </div>

      {rulesOpen && (
        <div className="rounded-lg border bg-white px-4 py-3 text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <ul className="list-disc pl-4 space-y-1">
            <li><b style={{ color: 'var(--charcoal)' }}>Who owes a fee:</b> every no-show, and the 3rd cancellation or reschedule onward in 180 days. For a session logged as guarantee-letter funded, from the first.</li>
            <li><b style={{ color: 'var(--charcoal)' }}>Not counted:</b> waived bookings and bookings the therapist cancelled.</li>
            <li><b style={{ color: 'var(--charcoal)' }}>Guarantee-letter patients</b> are charged to their letter here, dated on the booking. If no letter has room, the fee is parked for their next letter.</li>
            <li><b style={{ color: 'var(--charcoal)' }}>Families</b> pay at their next New Payment, which lists these fees for that patient.</li>
            <li>Before Nov 18, 2026, only fees a letter can still take are listed.</li>
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={loading} label="Not charged" value={pesoOf('UNCHARGED')} compact
          sub={nOf('UNCHARGED') ? `${plural(nOf('UNCHARGED'), 'fee')} · ${plural(totals.UNCHARGED.patients.size, 'patient')}` : 'Nothing owed'}
          tone={nOf('UNCHARGED') ? 'amber' : 'zero'} active={show === 'UNCHARGED'} activeSub={nOf('UNCHARGED') ? `${plural(nOf('UNCHARGED'), 'fee')} · showing below` : 'Nothing owed'}
          onClick={() => setShow('UNCHARGED')} title="Show the fees nobody has charged" />
        <StatCard loading={loading} label="Charged" value={pesoOf('PAID')} compact
          sub={nOf('PAID') ? `${plural(nOf('PAID'), 'fee')} on an order` : 'None yet'}
          tone={nOf('PAID') ? 'green' : 'zero'} active={show === 'PAID'} onClick={() => toggle('PAID')} title="Show fees already charged" />
        <StatCard loading={loading} label="Parked" value={pesoOf('PARKED')} compact
          sub={nOf('PARKED') ? `${plural(nOf('PARKED'), 'fee')} · waiting for a letter` : 'None'}
          accent={nOf('PARKED') ? { line: RETRO_CANCEL_COLOR, bg: '#f5f3ff', fg: RETRO_CANCEL_COLOR } : undefined}
          active={show === 'PARKED'} onClick={() => toggle('PARKED')} title="Show fees parked until a letter has room" />
        <StatCard loading={loading} label="Waived" value={pesoOf('WAIVED')} compact
          sub={nOf('WAIVED') ? plural(nOf('WAIVED'), 'fee') : 'None'}
          accent={nOf('WAIVED') ? { line: '#94a3b8', fg: '#475569' } : undefined}
          active={show === 'WAIVED'} onClick={() => toggle('WAIVED')} title="Show waived fees" />
      </div>

      {notice && (
        <div className="rounded-lg border px-4 py-2.5 text-xs flex items-start justify-between gap-3" style={{ borderColor: '#ddd6fe', background: '#f5f3ff', color: RETRO_CANCEL_COLOR }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="flex-none font-semibold">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs flex items-center gap-2" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          <AlertCircle size={14} /> {error} — the list can&apos;t say what is owed until the schedule can be read.
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-b" style={{ background: 'var(--hr-head)', borderColor: 'var(--hr-line)' }}>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a patient…"
              className="h-8 pl-8 pr-3 rounded-lg border text-xs bg-white w-52 outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          {canSelectBranch && (
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Branch">
              {BRANCH_OPTIONS.map(([v, label]) => (
                <button key={v} onClick={() => setBranchFilter(v)} className="h-8 px-3 text-xs font-semibold" style={branchFilter === v ? segOn : segOff}>{label}</button>
              ))}
            </div>
          )}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Show">
            {(['UNCHARGED', 'PAID', 'PARKED', 'WAIVED', 'ALL'] as Show[]).map(k => (
              <button key={k} onClick={() => setShow(k)} className="h-8 px-3 text-xs font-semibold" style={show === k ? segOn : segOff}>{SHOW_LABEL[k]}</button>
            ))}
          </div>
          <button onClick={() => load(true)} disabled={loading} className={`${hrBtn.ghost} ml-auto`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
            title="Read the clinic schedule again now"><RefreshCw size={12} /> Refresh</button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>{error ? '—' : q.trim() ? 'No patient matches that search.' : EMPTY[show]}</div>
          ) : (
            <table className="w-full text-[12.5px]" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  {['Booking · why a fee', 'Therapist', 'Fee', 'Status', ''].map((h, i) => (
                    <th key={i} className={`px-3 py-2 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap ${i === 2 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--hr-line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.flatMap(([pid, g]) => {
                  const owed = g.rows.filter(r => r.state === 'UNCHARGED')
                  const settled = STATES.filter(k => k !== 'UNCHARGED')
                    .map(k => [k, g.rows.filter(r => r.state === k).length] as const).filter(([, n]) => n)
                  return [
                    <tr key={`${pid}-h`} style={{ background: '#fbfcf8', borderTop: '1px solid var(--light-gray)' }}>
                      <td colSpan={5} className="px-3 pt-3 pb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-bold" style={{ color: 'var(--charcoal)' }}>{g.name}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                            {BRANCH_LABEL[g.rows[0].branch] || g.rows[0].branch}
                          </span>
                          <span className="ml-auto inline-flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--hr-faint)' }}>
                            {owed.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                                <span className="font-mono">{formatCurrency(owed.reduce((s, r) => s + r.amount, 0))}</span> not charged
                              </span>
                            )}
                            {settled.length > 0 && <span>{settled.map(([k, n]) => `${n} ${SHOW_LABEL[k].toLowerCase()}`).join(' · ')}</span>}
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...g.rows.map(r => {
                      const pill = STATE_PILL[r.state]
                      return (
                        <tr key={r.scheduleId} className="align-top" style={{ borderTop: '1px solid var(--hr-line)' }}>
                          <td className="px-3 py-2.5" style={{ boxShadow: `inset 3px 0 0 ${EDGE[r.state]}` }}>
                            <div className="whitespace-nowrap">
                              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{WHAT[r.status]}</span>
                              <span className="font-mono" style={{ color: 'var(--mid-gray)' }}> · {day(r.date)} · {r.startTime}</span>
                            </div>
                            <div className="text-[11.5px]" style={{ color: 'var(--hr-faint)' }}>
                              {whyText(r.why)}
                              {!r.logged && <span className="ml-1.5 px-1.5 py-px rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: '#f1f5f9', color: '#64748b' }} title="Never logged in Patient Relationship — found on the clinic schedule">Not logged</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 min-w-[140px]">
                            <div style={{ color: 'var(--charcoal)' }}>{r.therapist}</div>
                            <div className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>{r.department}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right min-w-[118px]">
                            <div className="font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.amount)}</div>
                            <div className="text-[10.5px]" style={{ color: 'var(--hr-faint)' }}>{r.feeName}</div>
                          </td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                            {r.state !== 'UNCHARGED' ? (
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: pill.bg, color: pill.fg }}>{pill.text}</span>
                                {r.orderNumber ? <span className="font-mono" style={{ color: 'var(--charcoal)' }}>#{r.orderNumber}</span> : null}
                                {r.note && <span className="text-[11.5px] truncate max-w-[200px]" title={r.note}>{r.note}</span>}
                              </span>
                            ) : r.gl ? (
                              <span title={r.gl.letter}>
                                <span className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>Letter</span>{' '}
                                <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{r.gl.letter}</span>
                                <div className="text-[11.5px]"><span className="font-mono">{formatCurrency(r.gl.balance)}</span> left</div>
                              </span>
                            ) : (
                              <span>Family<div className="text-[11.5px]" style={{ color: 'var(--hr-faint)' }}>Collect at New Payment</div></span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {r.state === 'UNCHARGED' && r.gl && (
                              confirming === r.scheduleId ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <button onClick={() => charge(r)} disabled={busy === r.scheduleId}
                                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white" style={{ background: RETRO_CANCEL_COLOR }}>
                                    {busy === r.scheduleId ? <Loader2 size={11} className="animate-spin inline" /> : null} Confirm <span className="font-mono">{formatCurrency(r.amount)}</span>
                                  </button>
                                  <button onClick={() => setConfirming(null)} className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>Cancel</button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirming(r.scheduleId)} disabled={!!busy}
                                  className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border bg-white hover:bg-[#f5f3ff] disabled:opacity-50" style={{ borderColor: '#c4b5fd', color: RETRO_CANCEL_COLOR }}
                                  title={r.gl.canCharge ? `Charge to ${r.gl.letter}, dated on the booking` : 'No room on this letter — it goes on a later application, or is parked for the next one'}>
                                  {r.gl.canCharge ? 'Charge to letter' : 'Charge / park'}
                                </button>
                              )
                            )}
                            {r.state === 'UNCHARGED' && canWaive && (
                              <button onClick={() => { setWaive(r); setWaiveReason(''); setWaiveError(null) }} disabled={!!busy}
                                className="ml-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold hover:bg-[#fef2f2] disabled:opacity-50" style={{ color: '#b91c1c' }}>Waive</button>
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
