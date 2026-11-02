'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertOctagon, CheckCircle2, ChevronRight, Loader2, Pencil } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PF_PRICE_RECENT_DAYS, pfPriceRecentSince } from '@/lib/payroll/pf-price'
import type { PayslipDeduction, RateIssue, SessionIssue } from '@/lib/payroll/pf-price-server'

const manilaYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const branchName = (b: string) => (b === 'SBEA' ? 'East' : b === 'SBGH' ? 'Greenhills' : b)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-10-2" → "Oct 2026 · 2nd". */
const cutoffLabel = (p: string) => { const [y, m, h] = p.split('-'); return `${MONTHS[parseInt(m, 10) - 1] ?? m} ${y} · ${h === '1' ? '1st' : '2nd'}` }
/** Cutoffs from April 2026 (the hub's first payroll) to two months ahead, newest first. */
function cutoffOptions(today = new Date()): string[] {
  const out: string[] = []
  for (let d = new Date(today.getFullYear(), today.getMonth() + 2, 1); d >= new Date(2026, 3, 1); d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) {
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push(`${p}-2`, `${p}-1`)
  }
  return out
}
const sessionKey = (s: SessionIssue) => `${s.orderId}|${s.consultantId}|${s.unitPayId}`

/**
 * Payroll → PF Above Price: we can't pay a consultant more PF than the clinic
 * charges for the session. Lists rates set above the price of a service they
 * cover (fix the rate or the price — the row clears itself) and sessions whose
 * PF came to more than they were charged (discounts, ₱0 lines, old prices).
 */
export default function PfPriceCheck({ variant = 'full', canWrite = false, onOpen, onCount, onEditConsultant, reloadKey = 0 }: {
  // 'banner' = one line above the consultant sub-tabs pointing to the section;
  // 'full' = the PF Above Price sub-tab itself.
  variant?: 'banner' | 'full'
  canWrite?: boolean
  onOpen?: () => void
  onCount?: (n: number) => void
  onEditConsultant?: (consultantId: string, name: string) => void
  reloadKey?: number
}) {
  const [data, setData] = useState<{ rates: RateIssue[]; sessions: SessionIssue[]; deductions: PayslipDeduction[]; hubStart: string | null } | null>(null)
  const [since, setSince] = useState(() => `${manilaYmd(new Date()).slice(0, 4)}-01-01`)
  const [hideAdjusted, setHideAdjusted] = useState(false)
  const [cutoffFor, setCutoffFor] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const recentSince = useMemo(() => pfPriceRecentSince(), [])
  const options = useMemo(() => cutoffOptions(), [])

  const load = useCallback(() => {
    fetch(`/api/payroll/pf-price-check?since=${variant === 'banner' ? recentSince : since}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData({ rates: d?.rates || [], sessions: d?.sessions || [], deductions: d?.deductions || [], hubStart: d?.hubStart || null }))
      .catch(() => setData({ rates: [], sessions: [], deductions: [], hubStart: null }))
  }, [variant, since, recentSince])
  useEffect(() => { load() }, [load, reloadKey])

  // Sessions already adjusted in a later payroll are done — only the rest count.
  const recent = useMemo(() => (data?.sessions || []).filter(s => s.date >= recentSince && !s.recovered), [data, recentSince])

  const patch = async (s: SessionIssue, body: Record<string, unknown>) => {
    setBusy(sessionKey(s)); setError('')
    try {
      const r = await fetch('/api/payroll/pf-price-check', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: s.orderId, consultantId: s.consultantId, unitPayId: s.unitPayId, ...body }),
      })
      if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not save')
      load()
    } finally {
      setBusy('')
    }
  }
  const save = (s: SessionIssue) => {
    const cutoff = cutoffFor[sessionKey(s)]
    if (!cutoff) { setError('Choose the payroll it was adjusted in first.'); return }
    patch(s, { cutoff, amount: s.over })
  }
  const undo = (s: SessionIssue) => {
    if (!confirm('Mark this session as not yet adjusted?')) return
    patch(s, { undo: true })
  }
  const rateConsultants = useMemo(() => new Set((data?.rates || []).map(r => r.consultantId)).size, [data])
  useEffect(() => { if (data) onCount?.(data.rates.length + recent.length) }, [data, recent.length, onCount])

  if (variant === 'banner') {
    if (!data || (!data.rates.length && !recent.length)) return null
    const parts = [
      data.rates.length ? `${plural(data.rates.length, 'rate')} for ${plural(rateConsultants, 'consultant')}` : '',
      recent.length ? `${plural(recent.length, 'session')} in the last ${PF_PRICE_RECENT_DAYS} days` : '',
    ].filter(Boolean)
    return (
      <button onClick={onOpen} className="w-full rounded-xl border px-4 py-2.5 text-sm flex items-center justify-between gap-2 text-left"
        style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
        <span className="flex items-center gap-2 font-semibold"><AlertOctagon size={16} /> PF above the service price — {parts.join(' · ')}</span>
        <span className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap">Open <ChevronRight size={14} /></span>
      </button>
    )
  }

  if (data === null) {
    return <p className="text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading…</p>
  }
  const open = data.sessions.filter(x => !x.recovered)
  const openOver = open.reduce((t, x) => t + x.over, 0)
  const adjusted = data.sessions.length - open.length
  const shown = hideAdjusted ? open : data.sessions
  // Deductions already on the payslips of consultants with open sessions — to match before saving.
  const openConsultants = new Set(open.map(x => x.consultantId))
  const deductionsBy = data.deductions.filter(d => openConsultants.has(d.consultantId)).reduce<Record<string, PayslipDeduction[]>>((m, d) => {
    (m[d.consultant] ||= []).push(d); return m
  }, {})
  const th = 'text-left px-2 py-1.5 font-semibold whitespace-nowrap'
  const td = 'px-2 py-1.5 whitespace-nowrap'

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#991b1b' }}>
          <AlertOctagon size={16} /> We can&apos;t pay a consultant more PF than we charge for the session.
        </p>
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          Each rate is checked against the services it pays that consultant for — the ones they have sold, or, before their first
          sale, the ones in their department and branch. Lower the rate (Consultant List → the consultant → Unit Pay Rates) or raise
          the service price; the row clears itself.
        </p>
      </div>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--charcoal)' }}>
          Rates above the service price {data.rates.length > 0 && <span style={{ color: '#b91c1c' }}>({data.rates.length})</span>}
        </p>
        {!data.rates.length ? (
          <div className="rounded-xl border px-4 py-4 text-sm text-center" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            Every PF rate is at or below the price of the services it pays for.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: '#fecaca' }}>
            <table className="w-full text-xs" style={{ color: 'var(--charcoal)' }}>
              <thead>
                <tr style={{ background: '#fee2e2', color: '#991b1b' }}>
                  {['Consultant', 'Unit pay', 'PF', 'Service', 'Price', 'PF over price', ''].map(h => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rates.map((r, i) => (
                  <tr key={`${r.consultantId}-${r.unitPayId}-${r.serviceId}`} className="border-t" style={{ borderColor: '#fee2e2' }}>
                    <td className={`${td} font-medium`}>{i > 0 && data.rates[i - 1].consultantId === r.consultantId ? '' : r.consultant}</td>
                    <td className={td}>{r.unitPay}</td>
                    <td className={td}>{formatCurrency(r.pay)}{r.branch ? ` (${branchName(r.branch)})` : ''}</td>
                    <td className="px-2 py-1.5">{r.service}</td>
                    <td className={td}>{formatCurrency(r.price)}</td>
                    <td className={`${td} font-semibold text-red-700`}>{formatCurrency(r.pay - r.price)}</td>
                    <td className={td}>
                      {onEditConsultant && (i === 0 || data.rates[i - 1].consultantId !== r.consultantId) && (
                        <button onClick={() => onEditConsultant(r.consultantId, r.consultant)}
                          className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>
                          <Pencil size={11} /> Edit rates
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--charcoal)' }}>
            Sessions where the PF was more than we charged
            {open.length > 0 && <span style={{ color: '#b91c1c' }}> ({open.length} open · {formatCurrency(openOver)})</span>}
            {adjusted > 0 && <span style={{ color: '#166534' }}> · {adjusted} adjusted</span>}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={hideAdjusted} onChange={e => setHideAdjusted(e.target.checked)} /> Hide adjusted
            </label>
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
              Since
              <input type="date" value={since} onChange={e => e.target.value && setSince(e.target.value)}
                className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            </label>
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          Sessions on a payslip compare the PF that payslip paid with what the session was charged at that time; sessions not yet on a payslip use today&apos;s rate and charge.
          {data.hubStart && <> Sessions before {formatDate(data.hubStart)} that aren&apos;t on a hub payslip aren&apos;t checked — that payroll was run outside the hub.</>}
          {' '}Once the overpaid PF is deducted, pick the payroll it was adjusted in and press <strong>Save</strong> — the row turns green.
        </p>
        {error && <p className="text-xs font-medium text-red-700">{error}</p>}
        {Object.keys(deductionsBy).length > 0 && (
          <div className="rounded-xl border px-3 py-2 text-xs space-y-1" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>Deductions already on these consultants&apos; payslips</p>
            {Object.entries(deductionsBy).map(([name, ds]) => (
              <p key={name} style={{ color: 'var(--mid-gray)' }}>
                <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{name}:</span>{' '}
                {ds.map(d => `${cutoffLabel(d.cutoff)} — ${d.name} ${formatCurrency(d.amount)}`).join(' · ')}
              </p>
            ))}
          </div>
        )}
        {!shown.length ? (
          <div className="rounded-xl border px-4 py-4 text-sm text-center" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            {hideAdjusted && data.sessions.length ? 'Every session here has been adjusted.' : `No session since ${formatDate(since)} paid more PF than it was charged.`}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: '#fecaca' }}>
            <table className="w-full text-xs" style={{ color: 'var(--charcoal)' }}>
              <thead>
                <tr style={{ background: '#fee2e2', color: '#991b1b' }}>
                  {['Date', 'Order', 'Patient', 'Consultant', 'Service', 'Unit pay', 'Charged', 'PF', 'Over', 'Paid in', 'Adjusted in payroll'].map(h => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map(s => (
                  <tr key={`${s.orderId}-${s.consultantId}-${s.service}-${s.kind}`} className="border-t"
                    style={s.recovered ? { borderColor: '#bbf7d0', background: '#dcfce7' } : { borderColor: '#fee2e2', ...(s.date >= recentSince ? { background: '#fff7f7' } : {}) }}>
                    <td className={td}>{formatDate(s.date)}</td>
                    <td className={td}>#{s.orderNumber}</td>
                    <td className="px-2 py-1.5">{s.patientName || '—'}</td>
                    <td className={`${td} font-medium`}>{s.consultant}</td>
                    <td className="px-2 py-1.5" title={s.kind === 'ORDER' ? 'A ₱0 session line — its PF is compared with what the rest of the order was charged.' : undefined}>
                      {s.service}{s.kind === 'ORDER' && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>(₱0 line)</span>}
                    </td>
                    <td className={td}>{s.unitPay}</td>
                    <td className={td} title={s.approx ? 'The order changed after this payroll — charge estimated from the order net the payslip saw' : undefined}>
                      {s.approx ? '≈ ' : ''}{formatCurrency(s.charged)}
                    </td>
                    <td className={td}>{formatCurrency(s.pay)}{s.quantity !== 1 ? ` × ${s.quantity}` : ''}</td>
                    <td className={`${td} font-semibold`} style={{ color: s.recovered ? '#166534' : '#b91c1c' }}>{formatCurrency(s.over)}</td>
                    <td className={td} style={{ color: 'var(--mid-gray)' }}>
                      {s.payroll
                        ? `${s.payroll.status === 'DRAFT' ? 'Draft' : 'Paid'} · ${cutoffLabel(s.payroll.cutoff)}`
                        : <span title="Not in a payroll run yet — PF shown at today's rate">Not yet run</span>}
                    </td>
                    <td className={td}>
                      {s.recovered ? (
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#bbf7d0', color: '#166534' }}
                            title={[s.recovered.recordedBy && `Saved by ${s.recovered.recordedBy}`, formatDate(s.recovered.recordedAt), s.recovered.note].filter(Boolean).join(' · ')}>
                            <CheckCircle2 size={11} /> {cutoffLabel(s.recovered.cutoff)}
                          </span>
                          {canWrite && (
                            <button onClick={() => undo(s)} disabled={busy === sessionKey(s)} className="text-[11px] underline" style={{ color: 'var(--mid-gray)' }}>Undo</button>
                          )}
                        </span>
                      ) : canWrite ? (
                        <span className="flex items-center gap-1.5">
                          <select value={cutoffFor[sessionKey(s)] || ''} onChange={e => setCutoffFor(m => ({ ...m, [sessionKey(s)]: e.target.value }))}
                            className="px-1.5 py-1 rounded-lg border text-[11px] bg-white" style={{ borderColor: '#fecaca' }}>
                            <option value="">Choose payroll…</option>
                            {options.filter(o => !s.payroll || o >= s.payroll.cutoff).map(o => <option key={o} value={o}>{cutoffLabel(o)}</option>)}
                          </select>
                          <button onClick={() => save(s)} disabled={busy === sessionKey(s) || !cutoffFor[sessionKey(s)]}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold text-white flex items-center gap-1 disabled:opacity-50"
                            style={{ background: '#15803d' }}>
                            {busy === sessionKey(s) && <Loader2 size={11} className="animate-spin" />} Save
                          </button>
                        </span>
                      ) : <span style={{ color: 'var(--mid-gray)' }}>Not yet adjusted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
