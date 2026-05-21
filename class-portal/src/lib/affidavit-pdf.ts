// Generates the DepEd "Affidavit of Undertaking" (Annex 3, DepEd Order 3
// s.2018). Used when the parent ticks "Not Available" on Form 137 / SF10,
// Report Card, or Good Moral during enrollment — the school accepts the
// child temporarily until the previous-school credentials are submitted.

import { jsPDF } from 'jspdf'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2

export interface AffidavitInput {
  parentName: string         // "I, ___, of legal age,"
  parentAddress: string      // "a resident of ___"
  learnerName: string        // "and the parent/guardian of ___"
  schoolName?: string        // Defaults to "Light Bearer Christian Academy"
  previousSchoolName: string // Item 2
  previousGradeLevel: string // "passed the grade level of ___"
  reason: string             // "Due to ___, I cannot submit…"
  submitCredentialsBy?: string // Defaults to "August 15, 2026"
  attestedDay: string        // "___ day"
  attestedMonth: string      // "of _______"
  attestedCity: string       // "at ___"
  signatureDataUrl?: string  // optional PNG data URL from SignaturePad
  govtIdType?: string
  govtIdNumber?: string
  govtIdDateIssued?: string
}

function inkRgb(doc: jsPDF) { doc.setTextColor(20, 20, 20) }
function muted(doc: jsPDF) { doc.setTextColor(110, 110, 110) }
function reset(doc: jsPDF) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  inkRgb(doc)
}

/** Wrap a string to fit width and write it; returns updated y. */
function wrap(doc: jsPDF, text: string, x: number, y: number, w: number, lineH = 5.2): number {
  const lines = doc.splitTextToSize(text, w) as string[]
  for (const ln of lines) {
    doc.text(ln, x, y)
    y += lineH
  }
  return y
}

/**
 * Standard vertical step between blank rows. Large enough that the small
 * italic field caption (drawn at y + 5.4 below the underline) does NOT
 * collide with the next row's text baseline — but tight enough that the
 * whole affidavit (header + 4 circumstance items + 4 undertakings +
 * 4 acknowledgements + hold-harmless + attested + signature + Gov't ID)
 * fits on one A4 page.
 */
const ROW_STEP = 8

/** Inline blank with caption label underneath. Returns the right edge. */
function inlineBlank(doc: jsPDF, x: number, y: number, w: number, value: string, caption: string): number {
  // The value sits on the underline, the caption is the small italic label below.
  doc.setLineWidth(0.3)
  doc.line(x, y + 1.2, x + w, y + 1.2)
  if (value) {
    inkRgb(doc)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    const lines = doc.splitTextToSize(value, w - 1) as string[]
    doc.text(lines[0] ?? '', x + 0.8, y)
  }
  // Caption (only render when there's no value, OR small italic helper text
  // sitting under the field — keeps a filled-in form clean and avoids the
  // caption colliding with the next row's content).
  if (!value) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    muted(doc)
    doc.text(caption, x + w / 2, y + 5.4, { align: 'center' })
    reset(doc)
  }
  return x + w
}

/** "21" → "21st", "22" → "22nd", etc. Used for the attested-day line. */
function ordinal(nRaw: string | number): string {
  const n = Number(nRaw)
  if (!Number.isFinite(n)) return String(nRaw)
  const v = n % 100
  if (v >= 11 && v <= 13) return n + 'th'
  switch (n % 10) {
    case 1: return n + 'st'
    case 2: return n + 'nd'
    case 3: return n + 'rd'
    default: return n + 'th'
  }
}

export function generateAffidavitPdf(input: AffidavitInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  reset(doc)
  let y = MARGIN

  // ── Top-right Annex 3 / DepEd Order 3, 2018 tag ─────────────────
  doc.setLineWidth(0.4)
  doc.rect(PAGE_W - MARGIN - 32, y, 32, 8)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('ANNEX 3', PAGE_W - MARGIN - 16, y + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); muted(doc)
  doc.text('Deped Order 3, 2018', PAGE_W - MARGIN - 16, y + 12.5, { align: 'center' })
  reset(doc)

  // ── Title ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text('AFFIDAVIT OF UNDERTAKING', PAGE_W / 2, y + 6, { align: 'center' })
  reset(doc)
  y += 14

  // ── Header sentence with parent name + address ─────────────────
  // Two-line layout matching the source form:
  //   "I, ____________ of legal age, a resident of"
  //   "____________"
  //   "and the parent/guardian of ____________"
  doc.text('I,', MARGIN, y)
  inlineBlank(doc, MARGIN + 5, y, 110, input.parentName, 'Name of Parent/Guardian')
  doc.text('of legal age, a resident of', MARGIN + 117, y)
  y += ROW_STEP

  inlineBlank(doc, MARGIN, y, CONTENT_W, input.parentAddress, 'Address')
  y += ROW_STEP

  doc.text('and the parent/guardian of', MARGIN, y)
  inlineBlank(doc, MARGIN + 56, y, CONTENT_W - 56, input.learnerName, 'Name of Learner')
  y += ROW_STEP

  y = wrap(doc, 'hereby signs this document freely and with full understanding of its contents.', MARGIN, y, CONTENT_W)
  y += 3

  // ── Present circumstances ─────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.text('The present circumstances are:', MARGIN, y)
  y += 6

  // 1. Choose to enroll at <school>
  doc.text('1.', MARGIN + 4, y)
  doc.text('I choose to enroll my child at', MARGIN + 10, y)
  inlineBlank(doc, MARGIN + 64, y, CONTENT_W - 64 - 1.5, input.schoolName ?? 'Light Bearer Christian Academy', 'Name of School')
  doc.text('.', PAGE_W - MARGIN - 1.5, y)
  y += ROW_STEP

  // 2. Previously enrolled at <prev school> and passed grade level of <grade>
  doc.text('2.', MARGIN + 4, y)
  doc.text('I certify that my child was previously enrolled at', MARGIN + 10, y)
  inlineBlank(doc, MARGIN + 96, y, CONTENT_W - 96, input.previousSchoolName, 'Name of Previous School')
  y += ROW_STEP
  doc.text('and passed the grade level of', MARGIN + 10, y)
  inlineBlank(doc, MARGIN + 64, y, 40, input.previousGradeLevel, 'Grade level')
  doc.text('.', MARGIN + 104.5, y)
  y += ROW_STEP

  // 3. Due to <reason>, cannot submit transfer credentials
  doc.text('3.', MARGIN + 4, y)
  doc.text('Due to', MARGIN + 10, y)
  inlineBlank(doc, MARGIN + 22, y, CONTENT_W - 22, input.reason, 'Reason')
  y += ROW_STEP - 2
  y = wrap(doc, 'I cannot submit the transfer credentials of my child to this school.', MARGIN + 10, y, CONTENT_W - 10)
  y += 2

  // 4.
  doc.text('4.', MARGIN + 4, y)
  y = wrap(doc, 'I understand that my child shall be temporarily enrolled because I have not submitted the required credentials.', MARGIN + 10, y, CONTENT_W - 10)
  y += 3

  // ── Undertakings ──────────────────────────────────────────────
  doc.text('With these circumstances, I undertake to:', MARGIN, y)
  y += 6

  const undertakings = [
    'Do what is legally permissible for the release of the credentials of my child from the previous school.',
  ]
  for (const t of undertakings) {
    doc.text('1.', MARGIN + 4, y)
    y = wrap(doc, t, MARGIN + 10, y, CONTENT_W - 10)
    y += 1
  }

  // 2. Submit transfer credentials on or before <date>
  doc.text('2.', MARGIN + 4, y)
  doc.text('Submit the transfer credentials of my child on or before', MARGIN + 10, y)
  inlineBlank(doc, MARGIN + 105, y, CONTENT_W - 105, input.submitCredentialsBy ?? 'August 15, 2026', 'Deadline')
  doc.text('.', PAGE_W - MARGIN - 1.5, y)
  y += ROW_STEP

  const moreUndertakings = [
    'I agree that the official record from this school shall only be released until the submission of school credentials from the previous school.',
    'I understand that the school shall only issue a temporary progress report card signed by the adviser to monitor the progress of my child and that it is inadmissible for transfer and enrollment purposes.',
  ]
  for (let i = 0; i < moreUndertakings.length; i++) {
    doc.text(`${i + 3}.`, MARGIN + 4, y)
    y = wrap(doc, moreUndertakings[i], MARGIN + 10, y, CONTENT_W - 10)
    y += 1
  }
  y += 2

  // ── Without the transfer credentials, fully understand ─────────
  doc.text('Without the transfer credentials of my child I fully understand that:', MARGIN, y)
  y += 6
  const understand = [
    'My child is only temporarily enrolled.',
    'My child cannot be officially promoted to a higher grade level.',
    'My child cannot officially graduate from this school.',
    'Should my child attain the qualifying average and other criteria for academic honors, he/she will not be recognized.',
  ]
  for (let i = 0; i < understand.length; i++) {
    doc.text(`${i + 1}.`, MARGIN + 4, y)
    y = wrap(doc, understand[i], MARGIN + 10, y, CONTENT_W - 10)
    y += 1
  }
  y += 2

  // ── Hold-harmless paragraph ───────────────────────────────────
  y = wrap(doc, 'With all the foregoing, I shall hold free from any liability, whether civil, criminal or administrative, DepEd Personnel who are involved in the acceptance and enrollment of my child, and the enforcement of any law or rule and the obligations provided in this document.', MARGIN, y, CONTENT_W)
  y += 4

  // ── Attested this day of month at city ────────────────────────
  doc.text('Attested this', MARGIN, y)
  inlineBlank(doc, MARGIN + 24, y, 18, input.attestedDay ? ordinal(input.attestedDay) : '', 'day')
  doc.text('day of', MARGIN + 44, y)
  inlineBlank(doc, MARGIN + 56, y, 50, input.attestedMonth, 'month')
  doc.text('at', MARGIN + 108, y)
  inlineBlank(doc, MARGIN + 113, y, CONTENT_W - 113 - 1.5, input.attestedCity, 'city')
  doc.text('.', PAGE_W - MARGIN - 1.5, y)
  y += 11

  // ── Signature block ────────────────────────────────────────────
  const sigLineW = 100
  const sigCenterX = PAGE_W / 2
  if (input.signatureDataUrl) {
    try {
      // Signature image sits ABOVE the line.
      doc.addImage(input.signatureDataUrl, 'PNG', sigCenterX - sigLineW / 2 + 4, y - 10, sigLineW - 8, 9, undefined, 'FAST')
    } catch { /* ignore */ }
  }
  doc.setLineWidth(0.4)
  doc.line(sigCenterX - sigLineW / 2, y, sigCenterX + sigLineW / 2, y)
  // Printed name BELOW the line — the parent's typed name, then the
  // small italic caption beneath that.
  if (input.parentName) {
    inkRgb(doc); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
    doc.text(input.parentName, sigCenterX, y + 4.5, { align: 'center' })
  }
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); muted(doc)
  doc.text('Signature Over Printed Name of Parent/Guardian', sigCenterX, y + 8.5, { align: 'center' })
  reset(doc)
  y += 11

  // ── Gov't ID block ─────────────────────────────────────────────
  // Always rendered on the same page. Spacing above has been tuned so
  // the three rows fit above the bottom margin even when wrapped lines
  // push the layout down slightly.
  doc.setFontSize(9.5)
  doc.text('Gov’t ID Presented:', MARGIN, y)
  inlineBlank(doc, MARGIN + 35, y, 60, input.govtIdType ?? '', 'ID type')
  y += 6
  doc.text('ID Number:', MARGIN, y)
  inlineBlank(doc, MARGIN + 35, y, 60, input.govtIdNumber ?? '', 'ID number')
  y += 6
  doc.text('Date Issued:', MARGIN, y)
  inlineBlank(doc, MARGIN + 35, y, 60, input.govtIdDateIssued ?? '', 'date issued')

  // ── Footer right ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9)
  inkRgb(doc)
  doc.text('PS-ODIR/SFRT', PAGE_W - MARGIN, PAGE_H - MARGIN, { align: 'right' })

  return doc
}
