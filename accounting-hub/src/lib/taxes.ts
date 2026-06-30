// Philippine BIR tax definitions + deadline math, shared by the Taxes Guide
// tab and the deadline-reminder popup. Pure functions (take "today" in) so the
// same logic drives the on-screen table and the 5-day-before alert.

export interface TaxLink { label: string; url: string }
export interface TaxDef {
  key: string
  name: string
  forms: string          // BIR form numbers + cadence
  frequency: string      // short cadence label
  deadlineRule: string   // plain-language deadline rule
  links: TaxLink[]
  nextDue: (from: Date) => Date
}

// ── date helpers (UTC, day-granular) ──────────────────────────────
const atUTC = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const startOfDay = (dt: Date) => atUTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())

// Next occurrence of day-of-month `day` on/after `from` (e.g. the 10th).
function nextMonthlyDay(from: Date, day: number): Date {
  const f = startOfDay(from)
  const cand = atUTC(f.getUTCFullYear(), f.getUTCMonth(), day)
  return cand >= f ? cand : atUTC(f.getUTCFullYear(), f.getUTCMonth() + 1, day)
}

// Earliest of a set of fixed (month, day) points on/after `from`.
function nextFixedDates(from: Date, points: { m: number; d: number }[]): Date {
  const f = startOfDay(from)
  const y = f.getUTCFullYear()
  const cands = [
    ...points.map(p => atUTC(y, p.m, p.d)),
    ...points.map(p => atUTC(y + 1, p.m, p.d)),
  ].filter(c => c >= f).sort((a, b) => +a - +b)
  return cands[0]
}

// Quarter close (Mar/Jun/Sep/Dec end) + `days` days, next on/after `from`.
function nextQuarterClosePlusDays(from: Date, days: number): Date {
  const f = startOfDay(from)
  const ends = [2, 5, 8, 11] // 0-based month of quarter-end
  const y = f.getUTCFullYear()
  const cands: Date[] = []
  for (const yr of [y - 1, y, y + 1]) {
    for (const em of ends) {
      const lastDay = new Date(Date.UTC(yr, em + 1, 0)).getUTCDate()
      const close = atUTC(yr, em, lastDay)
      cands.push(new Date(close.getTime() + days * 86400000))
    }
  }
  return cands.filter(c => c >= f).sort((a, b) => +a - +b)[0]
}

const BIR_FORMS = 'https://www.bir.gov.ph/bir-forms'
const BIR_EFPS = 'https://efps.bir.gov.ph'
const BIR_CALENDAR = 'https://www.bir.gov.ph/tax-calendar'

export const TAX_DEFS: TaxDef[] = [
  {
    key: 'WC',
    name: 'Withholding Tax on Compensation',
    forms: '1601-C (monthly) · 1604-C + Alphalist (annual)',
    frequency: 'Monthly',
    deadlineRule: 'Remit on/before the 10th of the following month (manual/eBIRForms). Annual return 1604-C with Alphalist by Jan 31.',
    links: [
      { label: 'BIR Form 1601-C', url: BIR_FORMS },
      { label: 'File via eFPS', url: BIR_EFPS },
    ],
    nextDue: (from) => nextMonthlyDay(from, 10),
  },
  {
    key: 'EWT',
    name: 'Expanded / Creditable Withholding Tax (EWT)',
    forms: '0619-E (monthly) · 1601-EQ + QAP (quarterly) · 1604-E (annual)',
    frequency: 'Monthly + Quarterly',
    deadlineRule: 'Remit 0619-E on/before the 10th of the following month for the first two months of the quarter; file 1601-EQ with QAP on/before the last day of the month after each quarter. Annual 1604-E by Mar 1.',
    links: [
      { label: 'BIR Form 0619-E / 1601-EQ', url: BIR_FORMS },
      { label: 'File via eFPS', url: BIR_EFPS },
    ],
    nextDue: (from) => nextMonthlyDay(from, 10),
  },
  {
    key: 'VAT',
    name: 'Value-Added Tax (VAT) — 12%',
    forms: '2550Q (quarterly) · SLSP',
    frequency: 'Quarterly',
    deadlineRule: 'File 2550Q on/before the 25th day following the close of each taxable quarter (monthly 2550M was discontinued in 2023). Output VAT less creditable Input VAT = VAT payable.',
    links: [
      { label: 'BIR Form 2550Q', url: BIR_FORMS },
      { label: 'File via eFPS', url: BIR_EFPS },
    ],
    nextDue: (from) => nextFixedDates(from, [{ m: 0, d: 25 }, { m: 3, d: 25 }, { m: 6, d: 25 }, { m: 9, d: 25 }]),
  },
  {
    key: 'IT',
    name: 'Income Tax (Corporate)',
    forms: '1702Q (quarterly) · 1702-RT (annual)',
    frequency: 'Quarterly + Annual',
    deadlineRule: 'File 1702Q on/before the 60th day following the close of each of the first three quarters. Annual 1702-RT on/before April 15 of the following year.',
    links: [
      { label: 'BIR Form 1702Q / 1702-RT', url: BIR_FORMS },
      { label: 'File via eFPS', url: BIR_EFPS },
    ],
    nextDue: (from) => {
      const annual = nextFixedDates(from, [{ m: 3, d: 15 }])
      const q = nextQuarterClosePlusDays(from, 60)
      return q < annual ? q : annual
    },
  },
]

export const TAX_PORTALS: TaxLink[] = [
  { label: 'BIR Forms', url: BIR_FORMS },
  { label: 'eFPS (file & pay)', url: BIR_EFPS },
  { label: 'BIR Tax Calendar', url: BIR_CALENDAR },
  { label: 'BIR Home', url: 'https://www.bir.gov.ph' },
]

export interface TaxDueInfo { key: string; name: string; forms: string; frequency: string; deadlineRule: string; links: TaxLink[]; nextDue: string; daysUntil: number }

// Compute next-due + daysUntil for every tax relative to `today`.
export function computeTaxDue(today: Date): TaxDueInfo[] {
  const t = startOfDay(today)
  return TAX_DEFS.map(d => {
    const due = d.nextDue(t)
    const daysUntil = Math.round((+due - +t) / 86400000)
    return { key: d.key, name: d.name, forms: d.forms, frequency: d.frequency, deadlineRule: d.deadlineRule, links: d.links, nextDue: due.toISOString().slice(0, 10), daysUntil }
  })
}
