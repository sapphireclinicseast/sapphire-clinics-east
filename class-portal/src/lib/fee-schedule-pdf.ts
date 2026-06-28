// Schedule of Fees generator. Companion to registration-letter-pdf.ts.
// Shows the per-student annualized breakdown plus the payment plan
// options (Annual / Bi-annual / Monthly) so the parent (and their
// employer) can see how each tranche maps to the total.
//
// Uses the same brand palette as the registration letter for visual
// continuity:
//   #244952 TEAL  · #4a8073 SAGE · #c69849 AMBER
//   #cf9d88 ROSE  · #edf3d9 CREAM

import { jsPDF } from 'jspdf'
import { AURA_LOGO_DATA_URL } from './aura-logo'
import { HANNAH_SIGNATURE_DATA_URL } from './aura-signature'
import { levelLabel, type EnrollmentLevel } from './session'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2

const TEAL: [number, number, number]   = [36, 73, 82]
const SAGE: [number, number, number]   = [74, 128, 115]
const AMBER: [number, number, number]  = [198, 152, 73]
const ROSE: [number, number, number]   = [207, 157, 136]
const CREAM: [number, number, number]  = [237, 243, 217]
const INK: [number, number, number]    = [15, 23, 42]

function setText(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]) }
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]) }
function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]) }

function fmtPHP(centavos: number): string {
  return (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
}

export interface FeeScheduleInput {
  studentFullName: string
  branch: 'EAST' | 'GREENHILLS' | null
  level: EnrollmentLevel | null
  schoolYear: string
  annualTuitionCentavos: number
  annualMiscCentavos: number
  annualTotalCentavos: number
  issuedAt: Date
  issuedBy: string
  /** Optional reference number — when generated as a companion to a
   *  registration letter, the two share the same number. */
  referenceNumber?: string
}

function branchFull(b: 'EAST' | 'GREENHILLS' | null): string {
  if (b === 'EAST') return 'East Campus'
  if (b === 'GREENHILLS') return 'Greenhills Campus'
  return ''
}

export function generateFeeSchedulePdf(input: FeeScheduleInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Top stripe
  setFill(doc, SAGE)
  doc.rect(0, 0, PAGE_W, 4, 'F')

  // Logo
  const LOGO_W = 56
  const LOGO_H = LOGO_W / 1.77
  try {
    doc.addImage(AURA_LOGO_DATA_URL, 'PNG', (PAGE_W - LOGO_W) / 2, 14, LOGO_W, LOGO_H, undefined, 'FAST')
  } catch { /* tolerate */ }

  let y = 14 + LOGO_H + 5

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setText(doc, TEAL)
  doc.text('AURA ACADEMY FOR LEARNING', PAGE_W / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setText(doc, INK)
  doc.text('Special Education Program · Sapphire Clinics East Inc.', PAGE_W / 2, y, { align: 'center' })
  y += 8

  setDraw(doc, SAGE); doc.setLineWidth(0.6)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 10

  // Title block
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); setText(doc, TEAL)
  doc.text('SCHEDULE OF FEES', PAGE_W / 2, y, { align: 'center' })
  y += 7
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setText(doc, INK)
  const branchText = branchFull(input.branch)
  const levelText = input.level ? levelLabel(input.level) : '—'
  doc.text(`School Year ${input.schoolYear}  ·  ${branchText}  ·  ${levelText}`, PAGE_W / 2, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); setText(doc, [80, 80, 80])
  doc.text(`Prepared for ${input.studentFullName}`, PAGE_W / 2, y, { align: 'center' })
  y += 10

  // Reference + Date strip
  if (input.referenceNumber) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); setText(doc, TEAL)
    doc.text('Reference No.', MARGIN, y)
    doc.setFont('helvetica', 'normal'); setText(doc, INK)
    doc.text(input.referenceNumber, MARGIN + 27, y)
  }
  doc.setFont('helvetica', 'bold'); setText(doc, TEAL)
  doc.text('Date', PAGE_W - MARGIN - 50, y)
  doc.setFont('helvetica', 'normal'); setText(doc, INK)
  doc.text(fmtDate(input.issuedAt), PAGE_W - MARGIN - 38, y)
  y += 10

  // ── Annual Breakdown ─────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(doc, TEAL)
  doc.text('I. Annual Fees', MARGIN, y)
  y += 5

  const TABLE_X = MARGIN
  const TABLE_W = CONTENT_W
  const ROW_H = 8

  // Cream watermark
  setFill(doc, CREAM)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H * 3 + 4, 'F')

  // Header
  setFill(doc, TEAL)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setText(doc, [255, 255, 255])
  doc.text('Item', TABLE_X + 4, y + 3.5)
  doc.text('Amount (PHP)', TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); setText(doc, INK)
  doc.text('Tuition Fee', TABLE_X + 4, y + 3.5)
  doc.text(fmtPHP(input.annualTuitionCentavos), TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H
  doc.text('Miscellaneous Fee', TABLE_X + 4, y + 3.5)
  doc.text(fmtPHP(input.annualMiscCentavos), TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H

  // Total
  setFill(doc, AMBER)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H, 'F')
  doc.setFont('helvetica', 'bold'); setText(doc, [255, 255, 255])
  doc.text('TOTAL ANNUAL FEES', TABLE_X + 4, y + 3.5)
  // ₱ (U+20B1) isn't in jsPDF's default helvetica glyph set — renders
  // as "±" with wonky kerning. Use "PHP " in body text; the table
  // header "(PHP)" stays since plain ASCII renders fine.
  doc.text(fmtPHP(input.annualTotalCentavos), TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H + 10

  // ── Payment Plan Options ────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(doc, TEAL)
  doc.text('II. Payment Plan Options', MARGIN, y)
  y += 5

  // 4-column layout: Plan | Per Installment | Number of Payments | Annual Total
  const cols = [
    { w: 44, label: 'Plan' },
    { w: 50, label: 'Per Installment (PHP)' },
    { w: 50, label: 'Number of Payments' },
    { w: 30, label: 'Annual Total (PHP)' },
  ]
  // Recompute widths so they sum to TABLE_W
  const sumW = cols.reduce((s, c) => s + c.w, 0)
  const scale = TABLE_W / sumW
  cols.forEach(c => { c.w = c.w * scale })

  setFill(doc, TEAL)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); setText(doc, [255, 255, 255])
  let cx = TABLE_X
  for (let i = 0; i < cols.length; i += 1) {
    const align: 'left' | 'right' = i === 0 ? 'left' : 'right'
    const tx = align === 'right' ? cx + cols[i].w - 3 : cx + 3
    doc.text(cols[i].label, tx, y + 3.5, { align })
    cx += cols[i].w
  }
  y += ROW_H

  const total = input.annualTotalCentavos
  const monthlyPerInst = Math.round(total / 10) // 10 installments Jun–Mar
  const biannualPerInst = Math.round(total / 2)
  const planRows: Array<[string, number, string]> = [
    ['Annual (lump sum)',     total,           '1 (due June 5)'],
    ['Bi-annual',             biannualPerInst, '2 (June 5, Dec 5)'],
    ['Monthly',               monthlyPerInst,  '10 (every 5th, Jun–Mar)'],
  ]
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setText(doc, INK)
  for (let i = 0; i < planRows.length; i += 1) {
    // Soft alternating cream band for readability
    if (i % 2 === 0) {
      setFill(doc, CREAM)
      doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H, 'F')
    }
    const [name, per, count] = planRows[i]
    cx = TABLE_X
    doc.text(name, cx + 3, y + 3.5)
    cx += cols[0].w
    doc.text(fmtPHP(per), cx + cols[1].w - 3, y + 3.5, { align: 'right' })
    cx += cols[1].w
    doc.text(count, cx + cols[2].w - 3, y + 3.5, { align: 'right' })
    cx += cols[2].w
    doc.text(fmtPHP(total), cx + cols[3].w - 3, y + 3.5, { align: 'right' })
    y += ROW_H
  }
  y += 6

  // ── Footnote ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); setText(doc, [80, 80, 80])
  const note = 'The Miscellaneous Fee of PHP 5,000.00 covers school ID, learning materials, records management, and related administrative costs. The Tuition Fee is reserved exclusively for instructional services. This schedule reflects the fees as recorded on the student’s account at the time of issuance.'
  const noteLines = doc.splitTextToSize(note, CONTENT_W)
  doc.text(noteLines, MARGIN, y)
  // 32mm breathing room so the 28mm e-signature image fits cleanly
  // above the signature line without colliding with the footnote.
  y += noteLines.length * 4.5 + 32

  // ── Signatory (with e-signature overlapping the line) ───────────
  const SIG_SIZE = 28
  try {
    doc.addImage(HANNAH_SIGNATURE_DATA_URL, 'PNG', MARGIN + 4, y - SIG_SIZE + 6, SIG_SIZE, SIG_SIZE, undefined, 'FAST')
  } catch { /* tolerate — typed name still identifies the signatory */ }

  setDraw(doc, INK); doc.setLineWidth(0.3)
  doc.line(MARGIN, y, MARGIN + 70, y)
  y += 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(doc, TEAL)
  doc.text('HANNAH JARA', MARGIN, y)
  y += 4.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setText(doc, INK)
  doc.text('CEO and President', MARGIN, y)
  y += 4
  doc.text('Aura Academy for Learning', MARGIN, y)

  // Footer
  setDraw(doc, ROSE); doc.setLineWidth(0.4)
  doc.line(MARGIN, PAGE_H - 18, PAGE_W - MARGIN, PAGE_H - 18)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); setText(doc, ROSE)
  doc.text('Sapphire Clinics East Inc. · Aura Academy for Learning · Special Education Program', PAGE_W / 2, PAGE_H - 13, { align: 'center' })
  doc.setFont('helvetica', 'normal'); setText(doc, [120, 120, 120]); doc.setFontSize(7)
  doc.text(`Issued via class.sapphireclinicseast.org by ${input.issuedBy}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })

  setFill(doc, TEAL)
  doc.rect(0, PAGE_H - 3, PAGE_W, 3, 'F')

  return doc
}

export function downloadFeeSchedulePdf(input: FeeScheduleInput): void {
  const doc = generateFeeSchedulePdf(input)
  const safeName = input.studentFullName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
  const suffix = input.referenceNumber ? `_${input.referenceNumber}` : ''
  doc.save(`Fee_Schedule_${safeName}${suffix}.pdf`)
}

export function openFeeSchedulePdf(input: FeeScheduleInput): void {
  const doc = generateFeeSchedulePdf(input)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
