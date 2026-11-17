'use client'

// Credit Line → payment calculator. Pure what-if maths on the screen: it never
// saves anything and never posts a journal entry.
//
// Preset = BPI Ka-negosyo Credit Line (KCL) terms: 18% a year (1.5% a month),
// minimum due on the 5th = interest + 1% of the principal, the rest payable
// any time before the line expires (1 May 2027), ₱23,400 fees at release.

import { useEffect, useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'
import { StatCard } from '@/components/ui/hr-look'
import { TH } from './hr-bits'

interface LineLite { id: string; entityName: string; amount: number; interestPct: number | null; settledAt: string | null; drawnTotal: number; drawnLoans: { dateAcquired?: string; principalAmount: number }[] }

type Plan = 'minimum' | 'equal' | 'fixed'
type Basis = 'days360' | 'days365' | 'month'
type MinBase = 'drawn' | 'balance'

const BPI_FEES = [
  { label: 'Processing fee', amount: 5000 },
  { label: 'Documentary stamp tax', amount: 7500 },
  { label: 'Annual fee', amount: 10000 },
  { label: 'Notarial fee and DST', amount: 600 },
  { label: 'Checkbook fee', amount: 300 },
]
const BPI = { annualPct: 18, minPct: 1, dueDay: 5, expiry: '2027-05-01', fees: BPI_FEES.reduce((s, f) => s + f.amount, 0) }

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const peso0 = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')
const num = (v: string) => Number(String(v).replace(/[₱,\s]/g, '')) || 0
const r2 = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const DAY = 86400000
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
const fmtDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

/** Due dates: every `dueDay` after the draw date, then the end date itself if it falls between due dates. */
function dueDates(draw: Date, end: Date, dueDay: number): Date[] {
  const out: Date[] = []
  let d = new Date(draw.getFullYear(), draw.getMonth(), dueDay)
  if (d <= draw) d = new Date(draw.getFullYear(), draw.getMonth() + 1, dueDay)
  while (d <= end && out.length < 120) { out.push(d); d = new Date(d.getFullYear(), d.getMonth() + 1, dueDay) }
  if (!out.length || days(out[out.length - 1], end) > 0) out.push(end)
  return out
}

interface Row { n: number; date: Date; days: number; opening: number; interest: number; principal: number; payment: number; balance: number; last: boolean }

function schedule(o: { amount: number; annualPct: number; minPct: number; minBase: MinBase; basis: Basis; draw: Date; end: Date; dueDay: number; plan: Plan; fixed: number; level?: number }): Row[] {
  const dates = dueDates(o.draw, o.end, o.dueDay)
  const rows: Row[] = []
  let bal = o.amount, prev = o.draw
  dates.forEach((date, i) => {
    const d = days(prev, date)
    const rate = o.basis === 'days360' ? o.annualPct / 100 / 360 * d
      : o.basis === 'days365' ? o.annualPct / 100 / 365 * d
      : o.annualPct / 100 / 12 * (d / 30)
    const interest = r2(bal * rate)
    const last = i === dates.length - 1
    const minPrin = Math.min(bal, r2((o.minBase === 'drawn' ? o.amount : bal) * o.minPct / 100))
    let principal: number
    if (last) principal = bal
    else if (o.plan === 'minimum') principal = minPrin
    else {
      const target = o.plan === 'equal' ? (o.level || 0) : o.fixed
      principal = Math.min(bal, Math.max(minPrin, r2(target - interest)))
    }
    const opening = bal
    bal = r2(bal - principal)
    rows.push({ n: i + 1, date, days: d, opening, interest, principal: r2(principal), payment: r2(interest + principal), balance: bal, last })
    prev = date
  })
  return rows
}

/** The one payment that, paid on every due date, clears the line on the end date. */
function levelPayment(o: Parameters<typeof schedule>[0]): number {
  let lo = 0, hi = o.amount * 2
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    const rows = schedule({ ...o, plan: 'equal', level: mid })
    const lastPay = rows[rows.length - 1]?.payment || 0
    if (lastPay > mid) lo = mid; else hi = mid
  }
  return Math.ceil(hi * 100) / 100
}

export default function CreditLineCalculator({ lines }: { lines: LineLite[] }) {
  const [lineId, setLineId] = useState('')
  const [amount, setAmount] = useState('1,000,000')
  const [annualPct, setAnnualPct] = useState(String(BPI.annualPct))
  const [minPct, setMinPct] = useState(String(BPI.minPct))
  const [minBase, setMinBase] = useState<MinBase>('drawn')
  const [basis, setBasis] = useState<Basis>('days360')
  const [draw, setDraw] = useState(iso(new Date()))
  const [dueDay, setDueDay] = useState(String(BPI.dueDay))
  const [expiry, setExpiry] = useState(BPI.expiry)
  const [payoff, setPayoff] = useState(BPI.expiry)
  const [fees, setFees] = useState(BPI.fees.toLocaleString('en-PH'))
  const [plan, setPlan] = useState<Plan>('minimum')
  const [fixed, setFixed] = useState('100,000')

  // Start from the BPI line in the register (or the first open one) once it loads.
  useEffect(() => {
    if (lineId || !lines.length) return
    const pick = lines.find(l => !l.settledAt && /bpi/i.test(l.entityName)) || lines.find(l => !l.settledAt)
    if (pick) applyLine(pick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines])

  function applyLine(l: LineLite) {
    setLineId(l.id)
    setAmount((l.drawnTotal > 0 ? l.drawnTotal : l.amount).toLocaleString('en-PH'))
    if (l.interestPct != null) setAnnualPct(String(l.interestPct))
    const first = l.drawnLoans.map(d => d.dateAcquired).filter(Boolean).sort()[0]
    if (first) setDraw(String(first).slice(0, 10))
  }

  const calc = useMemo(() => {
    const amt = num(amount), apr = num(annualPct), dd = Math.min(28, Math.max(1, Math.round(num(dueDay)) || 5))
    if (!(amt > 0) || !(apr >= 0) || !draw || !expiry) return null
    const drawD = parse(draw), expD = parse(expiry)
    const endD = plan === 'minimum' ? expD : (payoff ? parse(payoff) : expD)
    if (days(drawD, endD) < 1) return null
    const end = endD > expD ? expD : endD
    const base = { amount: amt, annualPct: apr, minPct: num(minPct), minBase, basis, draw: drawD, end, dueDay: dd, plan, fixed: num(fixed) }
    const level = plan === 'equal' ? levelPayment(base) : undefined
    const rows = schedule({ ...base, level })
    const interest = r2(rows.reduce((s, r) => s + r.interest, 0))
    const regular = rows.length > 1 ? rows[1] : rows[0]
    return { rows, level, interest, regular, first: rows[0], last: rows[rows.length - 1], end, amt }
  }, [amount, annualPct, minPct, minBase, basis, draw, dueDay, expiry, payoff, plan, fixed])

  const feeAmt = num(fees)
  const inp = 'w-full h-9 px-3 rounded-lg border bg-white text-[13px]'
  const lbl = 'block text-[11px] font-semibold uppercase tracking-[.4px] mb-1'
  const bc = { borderColor: 'var(--light-gray)' }, mg = { color: 'var(--mid-gray)' }
  const seg = (on: boolean) => `h-8 px-3 rounded-md text-xs font-semibold transition-colors ${on ? 'bg-white shadow-sm' : ''}`

  const monthlyLabel = plan === 'minimum' ? 'Minimum due each month' : plan === 'equal' ? 'Equal monthly payment' : 'Your monthly payment'
  const monthlyValue = !calc ? '—' : plan === 'equal' ? peso(calc.level || 0) : peso(calc.regular.payment)
  const monthlySub = !calc ? '' : plan === 'minimum'
    ? `${peso0(calc.regular.interest)} interest + ${peso0(calc.regular.principal)} principal`
    : plan === 'equal' ? `${calc.rows.length} payments, clears by ${fmtDate(calc.end)}` : `${calc.rows.length - 1} payments, then the rest`
  const bigLast = !!calc && calc.rows.length > 1 && calc.last.payment > 2 * calc.regular.payment

  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
        <Calculator size={15} style={{ color: 'var(--teal)' }} />
        <span className="text-[13px] font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Monthly payment calculator</span>
        <span className="text-xs" style={mg}>What you pay on each due date. Nothing here is saved or posted.</span>
        {lines.length > 0 && (
          <select value={lineId} onChange={e => { const l = lines.find(x => x.id === e.target.value); if (l) applyLine(l); else setLineId('') }}
            className="ml-auto h-8 px-2 rounded-lg border bg-white text-xs" style={bc} aria-label="Credit line">
            <option value="">Custom amounts</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.entityName}</option>)}
          </select>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div><label className={lbl} style={mg}>Amount drawn</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Interest a year (%)</label><input value={annualPct} onChange={e => setAnnualPct(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} />
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--hr-faint)' }}>{(num(annualPct) / 12).toFixed(2)}% a month</p></div>
          <div><label className={lbl} style={mg}>Date drawn</label><input type="date" value={draw} onChange={e => setDraw(e.target.value)} className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Due every</label>
            <div className="flex items-center gap-1.5"><input value={dueDay} onChange={e => setDueDay(e.target.value)} inputMode="numeric" className={inp + ' font-mono !w-16'} style={bc} /><span className="text-xs" style={mg}>of the month</span></div></div>
          <div><label className={lbl} style={mg}>Line expires</label><input type="date" value={expiry} onChange={e => { setExpiry(e.target.value); if (payoff > e.target.value) setPayoff(e.target.value) }} className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Fees at release</label><input value={fees} onChange={e => setFees(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} title={BPI_FEES.map(f => `${f.label}: ${peso(f.amount)}`).join('\n')} />
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--hr-faint)' }}>BPI estimate {peso0(BPI.fees)}</p></div>
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
                <select value={minBase} onChange={e => setMinBase(e.target.value as MinBase)} className="h-9 px-2 rounded-lg border bg-white text-xs" style={bc}><option value="drawn">% of amount drawn</option><option value="balance">% of balance left</option></select></div></div>
            <div><label className={lbl} style={mg}>Interest counted</label>
              <select value={basis} onChange={e => setBasis(e.target.value as Basis)} className="h-9 px-2 rounded-lg border bg-white text-xs" style={bc}>
                <option value="days360">By days (year = 360)</option><option value="days365">By days (year = 365)</option><option value="month">Flat per month</option>
              </select></div>
          </div>
        </div>

        {!calc ? <p className="text-[13px] py-6 text-center" style={mg}>Enter an amount and a draw date before the expiry date.</p> : <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard compact label="First payment" value={peso(calc.first.payment)} sub={`${fmtDate(calc.first.date)} · ${calc.first.days} days of interest`} accent={{ line: '#4A8073' }} />
            <StatCard compact label={monthlyLabel} value={monthlyValue} sub={monthlySub} tone="blue" />
            <StatCard compact label={calc.rows.length > 1 ? 'Last payment' : 'Payment'} value={peso(calc.last.payment)} sub={`${fmtDate(calc.last.date)}${bigLast ? ' · balance still owed' : ''}`} tone={bigLast ? 'red' : 'green'} />
            <StatCard compact label="Total cost of the loan" value={peso(calc.interest + feeAmt)} sub={`${peso0(calc.interest)} interest + ${peso0(feeAmt)} fees`} tone="amber" />
          </div>

          {bigLast && (
            <p className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
              Paying only the minimum leaves <strong className="font-mono">{peso(calc.last.principal)}</strong> to pay in one go on {fmtDate(calc.last.date)}, when the line expires (unless BPI renews it).
              To spread it out, pick <em>Equal monthly payments</em>.
            </p>
          )}

          <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead><tr style={{ background: 'var(--hr-head)' }}>
                {['#', 'Due date', 'Days', 'Balance before', 'Interest', 'Principal', 'You pay', 'Balance after'].map(h => <th key={h} className={`${TH} ${['Days', 'Balance before', 'Interest', 'Principal', 'You pay', 'Balance after'].includes(h) ? '!text-right' : ''}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {calc.rows.map(r => (
                  <tr key={r.n} className="border-t hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)', boxShadow: r.last && bigLast ? 'inset 3px 0 0 #dc2626' : undefined }}>
                    <td className="px-3 py-2 font-mono" style={mg}>{r.n}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold" style={{ color: 'var(--charcoal)' }}>{fmtDate(r.date)}{r.last && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>{r.date.getTime() === parse(expiry).getTime() ? 'line expires' : 'paid off'}</span>}</td>
                    <td className="px-3 py-2 text-right font-mono" style={mg}>{r.days}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{peso(r.opening)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{peso(r.interest)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{peso(r.principal)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{peso(r.payment)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={mg}>{peso(r.balance)}</td>
                  </tr>
                ))}
                <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                  <td colSpan={4} className="px-3 py-2 text-[11px] font-bold uppercase tracking-[.4px]" style={mg}>Total</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{peso(calc.interest)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{peso(calc.amt)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{peso(calc.interest + calc.amt)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--hr-faint)' }}>
            Each payment is the interest since the last due date plus principal. The bank asks for at least the interest and {num(minPct)}% of the principal every {Math.round(num(dueDay)) || 5}th; the rest can be paid any time before the line expires.
            If BPI deducts the fees ({peso0(feeAmt)}) from the release, the cash you actually receive is {peso(Math.max(0, calc.amt - feeAmt))}.
            The first BPI statement shows how they count interest — if it differs, switch &ldquo;Interest counted&rdquo;.
          </p>
        </>}
      </div>
    </div>
  )
}
