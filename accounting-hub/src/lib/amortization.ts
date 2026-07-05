// Straight-line amortization split + effective annual rate (IRR) helpers for
// Loans & Advances. Matches the convention: principal portion = principal/term,
// fixed interest portion = amortization − principal/term.

export interface AmortResult {
  monthlyAmortization: number
  principalPerMonth: number
  interestPerMonth: number
  totalInterest: number
  flatAnnualPct: number       // total interest ÷ principal ÷ years (matches the working example)
  effectiveAnnualPct: number  // IRR-based, annualised (true cost of funds)
}

// Flat/simple annual rate: total interest as a % of principal, per year.
function flatRate(principal: number, totalInterest: number, months: number): number {
  const years = months / 12
  return principal > 0 && years > 0 ? (totalInterest / principal / years) * 100 : 0
}

// Effective annual rate from (principal, level monthly payment, term months) via IRR.
export function effectiveAnnualRate(principal: number, monthlyPayment: number, months: number): number {
  if (!(principal > 0) || !(monthlyPayment > 0) || !(months > 0)) return 0
  const total = monthlyPayment * months
  if (total <= principal) return 0
  // Solve principal = payment * (1-(1+r)^-n)/r for monthly r via bisection.
  const pv = (r: number) => r === 0 ? monthlyPayment * months : monthlyPayment * (1 - Math.pow(1 + r, -months)) / r
  let lo = 0, hi = 1 // 0%..100% monthly (very wide)
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const v = pv(mid)
    if (v > principal) lo = mid; else hi = mid
  }
  const monthly = (lo + hi) / 2
  return (Math.pow(1 + monthly, 12) - 1) * 100
}

// From annual % + term → monthly amortization (straight-line): principal/term + (principal*rate*years)/months.
export function fromAnnualPct(principal: number, annualPct: number, months: number): AmortResult {
  const principalPerMonth = months > 0 ? principal / months : 0
  const years = months / 12
  const totalInterest = principal * (annualPct / 100) * years
  const interestPerMonth = months > 0 ? totalInterest / months : 0
  const monthlyAmortization = principalPerMonth + interestPerMonth
  return { monthlyAmortization, principalPerMonth, interestPerMonth, totalInterest, flatAnnualPct: flatRate(principal, totalInterest, months), effectiveAnnualPct: effectiveAnnualRate(principal, monthlyAmortization, months) }
}

// From monthly amortization + term → back-computed rate + split.
export function fromMonthlyAmort(principal: number, monthlyAmortization: number, months: number): AmortResult {
  const principalPerMonth = months > 0 ? principal / months : 0
  const interestPerMonth = monthlyAmortization - principalPerMonth
  const totalInterest = interestPerMonth * months
  return { monthlyAmortization, principalPerMonth, interestPerMonth, totalInterest, flatAnnualPct: flatRate(principal, totalInterest, months), effectiveAnnualPct: effectiveAnnualRate(principal, monthlyAmortization, months) }
}

// Schedule dates: start month/year, cadence, "every nth" day (capped to month end).
export function scheduleDates(startMonth: number, startYear: number, cadence: string, day: number, count: number): { y: number; m: number; d: number }[] {
  const stepMonths = cadence === 'MONTHLY' ? 1 : cadence === 'QUARTERLY' ? 3 : cadence === 'BIANNUALLY' ? 6 : 12
  const out: { y: number; m: number; d: number }[] = []
  let m = startMonth - 1, y = startYear // 0-indexed month
  for (let i = 0; i < count; i++) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    out.push({ y, m: m + 1, d: Math.min(day || lastDay, lastDay) })
    m += stepMonths
    while (m > 11) { m -= 12; y += 1 }
  }
  return out
}
