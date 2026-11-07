/**
 * Service Invoice coverage — which payroll cutoffs a consultant's BIR Service
 * Invoices cover, and the figures an invoice for a range of cutoffs should carry.
 *
 * A consultant may invoice half a month, a whole month, or several months at
 * once. Submissions are stored one row per covered period in
 * ConsultantSiSubmission.month, which holds either a whole month ("YYYY-MM",
 * both cutoffs) or a single cutoff ("YYYY-MM-1" / "YYYY-MM-2"). Rows saved
 * before half-month support are all whole months, so they read the same way.
 *
 * Pure: shared by the Taxes → Service Invoice screen and the reminder API.
 */

export const CUTOFF_RX = /^\d{4}-\d{2}-[12]$/
export const COVERAGE_KEY_RX = /^\d{4}-\d{2}(-[12])?$/

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DEPT_SERVICE: Record<string, string> = {
  PT: 'physical therapy services', OT: 'occupational therapy services', SLP: 'speech therapy services',
  SPED: 'special education services', MD: 'medical consultation services', PSYCHOLOGY: 'psychological services',
  ORTHOSIS: 'orthosis and prosthesis services', EDU: 'training services',
}

/** "2026-10-1" → "Oct 2026 · 1st half" (short, for pickers and tables). */
export function cutoffShort(cp: string): string {
  const [y, m, h] = cp.split('-')
  return `${MON[parseInt(m) - 1]} ${y} · ${h === '1' ? '1st' : '2nd'} half`
}

/** Next cutoff after cp ("2026-10-2" → "2026-11-1"). */
export function nextCutoff(cp: string): string {
  const [y, m, h] = cp.split('-').map(Number)
  if (h === 1) return `${y}-${String(m).padStart(2, '0')}-2`
  return m === 12 ? `${y + 1}-01-1` : `${y}-${String(m + 1).padStart(2, '0')}-1`
}

/** Every cutoff from `from` to `to`, inclusive, oldest first. Empty if reversed or invalid. */
export function cutoffsBetween(from: string, to: string): string[] {
  if (!CUTOFF_RX.test(from) || !CUTOFF_RX.test(to) || from > to) return []
  const out: string[] = []
  for (let cp = from; cp <= to && out.length < 240; cp = nextCutoff(cp)) out.push(cp)
  return out
}

/** The cutoff a date falls in (1st half = days 1–15). */
export function cutoffOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getDate() <= 15 ? 1 : 2}`
}

/** The `n` cutoffs ending at `last`, newest first — the choices in a range picker. */
export function recentCutoffs(last: string, n: number): string[] {
  const out: string[] = []
  let [y, m, h] = last.split('-').map(Number)
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${h}`)
    if (h === 2) h = 1
    else { h = 2; m--; if (m === 0) { m = 12; y-- } }
  }
  return out
}

/**
 * The rows to store for an invoice covering `cutoffs`: a month with both
 * halves becomes "YYYY-MM", a month with one half becomes that cutoff.
 */
export function coverageKeys(cutoffs: string[]): string[] {
  const halves = new Map<string, Set<string>>()
  for (const cp of cutoffs) {
    if (!CUTOFF_RX.test(cp)) continue
    const month = cp.slice(0, 7)
    if (!halves.has(month)) halves.set(month, new Set())
    halves.get(month)!.add(cp.slice(8))
  }
  const out: string[] = []
  for (const [month, hs] of [...halves.entries()].sort()) {
    if (hs.has('1') && hs.has('2')) out.push(month)
    else for (const h of [...hs].sort()) out.push(`${month}-${h}`)
  }
  return out
}

/** The cutoffs a stored row covers. */
export function cutoffsOfKey(key: string): string[] {
  if (CUTOFF_RX.test(key)) return [key]
  if (/^\d{4}-\d{2}$/.test(key)) return [`${key}-1`, `${key}-2`]
  return []
}

/** Is this cutoff covered by any of the stored rows? */
export function isCovered(cp: string, keys: Set<string>): boolean {
  return keys.has(cp) || keys.has(cp.slice(0, 7))
}

/** How much of a month the stored rows cover. */
export function monthCoverage(month: string, keys: Set<string>): 'full' | 'first' | 'second' | 'none' {
  const a = isCovered(`${month}-1`, keys)
  const b = isCovered(`${month}-2`, keys)
  return a && b ? 'full' : a ? 'first' : b ? 'second' : 'none'
}

/**
 * A readable name for a set of cutoffs, as it goes on the invoice:
 * ["2026-10-1","2026-10-2"] → "October 2026";
 * ["2026-09-2","2026-10-1","2026-10-2"] → "September 2026 (2nd half) to October 2026";
 * ["2026-10-1"] → "October 2026 (1st half)". Gaps split the list with commas.
 */
export function describeCutoffs(cutoffs: string[]): string {
  const list = [...new Set(cutoffs.filter(c => CUTOFF_RX.test(c)))].sort()
  if (!list.length) return ''
  const runs: string[][] = []
  for (const cp of list) {
    const run = runs[runs.length - 1]
    if (run && nextCutoff(run[run.length - 1]) === cp) run.push(cp)
    else runs.push([cp])
  }
  const monthName = (cp: string) => `${MONTHS[parseInt(cp.slice(5, 7)) - 1]} ${cp.slice(0, 4)}`
  return runs.map(run => {
    const first = run[0], last = run[run.length - 1]
    if (run.length === 1) return `${monthName(first)} (${first.endsWith('-1') ? '1st' : '2nd'} half)`
    const start = first.endsWith('-2') ? `${monthName(first)} (2nd half)` : monthName(first)
    const end = last.endsWith('-1') ? `${monthName(last)} (1st half)` : monthName(last)
    return first.slice(0, 7) === last.slice(0, 7) ? monthName(first) : `${start} to ${end}`
  }).join(', ')
}

export interface CutoffPay { gross: number; tax: number; net: number }

export interface SiFigures {
  /** cutoffs in the range that have finalized payroll */
  paidCutoffs: string[]
  gross: number
  ewt: number
  ewtRate: number
  net: number
  periodLabels: string
  description: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * The figures for one Service Invoice over `cutoffs`, from finalized payroll
 * per cutoff. Net is gross less the withholding payroll actually deducted,
 * matching what the reminder email quotes.
 */
export function siFigures(department: string, cutoffs: string[], pay: Record<string, CutoffPay | undefined>): SiFigures {
  const paidCutoffs = cutoffs.filter(cp => pay[cp] && (pay[cp]!.gross || pay[cp]!.tax)).sort()
  const gross = paidCutoffs.reduce((s, cp) => s + pay[cp]!.gross, 0)
  const ewt = paidCutoffs.reduce((s, cp) => s + pay[cp]!.tax, 0)
  const periodLabels = describeCutoffs(paidCutoffs)
  const service = DEPT_SERVICE[department] || 'professional services'
  return {
    paidCutoffs,
    gross: r2(gross),
    ewt: r2(ewt),
    ewtRate: gross > 0 ? Math.round((ewt / gross) * 1000) / 10 : 0,
    net: r2(gross - ewt),
    periodLabels,
    description: `Professional fees — ${service} rendered to Aura Health Rehab, ${periodLabels}`,
  }
}
