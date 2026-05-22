// DepEd Basic Education Enrollment Form (Annex 2, DepEd Order 3, s.2018)
// generator. Lays out the form so the school can submit it as the
// government-required document.
//
// Layout notes (modelled from the page-1 reference):
//   • Monochrome black-on-white with light-grey section bands.
//   • Labels sit to the LEFT of boxed rows like LRN, DOB, Zip Code —
//     not above them. The label-above style is reserved for the wide
//     name rows (LAST/FIRST/MIDDLE NAME) where the row of boxes spans
//     nearly the full page.
//   • Short text fields use an underline beneath the label (PSA Birth
//     Cert No., House Street, City, Father's Name, …) rather than a
//     bordered rectangle.
//   • The two "For Returning Learners" and "For Learners in Senior High
//     School" bands always render, even if blank, so the layout always
//     matches the government form. The Class Adviser block at the
//     bottom is also always present.

import { jsPDF } from 'jspdf'
import { ageFromDob, levelLabel, type EnrollmentDraft, type EnrollmentLevel, type StoredUser } from './session'

const PAGE_MARGIN = 10
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - PAGE_MARGIN * 2

// Spacing tuned so the contents fill the A4 page rather than cramming at
// the top and leaving white space below.
const NAME_BOX_H = 6.2
const SMALL_BOX_H = 5.4
const SEC_BAND_H = 5
const SEC_BAND_GAP = 6.4
const LINE_H = 5.4
const ROW_GAP = 1.2

// Government-form palette: black ink, mid grey labels, light grey bands.
const C_INK:    [number, number, number] = [10, 10, 10]
const C_LABEL:  [number, number, number] = [60, 60, 60]
const C_BORDER: [number, number, number] = [120, 120, 120]
const C_BAND:   [number, number, number] = [219, 226, 240]   // pale blue-grey for section bands
const C_MUTED:  [number, number, number] = [110, 110, 110]

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

/* ─────────────────── primitives ─────────────────── */

/** Checkbox + inline label. Returns the x advanced past the label. */
function checkbox(doc: jsPDF, x: number, y: number, checked: boolean, label: string, gap = 1.2): number {
  setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
  doc.rect(x, y, 2.8, 2.8)
  if (checked) {
    setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text('X', x + 0.55, y + 2.3)
  }
  setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(label, x + 2.8 + gap, y + 2.3)
  return x + 2.8 + gap + doc.getTextWidth(label)
}

/** Pale-blue section band with centered bold title. */
function sectionHeader(c: Cursor, title: string) {
  ensure(c, SEC_BAND_GAP + 1)
  const { doc } = c
  setFill(doc, C_BAND); setDraw(doc, C_BORDER)
  doc.setLineWidth(0.25)
  doc.rect(PAGE_MARGIN, c.y, CONTENT_W, SEC_BAND_H, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  setColor(doc, C_INK)
  doc.text(title.toUpperCase(), PAGE_W / 2, c.y + SEC_BAND_H - 1.2, { align: 'center' })
  c.y += SEC_BAND_GAP
}

/** Inline boxed row: "LABEL: [_][_][_]…" all on one line. */
function inlineBoxRow(
  c: Cursor,
  label: string,
  value: string,
  n: number,
  opts: { xStart?: number; widthW?: number; labelW?: number; boxH?: number; charBoxW?: number } = {},
) {
  const { doc } = c
  const xStart = opts.xStart ?? PAGE_MARGIN
  const widthW = opts.widthW ?? CONTENT_W
  const boxH = opts.boxH ?? SMALL_BOX_H
  // measure the label width if not provided
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const labelW = opts.labelW ?? (doc.getTextWidth(label) + 2)
  const boxesW = opts.charBoxW ? Math.min(opts.charBoxW * n, widthW - labelW) : (widthW - labelW)
  const boxW = boxesW / n

  ensure(c, boxH + 2)

  setColor(doc, C_INK)
  doc.text(label, xStart, c.y + boxH - 1.3)

  setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
  const chars = (value ?? '').toUpperCase().padEnd(n, ' ').slice(0, n).split('')
  const startX = xStart + labelW
  for (let i = 0; i < n; i++) {
    const x = startX + i * boxW
    doc.rect(x, c.y, boxW, boxH)
    const ch = chars[i].trim()
    if (ch) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.min(boxH * 1.4, 9))
      doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.4, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    }
  }
  c.y += boxH + 1.6
}

/**
 * Inline label + underline (label LEFT, underline RIGHT). Used for fields
 * like EXTENSION NAME, Telephone No., Cellphone No., Grade Level, Track —
 * which have the label-to-the-left + line-extending-to-the-right pattern
 * from the source form.
 */
function inlineUnderline(
  c: Cursor,
  label: string,
  value: string | undefined,
  opts: { xStart?: number; widthW?: number; labelW?: number } = {},
) {
  const { doc } = c
  const xStart = opts.xStart ?? PAGE_MARGIN
  const widthW = opts.widthW ?? CONTENT_W
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const labelW = opts.labelW ?? (doc.getTextWidth(label) + 3)

  ensure(c, LINE_H + 1)
  setColor(doc, C_INK)
  doc.text(label, xStart, c.y + LINE_H - 2)

  const lineY = c.y + LINE_H - 1
  setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
  doc.line(xStart + labelW, lineY, xStart + widthW, lineY)
  if (value) {
    setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const safe = (doc.splitTextToSize(value, widthW - labelW - 1) as string[])[0] ?? value
    doc.text(safe, xStart + labelW + 0.5, c.y + LINE_H - 2.3)
  }
  c.y += LINE_H + ROW_GAP
}

/** Two inline-underline fields side-by-side. */
function inlineUnderlinePair(
  c: Cursor,
  left: { label: string; value?: string; labelW?: number },
  right: { label: string; value?: string; labelW?: number },
) {
  const halfW = (CONTENT_W - 6) / 2
  const yStart = c.y
  inlineUnderline(c, left.label, left.value, { xStart: PAGE_MARGIN, widthW: halfW, labelW: left.labelW })
  const y1 = c.y
  c.y = yStart
  inlineUnderline(c, right.label, right.value, { xStart: PAGE_MARGIN + halfW + 6, widthW: halfW, labelW: right.labelW })
  c.y = Math.max(y1, c.y)
}

/**
 * Wide boxed row — label sits to the LEFT of the row of boxes on the same
 * line. Used for LAST / FIRST / MIDDLE NAME. The label takes ~30mm so the
 * boxes still span ~160mm with ~20 cells.
 */
function nameBoxRow(c: Cursor, label: string, value: string, n: number, opts: { xStart?: number; widthW?: number; labelW?: number; boxH?: number } = {}) {
  const { doc } = c
  const xStart = opts.xStart ?? PAGE_MARGIN
  const widthW = opts.widthW ?? CONTENT_W
  const boxH = opts.boxH ?? NAME_BOX_H
  const labelW = opts.labelW ?? 30
  const boxesW = widthW - labelW
  const boxW = boxesW / n

  ensure(c, boxH + ROW_GAP)
  setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(label, xStart, c.y + boxH - 1.6)

  setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
  const chars = (value ?? '').toUpperCase().padEnd(n, ' ').slice(0, n).split('')
  for (let i = 0; i < n; i++) {
    const x = xStart + labelW + i * boxW
    doc.rect(x, c.y, boxW, boxH)
    const ch = chars[i].trim()
    if (ch) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
      doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.6, { align: 'center' })
    }
  }
  c.y += boxH + ROW_GAP
}

/** MM/DD/YYYY style row with separators between groups. */
function boxGroupInline(
  c: Cursor,
  label: string,
  groups: Array<{ value: string; n: number }>,
  separators: string[],
  opts: { xStart?: number; labelW?: number; boxH?: number; boxW?: number; sepW?: number } = {},
) {
  const { doc } = c
  const xStart = opts.xStart ?? PAGE_MARGIN
  const boxH = opts.boxH ?? SMALL_BOX_H
  const boxW = opts.boxW ?? 4.2
  const sepW = opts.sepW ?? 2.4

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const labelW = opts.labelW ?? (doc.getTextWidth(label) + 2)

  ensure(c, boxH + 2)

  setColor(doc, C_INK)
  doc.text(label, xStart, c.y + boxH - 1.3)

  setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
  let x = xStart + labelW
  groups.forEach((g, gi) => {
    const chars = g.value.toUpperCase().padEnd(g.n, ' ').slice(0, g.n).split('')
    for (let i = 0; i < g.n; i++) {
      doc.rect(x, c.y, boxW, boxH)
      const ch = chars[i].trim()
      if (ch) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        doc.text(ch, x + boxW / 2, c.y + boxH / 2 + 1.4, { align: 'center' })
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      }
      x += boxW
    }
    if (separators[gi] !== undefined) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(separators[gi], x + sepW / 2, c.y + boxH / 2 + 1.6, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      x += sepW
    }
  })
  // Return the right edge so callers can place follow-on widgets inline.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(c as any)._lastX = x
  c.y += boxH + 1.6
}

/**
 * Underline-style field: label small at top-left, horizontal line beneath
 * with the value sitting just above the line. Used for short text fields
 * (Religion, House/Street, Father's Name, …).
 */
function underlineField(
  c: Cursor,
  label: string,
  value: string | undefined,
  opts: { xStart?: number; w?: number; labelAbove?: boolean } = {},
) {
  const { doc } = c
  const xStart = opts.xStart ?? PAGE_MARGIN
  const w = opts.w ?? CONTENT_W
  const labelAbove = opts.labelAbove ?? true

  ensure(c, labelAbove ? LINE_H + 5 : LINE_H)
  setColor(doc, C_LABEL); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  if (labelAbove) {
    // Label sits at the top of the cell. We push c.y down further than
    // before so the 9pt value text (drawn just above the underline)
    // doesn't bleed up into the label baseline. ~5mm of vertical space
    // gives a clean separation between label and value.
    doc.text(label, xStart, c.y + 2.2)
    c.y += 5
  } else {
    doc.text(label, xStart, c.y + 2.4)
  }
  // Underline
  const lineY = c.y + 2.6
  setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
  doc.line(xStart, lineY, xStart + w, lineY)
  // Value text sitting just above the underline
  if (value) {
    setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const safe = (doc.splitTextToSize(value, w - 1) as string[])[0] ?? value
    doc.text(safe, xStart + 0.5, c.y + 1.7)
  }
  c.y += LINE_H
}

/** Two underline fields side-by-side. */
function underlinePair(c: Cursor, left: { label: string; value?: string }, right: { label: string; value?: string }) {
  const halfW = (CONTENT_W - 3) / 2
  const yStart = c.y
  underlineField(c, left.label, left.value, { xStart: PAGE_MARGIN, w: halfW })
  const y1 = c.y
  c.y = yStart
  underlineField(c, right.label, right.value, { xStart: PAGE_MARGIN + halfW + 3, w: halfW })
  c.y = Math.max(y1, c.y)
}

/* ─────────────────── main generator ─────────────────── */

export function generateEnrollmentPdf(user: StoredUser, draft: Partial<EnrollmentDraft>): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const c: Cursor = { doc, y: PAGE_MARGIN }

  const level: EnrollmentLevel = (draft.level ?? user.level ?? 'KINDER') as EnrollmentLevel

  // ── Top-right Annex 2 tag ────────────────────────────────────
  const tagW = 30, tagH = 6
  const tagX = PAGE_W - PAGE_MARGIN - tagW
  setDraw(doc, C_BORDER); doc.setLineWidth(0.4)
  doc.rect(tagX, PAGE_MARGIN, tagW, tagH)
  setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('ANNEX 2', tagX + tagW / 2, PAGE_MARGIN + 4.2, { align: 'center' })
  setColor(doc, C_MUTED); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8)
  doc.text('Deped Order 3, 2018', tagX + tagW / 2, PAGE_MARGIN + tagH + 3.2, { align: 'center' })

  // ── Title block (centered) ───────────────────────────────────
  setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text('BASIC EDUCATION ENROLLMENT FORM', PAGE_W / 2, PAGE_MARGIN + 5, { align: 'center' })
  setColor(doc, C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
  doc.text('THIS FORM IS NOT FOR SALE.', PAGE_W / 2, PAGE_MARGIN + 9, { align: 'center' })
  setColor(doc, C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5)
  doc.text('Check the appropriate box only:', PAGE_W / 2, PAGE_MARGIN + 13, { align: 'center' })
  c.y = PAGE_MARGIN + 15

  // ── School Year row + LRN status checkboxes ──────────────────
  ensure(c, 6)
  setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text('School Year:', PAGE_MARGIN, c.y + 3)
  let x = PAGE_MARGIN + 20
  const yrBoxW = 3.4, yrBoxH = 4.4
  setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
  const fromYr = (draft.schoolYearFrom ?? '').padEnd(4, ' ').slice(0, 4)
  for (let i = 0; i < 4; i++) {
    doc.rect(x + i * yrBoxW, c.y, yrBoxW, yrBoxH)
    const ch = fromYr[i].trim()
    if (ch) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(ch, x + i * yrBoxW + yrBoxW / 2, c.y + yrBoxH / 2 + 1.3, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    }
  }
  x += 4 * yrBoxW + 1.5
  doc.text('-', x, c.y + 3); x += 2.5
  const toYr = (draft.schoolYearTo ?? '').padEnd(4, ' ').slice(0, 4)
  for (let i = 0; i < 4; i++) {
    doc.rect(x + i * yrBoxW, c.y, yrBoxW, yrBoxH)
    const ch = toYr[i].trim()
    if (ch) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(ch, x + i * yrBoxW + yrBoxW / 2, c.y + yrBoxH / 2 + 1.3, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    }
  }
  x += 4 * yrBoxW + 6
  let cbX = x
  cbX = checkbox(doc, cbX, c.y + 0.6, draft.lrnStatus === 'NO_LRN',    'No LRN'); cbX += 6
  cbX = checkbox(doc, cbX, c.y + 0.6, draft.lrnStatus === 'WITH_LRN',  'With LRN'); cbX += 6
  checkbox(doc, cbX, c.y + 0.6, draft.lrnStatus === 'RETURNING',       'Returning (Balik-Aral)')
  c.y += 7

  // ═════════════════════════════════════════════════════════════
  // STUDENT INFORMATION
  // ═════════════════════════════════════════════════════════════
  sectionHeader(c, 'Student Information')

  inlineUnderline(c, 'PSA Birth Certificate No.', draft.psaBirthCertNo)
  c.y += 1.4

  inlineBoxRow(c, 'Learner Reference No. (LRN)', draft.lrn ?? '', 12, { labelW: 56, charBoxW: 6 })
  c.y += 1.4

  nameBoxRow(c, 'LAST NAME',   draft.lastName   ?? '', 20)
  nameBoxRow(c, 'FIRST NAME',  draft.firstName  ?? '', 20)
  nameBoxRow(c, 'MIDDLE NAME', draft.middleName ?? '', 20)

  inlineUnderline(c, 'EXTENSION NAME e.g. Jr., III (if applicable)', draft.extensionName)
  c.y += 1.4

  // DOB | SEX | AGE row
  {
    ensure(c, SMALL_BOX_H + 3)
    const yStart = c.y
    boxGroupInline(c, 'DATE OF BIRTH (Month/Day/Year)', [
      { value: dobMonth(draft.dob), n: 2 },
      { value: dobDay(draft.dob),   n: 2 },
      { value: dobYear(draft.dob),  n: 4 },
    ], ['/', '/'], { xStart: PAGE_MARGIN, labelW: 56, boxW: 4.4 })
    const y1 = c.y

    // Sex on the right of the DOB boxes
    c.y = yStart
    let sxX = PAGE_MARGIN + 56 + 4 * 4.4 + 2 + 4 * 4.4 + 2 + 4 * 4.4 + 6
    // Simpler — place at fixed x:
    sxX = PAGE_W - PAGE_MARGIN - 80
    setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('SEX', sxX, c.y + SMALL_BOX_H - 1.3)
    let chX = sxX + 9
    chX = checkbox(doc, chX, c.y + 0.6, draft.sex === 'MALE',   'MALE'); chX += 4
    chX = checkbox(doc, chX, c.y + 0.6, draft.sex === 'FEMALE', 'FEMALE')

    // Age on the far right
    const ageX = PAGE_W - PAGE_MARGIN - 20
    doc.text('AGE', ageX, c.y + SMALL_BOX_H - 1.3)
    setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
    doc.line(ageX + 6, c.y + SMALL_BOX_H - 0.8, ageX + 19, c.y + SMALL_BOX_H - 0.8)
    if (draft.dob) {
      const a = ageFromDob(draft.dob)
      if (a) {
        setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        doc.text(a, ageX + 12, c.y + SMALL_BOX_H - 1.6)
      }
    }
    c.y = Math.max(y1, c.y + SMALL_BOX_H + 1.6)
  }

  // IP membership row
  {
    ensure(c, 5)
    setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    const ipLabel = 'Belonging to any Indigenous Peoples (IP) Community / Indigenous Cultural Community?'
    doc.text(ipLabel, PAGE_MARGIN, c.y + 2.6)
    let xc = PAGE_MARGIN + doc.getTextWidth(ipLabel) + 4
    xc = checkbox(doc, xc, c.y + 0.4, draft.ipMember === 'NO',  'No');  xc += 4
    xc = checkbox(doc, xc, c.y + 0.4, draft.ipMember === 'YES', 'Yes'); xc += 6
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); setColor(doc, C_MUTED)
    doc.text('If Yes, please specify:', xc, c.y + 2.6); xc += doc.getTextWidth('If Yes, please specify:') + 2
    setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
    doc.line(xc, c.y + 3, PAGE_W - PAGE_MARGIN, c.y + 3)
    if (draft.ipMember === 'YES' && draft.ipCommunity) {
      setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      doc.text(draft.ipCommunity.slice(0, 40), xc + 0.5, c.y + 2.4)
    }
    c.y += 5
  }

  // Mother Tongue | Religion
  underlinePair(c,
    { label: 'Mother Tongue', value: draft.motherTongue },
    { label: 'Religion:',     value: draft.religion },
  )

  // ═════════════════════════════════════════════════════════════
  // ADDRESS
  // ═════════════════════════════════════════════════════════════
  sectionHeader(c, 'Address')
  underlineField(c, 'House Number and Street', draft.houseStreet)
  underlineField(c, 'Barangay', draft.barangay)
  // City/Municipality/Province/Country + Zip Code (4 boxes) on one row
  {
    const zipBoxW = 4.6
    const zipW = 4 * zipBoxW + 12
    const cityW = CONTENT_W - zipW - 3
    const yStart = c.y
    underlineField(c, 'City/Municipality/Province/Country', draft.cityProvinceCountry, { xStart: PAGE_MARGIN, w: cityW })
    const yAfterCity = c.y
    c.y = yStart
    // Zip Code label + 4 boxes inline
    setColor(doc, C_LABEL); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    const zipLabelX = PAGE_MARGIN + cityW + 3
    doc.text('Zip Code', zipLabelX, c.y + 2.2)
    c.y += 2.8
    setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
    const zip = (draft.zipCode ?? '').padEnd(4, ' ').slice(0, 4)
    for (let i = 0; i < 4; i++) {
      const bx = zipLabelX + 11 + i * zipBoxW
      doc.rect(bx, c.y - 1.4, zipBoxW, SMALL_BOX_H)
      const ch = zip[i].trim()
      if (ch) {
        setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
        doc.text(ch, bx + zipBoxW / 2, c.y + SMALL_BOX_H / 2 - 0.1, { align: 'center' })
      }
    }
    c.y = Math.max(yAfterCity, c.y + LINE_H - 2)
  }

  // ═════════════════════════════════════════════════════════════
  // PARENT'S / GUARDIAN'S INFORMATION
  // ═════════════════════════════════════════════════════════════
  sectionHeader(c, "Parent's / Guardian's Information")
  underlinePair(c,
    { label: "Father's Name (Last Name, First Name, Middle Name)", value: nameOf(draft.father) },
    { label: "Mother's Maiden Name (Last Name, First Name, Middle Name)", value: nameOf(draft.mother) },
  )
  underlineField(c, "Guardian's Name (Last Name, First Name, Middle Name)", nameOf(draft.guardian))
  inlineUnderlinePair(c,
    { label: 'Telephone No.', value: draft.telephone, labelW: 26 },
    { label: 'Cellphone No.', value: draft.cellphone, labelW: 26 },
  )

  // ═════════════════════════════════════════════════════════════
  // FOR RETURNING LEARNERS (BALIK-ARAL) — always shown
  // ═════════════════════════════════════════════════════════════
  sectionHeader(c, 'For Returning Learners (Balik-Aral) and Those Who Shall Transfer / Move In')
  underlinePair(c,
    { label: 'Last Grade Level Completed',  value: draft.lastGradeCompleted },
    { label: 'Last School Year Completed',  value: draft.lastSchoolYearCompleted },
  )
  // School Name + School ID (6 boxes) on one row
  {
    const idBoxW = 4.6
    const idTotalW = 6 * idBoxW + 16
    const nameW = CONTENT_W - idTotalW - 3
    const yStart = c.y
    underlineField(c, 'School Name', draft.previousSchoolName, { xStart: PAGE_MARGIN, w: nameW })
    const y1 = c.y
    c.y = yStart
    setColor(doc, C_LABEL); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    const idLabelX = PAGE_MARGIN + nameW + 3
    doc.text('School ID', idLabelX, c.y + 2.2)
    c.y += 2.8
    setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
    const sid = (draft.previousSchoolId ?? '').padEnd(6, ' ').slice(0, 6)
    for (let i = 0; i < 6; i++) {
      const bx = idLabelX + 13 + i * idBoxW
      doc.rect(bx, c.y - 1.4, idBoxW, SMALL_BOX_H)
      const ch = sid[i].trim()
      if (ch) {
        setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
        doc.text(ch, bx + idBoxW / 2, c.y + SMALL_BOX_H / 2 - 0.1, { align: 'center' })
      }
    }
    c.y = Math.max(y1, c.y + LINE_H - 2)
  }
  underlineField(c, 'School Address', draft.previousSchoolAddress)

  // ═════════════════════════════════════════════════════════════
  // FOR LEARNERS IN SENIOR HIGH SCHOOL — always shown
  // ═════════════════════════════════════════════════════════════
  sectionHeader(c, 'For Learners in Senior High School')
  // Semester checkboxes
  {
    ensure(c, 5)
    setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('Semester', PAGE_MARGIN, c.y + 2.6)
    let xc = PAGE_MARGIN + 22
    xc = checkbox(doc, xc, c.y + 0.4, false, '1st Sem');           xc += 6
    checkbox(doc, xc, c.y + 0.4, false, '2nd Sem')
    c.y += 5
  }
  underlinePair(c,
    { label: 'Track', value: undefined },
    { label: 'Strand (if any)', value: undefined },
  )

  // ── Certification ────────────────────────────────────────────
  ensure(c, 26)
  c.y += 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setColor(doc, C_INK)
  // The school's preferred certification wording — matches the Data
  // Privacy Act notice their LIS submission expects.
  const cert = 'I hereby certify that the above information given are true and correct to the best of my knowledge and I allow the Department of Education to use my child’s details to create and/or update his/her learner profile in the Learner Information System. The information herein shall be treated as confidential in compliance with the Data Privacy Act of 2012.'
  const certLines = doc.splitTextToSize(cert, CONTENT_W - 8) as string[]
  for (const ln of certLines) {
    ensure(c, 3.8)
    doc.text(ln, PAGE_MARGIN + 4, c.y + 2.8, { align: 'left' })
    c.y += 3.6
  }
  c.y += 3

  // Signature / Date row
  {
    const sigW = CONTENT_W * 0.62
    const dateW = CONTENT_W - sigW - 6
    setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN, c.y + 5, PAGE_MARGIN + sigW, c.y + 5)
    doc.line(PAGE_MARGIN + sigW + 6, c.y + 5, PAGE_MARGIN + sigW + 6 + dateW, c.y + 5)
    if (draft.certSignatureDataUrl) {
      try {
        doc.addImage(draft.certSignatureDataUrl, 'PNG', PAGE_MARGIN + 4, c.y - 4, sigW - 8, 9, undefined, 'FAST')
      } catch { /* ignore */ }
    }
    if (draft.certSignatureName) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(draft.certSignatureName, PAGE_MARGIN + sigW / 2, c.y + 4.6, { align: 'center' })
    }
    if (draft.certSignedAt) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text(new Date(draft.certSignedAt).toLocaleDateString(), PAGE_MARGIN + sigW + 6 + dateW / 2, c.y + 4.6, { align: 'center' })
    }
    setColor(doc, C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(7)
    doc.text('Signature Over Printed Name of Parent/Guardian', PAGE_MARGIN + sigW / 2, c.y + 8.4, { align: 'center' })
    doc.text('Date', PAGE_MARGIN + sigW + 6 + dateW / 2, c.y + 8.4, { align: 'center' })
    c.y += 12
  }

  // ═════════════════════════════════════════════════════════════
  // FOR USE OF DEPED PERSONNEL ONLY (dashed separator, plain label)
  // Compact rendering: smaller font + tighter padding so the form
  // lands on a single page.
  // ═════════════════════════════════════════════════════════════
  c.y += 1.5
  ensure(c, 11)
  setDraw(doc, C_BORDER); doc.setLineWidth(0.25)
  doc.setLineDashPattern([1, 1.4], 0)
  doc.line(PAGE_MARGIN, c.y, PAGE_W - PAGE_MARGIN, c.y)
  doc.setLineDashPattern([], 0)
  c.y += 1.6
  setColor(doc, C_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('For use of DepEd Personnel Only. To be filled up by the Class Adviser.', PAGE_W / 2, c.y + 2, { align: 'center' })
  c.y += 4

  boxGroupInline(c, 'DATE OF FIRST ATTENDANCE (Month/Day/Year)', [
    { value: '', n: 2 }, { value: '', n: 2 }, { value: '', n: 4 },
  ], ['/', '/'], { xStart: PAGE_MARGIN, labelW: 64, boxW: 3.6, boxH: 4 })
  // Compact Grade Level + Track row, rendered inline to bypass LINE_H height
  {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    const halfW = (CONTENT_W - 6) / 2
    const rowH = 4
    ensure(c, rowH + 1)
    setColor(doc, C_INK)
    doc.text('Grade Level', PAGE_MARGIN, c.y + rowH - 1)
    setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN + 18, c.y + rowH, PAGE_MARGIN + halfW, c.y + rowH)
    const lvl = levelLabel(level)
    if (lvl) {
      setColor(doc, C_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.text(lvl, PAGE_MARGIN + 18.5, c.y + rowH - 1.2)
      doc.setFontSize(7)
    }
    doc.text('Track (for SHS)', PAGE_MARGIN + halfW + 6, c.y + rowH - 1)
    setDraw(doc, C_BORDER); doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN + halfW + 6 + 24, c.y + rowH, PAGE_MARGIN + halfW + 6 + halfW, c.y + rowH)
    c.y += rowH + 0.6
  }

  // PS-ODIR/SFRT bottom-right
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8)
  setColor(doc, C_INK)
  doc.text('PS-ODIR/SFRT', PAGE_W - PAGE_MARGIN, PAGE_H - 6, { align: 'right' })

  // Per-page footer (left)
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
    setColor(doc, C_MUTED)
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
function dobMonth(dob?: string) { return dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob.slice(5, 7) : '' }
function dobDay(dob?: string)   { return dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob.slice(8, 10) : '' }
function dobYear(dob?: string)  { return dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob.slice(0, 4) : '' }
