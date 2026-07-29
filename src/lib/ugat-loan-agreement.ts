// Single source of truth for the UGAT Fellowship Agreement text, shared by the
// on-screen reader (Portal RSAText) and the generated signed PDF
// (ugat-rsa-pdf.ts). Reproduces the two FINAL track agreements (Aral / Tindig).
//
// Nature: the sums are extended as EDUCATIONAL ASSISTANCE and are "treated as a
// simple loan" — condonable IN FULL through professional service (Option A) or
// settled in installments with NO interest (Option B). No interest or charge
// applies, EXCEPT: (a) 6% p.a. on a restructured discontinuance balance beyond
// the allowed extension, and (b) legal interest + 5% liquidated damages that
// arise only after an uncured material breach / default. SCEI is not engaged in
// the business of lending.
//
// The actor is called the "APPLICANT" across both tracks. Two annexes are
// referenced: Annex A (sample repayment computation) and Annex B (Joint
// Undertaking with Promissory Note).

export type LoanBlock =
  | { h: string }                        // section heading
  | { lead?: string; text: string }      // paragraph, optional bold lead-in
  | { li: string }                       // bullet item

export interface LoanInput {
  track?: string | null
  fellowName: string
  program: string
  school: string
  monthly?: number | null
  months?: number | null
  comakerName: string
}

export interface AnnexTable { caption: string; headers: string[]; rows: string[][] }

export const loanTitle = 'UGAT Fellowship Agreement'
export const loanSubtitle = (isTindig: boolean) =>
  isTindig
    ? 'Licensure Review Fellowship — educational assistance, fully condonable through service'
    : 'Allowance-Based Internship Fellowship — educational assistance, fully condonable through service'

export function loanAgreementBlocks(i: LoanInput): LoanBlock[] {
  const isTindig = i.track === 'TINDIG'
  const A = 'APPLICANT'   // actor term (unified across both tracks)
  const prof = i.program || 'Speech-Language Pathology'
  const uni = i.school || 'the University'
  const who = i.fellowName || '________________'
  const cm = i.comakerName || '________________'
  const m = i.monthly && i.months ? i.monthly : null
  const n = i.monthly && i.months ? i.months : null
  const amt = m ? `PHP ${m.toLocaleString()}.00` : 'PHP ____________'
  const cov = n ? `${n}` : '____________'

  const intro: LoanBlock[] = [
    { text: 'KNOW ALL PERSONS BY THESE PRESENTS:' },
    { text: `This UGAT Fellowship Agreement (the “Agreement”) is made and entered into by and among SAPPHIRE CLINICS EAST INCORPORATED, operating Aura Health Rehab – Greenhills Branch, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City (“SCEI” or the “Clinic”); ${who}, of legal age, Filipino${isTindig ? `, a graduate of the ${prof} program of ${uni}, preparing for the ${prof} Licensure Examination` : `, a ${prof} student intern of ${uni}`} (the “${A}”); and ${cm}, of legal age, Filipino, parent / guardian of the ${A} (the “CO-MAKER”). SCEI, the ${A}, and the CO-MAKER are collectively the “Parties.”` },
    { text: 'WITNESSETH: THAT' },
    isTindig
      ? { text: 'WHEREAS, SCEI has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — for developing, recruiting, and retaining licensed therapists. Its Tindig Track is a review-support fellowship offered exclusively to qualified graduates of UP Manila CAMP who have completed the University’s clinical internship requirement, have not been awarded under the Aral Track, and are preparing for the Licensure Examination, coursed through the OSR;' }
      : { text: 'WHEREAS, SCEI has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — for developing, recruiting, and retaining licensed therapists, offered exclusively to qualified Speech-Language Pathology student interns of UP Manila CAMP undergoing their clinical internship for School Year 2026–2027, coursed through the OSR;' },
    { text: `WHEREAS, the ${A} represented that he/she is ${isTindig ? 'a graduate of the ' + prof + ' program of ' + uni + ', preparing for the Licensure Examination' : 'a ' + prof + ' student of ' + uni}, and, with the express consent of the CO-MAKER, has applied for a grant under SCEI’s UGAT Fellowship Program; and after evaluation SCEI approved and enrolled the ${A}, subject to this Agreement;` },
    { text: 'NOW, THEREFORE, the Parties agree as follows:' },
  ]

  const sec1: LoanBlock[] = isTindig ? [
    { h: '1. UGAT FELLOWSHIP PROGRAM' },
    { lead: '1.1 Commitment.', text: `Under the Tindig Track, SCEI commits to support qualified ${prof} graduates who have completed their clinical internship and are preparing for the Licensure Examination, by providing review-support financial aid during the review period and offering economic opportunities after licensure. In exchange, fellows abide by the terms of their grants.` },
    { lead: '1.2 The Grant.', text: 'The Assistance Amount is up to Thirty Thousand Pesos (PHP 30,000.00), availed — at the APPLICANT’s written election, subject to SCEI’s approval — as (a) SCEI’s direct payment of licensure review fees (review program + materials) up to PHP 30,000.00; or (b) a monthly review stipend of PHP 5,000.00 for six (6) months during the Review Period. Under (a), SCEI pays only fees actually incurred; any shortfall is not paid out or refunded, and any excess is for the APPLICANT’s account. Stipend availments are remitted to the APPLICANT’s bank account on or before the 10th of each month; review-fee availments are paid directly to the provider or reimbursed against receipts. The determination of the Program Assessors is final.' },
    { lead: '1.3 Treatment and Acknowledgment.', text: 'The APPLICANT and CO-MAKER expressly acknowledge that all sums received from SCEI under this Program shall be treated as a simple loan.' },
    { lead: '1.4 Statement of Account.', text: 'SCEI shall furnish a Statement of Account upon conclusion of the Review Period or upon discontinuance, accounting for all sums disbursed, deemed accepted unless contested in writing within fifteen (15) calendar days.' },
  ] : [
    { h: '1. UGAT FELLOWSHIP PROGRAM' },
    { lead: '1.1 Commitment.', text: `Under the Aral Track, SCEI commits to support deserving ${prof} student interns of ${uni} by providing monetary aid during their internship, prior to graduation and the licensure exam, and by offering economic opportunities after they complete their degrees and acquire their licenses. In exchange, applicants and fellows abide by the terms of their grants.` },
    { lead: '1.2 The Grant.', text: `Financial sum of Five Thousand Pesos (PHP 5,000.00) or Ten Thousand Pesos (PHP 10,000.00), up to ten (10) times, depending on the tier awarded by the Program Assessors — once a month on a full internship-year basis (10 months / 10 times), or on a semestral basis (5 months) for those applying in the second semester of the internship year. The monthly aid awarded to the ${A} under this Agreement is ${amt} per month, for ${cov} months. The aid is remitted to the ${A}’s nominated bank account on or before the tenth (10th) day of each month.` },
    { lead: '1.3 Treatment and Acknowledgment.', text: `The ${A} and CO-MAKER expressly acknowledge that all sums received from SCEI under this Program shall be treated as a simple loan.` },
    { lead: '1.4 Statement of Account.', text: `SCEI shall furnish the ${A} a Statement of Account upon conclusion of the Internship Period or upon removal from the Program, accounting for all sums disbursed, deemed accepted unless contested in writing within fifteen (15) calendar days.` },
  ]

  const sec2: LoanBlock[] = isTindig ? [
    { h: '2. OBLIGATIONS OF THE APPLICANT DURING THE REVIEW PERIOD' },
    { text: `During the Review Period, the APPLICANT shall: enrol in and diligently attend a licensure review program (or a structured self-review plan disclosed to SCEI) and exert faithful effort to prepare; provide proof of enrolment and reasonable progress updates; signify willingness to be assigned to either or both SCEI clinics for any engagement under the Service Condonation Option; disclose any change in review or examination plans within seven (7) days; sit for and complete the ${prof} Licensure Examination at the next available date after eligibility, exerting best efforts to pass; and actively participate in “Araw ng Kalinga,” SCEI’s one-day annual community outreach in partnership with an LGU or NGO, during the existence of this Agreement.` },
  ] : [
    { h: '2. OBLIGATIONS OF THE APPLICANT DURING THE FELLOWSHIP PERIOD' },
    { text: `During the Fellowship Period, the ${A} shall: maintain good standing as an enrolled ${prof} student intern; complete the clinical internship to the best of his/her ability within the shortest possible period and not beyond the school’s allowable period; faithfully perform all duties, rotations, and clinical responsibilities assigned by the Clinic’s supervising therapists; comply with the school’s academic and clinical requirements; maintain a grade of 3.0 or better (or equivalent under the UP grading system) throughout the internship year; disclose any change in academic or enrolment status within seven (7) days; sit for and complete the ${prof} Licensure Examination at the next available date after eligibility; and actively participate in “Araw ng Kalinga,” SCEI’s one-day annual community outreach in partnership with an LGU or NGO, during the existence of this Agreement.` },
  ]

  const sec3: LoanBlock[] = isTindig ? [
    { h: '3. TERMS AND CONDITIONS OF THE PROGRAM' },
    { lead: '3.1 Discontinuance of Review.', text: 'Should the APPLICANT abandon or discontinue the review, or fail to sit for the Licensure Examination as required, further disbursements cease as of that date, and the Assistance Amount actually received is settled in up to three (3) equal monthly installments, free from any interest or charge, commencing ninety (90) days from discontinuance. Full settlement finally discharges the Parties’ obligations. SCEI may, with compassion, waive, reduce, or restructure the amount due — particularly for serious illness, a death in the immediate family, or circumstances beyond the APPLICANT’s control — and may, upon eventual licensure, allow discharge of the balance through the Service Condonation Option on proportionate terms.' },
    { lead: '3.2 One-Time Award.', text: 'The Grant is a one-time award, fixed at a maximum of PHP 30,000.00, and shall not be increased, renewed, or extended under any circumstance, including any extension of the Review Period or any retaking of the Licensure Examination. Any review beyond the Grant is at the APPLICANT’s own cost. Both modes of settlement under Section 4 remain fully available upon eventual licensure.' },
  ] : [
    { h: '3. TERMS AND CONDITIONS OF THE PROGRAM' },
    { lead: '3.1 Discontinuance of Internship and Fellowship.', text: `Should the ${A} be unable to continue or complete the clinical internship or course program for any reason (withdrawal, dropping, leave of absence, transfer, or dismissal), all grants immediately cease and SCEI issues a Statement of Account to be settled by the ${A} and CO-MAKER by any of: (a) settling all obligations within six (6) months — free of interest or charge, only the principal received; or (b) partially settling the principal and applying to restructure the balance (SCEI’s sole discretion; total extension not to exceed six (6) months from the end of the first six-month period, beyond which the remaining balance bears interest of 6% per annum); or (c) filing a Request for Continuance — undertaking to re-enroll and complete the internship within twelve (12) months of discontinuance; if approved, the grant continues on resumption, with no interest, fee, or charge.` },
    { lead: '3.2 Extension of Internship or Delayed Graduation.', text: `The frequency of the grant is fixed and shall not be extended under any circumstance, including any internship extension, repetition of requirements, or delay in graduation. Beyond the fixed grant, the ${A} continues at his/her own cost and no additional grant is provided.` },
    { lead: '3.3 Shorter Internship Period.', text: `Where the University’s internship runs shorter than anticipated (e.g. eight or nine months) and the ${A} completes the full internship requirement, the ${A} continues to receive the remainder until all ten (10) grants are received, and undertakes to use the remaining sum for ${prof} licensure review fees (review-program enrolment + materials). The remaining balance is released upon proof of internship completion plus proof of enrolment in (or receipts for) a review program.` },
  ]

  const sec4Head: LoanBlock[] = [{ h: '4. REPAYMENT AND SETTLEMENT' }]

  const optionA: LoanBlock = isTindig
    ? { lead: '4.1(A) Option A — Service Condonation.', text: 'The APPLICANT practices his/her profession with SCEI under an Engagement Contract (fixed-term employment or consultancy) upon obtaining the license, with full market compensation. The loan is fully paid and/or condoned once the APPLICANT renders One Thousand Five Hundred (1,500) Service Hours with SCEI. Should the APPLICANT render fewer than 1,500 hours for any reason, the loan is proportionately reduced based on actual service hours.' }
    : { lead: '4.1(A) Option A — Service Condonation.', text: `The ${A} applies for employment or consultancy as a therapist with SCEI upon obtaining the license; if engaged, the ${A} is paid full market compensation plus such benefits as the Engagement Contract provides. The loan is fully paid and/or condoned once the ${A} renders One Thousand Five Hundred (1,500) Service Hours with SCEI. Should the ${A} render fewer than 1,500 hours for any reason, the loan is proportionately reduced based on actual service hours. On failure to apply within the given period, non-engagement by SCEI despite application, or circumstances outside Option A, Option B is the default.` }

  const optionB: LoanBlock = { lead: '4.1(B) Option B — Repayment.', text: `The ${A} settles the entire loan (or balance) per the repayment schedule (Section 4.4). The repayment term commences on the earliest of: passing the Licensure Examination but not applying for employment with SCEI within thirty (30) days of the results${isTindig ? '' : ' (term begins on the 31st day)'}; failing the exam without a timely Request for Continuance (two (2) months from the results); failure to complete the 1,500 Service Hours (from date of separation)${isTindig ? '' : '; or three (3) years from receipt of the last grant or Statement of Account, whichever is later'}.` }

  const sec4Rest: LoanBlock[] = [
    { lead: '4.2 Election.', text: `The ${A} notifies SCEI in writing of the option elected within thirty (30) days from the official release of the Licensure Examination results. Absent a timely election, SCEI issues a reminder giving fifteen (15) days; failing which, the ${A} is deemed to have elected the Repayment Option, without prejudice to switching.` },
    { lead: '4.3 Request for Continuance (Failure to Obtain Licensure).', text: `If the ${A} fails the Licensure Examination on the first attempt, he/she may, within thirty (30) days of the results, file a Request for Continuance undertaking to retake the next available exam, with the repayment term held in abeyance until the retake results. If granted, no additional grant, funding, or review support is released for the retake. On passing the retake and obtaining a license, the ${A} may elect Option A or Option B (election counted from the retake results). If the ${A} fails on the second attempt, or fails to take the exam within two (2) examination cycles after eligibility, the entire loan becomes due and demandable two (2) months from the second results (or the last day of the second cycle, if not taken).` },
    { lead: '4.4 Repayment Schedule.', text: 'Under Option B, the loan (or remaining balance) is settled in three (3) equal monthly installments where the amount is Fifty Thousand Pesos (PHP 50,000.00) or less, and six (6) equal monthly installments where it exceeds PHP 50,000.00. A sample computation is attached as Annex “A.”' },
    { lead: '4.5 Post-Dated Checks.', text: `Installments are settled through post-dated checks drawn on the ${A}’s or CO-MAKER’s checking account, issued in favor of SCEI on the applicable commencement date. Any dishonor on presentment is a failure to pay and a material breach, upon which penalties and interest apply and the entire loan becomes immediately due and demandable without need of demand. Where neither maintains a checking account, SCEI may allow an alternative arrangement (such as auto-debit).` },
    { lead: '4.6 Prepayment.', text: `The ${A} may settle the entire loan or balance in advance, without penalty or charge.` },
    { lead: '4.7 Interest, Penalties, and Fees.', text: `Unless otherwise provided, or except in case of material breach, all grants under this Program bear no interest, charge, fee, surcharge, or penalty.` },
    { lead: '4.8 Restructuring.', text: `Upon written request, and only for exigencies outside the ${A}’s control and without his/her fault (financial hardship, serious illness, a death in the immediate family, or similar), SCEI may, in its sole discretion, extend, restructure, or re-schedule the repayment, or waive or reduce the amounts due, fairly and with compassion.` },
    { lead: '4.9 Solidary Liability of the CO-MAKER.', text: `The CO-MAKER is JOINTLY AND SEVERALLY LIABLE as a primary co-obligor with the ${A} for all obligations, including monetary obligations, penalties, charges, interest, and damages; waives demand, presentment, notice of dishonor, and the order of enforcement (SCEI may proceed against the CO-MAKER directly); and executes the Joint Undertaking with Promissory Note (Annex “B”), an integral part of this Agreement.` },
    { lead: '4.10 Switching / Combining Options.', text: `Nothing prevents SCEI from allowing the ${A} to switch between or combine the two settlement options at any time before the loan is fully settled.` },
  ]

  const sec5: LoanBlock[] = [
    { h: '5. DEFAULT AND MATERIAL BREACH' },
    { lead: '5.1 Events of Default.', text: `The following are Events of Default: (a) failure to pay two (2) or more consecutive monthly installments under Option B (or any continuance, undertaking, switched, combined, or restructured terms); (b) failure to issue post-dated checks or to be allowed an alternative payment arrangement; and (c) material misrepresentation in the ${A}’s application or any compliance report.` },
    { lead: '5.2 Notice and Cure.', text: `On any material breach, SCEI serves written notice to the ${A} and CO-MAKER stating the ground. The ${A} has thirty (30) calendar days to cure. Failure to cure renders the entire obligation immediately due and demandable without further notice, and the remaining balance is subject to legal interest, liquidated damages of five percent (5%) of the unpaid balance, and costs of suit and collection — without prejudice to SCEI’s other remedies.` },
  ]

  const sec6: LoanBlock[] = [
    { h: '6. GENERAL PROVISIONS' },
    { lead: '6.1 Confidentiality and Data Privacy.', text: `This Agreement and related records may contain personal and sensitive personal information, protected consistent with R.A. 10173 (Data Privacy Act of 2012). The ${A} and CO-MAKER consent to SCEI’s collection, processing, and use of their data to administer this Agreement, including disclosure to SCEI’s accountants, auditors, and legal counsel as needed.` },
    { lead: '6.2 Voluntary Undertaking; No Compulsion of Service.', text: `The settlement options, including Service Condonation, are a privilege and option in favor of the ${A} and not an obligation. Nothing obliges the ${A} to render compulsory service, and SCEI shall not demand or compel it. The ${A}’s sole enforceable obligation is monetary, to the extent the loan is not settled or condoned through voluntary service.` },
    { lead: '6.3 Nature of the Fellowship.', text: `This Fellowship Program is an educational assistance and talent-development benefit extended incidental to SCEI’s therapy-clinic business, in contemplation of the ${A}’s prospective professional engagement with SCEI. SCEI is not engaged in the business of lending and extends no assistance for profit; nothing here is the grant of a loan in the course of a lending business.` },
    { text: 'This Agreement is governed by the laws of the Republic of the Philippines, with venue exclusively before the proper courts of San Juan City. It (with its Annexes) is the entire agreement, supersedes all prior understandings (including any prior fellowship or loan agreement covering the same fellowship), and may be amended only in writing signed by all Parties. If any provision is held invalid, the rest remain in force. It binds the Parties and their heirs, executors, administrators, successors, and permitted assigns, and may not be assigned by the ' + A + ' or CO-MAKER without SCEI’s written consent.' },
    { text: `IN WITNESS WHEREOF, the Parties sign this Agreement: for SCEI, Hannah Jara, CEO and President; the ${A}; and the CO-MAKER — before witnesses (a representative of the UP Manila CAMP Office of Student Relations and a member of the SCEI Board of Directors), and acknowledged before a Notary Public. A Joint Undertaking with Promissory Note (Annex “B”) is executed with this Agreement.` },
  ]

  return [
    ...intro,
    ...sec1,
    ...sec2,
    ...sec3,
    ...sec4Head,
    optionA,
    optionB,
    ...sec4Rest,
    ...sec5,
    ...sec6,
  ]
}

// ── Annex A — sample repayment computation (no interest) ──────────────────────
export function annexIntro(isTindig: boolean): string {
  return isTindig
    ? 'The computation below is for illustration only. It assumes the maximum Assistance Amount under the Tindig Track of PHP 30,000.00, repaid in three (3) equal monthly installments, without interest or any charge of any kind, per Section 4.4. The APPLICANT’s actual schedule is based on the amount actually disbursed. The total repaid always equals — and never exceeds — the amount received. A APPLICANT who settles through the Service Condonation Option (Option A) pays nothing at all, and this Annex does not apply.'
    : 'The computations below are for illustration only. They assume repayment of the loan in equal consecutive monthly installments over the applicable Repayment Period — three (3) months where the loan is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00 — without interest or any charge of any kind, per Section 4.4. The APPLICANT’s actual schedule is based on the amount actually disbursed. The total repaid always equals — and never exceeds — the amount received. An APPLICANT who settles through the Service Condonation Option (Option A) pays nothing at all, and this Annex does not apply.'
}

export const annexNote =
  'Figures are rounded to the nearest centavo; the final installment is adjusted so that the loan is fully repaid on the last installment. Prepayment is allowed at any time without penalty. No interest or charge of any kind applies at any point (except only the legal interest and 5% liquidated damages that arise after an uncured material breach under Section 5).'

export function annexTables(isTindig: boolean): AnnexTable[] {
  if (isTindig) {
    return [{
      caption: 'Full repayment schedule — illustrative loan of PHP 30,000.00, repaid over three (3) months',
      headers: ['Month', 'Outstanding balance', 'Monthly installment', 'Balance after payment'],
      rows: [
        ['1', '30,000.00', '10,000.00', '20,000.00'],
        ['2', '20,000.00', '10,000.00', '10,000.00'],
        ['3', '10,000.00', '10,000.00', '0.00'],
        ['Total', '—', '30,000.00', '0.00'],
      ],
    }]
  }
  return [
    {
      caption: 'Summary by loan amount',
      headers: ['Loan amount', 'Repayment period', 'Monthly installment', 'Total repaid'],
      rows: [
        ['25,000.00', '3 months', '8,333.33', '25,000.00'],
        ['50,000.00', '3 months', '16,666.67', '50,000.00'],
        ['100,000.00', '6 months', '16,666.67', '100,000.00'],
      ],
    },
    {
      caption: 'Full repayment schedule — illustrative loan of PHP 100,000.00, repaid over six (6) months',
      headers: ['Month', 'Outstanding balance', 'Monthly installment', 'Balance after payment'],
      rows: [
        ['1', '100,000.00', '16,666.67', '83,333.33'],
        ['2', '83,333.33', '16,666.67', '66,666.66'],
        ['3', '66,666.66', '16,666.67', '49,999.99'],
        ['4', '49,999.99', '16,666.67', '33,333.32'],
        ['5', '33,333.32', '16,666.67', '16,666.65'],
        ['6', '16,666.65', '16,666.65', '0.00'],
        ['Total', '—', '100,000.00', '0.00'],
      ],
    },
  ]
}
