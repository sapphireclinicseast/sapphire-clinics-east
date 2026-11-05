// Shapes and wording shared between the Pairwise Affinity Matrix on the patient
// dashboard page and the MD-subspecialty panel beneath it. Both read the same
// statistics off /api/patients/interdept-stats, so the type and the sentence
// that reads a risk ratio aloud live here rather than being written twice.

export interface AffinityEntry {
  target: string
  color: string
  confidencePct: number
  lift: number
  coCount: number
  phi: number
  pValue: number
  pLabel: string
  pSig: boolean
  /** Any expected cell count was < 5, so χ² would have been unreliable. */
  smallCell: boolean
  /** Fisher's exact was used instead of χ² (expected cell < 5). */
  exact?: boolean
  /** Benjamini–Hochberg adjusted p across the family this pair was tested in. */
  qValue?: number
  qLabel?: string
  /** Odds ratio holding patient type constant (Mantel–Haenszel), 95% CI. */
  oddsRatio?: number | null
  oddsCiLow?: number | null
  oddsCiHigh?: number | null
  crudeOddsRatio?: number | null
  /** How much more likely the column service is for patients who use the row
   *  service, vs patients who do not. Age-adjusted, 95% CI. */
  riskRatio?: number | null
  riskCiLow?: number | null
  riskCiHigh?: number | null
  /** Pooled and age-adjusted estimates disagree — read the adjusted one. */
  ageConfounded?: boolean
}

/** One MD subspecialty's row. Same statistics as AffinityEntry, plus whether
 *  the pairing is the one the subspecialty is clinically expected to produce. */
export interface MdSubRow {
  sub: string
  label: string
  short: string
  color: string
  count: number
  affinities: (AffinityEntry & { expected: boolean })[]
}

export interface MdSubCoverage {
  mdPatients: number
  attributed: number
  unattributed: number
  multiSub: number
}

// Reads the risk ratio aloud, with its interval, and says nothing when the
// interval crosses 1 — a point estimate quoted without that caveat is how a
// coincidence becomes a referral policy.
export function rrPhrase(a: AffinityEntry): string {
  if (a.riskRatio == null) return ''
  const ci = (a.riskCiLow != null && a.riskCiHigh != null)
    ? ` (95% CI ${a.riskCiLow.toFixed(2)}–${a.riskCiHigh.toFixed(2)})`
    : ''
  const spansOne = a.riskCiLow != null && a.riskCiHigh != null
    && a.riskCiLow <= 1 && a.riskCiHigh >= 1
  if (spansOne) return `${ci} — but the interval includes 1, so the direction is not settled`
  return ` — ${a.riskRatio.toFixed(1)}× as likely as patients who do not${ci}`
}
