// DepEd Annex 2 Enrollment Form PDF generator. Pulls data from the
// EnrollmentDraft (the same data the parent filled on /enroll).
//
// Layout mirrors the DepEd Annex 2 template:
//   - "Boxed" per-character cells for LRN, LAST/FIRST/MIDDLE NAME, DOB,
//     SEX, AGE, ZIP CODE — one square per character/digit so the field
//     enforces structure.
//   - Multi-line wrapping text fields for long values (email, address,
//     diagnosis, etc.) so nothing is silently truncated.

import { jsPDF } from 'jspdf'
import { ageFromDob, levelLabel, type EnrollmentDraft, type EnrollmentLevel, type StoredUser } from './session'

const PAGE_MARGIN = 10
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - PAGE_MARGIN * 2

// Compact spacing — tuned so the entire DepEd Annex 2 layout fits on a single A4 page.
const BOX_H = 5.2
const BOX_LABEL_PAD = 2.4
const BOX_GAP = 1.2
const WRAP_LINE_H = 3.6
const WRAP_PAD_Y = 1.1
const WRAP_LABEL_PAD = 2.4
const WRAP_GAP = 1.2
const SEC_HEADER_BAND = 4.6
const SEC_HEADER_GAP = 5.8

const COLOR_NARRA: [number, number, number]  = [27, 63, 56]
const COLOR_MOSS:  [number, number, number]  = [38, 85, 75]
const COLOR_INK:   [number, number, number]  = [26, 26, 26]
const COLOR_MIDGRAY: [number, number, number] = [107, 99, 87]
const COLOR_PAPER2: [number, number, number]  = [236, 230, 217]
const COLOR_BORDER: [number, number, number]  = [200, 192, 173]

type Cursor = { doc: jsPDF; y: number }

function setColor(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]) }
function setFill(doc: jsPDF, c: [number, number, number])  { doc.setFillColor(c[0], c[1], c[2]) }
function setDraw(doc: jsPDF, c: [number, number, number])  { doc.setDrawColor(c[0], c[1], c[2]) }

function ensure(c: Cursor, needed: number) {
  if (c.y + needed > PAGE_H - PAGE_MARGIN) {
    c.doc.addPage()
    c.y = PAGE_MARGIN
  }
}

function checkboxMark(doc: jsPDF, x: number, y: number, checked: boolean, label: string) {
  setDraw(doc, COLOR_NARRA)
  doc.setLineWidth(0.4)
  doc.rect(x, y, 3.2, 3.2)
  if (checked) {
    setFill(doc, COLOR_NARRA)
    doc.rect(x + 0.7, y + 0.7, 1.8, 1.8, 'F')
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setColor(doc, COLOR_INK)
  doc.text(label, x + 4.6, y + 2.6)
}

function sectionHeader(c: Cursor, title: string, annex?: string) {
  ensure(c, SEC_HEADER_GAP + 1)
  const { doc } = c
  setFill(doc, COLOR_NARRA)
  doc.rect(PAGE_MARGIN, c.y, CONTENT_W, SEC_HEADER_BAND, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(title.toUpperCase(), PAGE_MARGIN + 2, c.y + SEC_HEADER_BAND - 1.2)
  if (annex) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text(annex, PAGE_W - PAGE_MARGIN - 2, c.y + SEC_HEADER_BAND - 1.2, { align: 'right' })
  }
  c.y += SEC_HEADER_GAP
}

/**
 * Row with one square per character — matches the DepEd Annex 2 style.
 * Pads `value` to `n` characters with spaces; truncates if too long. The
 * label sits in its own band above the boxes so wide names still fit.
 */
function boxRow(c: Cursor, label: string, value: string, n: number, opts: { boxH?: number; labelW?: number; widthW?: number; xStart?: number } = {}) {
  const { doc } = c
  const labelW = opts.labelW ?? 0
  const boxH = opts.boxH ?? BOX_H
  const baseX = opts.xStart ?? PAGE_MARGIN
  const widthW = opts.widthW ?? CONTENT_W
  const boxW = (widthW - labelW) / n

  ensure(c, boxH + BOX_LABEL_PAD + 2)

  let startX = baseX
  if (labelW > 0) {
    setColor(doc, COLOR_MOSS)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    const lines = doc.splitTextToSize(label, labelW - 1) as string[]
    lines.slice(0, 2).forEach((ln, i) => doc.text(ln, baseX, c.y + 2.6 + i * 2.6))
    startX = baseX + labelW
  } else {
    setColor(doc, COLOR_MOSS)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(label.toUpperCase(), baseX, c.y + 2)
    c.y += BOX_LABEL_PAD
  }

  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.25)
  const chars = (value ?? '').toUpperCase().padEnd(n, ' ').slice(0, n).split('')
  const valueFont = Math.min(boxH * 1.35, 9)
  for (let i = 0; i < n; i++) {
    const x = startX + i * boxW
    doc.rect(x, c.y, boxW, boxH)
    const ch = chars[i].trim()
    if (ch) {
      setColor(doc, COLOR_INK)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(valueFont)
      doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.4, { align: 'center' })
    }
  }
  c.y += boxH + BOX_GAP
}

/**
 * Row of separate fixed-width boxed groups (for DOB: MM/DD/YYYY).
 * `groups` describes each segment's width in characters and the value to render.
 */
function boxGroupRow(c: Cursor, label: string, groups: Array<{ value: string; n: number }>, separators: string[], opts: { xStart?: number; widthW?: number; boxH?: number; sepWidth?: number } = {}) {
  const { doc } = c
  const boxH = opts.boxH ?? BOX_H
  const baseX = opts.xStart ?? PAGE_MARGIN
  const widthW = opts.widthW ?? CONTENT_W
  const sepWidthMm = opts.sepWidth ?? 2.4
  const totalSepMm = sepWidthMm * separators.length
  const totalChars = groups.reduce((a, g) => a + g.n, 0)
  const remaining = widthW - totalSepMm
  const boxW = Math.min(6.2, remaining / totalChars)

  ensure(c, boxH + BOX_LABEL_PAD + 2)
  setColor(doc, COLOR_MOSS)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(label.toUpperCase(), baseX, c.y + 2)
  c.y += BOX_LABEL_PAD

  let x = baseX
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.25)
  groups.forEach((g, gi) => {
    const chars = g.value.toUpperCase().padEnd(g.n, ' ').slice(0, g.n).split('')
    for (let i = 0; i < g.n; i++) {
      doc.rect(x, c.y, boxW, boxH)
      const ch = chars[i].trim()
      if (ch) {
        setColor(doc, COLOR_INK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.4, { align: 'center' })
      }
      x += boxW
    }
    if (separators[gi] !== undefined) {
      setColor(doc, COLOR_MOSS)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(separators[gi], x + sepWidthMm / 2, c.y + boxH / 2 + 1.6, { align: 'center' })
      x += sepWidthMm
    }
  })
  c.y += boxH + BOX_GAP
}

/**
 * Multi-line wrapping text field. Cell height grows to fit the value so
 * email / address / diagnosis never get silently truncated.
 */
function wrapField(c: Cursor, label: string, value: string | undefined, opts: { w?: number; minLines?: number; xStart?: number } = {}) {
  const { doc } = c
  const w = opts.w ?? CONTENT_W
  const xStart = opts.xStart ?? PAGE_MARGIN
  const v = (value ?? '').trim()
  const minLines = opts.minLines ?? 1

  setColor(doc, COLOR_MOSS)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(label.toUpperCase(), xStart, c.y + 2)
  c.y += WRAP_LABEL_PAD

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  setColor(doc, COLOR_INK)
  const lines = (v ? doc.splitTextToSize(v, w - 3) : []) as string[]
  const renderLines = Math.max(lines.length, minLines)
  const cellH = WRAP_PAD_Y * 2 + renderLines * WRAP_LINE_H

  ensure(c, cellH + 2)
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.25)
  doc.rect(xStart, c.y, w, cellH)
  lines.forEach((ln, i) => doc.text(ln, xStart + 1.6, c.y + WRAP_PAD_Y + WRAP_LINE_H * (i + 0.78)))
  c.y += cellH + WRAP_GAP
}

/** Two wrap fields side-by-side, each taking half of the content width. */
function wrapFieldPair(c: Cursor, left: { label: string; value?: string }, right: { label: string; value?: string }) {
  const halfW = (CONTENT_W - 2) / 2
  const yStart = c.y
  wrapField(c, left.label, left.value, { w: halfW, xStart: PAGE_MARGIN })
  const yAfterLeft = c.y
  c.y = yStart
  wrapField(c, right.label, right.value, { w: halfW, xStart: PAGE_MARGIN + halfW + 2 })
  const yAfterRight = c.y
  c.y = Math.max(yAfterLeft, yAfterRight)
}

/** Three wrap fields side-by-side. */
function wrapFieldTriple(c: Cursor, a: { label: string; value?: string; flex?: number }, b: { label: string; value?: string; flex?: number }, d: { label: string; value?: string; flex?: number }) {
  const gap = 2
  const fa = a.flex ?? 1, fb = b.flex ?? 1, fd = d.flex ?? 1
  const totalFlex = fa + fb + fd
  const slotW = (CONTENT_W - gap * 2) / totalFlex
  const wA = slotW * fa, wB = slotW * fb, wD = slotW * fd
  const yStart = c.y
  wrapField(c, a.label, a.value, { w: wA, xStart: PAGE_MARGIN })
  const y1 = c.y; c.y = yStart
  wrapField(c, b.label, b.value, { w: wB, xStart: PAGE_MARGIN + wA + gap })
  const y2 = c.y; c.y = yStart
  wrapField(c, d.label, d.value, { w: wD, xStart: PAGE_MARGIN + wA + gap + wB + gap })
  c.y = Math.max(y1, y2, c.y)
}

export function generateEnrollmentPdf(user: StoredUser, draft: Partial<EnrollmentDraft>): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const c: Cursor = { doc, y: PAGE_MARGIN }

  const level: EnrollmentLevel = (draft.level ?? user.level ?? 'KINDER') as EnrollmentLevel

  // ── Title (compact, 1-band header) ────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  setColor(doc, COLOR_NARRA)
  doc.text('SAPPHIRE CLINICS EAST × LIGHT BEARER CHRISTIAN ACADEMY', PAGE_W / 2, c.y + 4, { align: 'center' })
  doc.setFontSize(8.5)
  setColor(doc, COLOR_MOSS)
  const syLabel = draft.schoolYearFrom && draft.schoolYearTo ? `${draft.schoolYearFrom}–${draft.schoolYearTo}` : '_______'
  doc.text(`ENROLLMENT FORM — School Year ${syLabel}   ·   DepEd Annex 2`, PAGE_W / 2, c.y + 8.2, { align: 'center' })
  c.y += 10
  setDraw(doc, COLOR_PAPER2); doc.setLineWidth(0.3)
  doc.line(PAGE_MARGIN, c.y, PAGE_W - PAGE_MARGIN, c.y)
  c.y += 2

  // LRN status — inline row, no separate band
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setColor(doc, COLOR_MOSS)
  doc.text('Check one:', PAGE_MARGIN, c.y + 2.7)
  let cbX = PAGE_MARGIN + 16
  checkboxMark(doc, cbX, c.y + 0.4, draft.lrnStatus === 'NO_LRN',    'No LRN'); cbX += 22
  checkboxMark(doc, cbX, c.y + 0.4, draft.lrnStatus === 'WITH_LRN',  'With LRN'); cbX += 24
  checkboxMark(doc, cbX, c.y + 0.4, draft.lrnStatus === 'RETURNING', 'Returning (Balik-Aral)')
  c.y += 5

  // ── 1. Student Information ────────────────────────────
  sectionHeader(c, 'Student Information', 'ANNEX 2')

  // LRN on the left + PSA + Religion as a triple
  boxRow(c, 'Learner Reference No. (LRN)', draft.lrn ?? '', 12)
  wrapFieldPair(
    c,
    { label: 'PSA Birth Certificate No.', value: draft.psaBirthCertNo },
    { label: 'Religion', value: draft.religion },
  )

  // Stack the three name rows
  boxRow(c, 'Last Name', draft.lastName ?? '', 22)
  boxRow(c, 'First Name', draft.firstName ?? '', 22)
  boxRow(c, 'Middle Name', draft.middleName ?? '', 22)

  // DOB + Sex + Age + Extension Name on one combined row
  {
    const dobW = 60
    const sexW = 32
    const ageW = 22
    const extW = CONTENT_W - dobW - sexW - ageW - 6
    const yStart = c.y
    boxGroupRow(c, 'Date of Birth (M/D/Y)', [
      { value: dobMonth(draft.dob), n: 2 },
      { value: dobDay(draft.dob),   n: 2 },
      { value: dobYear(draft.dob),  n: 4 },
    ], ['/', '/'], { xStart: PAGE_MARGIN, widthW: dobW })
    const yAfterDob = c.y
    // Sex
    c.y = yStart
    const sexX = PAGE_MARGIN + dobW + 2
    setColor(doc, COLOR_MOSS); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
    doc.text('SEX', sexX, c.y + 2)
    c.y += BOX_LABEL_PAD
    let sxX = sexX
    checkboxMark(doc, sxX, c.y, draft.sex === 'MALE', 'M'); sxX += 12
    checkboxMark(doc, sxX, c.y, draft.sex === 'FEMALE', 'F')
    const yAfterSex = c.y + BOX_H + BOX_GAP
    // Age
    c.y = yStart
    const ageX = sexX + sexW + 2
    boxRow(c, 'Age', draft.dob ? ageFromDob(draft.dob).padStart(2, ' ') : '', 2, { xStart: ageX, widthW: ageW })
    const yAfterAge = c.y
    // Extension Name
    c.y = yStart
    const extX = ageX + ageW + 2
    wrapField(c, 'Extension (Jr., III)', draft.extensionName, { xStart: extX, w: extW })
    const yAfterExt = c.y
    c.y = Math.max(yAfterDob, yAfterSex, yAfterAge, yAfterExt)
  }

  // IP membership — single compact row
  {
    ensure(c, 5)
    setColor(doc, COLOR_MOSS); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
    doc.text('IP / INDIGENOUS CULTURAL COMMUNITY MEMBER?', PAGE_MARGIN, c.y + 2)
    let x = PAGE_MARGIN + 70
    checkboxMark(doc, x, c.y - 0.4, draft.ipMember === 'YES', 'Yes'); x += 12
    checkboxMark(doc, x, c.y - 0.4, draft.ipMember === 'NO',  'No');  x += 12
    if (draft.ipMember === 'YES') {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); setColor(doc, COLOR_MIDGRAY)
      doc.text('Specify:', x, c.y + 2); x += 10
      setColor(doc, COLOR_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text(doc.splitTextToSize(draft.ipCommunity ?? '', PAGE_W - PAGE_MARGIN - x)[0] ?? '', x, c.y + 2)
    }
    c.y += 4.2
  }

  // Mother tongue + Diagnosis on one row (Diagnosis hidden if absent → MT spans wider)
  if (draft.diagnosis) {
    wrapFieldPair(
      c,
      { label: 'Mother Tongue', value: draft.motherTongue },
      { label: 'Diagnosis / Conditions', value: draft.diagnosis },
    )
  } else {
    wrapField(c, 'Mother Tongue', draft.motherTongue)
  }

  // ── 2. Address ────────────────────────────────────────
  sectionHeader(c, 'Address')
  wrapFieldPair(
    c,
    { label: 'House No. & Street', value: draft.houseStreet },
    { label: 'Barangay', value: draft.barangay },
  )
  // City/Province + Zip on one row
  {
    const zipW = 36
    const cityW = CONTENT_W - zipW - 2
    const yStart = c.y
    wrapField(c, 'City / Municipality / Province / Country', draft.cityProvinceCountry, { w: cityW, xStart: PAGE_MARGIN })
    const yAfterCity = c.y
    c.y = yStart
    boxRow(c, 'Zip Code', (draft.zipCode ?? '').padStart(4, ' ').slice(0, 4), 4, { xStart: PAGE_MARGIN + cityW + 2, widthW: zipW })
    c.y = Math.max(yAfterCity, c.y)
  }

  // ── 3. Parent / Guardian ──────────────────────────────
  sectionHeader(c, "Parent's / Guardian's Information")
  wrapFieldPair(
    c,
    { label: "Father's Name (Last, First, Middle)", value: nameOf(draft.father) },
    { label: "Father's Occupation", value: draft.fatherOccupation },
  )
  wrapFieldPair(
    c,
    { label: "Mother's Maiden Name (Last, First, Middle)", value: nameOf(draft.mother) },
    { label: "Mother's Occupation", value: draft.motherOccupation },
  )
  wrapField(c, "Guardian's Name (Last, First, Middle)", draft.guardianOfRecord === 'OTHER' ? nameOf(draft.guardian) : (draft.guardianOfRecord === 'FATHER' ? nameOf(draft.father) : nameOf(draft.mother)))
  // Telephone + Cellphone + Email on one row, email gets extra room
  wrapFieldTriple(
    c,
    { label: 'Telephone', value: draft.telephone, flex: 1 },
    { label: 'Cellphone', value: draft.cellphone, flex: 1 },
    { label: 'Email Address', value: draft.email, flex: 2 },
  )

  // ── 4. Returning / Transferee (conditional) ──────────
  if (draft.isReturningOrTransferee === 'YES') {
    sectionHeader(c, 'For Returning Learners / Transferees')
    wrapFieldPair(
      c,
      { label: 'Last Grade Level Completed', value: draft.lastGradeCompleted },
      { label: 'Last School Year Completed', value: draft.lastSchoolYearCompleted },
    )
    wrapFieldTriple(
      c,
      { label: 'School Name', value: draft.previousSchoolName, flex: 2 },
      { label: 'School ID', value: draft.previousSchoolId, flex: 1 },
      { label: 'School Address', value: draft.previousSchoolAddress, flex: 3 },
    )
  }

  // ── 5. Class Program + Certification (combined section) ──
  sectionHeader(c, 'Class Program & Certification')
  wrapField(c, 'Enrolled Grade Level (SCEI × LBCA SPED Class Program)', levelLabel(level))
  // Compact cert text — single tight paragraph
  {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.2)
    setColor(doc, COLOR_INK)
    const text = "I hereby certify that the above information is true and correct, and allow DepEd to use my child's details to create/update his/her learner profile in the LIS. Information shall be treated as confidential under the Data Privacy Act of 2012."
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[]
    for (const ln of lines) {
      ensure(c, 3.4)
      doc.text(ln, PAGE_MARGIN, c.y + 2.6)
      c.y += 3.2
    }
    c.y += 1
  }

  // Signature block — compact
  const sigBoxW = CONTENT_W * 0.62
  const dateBoxW = CONTENT_W - sigBoxW - 3
  const sigH = 14
  ensure(c, sigH + 7)
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.3)
  doc.rect(PAGE_MARGIN, c.y, sigBoxW, sigH)
  doc.rect(PAGE_MARGIN + sigBoxW + 3, c.y, dateBoxW, sigH)
  if (draft.certSignatureDataUrl) {
    try { doc.addImage(draft.certSignatureDataUrl, 'PNG', PAGE_MARGIN + 1.5, c.y + 1.5, sigBoxW - 3, sigH - 3, undefined, 'FAST') } catch { /* ignore */ }
  }
  if (draft.certSignedAt) {
    doc.setFontSize(9)
    setColor(doc, COLOR_INK)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date(draft.certSignedAt).toLocaleDateString(), PAGE_MARGIN + sigBoxW + 3 + dateBoxW / 2, c.y + sigH / 2 + 1.5, { align: 'center' })
  }
  doc.setFontSize(6.5)
  setColor(doc, COLOR_MIDGRAY)
  doc.setFont('helvetica', 'italic')
  doc.text('Signature Over Printed Name of Parent / Guardian', PAGE_MARGIN + sigBoxW / 2, c.y + sigH + 3, { align: 'center' })
  doc.text('Date', PAGE_MARGIN + sigBoxW + 3 + dateBoxW / 2, c.y + sigH + 3, { align: 'center' })
  if (draft.certSignatureName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setColor(doc, COLOR_INK)
    doc.text(draft.certSignatureName, PAGE_MARGIN + sigBoxW / 2, c.y + sigH + 6, { align: 'center' })
  }
  c.y += sigH + 7

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    setColor(doc, COLOR_MIDGRAY)
    doc.setFont('helvetica', 'normal')
    const studentLabel = [draft.firstName, draft.lastName].filter(Boolean).join(' ') || user.email
    doc.text(`SCEI × LBCA Enrollment Form  ·  ${studentLabel}  ·  ${levelLabel(level)}`, PAGE_MARGIN, PAGE_H - 6)
    doc.text(`Page ${p} of ${pages}`, PAGE_W - PAGE_MARGIN, PAGE_H - 6, { align: 'right' })
  }

  return doc
}

export function downloadEnrollmentPdf(user: StoredUser, draft: Partial<EnrollmentDraft>) {
  const doc = generateEnrollmentPdf(user, draft)
  const safe = `${user.lastName ?? ''}-${user.firstName ?? ''}-enrollment-form`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  doc.save(`${safe}.pdf`)
}

function nameOf(n?: { lastName: string; firstName: string; middleName: string }) {
  if (!n) return ''
  return [n.lastName, n.firstName, n.middleName].filter(Boolean).join(', ')
}

function dobMonth(dob?: string): string {
  if (!dob) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  return m ? m[2] : ''
}
function dobDay(dob?: string): string {
  if (!dob) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  return m ? m[3] : ''
}
function dobYear(dob?: string): string {
  if (!dob) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  return m ? m[1] : ''
}
