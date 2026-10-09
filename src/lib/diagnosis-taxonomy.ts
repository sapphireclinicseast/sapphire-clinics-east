// Grouping free-text diagnoses into comparable families.
//
// Patient.diagnosis is a free-text box labelled "Diagnosis / Reason for Visit".
// Nothing constrains it, and three things have written to it over the years:
//
//   1. A legacy CSV import, in Title Case  — "ASD / Autism Spectrum Disorder"
//   2. The public QR registration route, which UPPERCASES whatever is typed
//      (see uc() in api/public/patient-register) — "ASD / AUTISM SPECTRUM DISORDER"
//   3. Front desk, typing whatever the parent said — "MILD AUTISM", "ASD LEVEL 2"
//
// So one condition arrives under a dozen spellings and the charts show it as a
// dozen bars. 925 records carry 224 distinct strings; case-folding alone merges
// only 18 of them, because the duplication is in the WORDING, not the casing.
//
// This maps a string to zero or more canonical families. Nothing here rewrites
// the stored value: the clinician's own words stay on the record, because they
// carry severity, laterality and comorbidity that a tidy label throws away.
// This is a reading lens, not a migration.

/** A patient may legitimately carry several — "ASD, ADHD" is one child with two. */
export interface DiagnosisMatch {
  /** Canonical families, deduped. Empty when nothing clinical was recognised. */
  families: string[]
  /** True when the text hedges — "T/C ADHD", "R/O Goldenhar", "probable depression".
   *  A differential is not a diagnosis, so callers counting confirmed cases
   *  should exclude these rather than inflate a family with maybes. */
  provisional: boolean
  /** True when the text is administrative rather than clinical — "FOR OT AND PT",
   *  "CONSULTATION", "N/A", or an address typed into the wrong box. */
  nonClinical: boolean
}

/** Families, in the order they should appear when several tie on count. */
export const FAMILIES = [
  'ASD / Autism Spectrum Disorder',
  'ADHD',
  'Global Developmental Delay',
  'Speech / Language / Communication',
  'Intellectual Disability',
  'Learning Disability',
  'Anxiety',
  'Depression',
  'Bipolar Disorder',
  'PTSD / Trauma',
  'OCD',
  'Psychotic Disorder',
  'Behavioral / Emotional / Mood',
  'Self-harm / Suicidal Ideation',
  'Psychosocial Disability',
  'Down Syndrome',
  'Cerebral Palsy',
  'Seizure Disorder',
  'Feeding / Swallowing',
  'Sensory (Visual / Hearing)',
  'Musculoskeletal / Orthopedic',
  'Stroke / Cerebrovascular',
  'Rare / Genetic Condition',
] as const

// Hedging language. "To consider ASD" and "ASD" are different clinical claims,
// and the roster contains both; counting them together overstates the confirmed
// caseload, which is the number service planning actually needs.
const HEDGE = /\b(T\/C|TO CONSIDER|R\/O|RULE ?OUT|PROBABLE|POSSIBLE|POSSIBLY|SUSPECTED|ALLEGED|AT RISK OF|WORKING IMPRESSION|FOR ASSESSMENT|FOR EVALUATION|IF APPLICABLE)\b/

// Text that is a reason for visiting, a service request, or a mis-keyed field —
// not a condition. Checked before the clinical rules so "FOR OT AND PT" does not
// get read as anything diagnostic.
const NON_CLINICAL = [
  /^(N\/?A|NONE|OTHER|PENDING|TBA|TBD|-+|\.+)$/,
  /^PENDING ?\/? ?FOLLOW[- ]?UP$/,
  /^(FOR )?(OT|PT|SLP|OCCUPATIONAL THERAPY|PHYSICAL THERAPY|SPEECH THERAPY)$/,
  /^FOR (OT|PT|SLP|OT AND PT|PHYSICAL THERAPH?Y|CHECK ?UPS?)/,
  /^(GENERAL )?CONSULTATION$/,
  /^CONSULT(ATION)? FOR /,
  /^MENTAL SERVICES$/,
  // An address typed into the diagnosis box — a few of these are in the data.
  /\b(ST\.?|STREET|BRGY|BARANGAY|AVE\.?|AVENUE|SUBD)\b.*\b(ST\.?|BRGY|CITY|SFDM)\b/,
  /^\d+\s+[A-Z]/,
]

// Ordered, most specific first. A string may match several rules — that is the
// point: "ASD WITH LANGUAGE IMPAIRMENT" is both ASD and a language disorder, and
// a chart that files it under only one of them is hiding half the caseload.
const RULES: Array<[string, RegExp]> = [
  // Autism. Covers ASD, the spelled-out form, severity levels, and the two
  // misspellings present in the data (AUSTISM, and ADS as an ASD typo).
  ['ASD / Autism Spectrum Disorder',
    /\b(ASD|AUTIS[TM]\w*|AUSTISM|ADS LEVEL)\b/],

  ['ADHD',
    /\b(ADHD|ATTENTION[- ]DEFICIT|ATTENTION DEFICIT)\b/],

  // Requires GLOBAL or GDD — a bare "delay" is usually a speech delay, below.
  ['Global Developmental Delay',
    /\b(GDD|GLOBAL DEVELOPMENTA?L? DELAY|GLOBAL DEVELOPMET(AL)? DELAY|GLOBAL DEVELOPMENT DELAY)\b/],

  ['Speech / Language / Communication',
    /\b(SPEECH|LANGUAGE|COMMUNICAT\w+|APRAXIA|APPRAXIA|ARTICULATION|STUTTER\w*|NON[- ]?VERBAL|NON[- ]?CONVERSANT|UNABLE TO SPEAK|DLD)\b/],

  ['Intellectual Disability',
    /\b(INTELLECTUAL (DISABILITY|IMPAIRMENT)|GLOBAL INTELLECTUAL)\b/],

  ['Learning Disability',
    /\bLEARNING (DISABILITY|DIFFICULT\w+)\b/],

  // GAD included; "anxious distress" is a depression qualifier and is caught here
  // too, which is correct — the patient has both.
  ['Anxiety',
    /\b(ANXIETY|ANXIOUS|GAD)\b/],

  ['Depression',
    /\b(DEPRESS\w+|MDD|MAJOR DEPRESSIVE)\b/],

  ['Bipolar Disorder',
    /\b(BIPOLAR|BPD|BOARDERLINE PERSONALITY|BORDERLINE PERSONALITY)\b/],

  ['PTSD / Trauma',
    /\b(PTSD|CPTSD|TRAUMA|ABUSE)\b/],

  ['OCD',
    /\bOCD|OBSESSIVE[- ]COMPULSIVE\b/],

  ['Psychotic Disorder',
    /\b(PSYCHOTIC|PSYCHOSIS|SCHIZO\w*|HALLUCINAT\w+)\b/],

  ['Behavioral / Emotional / Mood',
    /\b(BEHAVIOU?RAL|EMOTIONAL|MOOD DISORDER|HYPERACTIV\w*|IMPULSIVE|ANGER MANAGEMENT|SCHOOL REFUSAL)\b/],

  ['Self-harm / Suicidal Ideation',
    /\b(SELF[- ]?HARM|SUICID\w+|SILENT ATTEMPTS)\b/],

  ['Psychosocial Disability',
    /\bPSYCHOSOCIAL\b/],

  ['Down Syndrome',
    /\bDOWN'?S? SYNDROME\b/],

  ['Cerebral Palsy',
    /\b(CEREBRAL PALSY|CELEBRAL PALSY|HEMIPLEGIA|HIE|HYPOXIC[- ]ISCHEMIC)\b/],

  ['Seizure Disorder',
    /\b(SEIZURE|EPILEP\w+|CONVULSION)\b/],

  ['Feeding / Swallowing',
    /\b(FEEDING|SWALLOW\w*|DYSPHAGIA)\b/],

  ['Sensory (Visual / Hearing)',
    /\b(VISUAL IMPAIRMENT|HEARING IMPAIRMENT|HARD OF HEARING|HOH|DEAF|BLIND|SENSORY DISABILITY)\b/],

  // Deliberately broad: this is the adult rehab caseload and it arrives as body
  // parts and procedures far more often than as a tidy category name.
  ['Musculoskeletal / Orthopedic',
    /\b(MUSCULOSKELETAL|ORTHOPEDIC|ORTHOPAEDIC|FROZEN SHOULDERS?|KNEE|SHOULDER|BACK PAIN|BACK PAIS|LOW(ER)? BACK|SCIATICA|SPONDYLOSIS|SPINAL STENOSIS|RADICULOPATHY|SCOLIOSIS|DEXTROSCOLIOSIS|ACL|MENISCUS|LABRUM|TENDINOSIS|SPRAIN|FRACTURE|AMPUTATION|CHONDROMALACIA|GASTROCNEMIUS|PARALUMBAR|MPS|NECK PAIN|MUSCLE SPASM|STIFF PERSON|POST KNEE SURGERY|PHYSICAL (DISABILITY|HANDICAP))\b/],

  ['Stroke / Cerebrovascular',
    /\b(STROKE|CEREBROVASCULAR|CVA)\b/],

  ['Rare / Genetic Condition',
    /\b(WILLIAMS SYNDROME|GOLDENHAR|RARE ?\/? ?GENETIC|GENETIC CONDITION|CAVSD)\b/],
]

/** Upper-case, strip accents/punctuation noise, collapse whitespace. */
function canon(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^A-Z0-9'/&.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classify one free-text diagnosis.
 *
 * Returns every family the text mentions, so comorbid entries land in each.
 * Callers counting patients-per-family should therefore expect the totals to
 * exceed the patient count, and should say so on the chart.
 */
export function classifyDiagnosis(raw: string | null | undefined): DiagnosisMatch {
  const text = canon(raw ?? '')
  if (!text) return { families: [], provisional: false, nonClinical: false }

  if (NON_CLINICAL.some((re) => re.test(text))) {
    return { families: [], provisional: false, nonClinical: true }
  }

  const families: string[] = []
  for (const [family, re] of RULES) {
    if (re.test(text) && !families.includes(family)) families.push(family)
  }

  return {
    families,
    provisional: HEDGE.test(text),
    nonClinical: false,
  }
}

/**
 * Roll a set of patients up into family counts.
 *
 * `countProvisional` decides whether "T/C ADHD" adds to ADHD. Default false:
 * the confirmed caseload is the useful denominator, and the hedged rows are
 * returned separately so they are visible rather than silently dropped.
 */
export function tallyDiagnoses<T>(
  rows: T[],
  getText: (row: T) => string | null | undefined,
  opts: { countProvisional?: boolean } = {},
): {
  families: Array<{ name: string; count: number }>
  unmatched: number
  nonClinical: number
  provisional: number
  blank: number
  classified: number
} {
  const counts = new Map<string, number>()
  let unmatched = 0, nonClinical = 0, provisional = 0, blank = 0, classified = 0

  for (const row of rows) {
    const raw = getText(row)
    if (!raw || !raw.trim()) { blank++; continue }
    const m = classifyDiagnosis(raw)
    if (m.nonClinical) { nonClinical++; continue }
    if (m.provisional) provisional++
    if (!m.families.length) { unmatched++; continue }
    if (m.provisional && !opts.countProvisional) continue
    classified++
    for (const f of m.families) counts.set(f, (counts.get(f) ?? 0) + 1)
  }

  const order = new Map(FAMILIES.map((f, i) => [f as string, i]))
  const families = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (order.get(a.name)! - order.get(b.name)!))

  return { families, unmatched, nonClinical, provisional, blank, classified }
}

/**
 * What the diagnosis tag input offers while you type.
 *
 * Each entry is ONE condition, deliberately: the point of tagging is that
 * "Anxiety and Depression" becomes two tags rather than a twelfth distinct
 * string nothing can group. So there is no combined entry to pick.
 *
 * Drawn from what is actually written in the records today — the family names
 * above, plus the specific wordings that recur often enough that front desk
 * will expect to find them (frozen shoulder, knee pain, speech delay). Typing
 * something not on this list is still accepted; the list is a shortcut, never
 * a restriction, because a clinic sees conditions no fixed list anticipates.
 */
export const DIAGNOSIS_SUGGESTIONS: string[] = [
  // Developmental / neurodevelopmental — the bulk of the pediatric caseload
  'ASD / Autism Spectrum Disorder',
  'ADHD',
  'Global Developmental Delay (GDD)',
  'Intellectual Disability',
  'Learning Disability',
  'Down Syndrome',
  'Cerebral Palsy',
  'Seizure Disorder',
  'Rare / Genetic Condition',

  // Speech, language, feeding
  'Speech / Language / Communication Disorder',
  'Speech Delay',
  'Language Disorder',
  'Articulation Disorder',
  'Apraxia of Speech',
  'Stuttering / Fluency Disorder',
  'Non-verbal',
  'Feeding / Swallowing Difficulty',

  // Mental health
  'Anxiety',
  'Depression',
  'Bipolar Disorder',
  'OCD',
  'PTSD / Trauma',
  'Psychotic Disorder',
  'Behavioral / Emotional / Mood Disorder',
  'Self-harm / Suicidal Ideation',
  'Psychosocial Disability',
  'School Refusal',

  // Sensory
  'Hearing Impairment',
  'Visual Impairment',
  'Sensory Processing Difficulty',

  // Adult rehab — these arrive as body parts far more often than as categories
  'Musculoskeletal / Orthopedic',
  'Low Back Pain',
  'Neck Pain',
  'Knee Pain',
  'Frozen Shoulder',
  'Sciatica',
  'Scoliosis',
  'Spondylosis',
  'ACL Injury',
  'Meniscus Tear',
  'Ankle Sprain',
  'Fracture',
  'Post-surgical Rehabilitation',
  'Stroke / Cerebrovascular',
  'Physical Disability',
]

/**
 * Suggestions for what has been typed so far, best match first.
 *
 * Prefix matches rank above mid-word ones, so typing "an" offers Anxiety before
 * Language Disorder. Anything already tagged is dropped — re-offering a tag the
 * user can see on screen is just noise.
 */
export function suggestDiagnoses(query: string, alreadyTagged: string[] = [], limit = 8): string[] {
  const q = query.trim().toLowerCase()
  const taken = new Set(alreadyTagged.map((t) => t.trim().toLowerCase()))
  const pool = DIAGNOSIS_SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase()))
  if (!q) return pool.slice(0, limit)

  const starts: string[] = []
  const contains: string[] = []
  for (const s of pool) {
    const l = s.toLowerCase()
    if (l.startsWith(q)) starts.push(s)
    else if (l.includes(q)) contains.push(s)
  }
  return [...starts, ...contains].slice(0, limit)
}

/**
 * The families a tagged list belongs to.
 *
 * Tagged records need no guessing — each tag is already one condition — but the
 * tags are still free text, so they go through the same classifier to collapse
 * "Speech Delay" and "Language Disorder" into one family on the chart.
 */
export function familiesForTags(tags: string[]): string[] {
  const out: string[] = []
  for (const tag of tags) {
    for (const f of classifyDiagnosis(tag).families) {
      if (!out.includes(f)) out.push(f)
    }
  }
  return out
}
