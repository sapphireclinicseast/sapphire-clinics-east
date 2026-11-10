import type { jsPDF as JsPDF } from 'jspdf'

// Branded AR → HMO report PDFs (Hannah 2026-11-10): the HMO Collection Report
// (For Follow Up: unpaid over 180 AR days; Left Out Sessions), the HMO Accounts
// Receivable Report (Per HMO) and the Doctor Consults Report — one section per
// SOA branch × HMO.
//
// Per-branch details come from two places:
//  - company (name, trade name, address, phone, email): InvoiceSettings — the
//    same row Invoice Settings edits, so a branch keeps one letterhead;
//  - TIN, bank to remit to, and the finance officer who follows up:
//    CollectionReportSettings.
// Branches with nothing saved yet fall back to the official branch details.

export const COLLECTION_SETTINGS_WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
export const COLLECTION_SETTINGS_READ_ROLES = [...COLLECTION_SETTINGS_WRITE_ROLES, 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export const COLLECTION_BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East', code: 'EAST' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills', code: 'GH' },
] as const

export const COMPANY_FIELDS = ['companyName', 'tradeName', 'address', 'phone', 'email'] as const
export const COLLECTION_FIELDS = [
  'tin', 'bankName', 'bankBranch', 'bankAccountName', 'bankAccountNo',
  'officerName', 'officerPosition', 'officerEmail', 'officerPhone',
] as const
type CompanyField = typeof COMPANY_FIELDS[number]
type CollectionField = typeof COLLECTION_FIELDS[number]

export type CollectionBranchSettings = Record<CompanyField | CollectionField, string> & {
  branch: string
  companySaved: boolean
  collectionSaved: boolean
  updatedByName?: string | null
}

// Official branch details (Aura Health Rehab branch reference), used until a
// branch's own details are saved.
const OFFICIAL: Record<string, Partial<Record<CompanyField, string>>> = {
  SANDBOX_EAST: {
    companyName: 'Sapphire Clinics East Incorporated',
    tradeName: 'Aura Health Rehab – East',
    address: 'Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig',
    phone: '+63 917 118 9289 · (02) 5310-4991',
    email: 'east@sapphireclinicseast.org',
  },
  SANDBOX_GREENHILLS: {
    companyName: 'Sapphire Clinics East Incorporated',
    tradeName: 'Aura Health Rehab – Greenhills',
    address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
    phone: '+63 917 770 1686 · (02) 8529-1590',
    email: 'greenhills@sapphireclinicseast.org',
  },
}

export function emptyBranchSettings(branch: string): CollectionBranchSettings {
  const base = Object.fromEntries([...COMPANY_FIELDS, ...COLLECTION_FIELDS].map(f => [f, ''])) as Record<CompanyField | CollectionField, string>
  return { ...base, companyName: 'Sapphire Clinics East Incorporated', ...(OFFICIAL[branch] || {}), branch, companySaved: false, collectionSaved: false }
}

/** Merge saved rows over the official defaults. `bankFallback` (the SOA settings bank) only fills a branch with no saved collection row. */
export function mergeBranchSettings(
  branch: string,
  company: Partial<Record<CompanyField, string | null>> | null,
  collection: (Partial<Record<CollectionField, string | null>> & { updatedByName?: string | null }) | null,
  bankFallback?: Partial<Record<'bankName' | 'bankBranch' | 'bankAccountName' | 'bankAccountNo', string | null>> | null,
): CollectionBranchSettings {
  const out = emptyBranchSettings(branch)
  if (company) for (const f of COMPANY_FIELDS) if (company[f]?.trim()) out[f] = company[f]!.trim()
  if (collection) {
    for (const f of COLLECTION_FIELDS) out[f] = collection[f]?.trim() || ''
    out.updatedByName = collection.updatedByName ?? null
  } else if (bankFallback) {
    for (const f of ['bankName', 'bankBranch', 'bankAccountName', 'bankAccountNo'] as const) out[f] = bankFallback[f]?.trim() || ''
  }
  out.companySaved = !!company
  out.collectionSaved = !!collection
  return out
}

export function cleanCollectionSettingsInput(body: Record<string, unknown>): {
  branch: string
  company: Record<CompanyField, string | null>
  collection: Record<CollectionField, string | null>
  error?: string
} {
  const branch = typeof body.branch === 'string' ? body.branch : ''
  const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const company = Object.fromEntries(COMPANY_FIELDS.map(f => [f, text(body[f], f === 'address' ? 300 : 200)])) as Record<CompanyField, string | null>
  const collection = Object.fromEntries(COLLECTION_FIELDS.map(f => [f, text(body[f])])) as Record<CollectionField, string | null>
  if (!COLLECTION_BRANCHES.some(b => b.value === branch)) return { branch, company, collection, error: 'Pick East or Greenhills' }
  if (!company.companyName) return { branch, company, collection, error: 'Company name is required' }
  for (const f of ['officerEmail'] as const) {
    if (collection[f] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(collection[f]!)) return { branch, company, collection, error: 'The finance officer email does not look right' }
  }
  return { branch, company, collection }
}

/** What a branch still needs before its collection report is complete. */
export function missingCollectionSettings(s: CollectionBranchSettings): string[] {
  const out: string[] = []
  if (!s.bankName || !s.bankAccountName || !s.bankAccountNo) out.push('bank details')
  if (!s.officerName) out.push('finance officer')
  return out
}

// ─── PDF ────────────────────────────────────────────────────────────────────
// One look for every AR → HMO PDF (Hannah 2026-11-10: "do the same for the
// other AR PDFs"). Each report kind picks its title, columns, summary and
// whether the remit-to box prints; the letterhead, cards, table, sign-off and
// footer are shared.

export interface CollectionClaim {
  serviceDate: string // ISO
  patient: string
  service: string // every item on the order, one per line
  clinician: string
  soaRef: string
  soaDate: string // ISO or ''
  arDays: number
  amount: number
  paid?: boolean // tagged to an HMO payment
  soaDays?: number // days since the latest SOA covering it
  doctorPayment?: string // PV for a consult the HMO paid to the doctor
}

export interface CollectionGroup {
  settings: CollectionBranchSettings
  branchCode: string // soaBranchCode, for the reference number
  hmoName: string
  attention?: { name?: string | null; email?: string | null; number?: string | null } | null
  claims: CollectionClaim[]
}

export type HmoReportKind = 'collection' | 'left-out' | 'ar' | 'md-consults'

// jsPDF's built-in Helvetica only carries Latin-1: no peso sign, en dash or curly quotes.
export const pdfText = (s: string) => s
  .replace(/₱/g, 'PHP ')
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '')

const money = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
export const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '')
const ymd = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
const plural = (n: number, w: string) => `${n.toLocaleString('en-PH')} ${w}${n === 1 ? '' : 's'}`

type Rgb = [number, number, number]
const C_TEAL: Rgb = [15, 118, 110]
const C_TEAL_SOFT: Rgb = [230, 244, 242]
const C_INK: Rgb = [31, 42, 40]
const C_GRAY: Rgb = [95, 107, 104]
const C_RULE: Rgb = [213, 222, 217]
const C_WHITE: Rgb = [255, 255, 255]
const C_RED: Rgb = [185, 28, 28]
const C_GREEN: Rgb = [22, 101, 52]

interface Column { head: string; width: number | 'auto'; align?: 'left' | 'right' | 'center'; cell: (c: CollectionClaim) => string; color?: (c: CollectionClaim) => Rgb | undefined }
interface KindSpec {
  title: string
  refPrefix: string
  footerName: string
  columns: Column[]
  intro: (g: CollectionGroup, place: string, coverage: string) => string
  summary: (g: CollectionGroup, coverage: string) => [string, string][]
  highlight: (g: CollectionGroup) => { label: string; value: string; sub: string }
  remit: (g: CollectionGroup) => boolean
  totalLabel: string
}

const sum = (g: CollectionGroup, pick: (c: CollectionClaim) => boolean = () => true) => g.claims.filter(pick).reduce((t, c) => t + c.amount, 0)
const soaCell = (c: CollectionClaim) => [c.soaRef, shortDate(c.soaDate)].filter(Boolean).join('\n') || 'Not yet submitted'
const statusCell = (c: CollectionClaim) => (c.paid ? 'Paid' : 'Unpaid')
const statusColor = (c: CollectionClaim): Rgb => (c.paid ? C_GREEN : C_RED)

const BASE_COLUMNS: Column[] = [
  { head: '#', width: 8, align: 'center', cell: () => '' }, // numbered in the body
  { head: 'Date of Service', width: 23, cell: c => shortDate(c.serviceDate) },
  { head: 'Patient', width: 36, cell: c => c.patient },
  { head: 'Service Rendered', width: 'auto', cell: c => c.service },
  { head: 'Clinician', width: 34, cell: c => c.clinician },
]
const AMOUNT: Column = { head: 'Amount (PHP)', width: 25, align: 'right', cell: c => money(c.amount) }

export const HMO_REPORTS: Record<HmoReportKind, KindSpec> = {
  collection: {
    title: 'HMO COLLECTION REPORT',
    refPrefix: 'CR',
    footerName: 'Collection Report',
    columns: [...BASE_COLUMNS, { head: 'SOA Ref / Date', width: 42, cell: soaCell }, { head: 'AR Days', width: 15, align: 'right', cell: c => c.arDays.toLocaleString('en-PH') }, AMOUNT],
    intro: (_g, place) => `We respectfully request settlement of the claims below, rendered to your members at ${place}. Each has been unpaid for more than 180 days from the date of service. Please process payment at the soonest possible time, or let us know if any claim needs additional documents.`,
    summary: (g, coverage) => [['Claims for collection', String(g.claims.length)], ['Oldest claim', `${Math.max(0, ...g.claims.map(c => c.arDays)).toLocaleString('en-PH')} days`], ['Coverage', coverage]],
    highlight: g => ({ label: 'TOTAL AMOUNT DUE', value: `PHP ${money(sum(g))}`, sub: plural(g.claims.length, 'claim') }),
    remit: () => true,
    totalLabel: 'TOTAL AMOUNT DUE',
  },
  'left-out': {
    title: 'HMO COLLECTION REPORT',
    refPrefix: 'LO',
    footerName: 'Collection Report (left-out claims)',
    columns: [...BASE_COLUMNS, { head: 'SOA Ref / Date', width: 42, cell: soaCell }, { head: 'Days Since SOA', width: 17, align: 'right', cell: c => (c.soaDays ?? 0).toLocaleString('en-PH') }, AMOUNT],
    intro: (_g, place) => `The claims below, rendered to your members at ${place}, were submitted to you on Statements of Account that have since been paid in part, but these claims were left out of the payment. Please review and settle them, or let us know why they were not paid.`,
    summary: (g, coverage) => [['Claims left out', String(g.claims.length)], ['Longest wait since SOA', `${Math.max(0, ...g.claims.map(c => c.soaDays ?? 0)).toLocaleString('en-PH')} days`], ['Coverage', coverage]],
    highlight: g => ({ label: 'TOTAL LEFT UNPAID', value: `PHP ${money(sum(g))}`, sub: plural(g.claims.length, 'claim') }),
    remit: () => true,
    totalLabel: 'TOTAL LEFT UNPAID',
  },
  ar: {
    title: 'HMO ACCOUNTS RECEIVABLE REPORT',
    refPrefix: 'AR',
    footerName: 'Accounts Receivable Report',
    columns: [...BASE_COLUMNS, { head: 'SOA Ref / Date', width: 42, cell: soaCell }, { head: 'Status', width: 17, align: 'center', cell: statusCell, color: statusColor }, AMOUNT],
    intro: (g, place, coverage) => `Statement of sessions rendered to members of ${g.hmoName} at ${place} (${coverage}). Sessions marked Unpaid remain outstanding.`,
    summary: (g, coverage) => [['Sessions', String(g.claims.length)], ['Collected', `PHP ${money(sum(g, c => !!c.paid))}`], ['Coverage', coverage]],
    highlight: g => ({ label: 'OUTSTANDING BALANCE', value: `PHP ${money(sum(g, c => !c.paid))}`, sub: `of PHP ${money(sum(g))} billed` }),
    remit: g => g.claims.some(c => !c.paid),
    totalLabel: 'TOTAL BILLED',
  },
  'md-consults': {
    title: 'HMO DOCTOR CONSULTS REPORT',
    refPrefix: 'DC',
    footerName: 'Doctor Consults Report',
    columns: [...BASE_COLUMNS, { head: 'Doctor Payment', width: 34, cell: c => c.doctorPayment || '-' }, { head: 'Status', width: 17, align: 'center', cell: statusCell, color: statusColor }, AMOUNT],
    intro: (g, place, coverage) => `Doctor consultations rendered to members of ${g.hmoName} at ${place} (${coverage}).`,
    summary: (g, coverage) => [['Consults', String(g.claims.length)], ['With doctor PV', String(g.claims.filter(c => c.doctorPayment?.startsWith('PV')).length)], ['Coverage', coverage]],
    highlight: g => ({ label: 'TOTAL CONSULTS', value: `PHP ${money(sum(g))}`, sub: plural(g.claims.length, 'consult') }),
    remit: () => false,
    totalLabel: 'TOTAL',
  },
}

export function collectionRef(group: Pick<CollectionGroup, 'branchCode' | 'hmoName'>, generatedAt: Date, prefix = 'CR'): string {
  const hmo = group.hmoName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'HMO'
  return `${prefix}-${group.branchCode}-${ymd(generatedAt)}-${hmo}`
}

/** What a branch still lacks for a report: bank details only matter when the report prints the remit-to box. */
export function missingForReport(s: CollectionBranchSettings, needsRemit: boolean): string[] {
  return missingCollectionSettings(s).filter(m => m !== 'bank details' || needsRemit)
}

/**
 * Draw a branded HMO report into a fresh landscape A4 jsPDF document: one
 * section per group (SOA branch × HMO), each starting on its own page.
 * `autoTable` is jspdf-autotable's default export.
 */
export function drawHmoReport(
  doc: JsPDF,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: JsPDF, opts: any) => void,
  kind: HmoReportKind,
  { groups, coverage, generatedAt, logo }: { groups: CollectionGroup[]; coverage: string; generatedAt: Date; logo?: { dataUri: string; w: number; h: number } | null },
): void {
  const spec = HMO_REPORTS[kind]
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const T = (s: string | null | undefined) => pdfText(s || '')
  const footers: { page: number; left: string; mid: string }[] = []

  const letterhead = (s: CollectionBranchSettings, compact: boolean) => {
    const top = compact ? 8 : 10
    const lh = compact ? 9 : 16
    const lw = logo ? (logo.w / logo.h) * lh : 0
    if (logo) doc.addImage(logo.dataUri, 'PNG', M, top, lw, lh)
    const x = M + (logo ? lw + 4 : 0)
    doc.setTextColor(...C_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(compact ? 10 : 13)
    doc.text(T(s.companyName), x, top + (compact ? 4 : 5))
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(compact ? 7.5 : 8.5)
    doc.text(T(s.tradeName), x, top + (compact ? 8 : 10))
    if (!compact) {
      doc.setFontSize(7.5)
      doc.text(T(s.address), x, top + 14)
      const contact = [s.tin && `TIN ${s.tin}`, s.email, s.phone].filter(Boolean).join('   |   ')
      doc.text(T(contact), x, top + 18)
    }
    return compact ? top + lh + 3 : top + 24
  }

  const title = (ref: string, compact: boolean) => {
    doc.setTextColor(...C_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(compact ? 11 : 18)
    doc.text(spec.title, W - M, compact ? 13 : 17, { align: 'right' })
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(compact ? 7.5 : 8.5)
    doc.text(T(`${longDate(generatedAt)}   |   Ref ${ref}`), W - M, compact ? 17.5 : 23, { align: 'right' })
  }

  const rule = (y: number) => {
    doc.setDrawColor(...C_TEAL); doc.setLineWidth(0.7); doc.line(M, y, W - M, y)
  }

  groups.forEach((g, gi) => {
    if (gi > 0) doc.addPage()
    const s = g.settings
    const ref = collectionRef(g, generatedAt, spec.refPrefix)
    const place = s.tradeName || s.companyName

    // ── Letterhead ──
    let y = letterhead(s, false)
    title(ref, false)
    rule(y + 2); y += 7

    // ── Cards: addressed to · summary · highlight ──
    const gap = 4
    const cardW = (W - 2 * M - 2 * gap) / 3
    const cardH = 25
    const card = (x: number, fill: Rgb, border: boolean) => {
      doc.setFillColor(...fill)
      if (border) { doc.setDrawColor(...C_RULE); doc.setLineWidth(0.3); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD') }
      else doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
    }
    const label = (text: string, x: number, yy: number, color: Rgb = C_GRAY) => {
      doc.setTextColor(...color); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(text, x, yy)
    }

    let x = M
    card(x, C_WHITE, true)
    label(kind === 'md-consults' || kind === 'ar' ? 'HMO' : 'ADDRESSED TO', x + 4, y + 5.5)
    doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(T(g.hmoName), x + 4, y + 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_GRAY)
    const att = g.attention
    let ay = y + 16.5
    if (att?.name) {
      const lines = (doc.splitTextToSize(T(`Attn: ${att.name}`), cardW - 8) as string[]).slice(0, 2)
      doc.text(lines, x + 4, ay)
      ay += lines.length * 3.2 + 0.6
    } else ay += 1
    const attLine = [att?.email, att?.number].filter(Boolean).join('   |   ')
    if (attLine) doc.text(doc.splitTextToSize(T(attLine), cardW - 8)[0], x + 4, Math.min(ay, y + cardH - 2.5))

    x += cardW + gap
    card(x, C_TEAL_SOFT, false)
    label('SUMMARY', x + 4, y + 5.5, C_TEAL)
    spec.summary(g, coverage).forEach(([k, v], i) => {
      const yy = y + 11.5 + i * 5
      doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(T(k), x + 4, yy)
      doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.text(T(v), x + cardW - 4, yy, { align: 'right' })
    })

    x += cardW + gap
    const hl = spec.highlight(g)
    card(x, C_TEAL, false)
    label(hl.label, x + 4, y + 5.5, C_WHITE)
    doc.setTextColor(...C_WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.text(T(hl.value), x + cardW - 4, y + 16, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(T(hl.sub), x + cardW - 4, y + 21.5, { align: 'right' })
    y += cardH + 6

    // ── Intro ──
    doc.setTextColor(...C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    const introLines = doc.splitTextToSize(T(spec.intro(g, place, coverage)), W - 2 * M)
    doc.text(introLines, M, y)
    y += introLines.length * 3.8 + 2

    // ── Claims ──
    const sorted = [...g.claims].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
    const cols = spec.columns
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 26, bottom: 16 },
      head: [cols.map(c => c.head)],
      body: sorted.map((c, i) => cols.map((col, ci) => (ci === 0 ? String(i + 1) : T(col.cell(c))))),
      foot: [[{ content: spec.totalLabel, colSpan: cols.length - 1, styles: { halign: 'right' } }, money(sum(g))]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.8, textColor: C_INK, cellPadding: { top: 2, bottom: 2, left: 2.2, right: 2.2 }, lineColor: C_RULE, lineWidth: 0.15, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: C_TEAL, textColor: C_WHITE, fontStyle: 'bold', fontSize: 7.8, lineWidth: 0, valign: 'middle' },
      footStyles: { fillColor: C_TEAL_SOFT, textColor: C_TEAL, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: [248, 251, 250] },
      columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: c.width, ...(c.align ? { halign: c.align } : {}), ...(i === 0 ? { textColor: C_GRAY } : {}) }])),
      didParseCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { styles: { textColor?: Rgb; fontStyle?: string } } }) => {
        const col = cols[data.column.index]
        if (data.section !== 'body' || !col?.color) return
        const color = col.color(sorted[data.row.index])
        if (color) { data.cell.styles.textColor = color; data.cell.styles.fontStyle = 'bold' }
      },
      didDrawPage: (data: { pageNumber: number }) => {
        if (data.pageNumber > 1) { letterhead(s, true); title(ref, true); rule(21) }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 7

    // ── Remit to · prepared by ──
    const showRemit = spec.remit(g)
    const boxH = 30
    if (y + boxH > H - 13) { // the footer rule sits at H - 11
      doc.addPage(); letterhead(s, true); title(ref, true); rule(21); y = 27
    }
    const boxW = (W - 2 * M - gap) / 2
    const kv = (k: string, v: string, yy: number, bx: number) => {
      doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(k, bx + 4, yy)
      doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.text(T(v) || '-', bx + 34, yy)
    }
    if (showRemit) {
      doc.setFillColor(...C_TEAL_SOFT); doc.roundedRect(M, y, boxW, boxH, 2, 2, 'F')
      label('PLEASE REMIT PAYMENT TO', M + 4, y + 6, C_TEAL)
      kv('Bank', s.bankName, y + 12, M)
      kv('Branch', s.bankBranch, y + 17, M)
      kv('Account name', s.bankAccountName, y + 22, M)
      kv('Account number', s.bankAccountNo, y + 27, M)
    }
    const px = showRemit ? M + boxW + gap : M
    doc.setDrawColor(...C_RULE); doc.setLineWidth(0.3); doc.roundedRect(px, y, boxW, boxH, 2, 2, 'S')
    label('PREPARED BY', px + 4, y + 6)
    doc.setDrawColor(...C_INK); doc.setLineWidth(0.2); doc.line(px + 4, y + 15, px + 74, y + 15)
    doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    doc.text(T(s.officerName) || '-', px + 4, y + 19.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_GRAY)
    doc.text(T(s.officerPosition || 'Finance Officer'), px + 4, y + 23.5)
    const reach = [s.officerEmail, s.officerPhone].filter(Boolean).join('   |   ')
    if (reach) doc.text(T(reach), px + 4, y + 27.5)

    const first = footers.length ? footers[footers.length - 1].page + 1 : 1
    for (let p = first; p <= doc.getNumberOfPages(); p++) {
      footers.push({ page: p, left: `${s.companyName}   |   ${s.tradeName}`, mid: `${spec.footerName} - ${g.hmoName}   |   Ref ${ref}` })
    }
  })

  // ── Footers: page X of Y over the whole file ──
  const total = doc.getNumberOfPages()
  for (const f of footers) {
    doc.setPage(f.page)
    doc.setDrawColor(...C_RULE); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11)
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(T(f.left), M, H - 7)
    doc.text(T(f.mid), W / 2, H - 7, { align: 'center' })
    doc.text(`Page ${f.page} of ${total}`, W - M, H - 7, { align: 'right' })
  }
}

/** The For Follow Up collection report (kept for callers of the first version). */
export function drawCollectionReport(
  doc: JsPDF,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: JsPDF, opts: any) => void,
  opts: { groups: CollectionGroup[]; coverage: string; generatedAt: Date; logo?: { dataUri: string; w: number; h: number } | null },
): void {
  drawHmoReport(doc, autoTable, 'collection', opts)
}
