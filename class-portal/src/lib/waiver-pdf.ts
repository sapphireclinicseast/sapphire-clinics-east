// Generates the SCEI × LBCA Parent/Guardian Waiver PDF from a WaiverRecord.
// Uses jsPDF — pure client-side. Produces a multi-page A4 document with:
//   - Heading + intro paragraph
//   - Sectioned tables of the student / parent / fetcher / emergency / medical info
//   - The 13 numbered clauses with initials boxes filled in
//   - Photo release checkbox indicating the parent's choice
//   - Signature block: Parent + (optional) Secondary parent + Witness + SCEI Rep
//   - Notarial acknowledgment template
//
// Re-callable: after the witness signs we re-render and re-download.

import { jsPDF } from 'jspdf'
import { levelLabel, type WaiverRecord } from './session'

const PAGE_MARGIN_X = 14
const PAGE_MARGIN_TOP = 16
const PAGE_W = 210 // A4 mm
const PAGE_H = 297
const CONTENT_W = PAGE_W - PAGE_MARGIN_X * 2

// ── Brand palette — Aura Academy (lighter than the original SCEI teal). ──
const COLOR_NARRA: [number, number, number] = [61, 107, 98]
const COLOR_MOSS:  [number, number, number] = [84, 125, 114]
const COLOR_INK:   [number, number, number] = [26, 26, 26]
const COLOR_MIDGRAY: [number, number, number] = [107, 99, 87]
const COLOR_PAPER2: [number, number, number] = [236, 230, 217]

const CLAUSES: Array<{ key: string; title: string; body: string }> = [
  { key: '5.1', title: '5.1 Location of Classes', body: 'I understand and acknowledge that all academic classes, SPED instruction, therapy-integrated learning sessions, and intervention activities under the Program shall be conducted at the SCEI premises — and NOT at the campus of Light Bearer Christian Academy (LBCA).' },
  { key: '5.2', title: '5.2 Nature of Services', body: 'I have been informed of the nature, scope, and methods of the educational and intervention services to be provided to my child, including the use of individualized education plans (IEPs), behavioral support strategies, sensory-integration approaches, and therapy-integrated learning. I understand that participation in clinic-based educational and therapeutic activities carries inherent risks ordinarily associated with such activities, and I voluntarily assume those risks on behalf of my child.' },
  { key: '5.3', title: '5.3 Qualifications & Standards', body: "I acknowledge that SCEI's SPED teachers, therapists, and specialists shall meet the minimum qualifications described in the SCEI × LBCA Partnership Agreement (relevant degrees, valid PRC licenses, SPED training), and that programs shall be delivered in alignment with K–12 DepEd standards, recognized SPED frameworks, and my child's IEP." },
  { key: '5.4', title: '5.4 Class Sizes', body: 'I acknowledge that the Program shall observe maximum student-to-teacher ratios of 1:1 (high-support students per IEP), 1:5 (small-group SPED instruction), or 1:10 (inclusive/mainstream-style academic classes with shadow teacher as the IEP requires). Any deviation requires my prior written consent.' },
  { key: '5.5', title: '5.5 Authority to Administer First Aid', body: 'I authorize SCEI personnel to administer basic first aid to my child whenever, in their reasonable judgment, such care is necessary. I further authorize SCEI personnel to seek emergency medical attention for my child, including transportation to a medical facility, when reasonably necessary, and I agree to be responsible for any resulting medical costs.' },
  { key: '5.6', title: '5.6 Data Privacy Consent (R.A. 10173)', body: "I freely and expressly consent to the collection, use, storage, and limited sharing of my child's and my own personal and sensitive personal information between SCEI and LBCA, strictly for the purposes of enrollment, academic supervision, LIS registration with the Department of Education, issuance of school records, billing, communication with the Parent/Guardian, and other legitimate educational and student-support purposes, in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and Regulations, and applicable issuances of the National Privacy Commission. I have been informed of my rights as a data subject." },
  { key: '5.7', title: "5.7 LBCA's Limited Role", body: "I acknowledge and agree that LBCA's role under the Program is limited to academic supervision, enrollment, LIS registration, and the issuance of official school records (e.g., LRN, Form 137, Report Cards, certificates, transfer credentials). LBCA does NOT provide on-site supervision, custody, or in-person care of students at the SCEI premises, and I shall not look to LBCA for the same." },
  { key: '5.8', title: '5.8 Release of LBCA', body: "To the fullest extent permitted by law, I release, waive, and hold LBCA, its trustees, officers, employees, agents, and representatives free and harmless from any and all claims, demands, liabilities, costs, damages, or expenses arising solely from incidents that occur at the SCEI premises and within SCEI's exclusive control, save for those caused by LBCA's own gross negligence or willful misconduct." },
  { key: '5.9', title: '5.9 Assumption of Risk for Clinic Premises', body: "I understand that no educational or clinical setting can be entirely free of risk. I voluntarily assume the ordinary and reasonably foreseeable risks of my child's participation in the Program at the SCEI premises, including minor injuries, allergic reactions, behavioral incidents involving other students, and illness exposure, except to the extent caused by SCEI's gross negligence or willful misconduct." },
  { key: '5.10', title: '5.10 Behavioral and Crisis Interventions', body: 'I authorize SCEI personnel to use developmentally appropriate, evidence-based, and least-restrictive behavioral and crisis-management strategies when reasonably necessary to safeguard my child or others. SCEI shall notify me promptly in the event of any significant behavioral incident.' },
  { key: '5.11', title: '5.11 Communication & Reporting', body: 'I agree to maintain accurate and current contact information on file with SCEI; to respond promptly to communications regarding my child; and to attend scheduled parent conferences, IEP reviews, and progress meetings to the best of my ability.' },
  { key: '5.12', title: '5.12 Compliance with Program Policies', body: "I agree that my child and our family shall comply with SCEI's published policies, including its Child Protection Policy, attendance and tardiness policy, dress code, fee schedule, and code of conduct. I understand that material non-compliance may result in suspension or termination of enrollment." },
  { key: '5.13', title: '5.13 Truthfulness of Information', body: "I represent and warrant that all information I have provided in this Waiver and in my child's enrollment documents is true, accurate, and complete to the best of my knowledge. I shall promptly inform SCEI of any material change." },
  { key: '5.14', title: '5.14 Parent-Provided Shadow Teacher', body: "If I wish to assign a personal shadow teacher to accompany my child in the Aura Academy for Learning class, I may do so subject to the following: (a) I must coordinate the engagement in advance with SCEI's front desk and the assigned SPED teacher; (b) I must endorse and submit a copy of the shadow teacher's current PRC (Professional Regulation Commission) license to the clinic before the shadow teacher attends any class session; (c) the shadow teacher is engaged solely by me and is not an employee, agent, or representative of SCEI or LBCA; and (d) SCEI and LBCA are not liable for the acts, omissions, qualifications, supervision, compensation, or conduct of the parent-provided shadow teacher." },
  { key: '5.15', title: '5.15 Tuition Obligation on Withdrawal', body: "I understand and agree that tuition fees are payable in full for the entire school year regardless of when, or for what reason, my child stops attending. If I have chosen an installment payment plan (bi-annual or monthly), I remain obligated to pay the outstanding balance of tuition in full. The school will not issue clearance, Form 137 / SF10, transfer credentials, Report Card / SF9, or any other academic records until the full tuition balance has been settled." },
]

type Cursor = { doc: jsPDF; y: number }

function ensureSpace(c: Cursor, needed: number) {
  if (c.y + needed > PAGE_H - PAGE_MARGIN_TOP) {
    c.doc.addPage()
    c.y = PAGE_MARGIN_TOP
  }
}

function setColor(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2])
}
function setFillColor(doc: jsPDF, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2])
}
function setDrawColor(doc: jsPDF, color: [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2])
}

function drawHeading(c: Cursor) {
  const { doc } = c
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  setColor(doc, COLOR_NARRA)
  doc.text('AURA ACADEMY FOR LEARNING', PAGE_W / 2, c.y + 6, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9.5)
  setColor(doc, COLOR_MOSS)
  doc.text('operated by Sapphire Clinics East, Inc. × Light Bearer Christian Academy', PAGE_W / 2, c.y + 11.5, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setColor(doc, COLOR_NARRA)
  doc.text('PARENT/GUARDIAN WAIVER, ACKNOWLEDGMENT, AND CONSENT FORM', PAGE_W / 2, c.y + 18, { align: 'center' })
  c.y += 22
  // thin divider
  setDrawColor(doc, COLOR_PAPER2)
  doc.setLineWidth(0.4)
  doc.line(PAGE_MARGIN_X, c.y, PAGE_W - PAGE_MARGIN_X, c.y)
  c.y += 4
}

function sectionTitle(c: Cursor, title: string) {
  ensureSpace(c, 12)
  const { doc } = c
  setFillColor(doc, COLOR_NARRA)
  doc.rect(PAGE_MARGIN_X, c.y, CONTENT_W, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(title.toUpperCase(), PAGE_MARGIN_X + 2.5, c.y + 4.2)
  c.y += 8
}

function bodyText(c: Cursor, text: string, opts: { size?: number; bold?: boolean; italic?: boolean; color?: [number, number, number] } = {}) {
  const { doc } = c
  doc.setFont('helvetica', opts.italic ? 'italic' : opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 9.5)
  setColor(doc, opts.color ?? COLOR_INK)
  const lines = doc.splitTextToSize(text, CONTENT_W) as string[]
  for (const line of lines) {
    ensureSpace(c, 5)
    doc.text(line, PAGE_MARGIN_X, c.y + 3.5)
    c.y += 5
  }
}

/** Two-column key/value table. Values empty-string → dash. */
function infoTable(c: Cursor, rows: Array<[string, string | undefined]>) {
  const { doc } = c
  const labelW = 58
  const valueW = CONTENT_W - labelW
  doc.setFontSize(9)
  for (const [label, value] of rows) {
    ensureSpace(c, 6.5)
    setFillColor(doc, COLOR_PAPER2)
    doc.rect(PAGE_MARGIN_X, c.y, labelW, 6, 'F')
    setDrawColor(doc, [220, 211, 192])
    doc.rect(PAGE_MARGIN_X + labelW, c.y, valueW, 6)
    setColor(doc, COLOR_MOSS)
    doc.setFont('helvetica', 'bold')
    doc.text(label, PAGE_MARGIN_X + 2, c.y + 4)
    setColor(doc, COLOR_INK)
    doc.setFont('helvetica', 'normal')
    const v = (value ?? '').trim()
    const truncated = doc.splitTextToSize(v || '—', valueW - 4) as string[]
    doc.text(truncated[0] ?? '', PAGE_MARGIN_X + labelW + 2, c.y + 4)
    c.y += 6
  }
  c.y += 2
}

function clauseBox(c: Cursor, key: string, title: string, body: string, initials: string) {
  const { doc } = c
  const boxSize = 12 // mm
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  setColor(doc, COLOR_MOSS)
  const titleLines = doc.splitTextToSize(title, CONTENT_W - boxSize - 4) as string[]
  doc.setFont('helvetica', 'normal')
  setColor(doc, COLOR_INK)
  doc.setFontSize(9)
  const bodyLines = doc.splitTextToSize(body, CONTENT_W - boxSize - 4) as string[]
  const blockH = Math.max(titleLines.length * 4.3 + bodyLines.length * 4 + 3, boxSize + 3)
  ensureSpace(c, blockH + 2)

  // initials box
  setDrawColor(doc, COLOR_NARRA)
  doc.setLineWidth(0.5)
  doc.rect(PAGE_W - PAGE_MARGIN_X - boxSize, c.y, boxSize, boxSize)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, COLOR_NARRA)
  if (initials.trim()) {
    doc.text(initials.toUpperCase().slice(0, 4), PAGE_W - PAGE_MARGIN_X - boxSize / 2, c.y + boxSize / 2 + 2, { align: 'center' })
  }
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  setColor(doc, COLOR_MIDGRAY)
  doc.text('Initials', PAGE_W - PAGE_MARGIN_X - boxSize / 2, c.y + boxSize + 3, { align: 'center' })

  // title + body
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  setColor(doc, COLOR_NARRA)
  let yy = c.y + 3.5
  for (const line of titleLines) {
    doc.text(line, PAGE_MARGIN_X, yy)
    yy += 4.3
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, COLOR_INK)
  for (const line of bodyLines) {
    doc.text(line, PAGE_MARGIN_X, yy)
    yy += 4
  }
  c.y += blockH + 3
  // divider
  setDrawColor(doc, COLOR_PAPER2)
  doc.setLineWidth(0.3)
  doc.line(PAGE_MARGIN_X, c.y, PAGE_W - PAGE_MARGIN_X, c.y)
  c.y += 2
  void key
}

function checkbox(c: Cursor, checked: boolean, label: string) {
  const { doc } = c
  doc.setFontSize(9.5)
  const labelLines = doc.splitTextToSize(label, CONTENT_W - 8) as string[]
  const blockH = labelLines.length * 4 + 3
  ensureSpace(c, blockH + 2)
  setDrawColor(doc, COLOR_NARRA)
  doc.setLineWidth(0.5)
  doc.rect(PAGE_MARGIN_X, c.y + 0.5, 5, 5)
  if (checked) {
    setFillColor(doc, COLOR_NARRA)
    doc.rect(PAGE_MARGIN_X + 1.2, c.y + 1.7, 2.6, 2.6, 'F')
  }
  setColor(doc, COLOR_INK)
  doc.setFont('helvetica', 'normal')
  let yy = c.y + 4
  for (const line of labelLines) {
    doc.text(line, PAGE_MARGIN_X + 8, yy)
    yy += 4
  }
  c.y += blockH + 2
}

function signatureBlock(c: Cursor, label: string, person?: { printedName: string; signatureDataUrl: string; signedAt: string }) {
  const { doc } = c
  const blockH = 32
  ensureSpace(c, blockH + 4)
  doc.setFontSize(8)
  setColor(doc, COLOR_MIDGRAY)
  doc.setFont('helvetica', 'bold')
  doc.text(label.toUpperCase(), PAGE_MARGIN_X, c.y + 4)

  // Boxed signature area (left) + date (right)
  const sigW = CONTENT_W * 0.65
  const dateW = CONTENT_W - sigW - 4
  const boxY = c.y + 6
  setDrawColor(doc, COLOR_PAPER2)
  doc.setLineWidth(0.4)
  doc.rect(PAGE_MARGIN_X, boxY, sigW, 18)
  doc.rect(PAGE_MARGIN_X + sigW + 4, boxY, dateW, 18)

  if (person?.signatureDataUrl) {
    try {
      doc.addImage(person.signatureDataUrl, 'PNG', PAGE_MARGIN_X + 2, boxY + 2, sigW - 4, 14, undefined, 'FAST')
    } catch { /* ignore — invalid data url */ }
  }
  if (person?.signedAt) {
    doc.setFontSize(10)
    setColor(doc, COLOR_INK)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date(person.signedAt).toLocaleDateString(), PAGE_MARGIN_X + sigW + 4 + dateW / 2, boxY + 11, { align: 'center' })
  }

  // labels under boxes
  doc.setFontSize(7.5)
  setColor(doc, COLOR_MIDGRAY)
  doc.setFont('helvetica', 'italic')
  doc.text('Printed name & signature', PAGE_MARGIN_X + sigW / 2, boxY + 22, { align: 'center' })
  doc.text('Date signed', PAGE_MARGIN_X + sigW + 4 + dateW / 2, boxY + 22, { align: 'center' })

  if (person?.printedName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setColor(doc, COLOR_INK)
    doc.text(person.printedName, PAGE_MARGIN_X + sigW / 2, boxY + 26, { align: 'center' })
  }

  c.y = boxY + 28
}

export function generateWaiverPdf(record: WaiverRecord): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const c: Cursor = { doc, y: PAGE_MARGIN_TOP }

  drawHeading(c)

  // Intro paragraph
  bodyText(c, 'This Parent/Guardian Waiver, Acknowledgment, and Consent Form (this "Waiver") is executed by the undersigned parent or legal guardian ("I", "me", "my", or the "Parent/Guardian") in favor of SAPPHIRE CLINICS EAST, INC. ("SCEI") and LIGHT BEARER CHRISTIAN ACADEMY ("LBCA"), in connection with my child\'s enrollment, attendance, and participation in the SCEI × LBCA SPED School Program (the "Program").')
  c.y += 1

  // 1. Student Information
  sectionTitle(c, '1. Student Information')
  const ct = record.content
  infoTable(c, [
    ['Full Name', ct.studentFullName],
    ['Date of Birth', ct.studentDob],
    ['Age', ct.studentAge],
    ['Gender', ct.studentGender],
    ['Grade Level', ct.gradeLevel || levelLabel(record.level)],
    ['Term of Enrollment', ct.termOfEnrollment],
    ['Nationality', ct.studentNationality],
    ['Religion', ct.studentReligion],
    ['Home Address', ct.homeAddress],
    ['City / Province', ct.cityProvince],
    ['Previous School', ct.previousSchool],
    ['School Year Attended', ct.schoolYearAttended],
    ['Diagnosis / Conditions', ct.diagnosis],
    ['Date of Diagnosis', ct.dateOfDiagnosis],
  ])

  // 2. Parent / Guardian Information
  sectionTitle(c, '2. Parent / Guardian Information')
  bodyText(c, 'Primary Parent / Guardian', { bold: true, color: COLOR_MOSS })
  infoTable(c, [
    ['Full Name', ct.primary.fullName],
    ['Relationship to Student', ct.primary.relationship],
    ['Mobile Number', ct.primary.mobile],
    ['Alternate Number', ct.primary.altNumber],
    ['Email Address', ct.primary.email],
    ['Occupation', ct.primary.occupation],
    ['Home Address', ct.primary.homeAddress],
    ['Office Address', ct.primary.officeAddress],
    ['Valid Government ID Presented', ct.primary.govtId],
    ['ID Number', ct.primary.idNumber],
  ])
  if (ct.secondary) {
    bodyText(c, 'Secondary Parent / Guardian (if applicable)', { bold: true, color: COLOR_MOSS })
    infoTable(c, [
      ['Full Name', ct.secondary.fullName],
      ['Relationship to Student', ct.secondary.relationship],
      ['Mobile Number', ct.secondary.mobile],
      ['Email Address', ct.secondary.email],
    ])
  }

  // 3. Fetchers
  sectionTitle(c, '3. Authorized Fetchers / Pick-Up Persons')
  bodyText(c, 'Only the persons listed below shall be allowed to drop off or pick up the child from the SCEI premises. SCEI personnel are authorized to require valid identification before releasing the student.', { italic: true, color: COLOR_MIDGRAY })
  for (let i = 0; i < 3; i++) {
    const f = ct.fetchers[i] ?? { name: '', relationship: '', mobile: '', idNumber: '' }
    infoTable(c, [
      [`Name (${i + 1})`, f.name],
      ['Relationship', f.relationship],
      ['Mobile Number', f.mobile],
      ['Valid ID Number', f.idNumber],
    ])
  }

  // 4. Emergency + Medical
  sectionTitle(c, '4. Emergency Contact & Medical Disclosures')
  bodyText(c, 'Emergency Contact (other than the Parent/Guardian above)', { bold: true, color: COLOR_MOSS })
  infoTable(c, [
    ['Full Name', ct.emergencyName],
    ['Relationship', ct.emergencyRelationship],
    ['Mobile Number', ct.emergencyMobile],
    ['Alternate Number', ct.emergencyAlt],
  ])
  bodyText(c, 'Preferred Hospital / Medical Facility', { bold: true, color: COLOR_MOSS })
  infoTable(c, [
    ['Hospital Name', ct.hospital],
    ['Contact Number', ct.hospitalContact],
    ['Attending Physician (if any)', ct.physician],
    ["Physician's Contact", ct.physicianContact],
  ])
  bodyText(c, 'Medical & Developmental Disclosures', { bold: true, color: COLOR_MOSS })
  infoTable(c, [
    ['Allergies (food, drug, other)', ct.allergies],
    ['Blood Type', ct.bloodType],
    ['Current Medications', ct.medications],
    ['Dosage & Schedule', ct.dosageSchedule],
    ['Existing Medical Conditions', ct.medicalConditions],
    ['Treating Specialist', ct.treatingSpecialist],
    ['Behavioral / Sensory Triggers', ct.behavioralTriggers],
    ['Coping Strategies', ct.copingStrategies],
    ['Dietary Restrictions', ct.dietaryRestrictions],
    ['Mobility Needs', ct.mobilityNeeds],
  ])

  // 5. Clauses
  sectionTitle(c, '5. Acknowledgments and Consents')
  bodyText(c, 'I have read each of the following statements and, by writing my initials in the box to the right of each statement, I acknowledge that I understand and agree to it.', { italic: true })
  c.y += 2
  for (const cl of CLAUSES) {
    clauseBox(c, cl.key, cl.title, cl.body, ct.initials[cl.key] ?? '')
  }

  // 6. Photo release
  sectionTitle(c, '6. Photo, Media, and Likeness Release (Optional)')
  bodyText(c, 'The Parent/Guardian indicated the following choice (only one):', { italic: true, color: COLOR_MIDGRAY })
  checkbox(c, ct.photoRelease === 'GRANT', 'I GRANT consent. I authorize SCEI to capture, store, and use photographs, videos, recordings, artwork, and quotations involving my child for SCEI\'s internal documentation, parent communications, social-media posts, marketing materials, and partnership announcements with LBCA.')
  checkbox(c, ct.photoRelease === 'DENY' || ct.photoRelease === null, 'I DO NOT grant consent. SCEI shall not use my child\'s photo, video, voice, artwork, or quotations in any public-facing materials, unless with my written consent.')

  // 7. Governing law
  sectionTitle(c, '7. Governing Law, Severability, and Entire Agreement')
  bodyText(c, 'This Waiver shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any dispute arising out of or in connection with this Waiver shall first be addressed through good-faith discussion between the Parent/Guardian and SCEI. Failing resolution within thirty (30) days, the dispute shall be submitted to the exclusive jurisdiction of the proper courts of Pasig City, Metro Manila. If any provision of this Waiver is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect. This Waiver, together with the enrollment forms and SCEI\'s published policies, constitutes the entire agreement between the Parent/Guardian and SCEI with respect to the matters covered herein. I acknowledge that I have signed this Waiver freely, voluntarily, and with full understanding of its legal effect.')

  // 8. Signatures
  sectionTitle(c, '8. Signatures')
  const day = ct.executionDay || '___'
  const month = ct.executionMonth || '________________'
  const year = ct.executionYear || '__'
  bodyText(c, `Executed at Pasig City, Philippines, this ${day} day of ${month}, 20${year}.`, { italic: true })
  c.y += 1
  signatureBlock(c, 'Parent / Guardian', record.parentSig)
  if (record.secondaryParentSig) signatureBlock(c, 'Secondary Parent / Guardian (if applicable)', record.secondaryParentSig)
  signatureBlock(c, 'Witness — Assigned SCEI Teacher', record.witnessSig)
  signatureBlock(c, 'Sapphire Clinics East, Inc. — Acknowledged & Received', record.sceiAckSig)

  // 9. Notarization
  sectionTitle(c, '9. Acknowledgment (For Notarization)')
  ensureSpace(c, 14)

  // Republic header — aligned closing parens column
  const venueW = 80
  const parenX = PAGE_MARGIN_X + venueW + 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, COLOR_INK)
  doc.text('REPUBLIC OF THE PHILIPPINES', PAGE_MARGIN_X, c.y + 3.5)
  doc.text(')', parenX, c.y + 3.5)
  c.y += 5
  // Venue (city) blank line + ) S.S.
  setDrawColor(doc, COLOR_INK)
  doc.setLineWidth(0.3)
  doc.line(PAGE_MARGIN_X, c.y + 3.8, PAGE_MARGIN_X + venueW, c.y + 3.8)
  doc.text(') S.S.', parenX, c.y + 3.5)
  c.y += 7

  // BEFORE ME body — wraps naturally
  bodyText(c, 'BEFORE ME, a Notary Public for and in __________________, this _____ day of __________________, 20____, personally appeared the Parent/Guardian named above, with the competent evidence of identity stated in this Waiver, known to me to be the same person who executed the foregoing instrument, who acknowledged to me that the same is his/her free and voluntary act and deed.')
  c.y += 1
  bodyText(c, 'WITNESS MY HAND AND SEAL on the date and place first above written.')
  c.y += 5

  // Notary signature block — right-aligned to the right margin, drawn at the
  // current cursor. Doc/Page/Book/Series will then stack vertically on the left.
  ensureSpace(c, 14)
  const sigLineW = 72
  const sigRightX = PAGE_W - PAGE_MARGIN_X
  const sigLeftX = sigRightX - sigLineW
  setDrawColor(doc, COLOR_INK)
  doc.setLineWidth(0.4)
  doc.line(sigLeftX, c.y + 1, sigRightX, c.y + 1)
  c.y += 4
  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(9.5)
  setColor(doc, COLOR_NARRA)
  doc.text('NOTARY PUBLIC', sigRightX, c.y + 3, { align: 'right' })
  c.y += 8

  // Doc / Page / Book / Series — vertically stacked on the left, each on its own line
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, COLOR_INK)
  const lineSpacing = 6
  const stackRows: Array<{ label: string; trailing?: string }> = [
    { label: 'Doc. No.',     trailing: ';' },
    { label: 'Page No.',     trailing: ';' },
    { label: 'Book No.',     trailing: ';' },
    { label: 'Series of 20', trailing: '.' },
  ]
  const stackLineW = 30
  stackRows.forEach(row => {
    ensureSpace(c, lineSpacing + 2)
    doc.text(row.label, PAGE_MARGIN_X, c.y + 3.5)
    const labelWidth = doc.getTextWidth(row.label)
    const lineStart = PAGE_MARGIN_X + labelWidth + 1.5
    const lineEnd = lineStart + stackLineW
    setDrawColor(doc, COLOR_INK)
    doc.setLineWidth(0.3)
    doc.line(lineStart, c.y + 3.8, lineEnd, c.y + 3.8)
    if (row.trailing) doc.text(row.trailing, lineEnd + 1, c.y + 3.5)
    c.y += lineSpacing
  })

  // Page footers
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    setColor(doc, COLOR_MIDGRAY)
    doc.setFont('helvetica', 'normal')
    doc.text(`SCEI × LBCA — Parent/Guardian Waiver  ·  ${record.studentFirstName} ${record.studentLastName}  ·  ${levelLabel(record.level)}`, PAGE_MARGIN_X, PAGE_H - 6)
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - PAGE_MARGIN_X, PAGE_H - 6, { align: 'right' })
  }

  return doc
}

export function downloadWaiverPdf(record: WaiverRecord) {
  const doc = generateWaiverPdf(record)
  const safeName = `${record.studentLastName}-${record.studentFirstName}-waiver`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  doc.save(`${safeName}.pdf`)
}
