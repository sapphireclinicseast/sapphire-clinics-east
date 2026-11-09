// Expenses → One-time expense → Bulk upload (Hannah, 2026-11-09: "allow bulk
// upload … download of the template (including a dropdown for the cells that
// are for dropdown, and if it is vat and nonvat combined in one entry, allow to
// set the amount for vat and have that be the one computed. and dropdown for
// chart of accounts"). Proof can't travel in a spreadsheet, so every uploaded
// entry starts without one and the grid keeps reminding until it is attached.
//
// One set of rules for the template, the in-browser preview and the server:
// the browser validates to show errors before anything is saved, and the
// import route runs the same function again on what it receives.

export const PART_VAT = 'VAT + Non-VAT'
export const VALIDITY_OPTIONS = ['Valid', 'Invalid', 'Cancelled'] as const
export const VATABLE_OPTIONS = ['VAT', 'Non-VAT', PART_VAT] as const
export const DEPT_OPTIONS = ['All', 'PT', 'OT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'TRAINING', 'RETAIL', 'ADMIN'] as const
export const YES_NO = ['Yes', 'No'] as const
export const EWT_RATES = [5, 10] as const
export const MAX_ROWS = 500

export type ColKey =
  | 'requestor' | 'departments' | 'date' | 'description' | 'validity' | 'vatable' | 'vatPortion'
  | 'siNumber' | 'tinNumber' | 'registeredName' | 'registeredAddress' | 'grossAmount'
  | 'netOfVat' | 'vatAmount' | 'accountTitle' | 'hasEwt' | 'ewtRate' | 'ewtAmount'

export interface Col { key: ColKey; header: string; width: number; computed?: boolean; prompt?: string }

// Template column order. `computed` columns hold live formulas only and are
// never read back on upload.
export const COLUMNS: Col[] = [
  { key: 'requestor', header: 'Payee', width: 26, prompt: 'Who is paid (e.g. the supplier or the staff member reimbursed).' },
  { key: 'departments', header: 'Department', width: 16, prompt: 'Pick one, or type several separated by commas (e.g. PT, OT). All = shared by all departments.' },
  { key: 'date', header: 'Date', width: 13, prompt: 'Date of the expense, e.g. 2026-11-09.' },
  { key: 'description', header: 'Description', width: 36 },
  { key: 'validity', header: 'Valid/Invalid', width: 13, prompt: 'Valid = with an official receipt / invoice. VAT, SI and TIN apply only to Valid.' },
  { key: 'vatable', header: 'Vatable', width: 15, prompt: 'VAT, Non-VAT, or VAT + Non-VAT when one receipt is part VAT and part non-VAT.' },
  { key: 'vatPortion', header: 'VAT part (₱)', width: 14, prompt: 'Only for VAT + Non-VAT: the VAT-inclusive part of the gross. The rest of the gross is non-VAT.' },
  { key: 'siNumber', header: 'SI Number', width: 14 },
  { key: 'tinNumber', header: 'TIN Number', width: 20, prompt: 'XXX-XXX-XXX-XXXXX' },
  { key: 'registeredName', header: 'Registered Name', width: 28 },
  { key: 'registeredAddress', header: 'Registered Address', width: 34 },
  { key: 'grossAmount', header: 'Gross Amount', width: 14 },
  { key: 'netOfVat', header: 'Net of VAT', width: 13, computed: true },
  { key: 'vatAmount', header: 'VAT Amount', width: 12, computed: true },
  { key: 'accountTitle', header: 'Account Title', width: 40, prompt: 'Pick from the chart of accounts.' },
  { key: 'hasEwt', header: 'Has EWT?', width: 10 },
  { key: 'ewtRate', header: 'EWT %', width: 8 },
  { key: 'ewtAmount', header: 'EWT Amount', width: 12, computed: true },
]
export const colLetter = (key: ColKey) => String.fromCharCode(65 + COLUMNS.findIndex(c => c.key === key))

export type RawCell = string | number | boolean | null | undefined
export type RawRow = Partial<Record<ColKey, RawCell>>

export interface Account { accountNumber: string; accountTitle: string }
export const numberTitle = (a: Account) => `${a.accountNumber} ${a.accountTitle}`

/** What one valid row saves as (PettyCashEntry fields). */
export interface OneTimeData {
  requestor: string | null
  departments: string[]
  date: string // YYYY-MM-DD
  description: string | null
  validity: string | null
  vatable: string | null // 'VAT' | 'Non-VAT' | null
  vatPortion: number | null // VAT + Non-VAT only
  siNumber: string | null
  tinNumber: string | null
  registeredName: string | null
  registeredAddress: string | null
  grossAmount: number
  accountTitle: string | null
  hasEwt: boolean
  ewtRate: number | null
}

export interface RowResult { row: number; errors: string[]; warnings: string[]; data: OneTimeData | null }

const s = (v: RawCell) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
const r2 = (n: number) => Math.round(n * 100) / 100
const amountOf = (v: RawCell): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = s(v).replace(/[₱,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const digits = (v: string) => v.replace(/\D/g, '')
export const formatTin = (raw: string) => {
  const d = digits(raw).slice(0, 14)
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean).join('-')
}
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
}
/** Excel serial, "YYYY-MM-DD", or "M/D/YYYY" → "YYYY-MM-DD" (null when unreadable). */
export function dateOf(v: RawCell): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const dt = new Date(Math.round((v - 25569) * 86400000))
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  const t = s(v)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return iso(+m[3], +m[1], +m[2])
  return null
}
const pick = <T extends string>(v: RawCell, options: readonly T[]): T | null | undefined => {
  const t = s(v).toLowerCase()
  if (!t) return null
  return options.find(o => o.toLowerCase() === t)
}

/** Check one template row. `row` is the spreadsheet row number, for messages. */
export function validateOneTimeRow(raw: RawRow, row: number, accounts: Account[]): RowResult {
  const errors: string[] = [], warnings: string[] = []
  const requestor = s(raw.requestor) || null
  const description = s(raw.description) || null

  const date = dateOf(raw.date)
  if (!s(raw.date)) errors.push('Date is missing')
  else if (!date) errors.push(`Date "${s(raw.date)}" is not a date (use YYYY-MM-DD)`)

  const gross = amountOf(raw.grossAmount)
  if (gross == null) errors.push('Gross Amount is missing')
  else if (Number.isNaN(gross) || gross === 0) errors.push(`Gross Amount "${s(raw.grossAmount)}" is not an amount`)
  if (!requestor && !description) errors.push('Enter a Payee or a Description')

  // Departments: blank / All = shared; else one or more tags.
  const deptRaw = s(raw.departments)
  const departments: string[] = []
  if (deptRaw && deptRaw.toLowerCase() !== 'all') {
    for (const part of deptRaw.split(/[,/;]+/).map(p => p.trim()).filter(Boolean)) {
      const d = DEPT_OPTIONS.find(o => o.toLowerCase() === part.toLowerCase() || (o === 'PSYCHOLOGY' && part.toLowerCase() === 'psych'))
      if (!d || d === 'All') errors.push(`Department "${part}" is not one of ${DEPT_OPTIONS.join(', ')}`)
      else if (!departments.includes(d)) departments.push(d)
    }
  }

  const validity = pick(raw.validity, VALIDITY_OPTIONS)
  if (validity === undefined) errors.push(`Valid/Invalid "${s(raw.validity)}" must be ${VALIDITY_OPTIONS.join(', ')}`)
  const vat = pick(raw.vatable, VATABLE_OPTIONS)
  if (vat === undefined) errors.push(`Vatable "${s(raw.vatable)}" must be ${VATABLE_OPTIONS.join(', ')}`)
  const isValid = validity === 'Valid'
  if (vat && !isValid) errors.push('Vatable applies only to Valid entries — set Valid/Invalid to Valid or clear Vatable')
  const siNumber = s(raw.siNumber) || null
  const tinRaw = s(raw.tinNumber)
  if ((siNumber || tinRaw) && !isValid) errors.push('SI Number and TIN apply only to Valid entries')
  let tinNumber: string | null = null
  if (tinRaw) {
    const d = digits(tinRaw)
    if (d.length < 9 || d.length > 14) errors.push(`TIN "${tinRaw}" should have 9 to 14 digits`)
    else tinNumber = formatTin(d)
  }

  // VAT + Non-VAT: the typed VAT part is what carries VAT; the rest is non-VAT.
  let vatable: string | null = null, vatPortion: number | null = null
  const part = amountOf(raw.vatPortion)
  if (vat === PART_VAT) {
    vatable = 'VAT'
    if (part == null) errors.push('VAT + Non-VAT needs the VAT part (₱)')
    else if (Number.isNaN(part) || part <= 0) errors.push(`VAT part "${s(raw.vatPortion)}" is not an amount`)
    else if (gross != null && !Number.isNaN(gross) && part > Math.abs(gross)) errors.push(`VAT part ₱${part.toFixed(2)} is more than the gross ₱${Math.abs(gross).toFixed(2)}`)
    else vatPortion = r2(part)
  } else {
    if (vat) vatable = vat
    if (part != null && !Number.isNaN(part) && part !== 0) warnings.push('VAT part is used only with VAT + Non-VAT — ignored')
  }

  // Account Title: "number title" from the dropdown; the number or the title alone also match.
  let accountTitle: string | null = null
  const at = s(raw.accountTitle)
  if (!at) warnings.push('No Account Title — set it in the grid before the RFP')
  else {
    const lc = at.toLowerCase()
    const hit = accounts.find(a => numberTitle(a).toLowerCase() === lc)
      || accounts.find(a => a.accountNumber === at.split(' ')[0] && (at.split(' ').length === 1 || numberTitle(a).toLowerCase().startsWith(lc)))
      || accounts.find(a => a.accountTitle.toLowerCase() === lc)
    if (hit) accountTitle = numberTitle(hit)
    else errors.push(`Account Title "${at}" is not in the chart of accounts`)
  }

  const ewt = pick(raw.hasEwt, YES_NO)
  if (ewt === undefined) errors.push(`Has EWT? "${s(raw.hasEwt)}" must be Yes or No`)
  const hasEwt = ewt === 'Yes'
  let ewtRate: number | null = null
  const rateRaw = s(raw.ewtRate).replace('%', '')
  if (hasEwt) {
    // 5 or 10; a cell formatted as % arrives as 0.05 / 0.1.
    const typed = Number(rateRaw)
    const rv = !rateRaw ? 5 : Math.round((typed < 1 ? typed * 100 : typed) * 100) / 100
    if (!(EWT_RATES as readonly number[]).includes(rv)) errors.push(`EWT % "${s(raw.ewtRate)}" must be 5 or 10`)
    else ewtRate = rv
    if (!rateRaw) warnings.push('EWT % blank — 5% used')
  } else if (rateRaw) warnings.push('EWT % is used only when Has EWT? is Yes — ignored')

  const data: OneTimeData | null = errors.length ? null : {
    requestor, departments, date: date!, description, validity: validity ?? null,
    vatable, vatPortion, siNumber: isValid ? siNumber : null, tinNumber: isValid ? tinNumber : null,
    registeredName: s(raw.registeredName).toUpperCase() || null,
    registeredAddress: s(raw.registeredAddress).toUpperCase() || null,
    grossAmount: r2(gross as number), accountTitle, hasEwt, ewtRate,
  }
  return { row, errors, warnings, data }
}

/** True when nothing but computed columns has a value (a blank template row). */
export const isBlankRow = (raw: RawRow) => COLUMNS.every(c => c.computed || s(raw[c.key]) === '')
