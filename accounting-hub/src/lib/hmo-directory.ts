// AR → HMO Directory rules, shared by the API, the tab, the bell and the renewal
// popup (no server imports).
import { isYmd, todayManila } from '@/lib/tuition'

export const MOA_ALERT_DAYS = 30
// Who gets the renewal popup: HMO officers, the main user and accounting.
export const MOA_ALERT_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'HMO_OFFICER']
// Mirrors READ_ROLES in api/accounts-receivable/route.ts.
export const DIRECTORY_READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
export const DIRECTORY_WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

export const MD_PAYMENT_LABEL = {
  DOCTOR_DIRECT: 'Doctor is paid separately (check release)',
  CLINIC: 'Clinic is paid for medical doctors',
} as const
export type MdPayment = keyof typeof MD_PAYMENT_LABEL

// How the HMO takes our SOAs (Hannah 11/11: a dropdown per HMO, email or courier).
export const SOA_SUBMISSION_LABEL = {
  EMAIL: 'Email',
  COURIER: 'Courier',
  EMAIL_AND_COURIER: 'Email and courier',
} as const
export type SoaSubmission = keyof typeof SOA_SUBMISSION_LABEL
export const isSoaSubmission = (v: unknown): v is SoaSubmission =>
  typeof v === 'string' && (Object.keys(SOA_SUBMISSION_LABEL) as string[]).includes(v)

export const ACCREDITABLE_BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills' },
] as const

export type AccreditableBranch = typeof ACCREDITABLE_BRANCHES[number]['value']
const isAccreditable = (v: unknown): v is AccreditableBranch =>
  typeof v === 'string' && ACCREDITABLE_BRANCHES.some(b => b.value === v)

// A price list PDF and the branch it is for (Hannah 11/11: East and Greenhills
// each submit their own). Stored in HmoDirectory.priceListFileUrls as
// { url, branch } objects; a bare URL string (none existed when this landed)
// counts as untagged, i.e. for every branch.
export type PriceListFile = { url: string; branch: AccreditableBranch | null }
const isPdfUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('/api/files/') && /\.pdf$/i.test(u)

export function priceListFiles(v: unknown): PriceListFile[] {
  return (Array.isArray(v) ? v : []).flatMap((x): PriceListFile[] => {
    if (isPdfUrl(x)) return [{ url: x, branch: null }]
    if (x && typeof x === 'object' && isPdfUrl((x as { url?: unknown }).url)) {
      const branch = (x as { branch?: unknown }).branch
      return [{ url: (x as { url: string }).url, branch: isAccreditable(branch) ? branch : null }]
    }
    return []
  }).slice(0, 40)
}

const DAY_MS = 86_400_000

export function moaDaysLeft(validUntil: string, today = todayManila()): number {
  return Math.round((Date.parse(validUntil.slice(0, 10)) - Date.parse(today)) / DAY_MS)
}

// True from 30 days before expiry and every day after, until a later date is saved.
export function moaNeedsRenewal(validUntil: string | null | undefined, today = todayManila()): boolean {
  return !!validUntil && moaDaysLeft(validUntil, today) <= MOA_ALERT_DAYS
}

export function moaStatusText(daysLeft: number): string {
  if (daysLeft < 0) return `Expired ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago`
  if (daysLeft === 0) return 'Expires today'
  return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
}

const firstWord = (s: string) => s.trim().split(/[\s/]+/)[0].toUpperCase()

// Wallets and Services spell some HMOs differently ("INLIFE/GENERALI" and
// "INLIFE BENEFITS/GENERALI"), so the picker offers same-first-word categories first.
export function categoriesMatching(hmoName: string, categories: string[]): string[] {
  const word = firstWord(hmoName)
  return categories.filter(c => firstWord(c) === word)
}

export interface HmoDirectoryFields {
  accreditedBranches: string[]
  accreditationName: string | null
  accreditationEmail: string | null
  accreditationNumber: string | null
  submissionName: string | null
  submissionEmail: string | null
  submissionNumber: string | null
  collectionName: string | null
  collectionEmail: string | null
  collectionNumber: string | null
  moaValidUntil: Date | null
  moaFileUrls: string[]
  priceListFileUrls: PriceListFile[]
  mdPayment: MdPayment | null
  soaSubmission: SoaSubmission | null
  earlyDiscountPct: number | null
  earlyDiscountDays: number | null
  earlyDiscountNotes: string | null
  loaApplicationUrl: string | null
  serviceCategory: string | null
}

// What an HMO's directory card still lacks, in the order the card shows it.
// Every contact, how SOAs are submitted, the accredited branches, the MOA (date
// and signed copy), the price list, the doctor-payment rule and the Services category are expected
// of every HMO; the early-submission discount and the LOA application link are
// not — many HMOs simply have neither. Hannah 2026-11-10: highlight the HMOs
// with missing information in red.
type CompletenessInput = Partial<Record<`${'accreditation' | 'submission' | 'collection'}${'Name' | 'Email' | 'Number'}`, string | null>> & {
  accreditedBranches?: string[] | null
  moaValidUntil?: string | Date | null
  moaFileUrls?: string[] | null
  priceListFileUrls?: unknown[] | null
  mdPayment?: string | null
  soaSubmission?: string | null
  serviceCategory?: string | null
}
const DIRECTORY_CONTACTS = [['accreditation', 'Accreditation'], ['submission', 'Submission'], ['collection', 'Collection']] as const
const blankText = (v: unknown) => typeof v !== 'string' || !v.trim()

export function missingInfo(e: CompletenessInput): string[] {
  const out: string[] = []
  for (const [key, title] of DIRECTORY_CONTACTS) {
    const name = blankText(e[`${key}Name`]), email = blankText(e[`${key}Email`]), number = blankText(e[`${key}Number`])
    if (name && email && number) { out.push(`${title} contact`); continue }
    if (name) out.push(`${title} contact name`)
    if (email) out.push(`${title} email`)
    if (number) out.push(`${title} number`)
    if (key === 'submission' && !e.soaSubmission) out.push('How SOAs are submitted')
  }
  if (!e.accreditedBranches?.length) out.push('Accredited branches')
  if (!e.mdPayment) out.push('Doctor payment')
  if (!e.moaValidUntil) out.push('MOA validity date')
  if (!e.moaFileUrls?.length) out.push('Signed MOA')
  // One price list per accredited branch (an untagged one covers every branch).
  const lists = priceListFiles(e.priceListFileUrls)
  if (!lists.length) out.push('Price list')
  else {
    for (const b of ACCREDITABLE_BRANCHES) {
      if ((e.accreditedBranches || []).includes(b.value) && !lists.some(f => !f.branch || f.branch === b.value)) out.push(`Price list (${b.label})`)
    }
  }
  if (blankText(e.serviceCategory)) out.push('Category in Services Section')
  return out
}

const TEXT_FIELDS = [
  'accreditationName', 'accreditationEmail', 'accreditationNumber',
  'submissionName', 'submissionEmail', 'submissionNumber',
  'collectionName', 'collectionEmail', 'collectionNumber',
  'serviceCategory',
] as const

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim())
const pdfUrls = (v: unknown) => (Array.isArray(v) ? v : []).filter(isPdfUrl).slice(0, 20)

/**
 * Only the fields present in the body are touched, so picking a category on the
 * list cannot blank what the edit form saved.
 */
export function cleanDirectoryInput(body: Record<string, unknown>): { data: Partial<HmoDirectoryFields>; error?: string } {
  const data: Partial<HmoDirectoryFields> = {}
  for (const f of TEXT_FIELDS) {
    if (f in body) data[f] = typeof body[f] === 'string' && body[f].trim() ? body[f].trim().slice(0, 200) : null
  }
  if ('accreditedBranches' in body) {
    const picked = Array.isArray(body.accreditedBranches) ? body.accreditedBranches : []
    data.accreditedBranches = ACCREDITABLE_BRANCHES.map(b => b.value as string).filter(b => picked.includes(b))
  }
  if ('soaSubmission' in body) {
    if (isBlank(body.soaSubmission)) data.soaSubmission = null
    else if (isSoaSubmission(body.soaSubmission)) data.soaSubmission = body.soaSubmission
    else return { data, error: 'Choose how SOAs are submitted: email, courier, or both' }
  }
  if ('moaFileUrls' in body) data.moaFileUrls = pdfUrls(body.moaFileUrls)
  if ('priceListFileUrls' in body) data.priceListFileUrls = priceListFiles(body.priceListFileUrls)
  if ('earlyDiscountNotes' in body) {
    data.earlyDiscountNotes = typeof body.earlyDiscountNotes === 'string' && body.earlyDiscountNotes.trim() ? body.earlyDiscountNotes.trim().slice(0, 500) : null
  }
  if ('mdPayment' in body) {
    if (isBlank(body.mdPayment)) data.mdPayment = null
    else if (body.mdPayment === 'DOCTOR_DIRECT' || body.mdPayment === 'CLINIC') data.mdPayment = body.mdPayment
    else return { data, error: 'Choose who is paid for medical doctors' }
  }
  if ('moaValidUntil' in body) {
    if (isBlank(body.moaValidUntil)) data.moaValidUntil = null
    else {
      const v = body.moaValidUntil
      const d = isYmd(v) ? new Date(`${v}T00:00:00Z`) : null
      if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { data, error: 'MOA validity date is not a valid date' }
      data.moaValidUntil = d
    }
  }
  if ('earlyDiscountPct' in body) {
    if (isBlank(body.earlyDiscountPct)) data.earlyDiscountPct = null
    else {
      const n = Number(body.earlyDiscountPct)
      if (!Number.isFinite(n) || n < 0 || n > 100) return { data, error: 'Early submission discount must be between 0 and 100%' }
      data.earlyDiscountPct = n
    }
  }
  if ('earlyDiscountDays' in body) {
    if (isBlank(body.earlyDiscountDays)) data.earlyDiscountDays = null
    else {
      const n = Number(body.earlyDiscountDays)
      if (!Number.isInteger(n) || n < 1 || n > 3650) return { data, error: 'Days to submit must be a whole number of days' }
      data.earlyDiscountDays = n
    }
  }
  if ('loaApplicationUrl' in body) {
    if (isBlank(body.loaApplicationUrl)) data.loaApplicationUrl = null
    else {
      // Rendered as a link, so only web addresses get through.
      const raw = String(body.loaApplicationUrl).trim()
      const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
      let url: URL | null = null
      try { url = new URL(withScheme) } catch { /* reported below */ }
      if (!url || !['http:', 'https:'].includes(url.protocol)) return { data, error: 'LOA application link must be a web address' }
      data.loaApplicationUrl = url.href.slice(0, 1000)
    }
  }
  return { data }
}
