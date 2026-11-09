'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Landmark, Building2, ClipboardCheck, CheckCircle2, CreditCard, Wallet, ShieldPlus,
} from 'lucide-react'
import {
  Banner, CARD_STYLE, CONTROL, CONTROL_STYLE, DashCard, EmptyState, GroupLabel, KpiCard,
  LABEL, LABEL_STYLE, PAGE, PageHeader, PillTabs, Skeleton, StatusPill, SUBTLE_BG, Tag,
  TD, TH, TH_STYLE, TR, TR_STYLE, displayName, type Tone,
} from '@/components/hub/ui'

// ── Company loan balance (live from the accounting hub) ───────────────────────
interface CompanyLoanRow {
  id: string
  category: string
  categoryLabel: string
  description: string | null
  branch: string | null
  principal: number
  paid: number
  outstanding: number
  perCutoff: number
  status: string
  dateReleased: string | null
}
interface CompanyLoanData {
  matchedAsEmployee: boolean
  loans: CompanyLoanRow[]
  totalOutstanding: number
}

// ── BDO Virtual Installment Card — reference rate table ───────────────────────
// Source: BDO Unibank, Inc. offer sheet (via the BDO Payroll Relationship
// Manager). Monthly amortization = loan amount × factor rate. Rates change at
// BDO's discretion — keep this table in sync with the latest offer sheet.
const BDO_RATES = [
  { term: 3,  factor: 0.33833462,  addon: 0.005,  eff: 0.0898 },
  { term: 6,  factor: 0.171669831, addon: 0.005,  eff: 0.1022 },
  { term: 9,  factor: 0.116113964, addon: 0.005,  eff: 0.1068 },
  { term: 12, factor: 0.087836841, addon: 0.0045, eff: 0.0983 },
  { term: 18, factor: 0.06005708,  addon: 0.0045, eff: 0.10 },
  { term: 24, factor: 0.046168007, addon: 0.0045, eff: 0.1005 },
  { term: 36, factor: 0.032281274, addon: 0.0045, eff: 0.1003 },
]
const BDO_MIN = 10000
const BDO_MAX = 500000

// ── Company loan (Employee 13th-Month Salary Loan Program, MEMO 2026-0201) ────
const COMPANY_INTEREST = 0.01 // flat 1%, no compounding
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function peso(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n: number): string {
  return (n * 100).toLocaleString('en-PH', { maximumFractionDigits: 2 }) + '%'
}

export default function LoansPerksPage() {
  const { data: session, status } = useSession()
  // Consultants (employmentType === 'consultant') only see the BDO loan; the
  // Company Loan is a benefit for regular employees. Anyone not tagged as a
  // consultant (employee / unset) sees both.
  //
  // Gate the Company Loan tab on the session being LOADED ('authenticated'),
  // not merely on !isConsultant. While the session is still loading,
  // employmentType is unknown, so a plain !isConsultant check renders the tab
  // and then removes it once "consultant" resolves — flashing it at consultants.
  // Requiring an authenticated session means it never appears for them at all.
  const isConsultant = (session?.user?.employmentType ?? '').toLowerCase() === 'consultant'
  const showCompany = status === 'authenticated' && !isConsultant

  const [tab, setTab] = useState<'bdo' | 'company' | 'hmo'>('bdo')
  // HMO is available to everyone (employees + consultants); only Company Loan
  // is gated. Fall back to BDO if a hidden Company Loan tab is somehow active.
  const activeTab: 'bdo' | 'company' | 'hmo' = tab === 'company' && !showCompany ? 'bdo' : tab

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="My account"
        title="Loans & Perks"
        description="Estimate your options before you apply. Figures are estimates only — your final terms come from the lender / HR."
      />

      {/* Subtabs */}
      <PillTabs
        label="Loans and perks"
        value={activeTab}
        onChange={(id) => setTab(id as 'bdo' | 'company' | 'hmo')}
        tabs={[
          { id: 'bdo', label: <><CreditCard size={14} aria-hidden />BDO Loan</> },
          ...(showCompany ? [{ id: 'company', label: <><Building2 size={14} aria-hidden />Company Loan</> }] : []),
          { id: 'hmo', label: <><ShieldPlus size={14} aria-hidden />HMO</> },
        ]}
      />

      {activeTab === 'bdo' ? <BdoLoan /> : activeTab === 'company' ? <CompanyLoan /> : <Hmo />}
    </div>
  )
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
const NUM = { fontVariantNumeric: 'tabular-nums' } as const
const BODY_TEXT = 'text-[13px] leading-relaxed'
const ICON_TEAL = { color: 'var(--teal)' } as const

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL} style={LABEL_STYLE}>{label}</label>
      {children}
      {hint && <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
    </div>
  )
}

function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <span className={`text-[13px] ${strong ? 'font-semibold' : ''}`} style={{ color: strong ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{label}</span>
      <span
        className={`text-right shrink-0 ${strong ? 'text-[15px] font-bold' : 'text-[13px] font-semibold'}`}
        style={{ ...NUM, fontFamily: 'var(--font-display)', color: strong ? 'var(--deep-teal)' : 'var(--charcoal)' }}
      >
        {value}
      </span>
    </div>
  )
}

/** The one headline number in a calculator or balance card. */
function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-4 py-3.5" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{label}</p>
      <p className="text-[24px] sm:text-[26px] font-bold leading-tight mt-0.5 [overflow-wrap:anywhere]" style={{ ...NUM, fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>{value}</p>
    </div>
  )
}

/** "How to apply" / "How to avail" card. */
function StepsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DashCard title={title} icon={<ClipboardCheck size={16} aria-hidden />}>
      <p className={BODY_TEXT} style={{ color: 'var(--charcoal)' }}>{children}</p>
    </DashCard>
  )
}

// ── BDO Loan ────────────────────────────────────────────────────────────────
function BdoLoan() {
  const [amount, setAmount] = useState(100000)
  const [term, setTerm] = useState(12)

  const r = useMemo(() => BDO_RATES.find((x) => x.term === term) ?? BDO_RATES[3], [term])
  const clampedAmount = Math.min(Math.max(amount || 0, 0), BDO_MAX)
  const monthly = clampedAmount * r.factor
  const total = monthly * term
  const interest = total - clampedAmount
  const outOfRange = (amount || 0) < BDO_MIN || (amount || 0) > BDO_MAX

  return (
    <div className="space-y-5">
      <DashCard
        title="BDO Virtual Installment Card — Loan Calculator"
        icon={<CreditCard size={16} aria-hidden />}
        description={`Loans from ${peso(BDO_MIN)} to ${peso(BDO_MAX)}. Pick an amount and term — everything recalculates instantly.`}
      >
        <div className="grid md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-4">
            <Field id="bdo-amount" label="Loan Amount (PHP)" hint={`Between ${peso(BDO_MIN)} and ${peso(BDO_MAX)}.`}>
              <input
                id="bdo-amount"
                type="number" min={BDO_MIN} max={BDO_MAX} step={1000} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className={`${CONTROL} w-full`} style={{ ...CONTROL_STYLE, ...NUM }}
              />
            </Field>
            <Field id="bdo-term" label="Term (months)">
              <select id="bdo-term" value={term} onChange={(e) => setTerm(Number(e.target.value))} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                {BDO_RATES.map((x) => <option key={x.term} value={x.term}>{x.term} months</option>)}
              </select>
            </Field>
            {outOfRange && (
              <Banner tone="warn">
                <span className="text-[12.5px]">Amount is outside the {peso(BDO_MIN)}–{peso(BDO_MAX)} range. The estimate below uses {peso(clampedAmount)}.</span>
              </Banner>
            )}
          </div>

          {/* Results */}
          <div>
            <Highlight label="Monthly Amortization" value={peso(monthly)} />
            <div className="mt-2">
              <ResultRow label="Factor Rate" value={r.factor.toFixed(9)} />
              <ResultRow label="Monthly Add-on Rate" value={pct(r.addon)} />
              <ResultRow label="Effective Rate / Annum" value={pct(r.eff)} />
              <ResultRow label="Total Payment over Term" value={peso(total)} />
              <ResultRow label="Total Interest / Add-on Cost" value={peso(interest)} strong />
            </div>
          </div>
        </div>
      </DashCard>

      {/* How to apply */}
      <StepsCard title="How to apply">
        Fill out the BDO Virtual Installment Card application form <strong>with your HR Officer</strong>, then <strong>submit it to BDO</strong> for processing. Your HR Officer can guide you through the requirements.
      </StepsCard>

      <NotesCard title="Good to know" items={[
        `Loan amounts range from ${peso(BDO_MIN)} to ${peso(BDO_MAX)}.`,
        'Monthly amortization = loan amount × factor rate for your chosen term.',
        'Rates are set by BDO and are subject to change — confirm the current rates when you apply.',
        'This tool is a reference estimate only; the official figures come from BDO’s Virtual Installment Card calculator and your approved application.',
      ]} />
    </div>
  )
}

// ── Company Loan (Employee 13th-Month Salary Loan Program) ──────────────────────
function CompanyLoan() {
  const [salary, setSalary] = useState(18128)
  const [startMonth, setStartMonth] = useState(6) // 1–12
  const maxMonthsToPay = Math.max(0, 11 - startMonth)
  const [monthsToPay, setMonthsToPay] = useState(5)

  // Keep months-to-pay within the allowed window for the chosen start month.
  const effMonths = Math.min(Math.max(monthsToPay, maxMonthsToPay === 0 ? 0 : 1), maxMonthsToPay)

  const monthsEarned = startMonth
  const maxLoanable = ((salary || 0) * monthsEarned) / 12
  const interest = maxLoanable * COMPANY_INTEREST
  const totalPayable = maxLoanable + interest
  const perCutoff = effMonths > 0 ? totalPayable / (effMonths * 2) : 0

  const monthOptions = Array.from({ length: maxMonthsToPay }, (_, i) => i + 1)

  // Live outstanding balance from the accounting hub's company loan register.
  const [loanData, setLoanData] = useState<CompanyLoanData | null>(null)
  const [loanState, setLoanState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    let cancelled = false
    fetch('/api/company-loans', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CompanyLoanData) => { if (!cancelled) { setLoanData(d); setLoanState('ready') } })
      .catch(() => { if (!cancelled) setLoanState('error') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-5">
      <Banner tone="info">
        <span className="text-[13px]" style={{ color: 'var(--charcoal)' }}>
          <strong>Employee 13th-Month Salary Loan Program</strong> (MEMO No. 2026-0201, effective 01 February 2026). A voluntary benefit that lets eligible regular employees borrow against the <strong>earned portion of their 13th-month pay</strong>. Participation is voluntary and every application is subject to management approval.
        </span>
      </Banner>

      {/* Live balance from the accounting hub */}
      <CurrentLoanCard state={loanState} data={loanData} />

      <DashCard
        title="Employee Salary Loan Calculator"
        icon={<Building2 size={16} aria-hidden />}
        description="Your maximum loanable amount is the 13th-month pay you’ve earned so far this year. Repayment runs by payroll deduction only until November."
      >
        <div className="grid md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-4">
            <Field id="co-salary" label="Basic Monthly Salary (PHP)">
              <input id="co-salary" type="number" min={0} step={100} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className={`${CONTROL} w-full`} style={{ ...CONTROL_STYLE, ...NUM }} />
            </Field>
            <Field id="co-start" label="Loan Start Month" hint="The month you plan to release the loan.">
              <select id="co-start" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field id="co-months" label="Months to Pay" hint={maxMonthsToPay === 0 ? 'No repayment window — the 13th-month pay is released in December.' : `Up to ${maxMonthsToPay} month${maxMonthsToPay === 1 ? '' : 's'} (until November).`}>
              <select
                id="co-months"
                value={effMonths}
                onChange={(e) => setMonthsToPay(Number(e.target.value))}
                disabled={maxMonthsToPay === 0}
                className={`${CONTROL} w-full`} style={CONTROL_STYLE}
              >
                {monthOptions.length === 0 && <option value={0}>—</option>}
                {monthOptions.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
              </select>
            </Field>
          </div>

          {/* Results */}
          <div>
            <Highlight label="Per Cut-off Deduction" value={maxMonthsToPay === 0 ? '—' : peso(perCutoff)} />
            <div className="mt-2">
              <ResultRow label="Months Earned (this year)" value={`${monthsEarned}`} />
              <ResultRow label="Maximum Months to Pay" value={`${maxMonthsToPay}`} />
              <ResultRow label="Maximum Loanable Amount" value={peso(maxLoanable)} />
              <ResultRow label={`Interest (${pct(COMPANY_INTEREST)})`} value={peso(interest)} />
              <ResultRow label="Total Payable" value={peso(totalPayable)} strong />
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>Deduction is spread over 2 cut-offs per month. The loanable amount is released to you by check.</p>
          </div>
        </div>

        {maxMonthsToPay === 0 && (
          <div className="mt-4">
            <Banner tone="warn">
              <span className="text-[12.5px]">Loans starting in November or December have no repayment window before the 13th-month release. Choose an earlier start month.</span>
            </Banner>
          </div>
        )}
      </DashCard>

      {/* Policy */}
      <section className="space-y-2.5">
        <GroupLabel>Program rules</GroupLabel>
        <div className="grid md:grid-cols-2 gap-4">
          <PolicyCard title="Who can apply" items={[
            'Regular employees at the time of application.',
            'At least six (6) months of service.',
            'No outstanding salary loan under this program.',
            'Not under notice of resignation, termination, or disciplinary action.',
            'You may loan more than once a year, once the previous loan is fully paid.',
          ]} />
          <PolicyCard title="Loan limit & interest" items={[
            'Maximum loanable = earned, accrued portion of your 13th-month pay as of the loan start month.',
            'Computed from your basic salary × months of service ÷ 12.',
            'A flat 1% interest applies to the approved amount.',
            'No compounding interest, penalties, or administrative charges.',
          ]} />
          <PolicyCard title="Repayment" items={[
            'Equal payroll deductions, twice a month.',
            'Repayment runs only until November (13th-month pay releases the first week of December).',
            'Deductions start the payroll period right after the loan is released.',
            'Early repayment is allowed with no penalty.',
            'Approved payroll deduction amounts are not subject to revision.',
          ]} />
          <PolicyCard title="Good to know" items={[
            'Your 13th-month pay is not withheld or delayed.',
            'You sign a voluntary authorization to offset any unpaid balance against your 13th-month pay.',
            'On separation, any unpaid balance may be deducted from your final pay.',
            'Approval is not guaranteed and is evaluated case-by-case; this is not a continuing entitlement.',
          ]} />
        </div>
      </section>

      {/* How to apply */}
      <StepsCard title="How to apply">
        Coordinate with your <strong>HR Officer</strong> to apply. If approved, you’ll sign the <strong>Employee Salary Loan Agreement and Authorization to Offset</strong>, together with the <strong>Authorization for Settlement of Outstanding Salary Loan</strong>. The HR Department reviews and approves applications and sets the repayment period based on your loan start month.
      </StepsCard>
    </div>
  )
}

// ── HMO (Insular ER Care Choice) ────────────────────────────────────────────────
const HMO_BENEFITS = [
  'Doctor’s professional fee',
  'Emergency room treatment',
  'Laboratory and diagnostic procedures',
  'Ward room, if confinement is required',
  'Required medicines during hospitalization',
  'Surgery and surgeon’s fees, when medically necessary',
  'Use of operating room, recovery room, and ICU, as medically necessary',
  'Special modalities of treatment as medically required in emergency room care and confinement (subject to a ₱5,000 standard limit)',
]

function Hmo() {
  return (
    <div className="space-y-5">
      {/* Eligibility */}
      <Banner tone="info">
        <span className="text-[13px]" style={{ color: 'var(--charcoal)' }}>
          Available to <strong>employees and consultants</strong> who work with us <strong>at least 3 days a week</strong>. Coordinate with your HR Officer to confirm your eligibility and enroll.
        </span>
      </Banner>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Coverage up to" value="₱50,000" />
        <KpiCard label="Eligible ages" value="18 – 70" />
        <KpiCard label="Plan use" value="One-time" />
      </div>

      <DashCard title="Insular ER Care Choice" icon={<ShieldPlus size={16} aria-hidden />}>
        <p className={`${BODY_TEXT} mb-5`} style={{ color: 'var(--charcoal)' }}>
          Perfect for short gigs and short trips. ER Care Choice gives you the freedom to choose the benefit
          limit and coverage period according to your health plan needs and budget. It provides up to{' '}
          <strong>₱50,000</strong> worth of outpatient (ER treatment) and inpatient (confinement) care coverage
          on emergency cases due to accidents, viral/bacterial diseases, and specific conditions. Adults{' '}
          <strong>ages 18 to 70</strong> can take advantage of this <strong>one-time use</strong> health plan.
        </p>

        <h3 className={LABEL} style={LABEL_STYLE}>
          The benefit limit covers
        </h3>
        <ul className="space-y-2 mt-2">
          {HMO_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--charcoal)' }}>
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" style={ICON_TEAL} aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </DashCard>

      <StepsCard title="How to avail">
        Talk to your <strong>HR Officer</strong> to enroll and get the details for the Insular ER Care Choice
        plan. Coverage terms and limits are set by Insular Life and are subject to their approval.
      </StepsCard>
    </div>
  )
}

// Display only: the hub sends codes like "ACTIVE" / "FULLY_PAID".
function statusLabel(s: string): string {
  return displayName(s.replace(/_/g, ' '))
}
function statusTone(s: string): Tone {
  const k = s.toLowerCase()
  if (k.includes('paid') || k.includes('closed') || k.includes('settled')) return 'success'
  if (k.includes('active') || k.includes('ongoing')) return 'info'
  if (k.includes('pending')) return 'warn'
  return 'neutral'
}

function CurrentLoanCard({ state, data }: { state: 'loading' | 'ready' | 'error'; data: CompanyLoanData | null }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label="Checking your loan records…" className="rounded-xl p-4 sm:p-5 space-y-3" style={CARD_STYLE}>
        <span className="sr-only">Checking your loan records…</span>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <Banner tone="warn">
        <span className="text-[12.5px]">Couldn’t load your current loan balance right now. The calculator below still works.</span>
      </Banner>
    )
  }
  const loans = data?.loans ?? []
  if (loans.length === 0) {
    return (
      <section className="rounded-xl" style={CARD_STYLE}>
        <EmptyState
          icon="check"
          title="No active company loan on record."
          hint="You have no outstanding company loan. Use the calculator below to estimate a new one."
        />
      </section>
    )
  }
  return (
    <DashCard
      flush
      title={`Your Current Company Loan${loans.length > 1 ? 's' : ''}`}
      icon={<Wallet size={16} aria-hidden />}
      footer="Balances reflect payroll deductions recorded in the accounting hub. Questions? Contact your HR Officer."
    >
      <div className="p-4 sm:p-5" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <Highlight label="Total Outstanding Balance" value={peso(data?.totalOutstanding ?? 0)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left border-collapse text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={`${TH} !px-5`} style={TH_STYLE}>Loan</th>
              <th scope="col" className={TH} style={TH_STYLE}>Status</th>
              <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Principal</th>
              <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Paid</th>
              <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Outstanding</th>
              <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Per Cut-off</th>
              <th scope="col" className={`${TH} !pr-5`} style={TH_STYLE}>Released</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id} className={TR} style={TR_STYLE}>
                <td className={`${TD} !px-5 min-w-[200px]`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{l.categoryLabel}</span>
                    {l.branch && <Tag tone="brand">{l.branch}</Tag>}
                  </div>
                  {l.description && <p className="text-[12px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{l.description}</p>}
                </td>
                <td className={TD}><StatusPill tone={statusTone(l.status)}>{statusLabel(l.status)}</StatusPill></td>
                <td className={`${TD} text-right whitespace-nowrap`} style={{ ...NUM, color: 'var(--charcoal)' }}>{peso(l.principal)}</td>
                <td className={`${TD} text-right whitespace-nowrap`} style={{ ...NUM, color: 'var(--charcoal)' }}>{peso(l.paid)}</td>
                <td className={`${TD} text-right whitespace-nowrap font-bold`} style={{ ...NUM, color: 'var(--deep-teal)' }}>{peso(l.outstanding)}</td>
                <td className={`${TD} text-right whitespace-nowrap`} style={{ ...NUM, color: 'var(--charcoal)' }}>{l.perCutoff > 0 ? peso(l.perCutoff) : '—'}</td>
                <td className={`${TD} !pr-5 whitespace-nowrap`} style={{ color: 'var(--mid-gray)' }}>{l.dateReleased ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashCard>
  )
}

function PolicyCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl p-4 sm:p-5 min-w-0" style={CARD_STYLE}>
      <h3 className="text-[13.5px] font-bold mb-2.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</h3>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--charcoal)' }}>
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={ICON_TEAL} aria-hidden />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NotesCard({ title, items }: { title: string; items: string[] }) {
  return (
    <DashCard title={title} icon={<Landmark size={16} aria-hidden />}>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--mid-gray)' }}>
            <span aria-hidden style={ICON_TEAL}>•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </DashCard>
  )
}
