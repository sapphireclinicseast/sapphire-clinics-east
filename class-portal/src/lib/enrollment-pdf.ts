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

const PAGE_MARGIN = 14
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - PAGE_MARGIN * 2

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
  doc.setLineWidth(0.5)
  doc.rect(x, y, 4, 4)
  if (checked) {
    setFill(doc, COLOR_NARRA)
    doc.rect(x + 0.9, y + 0.9, 2.2, 2.2, 'F')
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, COLOR_INK)
  doc.text(label, x + 6, y + 3.2)
}

function sectionHeader(c: Cursor, title: string, annex?: string) {
  ensure(c, 9)
  const { doc } = c
  setFill(doc, COLOR_NARRA)
  doc.rect(PAGE_MARGIN, c.y, CONTENT_W, 6.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(title.toUpperCase(), PAGE_MARGIN + 2.5, c.y + 4.5)
  if (annex) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'italic')
    doc.text(annex, PAGE_W - PAGE_MARGIN - 2.5, c.y + 4.5, { align: 'right' })
  }
  c.y += 8
}

/**
 * Row with one square per character — matches the DepEd Annex 2 style.
 * Pads `value` to `n` characters with spaces; truncates if too long. The
 * label sits in its own band above the boxes so wide names still fit.
 */
function boxRow(c: Cursor, label: string, value: string, n: number, opts: { boxH?: number; labelW?: number } = {}) {
  const { doc } = c
  const labelW = opts.labelW ?? 0
  const boxH = opts.boxH ?? 7
  const boxW = (CONTENT_W - labelW) / n

  ensure(c, boxH + 5)

  let startX = PAGE_MARGIN
  if (labelW > 0) {
    // Inline label to the left
    setColor(doc, COLOR_MOSS)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    const lines = doc.splitTextToSize(label, labelW - 2) as string[]
    lines.slice(0, 2).forEach((ln, i) => doc.text(ln, PAGE_MARGIN, c.y + 3 + i * 3))
    startX = PAGE_MARGIN + labelW
  } else {
    // Label above the boxes
    setColor(doc, COLOR_MOSS)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(label.toUpperCase(), PAGE_MARGIN, c.y + 2.5)
    c.y += 3.2
  }

  // Boxes
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.3)
  const chars = (value ?? '').toUpperCase().padEnd(n, ' ').slice(0, n).split('')
  for (let i = 0; i < n; i++) {
    const x = startX + i * boxW
    doc.rect(x, c.y, boxW, boxH)
    const ch = chars[i].trim()
    if (ch) {
      setColor(doc, COLOR_INK)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(Math.min(boxH * 1.35, 11))
      doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.8, { align: 'center' })
    }
  }
  c.y += boxH + 2.5
}

/**
 * Row of separate fixed-width boxed groups (for DOB: MM/DD/YYYY).
 * `groups` describes each segment's width in characters and the value to render.
 */
function boxGroupRow(c: Cursor, label: string, groups: Array<{ value: string; n: number }>, separators: string[]) {
  const { doc } = c
  const boxH = 7
  // total chars + separator widths
  const totalChars = groups.reduce((a, g) => a + g.n, 0)
  const sepWidthMm = 3
  const totalSepMm = sepWidthMm * separators.length
  const remaining = CONTENT_W - totalSepMm
  const boxW = Math.min(7.5, remaining / totalChars)

  ensure(c, boxH + 6)
  setColor(doc, COLOR_MOSS)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(label.toUpperCase(), PAGE_MARGIN, c.y + 2.5)
  c.y += 3.2

  let x = PAGE_MARGIN
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.3)
  groups.forEach((g, gi) => {
    const chars = g.value.toUpperCase().padEnd(g.n, ' ').slice(0, g.n).split('')
    for (let i = 0; i < g.n; i++) {
      doc.rect(x, c.y, boxW, boxH)
      const ch = chars[i].trim()
      if (ch) {
        setColor(doc, COLOR_INK)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.8, { align: 'center' })
      }
      x += boxW
    }
    // separator
    if (separators[gi] !== undefined) {
      setColor(doc, COLOR_MOSS)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(separators[gi], x + sepWidthMm / 2, c.y + boxH / 2 + 1.8, { align: 'center' })
      x += sepWidthMm
    }
  })
  c.y += boxH + 2.5
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
  doc.setFontSize(7)
  doc.text(label.toUpperCase(), xStart, c.y + 2.5)
  c.y += 3.2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  setColor(doc, COLOR_INK)
  const lines = (v ? doc.splitTextToSize(v, w - 4) : []) as string[]
  const renderLines = Math.max(lines.length, minLines)
  const lineH = 4.5
  const padY = 2
  const cellH = padY * 2 + renderLines * lineH

  ensure(c, cellH + 3)
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.3)
  doc.rect(xStart, c.y, w, cellH)
  lines.forEach((ln, i) => doc.text(ln, xStart + 2, c.y + padY + lineH * (i + 0.75)))
  c.y += cellH + 2.5
}

/** Two wrap fields side-by-side, each taking half of the content width. */
function wrapFieldPair(c: Cursor, left: { label: string; value?: string }, right: { label: string; value?: string }) {
  const halfW = (CONTENT_W - 2) / 2

  // Compute the taller of the two cells so they align bottoms.
  const startY = c.y
  // Render left
  const yBeforeLeft = c.y
  wrapField(c, left.label, left.value, { w: halfW, xStart: PAGE_MARGIN })
  const yAfterLeft = c.y
  // Reset to render right at the same start
  c.y = yBeforeLeft
  wrapField(c, right.label, right.value, { w: halfW, xStart: PAGE_MARGIN + halfW + 2 })
  const yAfterRight = c.y
  c.y = Math.max(yAfterLeft, yAfterRight)
  void startY
}

function helperBodyText(c: Cursor, text: string, opts: { size?: number; italic?: boolean; bold?: boolean; color?: [number, number, number] } = {}) {
  const { doc } = c
  doc.setFont('helvetica', opts.italic ? 'italic' : opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 8.5)
  setColor(doc, opts.color ?? COLOR_INK)
  const lines = doc.splitTextToSize(text, CONTENT_W) as string[]
  for (const ln of lines) {
    ensure(c, 5)
    doc.text(ln, PAGE_MARGIN, c.y + 3.3)
    c.y += 4.5
  }
}

export function generateEnrollmentPdf(user: StoredUser, draft: Partial<EnrollmentDraft>): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const c: Cursor = { doc, y: PAGE_MARGIN }

  const level: EnrollmentLevel = (draft.level ?? user.level ?? 'KINDER') as EnrollmentLevel

  // ── Title ─────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(doc, COLOR_NARRA)
  doc.text('SAPPHIRE CLINICS EAST × LIGHT BEARER CHRISTIAN ACADEMY', PAGE_W / 2, c.y + 6, { align: 'center' })
  doc.setFontSize(11)
  setColor(doc, COLOR_MOSS)
  doc.text('ENROLLMENT FORM — School Year ' + (draft.schoolYearFrom && draft.schoolYearTo ? `${draft.schoolYearFrom}–${draft.schoolYearTo}` : '_______'), PAGE_W / 2, c.y + 11.5, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  setColor(doc, COLOR_MIDGRAY)
  doc.text('DepEd Annex 2 · Learner Information', PAGE_W / 2, c.y + 16, { align: 'center' })
  c.y += 20
  setDraw(doc, COLOR_PAPER2)
  doc.line(PAGE_MARGIN, c.y, PAGE_W - PAGE_MARGIN, c.y)
  c.y += 4

  // LRN status row + School year inputs
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  setColor(doc, COLOR_MOSS)
  doc.text('Check the appropriate box only:', PAGE_MARGIN, c.y + 3.5)
  doc.text(`School Year: ${draft.schoolYearFrom ?? '____'} — ${draft.schoolYearTo ?? '____'}`, PAGE_W - PAGE_MARGIN, c.y + 3.5, { align: 'right' })
  c.y += 6
  let cbX = PAGE_MARGIN
  checkboxMark(doc, cbX, c.y, draft.lrnStatus === 'NO_LRN',    'No LRN'); cbX += 30
  checkboxMark(doc, cbX, c.y, draft.lrnStatus === 'WITH_LRN',  'With LRN'); cbX += 30
  checkboxMark(doc, cbX, c.y, draft.lrnStatus === 'RETURNING', 'Returning (Balik-Aral)')
  c.y += 8

  // ── 1. Student Information ────────────────────────────
  sectionHeader(c, 'Student Information', 'ANNEX 2')

  // PSA Birth Cert No. (wider, can have dashes etc) — single text field
  wrapFieldPair(
    c,
    { label: 'PSA Birth Certificate No.', value: draft.psaBirthCertNo },
    { label: 'Religion', value: draft.religion },
  )

  // LRN: 12 per-character boxes
  boxRow(c, 'Learner Reference No. (LRN)', draft.lrn ?? '', 12)

  // LAST NAME: 22 boxes
  boxRow(c, 'Last Name', draft.lastName ?? '', 22)
  // FIRST NAME
  boxRow(c, 'First Name', draft.firstName ?? '', 22)
  // MIDDLE NAME
  boxRow(c, 'Middle Name', draft.middleName ?? '', 22)
  // EXTENSION NAME (free text, allow long like "Jr., III")
  wrapField(c, 'Extension Name (e.g. Jr., III)', draft.extensionName)

  // Date of Birth + Sex + Age — separate boxed groups
  boxGroupRow(c, 'Date of Birth (Month / Day / Year)', [
    { value: dobMonth(draft.dob), n: 2 },
    { value: dobDay(draft.dob),   n: 2 },
    { value: dobYear(draft.dob),  n: 4 },
  ], ['/', '/'])

  // Sex + Age side-by-side: render as two short labelled rows
  {
    const { doc: d } = c
    ensure(c, 11)
    // Sex
    setColor(d, COLOR_MOSS); d.setFont('helvetica', 'bold'); d.setFontSize(7)
    d.text('SEX', PAGE_MARGIN, c.y + 2.5)
    // Age
    d.text('AGE', PAGE_MARGIN + CONTENT_W / 2 + 4, c.y + 2.5)
    c.y += 3.2
    // Sex checkboxes
    let sx = PAGE_MARGIN
    checkboxMark(d, sx, c.y, draft.sex === 'MALE', 'Male'); sx += 22
    checkboxMark(d, sx, c.y, draft.sex === 'FEMALE', 'Female')
    // Age boxes (2 digits)
    const ageStr = draft.dob ? ageFromDob(draft.dob) : ''
    const ageX = PAGE_MARGIN + CONTENT_W / 2 + 4
    const boxH = 7, boxW = 7
    setDraw(d, COLOR_BORDER); d.setLineWidth(0.3)
    for (let i = 0; i < 2; i++) {
      d.rect(ageX + i * boxW, c.y - 1, boxW, boxH)
      const ch = ageStr.padStart(2, ' ')[i]?.trim() ?? ''
      if (ch) {
        setColor(d, COLOR_INK); d.setFont('helvetica', 'bold'); d.setFontSize(10)
        d.text(ch, ageX + i * boxW + boxW / 2, c.y + boxH / 2 + 0.7, { align: 'center' })
      }
    }
    c.y += 9
  }

  // IP membership
  {
    const { doc: d } = c
    ensure(c, 8)
    setColor(d, COLOR_MOSS); d.setFont('helvetica', 'bold'); d.setFontSize(7.5)
    d.text('Belonging to any Indigenous Peoples (IP) Community / Indigenous Cultural Community?', PAGE_MARGIN, c.y + 2.5)
    c.y += 3.2
    let x = PAGE_MARGIN
    checkboxMark(d, x, c.y, draft.ipMember === 'YES', 'Yes'); x += 22
    checkboxMark(d, x, c.y, draft.ipMember === 'NO',  'No');  x += 22
    if (draft.ipMember === 'YES') {
      d.setFont('helvetica', 'italic'); d.setFontSize(8); setColor(d, COLOR_MIDGRAY)
      d.text('Specify:', x, c.y + 3); x += 14
      setColor(d, COLOR_INK); d.setFont('helvetica', 'bold'); d.setFontSize(9.5)
      d.text(doc.splitTextToSize(draft.ipCommunity ?? '', PAGE_W - PAGE_MARGIN - x)[0] ?? '', x, c.y + 3)
    }
    c.y += 6
  }

  // Mother tongue (wraps)
  wrapField(c, 'Mother Tongue', draft.motherTongue)

  // Diagnosis (wraps)
  if (draft.diagnosis) wrapField(c, 'Diagnosis / Conditions', draft.diagnosis)

  // ── 2. Address ────────────────────────────────────────
  sectionHeader(c, 'Address')
  wrapField(c, 'House Number and Street', draft.houseStreet)
  wrapFieldPair(
    c,
    { label: 'Barangay', value: draft.barangay },
    { label: 'City / Municipality / Province / Country', value: draft.cityProvinceCountry },
  )
  // ZIP code — 4 per-character boxes, aligned to the left half
  boxRow(c, 'Zip Code', (draft.zipCode ?? '').padStart(4, ' ').slice(0, 4), 4, { boxH: 7 })

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
  wrapFieldPair(
    c,
    { label: 'Telephone No.', value: draft.telephone },
    { label: 'Cellphone No.', value: draft.cellphone },
  )
  // Email gets its own full-width wrap row — emails are long and must show in full
  wrapField(c, 'Email Address', draft.email)

  // ── 4. Returning / Transferee (conditional) ──────────
  if (draft.isReturningOrTransferee === 'YES') {
    sectionHeader(c, 'For Returning Learners (Balik-Aral) and Those Who Shall Transfer / Move In')
    wrapFieldPair(
      c,
      { label: 'Last Grade Level Completed', value: draft.lastGradeCompleted },
      { label: 'Last School Year Completed', value: draft.lastSchoolYearCompleted },
    )
    wrapFieldPair(
      c,
      { label: 'School Name', value: draft.previousSchoolName },
      { label: 'School ID', value: draft.previousSchoolId },
    )
    wrapField(c, 'School Address', draft.previousSchoolAddress)
  }

  // ── 5. Class Program ──────────────────────────────────
  sectionHeader(c, 'Class Program Enrollment Level')
  wrapField(c, 'Enrolled Grade Level (SCEI × LBCA SPED Class Program)', levelLabel(level))

  // ── 6. Certification + Signature ──────────────────────
  sectionHeader(c, 'Certification')
  helperBodyText(c, 'I hereby certify that the above information given are true and correct to the best of my knowledge and I allow the Department of Education to use my child\'s details to create and/or update his/her learner profile in the Learner Information System. The information herein shall be treated as confidential in compliance with the Data Privacy Act of 2012.')
  c.y += 2

  const sigBoxW = CONTENT_W * 0.6
  const dateBoxW = CONTENT_W - sigBoxW - 4
  ensure(c, 30)
  setDraw(doc, COLOR_BORDER)
  doc.setLineWidth(0.4)
  doc.rect(PAGE_MARGIN, c.y, sigBoxW, 20)
  doc.rect(PAGE_MARGIN + sigBoxW + 4, c.y, dateBoxW, 20)
  if (draft.certSignatureDataUrl) {
    try { doc.addImage(draft.certSignatureDataUrl, 'PNG', PAGE_MARGIN + 2, c.y + 2, sigBoxW - 4, 16, undefined, 'FAST') } catch { /* ignore */ }
  }
  if (draft.certSignedAt) {
    doc.setFontSize(10)
    setColor(doc, COLOR_INK)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date(draft.certSignedAt).toLocaleDateString(), PAGE_MARGIN + sigBoxW + 4 + dateBoxW / 2, c.y + 12, { align: 'center' })
  }
  doc.setFontSize(7.5)
  setColor(doc, COLOR_MIDGRAY)
  doc.setFont('helvetica', 'italic')
  doc.text('Signature Over Printed Name of Parent / Guardian', PAGE_MARGIN + sigBoxW / 2, c.y + 24, { align: 'center' })
  doc.text('Date', PAGE_MARGIN + sigBoxW + 4 + dateBoxW / 2, c.y + 24, { align: 'center' })
  if (draft.certSignatureName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setColor(doc, COLOR_INK)
    doc.text(draft.certSignatureName, PAGE_MARGIN + sigBoxW / 2, c.y + 28, { align: 'center' })
  }
  c.y += 30

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
