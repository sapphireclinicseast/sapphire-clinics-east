// Shared grading rubric + weighted-scoring math for the UGAT assessor system.
// Used by the assessment API and the admin UI so the numbers never drift.
//
// Model: each assessor scores an applicant per stage.
//   INITIAL  = Step 1 (answer criteria, 0–5 each), Step 2 (letter criteria,
//              0–5 each), Step 3 (Year grades mapped to 0–5 via bands).
//   INTERVIEW = interview criteria (0–5 each).
// An assessor's stage score is the average of the step scores (0–5). The
// applicant's overall = the assessors' scores combined by their weight %.

export interface Criterion { key: string; label: string }
export interface GradeBand { min: number; max: number; score: number }

export interface RubricConfig {
  step1: { criteria: Criterion[] }
  step2: { criteria: Criterion[] }
  step3: { bands: GradeBand[] }
  interview: { criteria: Criterion[] }
}

export const DEFAULT_RUBRIC: RubricConfig = {
  step1: {
    criteria: [
      { key: 's1a', label: 'Motivation & commitment to the profession' },
      { key: 's1b', label: 'Alignment with UGAT values (galing · tindig · paglilingkod)' },
      { key: 's1c', label: 'Clarity & sincerity of responses' },
      { key: 's1d', label: 'Willingness to serve (incl. Araw ng Kalinga)' },
    ],
  },
  step2: {
    criteria: [
      { key: 's2a', label: 'Sincerity & depth of the motivational letter' },
      { key: 's2b', label: 'Writing quality & organization' },
      { key: 's2c', label: 'Fit with the fellowship' },
    ],
  },
  step3: {
    bands: [
      { min: 90, max: 100, score: 5 },
      { min: 85, max: 89, score: 4 },
      { min: 80, max: 84, score: 3 },
      { min: 75, max: 79, score: 2 },
      { min: 70, max: 74, score: 1 },
      { min: 0, max: 69, score: 0 },
    ],
  },
  interview: {
    criteria: [
      { key: 'iva', label: 'Communication & articulation' },
      { key: 'ivb', label: 'Professionalism & demeanor' },
      { key: 'ivc', label: 'Clinical aptitude & knowledge' },
      { key: 'ivd', label: 'Commitment to serve with SCEI' },
    ],
  },
}

// ── The shape stored per UgatAssessment.data ──────────────────────────────
// INITIAL:  { scores: { step1: {key:0-5}, step2: {key:0-5}, step3: { grades: {y1,y2,y3} | {gwa} } },
//            remarks: { step1, step2, step3 } }
// INTERVIEW:{ scores: { interview: {key:0-5} }, remarks: { interview } }
export interface AssessmentData {
  scores?: {
    step1?: Record<string, number>
    step2?: Record<string, number>
    step3?: { grades?: Record<string, number> }
    interview?: Record<string, number>
  }
  remarks?: Record<string, string>
}

function mean(nums: number[]): number | null {
  const vals = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/** Map a numeric grade (0–100) to a 0–5 score using the rubric bands. */
export function bandScore(bands: GradeBand[], grade: number): number | null {
  if (typeof grade !== 'number' || Number.isNaN(grade)) return null
  for (const b of bands) if (grade >= b.min && grade <= b.max) return b.score
  return null
}

function criteriaAvg(scores: Record<string, number> | undefined, criteria: Criterion[]): number | null {
  if (!scores) return null
  return mean(criteria.map((c) => scores[c.key]).filter((v): v is number => typeof v === 'number'))
}

/** An assessor's INITIAL stage score (0–5): average of the available step scores. */
export function initialScore(data: AssessmentData, rubric: RubricConfig): number | null {
  const s = data.scores || {}
  const step1 = criteriaAvg(s.step1, rubric.step1.criteria)
  const step2 = criteriaAvg(s.step2, rubric.step2.criteria)
  const grades = s.step3?.grades ? Object.values(s.step3.grades) : []
  const step3 = grades.length ? mean(grades.map((g) => bandScore(rubric.step3.bands, g)).filter((v): v is number => v !== null)) : null
  return mean([step1, step2, step3].filter((v): v is number => v !== null))
}

/** An assessor's INTERVIEW stage score (0–5). */
export function interviewScore(data: AssessmentData, rubric: RubricConfig): number | null {
  return criteriaAvg(data.scores?.interview, rubric.interview.criteria)
}

/** Per-step breakdown (for the admin summary), each 0–5 or null. */
export function stepBreakdown(data: AssessmentData, rubric: RubricConfig): { step1: number | null; step2: number | null; step3: number | null } {
  const s = data.scores || {}
  const grades = s.step3?.grades ? Object.values(s.step3.grades) : []
  return {
    step1: criteriaAvg(s.step1, rubric.step1.criteria),
    step2: criteriaAvg(s.step2, rubric.step2.criteria),
    step3: grades.length ? mean(grades.map((g) => bandScore(rubric.step3.bands, g)).filter((v): v is number => v !== null)) : null,
  }
}

/** Combine assessor scores by weight: Σ(score×weight) / Σ(weight of scored). */
export function weightedOverall(items: { score: number | null; weight: number }[]): number | null {
  const scored = items.filter((i) => i.score !== null && i.weight > 0) as { score: number; weight: number }[]
  if (!scored.length) return null
  const wsum = scored.reduce((a, i) => a + i.weight, 0)
  if (wsum <= 0) return null
  return scored.reduce((a, i) => a + i.score * i.weight, 0) / wsum
}

/** Coerce arbitrary JSON into a valid RubricConfig, filling gaps with defaults. */
export function normalizeRubric(raw: unknown): RubricConfig {
  const d = DEFAULT_RUBRIC
  const r = (raw && typeof raw === 'object') ? raw as Partial<RubricConfig> : {}
  const crits = (arr: unknown, fallback: Criterion[]): Criterion[] => {
    if (!Array.isArray(arr)) return fallback
    const out = arr
      .filter((c): c is Criterion => !!c && typeof (c as Criterion).key === 'string' && typeof (c as Criterion).label === 'string')
      .map((c) => ({ key: String(c.key).slice(0, 40), label: String(c.label).slice(0, 200) }))
    return out.length ? out : fallback
  }
  const bands = Array.isArray(r.step3?.bands)
    ? (r.step3!.bands as GradeBand[]).filter((b) => typeof b?.min === 'number' && typeof b?.max === 'number' && typeof b?.score === 'number')
    : d.step3.bands
  return {
    step1: { criteria: crits(r.step1?.criteria, d.step1.criteria) },
    step2: { criteria: crits(r.step2?.criteria, d.step2.criteria) },
    step3: { bands: bands.length ? bands : d.step3.bands },
    interview: { criteria: crits(r.interview?.criteria, d.interview.criteria) },
  }
}
