'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers, getPaymentsForStudent,
  levelLabel, getFeeFor, hydrateFees, hydrateFrontDeskPayments, validateVoucher,
  listPersonalVouchersFor,
  unpaidBackMonthsFor,
  type PaymentPlan, type PaymentMethod, type PaymentRecord, type StoredUser, type FeeSchedule,
} from '@/lib/session'

// Local method label — not exported from @/lib/session, so the grid
// below carries its own small lookup. Mirrors the version in /profile.
function methodLabel(m: PaymentMethod | undefined): string {
  switch (m) {
    case 'PAYMONGO':        return 'PayMongo'
    case 'FRONT_DESK_CASH': return 'Front desk (cash)'
    case 'BANK_DEPOSIT':    return 'Bank deposit'
    default:                return '—'
  }
}
import { getImpersonationMeta } from '@/lib/backend'

const BANK_DETAILS = {
  EAST: {
    branchLabel: 'East Branch',
    bank: 'BDO UNIBANK, INC.',
    branch: 'Robinsons Metroeast',
    accountName: 'Sapphire Clinics East Inc.',
    accountNumber: '004688016007',
  },
  GREENHILLS: {
    branchLabel: 'Greenhills Branch',
    bank: 'BDO UNIBANK, INC.',
    branch: 'Robinsons Metroeast',
    accountName: 'Sapphire Clinics East Inc.',
    accountNumber: '004688017208',
  },
} as const



interface PlanRow {
  plan: PaymentPlan; title: string; tuition: number; misc: number; period: string; deadline: string;
}

function plansFor(fee: FeeSchedule): PlanRow[] {
  return [
    { plan: 'ANNUAL',   title: 'Annual',    tuition: fee.tuitionAnnualCentavos,   misc: fee.miscAnnualCentavos,   period: 'Annual SY 2026–2027',     deadline: 'Every 5th of June (lump sum)' },
    { plan: 'BIANNUAL', title: 'Bi-annual', tuition: fee.tuitionBiannualCentavos, misc: fee.miscBiannualCentavos, period: 'First half SY 2026–2027', deadline: 'Every 5th of June and 5th of December' },
    { plan: 'MONTHLY',  title: 'Monthly',   tuition: fee.tuitionMonthlyCentavos,  misc: fee.miscMonthlyCentavos,  period: thisMonthPeriod(),         deadline: 'Every 5th of the month' },
  ]
}

function thisMonthPeriod(): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const d = new Date()
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function fmt(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_NAMES_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']

/** Months elapsed since June 1 of the current school year, including the
 *  current month. June = 1, July = 2, ..., March = 10. Apr-May (between
 *  SYs) returns 10 so a parent who somehow enrols then sees the full SY
 *  obligation. */
function syMonthsElapsed(today: Date): number {
  const m = today.getMonth() // 0-11, Jun=5
  if (m >= 5) return m - 5 + 1            // Jun→1, Jul→2, ..., Dec→7
  if (m <= 2) return (12 - 5) + m + 1     // Jan→8, Feb→9, Mar→10
  return 10                                // Apr–May: between SYs
}

interface LateBackBalance {
  /** Combined PHP centavos due now. */
  totalAmount: number
  /** Tuition portion (used so voucher discount applies cleanly). */
  tuitionAmount: number
  /** Misc portion. */
  miscAmount: number
  /** How many monthly installments are bundled. 5 for biannual first half. */
  months: number
  /** "Back balance June–September 2026" — used as the PaymentRecord period
   *  and audit-trail label so the cashier sees what they're confirming. */
  period: string
  /** Short label rendered in the warning callout. */
  label: string
}

/** Returns a back-balance computation when the student is "late" for
 *  the selected plan, otherwise null. Late = SY months elapsed > 1 for
 *  MONTHLY, > 5 for BIANNUAL — combined with the parent having no
 *  CONVERTED payments yet for the relevant period. ANNUAL students are
 *  always lump-sum so no back balance applies. */
function computeLateBackBalance(
  selectedPlan: PaymentPlan,
  perInstallmentTuition: number,
  perInstallmentMisc: number,
  history: PaymentRecord[],
  today: Date,
): LateBackBalance | null {
  const monthsElapsed = syMonthsElapsed(today)
  const todayMonthIdx = today.getMonth()
  // SY label like "2026–2027" — for the period text.
  const syStartYear = todayMonthIdx >= 5 ? today.getFullYear() : today.getFullYear() - 1

  if (selectedPlan === 'MONTHLY') {
    // Any PAID monthly already on file means they're not a fresh late
    // enrollee — they've been paying along and just need their next
    // regular monthly installment.
    const hasAnyPaidMonthly = history.some(h => h.status === 'PAID' && h.plan === 'MONTHLY')
    if (hasAnyPaidMonthly) return null
    if (monthsElapsed <= 1) return null
    const endMonthName = MONTH_NAMES_LONG[todayMonthIdx]
    return {
      totalAmount: (perInstallmentTuition + perInstallmentMisc) * monthsElapsed,
      tuitionAmount: perInstallmentTuition * monthsElapsed,
      miscAmount: perInstallmentMisc * monthsElapsed,
      months: monthsElapsed,
      period: `Back balance · June–${endMonthName} ${syStartYear}`,
      label: `${monthsElapsed}-month back balance (June–${endMonthName})`,
    }
  }

  if (selectedPlan === 'BIANNUAL') {
    // First half = months 1-5 (June-October). If anything PAID covers
    // "first half" already, skip — the parent should be paying the
    // second half regularly via the normal biannual flow.
    const hasFirstHalfPaid = history.some(h =>
      h.status === 'PAID' && h.plan === 'BIANNUAL' && /first[- ]?half/i.test(h.period),
    )
    if (hasFirstHalfPaid) return null
    if (monthsElapsed <= 5) return null
    return {
      totalAmount: perInstallmentTuition + perInstallmentMisc, // biannual rate = first half
      tuitionAmount: perInstallmentTuition,
      miscAmount: perInstallmentMisc,
      months: 5,
      period: `First-half back balance · June–October ${syStartYear}`,
      label: 'First-half back balance (June–October)',
    }
  }

  return null
}

export default function PayPage() {
  const router = useRouter()
  const [user, setUser] = useState<StoredUser | null>(null)
  const [selected, setSelected] = useState<PaymentPlan>('ANNUAL')
  const [method, setMethod] = useState<PaymentMethod>('PAYMONGO')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [history, setHistory] = useState<PaymentRecord[]>([])

  const [fee, setFee] = useState<FeeSchedule | null>(null)

  // Voucher / promo-code state
  const [voucherInput, setVoucherInput] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; discountPercent: number; validUntil?: string } | null>(null)
  const [voucherBusy, setVoucherBusy] = useState(false)
  const [voucherErr, setVoucherErr] = useState<string | null>(null)

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    // Same impersonation bypass as /profile — admins who clicked
    // "View as" on a student can walk the Pay-tuition flow in that
    // student's shoes so they can see fees + outstanding balance.
    // The impersonation token on API calls scopes payments and fees
    // to the target. targetUserId is captured at startImpersonation.
    const imp = getImpersonationMeta()
    const impersonatingStudent = !!imp && imp.targetRole === 'STUDENT'
    if (!impersonatingStudent && auth.role === 'ADMIN') { router.replace('/admin'); return }
    const effectiveUserId = impersonatingStudent ? (imp!.targetUserId || auth.userId) : auth.userId
    if (!effectiveUserId) { router.replace('/sign-in'); return }
    const u = getUsers().find(x => x.id === effectiveUserId) ?? null
    if (!u) { router.replace('/sign-in'); return }
    setUser(u)
    setHistory(getPaymentsForStudent(u.id))
    setFee(getFeeFor(u.branch))
    // The cached copy above can predate the branch being set on the account, or
    // come from a browser that never had it — and branch decides which PayMongo
    // merchant, and so which bank account, receives the tuition. Re-read the
    // canonical record before the parent can reach checkout.
    hydrateUsers()
      .then(list => {
        const fresh = list.find(x => x.id === u.id)
        if (fresh) { setUser(fresh); setFee(getFeeFor(fresh.branch)) }
      })
      .catch(() => { /* keep the cached copy; the EAST fallback still applies */ })
    // Stream the freshest schedule from the API so admin edits on another device flow through.
    hydrateFees().then(() => setFee(getFeeFor(u.branch))).catch(() => { /* ignore */ })
    // Pull the marketing-hub view so any cashier-converted payment shows up
    // here as PAID without the parent having to manually refresh.
    hydrateFrontDeskPayments().then(() => setHistory(getPaymentsForStudent(u.id))).catch(() => { /* ignore */ })
    // Auto-apply the student's personal early-bird voucher on mount so
    // monthly / bi-annual parents don't have to remember to type the
    // code every time. If they have multiple (rare), pick the highest
    // discount among enabled + not-yet-expired ones. Parent can still
    // remove it via the voucher card if they want to pay full price.
    listPersonalVouchersFor(u.id).then(vouchers => {
      const now = Date.now()
      const active = vouchers.filter(v => v.enabled && new Date(v.validUntil).getTime() > now)
      if (active.length === 0) return
      const best = active.reduce((a, b) => (b.discountPercent > a.discountPercent ? b : a))
      setAppliedVoucher({ code: best.code, discountPercent: best.discountPercent, validUntil: best.validUntil })
      setVoucherInput(best.code)
    }).catch(() => { /* ignore */ })
  }, [router])

  const plans = useMemo(() => fee ? plansFor(fee) : [], [fee])
  const plan = useMemo(() => plans.find(p => p.plan === selected) ?? plans[0], [plans, selected])

  // Late-enrollment back balance for monthly/biannual. When set, the
  // checkout summary, voucher math, period label, and all three payment
  // method handlers (PayMongo / Front-desk cash / Bank deposit) use the
  // lump-sum back balance instead of the regular per-installment amount.
  const lateBackBalance = useMemo(() => {
    if (!plan) return null
    return computeLateBackBalance(
      plan.plan,
      plan.tuition,
      plan.misc,
      history,
      new Date(),
    )
  }, [plan, history])

  // Late-enrollee catch-up: any earlier SY month the parent hasn't paid
  // for. Distinct from lateBackBalance (which only fires on the FIRST
  // /pay visit and swaps the whole checkout to a lump). This surfaces
  // gap-months even after some months have already been settled — e.g.
  // Ragnar paid July but skipped June; we still want him to see "You
  // still owe June 2026" so he can flag it to the front desk.
  const monthNamesLong = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const owedPastMonths = useMemo(() => {
    if (!user || !plan || plan.plan !== 'MONTHLY') return [] as string[]
    const today = new Date()
    return unpaidBackMonthsFor(user.id)
      .filter(m => !(m.year === today.getFullYear() && m.monthIdx === today.getMonth()))
      .map(m => `${monthNamesLong[m.monthIdx]} ${m.year}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, plan, history])


  // "Effective" amounts that flow through the rest of the page. When a
  // back balance applies, tuition + misc swap out for the lump version;
  // when not, they pass through unchanged.
  const effectiveTuition = lateBackBalance?.tuitionAmount ?? plan?.tuition ?? 0
  const effectiveMisc    = lateBackBalance?.miscAmount    ?? plan?.misc    ?? 0
  const effectivePeriod  = lateBackBalance?.period        ?? plan?.period  ?? ''

  // Discount derived from the applied voucher — recomputed against the
  // EFFECTIVE tuition so switching plans (or hitting the back-balance
  // path) keeps it correct.
  const discountPercent = appliedVoucher?.discountPercent ?? 0
  const discountAmount = Math.round((effectiveTuition * discountPercent) / 100)
  const discountedTuition = Math.max(0, effectiveTuition - discountAmount)

  async function handleApplyVoucher() {
    setVoucherErr(null)
    const code = voucherInput.trim()
    if (!code) { setVoucherErr('Enter a voucher code.'); return }
    setVoucherBusy(true)
    try {
      const res = await validateVoucher(code)
      if (res.valid && res.code && typeof res.discountPercent === 'number') {
        setAppliedVoucher({ code: res.code, discountPercent: res.discountPercent, validUntil: res.validUntil })
        setVoucherInput(res.code)
      } else {
        setAppliedVoucher(null)
        setVoucherErr(res.reason ?? 'That voucher code is not valid.')
      }
    } finally {
      setVoucherBusy(false)
    }
  }

  function handleRemoveVoucher() {
    setAppliedVoucher(null)
    setVoucherInput('')
    setVoucherErr(null)
  }

  async function handlePaymongo() {
    if (!user) return
    setBusy(true); setErr(null)
    try {
      // No local "pending/paid" record: Class Hub shows only payments the
      // Accounting Hub POS recorded (Hannah, 2026-10-31). The id travels as
      // the PayMongo reference so the front desk can match the payment.
      const paymentId = 'pmt_' + Math.random().toString(36).slice(2, 12)
      const studentName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
      const res = await fetch('/api/pay/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.id,
          studentEmail: user.email,
          studentName,
          plan: plan.plan,
          paymentId,
          tuitionAmount: discountedTuition,
          miscAmount: effectiveMisc,
          period: effectivePeriod,
          voucherCode: appliedVoucher?.code,
          discountPercent: appliedVoucher ? discountPercent : undefined,
          // Branch routes the charge to that branch's PayMongo account so the
          // settlement bank matches. Defaulted the same way the recorded payment
          // and the displayed bank details are, a few lines down: without it a
          // student with no branch was recorded as EAST and shown East's bank
          // while the money went to the shared account instead.
          branch: user.branch ?? 'EAST',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `Checkout failed (${res.status})`)
      }
      const data = await res.json() as { checkoutId: string; checkoutUrl: string }
      window.location.assign(data.checkoutUrl)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  if (!user || !plan) return null

  const total = discountedTuition + effectiveMisc
  const studentBranch = user.branch ?? 'EAST'
  const bank = BANK_DETAILS[studentBranch as keyof typeof BANK_DETAILS]

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-6">
      {/* Payment status by trimester — moved here from /profile so the
          "where are my payments?" grid lives alongside the Pay flow. */}
      <PaymentStatusGrid payments={history} />

      {/* Top — tuition fee table */}
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Tuition fee schedule</div>
            <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">{user.firstName} {user.lastName} · {user.level ? levelLabel(user.level) : ''}</h1>
          </div>
          <a href="/profile" className="btn-secondary">← Back to profile</a>
        </div>

        <div className="overflow-x-auto mt-4 rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--paper-2)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Item</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3">Deadline</th>
              </tr>
            </thead>
            <tbody>
              <Row item="Annual Tuition"               amount={fmt(fee?.tuitionAnnualCentavos   ?? 0)}            deadline="Every 5th of June" />
              <Row item="Bi-annual Payment"            amount={fmt(fee?.tuitionBiannualCentavos ?? 0) + ' / half'}  deadline="Every 5th of June and 5th of December" />
              <Row item="Monthly Payment"              amount={fmt(fee?.tuitionMonthlyCentavos  ?? 0) + ' / month'} deadline="Every 5th of the month" />
              <Row item="Miscellaneous (Annual)"       amount={fmt(fee?.miscAnnualCentavos      ?? 0)}              deadline="With annual payment" />
              <Row item="Miscellaneous (Bi-annual)"    amount={fmt(fee?.miscBiannualCentavos    ?? 0) + ' / half'}  deadline="With bi-annual payment" />
              <Row item="Miscellaneous (Monthly)"      amount={fmt(fee?.miscMonthlyCentavos     ?? 0) + ' / month'} deadline="With monthly payment" />
              {(fee?.extraItems ?? []).map((x, i) => (
                <Row key={`extra-${i}`} item={x.label} amount={fmt(x.amountCentavos)} deadline={x.notes ?? '—'} />
              ))}
              {(!fee?.extraItems || fee.extraItems.length === 0) && (
                <>
                  <Row item="Books"   amount="May ask with front desk" deadline="—" />
                  <Row item="Uniform" amount="May ask with front desk" deadline="—" />
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tuition obligation policy — kept prominent so parents see the
          full-year + clearance rules before they pick a plan. */}
      <div
        className="rounded-2xl p-4 border-2"
        style={{ borderColor: '#fda4af', background: '#fff1f2' }}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-[20px] leading-none mt-0.5">⚠️</span>
          <div>
            <div className="font-bold text-[color:var(--narra)] text-[14px] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Tuition obligation — please read before paying
            </div>
            <ul className="text-[13px] text-[color:var(--ink)] leading-relaxed space-y-1.5 list-disc pl-5">
              <li>
                If you decide to stop your child from attending,{' '}
                <span className="font-bold">you are still obligated to pay tuition for the full school year</span>{' '}
                regardless of when, or for what reason, attendance stops.
              </li>
              <li>
                If you choose an installment plan (bi-annual or monthly), the{' '}
                <span className="font-bold">outstanding balance of tuition must be settled in full</span>{' '}
                before the school issues clearance, Form 137 / SF10, transfer credentials, or any other academic record.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Plan picker + checkout summary */}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">Choose your payment plan</h2>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {plans.map(p => (
            <button
              key={p.plan}
              type="button"
              onClick={() => setSelected(p.plan)}
              className={`level-tile ${selected === p.plan ? 'level-tile-active' : ''}`}
            >
              <span className="level-tile-title">{p.title}</span>
              <span className="level-tile-sub">{fmt(p.tuition)}{p.misc > 0 ? ` + ${fmt(p.misc)} misc` : ''}</span>
            </button>
          ))}
        </div>

        {err && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">
            {err}
          </div>
        )}

        {/* Voucher / promo code */}
        <div className="mt-5 rounded-xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Voucher / promo code
          </div>
          {appliedVoucher ? (
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg px-3 py-2.5" style={{ background: 'var(--sage-tint)', border: '1px solid var(--sage)' }}>
              <span className="text-sm text-[color:var(--ink)]">
                ✓ Code <span className="font-bold tracking-wide">{appliedVoucher.code}</span> applied — <span className="font-semibold text-[color:var(--narra)]">{appliedVoucher.discountPercent}% off tuition</span>
              </span>
              <button type="button" onClick={handleRemoveVoucher} className="text-xs px-2.5 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] font-semibold">Remove</button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <input
                className="input flex-1 uppercase tracking-wide"
                placeholder="Enter code"
                value={voucherInput}
                onChange={e => { setVoucherInput(e.target.value); setVoucherErr(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyVoucher() } }}
                autoCapitalize="characters"
              />
              <button type="button" onClick={handleApplyVoucher} disabled={voucherBusy} className="btn-secondary whitespace-nowrap" style={{ padding: '0 18px' }}>
                {voucherBusy ? 'Checking…' : 'Apply'}
              </button>
            </div>
          )}
          {voucherErr && (
            <div className="mt-2 text-[12.5px] text-rose-700">{voucherErr}</div>
          )}
        </div>

        {/* Owed-past-months callout for MONTHLY late enrollees who've
            already paid some months but skipped earlier SY months.
            Distinct from the lateBackBalance callout below (which only
            fires when NOTHING has been paid yet). Surfaces the specific
            missing months so the parent knows to coordinate with the
            front desk to settle each. Suppressed when lateBackBalance
            is already showing — that callout already lists the range. */}
        {!lateBackBalance && owedPastMonths.length > 0 && (
          <div className="mt-5 rounded-xl p-4 border-2" style={{ borderColor: '#c69849', background: '#fef3c7' }}>
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-[20px] leading-none mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14px] mb-1" style={{ color: '#92400e', fontFamily: 'var(--font-display)' }}>
                  Past-due month{owedPastMonths.length > 1 ? 's' : ''} still owed
                </div>
                <p className="text-[13px] text-[color:var(--ink)] leading-relaxed">
                  Our records show the following month{owedPastMonths.length > 1 ? 's have' : ' has'} not yet been settled: <span className="font-semibold">{owedPastMonths.join(', ')}</span>. Please coordinate with the front desk to catch up on {owedPastMonths.length > 1 ? 'these' : 'this'} before your next installment.
                </p>
              </div>
            </div>
          </div>
        )}


        {/* Late-enrollment back-balance callout. Surfaces ABOVE the
            checkout summary so the parent reads it before scrolling
            to the payment buttons. Replaces the normal per-installment
            "Total to pay" with the lump-sum back balance — the
            checkout summary below also re-binds to the effective
            amounts so the math stays consistent. */}
        {lateBackBalance && (
          <div className="mt-5 rounded-xl p-4 border-2" style={{ borderColor: '#c69849', background: '#fef3c7' }}>
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-[20px] leading-none mt-0.5">⏰</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14px] mb-1" style={{ color: '#92400e', fontFamily: 'var(--font-display)' }}>
                  Late enrollment — settle back balance first
                </div>
                <p className="text-[13px] text-[color:var(--ink)] leading-relaxed">
                  Because you&apos;re starting the <span className="font-semibold">{plan.title}</span> plan after the school year began, you need to settle the <span className="font-semibold">{lateBackBalance.label}</span> as a lump sum before regular {plan.plan === 'BIANNUAL' ? 'second-half (December) ' : ''}installments can begin.
                </p>
                <p className="text-[13.5px] text-[color:var(--ink)] leading-relaxed mt-2">
                  <span className="font-bold">Amount due now: {fmt(lateBackBalance.totalAmount)}</span>
                  {' '}({lateBackBalance.months} {lateBackBalance.months === 1 ? 'month' : 'months'} covered).
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
          <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Checkout summary</div>
          <dl className="grid grid-cols-2 text-sm gap-y-1">
            <dt className="text-[color:var(--mid-gray)]">
              {lateBackBalance ? `${plan.title} back-balance tuition (${lateBackBalance.months}× )` : `${plan.title} tuition`}
            </dt>
            <dd className="text-right tabular-nums">{fmt(effectiveTuition)}</dd>
            {appliedVoucher && discountAmount > 0 && <>
              <dt className="text-[color:var(--moss)]">Discount ({appliedVoucher.code} · {discountPercent}%)</dt>
              <dd className="text-right tabular-nums text-[color:var(--moss)]">−{fmt(discountAmount)}</dd>
            </>}
            {effectiveMisc > 0 && <>
              <dt className="text-[color:var(--mid-gray)]">
                {lateBackBalance ? `Miscellaneous (${lateBackBalance.months}× )` : 'Miscellaneous'}
              </dt>
              <dd className="text-right tabular-nums">{fmt(effectiveMisc)}</dd>
            </>}
            <dt className="text-[color:var(--narra)] font-bold pt-2 border-t mt-1" style={{ borderColor: 'var(--paper-3)' }}>Total to pay</dt>
            <dd className="text-right tabular-nums font-bold pt-2 border-t mt-1 text-[color:var(--narra)]" style={{ borderColor: 'var(--paper-3)' }}>{fmt(total)}</dd>
          </dl>
          <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-3" style={{ fontFamily: 'var(--font-display)' }}>
            Period covered: <span className="font-semibold text-[color:var(--ink)]">{effectivePeriod}</span> · Deadline: <span className="font-semibold text-[color:var(--ink)]">{lateBackBalance ? 'Due upon enrollment' : plan.deadline}</span>
          </div>
        </div>

        {/* Method picker — three options as tiles. */}
        <div className="mt-5">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            How would you like to pay?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <MethodTile
              active={method === 'PAYMONGO'} onClick={() => setMethod('PAYMONGO')}
              title="PayMongo checkout" sub="Credit card, GCash, Maya, or GrabPay"
            />
            <MethodTile
              active={method === 'FRONT_DESK_CASH'} onClick={() => setMethod('FRONT_DESK_CASH')}
              title="Pay at front desk" sub="How to pay in clinic"
            />
            <MethodTile
              active={method === 'BANK_DEPOSIT'} onClick={() => setMethod('BANK_DEPOSIT')}
              title="Bank transfer" sub="BDO — account details"
            />
          </div>
        </div>

        {/* Method-specific body */}
        {method === 'PAYMONGO' && (
          <div className="mt-5">
            <button type="button" onClick={handlePaymongo} disabled={busy} className="btn-cta w-full">
              {busy ? 'Opening secure checkout…' : `Proceed to PayMongo checkout — ${fmt(total)}`}
            </button>
            <p className="text-[11px] text-[color:var(--mid-gray)] text-center mt-2" style={{ fontFamily: 'var(--font-display)' }}>
              You will be redirected to PayMongo. Credit card, GCash, Maya, and GrabPay are supported. Your payment shows here as paid once our front desk records it.
            </p>
          </div>
        )}

        {method === 'FRONT_DESK_CASH' && (
          <div className="mt-5">
            <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
              <p className="text-sm text-[color:var(--ink)] leading-relaxed">
                Visit our <span className="font-semibold text-[color:var(--narra)]">{bank.branchLabel}</span> front desk and pay <span className="font-semibold text-[color:var(--narra)]">{fmt(total)}</span> for <span className="font-semibold">{effectivePeriod}</span> (cash, card, GCash or Maya). The front desk issues your receipt and records the payment — it then shows here as paid.
              </p>
              <p className="text-[12px] text-[color:var(--mid-gray)] mt-2">There&apos;s nothing to submit here.</p>
            </div>
          </div>
        )}

        {method === 'BANK_DEPOSIT' && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {bank.branchLabel} bank account
              </div>
              <dl className="grid grid-cols-[140px_1fr] text-sm gap-y-1.5">
                <dt className="text-[color:var(--mid-gray)]">Bank</dt>
                <dd className="font-semibold text-[color:var(--narra)]">{bank.bank}</dd>
                <dt className="text-[color:var(--mid-gray)]">Branch</dt>
                <dd className="text-[color:var(--ink)]">{bank.branch}</dd>
                <dt className="text-[color:var(--mid-gray)]">Account name</dt>
                <dd className="text-[color:var(--ink)]">{bank.accountName}</dd>
                <dt className="text-[color:var(--mid-gray)]">Account number</dt>
                <dd className="font-bold text-[color:var(--narra)] tabular-nums tracking-wider">{bank.accountNumber}</dd>
              </dl>
              <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-3" style={{ fontFamily: 'var(--font-display)' }}>
                Transfer <span className="font-semibold text-[color:var(--ink)]">{fmt(total)}</span> for <span className="font-semibold text-[color:var(--ink)]">{effectivePeriod}</span> to the account above, then show or send the transfer receipt to the {bank.branchLabel} front desk with the student&apos;s name. They record the payment and it shows here as paid.
              </p>
              <p className="text-[12px] text-[color:var(--mid-gray)] mt-2">There&apos;s nothing to submit here.</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment history */}
      {history.length > 0 && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Your payment history</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Plan</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(p => (
                  <tr key={p.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                    <td className="py-2.5 px-3 text-[12.5px]">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3">{p.plan}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{p.period}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{fmt(p.tuitionAmount + p.miscAmount)}</td>
                    <td className="py-2.5 px-3"><span className={`badge ${p.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MethodTile({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={`level-tile ${active ? 'level-tile-active' : ''}`}>
      <span className="level-tile-title">{title}</span>
      <span className="level-tile-sub">{sub}</span>
    </button>
  )
}

function Row({ item, amount, deadline }: { item: string; amount: string; deadline: string }) {
  return (
    <tr className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
      <td className="py-2.5 px-3 font-semibold text-[color:var(--narra)]">{item}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{amount}</td>
      <td className="py-2.5 px-3 text-[12.5px] text-[color:var(--mid-gray)]">{deadline}</td>
    </tr>
  )
}

/* ─────────────── Plan-aware Payment Status by trimester grid ───────────────
 *
 * Grid: rows = school months (Jun → Apr), columns = Semester 1 (Jun-Aug),
 *       Semester 2 (Sep-Dec), Semester 3 (Jan-Apr).
 *
 * MONTHLY — one cell per month lights up when a PAID payment's `period`
 *   substring includes that month name (same logic as the old profile
 *   trimester grid).
 *
 * BIANNUAL — SCEI biannual = 2 installments. The 1st installment
 *   covers Jun-Oct (5 months), the 2nd covers Nov-Apr (6 months). We key
 *   off the COUNT of PAID biannual payments the student has on file,
 *   sorted by paidAt ascending:
 *     0 paid → nothing lit
 *     1 paid → Jun/Jul/Aug/Sep/Oct cells lit
 *     2 paid → every month lit
 *   The user asked for "full for 1st sem, half for 2nd sem, none for 3rd"
 *   after one biannual payment — that's exactly S1 (full, Jun-Aug) + S2
 *   half (Sep-Oct of 4 months) under this mapping.
 *
 * ANNUAL — one payment covers the whole SY. Any PAID annual payment lights
 *   every month.
 */
function PaymentStatusGrid({ payments }: { payments: PaymentRecord[] }) {
  const MONTHS = ['June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April']
  const SEMESTERS: Array<{ key: 1 | 2 | 3; label: string; months: string[] }> = [
    { key: 1, label: 'Semester 1', months: ['June', 'July', 'August'] },
    { key: 2, label: 'Semester 2', months: ['September', 'October', 'November', 'December'] },
    { key: 3, label: 'Semester 3', months: ['January', 'February', 'March', 'April'] },
  ]
  // SCEI biannual installment coverage. 1st covers 5 months, 2nd covers 6.
  const BIANNUAL_1 = ['June', 'July', 'August', 'September', 'October']
  const BIANNUAL_2 = ['November', 'December', 'January', 'February', 'March', 'April']

  function semesterOf(month: string): 1 | 2 | 3 {
    for (const s of SEMESTERS) if (s.months.includes(month)) return s.key
    return 1
  }

  // Latest plan the student has committed to (last PAID row wins, else
  // the most recent PENDING). Falls back to MONTHLY only to pick a layout
  // when there's no data — the grid stays empty in that case anyway.
  const paid = payments.filter(p => p.status === 'PAID')
  const anyRows = [...paid, ...payments.filter(p => p.status !== 'PAID')]
  const activePlan: PaymentPlan = (anyRows[0]?.plan ?? 'MONTHLY') as PaymentPlan

  // Annual gets whole-year coverage from one paid row; biannual rows
  // (paid OR pending) fill the two half-year slots in date order so a
  // 2nd installment that's still pending shows as "Pending" over the
  // Nov-Apr cells instead of leaving them blank.
  const paidAnnual = paid.find(p => p.plan === 'ANNUAL')
  const allBiannualSorted = payments
    .filter(p => p.plan === 'BIANNUAL')
    .sort((a, b) => new Date(a.paidAt ?? a.createdAt).getTime() - new Date(b.paidAt ?? b.createdAt).getTime())

  function paymentForMonth(month: string): PaymentRecord | null {
    if (paidAnnual) return paidAnnual
    if (activePlan === 'BIANNUAL') {
      if (BIANNUAL_1.includes(month) && allBiannualSorted[0]) return allBiannualSorted[0]
      if (BIANNUAL_2.includes(month) && allBiannualSorted[1]) return allBiannualSorted[1]
    }
    // MONTHLY fallback (also catches biannual months with no cover):
    // prefer a PAID row whose period mentions the month, else any row.
    const needle = month.toLowerCase()
    const matches = payments.filter(p => p.period.toLowerCase().includes(needle))
    return matches.find(p => p.status === 'PAID') ?? matches[0] ?? null
  }

  return (
    <div className="card-static">
      <h2 className="text-[18px] leading-tight mb-1">Payment status by trimester</h2>
      <p className="text-sm text-[color:var(--mid-gray)] mb-3">
        Hover a <strong>Paid</strong> or <strong>Pending</strong> cell to see the payment details.
      </p>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
        <table className="w-full text-sm border-collapse">
          <thead style={{ background: 'var(--paper-2)' }}>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
              <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--paper-3)' }}>Month</th>
              {SEMESTERS.map(s => (
                <th key={s.key} className="py-2 px-3 border-b border-l text-center" style={{ borderColor: 'var(--paper-3)' }}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTHS.map(month => {
              const sem = semesterOf(month)
              const match = paymentForMonth(month)
              return (
                <tr key={month} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 px-3 text-[13px] font-medium text-[color:var(--narra)]">{month}</td>
                  {SEMESTERS.map(s => (
                    <td
                      key={s.key}
                      className="py-2.5 px-3 border-l text-center text-[12.5px]"
                      style={{ borderColor: 'var(--paper-3)' }}
                    >
                      {s.key === sem && match ? <PaymentStatusCell payment={match} /> : null}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PaymentStatusCell({ payment }: { payment: PaymentRecord }) {
  const paid = payment.status === 'PAID'
  const dateIso = payment.paidAt ?? payment.createdAt
  const dateLabel = new Date(dateIso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const total = payment.tuitionAmount + payment.miscAmount
  const method = methodLabel(payment.method)
  const reference = payment.paymongoCheckoutId
    || payment.proofFileName
    || payment.voucherCode
    || '—'
  return (
    <span className="relative group inline-block">
      <span className={`badge ${paid ? 'badge-paid' : 'badge-pending'}`}>{paid ? 'Paid' : 'Pending'}</span>
      <span
        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 hidden group-hover:block text-left bg-white border rounded-lg shadow-xl px-3 py-2 w-[220px]"
        style={{ borderColor: 'var(--paper-3)' }}
        role="tooltip"
      >
        <div className="text-[10.5px] uppercase tracking-wider text-[color:var(--mid-gray)] mb-1">Payment details</div>
        <div className="text-[12.5px] text-[color:var(--narra)]"><strong>Method:</strong> {method}</div>
        <div className="text-[12.5px] text-[color:var(--narra)]"><strong>Date:</strong> {dateLabel}</div>
        <div className="text-[12.5px] text-[color:var(--narra)]"><strong>Amount:</strong> ₱{(total / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="text-[12.5px] text-[color:var(--narra)] truncate" title={reference}><strong>Ref:</strong> {reference}</div>
      </span>
    </span>
  )
}
