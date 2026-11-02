// PF above price: a consultant's unit pay (PF) must never be more than what
// the clinic charges for the session it pays for — e.g. ₱350 PF on a ₱300
// medical certificate. Pure helpers shared by the consultant rate editor (live
// warning), Payroll → PF Above Price, and the top-bar bell.

export interface PfRate {
  amount: unknown
  disabled?: boolean | null
  thresholdEnabled?: boolean | null
  thresholdAmount?: unknown
  reducedAmount?: unknown
  branchAmounts?: unknown
}

// Sessions this recent count toward the Payroll badge/banner and the bell; older ones stay listed.
export const PF_PRICE_RECENT_DAYS = 31
export const pfPriceRecentSince = () =>
  new Date(Date.now() - PF_PRICE_RECENT_DAYS * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

// Order/service branch → the payroll branch code a rate's branchAmounts override is keyed by.
export const ORDER_TO_PAYROLL_BRANCH: Record<string, string> = {
  SANDBOX_EAST: 'SBEA', SANDBOX_GREENHILLS: 'SBGH', VERDANA_STORE: 'VERDANA', AURA_INSTITUTE: 'AHI',
}

/** The consultant's unit pay for one session at a given threshold basis — the
 *  same rule payroll/generate applies (branch override, then threshold → reduced). */
export function rateAt(rate: PfRate, branch: string, basis: number) {
  const override = (rate.branchAmounts as Record<string, unknown> | null | undefined)?.[branch]
  const full = override != null && override !== '' && Number.isFinite(Number(override)) ? Number(override) : Number(rate.amount)
  const reduced = rate.thresholdEnabled === true && rate.thresholdAmount != null && rate.reducedAmount != null &&
    basis < Number(rate.thresholdAmount)
  return reduced ? Number(rate.reducedAmount) : full
}

/** A service a unit pay pays for. `branch` is the service's branch (ALL, SANDBOX_EAST, …). */
export interface PricedService { id: string; name: string; price: number; branch: string }

export interface OverPrice {
  serviceId: string
  service: string
  price: number
  pay: number
  // Set only when a per-branch rate is what goes over the price.
  branch: string | null
}

/** The services whose list price is below the PF this rate pays on them, lowest
 *  price first. A service sold at every branch is checked at each of the
 *  consultant's branches, since a per-branch rate can differ. */
export function overPrice(rate: PfRate, services: PricedService[], rateBranches: string[]): OverPrice[] {
  if (rate.disabled) return []
  const overrides = (rate.branchAmounts as Record<string, unknown> | null | undefined) || {}
  const out: OverPrice[] = []
  for (const s of services) {
    const branches = s.branch === 'ALL' ? (rateBranches.length ? rateBranches : ['']) : [ORDER_TO_PAYROLL_BRANCH[s.branch] || s.branch]
    let worst: { pay: number; branch: string } | null = null
    for (const b of branches) {
      const pay = rateAt(rate, b, s.price)
      if (pay > s.price + 0.005 && (!worst || pay > worst.pay)) worst = { pay, branch: b }
    }
    if (worst) {
      const perBranch = overrides[worst.branch] != null && overrides[worst.branch] !== ''
      out.push({ serviceId: s.id, service: s.name, price: s.price, pay: worst.pay, branch: perBranch ? worst.branch : null })
    }
  }
  return out.sort((a, b) => a.price - b.price || a.service.localeCompare(b.service))
}
