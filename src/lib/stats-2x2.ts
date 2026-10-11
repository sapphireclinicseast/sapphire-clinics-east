// 2×2 association statistics, with no external dependency.
//
// Kept in its own module so the arithmetic can be exercised directly against
// published reference values — statistics written inline in a route handler
// get believed rather than checked.

// ── Exact test, for when the χ² approximation stops being valid ─────────────
// χ² assumes expected cell counts are large enough for a normal approximation;
// below ~5 it is simply the wrong distribution, and Yates' correction patches
// the symptom rather than the cause. Fisher's exact test computes the
// hypergeometric probability directly and is valid at any count, including
// zero cells — which do occur here (no SLP patient has ever also seen
// Psychiatry). Cost is a loop over one margin, which is nothing at this size.
//
// Log-gamma so factorials of N≈2,000 do not overflow a float.
export function logGamma(z: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let x = z, y = z, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += g[j] / ++y
  return -tmp + Math.log(2.5066282746310005 * ser / x)
}
const logFact = (n: number) => logGamma(n + 1)

/** Two-sided Fisher exact p: sum of all tables no more likely than observed. */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const n1 = a + b, n2 = c + d, k = a + c, N = n1 + n2
  if (N === 0) return 1
  const logP = (x: number) =>
    logFact(n1) + logFact(n2) + logFact(k) + logFact(N - k) - logFact(N)
    - logFact(x) - logFact(n1 - x) - logFact(k - x) - logFact(n2 - k + x)
  const obs = logP(a)
  const lo = Math.max(0, k - n2), hi = Math.min(k, n1)
  let total = 0
  for (let x = lo; x <= hi; x++) {
    const lp = logP(x)
    // 1e-7 slack so a table that ties the observed one on probability is
    // counted rather than dropped by floating-point noise.
    if (lp <= obs + 1e-7) total += Math.exp(lp)
  }
  return Math.min(1, total)
}

// ── Mantel–Haenszel: the same association, held apart by age ────────────────
// Pediatric and adult patients use almost disjoint services, so a pooled 2×2
// can show an association that exists in neither group, or hide one present in
// both — Simpson's paradox. MH combines the per-stratum tables into one odds
// ratio, which is what "controlling for patient type" means here.
export interface MHResult {
  or: number          // Mantel–Haenszel pooled odds ratio
  ciLow: number
  ciHigh: number
  crudeOr: number     // unadjusted, for comparison
  confounded: boolean // pooled and adjusted disagree enough to matter
}

export function oddsRatio(a: number, b: number, c: number, d: number): number {
  // Haldane–Anscombe ½ correction: an OR is undefined with a zero cell, and
  // zero cells are real here rather than a data fault.
  const z = (a === 0 || b === 0 || c === 0 || d === 0)
  const [A, B, C, D] = z ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d]
  return (A * D) / (B * C)
}

export function mantelHaenszel(strata: Array<[number, number, number, number]>, crude: [number, number, number, number]): MHResult {
  let num = 0, den = 0, varNum = 0
  for (const [a, b, c, d] of strata) {
    const n = a + b + c + d
    if (n === 0) continue
    num += (a * d) / n
    den += (b * c) / n
    // Robins–Breslow–Greenland variance for log(OR_MH)
    const P = (a + d) / n, Q = (b + c) / n, R = (a * d) / n, S = (b * c) / n
    varNum += (P * R) / 2 + ((P * S) + (Q * R)) / 2 + (Q * S) / 2
  }
  const or = den > 0 ? num / den : NaN
  const crudeOr = oddsRatio(...crude)
  let ciLow = NaN, ciHigh = NaN
  if (or > 0 && isFinite(or) && num > 0 && den > 0) {
    const se = Math.sqrt(varNum / (num * den))
    ciLow  = Math.exp(Math.log(or) - 1.96 * se)
    ciHigh = Math.exp(Math.log(or) + 1.96 * se)
  }
  // 20% divergence on the log scale is the usual epidemiological rule of thumb
  // for "the crude estimate is confounded".
  const confounded = isFinite(or) && or > 0 && crudeOr > 0
    && Math.abs(Math.log(crudeOr) - Math.log(or)) > Math.log(1.2)
  return { or, ciLow, ciHigh, crudeOr, confounded }
}


/**
 * Benjamini–Hochberg adjusted p-values ("q-values"), returned in input order.
 *
 * Controls the expected PROPORTION of flagged results that are false, which is
 * the right target when screening many pairs at once. Bonferroni controls the
 * chance of any false positive at all — far stricter, and strict enough that
 * real moderate associations never surface in a panel this size.
 *
 * q is forced monotone by walking down from the largest p, so a pair can never
 * end up with a smaller q than one with a smaller p.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length
  if (m === 0) return []
  const order = pValues.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(m)
  let running = 1
  for (let rank = m - 1; rank >= 0; rank--) {
    const [p, idx] = order[rank]
    running = Math.min(running, (p * m) / (rank + 1))
    out[idx] = running
  }
  return out
}

/**
 * Mantel–Haenszel RISK ratio, stratified, with a 95% CI.
 *
 * The question "if a patient uses A, how much more likely are they to use B?"
 * is answered by a risk ratio, not an odds ratio. An OR multiplies ODDS, and
 * when the outcome is common — several of these services are used by 15–35% of
 * patients — the OR runs well above the risk ratio and reads as a much stronger
 * effect than it is. OR is still the right thing to adjust and compare across
 * pairs; RR is the right thing to say out loud.
 *
 * RR = P(B | has A) / P(B | no A). Note this differs from lift, which divides
 * by P(B) over everyone — a denominator that includes the exposed group and so
 * always pulls the figure toward 1.
 */
export interface RRResult {
  rr: number
  ciLow: number
  ciHigh: number
  crudeRr: number
}

export function mantelHaenszelRR(
  strata: Array<[number, number, number, number]>,
  crude: [number, number, number, number],
): RRResult {
  let R = 0, S = 0, varNum = 0
  for (const [a, b, c, d] of strata) {
    const n = a + b + c + d
    if (n === 0) continue
    const n1 = a + b          // exposed  (has A)
    const n0 = c + d          // unexposed
    const m1 = a + c          // total with the outcome (has B)
    R += (a * n0) / n
    S += (c * n1) / n
    // Greenland–Robins variance for log(RR_MH)
    varNum += ((n1 * n0 * m1) - (a * c * n)) / (n * n)
  }
  const rr = S > 0 ? R / S : NaN
  const [ca, cb, cc, cd] = crude
  const pExp = (ca + cb) > 0 ? ca / (ca + cb) : NaN
  const pUn  = (cc + cd) > 0 ? cc / (cc + cd) : NaN
  const crudeRr = pUn > 0 ? pExp / pUn : NaN
  let ciLow = NaN, ciHigh = NaN
  if (rr > 0 && isFinite(rr) && R > 0 && S > 0) {
    const se = Math.sqrt(varNum / (R * S))
    ciLow  = Math.exp(Math.log(rr) - 1.96 * se)
    ciHigh = Math.exp(Math.log(rr) + 1.96 * se)
  }
  return { rr, ciLow, ciHigh, crudeRr }
}
