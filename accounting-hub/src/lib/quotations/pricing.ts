/**
 * Quotation line pricing.
 *
 * Shared by the maker UI and the document generator so the figure a client reads
 * on the .docx is the one the screen showed. The PWD rules mirror the POS exactly
 * (20%, `noPwdDiscount` items excluded, clinic-fee-only services discounted on the
 * clinic portion) — a quotation that promises a discount the till won't honour is
 * worse than no quotation.
 *
 * Precedence per line: an explicit per-line discount wins; otherwise the PWD rate
 * if "use PWD for all" is on; otherwise the blanket special discount. They never
 * stack — two discounts on one line is a pricing argument waiting to happen.
 */

export const QUOTATION_BRANCHES = [
  { key: 'AHEA', label: 'Aura Health Rehab — East', serviceBranch: 'SANDBOX_EAST' },
  { key: 'AHGH', label: 'Aura Health Rehab — Greenhills', serviceBranch: 'SANDBOX_GREENHILLS' },
  { key: 'VERDANA', label: 'Verdana Rehab Solutions', serviceBranch: 'VERDANA_STORE' },
  { key: 'INSTITUTE', label: 'Aura Health Institute', serviceBranch: 'ALL' },
] as const

export type QuotationBranch = (typeof QUOTATION_BRANCHES)[number]['key']

export const VALIDITY_OPTIONS = [30, 45, 60, 90] as const

/** Downpayment required to reserve the booking, as a percentage of the grand total. */
export const DOWNPAYMENT_OPTIONS = [20, 30, 40, 50] as const

export const PWD_RATE = 0.2

export type DiscountKind = 'NONE' | 'PERCENT' | 'AMOUNT'

/** A line as the maker holds it, before pricing is resolved. */
export interface QuotationLineInput {
  kind: 'SERVICE' | 'PRODUCT'
  serviceId?: string
  inventoryItemId?: string
  name: string
  department?: string | null
  sku?: string | null
  imageUrl?: string | null
  grossPrice: number
  quantity: number
  /** Per-line override — set only for the lines you want discounted. */
  lineDiscountType?: DiscountKind
  lineDiscountValue?: number | null
  /** Service PWD attributes, copied from the Service record. */
  noPwdDiscount?: boolean
  hasDoctorFee?: boolean
  pwdDiscountClinicOnly?: boolean
  clinicFee?: number | null
}

export interface PricedLine extends QuotationLineInput {
  /** Unit price after discount; null when the line is quoted at gross. */
  discountedPrice: number | null
  /** Why it is discounted, printed on the document. Null when quoted at gross. */
  discountLabel: string | null
  /** quantity × (discountedPrice ?? grossPrice) */
  lineTotal: number
}

export interface QuotationDiscountSettings {
  usePwdRate: boolean
  globalDiscountType?: DiscountKind
  globalDiscountValue?: number | null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const peso = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The PWD unit price for a service, or null when the service carries no PWD rate
 * (`noPwdDiscount`) — those are quoted at gross, as requested.
 */
export function pwdUnitPrice(line: QuotationLineInput): number | null {
  if (line.kind !== 'SERVICE') return null // goods are quoted at gross; PWD on retail is a till-side rule
  if (line.noPwdDiscount) return null
  if (line.hasDoctorFee && line.pwdDiscountClinicOnly) {
    // Only the clinic portion is discountable; the doctor's fee is not.
    if (line.clinicFee == null) return null
    return round2(line.grossPrice - line.clinicFee * PWD_RATE)
  }
  return round2(line.grossPrice * (1 - PWD_RATE))
}

function applyDiscount(gross: number, type: DiscountKind, value: number): number {
  if (type === 'PERCENT') return round2(gross * (1 - value / 100))
  return round2(gross - value)
}

export function priceLine(line: QuotationLineInput, settings: QuotationDiscountSettings): PricedLine {
  const gross = round2(line.grossPrice)
  let discounted: number | null = null
  let label: string | null = null

  const lineType = line.lineDiscountType ?? 'NONE'
  const lineValue = line.lineDiscountValue ?? 0

  if (lineType !== 'NONE' && lineValue > 0) {
    discounted = applyDiscount(gross, lineType, lineValue)
    label = lineType === 'PERCENT' ? `${lineValue}% off` : `${peso(lineValue)} off`
  } else if (settings.usePwdRate) {
    const pwd = pwdUnitPrice(line)
    if (pwd != null) {
      discounted = pwd
      // No brackets — the document already wraps the label in its own.
      label = line.hasDoctorFee && line.pwdDiscountClinicOnly ? 'PWD — clinic fee only' : 'PWD 20%'
    }
  }

  if (
    discounted == null &&
    settings.globalDiscountType &&
    settings.globalDiscountType !== 'NONE' &&
    (settings.globalDiscountValue ?? 0) > 0
  ) {
    const value = settings.globalDiscountValue as number
    discounted = applyDiscount(gross, settings.globalDiscountType, value)
    label = settings.globalDiscountType === 'PERCENT' ? `${value}% off` : `${peso(value)} off`
  }

  // A discount must never invert the price.
  if (discounted != null && discounted < 0) discounted = 0

  const unit = discounted ?? gross
  return {
    ...line,
    grossPrice: gross,
    discountedPrice: discounted,
    discountLabel: label,
    lineTotal: round2(unit * line.quantity),
  }
}

export interface QuotationTotals {
  lines: PricedLine[]
  services: PricedLine[]
  products: PricedLine[]
  subtotalGross: number
  totalDiscount: number
  grandTotal: number
}

export function priceQuotation(
  lines: QuotationLineInput[],
  settings: QuotationDiscountSettings,
): QuotationTotals {
  const priced = lines.map(l => priceLine(l, settings))
  const subtotalGross = round2(priced.reduce((s, l) => s + l.grossPrice * l.quantity, 0))
  const grandTotal = round2(priced.reduce((s, l) => s + l.lineTotal, 0))
  return {
    lines: priced,
    services: priced.filter(l => l.kind === 'SERVICE'),
    products: priced.filter(l => l.kind === 'PRODUCT'),
    subtotalGross,
    totalDiscount: round2(subtotalGross - grandTotal),
    grandTotal,
  }
}

export const formatPeso = peso

export function validUntil(datePrepared: Date, validityDays: number): Date {
  const d = new Date(datePrepared)
  d.setDate(d.getDate() + validityDays)
  return d
}
