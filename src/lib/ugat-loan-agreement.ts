// Single source of truth for the UGAT Fellowship Agreement text, shared by
// the on-screen reader (Portal RSAText) and the generated signed PDF
// (ugat-rsa-pdf.ts). Reproduces the two track agreements (Aral / Tindig) —
// educational fellowship ASSISTANCE (not a loan), fully condonable through
// professional service (Option A) or reimbursed in installments with NO
// interest and NO charges of any kind (Option B) — plus Annex A.
//
// There is no interest and no principal: the FELLOW never reimburses more than
// the Assistance Amount actually received, except only legal interest (6% p.a.)
// and one-time liquidated damages (5%) that arise solely after an uncured
// default under Section 7.3.

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

// Sections 7–10 + signature note are identical across both tracks.
const TAIL: LoanBlock[] = [
  { h: '7. DEFAULT' },
  { lead: '7.1 Events of Default.', text: 'The following constitute Events of Default: failure to pay two (2) or more consecutive monthly installments when due under the Reimbursement Option (including under Sections 2.4 and 5.9), absent an SCEI-approved restructuring; failure to make an election under Section 4.2 and thereafter to pay in accordance with the deemed election, despite the written notices provided therein; and material misrepresentation in the FELLOW’s application or in any subsequent compliance report.' },
  { lead: '7.2 Notice and Cure.', text: 'Prior to any declaration of default, SCEI shall furnish written notice to the FELLOW and CO-MAKER of the alleged default. The FELLOW shall have thirty (30) days from receipt to cure. Failure to cure within the cure period shall result in formal acceleration.' },
  { lead: '7.3 Consequences of Default.', text: 'Upon an uncured Event of Default, the outstanding reimbursable balance shall become immediately due and payable, shall bear legal interest at the rate prescribed by law and prevailing jurisprudence (currently six percent [6%] per annum) from the date of extrajudicial or judicial demand until fully paid, and shall be subject to one-time liquidated damages of five percent (5%) of the accelerated balance. For the avoidance of doubt, the rendering of professional service can never be demanded or compelled under this Agreement: SCEI’s remedies are purely monetary and are limited to the outstanding reimbursable balance, such legal interest, the liquidated damages stated in this Section, and reasonable costs of collection.' },
  { h: '8. CO-MAKER OBLIGATIONS' },
  { text: 'THE CO-MAKER expressly acknowledges and agrees that he/she is JOINTLY AND SEVERALLY LIABLE with the FELLOW for all monetary obligations arising under this Agreement, including installments, accelerated balances, and the legal interest and liquidated damages under Section 7.3, and costs of collection. The CO-MAKER waives the benefits of demand, presentment, notice of dishonor, and the order of enforcement, and SCEI may proceed against the CO-MAKER directly without first proceeding against the FELLOW. For the avoidance of doubt, the CO-MAKER’s liability is extinguished to the same extent as the FELLOW’s, including by Condonation under Sections 5.8 and 5.9.' },
  { h: '9. CONFIDENTIALITY AND DATA PRIVACY' },
  { text: 'This Agreement and any related records are confidential and shall be protected consistent with R.A. 10173 (Data Privacy Act of 2012). The FELLOW and CO-MAKER consent to SCEI’s collection, processing, and use of their personal data to administer this Agreement, including disclosure to SCEI’s accountants, auditors, and legal counsel as needed.' },
  { h: '10. GENERAL PROVISIONS' },
  { lead: '10.1 Voluntary Undertaking; No Compulsion of Service.', text: 'The Service Condonation Option is a privilege and option granted in favor of the FELLOW and is not an obligation. Nothing in this Agreement obliges the FELLOW to render service to SCEI, and SCEI shall never demand or compel such service. The FELLOW’s sole enforceable obligation is the monetary Reimbursement Obligation, to the extent the Fellowship Assistance is not condoned through service actually rendered.' },
  { lead: '10.2 Nature of the Fellowship.', text: 'The Fellowship Assistance is an educational assistance and talent development benefit extended by SCEI incidental to its business of operating therapy clinics, and in contemplation of the FELLOW’s prospective professional engagement with SCEI; SCEI is not engaged in the business of lending and extends no assistance for profit; and nothing in this Agreement shall be construed as the grant of a loan in the course of a lending business.' },
  { text: 'This Agreement is governed by the laws of the Republic of the Philippines, with venue exclusively before the proper courts of San Juan City. It constitutes the entire agreement, supersedes all prior understandings (including any prior form of fellowship or loan agreement covering the same fellowship), and may be amended only in writing signed by all Parties. If any provision is held invalid, the rest remain in force. It takes effect upon execution and binds the Parties and their respective heirs, executors, administrators, successors, and permitted assigns.' },
  { text: 'IN WITNESS WHEREOF, the Parties sign this Agreement: for SCEI, Hannah Jara, CEO and President; the FELLOW; and the CO-MAKER — in the presence of witnesses (a representative of the University’s Office of Student Relations and a member of the SCEI Board of Directors), and acknowledged before a Notary Public.' },
]

// Section 5 (Option A). Only §5.2 and §5.9 carry a track-specific phrase.
function optionA(prof: string, sec52Tail: string, sec59: string): LoanBlock[] {
  return [
    { h: '5. OPTION A — SERVICE CONDONATION (FULL WAIVER OF THE ASSISTANCE AMOUNT)' },
    { lead: '5.1 Engagement.', text: `Where the FELLOW elects the Service Condonation Option, SCEI and the FELLOW shall execute an Engagement Contract within sixty (60) days from the FELLOW’s receipt of the official PRC Certificate of Registration / Professional Identification Card, engaging the FELLOW as a licensed ${prof} professional under either (a) a fixed-term employment contract, or (b) a consultancy / professional services contract, as mutually agreed. Where the engagement is by consultancy, the FELLOW shall render services for a minimum of four (4) clinic days per week until the Service Hours are completed. Failure, without SCEI-approved extension, to execute the contract or commence the engagement within that period is deemed an election of the Reimbursement Option.` },
    { lead: '5.2 Service Hours.', text: `The Service Hours consist of One Thousand Five Hundred (1,500) hours of direct patient treatment sessions at any SCEI clinic. A “treatment session” is time in direct, billable therapy or intervention with a patient, including attendant assessment, documentation, and case-management time; purely administrative, training, or non-clinical hours are not credited unless approved in writing. At typical clinical loads (including at least four clinic days per week), the Service Hours are ordinarily completed within approximately fifteen (15) to eighteen (18) months. The Service Hours are fixed at 1,500 hours for all fellows regardless of ${sec52Tail}, and their completion condones the entire Fellowship Assistance whatever its amount.` },
    { lead: '5.3 Full Compensation.', text: `Throughout the engagement, the FELLOW receives the standard market compensation based on the Clinic’s compensation structure at the time of engagement for a licensed ${prof} professional (or the corresponding professional fees, where by consultancy). Condonation is earned in addition to — and is never deducted from — the FELLOW’s compensation: no salary or fee deduction of any kind is made on account of the Fellowship Assistance, and the FELLOW is paid in full for every hour worked while simultaneously earning credit toward Condonation.` },
    { lead: '5.4 Fringe Benefits.', text: 'The FELLOW may be entitled to such fringe benefits, allowances, incentives, and professional development support as SCEI may make available from time to time to similarly situated professionals, as set out in the Engagement Contract or the applicable SCEI policy; provided that any benefit already earned shall not be diminished retroactively.' },
    { lead: '5.5 Crediting of Hours.', text: 'Each hour of direct patient treatment actually rendered under the Engagement Contract is credited toward the Service Hours, recorded in real time through SCEI’s ERP system, which serves as the official record of hours rendered and the remaining balance. Any discrepancy shall be raised in writing within fifteen (15) days of a statement; otherwise the ERP record is conclusive.' },
    { lead: '5.6 Place of Engagement.', text: 'The FELLOW agrees to be willing to accept assignment to either or both of SCEI’s clinics based on operational need — Aura Health Rehab – East Branch (Robinsons Metro East, Marcos Highway, Santolan, Pasig) and Greenhills Branch (GH Tower Offices, Ortigas Avenue, Greenhills, San Juan) — or any future SCEI location. Reasonable preference is considered but not guaranteed.' },
    { lead: '5.7 Commitment During the Engagement.', text: `While rendering the Service Hours, the FELLOW shall devote his or her professional practice as a ${prof} professional to SCEI and its clinics, and shall not render such services to or for any other clinic, hospital, therapy center, school-based program, or similar facility without SCEI’s prior written consent (limited academic or teaching exceptions may be permitted in writing). Any breach is addressed solely under Section 5.9 — by proportionate condonation and reimbursement of the balance — and never by penalty or compulsion of service.` },
    { lead: '5.8 Full Condonation upon Completion.', text: 'Upon completion of the full 1,500 Service Hours, the entire Fellowship Assistance — the full Assistance Amount — is automatically, fully, and irrevocably condoned, waived, and written off, and the Reimbursement Obligation is deemed fully discharged and extinguished. SCEI shall issue a Certificate of Full Condonation and Release within thirty (30) days of completion, and the obligations of the FELLOW and CO-MAKER are thereupon extinguished. A FELLOW who discharges the Reimbursement Obligation under this Option pays nothing at any time.' },
    { lead: '5.9 Partial Service; Proportionate Condonation.', text: `Every hour of service rendered in good faith is honored. Should the FELLOW discontinue the engagement before completing the Service Hours (or switch to the Reimbursement Option under Section 4.3), the Assistance Amount is condoned proportionately — in the ratio that the Service Hours actually rendered bear to 1,500 — and only the unrendered proportion of the Assistance Amount is reimbursable. The reimbursable balance is paid ${sec59}, without interest or any other charge, commencing sixty (60) days from discontinuance. No penalty, surcharge, or retroactive charge of any kind applies to the portion condoned through hours already rendered.` },
    { lead: '5.10 Continued Engagement After Condonation.', text: 'Nothing prevents the FELLOW from continuing to work with the Clinic after Condonation, under a separate arrangement on such terms as the Parties may then agree — voluntary on both sides, governed by that separate arrangement and not by this Agreement, and not reviving any obligation under this Agreement.' },
  ]
}

function sec4(sec41Installments: string): LoanBlock[] {
  return [
    { h: '4. DISCHARGE OF THE REIMBURSEMENT OBLIGATION; ELECTION' },
    { lead: '4.1 Two Modes of Discharge.', text: `Upon Licensure, the FELLOW shall discharge the Reimbursement Obligation through one — or a combination, as provided in Sections 4.3 and 5.9 — of the following modes, at the FELLOW’s own choice: (a) the Service Condonation Option (Option A), under which the FELLOW practices with SCEI under an Engagement Contract, with full market compensation, and the entire Fellowship Assistance is condoned and written off in full upon completion of the Service Hours (Section 5); or (b) the Reimbursement Option (Option B), under which the FELLOW reimburses the Assistance Amount ${sec41Installments} (Section 6). The Program is designed so that a FELLOW who chooses to begin his or her professional career with SCEI pays nothing at all — and a FELLOW who elects reimbursement never pays back more than what was actually received.` },
    { lead: '4.2 Election.', text: 'The FELLOW shall notify SCEI in writing of the option elected within thirty (30) days from the official release of the Licensure Examination results. If no timely election is made, SCEI issues a written reminder giving fifteen (15) days to elect; absent an election within that period, the FELLOW is deemed to have elected the Reimbursement Option, without prejudice to Section 4.3.' },
    { lead: '4.3 Switching Between Options.', text: 'The FELLOW may, at any time before full reimbursement under the Reimbursement Option and with SCEI’s written approval, switch to the Service Condonation Option, condoning the then-outstanding balance upon rendering the proportionate Service Hours. Conversely, a FELLOW who has commenced service may switch to the Reimbursement Option at any time, in which case Section 5.9 applies. Every hour of service rendered in good faith is always honored and credited.' },
    { lead: '4.4 Retake; Failure to Obtain Licensure.', text: 'Should the FELLOW fail the Licensure Examination on the first attempt, the FELLOW may retake it at the next available schedule; no additional allowance, stipend, review support, or other amount is released for the retake, which is for the FELLOW’s own account. Should the FELLOW pass the retake, the FELLOW may discharge the Reimbursement Obligation through either Option A or Option B under Section 4.2, with the election period counted from the release of the retake results. Should the FELLOW fail on the second attempt, or fail to take the examination within two (2) examination cycles after eligibility, the Reimbursement Option applies and the Assistance Amount is reimbursed, without interest or any other charge, with installments commencing sixty (60) days after the release of the second cycle’s results (or the last day of that cycle, if not taken), subject to restructuring under Section 6.5 — without prejudice to the Service Condonation Option upon eventual Licensure, with SCEI’s written approval, as to any balance then outstanding.' },
  ]
}

function optionBTail(checks: string): LoanBlock[] {
  return [
    { lead: '6.2 Post-Dated Checks.', text: `Upon election (or deemed election) of the Reimbursement Option, and not later than five (5) days before the Reimbursement Commencement Date (or before installments commence under Sections 2.4 or 5.9), the FELLOW shall deliver ${checks} drawn on the checking account of the FELLOW or CO-MAKER, each corresponding to one monthly installment, presented only on their due dates. A dishonored check is treated as a failure to pay that installment for Section 7.1. SCEI returns all undeposited checks upon full reimbursement, prepayment, an approved switch to Option A, or restructuring (with replacement checks). Where neither maintains a checking account, SCEI may allow an alternative arrangement (such as auto-debit).` },
    { lead: '6.3 No Interest; No Other Charges.', text: 'No interest, application fee, service fee, processing fee, surcharge, or charge of any kind shall be collected in connection with the Fellowship Assistance or its reimbursement. The FELLOW shall never be required to pay more than the Assistance Amount actually received, except only as provided in Section 7.3 following an uncured default.' },
    { lead: '6.4 Prepayment.', text: 'The FELLOW may prepay the reimbursable balance, in whole or in part, at any time and without penalty or charge of any kind.' },
    { lead: '6.5 Restructuring.', text: 'Upon the FELLOW’s reasonable request, and particularly in cases of financial hardship, serious illness, a death in the immediate family, or other circumstances beyond the FELLOW’s control, SCEI may, in its discretion, extend, restructure, or re-schedule the reimbursement, or waive or reduce the amounts due, consistent with its commitment to handle each case fairly and with compassion.' },
    { lead: '6.6 Reimbursement Undertaking.', text: 'Upon election (or deemed election) of the Reimbursement Option, and together with the post-dated checks, the FELLOW and the CO-MAKER (as solidary co-obligor) shall execute a Reimbursement Undertaking (Annex “B”) covering the outstanding reimbursable balance and conforming to the reimbursement schedule. Its execution is a covenant of this Agreement; failure or refusal to execute it shall not extinguish or diminish the obligations of the FELLOW and CO-MAKER.' },
  ]
}

export function loanAgreementBlocks(i: LoanInput): LoanBlock[] {
  const isTindig = i.track === 'TINDIG'
  const prof = i.program || 'Allied Health'
  const uni = i.school || 'the University'
  const who = i.fellowName || '________________'
  const cm = i.comakerName || '________________'
  const m = i.monthly && i.months ? i.monthly : null
  const n = i.monthly && i.months ? i.months : null
  const amt = m ? `PHP ${m.toLocaleString()}.00` : 'PHP ____________'
  const cov = n ? `${n}` : '____________'

  const intro: LoanBlock[] = [
    { text: 'KNOW ALL PERSONS BY THESE PRESENTS:' },
    isTindig
      ? { text: `This UGAT Fellowship Agreement (the “Agreement”) is made by and among SAPPHIRE CLINICS EAST INCORPORATED, operating Aura Health Rehab, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City (“SCEI” or the “Clinic”); ${who}, of legal age, Filipino, a graduate of the ${prof} program of ${uni} preparing for the ${prof} Licensure Examination (the “FELLOW”); and the FELLOW’s parent / guardian, ${cm} (the “CO-MAKER”). SCEI, the FELLOW, and the CO-MAKER are collectively the “Parties.”` }
      : { text: `This UGAT Fellowship Agreement (the “Agreement”) is made by and among SAPPHIRE CLINICS EAST INCORPORATED, operating Aura Health Rehab, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City (“SCEI” or the “Clinic”); ${who}, of legal age, Filipino, a ${prof} student intern of ${uni} (the “FELLOW”); and the FELLOW’s parent / guardian, ${cm} (the “CO-MAKER”). SCEI, the FELLOW, and the CO-MAKER are collectively the “Parties.”` },
    { text: 'WITNESSETH: THAT' },
  ]

  const recitals: LoanBlock[] = isTindig ? [
    { text: 'WHEREAS, SCEI has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — as part of its program for developing and retaining licensed therapists, whose Tindig Track is a review-support fellowship offered to qualified graduates who have completed the University’s clinical internship requirement, have not been awarded under the Aral Track, and are preparing for the Licensure Examination;' },
    { text: 'WHEREAS, the FELLOW has been awarded a fellowship under the Tindig Track, by which SCEI shall extend review-support fellowship assistance of up to Thirty Thousand Pesos (PHP 30,000.00), availed as direct payment of licensure review fees or as a monthly review stipend;' },
    { text: 'WHEREAS, the Program is designed so that the FELLOW need never reimburse the Fellowship Assistance in cash: upon Licensure, the FELLOW may have the entire Fellowship Assistance condoned and written off in full by practicing his or her profession with SCEI under a fixed-term employment or consultancy engagement, with full market compensation; or the FELLOW may instead simply reimburse the amounts actually received in convenient equal monthly installments, without interest or any other charge;' },
    { text: 'WHEREAS, the Fellowship Assistance is an educational assistance and talent development benefit extended by SCEI incidental to its business of operating therapy clinics, in contemplation of the FELLOW’s prospective professional engagement with SCEI; it is not a loan extended in the course of a lending business, SCEI does not engage in the business of lending, and no interest or profit of any kind is charged on the Fellowship Assistance;' },
    { text: 'NOW, THEREFORE, the Parties agree as follows:' },
  ] : [
    { text: 'WHEREAS, SCEI has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — as part of its program for developing and retaining licensed therapists, whose Aral Track is an allowance-based fellowship offered to qualified student interns undergoing their clinical internship;' },
    { text: 'WHEREAS, the FELLOW has been awarded a fellowship under the Aral Track, by which SCEI shall extend educational fellowship assistance, released as a monthly allowance, in the amount and for the Coverage Period determined by the Program Assessors, during the FELLOW’s clinical internship;' },
    { text: 'WHEREAS, the Program is designed so that the FELLOW need never reimburse the Fellowship Assistance in cash: upon Licensure, the FELLOW may have the entire Fellowship Assistance condoned and written off in full by practicing his or her profession with SCEI under a fixed-term employment or consultancy engagement, with full market compensation; or the FELLOW may instead simply reimburse the amounts actually received in convenient equal monthly installments, without interest or any other charge;' },
    { text: 'WHEREAS, the Fellowship Assistance is an educational assistance and talent development benefit extended by SCEI incidental to its business of operating therapy clinics, in contemplation of the FELLOW’s prospective professional engagement with SCEI; it is not a loan extended in the course of a lending business, SCEI does not engage in the business of lending, and no interest or profit of any kind is charged on the Fellowship Assistance;' },
    { text: 'NOW, THEREFORE, the Parties agree as follows:' },
  ]

  const defsAndSec2: LoanBlock[] = isTindig ? [
    { h: '1. DEFINITIONS' },
    { lead: 'Grant Facility.', text: 'The review-support facility of up to Thirty Thousand Pesos (PHP 30,000.00), availed as (a) SCEI’s direct payment of licensure review fees up to PHP 30,000.00, or (b) a monthly review stipend of PHP 5,000.00 for six (6) months. Each availment forms part of the Fellowship Assistance.' },
    { lead: 'Fellowship Assistance; Assistance Amount.', text: 'The review-support fellowship assistance extended by SCEI. The Assistance Amount is the cumulative amount actually disbursed under the Grant Facility, not exceeding PHP 30,000.00.' },
    { lead: 'Reimbursement Obligation.', text: 'The FELLOW’s contingent obligation to reimburse the Assistance Amount, to the extent not condoned through service (Sections 4 to 6). It never includes interest or any charge of any kind, except only the legal interest and liquidated damages that may arise after an uncured default under Section 7.3.' },
    { lead: 'Review Period.', text: `The period during which the FELLOW undertakes review for the ${prof} Licensure Examination, ending upon completion of the Examination.` },
    { lead: 'Service Condonation Option (Option A).', text: 'The FELLOW’s option to discharge the Reimbursement Obligation in full — the entire Assistance Amount condoned and waived — by rendering the Service Hours under an Engagement Contract (Section 5).' },
    { lead: 'Reimbursement Option (Option B).', text: 'The FELLOW’s option to reimburse the Assistance Amount in three (3) equal monthly installments, without interest or any other charge (Section 6).' },
    { lead: 'Service Hours.', text: 'One Thousand Five Hundred (1,500) hours of direct patient treatment sessions rendered as a licensed professional at any SCEI clinic, ordinarily completed within approximately fifteen (15) to eighteen (18) months at typical clinical loads (Section 5.2).' },
    { lead: 'Condonation.', text: 'The full waiver, write-off, and extinguishment of the Reimbursement Obligation — including the entire Assistance Amount — upon completion of the Service Hours (Section 5.8).' },
    { lead: 'Reimbursement Commencement Date.', text: 'The date falling sixty (60) days after the FELLOW’s completion of the Licensure Examination (Section 6.1).' },
    { lead: 'Reimbursement Period.', text: 'Three (3) months, regardless of the Assistance Amount (Section 6.1).' },
    { lead: 'Program Assessors.', text: 'The panel or officers designated by SCEI to evaluate applications (including Tindig applications) and determine the award of the Grant Facility. Their determination is final.' },
    { h: '2. THE FELLOWSHIP ASSISTANCE AND REVIEW SUPPORT' },
    { lead: '2.1 Grant of Fellowship Assistance.', text: 'SCEI extends to the FELLOW review-support fellowship assistance in the maximum amount of Thirty Thousand Pesos (PHP 30,000.00). The FELLOW shall elect in writing, subject to SCEI’s approval, one of two ways of availing: (a) direct payment by SCEI of review fees (including enrolment in a licensure review program and materials) up to PHP 30,000.00; or (b) a monthly review stipend of PHP 5,000.00 for six (6) months. Under (a), SCEI pays only fees actually incurred; any shortfall below PHP 30,000.00 is not paid out or refunded, and any excess is for the FELLOW’s account. For emphasis: the amounts disbursed are educational assistance subject only to a contingent Reimbursement Obligation; they are fully condonable — in their entirety — through the Service Condonation Option under Section 5, and no interest or charge of any kind is imposed in any case.' },
    { lead: '2.2 Disbursement.', text: 'Stipend availments are remitted to the FELLOW’s nominated bank account on or before the tenth (10th) day of each month; review-fee availments are paid by SCEI directly to the provider on presentation of enrolment documents or billing, or reimbursed against official receipts.' },
    { lead: '2.3 Acknowledgment; Statement of Account.', text: 'Each disbursement under the Grant Facility forms part of the Fellowship Assistance. SCEI shall furnish a Statement of Account upon conclusion of the Review Period, deemed accepted unless contested in writing within fifteen (15) days. No interest, fee, or charge of any kind accrues on the Fellowship Assistance at any time — during the Review Period, before the Reimbursement Commencement Date, or during reimbursement — and none ever arises where the FELLOW discharges the Reimbursement Obligation through the Service Condonation Option.' },
    { lead: '2.4 Discontinuance of Review.', text: 'Should the FELLOW abandon or discontinue the review, or fail to sit for the Licensure Examination as required, further disbursements cease as of the date of discontinuance, and the Assistance Amount actually received is reimbursed in up to three (3) equal monthly installments, without interest or any other charge, commencing ninety (90) days from discontinuance. Full payment finally settles the Parties’ obligations. SCEI may, with compassion, waive, reduce, or restructure the reimbursement — particularly for serious illness, a death in the immediate family, or circumstances beyond the FELLOW’s control — and may, upon eventual Licensure, allow discharge of the balance through the Service Condonation Option on proportionate terms.' },
    { lead: '2.5 One-Time Award.', text: 'The Grant Facility is a one-time facility fixed at a maximum of PHP 30,000.00 and shall not be increased, renewed, or extended under any circumstance, including any retaking of the Licensure Examination. Any review beyond the Grant Facility is at the FELLOW’s own cost. Both modes of discharging the Reimbursement Obligation under Section 4 remain fully available upon eventual Licensure.' },
    { h: '3. OBLIGATIONS DURING THE REVIEW PERIOD' },
    { text: `During the Review Period, the FELLOW shall: enrol in and diligently attend a licensure review program (or pursue a structured self-review plan disclosed to SCEI) and exert faithful effort to prepare; provide SCEI proof of enrolment and reasonable progress updates; signify willingness to be assigned to either or both of SCEI’s clinics for any engagement under the Service Condonation Option (Section 5.6); disclose any change in review or examination plans within seven (7) days; sit for and complete the ${prof} Licensure Examination at the next available date after eligibility, exerting best efforts to pass; and actively participate in “Araw ng Kalinga,” SCEI’s one-day annual community outreach in partnership with an LGU or NGO, whenever held during the Review Period or any engagement under Section 5.` },
  ] : [
    { h: '1. DEFINITIONS' },
    { lead: 'Allowance.', text: 'The monthly financial release of either Five Thousand Pesos (PHP 5,000.00) or Ten Thousand Pesos (PHP 10,000.00) — the tier awarded by the Program Assessors — paid for the Coverage Period awarded, each release forming part of the Fellowship Assistance (subject to Section 2.6).' },
    { lead: 'Fellowship Assistance; Assistance Amount.', text: 'The educational fellowship assistance extended by SCEI. The Assistance Amount is the cumulative Allowance actually released, ranging from Twenty-Five Thousand Pesos (PHP 25,000.00) to One Hundred Thousand Pesos (PHP 100,000.00), depending on the stipend tier and Coverage Period awarded.' },
    { lead: 'Reimbursement Obligation.', text: 'The FELLOW’s contingent obligation to reimburse the Assistance Amount, to the extent not condoned through service (Sections 4 to 6). It never includes interest or any charge of any kind, except only the legal interest and liquidated damages that may arise after an uncured default under Section 7.3.' },
    { lead: 'Coverage Period.', text: 'The number of months for which the Allowance is awarded: ten (10) months for a full-year award, or five (5) months for a semestral award (available only to applicants applying for the second semester).' },
    { lead: 'Service Condonation Option (Option A).', text: 'The FELLOW’s option to discharge the Reimbursement Obligation in full — the entire Assistance Amount condoned and waived — by rendering the Service Hours under an Engagement Contract (Section 5).' },
    { lead: 'Reimbursement Option (Option B).', text: 'The FELLOW’s option to reimburse the Assistance Amount in equal consecutive monthly installments over the applicable Reimbursement Period, without interest or any other charge (Section 6).' },
    { lead: 'Service Hours.', text: 'One Thousand Five Hundred (1,500) hours of direct patient treatment sessions rendered as a licensed professional at any SCEI clinic, ordinarily completed within approximately fifteen (15) to eighteen (18) months at typical clinical loads (Section 5.2).' },
    { lead: 'Condonation.', text: 'The full waiver, write-off, and extinguishment of the Reimbursement Obligation — including the entire Assistance Amount — upon completion of the Service Hours (Section 5.8).' },
    { lead: 'Reimbursement Commencement Date.', text: 'The date falling sixty (60) days after the FELLOW’s completion of the Licensure Examination (Section 6.1).' },
    { lead: 'Reimbursement Period.', text: 'Three (3) months where the Assistance Amount is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00 (Section 6.1).' },
    { lead: 'Program Assessors.', text: 'The panel or officers designated by SCEI to evaluate applications and determine the monthly stipend tier (PHP 5,000.00 or PHP 10,000.00) and the Coverage Period awarded. Their determination is final.' },
    { h: '2. THE FELLOWSHIP ASSISTANCE' },
    { lead: '2.1 Grant of Fellowship Assistance.', text: `SCEI extends to the FELLOW educational fellowship assistance, released as a monthly Allowance of either PHP 5,000.00 or PHP 10,000.00, payable for the Coverage Period awarded (ten (10) months full-year, or five (5) months semestral, the latter available only to applicants applying for the second semester). The stipend tier and Coverage Period are determined by the Program Assessors and are final. The monthly Allowance awarded to the FELLOW under this Agreement is ${amt} per month, for a Coverage Period of ${cov} months. For emphasis: the amounts released are educational assistance subject only to a contingent Reimbursement Obligation; they are fully condonable — in their entirety — through the Service Condonation Option under Section 5, and no interest or charge of any kind is imposed in any case.` },
    { lead: '2.2 Disbursement.', text: 'The Allowance is remitted to the FELLOW’s nominated bank account on or before the tenth (10th) day of each month during the Internship Period.' },
    { lead: '2.3 Acknowledgment; Statement of Account.', text: 'Each release of the Allowance forms part of the Fellowship Assistance. SCEI shall furnish a Statement of Account upon conclusion of the Internship Period, deemed accepted unless contested in writing within fifteen (15) days. No interest, fee, or charge of any kind accrues on the Fellowship Assistance at any time — during the Internship Period, before the Reimbursement Commencement Date, or during reimbursement — and none ever arises where the FELLOW discharges the Reimbursement Obligation through the Service Condonation Option.' },
    { lead: '2.4 Cut-Short of Internship.', text: 'Should the FELLOW be unable to continue or complete the internship for any reason, releases cease as of the date of discontinuance, and the Assistance Amount actually received is reimbursed in equal monthly installments over the applicable Reimbursement Period (Section 6.1), without interest or any other charge, commencing ninety (90) days from discontinuance. Full payment finally settles the Parties’ obligations. SCEI may, with compassion, waive, reduce, or restructure the reimbursement — particularly for serious illness, a death in the immediate family, or circumstances beyond the FELLOW’s control — and may, upon eventual Licensure, allow discharge of the balance through the Service Condonation Option on proportionate terms.' },
    { lead: '2.5 Extension or Delayed Graduation.', text: 'The Allowance is fixed at the Coverage Period awarded and shall not be extended under any circumstance. Beyond the final month of the Coverage Period the FELLOW continues at his/her own cost, and no additional Allowance is due. Both modes of discharging the Reimbursement Obligation under Section 4 remain fully available upon eventual Licensure.' },
    { lead: '2.6 Application of Unused Allowance to Review Fees.', text: `Where the University’s internship runs fewer months than the Coverage Period awarded and the FELLOW completes the full internship requirement, the FELLOW may use the unused balance of the Allowance — the monthly stipend awarded multiplied by the undisbursed months — to cover ${prof} licensure review fees, upon proof of completion and proof of enrolment in (or receipts for) a review program. Any amount so released forms part of the Assistance Amount. This does not apply where the internship is cut short under Section 2.4, and does not affect the Service Hours, fixed at 1,500 hours.` },
    { h: '3. OBLIGATIONS DURING THE INTERNSHIP' },
    { text: `During the Internship Period, the FELLOW shall: maintain good standing as an enrolled ${prof} student intern; faithfully perform all duties, rotations, and clinical responsibilities; comply with the SCEI Code of Conduct, clinic policies, and the school’s requirements; maintain a passing grade throughout the internship year (equivalent to a grade of 3.0 or better under the University of the Philippines system); signify willingness to be assigned to either or both of SCEI’s clinics for any engagement under the Service Condonation Option (Section 5.6); disclose any change in academic or enrolment status within seven (7) days; sit for and complete the ${prof} Licensure Examination at the next available date after eligibility; and actively participate in “Araw ng Kalinga,” SCEI’s one-day annual community outreach in partnership with an LGU or NGO, whenever held during the Internship Period or any engagement under Section 5.` },
  ]

  const sec6Illustration: LoanBlock = isTindig
    ? { lead: '6.1 Terms of Reimbursement.', text: 'Where the Reimbursement Option applies, the FELLOW reimburses the Assistance Amount in three (3) equal consecutive monthly installments, regardless of the amount, without interest or any other charge. The first falls due on the Reimbursement Commencement Date (sixty (60) days after completion of the Licensure Examination). SCEI shall provide a reimbursement schedule before the first installment falls due. By way of illustration, an Assistance Amount of PHP 30,000.00 reimbursed over three (3) months entails a monthly installment of exactly PHP 10,000.00, for a total of exactly PHP 30,000.00. A sample computation is attached as Annex “A.” The total of all installments always equals — and never exceeds — the Assistance Amount actually received.' }
    : { lead: '6.1 Terms of Reimbursement.', text: 'Where the Reimbursement Option applies, the FELLOW reimburses the Assistance Amount in equal consecutive monthly installments over the Reimbursement Period — three (3) months where the Assistance Amount is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00 — in either case without interest or any other charge. The first falls due on the Reimbursement Commencement Date (sixty (60) days after completion of the Licensure Examination). SCEI shall provide a reimbursement schedule before the first installment falls due. By illustration: PHP 100,000.00 over six (6) months entails a monthly installment of approximately PHP 16,666.67; PHP 50,000.00 over three (3) months entails approximately PHP 16,666.67 monthly; PHP 25,000.00 over three (3) months entails approximately PHP 8,333.33 monthly. In every case the total equals the Assistance Amount actually received. Sample computations are attached as Annex “A.”' }

  const sec41 = isTindig
    ? 'in three (3) equal monthly installments, without interest or any other charge,'
    : 'in equal monthly installments over the applicable Reimbursement Period — three (3) months where the Assistance Amount is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00, without interest or any other charge,'
  const sec52Tail = isTindig ? 'the manner of availment or the amount of the Fellowship Assistance actually disbursed' : 'the stipend tier or Coverage Period awarded'
  const sec59 = isTindig ? 'in up to three (3) equal monthly installments' : 'in equal monthly installments over the Reimbursement Period applicable to the reimbursable balance under Section 6.1'
  const checks = isTindig ? 'three (3) post-dated checks' : 'post-dated checks equal in number to the monthly installments (three (3) or six (6), as applicable under Section 6.1)'

  return [
    ...intro,
    ...recitals,
    ...defsAndSec2,
    ...sec4(sec41),
    ...optionA(prof, sec52Tail, sec59),
    { h: '6. OPTION B — REIMBURSEMENT IN INSTALLMENTS (NO INTEREST, NO CHARGES)' },
    sec6Illustration,
    ...optionBTail(checks),
    ...TAIL,
  ]
}

// ── Annex A — fixed illustrative sample computations (verbatim from the docx) ──
export function annexIntro(isTindig: boolean): string {
  return isTindig
    ? 'The computation below is for illustration only. It assumes the maximum Assistance Amount under the Tindig Track of PHP 30,000.00, reimbursed in three (3) equal monthly installments, without interest or any charge of any kind, in accordance with Section 6.1. The FELLOW’s actual reimbursement schedule shall be based on the Assistance Amount actually disbursed. The total reimbursed always equals — and never exceeds — the amount actually received. A FELLOW who discharges the Reimbursement Obligation through the Service Condonation Option (Option A) pays nothing at all, and this Annex does not apply.'
    : 'The computations below are for illustration only. They assume reimbursement of the Assistance Amount in equal consecutive monthly installments over the applicable Reimbursement Period — three (3) months where the Assistance Amount is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00 — without interest or any charge of any kind, in accordance with Section 6.1. The FELLOW’s actual reimbursement schedule shall be based on the Assistance Amount actually disbursed. The total reimbursed always equals — and never exceeds — the amount actually received. A FELLOW who discharges the Reimbursement Obligation through the Service Condonation Option (Option A) pays nothing at all, and this Annex does not apply.'
}

export const annexNote =
  'Figures are rounded to the nearest centavo; the final installment is adjusted so that the Assistance Amount is fully reimbursed on the last installment. Prepayment is allowed at any time without penalty. No interest or charge of any kind applies at any point.'

export function annexTables(isTindig: boolean): AnnexTable[] {
  if (isTindig) {
    return [{
      caption: 'Full reimbursement schedule — illustrative Assistance Amount of PHP 30,000.00, reimbursed over three (3) months',
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
      caption: 'Summary by Assistance Amount',
      headers: ['Assistance amount', 'Reimbursement period', 'Monthly installment', 'Total reimbursed'],
      rows: [
        ['25,000.00', '3 months', '8,333.33', '25,000.00'],
        ['50,000.00', '3 months', '16,666.67', '50,000.00'],
        ['100,000.00', '6 months', '16,666.67', '100,000.00'],
      ],
    },
    {
      caption: 'Full reimbursement schedule — illustrative Assistance Amount of PHP 100,000.00, reimbursed over six (6) months',
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
