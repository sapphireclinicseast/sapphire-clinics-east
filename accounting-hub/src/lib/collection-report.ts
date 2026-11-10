import type { jsPDF as JsPDF } from 'jspdf'

// HMO Collection Report — the branded PDF of the AR "For Follow Up" claims
// (unpaid, over 180 AR days), one section per branch × HMO, sent to the HMO to
// collect. Hannah 2026-11-10.
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

export interface CollectionClaim {
  serviceDate: string // ISO
  patient: string
  service: string // every item on the order, one per line
  clinician: string
  soaRef: string
  soaDate: string // ISO or ''
  arDays: number
  amount: number
}

export interface CollectionGroup {
  settings: CollectionBranchSettings
  branchCode: string // EAST / GH, for the reference number
  hmoName: string
  attention?: { name?: string | null; email?: string | null; number?: string | null } | null
  claims: CollectionClaim[]
}

// jsPDF's built-in Helvetica only carries Latin-1: no peso sign, en dash or curly quotes.
export const pdfText = (s: string) => s
  .replace(/₱/g, 'PHP ')
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '')

const money = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '')
const ymd = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')

export function collectionRef(group: Pick<CollectionGroup, 'branchCode' | 'hmoName'>, generatedAt: Date): string {
  const hmo = group.hmoName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'HMO'
  return `CR-${group.branchCode}-${ymd(generatedAt)}-${hmo}`
}

const C_TEAL: [number, number, number] = [15, 118, 110]
const C_TEAL_SOFT: [number, number, number] = [230, 244, 242]
const C_INK: [number, number, number] = [31, 42, 40]
const C_GRAY: [number, number, number] = [95, 107, 104]
const C_RULE: [number, number, number] = [213, 222, 217]
const C_WHITE: [number, number, number] = [255, 255, 255]

/**
 * Draw the report into a fresh landscape A4 jsPDF document: one section per
 * group, each starting on its own page. `autoTable` is jspdf-autotable's default export.
 */
export function drawCollectionReport(
  doc: JsPDF,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: JsPDF, opts: any) => void,
  { groups, coverage, generatedAt, logo }: { groups: CollectionGroup[]; coverage: string; generatedAt: Date; logo?: { dataUri: string; w: number; h: number } | null },
): void {
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
    doc.text('HMO COLLECTION REPORT', W - M, compact ? 13 : 17, { align: 'right' })
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(compact ? 7.5 : 8.5)
    doc.text(T(`${longDate(generatedAt)}   |   Ref ${ref}`), W - M, compact ? 17.5 : 23, { align: 'right' })
  }

  const rule = (y: number) => {
    doc.setDrawColor(...C_TEAL); doc.setLineWidth(0.7); doc.line(M, y, W - M, y)
  }

  groups.forEach((g, gi) => {
    if (gi > 0) doc.addPage()
    const s = g.settings
    const ref = collectionRef(g, generatedAt)
    const total = g.claims.reduce((t, c) => t + c.amount, 0)
    const oldest = g.claims.reduce((t, c) => Math.max(t, c.arDays), 0)

    // ── Letterhead ──
    let y = letterhead(s, false)
    title(ref, false)
    rule(y + 2); y += 7

    // ── Cards: addressed to · summary · total due ──
    const gap = 4
    const cardW = (W - 2 * M - 2 * gap) / 3
    const cardH = 25
    const card = (x: number, fill: [number, number, number], border: boolean) => {
      doc.setFillColor(...fill)
      if (border) { doc.setDrawColor(...C_RULE); doc.setLineWidth(0.3); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD') }
      else doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
    }
    const label = (text: string, x: number, yy: number, color: [number, number, number] = C_GRAY) => {
      doc.setTextColor(...color); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(text, x, yy)
    }

    let x = M
    card(x, C_WHITE, true)
    label('ADDRESSED TO', x + 4, y + 5.5)
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
    const stat = (k: string, v: string, yy: number) => {
      doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(T(k), x + 4, yy)
      doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.text(T(v), x + cardW - 4, yy, { align: 'right' })
    }
    stat('Claims for collection', String(g.claims.length), y + 11.5)
    stat('Oldest claim', `${oldest.toLocaleString('en-PH')} days`, y + 16.5)
    stat('Coverage', coverage, y + 21.5)

    x += cardW + gap
    card(x, C_TEAL, false)
    label('TOTAL AMOUNT DUE', x + 4, y + 5.5, C_WHITE)
    doc.setTextColor(...C_WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.text(`PHP ${money(total)}`, x + cardW - 4, y + 16, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(`${g.claims.length} claim${g.claims.length === 1 ? '' : 's'}`, x + cardW - 4, y + 21.5, { align: 'right' })
    y += cardH + 6

    // ── Request ──
    doc.setTextColor(...C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    const ask = T(`We respectfully request settlement of the claims below, rendered to your members at ${s.tradeName || s.companyName}. Each has been unpaid for more than 180 days from the date of service. Please process payment at the soonest possible time, or let us know if any claim needs additional documents.`)
    const askLines = doc.splitTextToSize(ask, W - 2 * M)
    doc.text(askLines, M, y)
    y += askLines.length * 3.8 + 2

    // ── Claims ──
    const sorted = [...g.claims].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 26, bottom: 16 },
      head: [['#', 'Date of Service', 'Patient', 'Service Rendered', 'Clinician', 'SOA Ref / Date', 'AR Days', 'Amount (PHP)']],
      body: sorted.map((c, i) => [
        String(i + 1),
        T(shortDate(c.serviceDate)),
        T(c.patient),
        T(c.service),
        T(c.clinician),
        T([c.soaRef, shortDate(c.soaDate)].filter(Boolean).join('\n') || 'Not yet submitted'),
        c.arDays.toLocaleString('en-PH'),
        money(c.amount),
      ]),
      foot: [[{ content: 'TOTAL AMOUNT DUE', colSpan: 7, styles: { halign: 'right' } }, money(total)]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.8, textColor: C_INK, cellPadding: { top: 2, bottom: 2, left: 2.2, right: 2.2 }, lineColor: C_RULE, lineWidth: 0.15, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: C_TEAL, textColor: C_WHITE, fontStyle: 'bold', fontSize: 7.8, lineWidth: 0, valign: 'middle' },
      footStyles: { fillColor: C_TEAL_SOFT, textColor: C_TEAL, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: [248, 251, 250] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: C_GRAY },
        1: { cellWidth: 23 },
        2: { cellWidth: 36 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 34 },
        5: { cellWidth: 42 },
        6: { cellWidth: 15, halign: 'right' },
        7: { cellWidth: 25, halign: 'right' },
      },
      didDrawPage: (data: { pageNumber: number }) => {
        if (data.pageNumber > 1) { letterhead(s, true); title(ref, true); rule(21) }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 7

    // ── Payment details · prepared by ──
    const boxH = 30
    if (y + boxH > H - 16) {
      doc.addPage(); letterhead(s, true); title(ref, true); rule(21); y = 27
    }
    const boxW = (W - 2 * M - gap) / 2
    doc.setFillColor(...C_TEAL_SOFT); doc.roundedRect(M, y, boxW, boxH, 2, 2, 'F')
    label('PLEASE REMIT PAYMENT TO', M + 4, y + 6, C_TEAL)
    const kv = (k: string, v: string, yy: number, bx: number) => {
      doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(k, bx + 4, yy)
      doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.text(T(v) || '-', bx + 34, yy)
    }
    kv('Bank', s.bankName, y + 12, M)
    kv('Branch', s.bankBranch, y + 17, M)
    kv('Account name', s.bankAccountName, y + 22, M)
    kv('Account number', s.bankAccountNo, y + 27, M)

    const px = M + boxW + gap
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
      footers.push({ page: p, left: `${s.companyName}   |   ${s.tradeName}`, mid: `Collection Report - ${g.hmoName}   |   Ref ${ref}` })
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
