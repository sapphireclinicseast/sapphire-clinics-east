'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
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
import {
  PAGE, PageHeader, DashCard, KpiCard, Banner, StatusPill, Icon,
  BTN_SECONDARY, BTN_SM, SECONDARY_STYLE, PRIMARY_STYLE, CONTROL, CONTROL_STYLE,
  TH, TH_STYLE, TD, TR, TR_STYLE, SUBTLE_BG, FOCUS, DANGER,
} from '@/components/hub/ui'

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
  const paidCount = history.filter(p => p.status === 'PAID').length

  return (
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        eyebrow="Tuition & payments"
        title="Pay tuition"
        description={<>{user.firstName} {user.lastName}{user.level ? ` · ${levelLabel(user.level)}` : ''} · {bank.branchLabel}</>}
        actions={
          <a href="/profile" className={BTN_SECONDARY} style={SECONDARY_STYLE}>
            <Icon name="arrowLeft" size={14} /> Back to profile
          </a>
        }
      />

      {/* Summary tiles — the same figures the checkout summary below shows. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total and Deadline take a full row on phones so a six-figure
            amount and a long deadline never squeeze into half a screen. */}
        <div className="col-span-2 lg:col-span-1 min-w-0">
          <KpiCard
            label="Total to pay"
            icon={<Icon name="wallet" />}
            value={fmt(total)}
            sub={`${plan.title}${lateBackBalance ? ' back balance' : ''}`}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 min-w-0">
          <KpiCard
            label="Deadline"
            icon={<Icon name="calendar" />}
            accent="var(--clay)"
            value={<span className="block text-[15px] sm:text-base leading-snug">{lateBackBalance ? 'Due upon enrollment' : plan.deadline}</span>}
            sub={effectivePeriod}
          />
        </div>
        <KpiCard
          label="Voucher"
          icon={<Icon name="tag" />}
          accent="var(--sage)"
          value={appliedVoucher ? `${appliedVoucher.discountPercent}% off` : 'None'}
          sub={appliedVoucher ? appliedVoucher.code : 'Add a code below'}
        />
        <KpiCard
          label="Payments on record"
          icon={<Icon name="check" />}
          accent="var(--slate)"
          value={paidCount}
          sub="Recorded as paid"
        />
      </div>

      {/* Tuition obligation policy — kept prominent so parents see the
          full-year + clearance rules before they pick a plan. */}
      <Banner tone="warn">
        <p className="font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Tuition obligation — please read before paying
        </p>
        <ul className="text-[13px] leading-relaxed space-y-1.5 list-disc pl-5" style={{ color: 'var(--charcoal)' }}>
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
      </Banner>

      {/* Owed-past-months callout for MONTHLY late enrollees who've
          already paid some months but skipped earlier SY months.
          Distinct from the lateBackBalance callout below (which only
          fires when NOTHING has been paid yet). Surfaces the specific
          missing months so the parent knows to coordinate with the
          front desk to settle each. Suppressed when lateBackBalance
          is already showing — that callout already lists the range. */}
      {!lateBackBalance && owedPastMonths.length > 0 && (
        <Banner tone="warn">
          <p className="font-bold mb-1 flex flex-wrap items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <StatusPill tone="error">Overdue</StatusPill>
            Past-due month{owedPastMonths.length > 1 ? 's' : ''} still owed
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--charcoal)' }}>
            Our records show the following month{owedPastMonths.length > 1 ? 's have' : ' has'} not yet been settled: <span className="font-semibold">{owedPastMonths.join(', ')}</span>. Please coordinate with the front desk to catch up on {owedPastMonths.length > 1 ? 'these' : 'this'} before your next installment.
          </p>
        </Banner>
      )}

      {/* Late-enrollment back-balance callout. Surfaces ABOVE the
          checkout summary so the parent reads it before reaching the
          payment button. Replaces the normal per-installment
          "Total to pay" with the lump-sum back balance — the
          checkout summary below also re-binds to the effective
          amounts so the math stays consistent. */}
      {lateBackBalance && (
        <Banner tone="warn">
          <p className="font-bold mb-1 flex flex-wrap items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <StatusPill tone="warn">Due now</StatusPill>
            Late enrollment — settle back balance first
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--charcoal)' }}>
            Because you&apos;re starting the <span className="font-semibold">{plan.title}</span> plan after the school year began, you need to settle the <span className="font-semibold">{lateBackBalance.label}</span> as a lump sum before regular {plan.plan === 'BIANNUAL' ? 'second-half (December) ' : ''}installments can begin.
          </p>
          <p className="text-[13.5px] leading-relaxed mt-2" style={{ color: 'var(--charcoal)' }}>
            <span className="font-bold">Amount due now: {fmt(lateBackBalance.totalAmount)}</span>
            {' '}({lateBackBalance.months} {lateBackBalance.months === 1 ? 'month' : 'months'} covered).
          </p>
        </Banner>
      )}

      {/* Plan + method on the left, checkout summary and the Pay action on
          the right (stacked on phones: plan → voucher → method → pay). */}
      <div className="grid lg:grid-cols-5 gap-4 lg:gap-5 items-start">
        <div className="lg:col-span-3 space-y-4 min-w-0">
          <DashCard title="Choose your payment plan" icon={<Icon name="calendar" size={15} />} description="Amounts shown are tuition, plus miscellaneous where it applies.">
            <div className="grid sm:grid-cols-3 gap-2.5">
              {plans.map(p => (
                <ChoiceTile
                  key={p.plan}
                  active={selected === p.plan}
                  onClick={() => setSelected(p.plan)}
                  title={p.title}
                  sub={<>{fmt(p.tuition)}{p.misc > 0 ? ` + ${fmt(p.misc)} misc` : ''}</>}
                />
              ))}
            </div>
          </DashCard>

          {/* Voucher / promo code */}
          <DashCard title="Voucher or promo code" icon={<Icon name="tag" size={15} />} description="Discounts apply to tuition only.">
            {appliedVoucher ? (
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg px-3 py-2.5" style={{ background: 'var(--sage-tint)', border: '1px solid #CFE0BF' }}>
                <span className="inline-flex items-start gap-2 text-sm min-w-0" style={{ color: 'var(--charcoal)' }}>
                  <Icon name="check" size={16} className="mt-0.5" style={{ color: 'var(--deep-teal)' }} />
                  <span className="min-w-0 break-words">
                    Code <span className="font-bold tracking-wide">{appliedVoucher.code}</span> applied — <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>{appliedVoucher.discountPercent}% off tuition</span>
                  </span>
                </span>
                <button type="button" onClick={handleRemoveVoucher} className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--clay)' }}>Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <label htmlFor="voucher-code" className="sr-only">Voucher code</label>
                <input
                  id="voucher-code"
                  className={`${CONTROL} flex-1 min-w-0 uppercase tracking-wide`}
                  style={CONTROL_STYLE}
                  placeholder="Enter code"
                  value={voucherInput}
                  onChange={e => { setVoucherInput(e.target.value); setVoucherErr(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyVoucher() } }}
                  autoCapitalize="characters"
                  aria-invalid={voucherErr ? true : undefined}
                  aria-describedby={voucherErr ? 'voucher-err' : undefined}
                />
                <button type="button" onClick={handleApplyVoucher} disabled={voucherBusy} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                  {voucherBusy ? 'Checking…' : 'Apply'}
                </button>
              </div>
            )}
            {voucherErr && (
              <p id="voucher-err" role="alert" className="mt-2 text-[12.5px] inline-flex items-start gap-1.5" style={{ color: DANGER }}>
                <Icon name="alert" size={14} className="mt-0.5" /> {voucherErr}
              </p>
            )}
          </DashCard>

          {/* Method picker — three options as tiles. */}
          <DashCard title="How would you like to pay?" icon={<Icon name="wallet" size={15} />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <ChoiceTile
                active={method === 'PAYMONGO'} onClick={() => setMethod('PAYMONGO')}
                title="PayMongo checkout" sub="Credit card, GCash, Maya, or GrabPay"
              />
              <ChoiceTile
                active={method === 'FRONT_DESK_CASH'} onClick={() => setMethod('FRONT_DESK_CASH')}
                title="Pay at front desk" sub="How to pay in clinic"
              />
              <ChoiceTile
                active={method === 'BANK_DEPOSIT'} onClick={() => setMethod('BANK_DEPOSIT')}
                title="Bank transfer" sub="BDO — account details"
              />
            </div>
          </DashCard>
        </div>

        <div className="lg:col-span-2 min-w-0 lg:sticky lg:top-4">
          <DashCard title="Checkout summary" icon={<Icon name="file" size={15} />}>
            <dl className="grid grid-cols-[1fr_auto] text-sm gap-x-3 gap-y-1.5">
              <dt style={{ color: 'var(--mid-gray)' }}>
                {lateBackBalance ? `${plan.title} back-balance tuition (${lateBackBalance.months}× )` : `${plan.title} tuition`}
              </dt>
              <dd className="text-right tabular-nums">{fmt(effectiveTuition)}</dd>
              {appliedVoucher && discountAmount > 0 && <>
                <dt style={{ color: 'var(--deep-teal)' }}>Discount ({appliedVoucher.code} · {discountPercent}%)</dt>
                <dd className="text-right tabular-nums" style={{ color: 'var(--deep-teal)' }}>−{fmt(discountAmount)}</dd>
              </>}
              {effectiveMisc > 0 && <>
                <dt style={{ color: 'var(--mid-gray)' }}>
                  {lateBackBalance ? `Miscellaneous (${lateBackBalance.months}× )` : 'Miscellaneous'}
                </dt>
                <dd className="text-right tabular-nums">{fmt(effectiveMisc)}</dd>
              </>}
              <dt className="font-bold pt-2.5 mt-1" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Total to pay</dt>
              <dd className="text-right tabular-nums font-bold pt-2.5 mt-1 text-lg leading-tight" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>{fmt(total)}</dd>
            </dl>
            <div className="text-xs mt-3 rounded-lg px-3 py-2 leading-relaxed" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
              Period covered: <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{effectivePeriod}</span>
              <br />
              Deadline: <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{lateBackBalance ? 'Due upon enrollment' : plan.deadline}</span>
            </div>

            {err && <div className="mt-4"><Banner tone="error">{err}</Banner></div>}

            {/* Method-specific body */}
            {method === 'PAYMONGO' && (
              <div className="mt-4">
                <button type="button" onClick={handlePaymongo} disabled={busy} className={PAY_BTN} style={PRIMARY_STYLE}>
                  {busy ? 'Opening secure checkout…' : `Proceed to PayMongo checkout — ${fmt(total)}`}
                </button>
                <p className="text-[11.5px] text-center mt-2 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                  You will be redirected to PayMongo. Credit card, GCash, Maya, and GrabPay are supported. Your payment shows here as paid once our front desk records it.
                </p>
              </div>
            )}

            {method === 'FRONT_DESK_CASH' && (
              <div className="mt-4 rounded-lg p-3.5" style={{ border: '1px solid var(--light-gray)' }}>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--charcoal)' }}>
                  Visit our <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>{bank.branchLabel}</span> front desk and pay <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>{fmt(total)}</span> for <span className="font-semibold">{effectivePeriod}</span> (cash, card, GCash or Maya). The front desk issues your receipt and records the payment — it then shows here as paid.
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--mid-gray)' }}>There&apos;s nothing to submit here.</p>
              </div>
            )}

            {method === 'BANK_DEPOSIT' && (
              <div className="mt-4 rounded-lg p-3.5" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
                  {bank.branchLabel} bank account
                </p>
                <dl className="grid grid-cols-[auto_1fr] text-sm gap-x-4 gap-y-1.5">
                  <dt style={{ color: 'var(--mid-gray)' }}>Bank</dt>
                  <dd className="font-semibold min-w-0 break-words" style={{ color: 'var(--deep-teal)' }}>{bank.bank}</dd>
                  <dt style={{ color: 'var(--mid-gray)' }}>Branch</dt>
                  <dd className="min-w-0 break-words" style={{ color: 'var(--charcoal)' }}>{bank.branch}</dd>
                  <dt style={{ color: 'var(--mid-gray)' }}>Account name</dt>
                  <dd className="min-w-0 break-words" style={{ color: 'var(--charcoal)' }}>{bank.accountName}</dd>
                  <dt style={{ color: 'var(--mid-gray)' }}>Account number</dt>
                  <dd className="font-bold tabular-nums tracking-wider" style={{ color: 'var(--deep-teal)' }}>{bank.accountNumber}</dd>
                </dl>
                <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                  Transfer <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(total)}</span> for <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{effectivePeriod}</span> to the account above, then show or send the transfer receipt to the {bank.branchLabel} front desk with the student&apos;s name. They record the payment and it shows here as paid.
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--mid-gray)' }}>There&apos;s nothing to submit here.</p>
              </div>
            )}
          </DashCard>
        </div>
      </div>

      {/* Payment status by trimester — moved here from /profile so the
          "where are my payments?" grid lives alongside the Pay flow. */}
      <PaymentStatusGrid payments={history} />

      {/* Tuition fee table */}
      <DashCard flush title="Tuition fee schedule" icon={<Icon name="table" size={15} />} description="Every fee for this branch and when it is due.">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className={TH} style={TH_STYLE}>Item</th>
              <th className={`${TH} text-right`} style={TH_STYLE}>Amount</th>
              <th className={`${TH} hidden sm:table-cell`} style={TH_STYLE}>Deadline</th>
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
      </DashCard>

      {/* Payment history — a table from sm up, a stacked list on phones. */}
      {history.length > 0 && (
        <DashCard flush title="Your payment history" icon={<Icon name="clock" size={15} />} description={`${history.length} payment${history.length === 1 ? '' : 's'} on record`}>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className={TH} style={TH_STYLE}>Date</th>
                  <th className={TH} style={TH_STYLE}>Plan</th>
                  <th className={TH} style={TH_STYLE}>Period</th>
                  <th className={`${TH} text-right`} style={TH_STYLE}>Amount</th>
                  <th className={TH} style={TH_STYLE}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(p => (
                  <tr key={p.id} className={TR} style={TR_STYLE}>
                    <td className={`${TD} text-[12.5px] whitespace-nowrap`}>{new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}</td>
                    <td className={`${TD} text-[12.5px]`}>{PLAN_TITLE[p.plan] ?? p.plan}</td>
                    <td className={`${TD} text-[12.5px]`}>{p.period}</td>
                    <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{fmt(p.tuitionAmount + p.miscAmount)}</td>
                    <td className={TD}><PayStatus status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="sm:hidden">
            {history.map((p, i) => (
              <li key={p.id} className="px-4 py-3 flex items-start justify-between gap-3" style={i ? TR_STYLE : undefined}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-words" style={{ color: 'var(--charcoal)' }}>{p.period}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                    {PLAN_TITLE[p.plan] ?? p.plan} · {new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="text-sm font-semibold tabular-nums">{fmt(p.tuitionAmount + p.miscAmount)}</p>
                  <PayStatus status={p.status} />
                </div>
              </li>
            ))}
          </ul>
        </DashCard>
      )}
    </div>
  )
}

const PLAN_TITLE: Record<PaymentPlan, string> = { ANNUAL: 'Annual', BIANNUAL: 'Bi-annual', MONTHLY: 'Monthly' }

/** Primary Pay button: full width, taller than BTN_PRIMARY, and allowed to
 *  wrap so the amount never pushes it past a 375px screen. */
const PAY_BTN = `w-full inline-flex items-center justify-center text-center min-h-12 px-4 py-3 rounded-lg text-[15px] font-bold text-white leading-snug transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`

/** Paid / Pending as a pill: dot plus the word, never colour alone. */
function PayStatus({ status }: { status: PaymentRecord['status'] }) {
  return status === 'PAID'
    ? <StatusPill tone="success">Paid</StatusPill>
    : <StatusPill tone="warn">Pending</StatusPill>
}

/** Selectable tile for the plan and method pickers. Selection shows as a
 *  filled radio mark and a border, and is announced through aria-pressed. */
function ChoiceTile({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full min-w-0 text-left rounded-xl px-3.5 py-3 transition-colors ${FOCUS} ${active ? '' : 'hover:bg-[color:var(--paper)]'}`}
      style={active
        ? { background: 'var(--moss-tint)', border: '1.5px solid var(--teal)' }
        : { background: '#fff', border: '1.5px solid var(--light-gray)' }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: active ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{title}</span>
        <span aria-hidden className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ border: `1.5px solid ${active ? 'var(--deep-teal)' : 'var(--light-gray)'}`, background: '#fff' }}>
          {active && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--deep-teal)' }} />}
        </span>
      </span>
      <span className="block text-xs mt-1 tabular-nums break-words" style={{ color: 'var(--mid-gray)' }}>{sub}</span>
    </button>
  )
}

function Row({ item, amount, deadline }: { item: string; amount: string; deadline: string }) {
  return (
    <tr className={TR} style={TR_STYLE}>
      <td className={TD}>
        <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{item}</span>
        <span className="block sm:hidden text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{deadline}</span>
      </td>
      <td className={`${TD} text-right tabular-nums`}>{amount}</td>
      <td className={`${TD} hidden sm:table-cell text-[12.5px]`} style={{ color: 'var(--mid-gray)' }}>{deadline}</td>
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
 *
 * Display: a month × semester table from sm up; on phones a month list
 * with the semester tag and the payment details written out (the hover
 * card is not reachable by touch).
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
    <DashCard
      flush
      title="Payment status by trimester"
      icon={<Icon name="calendar" size={15} />}
      description={<>Hover or tab to a <strong>Paid</strong> or <strong>Pending</strong> status to see the payment details.</>}
    >
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className={TH} style={TH_STYLE}>Month</th>
              {SEMESTERS.map(s => (
                <th key={s.key} className={`${TH} text-center`} style={{ ...TH_STYLE, borderLeft: '1px solid var(--light-gray)' }}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTHS.map(month => {
              const sem = semesterOf(month)
              const match = paymentForMonth(month)
              return (
                <tr key={month} style={TR_STYLE}>
                  <td className="py-2 px-3 text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{month}</td>
                  {SEMESTERS.map(s => (
                    <td
                      key={s.key}
                      className="py-2 px-3 text-center text-[12.5px]"
                      style={{ borderLeft: '1px solid var(--light-gray)', background: s.key === sem ? undefined : SUBTLE_BG }}
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
      <ul className="sm:hidden">
        {MONTHS.map((month, i) => {
          const sem = semesterOf(month)
          const match = paymentForMonth(month)
          return (
            <li key={month} className="px-4 py-2.5 flex items-start justify-between gap-3" style={i ? TR_STYLE : undefined}>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{month}</p>
                <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Semester {sem}</p>
              </div>
              <div className="text-right min-w-0">
                {match ? (
                  <>
                    <PayStatus status={match.status} />
                    <p className="text-[11px] mt-1 break-words" style={{ color: 'var(--mid-gray)' }}>
                      {methodLabel(match.method)} · {fmt(match.tuitionAmount + match.miscAmount)}
                    </p>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>No payment recorded</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </DashCard>
  )
}

function PaymentStatusCell({ payment }: { payment: PaymentRecord }) {
  const tipId = useId()
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
      <button type="button" aria-describedby={tipId} className={`rounded-full ${FOCUS}`}>
        <StatusPill tone={paid ? 'success' : 'warn'}>{paid ? 'Paid' : 'Pending'}</StatusPill>
      </button>
      <span
        id={tipId}
        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 hidden group-hover:block group-focus-within:block text-left bg-white rounded-lg shadow-xl px-3 py-2 w-[220px]"
        style={{ border: '1px solid var(--light-gray)' }}
        role="tooltip"
      >
        <span className="block text-[10.5px] uppercase tracking-wider mb-1" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Payment details</span>
        <span className="block text-[12.5px]" style={{ color: 'var(--charcoal)' }}><strong>Method:</strong> {method}</span>
        <span className="block text-[12.5px]" style={{ color: 'var(--charcoal)' }}><strong>Date:</strong> {dateLabel}</span>
        <span className="block text-[12.5px]" style={{ color: 'var(--charcoal)' }}><strong>Amount:</strong> ₱{(total / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span className="block text-[12.5px] truncate" style={{ color: 'var(--charcoal)' }} title={reference}><strong>Ref:</strong> {reference}</span>
      </span>
    </span>
  )
}
