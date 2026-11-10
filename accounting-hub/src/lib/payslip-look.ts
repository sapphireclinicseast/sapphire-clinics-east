import type { jsPDF as JsPDF } from 'jspdf'
import { SCEI_LOGO_DATA_URI, SCEI_LOGO_W, SCEI_LOGO_H } from './scei-logo'
import { BRANCH_INFO } from './branch-info'
import { pdfText } from './collection-report'

// The payslip look (Hannah 2026-11-10: "revise the payslips to look like the
// collection report — keep the SCEI logo, portrait"). Same palette, letterhead,
// cards, teal tables and page footer as lib/collection-report.ts, on portrait A4.
// Shared by the employee and consultant payslips, in the hub and on the
// server route the staff portal downloads from, so every copy looks the same.
// Isomorphic: no browser-only globals.

export type Rgb = [number, number, number]
export const PS_TEAL: Rgb = [15, 118, 110]
export const PS_TEAL_SOFT: Rgb = [230, 244, 242]
export const PS_INK: Rgb = [31, 42, 40]
export const PS_GRAY: Rgb = [95, 107, 104]
export const PS_RULE: Rgb = [213, 222, 217]
export const PS_WHITE: Rgb = [255, 255, 255]
export const PS_RED: Rgb = [185, 28, 28]
export const PS_GREEN: Rgb = [22, 101, 52]
export const PS_AMBER: Rgb = [161, 98, 7]
export const PS_ZEBRA: Rgb = [248, 251, 250]
export const PS_WEEKEND: Rgb = [238, 241, 240]

export const PS_M = 14 // page margin, mm
export const PS_CONTENT_TOP = 27 // first content line on a continuation page

export const T = (s: string | null | undefined) => pdfText(s || '')
export const money = (n: number) => (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const peso = (n: number) => `PHP ${money(n)}`
export const longDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

export interface PayslipCompany {
  companyName: string
  tradeName: string
  address: string
  contactLines: string[]
}

// Official branch details (same as the collection report's), plus the TIN from branch-info.
export function payslipCompany(branch?: string | null): PayslipCompany {
  const b = branch || ''
  const companyName = 'Sapphire Clinics East Incorporated'
  if (b === 'SBEA' || b === 'SANDBOX_EAST') {
    return {
      companyName,
      tradeName: 'Aura Health Rehab – East',
      address: 'Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig',
      contactLines: ['east@sapphireclinicseast.org   |   +63 917 118 9289 · (02) 5310-4991', BRANCH_INFO.SBEA.tin].filter(Boolean),
    }
  }
  if (b === 'SBGH' || b === 'SANDBOX_GREENHILLS') {
    return {
      companyName,
      tradeName: 'Aura Health Rehab – Greenhills',
      address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
      contactLines: ['greenhills@sapphireclinicseast.org   |   +63 917 770 1686 · (02) 8529-1590', BRANCH_INFO.SBGH.tin].filter(Boolean),
    }
  }
  const info = BRANCH_INFO[b] || BRANCH_INFO['']
  return {
    companyName,
    tradeName: b === 'VERDANA' || b === 'VERDANA_STORE' ? 'Verdana Store' : '',
    address: info.address,
    contactLines: [info.phone, info.tin].filter(Boolean),
  }
}

export function newPayslipDoc(jsPDF: typeof JsPDF): JsPDF {
  // compress: without it the embedded logo makes every payslip several hundred KB
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
}

/**
 * Letterhead + title block + teal rule. Full on page 1, compact on later pages.
 * Returns the y where content starts.
 */
export function drawPayslipHeader(
  doc: JsPDF,
  co: PayslipCompany,
  { compact, title, period, issued }: { compact: boolean; title: string; period: string; issued?: Date },
): number {
  const W = doc.internal.pageSize.getWidth()
  const M = PS_M
  const rightW = 46
  if (compact) {
    const top = 8
    const lh = 9
    const lw = (SCEI_LOGO_W / SCEI_LOGO_H) * lh
    doc.addImage(SCEI_LOGO_DATA_URI, 'PNG', M, top, lw, lh)
    const x = M + lw + 3
    doc.setTextColor(...PS_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(T(co.companyName), x, top + 4)
    doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    if (co.tradeName) doc.text(T(co.tradeName), x, top + 8)
    doc.setTextColor(...PS_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(T(title), W - M, 13, { align: 'right' })
    doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text((doc.splitTextToSize(T(period), rightW) as string[])[0], W - M, 17.5, { align: 'right' })
    doc.setDrawColor(...PS_TEAL); doc.setLineWidth(0.7); doc.line(M, 21, W - M, 21)
    return PS_CONTENT_TOP
  }

  const top = 10
  const lh = 16
  const lw = (SCEI_LOGO_W / SCEI_LOGO_H) * lh
  doc.addImage(SCEI_LOGO_DATA_URI, 'PNG', M, top, lw, lh)
  const x = M + lw + 4
  const maxW = W - M - x - rightW - 4
  doc.setTextColor(...PS_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(T(co.companyName), x, top + 5)
  doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  if (co.tradeName) doc.text(T(co.tradeName), x, top + 10)
  doc.setFontSize(7.5)
  const lines = [
    ...(doc.splitTextToSize(T(co.address), maxW) as string[]),
    ...co.contactLines.flatMap(l => doc.splitTextToSize(T(l), maxW) as string[]),
  ]
  let ly = top + 14
  for (const l of lines) { doc.text(l, x, ly); ly += 3.5 }

  doc.setTextColor(...PS_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text(T(title), W - M, top + 7.5, { align: 'right' })
  doc.setTextColor(...PS_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  const pLines = (doc.splitTextToSize(T(period), rightW) as string[]).slice(0, 3)
  let ry = top + 13.5
  for (const l of pLines) { doc.text(l, W - M, ry, { align: 'right' }); ry += 3.8 }
  if (issued) {
    doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(T(`Issued ${longDate(issued)}`), W - M, ry + 0.2, { align: 'right' })
    ry += 3.8
  }
  const bottom = Math.max(top + lh, ly - 3.5, ry - 3.8) + 3
  doc.setDrawColor(...PS_TEAL); doc.setLineWidth(0.7); doc.line(M, bottom, W - M, bottom)
  return bottom + 6
}

export interface PayslipCards {
  who: { label: string; name: string; lines: string[] }
  period: { label: string; rows?: [string, string][]; text?: string }
  net: { label: string; value: number; sub: string }
}

/** Three cards across: who · pay period · net pay. Returns the y below them. */
export function drawPayslipCards(doc: JsPDF, y: number, cards: PayslipCards): number {
  const W = doc.internal.pageSize.getWidth()
  const M = PS_M
  const gap = 4
  const cardW = (W - 2 * M - 2 * gap) / 3
  const cardH = 27
  const label = (text: string, x: number, yy: number, color: Rgb = PS_GRAY) => {
    doc.setTextColor(...color); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(T(text), x, yy)
  }

  // who
  let x = M
  doc.setFillColor(...PS_WHITE); doc.setDrawColor(...PS_RULE); doc.setLineWidth(0.3)
  doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')
  label(cards.who.label, x + 4, y + 5.5)
  doc.setTextColor(...PS_INK); doc.setFont('helvetica', 'bold')
  let size = 11.5
  doc.setFontSize(size)
  while (size > 8.5 && doc.getTextWidth(T(cards.who.name)) > cardW - 8) { size -= 0.5; doc.setFontSize(size) }
  const nameLines = (doc.splitTextToSize(T(cards.who.name), cardW - 8) as string[]).slice(0, 2)
  doc.text(nameLines, x + 4, y + 11.5)
  let wy = y + 11.5 + nameLines.length * (size * 0.42) + 1.2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PS_GRAY)
  for (const l of cards.who.lines.filter(Boolean)) {
    if (wy > y + cardH - 2) break
    doc.text((doc.splitTextToSize(T(l), cardW - 8) as string[])[0], x + 4, wy)
    wy += 3.6
  }

  // pay period
  x += cardW + gap
  doc.setFillColor(...PS_TEAL_SOFT); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
  label(cards.period.label, x + 4, y + 5.5, PS_TEAL)
  if (cards.period.rows) {
    cards.period.rows.slice(0, 3).forEach(([k, v], i) => {
      const yy = y + 12 + i * 5
      doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(T(k), x + 4, yy)
      doc.setTextColor(...PS_INK); doc.setFont('helvetica', 'bold')
      const kw = doc.getTextWidth(T(k))
      const vLine = (doc.splitTextToSize(T(v), cardW - 10 - kw) as string[])[0]
      doc.text(vLine, x + cardW - 4, yy, { align: 'right' })
    })
  } else if (cards.period.text) {
    doc.setTextColor(...PS_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text((doc.splitTextToSize(T(cards.period.text), cardW - 8) as string[]).slice(0, 4), x + 4, y + 12)
  }

  // net pay
  x += cardW + gap
  doc.setFillColor(...PS_TEAL); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
  label(cards.net.label, x + 4, y + 5.5, PS_WHITE)
  doc.setTextColor(...PS_WHITE); doc.setFont('helvetica', 'bold')
  const value = peso(cards.net.value)
  size = 18
  doc.setFontSize(size)
  while (size > 11 && doc.getTextWidth(value) > cardW - 8) { size -= 0.5; doc.setFontSize(size) }
  doc.text(value, x + cardW - 4, y + 17, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(T(cards.net.sub), x + cardW - 4, y + 22.5, { align: 'right' })
  return y + cardH + 7
}

/** Small teal caps heading above a table. Returns the y for the table. */
export function sectionLabel(doc: JsPDF, text: string, y: number, note?: string, x = PS_M): number {
  doc.setTextColor(...PS_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(T(text), x, y)
  if (note) {
    const w = doc.getTextWidth(T(text))
    doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(T(note), x + w + 3, y)
  }
  return y + 2
}

/** jspdf-autotable options shared by every payslip table. */
export function payslipTable() {
  return {
    theme: 'grid' as const,
    styles: { font: 'helvetica', fontSize: 8.3, textColor: PS_INK, cellPadding: { top: 2, bottom: 2, left: 2.4, right: 2.4 }, lineColor: PS_RULE, lineWidth: 0.15, valign: 'middle' as const, overflow: 'linebreak' as const },
    headStyles: { fillColor: PS_TEAL, textColor: PS_WHITE, fontStyle: 'bold' as const, fontSize: 8, lineWidth: 0 },
    footStyles: { fillColor: PS_TEAL_SOFT, textColor: PS_TEAL, fontStyle: 'bold' as const, fontSize: 8.6, lineWidth: 0 },
    alternateRowStyles: { fillColor: PS_ZEBRA },
    showFoot: 'lastPage' as const,
    showHead: 'everyPage' as const,
  }
}

/** Rounded bordered notes box. Returns the y below it. */
export function drawNotesBox(doc: JsPDF, x: number, y: number, w: number, lines: string[], minH = 0): number {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const wrapped = lines.flatMap(l => doc.splitTextToSize(T(l), w - 8) as string[])
  const h = Math.max(minH, 10 + wrapped.length * 4)
  doc.setDrawColor(...PS_RULE); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, h, 2, 2, 'S')
  doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('NOTES', x + 4, y + 5.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  wrapped.forEach((l, i) => doc.text(l, x + 4, y + 10.5 + i * 4))
  return y + h
}

/** Footer rule, company on the left, "who · period · page X of Y" on the right, on every page. */
export function drawPayslipFooters(doc: JsPDF, left: string, right: string): void {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...PS_RULE); doc.setLineWidth(0.3); doc.line(PS_M, H - 11, W - PS_M, H - 11)
    doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(T(left), PS_M, H - 7)
    doc.text(T(`${right}   |   Page ${p} of ${total}`), W - PS_M, H - 7, { align: 'right' })
  }
}

/** Space left on the current page above the footer. */
export const roomLeft = (doc: JsPDF, y: number) => doc.internal.pageSize.getHeight() - 16 - y
