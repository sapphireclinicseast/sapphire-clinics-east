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
// statistical power through the Bonferroni correction.
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

// ── MD subspecialties ───────────────────────────────────────────────────────
// "MD" is one department but three practices that refer into quite different
// therapy lines, so a single MD row in the affinity matrix averages them into a
// pattern none of them actually has. These three are broken out in their own
// panel rather than added to FOCUS_DEPTS: putting them in the matrix would make
// it 8×8 with 28 pairs to correct across, cost every existing pair statistical
// power, and lose the aggregate MD row that the rest of the dashboard quotes.
const MD_SUBS = ['DEVELOPMENTAL_PEDIATRICS', 'REHABILITATION_MEDICINE', 'PSYCHIATRY'] as const
type MdSub = (typeof MD_SUBS)[number]

const MD_SUB_LABELS: Record<MdSub, string> = {
  DEVELOPMENTAL_PEDIATRICS: 'Developmental Pediatrics',
  REHABILITATION_MEDICINE:  'Rehabilitation Medicine',
  PSYCHIATRY:               'Psychiatry',
}
const MD_SUB_SHORT: Record<MdSub, string> = {
  DEVELOPMENTAL_PEDIATRICS: 'DevPed',
  REHABILITATION_MEDICINE:  'Rehab Med',
  PSYCHIATRY:               'Psychiatry',
}
// Reds and pinks, so the subspecialty rows read as a split of MD's own #DC2626
// rather than as three new departments.
const MD_SUB_COLORS: Record<MdSub, string> = {
  DEVELOPMENTAL_PEDIATRICS: '#DC2626',
  REHABILITATION_MEDICINE:  '#EA580C',
  PSYCHIATRY:               '#BE185D',
}

// The therapy lines each subspecialty is clinically expected to refer into.
// This marks an expectation; it does not filter anything. Every subspecialty is
// scored against every therapy service precisely so a pattern that does NOT
// match the expectation is as visible as one that does.
const MD_SUB_EXPECTED: Record<MdSub, readonly Dept[]> = {
  DEVELOPMENTAL_PEDIATRICS: ['OT', 'PT', 'SLP', 'SPED'],
  REHABILITATION_MEDICINE:  ['PT'],
  PSYCHIATRY:               ['PSYCHOLOGY'],
}

// MD itself is not a column: the question is which therapy a doctor's patients
// go on to use, and every patient in a subspecialty row has MD by construction.
const THERAPY_DEPTS = ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY'] as const satisfies readonly Dept[]

/**
 * Subspecialty of an MD staff member, from the occupation on their HR Staff
 * Profile — the Job Title field.
 *
 * HR has one "Medicine" department, so the department never carries the
 * subspecialty (StaffDepartment's PSYCHIATRY / DEVELOPMENTAL_PEDIATRICIAN /
 * REHABILITATION_MEDICINE values exist but no row uses them). The job title
 * does, and it is a controlled vocabulary in HR Settings → Job Titles, with
 * exactly three entries that belong to Medicine:
 *
 *     psychiatrist                → "Psychiatrist"
 *     developmental-pediatrician  → "Developmental Pediatrician"
 *     physiatrist                 → "Rehab Medicine Doctor"
 *
 * Both forms have to be matched. The HR staff feed resolves the id to its
 * label and only falls back to the raw id when the lookup fails, so this field
 * normally holds the label — but the label is admin-editable from Settings
 * while the id is not, and "physiatrist" shares no words with "Rehab Medicine
 * Doctor". Matching one form only would mean a renamed title, or a single
 * failed lookup, silently emptying a row of this panel rather than erroring.
 */
function subFromJobTitle(title: string | null | undefined): MdSub | null {
  if (!title) return null
  // "physiatrist" does not contain "psychiatr" (phy- vs psy-), so the order of
  // these two is not load-bearing — but they are easy to misread as clashing.
  if (/PSYCHIATR/i.test(title))                 return 'PSYCHIATRY'
  if (/DEVELOPMENTAL/i.test(title))             return 'DEVELOPMENTAL_PEDIATRICS'
  if (/REHAB|PHYSIATR|PHYSICAL\s+MEDICINE/i.test(title)) return 'REHABILITATION_MEDICINE'
  return null
}

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
      staff:     { select: { department: true, jobTitle: true } },
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
  // Which MD subspecialties each patient has actually seen. Absent means "no
  // attributable doctor", which is not the same as "no doctor" — see the
  // coverage figures returned at the bottom.
  const patientMdSubs = new Map<string, Set<MdSub>>()

  for (const s of relevant) {
    if (!s.patientId) continue
    const dept = s.staff.department as Dept
    if (!patientDepts.has(s.patientId)) patientDepts.set(s.patientId, new Set())
    patientDepts.get(s.patientId)!.add(dept)
    if (dept === 'MD') {
      const sub = subFromJobTitle(s.staff.jobTitle)
      if (sub) {
        if (!patientMdSubs.has(s.patientId)) patientMdSubs.set(s.patientId, new Set())
        patientMdSubs.get(s.patientId)!.add(sub)
      }
    }
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
  // with its stated Bonferroni correction.
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
    // POS names the subspecialty in the service text for roughly a third of MD
    // billing; the rest is the generic QuickBooks/HMO "Medical Consultation"
    // and stays unattributed rather than being guessed at.
    for (const [key, subs] of pos.mdSubs) {
      for (const s of subs) {
        if ((MD_SUBS as readonly string[]).includes(s)) {
          if (!patientMdSubs.has(key)) patientMdSubs.set(key, new Set())
          patientMdSubs.get(key)!.add(s as MdSub)
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

  // ── MD subspecialty → therapy service ───────────────────────────────────────
  // Same statistics as the matrix above, same patient set and same denominator
  // N, with the exposure narrowed from "sees a doctor" to "sees THIS kind of
  // doctor". That makes it directly comparable to the MD row above it.
  //
  // The attribution is incomplete, and knowingly so. A patient whose only MD
  // record is a generic "Medical Consultation" counts as unexposed in every
  // subspecialty row even though they did see one of these doctors. That
  // misclassification puts genuinely exposed patients into the comparison
  // group, which pulls every risk ratio TOWARD 1 — so these figures understate
  // the referral relationships rather than inventing them. The coverage
  // numbers are returned alongside so the panel can say so.
  const mdPatients = new Set<string>()
  for (const [pid, depts] of patientDepts) if (depts.has('MD')) mdPatients.add(pid)
  const mdAttributed = new Set<string>()
  for (const pid of patientMdSubs.keys()) if (mdPatients.has(pid)) mdAttributed.add(pid)

  /** 2×2 for "has this subspecialty" × "has this therapy service". */
  function tableSub(
    sub: MdSub,
    target: Dept,
    stratum: 'PEDIATRIC' | 'ADULT' | null,
  ): [number, number, number, number] {
    let a = 0, b = 0, c = 0, d = 0
    for (const [pid, depts] of patientDepts) {
      if (stratum && patientStratum.get(pid) !== stratum) continue
      const h1 = patientMdSubs.get(pid)?.has(sub) ?? false
      const h2 = depts.has(target)
      if (h1 && h2) a++
      else if (h1)  b++
      else if (h2)  c++
      else          d++
    }
    return [a, b, c, d]
  }

  const mdSubMatrix = MD_SUBS.map((sub) => {
    const subCount = [...patientMdSubs.values()].filter((s) => s.has(sub)).length
    return {
      sub,
      label: MD_SUB_LABELS[sub],
      short: MD_SUB_SHORT[sub],
      color: MD_SUB_COLORS[sub],
      count: subCount,
      affinities: THERAPY_DEPTS.map((target) => {
        const [a, b, c, d] = tableSub(sub, target, null)
        const chi    = chiSquareTest(a, b, c, d)
        const strata = [tableSub(sub, target, 'PEDIATRIC'), tableSub(sub, target, 'ADULT')] as Array<[number, number, number, number]>
        const crude  = [a, b, c, d] as [number, number, number, number]
        const mh = mantelHaenszel(strata, crude)
        const rr = mantelHaenszelRR(strata, crude)
        return {
          target,
          color:         DEPT_COLORS[target],
          expected:      (MD_SUB_EXPECTED[sub] as readonly string[]).includes(target),
          // Of this subspecialty's patients, the share who also use the therapy.
          confidencePct: subCount > 0 ? Math.round((a / subCount) * 100) : 0,
          lift:          Number((subCount && deptCounts[target]
                            ? (a * N) / (subCount * deptCounts[target])
                            : 0).toFixed(2)),
          coCount:       a,
          phi:           Number(chi.phi.toFixed(3)),
          pValue:        Number(chi.pValue.toFixed(4)),
          pLabel:        chi.pLabel,
          pSig:          chi.pSig,
          smallCell:     chi.smallCell,
          exact:         chi.exact,
          oddsRatio:      Number.isFinite(mh.or)      ? Number(mh.or.toFixed(2))      : null,
          oddsCiLow:      Number.isFinite(mh.ciLow)   ? Number(mh.ciLow.toFixed(2))   : null,
          oddsCiHigh:     Number.isFinite(mh.ciHigh)  ? Number(mh.ciHigh.toFixed(2))  : null,
          crudeOddsRatio: Number.isFinite(mh.crudeOr) ? Number(mh.crudeOr.toFixed(2)) : null,
          riskRatio:      Number.isFinite(rr.rr)      ? Number(rr.rr.toFixed(2))      : null,
          riskCiLow:      Number.isFinite(rr.ciLow)   ? Number(rr.ciLow.toFixed(2))   : null,
          riskCiHigh:     Number.isFinite(rr.ciHigh)  ? Number(rr.ciHigh.toFixed(2))  : null,
          ageConfounded:  mh.confounded,
          qValue:         0,
          qLabel:         '',
        }
      }),
    }
  })

  // Its own Benjamini–Hochberg family. These 15 tests are a separate screening
  // question from the 15 department pairs above, and pooling the two families
  // would let one panel's findings decide the other's threshold. Unlike the
  // matrix, every cell here is a distinct pair — the table is not symmetric, so
  // there is nothing to de-duplicate.
  {
    const flat = mdSubMatrix.flatMap((r) => r.affinities)
    const qs = benjaminiHochberg(flat.map((a) => a.pValue))
    flat.forEach((aff, i) => {
      const qv = qs[i]
      aff.qValue = Number(qv.toFixed(4))
      aff.qLabel = qv < 0.001 ? 'q < 0.001'
                 : qv < 0.05  ? `q = ${qv.toFixed(3)}`
                 : `q = ${qv.toFixed(2)} (n.s.)`
      aff.pSig = qv < 0.05
    })
  }

  const mdSubCoverage = {
    mdPatients:     mdPatients.size,
    attributed:     mdAttributed.size,
    unattributed:   mdPatients.size - mdAttributed.size,
    // Patients who have seen more than one kind of doctor. Small, but it is why
    // the three row counts sum to more than `attributed`.
    multiSub:       [...patientMdSubs.values()].filter((s) => s.size > 1).length,
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
    mdSubMatrix,
    mdSubCoverage,
    avgSessionsPerMonth,
    comboTotal,
    posMerged: !!pos,
    match: pos?.match ?? null,
  })
}
