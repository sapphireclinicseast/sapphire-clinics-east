// Generates the signed Return Service Agreement as a PDF (jsPDF, server-side —
// the same pattern already used by the sample seeder). One faithful text per
// track (Aral / Tindig), interpolated with the fellow's details and — for the
// Aral Track — the awarded stipend tier and Coverage Period. The fellow's
// e-signature image and the soft-copy signing date are stamped at the end.

import { CEO_SIGNATURE_PNG_B64 } from './ugat-ceo-signature'

type Block = { h: true; t: string } | { h?: false; t: string }
const H = (t: string): Block => ({ h: true, t })
const P = (t: string): Block => ({ t })

type PdfInput = {
  track?: string | null
  fellowName: string
  program: string
  school: string
  monthly?: number | null
  months?: number | null
  comakerName: string
  signaturePng?: Buffer | null
  signatureMime?: string | null
  dateSigned: Date
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
// Date + time in Manila (PHT) for the per-page e-sign stamp.
const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' PHT'

function aralBlocks(i: PdfInput): Block[] {
  const prof = i.program || 'Allied Health'
  const uni = i.school || 'the University'
  const m = i.monthly && i.months ? i.monthly : null
  const n = i.monthly && i.months ? i.months : null
  const total = m && n ? m * n : null
  const amt = m ? `PHP ${m.toLocaleString()}.00` : 'PHP ____________'
  const cov = n ? `${n} months` : '____________ months'
  return [
    P(`This Return Service Agreement (the "Agreement") is made and entered into by and among SAPPHIRE CLINICS EAST INCORPORATED, a corporation duly organized and existing under Philippine law, operating Aura Health Rehab, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City ("SCEI" or the "Clinic"); ${i.fellowName || '____________'}, of legal age, Filipino, a ${prof} student intern of ${uni} (the "FELLOW"); and the FELLOW's parent / guardian, ${i.comakerName || '____________'} (the "CO-MAKER"). SCEI, the FELLOW, and the CO-MAKER are collectively the "Parties."`),
    P(`Award granted to the FELLOW: a monthly Allowance of ${amt} for a Coverage Period of ${cov}${total ? ` — an estimated Total Allowance of PHP ${total.toLocaleString()}.00` : ''}.`),
    P('WITNESSETH: THAT'),
    P('WHEREAS, SCEI has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — whose Aral Track is an allowance-based fellowship offered to qualified student interns undergoing their clinical internship;'),
    P("WHEREAS, the FELLOW has been awarded a fellowship under the Aral Track, by which SCEI shall provide a monthly financial allowance, in the amount and for the Coverage Period determined by the Program Assessors, during the FELLOW's clinical internship;"),
    P('WHEREAS, in consideration of the allowance extended, the FELLOW has agreed to render return service to SCEI following completion of the internship and licensure;'),
    P('NOW, THEREFORE, the Parties agree as follows:'),
    H('1. DEFINITIONS'),
    P('Allowance. The monthly financial stipend of either Five Thousand Pesos (PHP 5,000.00) or Ten Thousand Pesos (PHP 10,000.00) — the tier awarded to the FELLOW as determined by the Program Assessors — paid by SCEI for the Coverage Period awarded.'),
    P(`Internship Period. The FELLOW's clinical internship in ${prof} for the applicable School Year.`),
    P('Coverage Period. The number of months for which the Allowance is awarded: ten (10) months for a full-year award, or five (5) months for a semestral award (available only to applicants applying for the second semester of the internship year).'),
    P('Total Allowance. The cumulative Allowance actually disbursed over the Internship Period, ranging from Twenty-Five Thousand Pesos (PHP 25,000.00) to One Hundred Thousand Pesos (PHP 100,000.00), depending on the stipend tier and Coverage Period awarded.'),
    P('Return Service Obligation. The obligation of the FELLOW to render One Thousand Five Hundred (1,500) hours of direct patient treatment sessions at any SCEI clinic following licensure, as set out in Section 4.'),
    P(`Licensure. The FELLOW's passing of the ${prof} Licensure Examination and receipt of the Certificate of Registration and Professional Identification Card from the Professional Regulation Commission (PRC).`),
    P('Program Assessors. The panel or officers designated by SCEI to evaluate applications and determine the monthly stipend tier (PHP 5,000.00 or PHP 10,000.00) and the Coverage Period awarded to each FELLOW. Their determination is final.'),
    H('2. GRANT OF FELLOWSHIP AND ALLOWANCE'),
    P(`2.1 Grant. SCEI grants the FELLOW a fellowship consisting of a monthly Allowance of either PHP 5,000.00 or PHP 10,000.00, payable for the Coverage Period awarded (ten (10) months full-year, or five (5) months semestral — the latter available only to applicants applying for the second semester). The stipend tier and Coverage Period are determined by the Program Assessors and are final. The monthly Allowance awarded to the FELLOW under this Agreement is ${amt} per month, for a Coverage Period of ${cov}. In all cases, the Return Service Obligation remains the full 1,500 hours regardless of the tier or Coverage Period awarded.`),
    P("2.2 Disbursement. The Allowance is remitted to the FELLOW's nominated bank account on or before the tenth (10th) day of each month during the Internship Period."),
    P('2.3 Acknowledgment of Indebtedness. The FELLOW and CO-MAKER acknowledge that the Allowance, together with the clinical training and supervision extended by SCEI, constitutes sufficient consideration for the Return Service Obligation, which is fixed at 1,500 hours regardless of the stipend tier awarded or the actual amount disbursed. Where the Allowance is awarded at the lower tier, on a semestral five-month Coverage Period, or otherwise for fewer than ten months, the obligation nevertheless remains fixed at 1,500 hours.'),
    P("2.4 Cut-Short of Internship. Should the FELLOW be unable to continue or complete the internship for any reason, the Allowance ceases as of the date of discontinuance, and the FELLOW and CO-MAKER agree to reimburse the Allowance actually received plus an eight percent (8%) surcharge within ninety (90) days. Full reimbursement finally settles the Parties' obligations. SCEI may, with compassion, waive, reduce, or restructure the reimbursement — particularly for serious illness, a death in the immediate family, or circumstances beyond the FELLOW's control."),
    P('2.5 Extension or Delayed Graduation. The Allowance is fixed at the Coverage Period awarded and shall not be extended under any circumstance, including any extension of the internship, repetition of requirements, or delayed graduation. Beyond the final month of the Coverage Period the FELLOW continues at his/her own cost, and no additional Allowance is due. The Return Service Obligation of 1,500 hours remains in full force.'),
    P("2.6 Application of Unused Allowance to Review Fees. Where the University's internship runs fewer months than the Coverage Period awarded (e.g., an 8- or 9-month internship against a 10-month Coverage Period) and the FELLOW completes the full internship requirement, the FELLOW may use the unused balance of the Allowance — the monthly stipend awarded multiplied by the undisbursed months — to cover " + prof + " licensure review fees, upon proof of completion and proof of enrolment in (or receipts for) a review program. The balance shall not exceed the undisbursed balance at the tier awarded, forms part of the Allowance disbursed for all purposes, does not apply where the internship is cut short, and does not affect the fixed 1,500-hour obligation."),
    H('3. OBLIGATIONS DURING THE INTERNSHIP'),
    P(`During the Internship Period, the FELLOW shall: maintain good standing as an enrolled ${prof} student intern; faithfully perform all duties, rotations, and clinical responsibilities assigned; comply with the SCEI Code of Conduct, clinic policies, and the school's requirements; maintain a passing grade throughout the internship year (equivalent to a grade of 3.0 or better under the University of the Philippines system); signify willingness to be assigned to either or both of SCEI's clinics (East and Greenhills) for the Return Service Obligation; disclose any change in academic or enrolment status within seven (7) days; sit for and complete the ${prof} Licensure Examination at the next available date after eligibility; and actively participate in "Araw ng Kalinga," SCEI's one-day annual community outreach providing free therapy screening and medical services in partnership with an LGU or NGO, whenever held during the Internship Period or the return service period.`),
    ...commonBlocks(i, 'Allowance and clinical training', 'the stipend tier awarded (PHP 5,000.00 or PHP 10,000.00), the Coverage Period awarded (ten (10) or five (5) months), or the number of months actually funded'),
  ]
}

function tindigBlocks(i: PdfInput): Block[] {
  const prof = i.program || 'Allied Health'
  const uni = i.school || 'the University'
  return [
    P(`This Return Service Agreement (the "Agreement") is made and entered into by and among SAPPHIRE CLINICS EAST INCORPORATED, a corporation duly organized and existing under Philippine law, operating Aura Health Rehab, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City ("SCEI" or the "Clinic"); ${i.fellowName || '____________'}, of legal age, Filipino, a graduate of the ${prof} program of ${uni} preparing for the ${prof} Licensure Examination (the "FELLOW"); and the FELLOW's parent / guardian, ${i.comakerName || '____________'} (the "CO-MAKER"). SCEI, the FELLOW, and the CO-MAKER are collectively the "Parties."`),
    P('Award granted to the FELLOW: a review-support Grant of Thirty Thousand Pesos (PHP 30,000.00), availed either as SCEI’s direct payment of licensure review fees (up to PHP 30,000.00) or as a monthly review stipend of PHP 5,000.00 for six (6) months.'),
    P('WITNESSETH: THAT'),
    P("WHEREAS, SCEI has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — whose Tindig Track is a review-support fellowship offered, upon special application directly to SCEI, to qualified graduates who have completed the University's clinical internship requirement, have not been awarded under the Aral Track, and are preparing for the " + prof + " Licensure Examination;"),
    P('WHEREAS, the FELLOW has been awarded a fellowship under the Tindig Track, by which SCEI shall provide a review-support Grant of Thirty Thousand Pesos (PHP 30,000.00), availed as payment of licensure review fees or as a monthly review stipend, as provided herein;'),
    P('WHEREAS, in consideration of the Grant extended, the FELLOW has agreed to render return service to SCEI following licensure;'),
    P('NOW, THEREFORE, the Parties agree as follows:'),
    H('1. DEFINITIONS'),
    P('Grant. The review-support grant of Thirty Thousand Pesos (PHP 30,000.00) awarded to the FELLOW, availed in one of two ways: (a) SCEI’s direct payment of licensure review fees, up to PHP 30,000.00; or (b) a monthly review stipend of Five Thousand Pesos (PHP 5,000.00) for six (6) months during the Review Period.'),
    P(`Review Period. The period during which the FELLOW undertakes review for the ${prof} Licensure Examination, ending upon completion of the Examination.`),
    P('Total Grant. The cumulative Grant actually disbursed in any manner of availment, not exceeding PHP 30,000.00.'),
    P('Return Service Obligation. The obligation of the FELLOW to render One Thousand Five Hundred (1,500) hours of direct patient treatment sessions at any SCEI clinic following licensure, as set out in Section 4.'),
    P(`Licensure. The FELLOW's passing of the ${prof} Licensure Examination and receipt of the Certificate of Registration and Professional Identification Card from the PRC.`),
    P('Program Assessors. The panel or officers designated by SCEI to evaluate applications (including special applications under the Tindig Track) and determine the award of the Grant. Their determination is final.'),
    H('2. GRANT OF FELLOWSHIP AND REVIEW SUPPORT'),
    P("2.1 Grant. SCEI grants the FELLOW a review-support Grant of Thirty Thousand Pesos (PHP 30,000.00). The FELLOW shall elect in writing, subject to SCEI's approval, one of two ways of availing: (a) direct payment by SCEI of review fees — including enrolment in a licensure review program and related materials — up to PHP 30,000.00; or (b) a monthly review stipend of PHP 5,000.00 for six (6) months. Under option (a), SCEI pays only the review fees actually incurred: any shortfall below PHP 30,000.00 is not paid out or refunded, and any excess above PHP 30,000.00 is for the FELLOW's sole account. In all cases, the Return Service Obligation remains the full 1,500 hours regardless of the manner or amount of the Grant availed."),
    P("2.2 Disbursement. Stipend availments are remitted to the FELLOW's nominated bank account on or before the tenth (10th) day of each month during the Review Period. Review-fee availments are paid by SCEI directly to the review provider upon presentation of enrolment documents or billing, or reimbursed against official receipts."),
    P('2.3 Acknowledgment of Indebtedness. The FELLOW and CO-MAKER acknowledge that the Grant constitutes sufficient consideration for the Return Service Obligation, which is fixed at 1,500 hours regardless of the manner of availment or the actual amount disbursed. SCEI shall furnish a Statement of Disbursement upon conclusion of the Review Period, deemed accepted unless contested in writing within fifteen (15) days.'),
    P("2.4 Discontinuance of Review. Should the FELLOW abandon or discontinue the review, or fail to sit for the Licensure Examination as required, further disbursements cease as of the date of discontinuance, and the FELLOW and CO-MAKER agree to reimburse the Grant actually received plus an eight percent (8%) surcharge within ninety (90) days. Full reimbursement finally settles the Parties' obligations. SCEI may, with compassion, waive, reduce, or restructure the reimbursement — particularly for serious illness, a death in the immediate family, or circumstances beyond the FELLOW's control."),
    P('2.5 One-Time Award. The Grant is a one-time award fixed at PHP 30,000.00 and shall not be increased, renewed, or extended under any circumstance, including any extension of the review period or any retaking of the Licensure Examination. Any review beyond the Grant is at the FELLOW’s own cost. The Return Service Obligation of 1,500 hours remains in full force.'),
    H('3. OBLIGATIONS DURING THE REVIEW PERIOD'),
    P(`During the Review Period, the FELLOW shall: enrol in and diligently attend a licensure review program (or pursue a structured self-review plan disclosed to SCEI) and exert faithful effort to prepare; provide SCEI proof of enrolment and reasonable updates on review progress; signify willingness to be assigned to either or both of SCEI's clinics (East and Greenhills) for the Return Service Obligation; disclose any change in review or examination plans within seven (7) days; sit for and complete the ${prof} Licensure Examination at the next available date after eligibility, exerting best efforts to pass; and actively participate in "Araw ng Kalinga," SCEI's one-day annual community outreach providing free therapy screening and medical services in partnership with an LGU or NGO, whenever held during the Review Period or the return service period.`),
    ...commonBlocks(i, 'Grant', 'the manner of availment or the amount of the Grant actually disbursed'),
  ]
}

// Sections 4–10, identical across tracks except §4.1's consideration phrase and
// its closing "regardless of ..." clause.
function commonBlocks(i: PdfInput, consideration: string, regardless: string): Block[] {
  const prof = i.program || 'Allied Health'
  return [
    H('4. RETURN SERVICE OBLIGATION'),
    P(`4.1 Hours Owed. In consideration of the ${consideration}, the FELLOW shall render One Thousand Five Hundred (1,500) hours of direct patient treatment sessions as a licensed ${prof} professional at any SCEI clinic. A "treatment session" is time in direct, billable therapy or intervention with a patient, including attendant assessment, documentation, and case-management time; purely administrative, training, or non-clinical hours are not credited unless approved in writing. The obligation is fixed at 1,500 hours for all fellows regardless of ${regardless}.`),
    P('4.2 Commencement. The FELLOW shall commence return service within sixty (60) days from receipt of the official Certificate of Registration / Professional Identification Card from the PRC, rendered continuously and in good faith until completed.'),
    P("4.3 Crediting of Hours. Each hour of direct patient treatment actually rendered at any SCEI clinic post-licensure is credited toward the 1,500-hour obligation, recorded in real time through SCEI's ERP system, which serves as the official record of hours rendered and the remaining balance."),
    P(`4.4 Compensation. During the return service period, the FELLOW receives the standard market compensation for the position of a licensed ${prof} professional. The obligation is discharged through hours rendered and is not satisfied by salary deduction; the FELLOW receives full compensation for hours worked in addition to credit against the obligation.`),
    P("4.5 Geographic Assignment. The FELLOW agrees to be willing to accept assignment to either or both of SCEI's clinics based on operational need — Aura Health Rehab – East Branch (Robinsons Metro East, Marcos Highway, Santolan, Pasig) and Greenhills Branch (GH Tower Offices, Ortigas Avenue, Greenhills, San Juan) — or any future SCEI location. Reasonable preference is considered but not guaranteed."),
    P(`4.6 Exclusive Engagement During Return Service. The FELLOW shall render the full 1,500 hours exclusively with SCEI and its clinics. From commencement of return service until the 1,500 hours are completed, the FELLOW shall not render professional services as a ${prof} professional to or for any other clinic, hospital, therapy center, school-based program, or similar facility. SCEI may, in writing and in its sole discretion, permit limited exceptions (such as academic or teaching engagements) that do not interfere with the FELLOW's SCEI duties. Any breach is an Event of Default under Section 7.1.`),
    H('5. COMPLETION AND CERTIFICATION'),
    P('Upon rendering the full 1,500 hours, the Return Service Obligation is deemed fully discharged and SCEI shall issue a Certificate of Completion of Return Service; the obligations of the FELLOW and CO-MAKER are thereupon extinguished. Continued engagement afterward is optional and by mutual agreement under a separate arrangement.'),
    H('6. SETTLEMENT IN LIEU OF SERVICE'),
    P('6.1 Cash Buyout. Should the FELLOW elect not to render, or be unable to complete, the obligation, it may be discharged through a cash payment equal to the unrendered hours multiplied by an Hourly Credit Rate (PHP 150.00 per hour), plus a flat eight percent (8%) surcharge. By illustration, the buyout for the full 1,500 hours equals PHP 225,000.00 plus the 8% surcharge, totaling PHP 243,000.00.'),
    P("6.2 Election & Pro-Ration. The FELLOW elects a buyout by written notice with at least thirty (30) days' lead time; service rendered in good faith is credited, and only the unrendered balance of hours is subject to buyout."),
    H('7. DEFAULT AND ACCELERATION'),
    P('Events of Default include failure to commence return service on time (absent a CEO-approved extension), voluntary abandonment (other than for serious illness, bereavement, or force majeure), failure to take or pass the Licensure Examination within two (2) cycles after eligibility (absent a CEO-approved extension), and material misrepresentation. SCEI shall furnish written notice and a thirty (30)-day cure period. Upon an uncured default, the cash value of all unrendered hours becomes immediately due, with an eight percent (8%) surcharge, a five percent (5%) penalty, and interest at eight percent (8%) per annum from acceleration until fully paid.'),
    H('8. CO-MAKER OBLIGATIONS'),
    P('THE CO-MAKER expressly acknowledges and agrees that he/she is JOINTLY AND SEVERALLY LIABLE with the FELLOW for all monetary obligations arising under this Agreement, including any cash buyout, surcharge, penalty, accrued interest, and costs of collection, waiving the benefits of demand, presentment, notice of dishonor, and the order of enforcement.'),
    H('9. CONFIDENTIALITY AND DATA PRIVACY'),
    P("This Agreement and related records are confidential and protected consistent with R.A. 10173 (Data Privacy Act of 2012). The FELLOW and CO-MAKER consent to SCEI's collection, processing, and use of their personal data to administer this Agreement, including disclosure to SCEI's accountants, auditors, and legal counsel as needed."),
    H('10. GENERAL PROVISIONS'),
    P('This Agreement is governed by the laws of the Republic of the Philippines, with venue exclusively before the proper courts of San Juan City. It constitutes the entire agreement, supersedes all prior understandings, and may be amended only in writing signed by all Parties. If any provision is held invalid, the rest remain in force. It binds the Parties and their respective heirs, successors, and permitted assigns.'),
  ]
}

export async function generateSignedRsaPdf(input: PdfInput): Promise<Buffer | null> {
  try {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const M = 20
    const W = 170
    const BOTTOM = 244 // leave room at the foot of each page for the e-sign stamp
    let y = 20

    const isTindig = input.track === 'TINDIG'
    const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 20 } }
    // Signature images + stamp text prepared once.
    const ceoDataUrl = CEO_SIGNATURE_PNG_B64 ? `data:image/png;base64,${CEO_SIGNATURE_PNG_B64}` : null
    const fellowMime = (input.signatureMime || 'image/png').includes('jpeg') ? 'JPEG' : 'PNG'
    const fellowDataUrl = input.signaturePng ? `data:${input.signatureMime || 'image/png'};base64,${input.signaturePng.toString('base64')}` : null
    const stampTime = fmtDateTime(input.dateSigned)
    const fellowShort = (input.fellowName || 'The Fellow').split(/\s+/).slice(0, 3).join(' ')
    const heading = (t: string) => {
      ensure(9); y += 2
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
      doc.text(t, M, y); y += 5
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    }
    const para = (t: string, opts?: { center?: boolean; bold?: boolean; size?: number; gap?: number }) => {
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
      doc.setFontSize(opts?.size ?? 9)
      const lines = doc.splitTextToSize(t, W) as string[]
      for (const ln of lines) { ensure(4.6); if (opts?.center) doc.text(ln, 105, y, { align: 'center' }); else doc.text(ln, M, y); y += 4.4 }
      y += opts?.gap ?? 2
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    }

    // Header
    para('SAPPHIRE CLINICS EAST INCORPORATED', { center: true, bold: true, size: 12, gap: 0.5 })
    para(`UGAT FELLOWSHIP PROGRAM — ${isTindig ? 'TINDIG' : 'ARAL'} TRACK`, { center: true, bold: true, size: 10, gap: 0.5 })
    para('RETURN SERVICE AGREEMENT', { center: true, bold: true, size: 11, gap: 0.5 })
    para(isTindig ? 'Licensure Review Fellowship' : 'Allowance-Based Internship Fellowship', { center: true, size: 8.5, gap: 3 })
    para('KNOW ALL PERSONS BY THESE PRESENTS:', { bold: true, gap: 2 })

    const blocks = isTindig ? tindigBlocks(input) : aralBlocks(input)
    for (const b of blocks) { if (b.h) heading(b.t); else para(b.t) }

    // Signature block. This page (and any after) is the signature page — not stamped.
    ensure(60); y += 4
    const sigStartPage = doc.getNumberOfPages()
    doc.setDrawColor(150); doc.line(M, y, M + W, y); y += 6
    para('IN WITNESS WHEREOF, the Parties have signed this Agreement.', { bold: true, gap: 3 })

    ensure(34) // keep the SCEI signatory block (with signature) together
    para('For SAPPHIRE CLINICS EAST INC.:', { bold: true, gap: 1 })
    if (ceoDataUrl) { try { doc.addImage(ceoDataUrl, 'PNG', M, y, 46, 25); y += 26 } catch { /* skip image on failure */ } }
    para('Hannah Jara — CEO and President', { gap: 5 })

    ensure(46) // keep the FELLOW label + name + signature image + caption together
    para('THE FELLOW:', { bold: true, gap: 1 })
    para(input.fellowName || '____________', { gap: 1 })
    if (fellowDataUrl) { try { doc.addImage(fellowDataUrl, fellowMime, M, y, 55, 20); y += 22 } catch { /* skip image on failure */ } }
    para('Signature over printed name', { size: 8, gap: 5 })

    ensure(16) // keep the CO-MAKER block together
    para('THE CO-MAKER:', { bold: true, gap: 1 })
    para(input.comakerName || '____________', { gap: 1 })
    para('Signature over printed name', { size: 8, gap: 5 })

    ensure(14)
    doc.setDrawColor(150); doc.line(M, y, M + W, y); y += 5
    para(`Signed electronically (soft copy) by the FELLOW on ${fmtDate(input.dateSigned)}. This soft copy will be countersigned in person (hard copy) with the CO-MAKER at an Aura Health Rehab branch, before witnesses and a Notary Public, to complete execution.`, { size: 8 })

    // Per-page e-sign stamp — right foot of every non-signature page, showing both
    // signatures (CEO + fellow) with the signing date & time (PHT).
    const drawStamp = (p: number) => {
      doc.setPage(p)
      const rx = 192
      doc.setDrawColor(205); doc.setLineWidth(0.3); doc.roundedRect(118, 249, 76, 36, 2, 2)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6); doc.setTextColor(120)
      doc.text('ELECTRONICALLY SIGNED', rx, 253, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setTextColor(70)
      if (ceoDataUrl) { try { doc.addImage(ceoDataUrl, 'PNG', 121, 254, 24, 13) } catch { /* skip */ } }
      doc.setFontSize(6); doc.text('Hannah Jara · CEO', rx, 259, { align: 'right' }); doc.text(stampTime, rx, 262, { align: 'right' })
      if (fellowDataUrl) { try { doc.addImage(fellowDataUrl, fellowMime, 121, 269, 24, 10) } catch { /* skip */ } }
      doc.text(fellowShort, rx, 273, { align: 'right' }); doc.text(stampTime, rx, 276, { align: 'right' })
      doc.setTextColor(0); doc.setLineWidth(0.2)
    }
    for (let p = 1; p < sigStartPage; p++) drawStamp(p)

    return Buffer.from(doc.output('arraybuffer'))
  } catch (e) {
    console.error('[ugat] RSA PDF generation failed:', e)
    return null
  }
}
