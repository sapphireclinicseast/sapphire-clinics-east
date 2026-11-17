'use client'

// Credit Line → payment calculator. Pure what-if maths on the screen: it never
// saves anything and never posts a journal entry.
//
// A credit line is revolving (Hannah 11/17: "assume that i can use small
// amounts at a time, and it tops up"): draw part of it on any date, interest
// runs only on what is owed for the days it is owed, and every peso of
// principal paid back can be drawn again.
//
// Preset = BPI Ka-negosyo Credit Line (KCL) terms: 18% a year (1.5% a month),
// minimum due on the 5th = interest + 1% of the principal, the rest payable
// any time before the line expires (1 May 2027). The facility fees (₱23,490 incl.
// bank charges) were already debited from our BPI account in Nov 2026 (Hannah
// 11/17: "we no longer need to pay for it again"), so fees default to ₱0.

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Plus, X } from 'lucide-react'
import { StatCard } from '@/components/ui/hr-look'
import { TH } from './hr-bits'

interface LineLite { id: string; entityName: string; amount: number; interestPct: number | null; settledAt: string | null; drawnTotal: number; drawnLoans: { dateAcquired?: string; principalAmount: number }[] }

type Plan = 'minimum' | 'equal' | 'fixed'
type Basis = 'days360' | 'days365' | 'month'
type MinBase = 'balance' | 'drawn'
interface Move { id: number; date: string; amount: string }

const BPI_FEES = [
  { label: 'Processing fee', amount: 5000 },
  { label: 'Documentary stamp tax', amount: 7500 },
  { label: 'Annual fee', amount: 10000 },
  { label: 'Notarial fee and DST', amount: 600 },
  { label: 'Checkbook fee', amount: 300 },
]
const BPI = { limit: 1000000, annualPct: 18, minPct: 1, dueDay: 5, expiry: '2027-05-01', fees: BPI_FEES.reduce((s, f) => s + f.amount, 0), feesPaid: 23490 }

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const peso0 = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')
const num = (v: string) => Number(String(v).replace(/[₱,\s]/g, '')) || 0
const r2 = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const DAY = 86400000
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
const fmtDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

type Kind = 'draw' | 'extra' | 'due' | 'end'
interface Row { date: Date; kind: Kind; days: number; drawn: number; interest: number; principal: number; payment: number; balance: number; available: number; clipped: boolean }
interface Opts {
  limit: number; annualPct: number; minPct: number; minBase: MinBase; basis: Basis; dueDay: number
  end: Date; endIsExpiry: boolean; plan: Plan; fixed: number; level?: number
  draws: { date: Date; amount: number }[]; extras: { date: Date; amount: number }[]
}

/** Due dates: every `dueDay` after the first draw, up to (not including) the end date. */
function dueDates(first: Date, end: Date, dueDay: number): Date[] {
  const out: Date[] = []
  let d = new Date(first.getFullYear(), first.getMonth(), dueDay)
  if (d <= first) d = new Date(first.getFullYear(), first.getMonth() + 1, dueDay)
  while (d < end && out.length < 120) { out.push(d); d = new Date(d.getFullYear(), d.getMonth() + 1, dueDay) }
  return out
}

/** Walk the line day by day: draws add to what is owed, payments free the line up again. */
function simulate(o: Opts): Row[] {
  const draws = o.draws.filter(d => d.amount > 0 && d.date < o.end).sort((a, b) => a.date.getTime() - b.date.getTime())
  if (!draws.length) return []
  const first = draws[0].date
  const ORDER: Record<Kind, number> = { due: 0, extra: 1, draw: 2, end: 3 }
  const events: { date: Date; kind: Kind; amount: number }[] = [
    ...dueDates(first, o.end, o.dueDay).map(date => ({ date, kind: 'due' as Kind, amount: 0 })),
    ...draws.map(d => ({ date: d.date, kind: 'draw' as Kind, amount: d.amount })),
    ...o.extras.filter(x => x.amount > 0 && x.date > first && x.date < o.end).map(x => ({ date: x.date, kind: 'extra' as Kind, amount: x.amount })),
    { date: o.end, kind: 'end' as Kind, amount: 0 },
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || ORDER[a.kind] - ORDER[b.kind])
  const rateFor = (d: number) => o.basis === 'days360' ? o.annualPct / 100 / 360 * d
    : o.basis === 'days365' ? o.annualPct / 100 / 365 * d
    : o.annualPct / 100 / 12 * (d / 30)
  const rows: Row[] = []
  let bal = 0, accrued = 0, drawnSoFar = 0, prev = first, lastBill = first
  for (const ev of events) {
    if (bal > 0) accrued += bal * rateFor(days(prev, ev.date))
    prev = ev.date
    const row = (p: Partial<Row>) => rows.push({ date: ev.date, kind: ev.kind, days: 0, drawn: 0, interest: 0, principal: 0, payment: 0, balance: r2(bal), available: r2(Math.max(0, o.limit - bal)), clipped: false, ...p })
    if (ev.kind === 'draw') {
      const amt = r2(Math.min(ev.amount, Math.max(0, o.limit - bal)))
      bal = r2(bal + amt); drawnSoFar += amt
      row({ drawn: amt, clipped: amt < ev.amount, balance: bal, available: r2(o.limit - bal) })
    } else if (ev.kind === 'extra') {
      const p = r2(Math.min(ev.amount, bal))
      if (p <= 0) continue
      bal = r2(bal - p)
      row({ principal: p, payment: p, balance: bal, available: r2(o.limit - bal) })
    } else {
      const interest = r2(accrued); accrued = 0
      const d = days(lastBill, ev.date); lastBill = ev.date
      let principal: number
      if (ev.kind === 'end') principal = bal
      else {
        const minPrin = Math.min(bal, r2((o.minBase === 'drawn' ? drawnSoFar : bal) * o.minPct / 100))
        if (o.plan === 'minimum') principal = minPrin
        else {
          const target = o.plan === 'equal' ? (o.level || 0) : o.fixed
          principal = Math.min(bal, Math.max(minPrin, r2(target - interest)))
        }
      }
      principal = r2(principal)
      if (interest <= 0 && principal <= 0) continue
      bal = r2(bal - principal)
      row({ days: d, interest, principal, payment: r2(interest + principal), balance: bal, available: r2(o.limit - bal) })
    }
  }
  return rows
}

/** The one payment that, paid on every due date, clears the line on the end date. */
function levelPayment(o: Opts): number {
  let lo = 0, hi = o.limit * 2
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    const rows = simulate({ ...o, plan: 'equal', level: mid })
    const lastPay = rows[rows.length - 1]?.payment || 0
    if (lastPay > mid) lo = mid; else hi = mid
  }
  return Math.ceil(hi * 100) / 100
}

let nextId = 1
const today = iso(new Date())

export default function CreditLineCalculator({ lines }: { lines: LineLite[] }) {
  const [lineId, setLineId] = useState('')
  const [limit, setLimit] = useState(BPI.limit.toLocaleString('en-PH'))
  const [annualPct, setAnnualPct] = useState(String(BPI.annualPct))
  const [minPct, setMinPct] = useState(String(BPI.minPct))
  const [minBase, setMinBase] = useState<MinBase>('balance')
  const [basis, setBasis] = useState<Basis>('days360')
  const [dueDay, setDueDay] = useState(String(BPI.dueDay))
  const [expiry, setExpiry] = useState(BPI.expiry)
  const [payoff, setPayoff] = useState(BPI.expiry)
  // Already paid for the BPI line; type an amount only if a new fee applies.
  const [fees, setFees] = useState('0')
  const [plan, setPlan] = useState<Plan>('minimum')
  const [fixed, setFixed] = useState('100,000')
  // Small draws at a time — an example to start from; edit, add or remove.
  const [draws, setDraws] = useState<Move[]>(() => [
    { id: nextId++, date: today, amount: '400,000' },
    { id: nextId++, date: addDays(today, 14), amount: '300,000' },
  ])
  const [extras, setExtras] = useState<Move[]>([])

  // Start from the BPI line in the register (or the first open one) once it loads.
  useEffect(() => {
    if (lineId || !lines.length) return
    const pick = lines.find(l => !l.settledAt && /bpi/i.test(l.entityName)) || lines.find(l => !l.settledAt)
    if (pick) applyLine(pick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines])

  function applyLine(l: LineLite) {
    setLineId(l.id)
    setLimit(l.amount.toLocaleString('en-PH'))
    if (l.interestPct != null) setAnnualPct(String(l.interestPct))
    // Drawdowns already recorded on the line become the draws.
    const real = l.drawnLoans.filter(d => d.dateAcquired && d.principalAmount > 0)
    if (real.length) setDraws(real.map(d => ({ id: nextId++, date: String(d.dateAcquired).slice(0, 10), amount: d.principalAmount.toLocaleString('en-PH') })))
  }

  const calc = useMemo(() => {
    const lim = num(limit), apr = num(annualPct), dd = Math.min(28, Math.max(1, Math.round(num(dueDay)) || 5))
    if (!(lim > 0) || !(apr >= 0) || !expiry) return null
    const ds = draws.filter(d => d.date && num(d.amount) > 0).map(d => ({ date: parse(d.date), amount: num(d.amount) }))
    if (!ds.length) return null
    const expD = parse(expiry)
    const endD = plan === 'equal' && payoff ? parse(payoff) : expD
    const end = endD > expD ? expD : endD
    const first = ds.reduce((a, b) => (b.date < a ? b.date : a), ds[0].date)
    if (days(first, end) < 1) return null
    const base: Opts = {
      limit: lim, annualPct: apr, minPct: num(minPct), minBase, basis, dueDay: dd, end, endIsExpiry: end.getTime() === expD.getTime(),
      plan, fixed: num(fixed), draws: ds,
      extras: extras.filter(x => x.date && num(x.amount) > 0).map(x => ({ date: parse(x.date), amount: num(x.amount) })),
    }
    const level = plan === 'equal' ? levelPayment(base) : undefined
    const rows = simulate({ ...base, level })
    const bills = rows.filter(r => r.kind === 'due' || r.kind === 'end')
    if (!bills.length) return null
    const interest = r2(rows.reduce((s, r) => s + r.interest, 0))
    const drawn = r2(rows.reduce((s, r) => s + r.drawn, 0))
    const peak = rows.reduce((m, r) => Math.max(m, r.balance), 0)
    const dues = bills.filter(r => r.kind === 'due')
    const regular = dues.length > 1 ? dues[1] : dues[0] || bills[0]
    const ignored = ds.filter(d => d.date >= end).length
    return { rows, level, interest, drawn, peak, regular, first: bills[0], last: bills[bills.length - 1], end, endIsExpiry: base.endIsExpiry, lim, clipped: rows.some(r => r.clipped), ignored }
  }, [limit, annualPct, minPct, minBase, basis, dueDay, expiry, payoff, plan, fixed, draws, extras])

  const feeAmt = num(fees)
  const inp = 'w-full h-9 px-3 rounded-lg border bg-white text-[13px]'
  const lbl = 'block text-[11px] font-semibold uppercase tracking-[.4px] mb-1'
  const bc = { borderColor: 'var(--light-gray)' }, mg = { color: 'var(--mid-gray)' }
  const seg = (on: boolean) => `h-8 px-3 rounded-md text-xs font-semibold transition-colors ${on ? 'bg-white shadow-sm' : ''}`
  const linkBtn = 'inline-flex items-center gap-1 text-xs font-semibold mt-1.5 hover:opacity-75'

  const monthlyLabel = plan === 'minimum' ? 'Minimum due each month' : plan === 'equal' ? 'Equal monthly payment' : 'Your monthly payment'
  const monthlyValue = !calc ? '—' : plan === 'equal' ? peso(calc.level || 0) : peso(calc.regular.payment)
  const monthlySub = !calc ? '' : plan === 'minimum'
    ? `${peso0(calc.regular.interest)} interest + ${peso0(calc.regular.principal)} principal`
    : plan === 'equal' ? `every ${Math.round(num(dueDay)) || 5}th, clears by ${fmtDate(calc.end)}` : 'every due date, then the rest at the end'
  const bills = calc ? calc.rows.filter(r => r.kind === 'due' || r.kind === 'end') : []
  const bigLast = !!calc && bills.length > 1 && calc.last.payment > 2 * calc.regular.payment

  const moveList = (title: string, hint: string, list: Move[], set: (f: (p: Move[]) => Move[]) => void, addLabel: string, addDefault: () => Move) => (
    <div className="min-w-0">
      <label className={lbl} style={mg}>{title}</label>
      <div className="space-y-1.5">
        {list.map(m => (
          <div key={m.id} className="flex items-center gap-1.5">
            <input type="date" value={m.date} onChange={e => set(p => p.map(x => x.id === m.id ? { ...x, date: e.target.value } : x))}
              className={inp + ' font-mono !w-[150px] shrink-0'} style={bc} aria-label={`${title} date`} />
            <input value={m.amount} onChange={e => set(p => p.map(x => x.id === m.id ? { ...x, amount: e.target.value } : x))}
              inputMode="decimal" className={inp + ' font-mono min-w-0'} style={bc} aria-label={`${title} amount`} />
            <button type="button" onClick={() => set(p => p.filter(x => x.id !== m.id))} className="p-1.5 rounded hover:bg-red-50 shrink-0" aria-label="Remove">
              <X size={13} className="text-red-400" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => set(p => [...p, addDefault()])} className={linkBtn} style={{ color: 'var(--teal)' }}><Plus size={13} /> {addLabel}</button>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--hr-faint)' }}>{hint}</p>
    </div>
  )

  const what = (r: Row) => r.kind === 'draw' ? (r.clipped ? 'Draw (cut to what is left on the line)' : 'Draw')
    : r.kind === 'extra' ? 'Extra payment (tops the line back up)'
    : r.kind === 'end' ? (calc?.endIsExpiry ? 'Line expires: pay the rest' : 'Paid off')
    : `Payment due · ${r.days} days of interest`

  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
        <Calculator size={15} style={{ color: 'var(--teal)' }} />
        <span className="text-[13px] font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Monthly payment calculator</span>
        <span className="text-xs" style={mg}>Draw a little at a time; what you pay back can be drawn again. Nothing here is saved or posted.</span>
        {lines.length > 0 && (
          <select value={lineId} onChange={e => { const l = lines.find(x => x.id === e.target.value); if (l) applyLine(l); else setLineId('') }}
            className="ml-auto h-8 px-2 rounded-lg border bg-white text-xs" style={bc} aria-label="Credit line">
            <option value="">Custom amounts</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.entityName}</option>)}
          </select>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div><label className={lbl} style={mg}>Credit line</label><input value={limit} onChange={e => setLimit(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Interest a year (%)</label><input value={annualPct} onChange={e => setAnnualPct(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} />
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--hr-faint)' }}>{(num(annualPct) / 12).toFixed(2)}% a month</p></div>
          <div><label className={lbl} style={mg}>Due every</label>
            <div className="flex items-center gap-1.5"><input value={dueDay} onChange={e => setDueDay(e.target.value)} inputMode="numeric" className={inp + ' font-mono !w-16'} style={bc} /><span className="text-xs" style={mg}>of the month</span></div></div>
          <div><label className={lbl} style={mg}>Line expires</label><input type="date" value={expiry} onChange={e => { setExpiry(e.target.value); if (payoff > e.target.value) setPayoff(e.target.value) }} className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Fees still to pay</label><input value={fees} onChange={e => setFees(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} title={BPI_FEES.map(f => `${f.label}: ${peso(f.amount)}`).join('\n')} />
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--hr-faint)' }}>BPI&apos;s {peso0(BPI.feesPaid)} already paid (Nov 2026)</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {moveList('Draws', 'When you take money from the line, and how much.', draws, setDraws, 'Add a draw',
            () => ({ id: nextId++, date: draws.length ? addDays(draws[draws.length - 1].date || today, 14) : today, amount: '100,000' }))}
          {moveList('Extra payments', 'Paying principal early lowers the interest and frees that much of the line again.', extras, setExtras, 'Add an extra payment',
            () => ({ id: nextId++, date: addDays(today, 30), amount: '100,000' }))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className={lbl} style={mg}>How you&apos;ll pay</label>
            <div className="inline-flex flex-wrap rounded-lg p-0.5" style={{ background: 'var(--pale-teal)' }} role="group" aria-label="Payment plan">
              {([['minimum', 'Minimum only'], ['equal', 'Equal monthly payments'], ['fixed', 'A set amount']] as const).map(([v, t]) => (
                <button key={v} type="button" onClick={() => setPlan(v)} aria-pressed={plan === v} className={seg(plan === v)} style={{ color: plan === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {plan === 'equal' && <div><label className={lbl} style={mg}>Fully paid by</label><input type="date" value={payoff} max={expiry} onChange={e => setPayoff(e.target.value)} className={inp + ' font-mono !w-40'} style={bc} /></div>}
            {plan === 'fixed' && <div><label className={lbl} style={mg}>Pay each month</label><input value={fixed} onChange={e => setFixed(e.target.value)} inputMode="decimal" className={inp + ' font-mono !w-36'} style={bc} /></div>}
            <div><label className={lbl} style={mg}>Monthly principal</label>
              <div className="flex items-center gap-1.5"><input value={minPct} onChange={e => setMinPct(e.target.value)} inputMode="decimal" className={inp + ' font-mono !w-14'} style={bc} />
                <select value={minBase} onChange={e => setMinBase(e.target.value as MinBase)} className="h-9 px-2 rounded-lg border bg-white text-xs" style={bc}><option value="balance">% of what you owe</option><option value="drawn">% of all you drew</option></select></div></div>
            <div><label className={lbl} style={mg}>Interest counted</label>
              <select value={basis} onChange={e => setBasis(e.target.value as Basis)} className="h-9 px-2 rounded-lg border bg-white text-xs" style={bc}>
                <option value="days360">By days (year = 360)</option><option value="days365">By days (year = 365)</option><option value="month">Flat per month</option>
              </select></div>
          </div>
        </div>

        {!calc ? <p className="text-[13px] py-6 text-center" style={mg}>Add at least one draw before the line expires.</p> : <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard compact label="First payment" value={peso(calc.first.payment)} sub={`${fmtDate(calc.first.date)} · ${calc.first.days} days of interest`} accent={{ line: '#4A8073' }} />
            <StatCard compact label={monthlyLabel} value={monthlyValue} sub={monthlySub} tone="blue" />
            <StatCard compact label={bills.length > 1 ? 'Last payment' : 'Payment'} value={peso(calc.last.payment)} sub={`${fmtDate(calc.last.date)}${bigLast ? ' · balance still owed' : ''}`} tone={bigLast ? 'red' : 'green'} />
            <StatCard compact label="Total cost of the loan" value={peso(calc.interest + feeAmt)} sub={feeAmt ? `${peso0(calc.interest)} interest + ${peso0(feeAmt)} fees` : `interest only · BPI's ${peso0(BPI.feesPaid)} fees already paid`} tone="amber" />
          </div>

          <p className="text-[12.5px]" style={mg}>
            You draw <strong className="font-mono" style={{ color: 'var(--charcoal)' }}>{peso0(calc.drawn)}</strong> in all; the most you owe at one time is{' '}
            <strong className="font-mono" style={{ color: 'var(--charcoal)' }}>{peso0(calc.peak)}</strong> of the {peso0(calc.lim)} line.
          </p>
          {calc.clipped && <p className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>A draw is bigger than what is left on the line at that date, so it is cut down to what is available.</p>}
          {calc.ignored > 0 && <p className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>{calc.ignored} draw{calc.ignored === 1 ? ' is' : 's are'} on or after {fmtDate(calc.end)} and {calc.ignored === 1 ? 'is' : 'are'} left out.</p>}
          {bigLast && (
            <p className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
              Paying only the minimum leaves <strong className="font-mono">{peso(calc.last.principal)}</strong> to pay in one go on {fmtDate(calc.last.date)}, when the line expires (unless BPI renews it).
              To spread it out, pick <em>Equal monthly payments</em> or add extra payments.
            </p>
          )}

          <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead><tr style={{ background: 'var(--hr-head)' }}>
                {['Date', 'What', 'Drawn', 'Interest', 'Principal paid', 'You pay', 'Owed after', 'Available to draw'].map(h => <th key={h} className={`${TH} ${['Drawn', 'Interest', 'Principal paid', 'You pay', 'Owed after', 'Available to draw'].includes(h) ? '!text-right' : ''}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {calc.rows.map((r, i) => (
                  <tr key={i} className="border-t hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)', boxShadow: r.kind === 'end' && bigLast ? 'inset 3px 0 0 #dc2626' : r.kind === 'draw' ? 'inset 3px 0 0 #2563eb' : r.kind === 'extra' ? 'inset 3px 0 0 #059669' : undefined }}>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold" style={{ color: 'var(--charcoal)' }}>{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={mg}>{what(r)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.drawn ? peso(r.drawn) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.interest ? peso(r.interest) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.principal ? peso(r.principal) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{r.payment ? peso(r.payment) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{peso(r.balance)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={mg}>{peso(r.available)}</td>
                  </tr>
                ))}
                <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                  <td colSpan={2} className="px-3 py-2 text-[11px] font-bold uppercase tracking-[.4px]" style={mg}>Total</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{peso(calc.drawn)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{peso(calc.interest)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{peso(calc.drawn)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{peso(calc.interest + calc.drawn)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--hr-faint)' }}>
            Interest runs only on what you owe, for the days you owe it, and is billed on each due date. The bank asks for at least that interest and {num(minPct)}% of the principal every {Math.round(num(dueDay)) || 5}th; the rest can be paid any time before the line expires, and anything you pay back can be drawn again.
            {feeAmt > 0 ? `If the bank deducts the ${peso0(feeAmt)} in fees from the first release, that draw puts ${peso0(feeAmt)} less in the bank. ` : `The facility fees (${peso0(BPI.feesPaid)}) were already debited from our BPI account, so draws are not reduced. `}
            The first BPI statement shows how they count interest; if it differs, switch &ldquo;Interest counted&rdquo;.
          </p>
        </>}
      </div>
    </div>
  )
}
