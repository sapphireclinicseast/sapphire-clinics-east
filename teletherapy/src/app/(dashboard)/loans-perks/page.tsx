'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  HandCoins, Landmark, Building2, Info, ClipboardCheck,
  CheckCircle2, AlertTriangle, CreditCard, Wallet, Loader2,
} from 'lucide-react'

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
  const { data: session } = useSession()
  // Consultants (employmentType === 'consultant') only see the BDO loan; the
  // Company Loan is a benefit for regular employees. Anyone not tagged as a
  // consultant (employee / unset) sees both.
  const isConsultant = (session?.user?.employmentType ?? '').toLowerCase() === 'consultant'

  const [tab, setTab] = useState<'bdo' | 'company'>('bdo')
  const activeTab: 'bdo' | 'company' = isConsultant ? 'bdo' : tab

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20 shrink-0">
            <HandCoins className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Loans &amp; Perks
            </h1>
            <p className="text-white/70 text-sm mt-1">
              Estimate your options before you apply. Figures are estimates only — your final terms come from the lender / HR.
            </p>
          </div>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--light-gray)]">
        <TabButton icon={<CreditCard size={15} />} label="BDO Loan" active={activeTab === 'bdo'} onClick={() => setTab('bdo')} />
        {!isConsultant && (
          <TabButton icon={<Building2 size={15} />} label="Company Loan" active={activeTab === 'company'} onClick={() => setTab('company')} />
        )}
      </div>

      {activeTab === 'bdo' ? <BdoLoan /> : <CompanyLoan />}
    </div>
  )
}

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
        active
          ? 'border-[var(--moss)] text-[var(--deep-teal)]'
          : 'border-transparent text-[var(--mid-gray)] hover:text-[var(--charcoal)]'
      }`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {icon}
      {label}
    </button>
  )
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--mid-gray)] mt-1">{hint}</p>}
    </div>
  )
}

function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--light-gray)] last:border-0">
      <span className={`text-[13px] ${strong ? 'font-bold text-[var(--narra)]' : 'text-[var(--mid-gray)]'}`}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'text-[15px] font-bold text-[var(--deep-teal)]' : 'text-[13px] font-semibold text-[var(--charcoal)]'}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </span>
    </div>
  )
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-5 py-4 bg-[var(--sage-tint)] border border-[var(--moss)]/30">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--moss)]">{label}</p>
      <p className="text-[26px] font-bold text-[var(--deep-teal)] leading-tight tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
    </div>
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
    <div className="animate-fade-up">
      <div className="card-static mb-5">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard size={18} className="text-[var(--moss)]" />
          <h2 className="text-[15px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>BDO Virtual Installment Card — Loan Calculator</h2>
        </div>
        <p className="text-[12.5px] text-[var(--mid-gray)] mb-5">Loans from {peso(BDO_MIN)} to {peso(BDO_MAX)}. Pick an amount and term — everything recalculates instantly.</p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-4">
            <Field label="Loan Amount (PHP)" hint={`Between ${peso(BDO_MIN)} and ${peso(BDO_MAX)}.`}>
              <input
                type="number" min={BDO_MIN} max={BDO_MAX} step={1000} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="input text-[14px]"
              />
            </Field>
            <Field label="Term (months)">
              <select value={term} onChange={(e) => setTerm(Number(e.target.value))} className="input text-[14px]">
                {BDO_RATES.map((x) => <option key={x.term} value={x.term}>{x.term} months</option>)}
              </select>
            </Field>
            {outOfRange && (
              <div className="flex items-start gap-2 text-[12px] text-[var(--clay)] bg-[var(--clay-tint)] rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>Amount is outside the {peso(BDO_MIN)}–{peso(BDO_MAX)} range. The estimate below uses {peso(clampedAmount)}.</span>
              </div>
            )}
          </div>

          {/* Results */}
          <div>
            <Highlight label="Monthly Amortization" value={peso(monthly)} />
            <div className="mt-3">
              <ResultRow label="Factor Rate" value={r.factor.toFixed(9)} />
              <ResultRow label="Monthly Add-on Rate" value={pct(r.addon)} />
              <ResultRow label="Effective Rate / Annum" value={pct(r.eff)} />
              <ResultRow label="Total Payment over Term" value={peso(total)} />
              <ResultRow label="Total Interest / Add-on Cost" value={peso(interest)} strong />
            </div>
          </div>
        </div>
      </div>

      {/* How to apply */}
      <div className="card-static !p-4 mb-5 border-l-4 border-[var(--moss)]">
        <div className="flex items-start gap-3">
          <ClipboardCheck size={20} className="text-[var(--moss)] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[13.5px] font-bold text-[var(--narra)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How to apply</h3>
            <p className="text-[13px] text-[var(--charcoal)] leading-relaxed">
              Fill out the BDO Virtual Installment Card application form <strong>with your HR Officer</strong>, then <strong>submit it to BDO</strong> for processing. Your HR Officer can guide you through the requirements.
            </p>
          </div>
        </div>
      </div>

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
    <div className="animate-fade-up">
      <div className="card-static !p-4 mb-5 bg-[var(--pale-teal)]/40 border-l-4 border-[var(--deep-teal)]">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-[var(--deep-teal)] shrink-0 mt-0.5" />
          <p className="text-[13px] text-[var(--charcoal)] leading-relaxed">
            <strong>Employee 13th-Month Salary Loan Program</strong> (MEMO No. 2026-0201, effective 01 February 2026). A voluntary benefit that lets eligible regular employees borrow against the <strong>earned portion of their 13th-month pay</strong>. Participation is voluntary and every application is subject to management approval.
          </p>
        </div>
      </div>

      {/* Live balance from the accounting hub */}
      <CurrentLoanCard state={loanState} data={loanData} />

      <div className="card-static mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={18} className="text-[var(--deep-teal)]" />
          <h2 className="text-[15px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>Employee Salary Loan Calculator</h2>
        </div>
        <p className="text-[12.5px] text-[var(--mid-gray)] mb-5">Your maximum loanable amount is the 13th-month pay you’ve earned so far this year. Repayment runs by payroll deduction only until November.</p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-4">
            <Field label="Basic Monthly Salary (PHP)">
              <input type="number" min={0} step={100} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="input text-[14px]" />
            </Field>
            <Field label="Loan Start Month" hint="The month you plan to release the loan.">
              <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className="input text-[14px]">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Months to Pay" hint={maxMonthsToPay === 0 ? 'No repayment window — the 13th-month pay is released in December.' : `Up to ${maxMonthsToPay} month${maxMonthsToPay === 1 ? '' : 's'} (until November).`}>
              <select
                value={effMonths}
                onChange={(e) => setMonthsToPay(Number(e.target.value))}
                disabled={maxMonthsToPay === 0}
                className="input text-[14px] disabled:opacity-50"
              >
                {monthOptions.length === 0 && <option value={0}>—</option>}
                {monthOptions.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
              </select>
            </Field>
          </div>

          {/* Results */}
          <div>
            <Highlight label="Per Cut-off Deduction" value={maxMonthsToPay === 0 ? '—' : peso(perCutoff)} />
            <div className="mt-3">
              <ResultRow label="Months Earned (this year)" value={`${monthsEarned}`} />
              <ResultRow label="Maximum Months to Pay" value={`${maxMonthsToPay}`} />
              <ResultRow label="Maximum Loanable Amount" value={peso(maxLoanable)} />
              <ResultRow label={`Interest (${pct(COMPANY_INTEREST)})`} value={peso(interest)} />
              <ResultRow label="Total Payable" value={peso(totalPayable)} strong />
            </div>
            <p className="text-[11px] text-[var(--mid-gray)] mt-2">Deduction is spread over 2 cut-offs per month. The loanable amount is released to you by check.</p>
          </div>
        </div>

        {maxMonthsToPay === 0 && (
          <div className="flex items-start gap-2 text-[12px] text-[var(--clay)] bg-[var(--clay-tint)] rounded-lg px-3 py-2 mt-4">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>Loans starting in November or December have no repayment window before the 13th-month release. Choose an earlier start month.</span>
          </div>
        )}
      </div>

      {/* Policy */}
      <div className="grid md:grid-cols-2 gap-4 mb-5">
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

      {/* How to apply */}
      <div className="card-static !p-4 border-l-4 border-[var(--deep-teal)]">
        <div className="flex items-start gap-3">
          <ClipboardCheck size={20} className="text-[var(--deep-teal)] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[13.5px] font-bold text-[var(--narra)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How to apply</h3>
            <p className="text-[13px] text-[var(--charcoal)] leading-relaxed">
              Coordinate with your <strong>HR Officer</strong> to apply. If approved, you’ll sign the <strong>Employee Salary Loan Agreement and Authorization to Offset</strong>, together with the <strong>Authorization for Settlement of Outstanding Salary Loan</strong>. The HR Department reviews and approves applications and sets the repayment period based on your loan start month.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CurrentLoanCard({ state, data }: { state: 'loading' | 'ready' | 'error'; data: CompanyLoanData | null }) {
  if (state === 'loading') {
    return (
      <div className="card-static !p-4 mb-5 flex items-center gap-2 text-[13px] text-[var(--mid-gray)]">
        <Loader2 size={16} className="animate-spin text-[var(--moss)]" /> Checking your loan records…
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="card-static !p-4 mb-5 text-[12.5px] text-[var(--mid-gray)]">
        Couldn’t load your current loan balance right now. The calculator below still works.
      </div>
    )
  }
  const loans = data?.loans ?? []
  if (loans.length === 0) {
    return (
      <div className="card-static !p-4 mb-5 flex items-start gap-3">
        <CheckCircle2 size={20} className="text-[var(--moss)] shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-[var(--narra)]">No active company loan on record.</p>
          <p className="text-[12.5px] text-[var(--mid-gray)] mt-0.5">You have no outstanding company loan. Use the calculator below to estimate a new one.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="card-static mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={18} className="text-[var(--deep-teal)]" />
        <h2 className="text-[15px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
          Your Current Company Loan{loans.length > 1 ? 's' : ''}
        </h2>
      </div>
      <Highlight label="Total Outstanding Balance" value={peso(data?.totalOutstanding ?? 0)} />
      <div className="mt-4 space-y-3">
        {loans.map((l) => (
          <div key={l.id} className="rounded-xl border border-[var(--light-gray)] p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{l.categoryLabel}</span>
                {l.branch && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--pale-teal)] text-[var(--teal)] font-semibold">{l.branch}</span>}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sage-tint)] text-[var(--moss)] font-bold uppercase tracking-wide shrink-0">{l.status}</span>
            </div>
            {l.description && <p className="text-[12px] text-[var(--mid-gray)] mb-2">{l.description}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <LoanStat label="Principal" value={peso(l.principal)} />
              <LoanStat label="Paid" value={peso(l.paid)} />
              <LoanStat label="Outstanding" value={peso(l.outstanding)} strong />
              <LoanStat label="Per Cut-off" value={l.perCutoff > 0 ? peso(l.perCutoff) : '—'} />
            </div>
            {l.dateReleased && <p className="text-[11px] text-[var(--mid-gray)] mt-2">Released {l.dateReleased}</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--mid-gray)] mt-3">Balances reflect payroll deductions recorded in the accounting hub. Questions? Contact your HR Officer.</p>
    </div>
  )
}

function LoanStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">{label}</p>
      <p
        className={`tabular-nums ${strong ? 'text-[15px] font-bold text-[var(--deep-teal)]' : 'text-[13px] font-semibold text-[var(--charcoal)]'}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </p>
    </div>
  )
}

function PolicyCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card-static !p-4">
      <h3 className="text-[13px] font-bold text-[var(--narra)] mb-2.5" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--charcoal)] leading-snug">
            <CheckCircle2 size={14} className="text-[var(--moss)] shrink-0 mt-0.5" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NotesCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card-static !p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Landmark size={16} className="text-[var(--mid-gray)]" />
        <h3 className="text-[13px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--mid-gray)] leading-snug">
            <span className="text-[var(--moss)] mt-0.5">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
