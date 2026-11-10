// PF above price: a consultant's unit pay (PF) must never be more than what
// the clinic charges for the session it pays for — e.g. ₱350 PF on a ₱300
// medical certificate. Pure helpers shared by the consultant rate editor (live
// warning), Payroll → PF Above Price, and the top-bar bell.

export interface PfRate {
  amount: unknown
  disabled?: boolean | null
  varies?: boolean | null // PF typed per session on the payslip — no fixed rate to check
  thresholdEnabled?: boolean | null
  thresholdAmount?: unknown
  reducedAmount?: unknown
  branchAmounts?: unknown
}

// Sessions this recent count toward the Payroll badge/banner and the bell; older ones stay listed.
// Overpaid sessions stay in the badge, banner and bell until they are deducted —
// counted from Jan 1 of the current year, the same default as the PF Above
// Price list (Hannah 2026-11-02: the badge said 1 while the list had 4 open).
export const pfPriceOpenSince = () =>
  `${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4)}-01-01`

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

interface PfLine {
  unitPrice?: unknown
  lineTotal?: unknown
  service?: { unitPayId?: string | null; unitPayEnabled?: boolean | null } | null
}
const isPriced = (i: PfLine) => Number(i.unitPrice) > 0 || Number(i.lineTotal) > 0

/**
 * A ₱0 line whose unit pay a priced line on the same order also carries is the
 * same session, not a second one: the priced line already pays that PF. (Hannah
 * 2026-11-10: from Oct 31 the GH front desk added a ₱0 BASIC SESSION to PEDIA
 * BASIC SESSION orders, whose service already pays BASIC SESSION — payroll would
 * have paid ₱620 twice per session.) A ₱0 line is still the session's PF carrier
 * when no priced line on the order carries its unit pay.
 */
export function isRedundantCarrier(item: PfLine, items: PfLine[]): boolean {
  if (isPriced(item)) return false
  const unitPayId = item.service?.unitPayId
  if (!unitPayId || item.service?.unitPayEnabled === false) return false
  return items.some(o => o !== item && isPriced(o) && o.service?.unitPayId === unitPayId && o.service?.unitPayEnabled !== false)
}

/**
 * What some lines brought in after the order's discount: their list total scaled
 * by the order's net over the list total of all its lines (the discount spread
 * pro rata). A ₱0 carrier's "rest of the order" is the net less this — not the net
 * less the lines' list prices, which turned a PWD discount into a negative charge.
 */
export function netShareOfLines(linesListTotal: number, orderNet: number, allLinesListTotal: number): number {
  if (!(allLinesListTotal > 0)) return 0
  return linesListTotal * (orderNet / allLinesListTotal)
}

/** A service a unit pay pays for. `branch` is the service's branch (ALL, SANDBOX_EAST, …);
 *  `branchPrices` are its per-branch price overrides, keyed by payroll branch (SBEA, SBGH). */
export interface PricedService { id: string; name: string; price: number; branch: string; branchPrices?: Record<string, number> }

export interface OverPrice {
  serviceId: string
  service: string
  price: number
  pay: number
  // Set only when a per-branch rate or price is what goes over.
  branch: string | null
}

/** Per-branch price overrides (rows keyed SANDBOX_EAST…) re-keyed by payroll branch; blanks dropped. */
export function branchPriceMap(rows: { branch: string; price: unknown }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const n = Number(r.price)
    if (r.price !== '' && r.price != null && Number.isFinite(n) && n > 0) out[ORDER_TO_PAYROLL_BRANCH[r.branch] || r.branch] = n
  }
  return out
}

/** The services whose price is below the PF this rate pays on them, lowest
 *  price first. A service sold at every branch is checked at each of the
 *  consultant's branches, since a per-branch rate or price can differ. */
export function overPrice(rate: PfRate, services: PricedService[], rateBranches: string[]): OverPrice[] {
  if (rate.disabled || rate.varies) return []
  const overrides = (rate.branchAmounts as Record<string, unknown> | null | undefined) || {}
  const out: OverPrice[] = []
  for (const s of services) {
    const branches = s.branch === 'ALL' ? (rateBranches.length ? rateBranches : ['']) : [ORDER_TO_PAYROLL_BRANCH[s.branch] || s.branch]
    let worst: { pay: number; price: number; branch: string } | null = null
    for (const b of branches) {
      const price = s.branchPrices?.[b] ?? s.price
      if (!(price > 0)) continue // no price at this branch
      const pay = rateAt(rate, b, price)
      if (pay > price + 0.005 && (!worst || pay - price > worst.pay - worst.price)) worst = { pay, price, branch: b }
    }
    if (worst) {
      const perBranch = (overrides[worst.branch] != null && overrides[worst.branch] !== '') || s.branchPrices?.[worst.branch] != null
      out.push({ serviceId: s.id, service: s.name, price: worst.price, pay: worst.pay, branch: perBranch ? worst.branch : null })
    }
  }
  return out.sort((a, b) => a.price - b.price || a.service.localeCompare(b.service))
}
