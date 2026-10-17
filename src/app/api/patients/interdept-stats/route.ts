import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadPosHistory } from '@/lib/pos-history'
import { fisherExact, mantelHaenszel, mantelHaenszelRR, benjaminiHochberg } from '@/lib/stats-2x2'

export const dynamic = 'force-dynamic'

// MD and PSYCHOLOGY are included: with POS history merged they are the two
// largest services (1,236 and 1,099 patients), so excluding them from
// co-occurrence hid the biggest referral relationships in the clinic.
// ORTHOSIS is deliberately left out — 9 patients is far too sparse for a
// chi-square test to say anything, and it would cost every other pair
// statistical power through the multiple-comparison correction.
const FOCUS_DEPTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY'] as const
type Dept = (typeof FOCUS_DEPTS)[number]

const DEPT_COLORS: Record<Dept, string> = {
  OT:         '#1A7B8A',
  PT:         '#2AAABB',
  SLP:        '#F59E0B',
  SPED:       '#8B5CF6',
  MD:         '#DC2626',
  PSYCHOLOGY: '#7C3AED',
}

// Distinct unordered pairs = n(n-1)/2. Derived rather than written as a literal
// so the correction can't silently go stale if FOCUS_DEPTS changes again — the
// previous hardcoded "/ 6" was correct only for 4 departments.
// Distinct unordered pairs tested, used by the Benjamini–Hochberg pass. The
// old Bonferroni α = 0.05 / PAIR_COUNT is gone: see the FDR block below for
// why controlling the false-discovery RATE fits this panel better than
// controlling the family-wise error rate.
const PAIR_COUNT = (FOCUS_DEPTS.length * (FOCUS_DEPTS.length - 1)) / 2

// Empty per-department tally, used for monthly volume and patient counts.
function zeroByDept(): Record<Dept, number> {
  return Object.fromEntries(FOCUS_DEPTS.map(d => [d, 0])) as Record<Dept, number>
}

// ── Chi-square test helpers (no external deps) ───────────────────────────────
// erfc approximation — Abramowitz & Stegun 7.1.26, max error 1.5×10⁻⁷
function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x)
  const t = 1 / (1 + 0.3275911 * x)
  const poly =
    t * (0.254829592 +
    t * (-0.284496736 +
    t * (1.421413741 +
    t * (-1.453152027 +
    t * 1.061405429))))
  return poly * Math.exp(-x * x)
}

// p-value for chi-square with 1 degree of freedom
// P(χ²(1) > x) = erfc(√(x/2))
function chi2pValue(chiSq: number): number {
  if (chiSq <= 0) return 1
  return erfc(Math.sqrt(chiSq / 2))
}

interface ChiResult {
  chiSq:    number   // χ² statistic (with Yates' correction when small cells)
  phi:      number   // φ coefficient (effect size, −1 to +1)
  pValue:   number   // two-tailed p-value
  pLabel:   string   // e.g. "p < 0.001"
  pSig:     boolean  // set after FDR correction across all pairs
  smallCell: boolean // true when any expected cell < 5
  exact:    boolean  // true when Fisher was used instead of χ²
}

// 2×2 chi-square test of independence + φ coefficient
// Cells: a = has both, b = has d1 only, c = has d2 only, d = neither
function chiSquareTest(a: number, b: number, c: number, d: number): ChiResult {
  const N = a + b + c + d
  const rowA = a + b  // count(d1)
  const rowB = c + d  // count(not d1)
  const colA = a + c  // count(d2)
  const colB = b + d  // count(not d2)

  // Expected cell frequencies
  const eA = (rowA * colA) / N
  const eB = (rowA * colB) / N
  const eC = (rowB * colA) / N
  const eD = (rowB * colB) / N
  const smallCell = Math.min(eA, eB, eC, eD) < 5

  // Yates' continuity correction when any expected cell < 5
  const ad = a * d
  const bc = b * c
  const denom = rowA * rowB * colA * colB

  let chiSq: number
  if (denom === 0) {
    chiSq = 0
  } else if (smallCell) {
    // Yates: |ad − bc| − N/2
    const corrected = Math.max(0, Math.abs(ad - bc) - N / 2)
    chiSq = (N * corrected * corrected) / denom
  } else {
    chiSq = (N * (ad - bc) * (ad - bc)) / denom
  }

  // φ = (ad − bc) / √(rowA·rowB·colA·colB)
  const phi = denom > 0 ? (ad - bc) / Math.sqrt(denom) : 0

  // Exact when the approximation is not valid, approximate when it is. Yates
  // used to cover this case; it narrows the error rather than removing it, and
  // with zero cells there is nothing for χ² to approximate.
  const exact = smallCell
  const pValue = exact ? fisherExact(a, b, c, d) : chi2pValue(chiSq)

  // pSig is filled in by the caller once every pair has been tested — see the
  // Benjamini–Hochberg pass below. Significance cannot be decided one pair at
  // a time when fifteen are being screened.
  const pSig = false

  let pLabel: string
  if      (pValue < 0.001) pLabel = 'p < 0.001'
  else if (pValue < 0.05)  pLabel = `p = ${pValue.toFixed(3)}`
  else                     pLabel = `p = ${pValue.toFixed(2)} (n.s.)`

  return { chiSq, phi, pValue, pLabel, pSig, smallCell, exact }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branchParam = req.nextUrl.searchParams.get('branches')
  const filterBranches = branchParam
    ? branchParam.split(',').map((b) => b.trim()).filter(Boolean)
    : null

  // Fetch all confirmed schedules with staff department + patient branch info
  const schedules = await prisma.schedule.findMany({
    where: { status: 'CONFIRMED', patientId: { not: null } },
    select: {
      patientId: true,
      date:      true,
      staff:     { select: { department: true } },
      patient:   { select: { branches: true, branch: true, patientType: true } },
    },
  })

  // Branch filter in JS (mirrors /api/patients/stats pattern)
  const branchFiltered = filterBranches
    ? schedules.filter((s) => {
        if (!s.patient) return false
        const bs: string[] =
          (s.patient.branches as unknown as string[]).length > 0
            ? (s.patient.branches as unknown as string[])
            : s.patient.branch
            ? [s.patient.branch as unknown as string]
            : []
        return bs.some((b) => filterBranches.includes(b))
      })
    : schedules

  const relevant = branchFiltered.filter((s) =>
    FOCUS_DEPTS.includes(s.staff.department as Dept)
  )

  // ── Build patient → Set<Dept> and month-dept session counts ─────────────────
  const patientDepts = new Map<string, Set<Dept>>()
  // Stratum per patient, for the Mantel–Haenszel adjustment. Pediatric and
  // adult caseloads barely overlap in which services they use, so the pooled
  // table answers a question nobody asked.
  const patientStratum = new Map<string, 'PEDIATRIC' | 'ADULT'>()
  const monthDept: Record<string, Record<Dept, number>> = {}

  for (const s of relevant) {
    if (!s.patientId) continue
    const dept = s.staff.department as Dept
    if (!patientDepts.has(s.patientId)) patientDepts.set(s.patientId, new Set())
    patientDepts.get(s.patientId)!.add(dept)
    const pt = s.patient?.patientType as string | undefined
    if (pt === 'PEDIATRIC' || pt === 'ADULT') patientStratum.set(s.patientId, pt)

    const d    = new Date(s.date)
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthDept[mKey]) monthDept[mKey] = zeroByDept()
    monthDept[mKey][dept]++
  }

  // ── Merge POS treatment history from the Accounting Hub ───────────────────
  // Without this, every figure below (patients per department, the affinity
  // matrix and the Multi-Service Combinations) is computed from ~5 months of
  // Schedule data only and understates real co-occurrence by 3-4x. POS orders
  // reach back to Jun 2024. Scoped to FOCUS_DEPTS so the matrix stays a 4x4
  // with its stated multiple-comparison correction.
  const pos = await loadPosHistory(filterBranches, FOCUS_DEPTS)
  if (pos) {
    for (const [key, depts] of pos.patientDepts) {
      if (!patientDepts.has(key)) patientDepts.set(key, new Set())
      for (const d of depts) {
        if ((FOCUS_DEPTS as readonly string[]).includes(d)) {
          patientDepts.get(key)!.add(d as Dept)
        }
      }
    }
    // Session volume feeds avg sessions/patient/mo, which can't be derived from
    // the deduped per-patient pairs above.
    for (const [month, byDept] of pos.monthly) {
      if (!monthDept[month]) monthDept[month] = zeroByDept()
      for (const d of FOCUS_DEPTS) {
        monthDept[month][d] += byDept[d] ?? 0
      }
    }
  }

  const N = patientDepts.size

  // ── Single-dept counts ───────────────────────────────────────────────────────
  const deptCounts: Record<string, number> = zeroByDept()
  for (const depts of patientDepts.values())
    for (const d of depts) deptCounts[d]++

  // ── Co-occurrence helpers ────────────────────────────────────────────────────
  function countAtLeast(required: Dept[]): number {
    let n = 0
    for (const depts of patientDepts.values())
      if (required.every((d) => depts.has(d))) n++
    return n
  }

  const pair: Record<string, number> = {}
  for (const d1 of FOCUS_DEPTS)
    for (const d2 of FOCUS_DEPTS)
      if (d1 !== d2) pair[`${d1}_${d2}`] = countAtLeast([d1, d2])

  /** 2×2 for one pair within one stratum (or all patients when stratum is null). */
  function table2x2(d1: Dept, d2: Dept, stratum: 'PEDIATRIC' | 'ADULT' | null): [number, number, number, number] {
    let a = 0, b = 0, c = 0, d = 0
    for (const [pid, depts] of patientDepts) {
      if (stratum && patientStratum.get(pid) !== stratum) continue
      const h1 = depts.has(d1), h2 = depts.has(d2)
      if (h1 && h2) a++
      else if (h1)  b++
      else if (h2)  c++
      else          d++
    }
    return [a, b, c, d]
  }

  function liftVal(d1: Dept, d2: Dept): number {
    const co = pair[`${d1}_${d2}`]
    const cA = deptCounts[d1], cB = deptCounts[d2]
    return cA && cB ? (co * N) / (cA * cB) : 0
  }
  function confVal(d1: Dept, d2: Dept): number {
    return deptCounts[d1] ? pair[`${d1}_${d2}`] / deptCounts[d1] : 0
  }

  // ── Combination stats ────────────────────────────────────────────────────────
  // With 6 departments there are 57 subsets of size >= 2, so the previous
  // hardcoded list no longer works. Enumerate them, keep only combinations that
  // actually occur, and return the largest — an exhaustive list would be mostly
  // zeroes and unreadable.
  const COMBOS: { label: string; depts: Dept[] }[] = []
  for (let mask = 0; mask < (1 << FOCUS_DEPTS.length); mask++) {
    const depts = FOCUS_DEPTS.filter((_, i) => mask & (1 << i))
    if (depts.length < 2) continue
    COMBOS.push({ label: depts.join(' + '), depts: [...depts] })
  }

  // Only combinations that actually occur, largest first, capped so the panel
  // stays readable. Dropping the zeroes is what makes 57 subsets presentable;
  // the cap is stated here so a truncated list isn't mistaken for the full set.
  const COMBO_LIMIT = 15
  const allCombos = COMBOS.map(({ label, depts }) => {
    const count = countAtLeast(depts)
    return { label, depts, count, supportPct: N > 0 ? (count / N) * 100 : 0 }
  })
  const occurring = allCombos.filter(c => c.count > 0).sort((a, b) => b.count - a.count)
  const comboStats = occurring.slice(0, COMBO_LIMIT)
  const comboTotal = occurring.length

  // ── Affinity matrix with chi-square + phi ────────────────────────────────────
  const affinityMatrix = FOCUS_DEPTS.map((d1) => ({
    dept:  d1,
    color: DEPT_COLORS[d1],
    count: deptCounts[d1],
    affinities: FOCUS_DEPTS.filter((d2) => d2 !== d1).map((d2) => {
      const co  = pair[`${d1}_${d2}`]
      const cA  = deptCounts[d1]
      const cB  = deptCounts[d2]
      // 2×2 table: a=co, b=cA-co, c=cB-co, d=N-cA-cB+co
      const chi = chiSquareTest(co, cA - co, cB - co, N - cA - cB + co)
      const strata = [table2x2(d1, d2, 'PEDIATRIC'), table2x2(d1, d2, 'ADULT')] as Array<[number, number, number, number]>
      const crude  = table2x2(d1, d2, null)
      const mh  = mantelHaenszel(strata, crude)
      // The figure to quote: how much more likely a patient is to use the
      // column service if they already use the row one, against patients who
      // do not. The odds ratio beside it is for comparing pairs, not for
      // saying out loud — with services this common it runs well above the
      // risk ratio and overstates the effect.
      const rr  = mantelHaenszelRR(strata, crude)
      return {
        target:        d2,
        color:         DEPT_COLORS[d2],
        confidencePct: Math.round(confVal(d1, d2) * 100),
        lift:          Number(liftVal(d1, d2).toFixed(2)),
        coCount:       co,
        phi:           Number(chi.phi.toFixed(3)),
        pValue:        Number(chi.pValue.toFixed(4)),
        pLabel:        chi.pLabel,
        pSig:          chi.pSig,
        smallCell:     chi.smallCell,
        exact:         chi.exact,
        // Odds ratio holding patient type constant, with 95% CI. This is the
        // number to read when it disagrees with the pooled one.
        oddsRatio:      Number.isFinite(mh.or)      ? Number(mh.or.toFixed(2))      : null,
        oddsCiLow:      Number.isFinite(mh.ciLow)   ? Number(mh.ciLow.toFixed(2))   : null,
        oddsCiHigh:     Number.isFinite(mh.ciHigh)  ? Number(mh.ciHigh.toFixed(2))  : null,
        crudeOddsRatio: Number.isFinite(mh.crudeOr) ? Number(mh.crudeOr.toFixed(2)) : null,
        riskRatio:      Number.isFinite(rr.rr)      ? Number(rr.rr.toFixed(2))      : null,
        riskCiLow:      Number.isFinite(rr.ciLow)   ? Number(rr.ciLow.toFixed(2))   : null,
        riskCiHigh:     Number.isFinite(rr.ciHigh)  ? Number(rr.ciHigh.toFixed(2))  : null,
        ageConfounded:  mh.confounded,
        qValue:         0,     // filled by the FDR pass below
        qLabel:         '',
      }
    }),
  }))

  // ── Benjamini–Hochberg across every pair tested ─────────────────────────────
  // Fifteen pairs are screened at once, so raw p-values overstate significance.
  // Bonferroni (the previous α = 0.05/15 = 0.0033) controls the chance of ANY
  // false positive, which is the wrong target for an exploratory panel — it is
  // so strict that real, moderate associations never show. BH controls the
  // expected PROPORTION of flagged pairs that are false, which is what someone
  // reading a co-occurrence chart actually wants to bound.
  //
  // Each unordered pair appears twice in the matrix (OT→PT and PT→OT), so the
  // correction is computed over DISTINCT pairs; counting both would double the
  // apparent number of tests and over-correct.
  {
    const seen = new Map<string, number>()
    for (const row of affinityMatrix)
      for (const aff of row.affinities) {
        const key = [row.dept, aff.target].sort().join('|')
        if (!seen.has(key)) seen.set(key, aff.pValue)
      }
    const keys = [...seen.keys()]
    const qs = benjaminiHochberg(keys.map((k) => seen.get(k)!))
    const q = new Map(keys.map((k, i) => [k, qs[i]]))
    for (const row of affinityMatrix)
      for (const aff of row.affinities) {
        const key = [row.dept, aff.target].sort().join('|')
        const qv = q.get(key) ?? 1
        aff.qValue = Number(qv.toFixed(4))
        aff.qLabel = qv < 0.001 ? 'q < 0.001'
                   : qv < 0.05  ? `q = ${qv.toFixed(3)}`
                   : `q = ${qv.toFixed(2)} (n.s.)`
        aff.pSig = qv < 0.05
      }
  }

  // ── Avg sessions per patient per month ───────────────────────────────────────
  const months = Object.values(monthDept)
  const avgSessionsPerMonth: Record<string, number> = {}
  for (const dept of FOCUS_DEPTS) {
    const monthlyTotals = months.map((m) => m[dept] ?? 0).filter((c) => c > 0)
    const avgMonthlyTotal = monthlyTotals.length
      ? monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length
      : 0
    avgSessionsPerMonth[dept] =
      deptCounts[dept] > 0
        ? Number((avgMonthlyTotal / deptCounts[dept]).toFixed(2))
        : 0
  }

  return NextResponse.json({
    totalPatients: N,
    deptCounts,
    comboStats,
    affinityMatrix,
    avgSessionsPerMonth,
    comboTotal,
    posMerged: !!pos,
    match: pos?.match ?? null,
  })
}
