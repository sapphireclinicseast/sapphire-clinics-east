// DepEd Basic Education Enrollment Form (Annex 2, DepEd Order 3, s.2018)
// — generated to mirror the official government layout so the school can
// submit it as the required DepEd document.
//
// Layout decisions:
//   • Monochrome black-on-white (no Aura branding on this one form,
//     since it functions as the government template for submission).
//   • Section bands with light-grey fill + bold uppercase titles.
//   • Boxed-per-character cells where the source has them (LRN, names,
//     DOB, zip code, PSA cert no.) — one square per digit/letter so the
//     printed copy matches the form's structure.
//   • "ANNEX 2 / Deped Order 3, 2018" tag in the upper right.
//   • "For use of DepEd Personnel Only" block at the bottom.
//
// Extra fields our enrollment captures (nationality, PWD ID, diagnosis)
// sit in semantically appropriate rows of the same section bands without
// disturbing the overall layout.

import { jsPDF } from 'jspdf'
import { ageFromDob, levelLabel, type EnrollmentDraft, type EnrollmentLevel, type StoredUser } from './session'

const PAGE_MARGIN = 10
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - PAGE_MARGIN * 2

// Compact spacing — tuned so the whole layout fits on one A4 page.
const BOX_H = 5
const BOX_LABEL_PAD = 2.4
const BOX_GAP = 1
const WRAP_LINE_H = 3.6
const WRAP_PAD_Y = 1.1
const WRAP_LABEL_PAD = 2.4
const WRAP_GAP = 1
const SEC_HEADER_BAND = 4.4
const SEC_HEADER_GAP = 5.4

// Government-form palette — black ink, mid grey labels, light grey bands.
const COLOR_INK:    [number, number, number] = [10, 10, 10]
const COLOR_LABEL:  [number, number, number] = [70, 70, 70]
const COLOR_BORDER: [number, number, number] = [120, 120, 120]
const COLOR_BAND:   [number, number, number] = [220, 220, 220]
const COLOR_MUTED:  [number, number, number] = [110, 110, 110]

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

/** A small checkbox + inline label. Returns x advanced past the label. */
function checkbox(doc: jsPDF, x: number, y: number, checked: boolean, label: string, labelGap = 1.2): number {
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.3)
  doc.rect(x, y, 3, 3)
  if (checked) {
    setColor(doc, COLOR_INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('X', x + 0.6, y + 2.4)
  }
  setColor(doc, COLOR_INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(label, x + 3 + labelGap, y + 2.4)
  const labelW = doc.getTextWidth(label)
  return x + 3 + labelGap + labelW
}

function sectionHeader(c: Cursor, title: string) {
  ensure(c, SEC_HEADER_GAP + 1)
  const { doc } = c
  setFill(doc, COLOR_BAND)
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.25)
  doc.rect(PAGE_MARGIN, c.y, CONTENT_W, SEC_HEADER_BAND, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, COLOR_INK)
  doc.text(title.toUpperCase(), PAGE_W / 2, c.y + SEC_HEADER_BAND - 1.2, { align: 'center' })
  c.y += SEC_HEADER_GAP
}

/** Row with one square per character. Pads `value` to `n` chars with spaces. */
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
    setColor(doc, COLOR_LABEL)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    const lines = doc.splitTextToSize(label, labelW - 1) as string[]
    lines.slice(0, 2).forEach((ln, i) => doc.text(ln, baseX, c.y + 2.6 + i * 2.6))
    startX = baseX + labelW
  } else {
    setColor(doc, COLOR_LABEL)
    doc.setFont('helvetica', 'normal')
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

/** Row of separate fixed-width boxed groups (DOB: MM/DD/YYYY). */
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
  setColor(doc, COLOR_LABEL)
  doc.setFont('helvetica', 'normal')
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
      setColor(doc, COLOR_LABEL)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(separators[gi], x + sepWidthMm / 2, c.y + boxH / 2 + 1.6, { align: 'center' })
      x += sepWidthMm
    }
  })
  c.y += boxH + BOX_GAP
}

/** Multi-line wrapping text field that grows to fit its value. */
function wrapField(c: Cursor, label: string, value: string | undefined, opts: { w?: number; minLines?: number; xStart?: number } = {}) {
  const { doc } = c
  const w = opts.w ?? CONTENT_W
  const xStart = opts.xStart ?? PAGE_MARGIN
  const v = (value ?? '').trim()
  const minLines = opts.minLines ?? 1

  setColor(doc, COLOR_LABEL)
  doc.setFont('helvetica', 'normal')
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

  // ── ANNEX 2 / DepEd Order tag (upper-right) ────────────────────
  const tagW = 32, tagH = 8
  const tagX = PAGE_W - PAGE_MARGIN - tagW
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.4)
  doc.rect(tagX, PAGE_MARGIN, tagW, tagH)
  setColor(doc, COLOR_INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ANNEX 2', tagX + tagW / 2, PAGE_MARGIN + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  setColor(doc, COLOR_MUTED)
  doc.text('Deped Order 3, 2018', tagX + tagW / 2, PAGE_MARGIN + tagH + 2.6, { align: 'center' })

  // ── Title block ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(doc, COLOR_INK)
  doc.text('BASIC EDUCATION ENROLLMENT FORM', PAGE_W / 2, PAGE_MARGIN + 5, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  setColor(doc, COLOR_MUTED)
  doc.text('THIS FORM IS NOT FOR SALE.', PAGE_W / 2, PAGE_MARGIN + 10, { align: 'center' })
  c.y = PAGE_MARGIN + 14

  // ── School year + LRN status row ───────────────────────────────
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  setColor(doc, COLOR_MUTED)
  doc.text('Check the appropriate box only:', PAGE_W - PAGE_MARGIN - 65, c.y - 0.5)

  setColor(doc, COLOR_INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('School Year:', PAGE_MARGIN, c.y + 3)
  // Two boxed year cells with a dash separator
  boxGroupRow(c, '', [
    { value: draft.schoolYearFrom ?? '', n: 4 },
    { value: draft.schoolYearTo ?? '',   n: 4 },
  ], ['-'], { xStart: PAGE_MARGIN + 22, widthW: 56, boxH: 4.6 })
  c.y -= (4.6 + BOX_GAP) // we'll continue this row with checkboxes inline
  let cbX = PAGE_MARGIN + 84
  const cbY = c.y - 0.4
  cbX = checkbox(doc, cbX, cbY, draft.lrnStatus === 'NO_LRN',    'No LRN'); cbX += 4
  cbX = checkbox(doc, cbX, cbY, draft.lrnStatus === 'WITH_LRN',  'With LRN'); cbX += 4
  checkbox(doc, cbX, cbY, draft.lrnStatus === 'RETURNING',       'Returning (Balik-Aral)')
  c.y += 6

  // ── STUDENT INFORMATION ────────────────────────────────────────
  sectionHeader(c, 'Student Information')

  wrapFieldPair(
    c,
    { label: 'PSA Birth Certificate No.', value: draft.psaBirthCertNo },
    { label: 'Religion', value: draft.religion },
  )
  boxRow(c, 'Learner Reference No. (LRN)', draft.lrn ?? '', 12)
  boxRow(c, 'Last Name', draft.lastName ?? '', 22)
  boxRow(c, 'First Name', draft.firstName ?? '', 22)
  boxRow(c, 'Middle Name', draft.middleName ?? '', 22)
  wrapField(c, 'Extension Name e.g. Jr., III (if applicable)', draft.extensionName)

  // DOB | SEX | AGE row
  {
    const dobW = 64
    const sexW = 36
    const ageW = 22
    const extW = CONTENT_W - dobW - sexW - ageW - 6
    const yStart = c.y

    boxGroupRow(c, 'Date of Birth (Month/Day/Year)', [
      { value: dobMonth(draft.dob), n: 2 },
      { value: dobDay(draft.dob),   n: 2 },
      { value: dobYear(draft.dob),  n: 4 },
    ], ['/', '/'], { xStart: PAGE_MARGIN, widthW: dobW })
    const yAfterDob = c.y

    // Sex
    c.y = yStart
    const sexX = PAGE_MARGIN + dobW + 2
    setColor(doc, COLOR_LABEL); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
    doc.text('SEX', sexX, c.y + 2)
    c.y += BOX_LABEL_PAD
    let sxX = sexX
    sxX = checkbox(doc, sxX, c.y, draft.sex === 'MALE',   'Male'); sxX += 4
    checkbox(doc, sxX, c.y, draft.sex === 'FEMALE', 'Female')
    const yAfterSex = c.y + BOX_H + BOX_GAP

    // Age
    c.y = yStart
    const ageX = sexX + sexW + 2
    boxRow(c, 'Age', draft.dob ? ageFromDob(draft.dob).padStart(2, ' ') : '', 2, { xStart: ageX, widthW: ageW })
    const yAfterAge = c.y

    // Nationality (extra field, fills the remaining slot)
    c.y = yStart
    const natX = ageX + ageW + 2
    wrapField(c, 'Nationality', draft.nationality, { xStart: natX, w: extW })
    const yAfterNat = c.y

    c.y = Math.max(yAfterDob, yAfterSex, yAfterAge, yAfterNat)
  }

  // IP membership row
  {
    ensure(c, 6)
    setColor(doc, COLOR_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text('Belonging to any Indigenous Peoples (IP) Community / Indigenous Cultural Community?', PAGE_MARGIN, c.y + 2.4)
    let x = PAGE_MARGIN + 102
    x = checkbox(doc, x, c.y, draft.ipMember === 'NO',  'No');  x += 4
    x = checkbox(doc, x, c.y, draft.ipMember === 'YES', 'Yes'); x += 4
    if (draft.ipMember === 'YES') {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); setColor(doc, COLOR_MUTED)
      doc.text('If Yes, please specify:', x, c.y + 2.4); x += 28
      setColor(doc, COLOR_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text((doc.splitTextToSize(draft.ipCommunity ?? '', PAGE_W - PAGE_MARGIN - x)[0] as string) ?? '', x, c.y + 2.4)
    }
    c.y += 5
  }

  // Mother tongue + (extras) Diagnosis + PWD ID row
  if (draft.diagnosis || draft.pwdIdNumber) {
    wrapFieldTriple(
      c,
      { label: 'Mother Tongue', value: draft.motherTongue, flex: 1 },
      { label: 'Diagnosis (if applicable)', value: draft.diagnosis, flex: 2 },
      { label: 'PWD ID Number (if applicable)', value: draft.pwdIdNumber, flex: 1 },
    )
  } else {
    wrapField(c, 'Mother Tongue', draft.motherTongue)
  }

  // ── ADDRESS ────────────────────────────────────────────────────
  sectionHeader(c, 'Address')
  wrapField(c, 'House Number and Street', draft.houseStreet)
  wrapField(c, 'Barangay', draft.barangay)
  {
    const zipW = 40
    const cityW = CONTENT_W - zipW - 2
    const yStart = c.y
    wrapField(c, 'City / Municipality / Province / Country', draft.cityProvinceCountry, { w: cityW, xStart: PAGE_MARGIN })
    const yAfterCity = c.y
    c.y = yStart
    boxRow(c, 'Zip Code', (draft.zipCode ?? '').padStart(4, ' ').slice(0, 4), 4, { xStart: PAGE_MARGIN + cityW + 2, widthW: zipW })
    c.y = Math.max(yAfterCity, c.y)
  }

  // ── PARENT'S / GUARDIAN'S INFORMATION ──────────────────────────
  sectionHeader(c, "Parent's / Guardian's Information")
  wrapField(c, "Father's Name (Last Name, First Name, Middle Name)", nameOf(draft.father))
  wrapField(c, "Mother's Maiden Name (Last Name, First Name, Middle Name)", nameOf(draft.mother))
  wrapField(c, "Guardian's Name (Last Name, First Name, Middle Name)", nameOf(draft.guardian))
  wrapFieldTriple(
    c,
    { label: 'Telephone No.', value: draft.telephone, flex: 1 },
    { label: 'Cellphone No.', value: draft.cellphone, flex: 1 },
    { label: 'Email', value: draft.email, flex: 2 },
  )

  // ── For Returning Learners / Transferees ───────────────────────
  if (draft.isReturningOrTransferee === 'YES') {
    sectionHeader(c, 'For Returning Learners (Balik-Aral) and Those Who Shall Transfer / Move In')
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

  // ── Certification block ────────────────────────────────────────
  ensure(c, 28)
  c.y += 1
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  setColor(doc, COLOR_INK)
  // Paraphrased certification text — same intent as the source's Data
  // Privacy Act notice but written in our own words.
  const cert = 'I certify that the information provided above is true and correct to the best of my knowledge, and I authorize the Department of Education to use my child’s details for the Learner Information System. All information will be handled confidentially in line with the Data Privacy Act of 2012 (R.A. 10173).'
  const certLines = doc.splitTextToSize(cert, CONTENT_W) as string[]
  for (const ln of certLines) {
    ensure(c, 3.4)
    doc.text(ln, PAGE_MARGIN, c.y + 2.6)
    c.y += 3.2
  }
  c.y += 2

  // Signature + Date block
  const sigBoxW = CONTENT_W * 0.62
  const dateBoxW = CONTENT_W - sigBoxW - 3
  const sigH = 14
  ensure(c, sigH + 8)
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
  if (draft.certSignatureName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setColor(doc, COLOR_INK)
    doc.text(draft.certSignatureName, PAGE_MARGIN + sigBoxW / 2, c.y + sigH - 2, { align: 'center' })
  }
  doc.setFontSize(6.5)
  setColor(doc, COLOR_MUTED)
  doc.setFont('helvetica', 'italic')
  doc.text('Signature Over Printed Name of Parent / Guardian', PAGE_MARGIN + sigBoxW / 2, c.y + sigH + 3, { align: 'center' })
  doc.text('Date', PAGE_MARGIN + sigBoxW + 3 + dateBoxW / 2, c.y + sigH + 3, { align: 'center' })
  c.y += sigH + 6

  // ── For use of DepEd Personnel Only ────────────────────────────
  ensure(c, 22)
  sectionHeader(c, 'For use of DepEd Personnel Only — to be filled up by the Class Adviser')
  {
    const dobBoxW = 64
    const gradeW = (CONTENT_W - dobBoxW - 4) / 2
    const yStart = c.y
    boxGroupRow(c, 'Date of First Attendance (Month/Day/Year)', [
      { value: '', n: 2 }, { value: '', n: 2 }, { value: '', n: 4 },
    ], ['/', '/'], { xStart: PAGE_MARGIN, widthW: dobBoxW })
    const y1 = c.y; c.y = yStart
    wrapField(c, 'Grade Level', levelLabel(level), { xStart: PAGE_MARGIN + dobBoxW + 2, w: gradeW, minLines: 1 })
    const y2 = c.y; c.y = yStart
    wrapField(c, 'Track (for SHS)', '', { xStart: PAGE_MARGIN + dobBoxW + 2 + gradeW + 2, w: gradeW, minLines: 1 })
    c.y = Math.max(y1, y2, c.y)
  }

  // PS-ODIR/SFRT footer marker bottom-right
  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(8)
  setColor(doc, COLOR_INK)
  doc.text('PS-ODIR/SFRT', PAGE_W - PAGE_MARGIN, PAGE_H - 6, { align: 'right' })

  // Filename header on every page (bottom-left)
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(6.5)
    setColor(doc, COLOR_MUTED)
    doc.setFont('helvetica', 'normal')
    const studentLabel = [draft.firstName, draft.lastName].filter(Boolean).join(' ') || user.email
    doc.text(`${studentLabel} · ${levelLabel(level)} · Page ${p} of ${pages}`, PAGE_MARGIN, PAGE_H - 6)
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
