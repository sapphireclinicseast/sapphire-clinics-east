// School registration letter generator. Produces a one-page A4 PDF
// for the student, signed by HANNAH JARA (CEO and President) across
// both branches. Designed for parents to submit to employers /
// HMOs for reimbursement.
//
// Brand palette:
//   #244952 deep teal   — headings, body emphasis, signatory block
//   #4a8073 sage green  — horizontal rules + accent stripe
//   #c69849 amber       — TOTAL emphasis in the breakdown
//   #cf9d88 rose        — footer text
//   #edf3d9 cream       — soft watermark behind the breakdown table

import { jsPDF } from 'jspdf'
import { AURA_LOGO_DATA_URL } from './aura-logo'
import { levelLabel, type EnrollmentLevel } from './session'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2

const TEAL: [number, number, number]   = [36, 73, 82]    // #244952
const SAGE: [number, number, number]   = [74, 128, 115]  // #4a8073
const AMBER: [number, number, number]  = [198, 152, 73]  // #c69849
const ROSE: [number, number, number]   = [207, 157, 136] // #cf9d88
const CREAM: [number, number, number]  = [237, 243, 217] // #edf3d9
const INK: [number, number, number]    = [15, 23, 42]    // body text

function setText(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]) }
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]) }
function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]) }

function fmtPHP(centavos: number): string {
  return (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
}

// Convert centavos to a human-readable peso amount in words. Limited to
// values under 100 million (we'll never see anything close). Used in the
// formal certification line: "Seventy-Three Thousand Pesos Only".
function pesosInWords(centavos: number): string {
  const pesos = Math.floor(centavos / 100)
  if (pesos === 0) return 'Zero Pesos'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function under1000(n: number): string {
    let out = ''
    const h = Math.floor(n / 100)
    const t = n % 100
    if (h) out += `${ones[h]} Hundred`
    if (t) {
      if (out) out += ' '
      if (t < 20) out += ones[t]
      else {
        out += tens[Math.floor(t / 10)]
        if (t % 10) out += `-${ones[t % 10]}`
      }
    }
    return out
  }
  const millions = Math.floor(pesos / 1_000_000)
  const thousands = Math.floor((pesos % 1_000_000) / 1000)
  const remainder = pesos % 1000
  const parts: string[] = []
  if (millions) parts.push(`${under1000(millions)} Million`)
  if (thousands) parts.push(`${under1000(thousands)} Thousand`)
  if (remainder) parts.push(under1000(remainder))
  return parts.join(' ') + ' Pesos'
}

export interface RegistrationLetterInput {
  /** AURA-REG-YYYY-NNNN */
  referenceNumber: string
  studentFullName: string
  studentEmail: string
  branch: 'EAST' | 'GREENHILLS' | null
  level: EnrollmentLevel | null
  schoolYear: string                // e.g. "2026-2027"
  annualTuitionCentavos: number
  annualMiscCentavos: number
  annualTotalCentavos: number
  issuedAt: Date
  /** email of staff who pressed the button — appended discreetly in the footer */
  issuedBy: string
}

function branchFull(b: 'EAST' | 'GREENHILLS' | null): string {
  if (b === 'EAST') return 'East Campus'
  if (b === 'GREENHILLS') return 'Greenhills Campus'
  return ''
}

export function generateRegistrationLetterPdf(input: RegistrationLetterInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Top accent stripe (sage) ────────────────────────────────────
  setFill(doc, SAGE)
  doc.rect(0, 0, PAGE_W, 4, 'F')

  // ── Logo (centered) ─────────────────────────────────────────────
  // green.png aspect ratio ~ 3582 / 2025 = 1.77. Drawn at 56mm wide.
  const LOGO_W = 56
  const LOGO_H = LOGO_W / 1.77
  try {
    doc.addImage(AURA_LOGO_DATA_URL, 'PNG', (PAGE_W - LOGO_W) / 2, 14, LOGO_W, LOGO_H, undefined, 'FAST')
  } catch { /* tolerate broken logo; the letter still renders */ }

  let y = 14 + LOGO_H + 5

  // ── Organisation block under the logo ───────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setText(doc, TEAL)
  doc.text('AURA ACADEMY FOR LEARNING', PAGE_W / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  setText(doc, INK)
  doc.text('Special Education Program · Sapphire Clinics East Inc.', PAGE_W / 2, y, { align: 'center' })
  y += 8

  // Sage rule
  setDraw(doc, SAGE)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 10

  // ── Reference + Date row ────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  setText(doc, TEAL)
  doc.text('Reference No.', MARGIN, y)
  doc.setFont('helvetica', 'normal')
  setText(doc, INK)
  doc.text(input.referenceNumber, MARGIN + 27, y)

  doc.setFont('helvetica', 'bold')
  setText(doc, TEAL)
  doc.text('Date', PAGE_W - MARGIN - 50, y)
  doc.setFont('helvetica', 'normal')
  setText(doc, INK)
  doc.text(fmtDate(input.issuedAt), PAGE_W - MARGIN - 38, y)
  y += 12

  // ── Salutation ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(doc, TEAL)
  doc.text('TO WHOM IT MAY CONCERN:', MARGIN, y)
  y += 10

  // ── Body ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  setText(doc, INK)
  const branchText = branchFull(input.branch)
  const levelText = input.level ? levelLabel(input.level) : '—'
  const bodyLine1 = `This is to certify that ${input.studentFullName} is duly enrolled at Aura Academy for Learning${branchText ? ' – ' + branchText : ''} for School Year ${input.schoolYear}, under the ${levelText} program.`
  const lines1 = doc.splitTextToSize(bodyLine1, CONTENT_W)
  doc.text(lines1, MARGIN, y)
  y += lines1.length * 5 + 4

  const totalWords = pesosInWords(input.annualTotalCentavos)
  const bodyLine2 = `The corresponding total annual school fees for the said school year amount to ${totalWords} Only (₱${fmtPHP(input.annualTotalCentavos)}), broken down as follows:`
  const lines2 = doc.splitTextToSize(bodyLine2, CONTENT_W)
  doc.text(lines2, MARGIN, y)
  y += lines2.length * 5 + 6

  // ── Breakdown table with cream watermark ────────────────────────
  const TABLE_X = MARGIN + 20
  const TABLE_W = CONTENT_W - 40
  const ROW_H = 8
  setFill(doc, CREAM)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H * 3 + 4, 'F')

  // Header row
  setFill(doc, TEAL)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setText(doc, [255, 255, 255])
  doc.text('Item', TABLE_X + 4, y + 3.5)
  doc.text('Amount (PHP)', TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H

  // Tuition row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  setText(doc, INK)
  doc.text('Tuition Fee', TABLE_X + 4, y + 3.5)
  doc.text(fmtPHP(input.annualTuitionCentavos), TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H

  // Misc row
  doc.text('Miscellaneous Fee', TABLE_X + 4, y + 3.5)
  doc.text(fmtPHP(input.annualMiscCentavos), TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H

  // Total row — amber emphasis bar
  setFill(doc, AMBER)
  doc.rect(TABLE_X, y - 2, TABLE_W, ROW_H, 'F')
  doc.setFont('helvetica', 'bold')
  setText(doc, [255, 255, 255])
  doc.text('TOTAL ANNUAL FEES', TABLE_X + 4, y + 3.5)
  doc.text(`₱${fmtPHP(input.annualTotalCentavos)}`, TABLE_X + TABLE_W - 4, y + 3.5, { align: 'right' })
  y += ROW_H + 8

  // ── Reimbursement boilerplate ───────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  setText(doc, INK)
  const bodyLine3 = 'This certification is issued upon the request of the parent / guardian for reimbursement purposes only and not for any other intent.'
  const lines3 = doc.splitTextToSize(bodyLine3, CONTENT_W)
  doc.text(lines3, MARGIN, y)
  y += lines3.length * 5 + 4

  const issuedDate = fmtDate(input.issuedAt)
  const bodyLine4 = `Issued this ${issuedDate} at Aura Academy for Learning${branchText ? ' – ' + branchText : ''}.`
  const lines4 = doc.splitTextToSize(bodyLine4, CONTENT_W)
  doc.text(lines4, MARGIN, y)
  y += lines4.length * 5 + 22

  // ── Signatory ───────────────────────────────────────────────────
  setDraw(doc, INK)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, MARGIN + 70, y)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(doc, TEAL)
  doc.text('HANNAH JARA', MARGIN, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  setText(doc, INK)
  doc.text('CEO and President', MARGIN, y)
  y += 4
  doc.text('Aura Academy for Learning', MARGIN, y)

  // ── Footer ──────────────────────────────────────────────────────
  setDraw(doc, ROSE)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, PAGE_H - 18, PAGE_W - MARGIN, PAGE_H - 18)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setText(doc, ROSE)
  doc.text('Sapphire Clinics East Inc. · Aura Academy for Learning · Special Education Program', PAGE_W / 2, PAGE_H - 13, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  setText(doc, [120, 120, 120])
  doc.setFontSize(7)
  doc.text(`Issued via class.sapphireclinicseast.org by ${input.issuedBy}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })

  // Bottom accent stripe (teal)
  setFill(doc, TEAL)
  doc.rect(0, PAGE_H - 3, PAGE_W, 3, 'F')

  return doc
}

export function downloadRegistrationLetterPdf(input: RegistrationLetterInput): void {
  const doc = generateRegistrationLetterPdf(input)
  const safeName = input.studentFullName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
  doc.save(`Registration_Letter_${safeName}_${input.referenceNumber}.pdf`)
}

export function openRegistrationLetterPdf(input: RegistrationLetterInput): void {
  const doc = generateRegistrationLetterPdf(input)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
