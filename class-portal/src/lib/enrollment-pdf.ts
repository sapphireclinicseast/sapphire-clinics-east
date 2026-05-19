// DepEd Annex 2 Enrollment Form PDF generator. Pulls data from the
// EnrollmentDraft (the same data the parent filled on /enroll).

import { jsPDF } from 'jspdf'
import { ageFromDob, levelLabel, type EnrollmentDraft, type EnrollmentLevel, type StoredUser } from './session'

const PAGE_MARGIN = 14
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - PAGE_MARGIN * 2

const COLOR_NARRA: [number, number, number] = [27, 63, 56]
const COLOR_MOSS:  [number, number, number] = [38, 85, 75]
const COLOR_INK:   [number, number, number] = [26, 26, 26]
const COLOR_MIDGRAY: [number, number, number] = [107, 99, 87]
const COLOR_PAPER2: [number, number, number] = [236, 230, 217]

type Cursor = { doc: jsPDF; y: number }

function setColor(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]) }
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]) }
function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]) }

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

function fieldRow(c: Cursor, rows: Array<[string, string | undefined, number]>) {
  // rows: [label, value, widthFraction] - widths sum to 1.0
  const { doc } = c
  ensure(c, 9)
  const totalW = CONTENT_W
  let x = PAGE_MARGIN
  for (const [label, value, frac] of rows) {
    const w = totalW * frac
    setDraw(doc, [220, 211, 192])
    doc.setLineWidth(0.3)
    doc.rect(x, c.y, w, 8)
    setColor(doc, COLOR_MIDGRAY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(label, x + 1.5, c.y + 2.2)
    setColor(doc, COLOR_INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    const v = (value ?? '').trim() || ''
    const trimmed = doc.splitTextToSize(v, w - 3) as string[]
    if (trimmed[0]) doc.text(trimmed[0], x + 1.5, c.y + 6.3)
    x += w
  }
  c.y += 8
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

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13.5)
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
  let x = PAGE_MARGIN
  checkboxMark(doc, x, c.y, draft.lrnStatus === 'NO_LRN', 'No LRN'); x += 30
  checkboxMark(doc, x, c.y, draft.lrnStatus === 'WITH_LRN', 'With LRN'); x += 30
  checkboxMark(doc, x, c.y, draft.lrnStatus === 'RETURNING', 'Returning (Balik-Aral)')
  c.y += 7

  // 1. Student Information
  sectionHeader(c, 'Student Information', 'ANNEX 2')
  fieldRow(c, [
    ['PSA Birth Certificate No.', draft.psaBirthCertNo, 0.5],
    ['Learner Reference No. (LRN)', draft.lrn, 0.5],
  ])
  fieldRow(c, [
    ['LAST NAME', draft.lastName, 0.34],
    ['FIRST NAME', draft.firstName, 0.34],
    ['MIDDLE NAME', draft.middleName, 0.32],
  ])
  fieldRow(c, [
    ['EXTENSION NAME (Jr., III, …)', draft.extensionName, 0.34],
    ['DATE OF BIRTH (MM/DD/YYYY)', draft.dob, 0.34],
    ['SEX', draft.sex, 0.16],
    ['AGE', draft.dob ? ageFromDob(draft.dob) : '', 0.16],
  ])
  fieldRow(c, [
    ['IP / ICC Community?', draft.ipMember, 0.34],
    ['If Yes, please specify', draft.ipCommunity, 0.66],
  ])
  fieldRow(c, [
    ['MOTHER TONGUE', draft.motherTongue, 0.5],
    ['RELIGION', draft.religion, 0.5],
  ])
  if (draft.diagnosis) {
    fieldRow(c, [['DIAGNOSIS / CONDITIONS', draft.diagnosis, 1]])
  }

  // 2. Address
  sectionHeader(c, 'Address')
  fieldRow(c, [
    ['House Number and Street', draft.houseStreet, 0.5],
    ['Barangay', draft.barangay, 0.3],
    ['Zip Code', draft.zipCode, 0.2],
  ])
  fieldRow(c, [['City / Municipality / Province / Country', draft.cityProvinceCountry, 1]])

  // 3. Parent / Guardian
  sectionHeader(c, "Parent's / Guardian's Information")
  fieldRow(c, [['Father\'s Name (Last, First, Middle)', nameOf(draft.father), 0.6], ['Occupation', draft.fatherOccupation, 0.4]])
  fieldRow(c, [['Mother\'s Maiden Name (Last, First, Middle)', nameOf(draft.mother), 0.6], ['Occupation', draft.motherOccupation, 0.4]])
  fieldRow(c, [['Guardian\'s Name (Last, First, Middle)', draft.guardianOfRecord === 'OTHER' ? nameOf(draft.guardian) : (draft.guardianOfRecord === 'FATHER' ? nameOf(draft.father) : nameOf(draft.mother)), 1]])
  fieldRow(c, [
    ['Telephone No.', draft.telephone, 0.34],
    ['Cellphone No.', draft.cellphone, 0.34],
    ['Email Address', draft.email, 0.32],
  ])

  // 4. Returning / Transferee
  if (draft.isReturningOrTransferee === 'YES') {
    sectionHeader(c, 'For Returning Learners (Balik-Aral) and Those Who Shall Transfer / Move In')
    fieldRow(c, [
      ['Last Grade Level Completed', draft.lastGradeCompleted, 0.5],
      ['Last School Year Completed', draft.lastSchoolYearCompleted, 0.5],
    ])
    fieldRow(c, [
      ['School Name', draft.previousSchoolName, 0.66],
      ['School ID', draft.previousSchoolId, 0.34],
    ])
    fieldRow(c, [['School Address', draft.previousSchoolAddress, 1]])
  }

  // 5. Grade level confirmation (this is a class-portal addition; not strictly Annex 2)
  sectionHeader(c, 'Class Program Enrollment Level')
  fieldRow(c, [['Enrolled Grade Level (SCEI × LBCA SPED Class Program)', levelLabel(level), 1]])

  // 6. Certification + signature
  sectionHeader(c, 'Certification')
  helperBodyText(c, 'I hereby certify that the above information given are true and correct to the best of my knowledge and I allow the Department of Education to use my child\'s details to create and/or update his/her learner profile in the Learner Information System. The information herein shall be treated as confidential in compliance with the Data Privacy Act of 2012.')
  c.y += 2

  // Signature block
  const sigBoxW = CONTENT_W * 0.6
  const dateBoxW = CONTENT_W - sigBoxW - 4
  ensure(c, 30)
  setDraw(doc, COLOR_PAPER2)
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
  doc.text('Signature Over Printed Name of Parent/Guardian', PAGE_MARGIN + sigBoxW / 2, c.y + 24, { align: 'center' })
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
