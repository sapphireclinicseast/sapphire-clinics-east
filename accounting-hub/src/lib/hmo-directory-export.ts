// HMO Directory downloads (Hannah 2026-11-11: "have a pdf and excel download button
// in hmo directory. for the PDF, make it aesthetic as well"; HMOs not yet accredited
// go on a separate page / sheet). The PDF wears the HMO collection report's look:
// SCEI letterhead, teal cards and tables, page X of Y. Pure drawing code: the caller
// loads jsPDF, autotable, the letterhead settings and the HMO logos.

import type { jsPDF as JsPDF } from 'jspdf'
import { pdfText, type CollectionBranchSettings } from './collection-report'
import {
  ACCREDITABLE_BRANCHES, MD_PAYMENT_LABEL, SOA_SUBMISSION_LABEL, missingInfo, moaDaysLeft, moaNeedsRenewal, moaStatusText,
  type MdPayment, type SoaSubmission,
} from './hmo-directory'

export type DirectoryExportEntry = {
  walletId: string
  hmoName: string
  notYetAccredited?: boolean
  accreditedBranches?: string[]
  accreditationName?: string | null; accreditationEmail?: string | null; accreditationNumber?: string | null
  submissionName?: string | null; submissionEmail?: string | null; submissionNumber?: string | null
  collectionName?: string | null; collectionEmail?: string | null; collectionNumber?: string | null
  soaSubmission?: SoaSubmission | null
  address?: string | null
  moaValidUntil?: string | null
  moaNoEndDate?: boolean
  moaFileUrls?: string[]
  priceListFileUrls?: unknown[]
  mdPayment?: MdPayment | null
  earlyDiscountPct?: number | null
  earlyDiscountDays?: number | null
  earlyDiscountNotes?: string | null
  loaApplicationUrl?: string | null
  serviceCategory?: string | null
}

export type PdfImage = { dataUri: string; w: number; h: number }

type Rgb = [number, number, number]
const C_TEAL: Rgb = [15, 118, 110]
const C_TEAL_SOFT: Rgb = [230, 244, 242]
const C_INK: Rgb = [31, 42, 40]
const C_GRAY: Rgb = [95, 107, 104]
const C_MUTED: Rgb = [150, 158, 155]
const C_RULE: Rgb = [213, 222, 217]
const C_WHITE: Rgb = [255, 255, 255]
const C_RED: Rgb = [185, 28, 28]
const C_AMBER: Rgb = [146, 64, 14]
const C_SLATE: Rgb = [92, 99, 97] // header of the not-yet-accredited page: present, not emphasised

const longDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const shortDate = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const t = (v?: string | null) => (v || '').trim()
const branchesOf = (e: DirectoryExportEntry) => ACCREDITABLE_BRANCHES.filter(b => (e.accreditedBranches || []).includes(b.value)).map(b => b.label)

/** Accredited HMOs first, alphabetically; the ones still applying separately. */
export function splitDirectory<E extends DirectoryExportEntry>(entries: E[]) {
  const byName = [...entries].sort((a, b) => a.hmoName.localeCompare(b.hmoName))
  return { accredited: byName.filter(e => !e.notYetAccredited), pending: byName.filter(e => e.notYetAccredited) }
}

const sameContact = (e: DirectoryExportEntry, key: 'submission' | 'collection') =>
  (['Name', 'Email', 'Number'] as const).some(f => t(e[`accreditation${f}`]))
  && (['Name', 'Email', 'Number'] as const).every(f => t(e[`${key}${f}`]) === t(e[`accreditation${f}`]))

export function moaText(e: DirectoryExportEntry): string {
  if (e.moaValidUntil) {
    const d = e.moaValidUntil.slice(0, 10)
    return moaNeedsRenewal(d) ? `${moaStatusText(moaDaysLeft(d))} (${shortDate(d)})` : `Valid until ${shortDate(d)}`
  }
  return e.moaNoEndDate ? 'No end date (until terminated)' : 'No MOA date on file'
}

export function discountText(e: DirectoryExportEntry): string {
  if (e.earlyDiscountPct == null && e.earlyDiscountDays == null) return e.earlyDiscountNotes ? 'See notes' : 'None'
  return [e.earlyDiscountPct != null && `${e.earlyDiscountPct}%`, e.earlyDiscountDays != null && `if paid within ${e.earlyDiscountDays} days`].filter(Boolean).join(' ')
}

// ── PDF ──────────────────────────────────────────────────────────────────────

type Part = { text: string; tone: 'name' | 'body' | 'link' | 'meta' | 'muted' | 'warn' | 'alert' }
type Rich = { parts: Part[]; logo?: PdfImage | null }

const FS = 7.6 // body font size (pt)
const LH = 3.25 // line height (mm) at FS
const LOGO_H = 8

const toneStyle: Record<Part['tone'], { color: Rgb; bold?: boolean; size?: number }> = {
  name: { color: C_INK, bold: true, size: 8 },
  body: { color: C_INK },
  link: { color: C_TEAL },
  meta: { color: C_GRAY, size: 7 },
  muted: { color: C_MUTED },
  warn: { color: C_AMBER, bold: true },
  alert: { color: C_RED, bold: true },
}

function contactParts(e: DirectoryExportEntry, key: 'accreditation' | 'submission' | 'collection'): Part[] {
  const parts: Part[] = []
  if (key !== 'accreditation' && sameContact(e, key)) parts.push({ text: 'Same as accreditation contact', tone: 'muted' })
  else {
    const name = t(e[`${key}Name`]), email = t(e[`${key}Email`]), number = t(e[`${key}Number`])
    if (!name && !email && !number) parts.push({ text: 'No contact yet', tone: 'muted' })
    if (name) parts.push({ text: name, tone: 'name' })
    if (email) parts.push({ text: email, tone: 'link' })
    if (number) parts.push({ text: number, tone: 'body' })
  }
  if (key === 'submission') {
    parts.push(e.soaSubmission
      ? { text: `SOAs by ${SOA_SUBMISSION_LABEL[e.soaSubmission].toLowerCase()}`, tone: 'meta' }
      : { text: 'How SOAs are sent: not set', tone: 'meta' })
  }
  return parts
}

function termsParts(e: DirectoryExportEntry): Part[] {
  const d = e.moaValidUntil?.slice(0, 10)
  const due = !!d && moaNeedsRenewal(d)
  return [
    { text: 'MOA', tone: 'meta' },
    { text: moaText(e), tone: due ? (moaDaysLeft(d!) < 0 ? 'alert' : 'warn') : e.moaValidUntil || e.moaNoEndDate ? 'body' : 'muted' },
    { text: 'Prompt payment discount', tone: 'meta' },
    { text: discountText(e), tone: e.earlyDiscountPct != null ? 'body' : 'muted' },
    { text: 'Medical doctors', tone: 'meta' },
    { text: e.mdPayment ? (e.mdPayment === 'CLINIC' ? 'Clinic is paid' : 'Doctor is paid separately') : 'Not set', tone: e.mdPayment ? 'body' : 'muted' },
  ]
}

/**
 * Draw the directory into a fresh landscape A4 jsPDF document. `autoTable` is
 * jspdf-autotable's default export; `logos` maps walletId to a PNG data URI.
 */
export function drawHmoDirectoryPdf(
  doc: JsPDF,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: JsPDF, opts: any) => void,
  { entries, generatedAt, letterhead: s, logo, logos }: {
    entries: DirectoryExportEntry[]; generatedAt: Date; letterhead: CollectionBranchSettings; logo?: PdfImage | null; logos: Map<string, PdfImage>
  },
): void {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const T = (v: string | null | undefined) => pdfText(v || '')
  const asOf = longDate(generatedAt)
  const { accredited, pending } = splitDirectory(entries)

  const letterhead = (compact: boolean) => {
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
      doc.text(T([s.tin && `TIN ${s.tin}`, s.email, s.phone].filter(Boolean).join('   |   ')), x, top + 18)
    }
    return compact ? top + lh + 3 : top + 24
  }
  const title = (compact: boolean, sub?: string) => {
    doc.setTextColor(...C_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(compact ? 11 : 18)
    doc.text('HMO DIRECTORY', W - M, compact ? 13 : 17, { align: 'right' })
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(compact ? 7.5 : 8.5)
    doc.text(T(sub || `As of ${asOf}`), W - M, compact ? 17.5 : 23, { align: 'right' })
  }
  const rule = (y: number, color: Rgb = C_TEAL) => { doc.setDrawColor(...color); doc.setLineWidth(0.7); doc.line(M, y, W - M, y) }
  const label = (text: string, x: number, y: number, color: Rgb = C_GRAY) => {
    doc.setTextColor(...color); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(text, x, y)
  }

  // One table: rich cells are drawn by hand so a contact's name can be bold and its email teal.
  const table = (rows: DirectoryExportEntry[], startY: number, head: Rgb, continuedTitle: string) => {
    const rich: Rich[][] = rows.map(e => {
      const branches = branchesOf(e)
      return [
        { parts: [] },
        {
          logo: logos.get(e.walletId) || null,
          parts: [
            { text: e.hmoName, tone: 'name' },
            { text: branches.length ? `Accredited: ${branches.join(' and ')}` : e.notYetAccredited ? 'Not yet accredited' : 'No branch set', tone: 'meta' },
          ],
        },
        { parts: contactParts(e, 'accreditation') },
        { parts: contactParts(e, 'submission') },
        { parts: contactParts(e, 'collection') },
        { parts: t(e.address) ? [{ text: t(e.address), tone: 'body' }] : [{ text: 'No address yet', tone: 'muted' }] },
        { parts: termsParts(e) },
      ]
    })
    const widths = [8, 44, 56, 40, 42, 40, 'auto'] as const
    const pad = { top: 2.4, bottom: 2.6, left: 2.2, right: 2.2 }

    // The plain text autotable measures for row height: one line per wrapped part.
    const measure = (r: Rich, width: number, col: number) => {
      const inner = width - pad.left - pad.right
      // The terms cell's small gaps before each heading add up to about one line.
      const lines: string[] = col === 6 ? [' '] : []
      for (const p of r.parts) {
        const st = toneStyle[p.tone]
        doc.setFont('helvetica', st.bold ? 'bold' : 'normal'); doc.setFontSize(st.size || FS)
        lines.push(...(doc.splitTextToSize(T(p.text), inner) as string[]))
      }
      return lines
    }

    autoTable(doc, {
      startY,
      margin: { left: M, right: M, top: 26, bottom: 16 },
      head: [['#', 'HMO', 'Accreditation contact', 'SOA submission contact', 'Collection contact', 'Address for courier', 'MOA and terms']],
      body: rows.map((_, ri) => rich[ri].map((r, ci) => (ci === 0 ? String(ri + 1) : ''))),
      theme: 'grid',
      // A row never splits across pages: an HMO's details stay together.
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: FS, textColor: C_INK, cellPadding: pad, lineColor: C_RULE, lineWidth: 0.15, valign: 'top', overflow: 'linebreak', minCellHeight: 12 },
      headStyles: { fillColor: head, textColor: C_WHITE, fontStyle: 'bold', fontSize: 7.8, lineWidth: 0, valign: 'middle' },
      alternateRowStyles: { fillColor: [248, 251, 250] },
      columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w, ...(i === 0 ? { halign: 'center', textColor: C_GRAY } : {}) }])),
      didParseCell: (data: { section: string; row: { index: number }; column: { index: number }; cell: { text: string[]; styles: { cellWidth: number | string; cellPadding: unknown; lineHeightFactor?: number }; width?: number } }) => {
        const r = data.section === 'body' && data.column.index > 0 ? rich[data.row.index]?.[data.column.index] : null
        if (!r) return
        const w = widths[data.column.index]
        // 'auto' resolves to whatever is left of the page width.
        const width = typeof w === 'number' ? w : W - 2 * M - widths.reduce<number>((a, x) => a + (typeof x === 'number' ? x : 0), 0)
        const lines = measure(r, width, data.column.index)
        // Reserve the measured height: blank lines at the body line height, plus room for the logo.
        data.cell.text = lines.map(() => ' ')
        data.cell.styles.lineHeightFactor = LH / (FS * 0.3528)
        if (r.logo) data.cell.styles.cellPadding = { ...pad, top: pad.top + LOGO_H + 1.6 }
      },
      didDrawCell: (data: { section: string; row: { index: number }; column: { index: number }; cell: { x: number; y: number; width: number } }) => {
        const r = data.section === 'body' && data.column.index > 0 ? rich[data.row.index]?.[data.column.index] : null
        if (!r) return
        const { x, width } = data.cell
        let y = data.cell.y + pad.top
        if (r.logo) {
          const maxW = Math.min(width - pad.left - pad.right, 38)
          let lw = (r.logo.w / r.logo.h) * LOGO_H, lh = LOGO_H
          if (lw > maxW) { lh = lh * (maxW / lw); lw = maxW }
          doc.addImage(r.logo.dataUri, 'PNG', x + pad.left, y + (LOGO_H - lh) / 2, lw, lh)
          y += LOGO_H + 1.6
        }
        const inner = width - pad.left - pad.right
        r.parts.forEach((p, i) => {
          const st = toneStyle[p.tone]
          // A small gap before each "meta" heading inside the terms cell.
          if (p.tone === 'meta' && i > 0 && data.column.index === 6) y += 0.8
          doc.setFont('helvetica', st.bold ? 'bold' : 'normal'); doc.setFontSize(st.size || FS); doc.setTextColor(...st.color)
          for (const line of doc.splitTextToSize(T(p.text), inner) as string[]) {
            y += LH
            doc.text(line, x + pad.left, y - 0.85)
          }
        })
      },
      didDrawPage: (data: { pageNumber: number }) => {
        if (data.pageNumber > 1) { letterhead(true); title(true, continuedTitle); rule(21, head) }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (doc as any).lastAutoTable.finalY as number
  }

  // ── Page 1: letterhead, cards, accredited HMOs ──
  let y = letterhead(false)
  title(false)
  rule(y + 2); y += 7

  const gap = 4
  const cardW = (W - 2 * M - 2 * gap) / 3
  const cardH = 25
  const box = (x: number, fill: Rgb, border: boolean) => {
    doc.setFillColor(...fill)
    if (border) { doc.setDrawColor(...C_RULE); doc.setLineWidth(0.3); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD') }
    else doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
  }
  let x = M
  box(x, C_WHITE, true)
  label('HMO PARTNERS', x + 4, y + 5.5)
  doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(`${accredited.length} accredited`, x + 4, y + 14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_GRAY)
  doc.text(pending.length ? `${pending.length} not yet accredited, listed on a separate page` : 'Every HMO listed is accredited', x + 4, y + 20)

  x += cardW + gap
  box(x, C_TEAL_SOFT, false)
  label('SUMMARY', x + 4, y + 5.5, C_TEAL)
  const count = (b: string) => accredited.filter(e => (e.accreditedBranches || []).includes(b)).length
  ;([
    ['Accredited at East', String(count('SANDBOX_EAST'))],
    ['Accredited at Greenhills', String(count('SANDBOX_GREENHILLS'))],
    ['With a prompt payment discount', String(accredited.filter(e => e.earlyDiscountPct != null).length)],
  ] as const).forEach(([k, v], i) => {
    const yy = y + 11.5 + i * 5
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(k, x + 4, yy)
    doc.setTextColor(...C_INK); doc.setFont('helvetica', 'bold'); doc.text(v, x + cardW - 4, yy, { align: 'right' })
  })

  x += cardW + gap
  const due = accredited.filter(e => moaNeedsRenewal(e.moaValidUntil?.slice(0, 10)))
  box(x, C_TEAL, false)
  label('MOA RENEWALS DUE', x + 4, y + 5.5, C_WHITE)
  doc.setTextColor(...C_WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text(String(due.length), x + cardW - 4, y + 16, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(T(due.length ? due.map(e => e.hmoName).join(', ') : 'None lapsed or due within 30 days'), x + cardW - 4, y + 21.5, { align: 'right', maxWidth: cardW - 8 })
  y += cardH + 6

  doc.setTextColor(...C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  const intro = doc.splitTextToSize('Who to reach at each HMO we are accredited with, where to courier SOAs and documents, and the main terms of our MOA, as recorded in the Accounting Hub.', W - 2 * M) as string[]
  doc.text(intro, M, y)
  y += intro.length * 3.8 + 2

  if (accredited.length) table(accredited, y, C_TEAL, `Accredited HMOs   |   As of ${asOf}`)

  // ── Separate page: HMOs still applying ──
  if (pending.length) {
    doc.addPage()
    let py = letterhead(false)
    title(false, `Not yet accredited   |   As of ${asOf}`)
    rule(py + 2, C_SLATE); py += 8
    doc.setTextColor(...C_SLATE); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(`NOT YET ACCREDITED (${pending.length})`, M, py)
    py += 5
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text('HMOs we are still applying to or following up with. Their contacts are kept here for the accreditation.', M, py)
    py += 5
    table(pending, py, C_SLATE, `Not yet accredited   |   As of ${asOf}`)
  }

  // ── Footers: page X of Y ──
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...C_RULE); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11)
    doc.setTextColor(...C_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(T(`${s.companyName}   |   ${s.tradeName}`), M, H - 7)
    doc.text(T(`HMO Directory   |   As of ${asOf}`), W / 2, H - 7, { align: 'center' })
    doc.text(`Page ${p} of ${total}`, W - M, H - 7, { align: 'right' })
  }
}

// ── Excel ────────────────────────────────────────────────────────────────────

export const DIRECTORY_SHEET_COLUMNS: { head: string; width: number; cell: (e: DirectoryExportEntry) => string | number | null }[] = [
  { head: 'HMO', width: 22, cell: e => e.hmoName },
  { head: 'Accredited branches', width: 20, cell: e => branchesOf(e).join(', ') },
  { head: 'Accreditation contact', width: 34, cell: e => t(e.accreditationName) },
  { head: 'Accreditation email', width: 30, cell: e => t(e.accreditationEmail) },
  { head: 'Accreditation number', width: 24, cell: e => t(e.accreditationNumber) },
  { head: 'SOA submission contact', width: 34, cell: e => t(e.submissionName) },
  { head: 'SOA submission email', width: 30, cell: e => t(e.submissionEmail) },
  { head: 'SOA submission number', width: 24, cell: e => t(e.submissionNumber) },
  { head: 'SOAs sent by', width: 16, cell: e => (e.soaSubmission ? SOA_SUBMISSION_LABEL[e.soaSubmission] : '') },
  { head: 'Collection contact', width: 34, cell: e => t(e.collectionName) },
  { head: 'Collection email', width: 30, cell: e => t(e.collectionEmail) },
  { head: 'Collection number', width: 24, cell: e => t(e.collectionNumber) },
  { head: 'Address for courier', width: 48, cell: e => t(e.address).replace(/\n+/g, ', ') },
  { head: 'MOA', width: 28, cell: e => moaText(e) },
  { head: 'Prompt payment discount %', width: 14, cell: e => e.earlyDiscountPct ?? null },
  { head: 'Discount if paid within (days)', width: 14, cell: e => e.earlyDiscountDays ?? null },
  { head: 'Discount and payment terms', width: 60, cell: e => t(e.earlyDiscountNotes) },
  { head: 'Medical doctors', width: 30, cell: e => (e.mdPayment ? MD_PAYMENT_LABEL[e.mdPayment] : '') },
  { head: 'LOA application link', width: 30, cell: e => t(e.loaApplicationUrl) },
  { head: 'Category in Services', width: 18, cell: e => t(e.serviceCategory) },
  { head: 'Missing info', width: 40, cell: e => missingInfo(e).join(', ') },
]

/** Rows for one sheet: header first. */
export function directorySheetRows(entries: DirectoryExportEntry[]): (string | number | null)[][] {
  return [DIRECTORY_SHEET_COLUMNS.map(c => c.head), ...entries.map(e => DIRECTORY_SHEET_COLUMNS.map(c => c.cell(e)))]
}
