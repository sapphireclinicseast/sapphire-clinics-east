// Single source of truth for the UGAT Fellowship Agreement text, shared by the
// on-screen reader (Portal RSAText) and the generated signed PDF
// (ugat-rsa-pdf.ts). Reproduces the two REDRAFTED FINAL track agreements
// (Aral / Tindig) provided 2026 — actor term "FELLOW", loan-free framing.
//
// Nature: the sums are extended as EDUCATIONAL FELLOWSHIP ASSISTANCE, subject
// only to a contingent Reimbursement Obligation — condonable IN FULL through
// professional service (Option A) or reimbursed in installments with NO
// interest (Option B). No interest or charge applies in any case, EXCEPT legal
// interest + 5% liquidated damages that arise only after an uncured default
// (§7.3). SCEI is not engaged in the business of lending; this is not a loan.
//
// NOTE ON SERVICE HOURS: the redrafted Word agreements fix the Service Hours at
// 1,500 for BOTH tracks. Per an explicit product decision, the Tindig Track is
// carried at 600 Service Hours here (a deliberate deviation from the Word docs,
// which still read 1,500 for Tindig). Aral remains 1,500.
//
// Two annexes are referenced: Annex A (sample reimbursement computation) and
// Annex B (Reimbursement Undertaking, executed only on electing Option B).

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
    ? 'Licensure Review Fellowship — Speech-Language Pathology Graduate · UP Manila – College of Allied Medical Professions'
    : 'Allowance-Based Internship Fellowship — Speech-Language Pathology Intern · UP Manila – College of Allied Medical Professions'

export function loanAgreementBlocks(i: LoanInput): LoanBlock[] {
  const isTindig = i.track === 'TINDIG'
  const prof = i.program || 'Speech-Language Pathology'
  const uni = i.school || 'the University of the Philippines Manila – College of Allied Medical Professions'
  const who = i.fellowName || '________________________________________'
  const cm = i.comakerName || '________________________________________'
  const m = i.monthly && i.months ? i.monthly : null
  const n = i.monthly && i.months ? i.months : null
  const amt = m ? `PHP ${m.toLocaleString()}.00` : 'PHP _______________'
  const cov = n ? `${n}` : '_______________'

  // Service Hours — Aral 1,500; Tindig carried at 600 (deviation, see header note).
  const SHW = isTindig ? 'Six Hundred (600)' : 'One Thousand Five Hundred (1,500)'
  const SHn = isTindig ? '600' : '1,500'
  const SHdur = isTindig
    ? 'approximately six (6) to eight (8) months'
    : 'approximately fifteen (15) to eighteen (18) months'

  const intro: LoanBlock[] = [
    { text: 'KNOW ALL PERSONS BY THESE PRESENTS:' },
    { text: 'This UGAT Fellowship Agreement (the “Agreement”) is made and entered into this ____ day of ____________________ 20___, in ____________________________, Philippines, by and among:' },
    { text: 'SAPPHIRE CLINICS EAST INCORPORATED, a corporation duly organized and existing under Philippine law, operating Aura Health Rehab – Greenhills Branch, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City (“SCEI” or the “Clinic”);' },
    { text: isTindig
        ? `${who}, of legal age, Filipino, a graduate of the ${prof} program of ${uni}, preparing for the ${prof} Licensure Examination (the “FELLOW”); and`
        : `${who}, of legal age, Filipino, a ${prof} student intern of ${uni} (the “FELLOW”); and` },
    { text: `${cm}, of legal age, Filipino, parent / guardian of the FELLOW (the “CO-MAKER”). SCEI, the FELLOW, and the CO-MAKER are collectively the “Parties” and individually a “Party.”` },
    { text: 'WITNESSETH: THAT' },
    { text: isTindig
        ? 'WHEREAS, SCEI, through the Speech-Language Pathology Departments of Aura Health Rehab – Greenhills and East Branches, has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — for developing, recruiting, and retaining licensed therapists for its clinics, whose Tindig Track is a review-support fellowship offered, in coordination with the UP Manila CAMP Office of Student Relations (“OSR”), to qualified graduates of UP Manila CAMP who have completed the University’s clinical internship requirement, have not been awarded a fellowship under the Aral Track, and are preparing for the Licensure Examination;'
        : 'WHEREAS, SCEI, through the Speech-Language Pathology Departments of Aura Health Rehab – Greenhills and East Branches, has established the UGAT Fellowship Program — Ugnayan para sa Galing, Aral, at Tindig — for developing, recruiting, and retaining licensed therapists for its clinics, whose Aral Track is an allowance-based fellowship offered exclusively to qualified Speech-Language Pathology student interns of UP Manila CAMP, coursed through the UP Manila CAMP Office of Student Relations (“OSR”), undergoing their clinical internship for School Year 2026–2027;' },
    { text: isTindig
        ? 'WHEREAS, the FELLOW has applied for and been awarded a fellowship under the Tindig Track, by which SCEI shall extend review-support fellowship assistance of up to Thirty Thousand Pesos (PHP 30,000.00), availed as direct payment of licensure review fees or as a monthly review stipend, as provided herein;'
        : 'WHEREAS, the FELLOW has applied for and been awarded a fellowship under the Aral Track, by which SCEI shall extend educational fellowship assistance, released as a regular monthly financial allowance in the amount and for the Coverage Period determined by the Program Assessors, during the FELLOW’s clinical internship;' },
    { text: 'WHEREAS, the Program is designed so that the FELLOW need never reimburse the Fellowship Assistance in cash: upon Licensure, the FELLOW may choose to have the entire Fellowship Assistance condoned and written off in full by practicing his or her profession with SCEI under a fixed-term employment or consultancy engagement, with full market compensation for all services rendered; or, should the FELLOW prefer, may instead simply reimburse the amounts actually received in convenient equal monthly installments, without interest or any other charge;' },
    { text: 'WHEREAS, the Fellowship Assistance is an educational assistance and talent-development benefit extended by SCEI incidental to its business of operating therapy clinics, in contemplation of the FELLOW’s prospective professional engagement with SCEI; it is not a loan extended in the course of a lending business, SCEI does not engage in the business of lending, and no interest or profit of any kind is charged on the Fellowship Assistance;' },
    { text: 'NOW, THEREFORE, for and in consideration of the foregoing premises and the mutual covenants below, the Parties agree as follows:' },
  ]

  const sec1: LoanBlock[] = [
    { h: '1. DEFINITIONS' },
    { text: 'As used in this Agreement, the following terms shall have the meanings ascribed below:' },
    ...(isTindig ? [
      { lead: 'Grant Facility.', text: 'The review-support facility of up to Thirty Thousand Pesos (PHP 30,000.00) made available to the FELLOW under the Tindig Track, availed of in one of two ways: (a) direct payment by SCEI of licensure review fees, up to PHP 30,000.00; or (b) a monthly review stipend of Five Thousand Pesos (PHP 5,000.00) for six (6) months during the Review Period. Each availment forms part of the Fellowship Assistance.' },
      { lead: 'Fellowship Assistance; Assistance Amount.', text: 'The review-support fellowship assistance extended by SCEI to the FELLOW. The Assistance Amount is the cumulative amount actually disbursed under the Grant Facility, not exceeding Thirty Thousand Pesos (PHP 30,000.00).' },
    ] : [
      { lead: 'Allowance.', text: 'The monthly financial release of either Five Thousand Pesos (PHP 5,000.00) or Ten Thousand Pesos (PHP 10,000.00) — the tier awarded to the FELLOW as determined by the Program Assessors — paid for the Coverage Period awarded, each release forming part of the Fellowship Assistance, subject to the FELLOW’s right to utilize any unused balance under Section 2.6.' },
      { lead: 'Fellowship Assistance; Assistance Amount.', text: 'The educational fellowship assistance extended by SCEI to the FELLOW. The Assistance Amount is the cumulative Allowance actually released, ranging from Twenty-Five Thousand Pesos (PHP 25,000.00) to One Hundred Thousand Pesos (PHP 100,000.00), depending on the stipend tier and Coverage Period awarded.' },
    ]),
    { lead: 'Reimbursement Obligation.', text: 'The FELLOW’s contingent obligation to reimburse the Assistance Amount, to the extent not condoned through service (Sections 4 to 6). It never includes interest or any charge of any kind, except only the legal interest and liquidated damages that may arise after an uncured default under Section 7.3.' },
    ...(isTindig
      ? [{ lead: 'Review Period.', text: 'The period during which the FELLOW undertakes review for the Licensure Examination, commencing on or about ________________ 20____ and ending upon the FELLOW’s completion of the Licensure Examination.' }]
      : [{ lead: 'Internship Period.', text: 'The FELLOW’s clinical internship in Speech-Language Pathology for School Year 2026–2027, commencing on or about ________________ 2026 and ending on or about ________________ 2027.' },
         { lead: 'Coverage Period.', text: 'The number of months for which the Allowance is awarded: ten (10) months for a full-year award, or five (5) months for a semestral award (available only to applicants applying for the second semester of the internship year).' }]),
    { lead: 'Service Condonation Option (Option A).', text: 'The FELLOW’s option to discharge the Reimbursement Obligation in full — with the entire Assistance Amount condoned and waived — by rendering the Service Hours under an Engagement Contract (Section 5).' },
    { lead: 'Reimbursement Option (Option B).', text: isTindig
        ? 'The FELLOW’s option to reimburse the Assistance Amount in three (3) equal monthly installments, without interest or any other charge (Section 6).'
        : 'The FELLOW’s option to reimburse the Assistance Amount in equal consecutive monthly installments over the applicable Reimbursement Period, without interest or any other charge (Section 6).' },
    { lead: 'Engagement Contract.', text: 'A fixed-term employment contract, or a consultancy / professional services contract, between SCEI and the FELLOW as a licensed Speech-Language Pathologist, executed pursuant to Section 5.1.' },
    { lead: 'Service Hours.', text: `${SHW} hours of direct patient treatment sessions rendered by the FELLOW as a licensed Speech-Language Pathologist at any SCEI clinic, ordinarily completed within ${SHdur} at typical clinical loads (Section 5.2). The Service Hours consist exclusively of patient treatment hours — direct therapy or intervention with a patient, together with the assessment, documentation, and case-management time reasonably attendant to that session; administrative, training, or other non-clinical work does not count unless expressly approved in writing by the Clinic under Section 5.2.` },
    { lead: 'Condonation.', text: 'The full waiver, write-off, and extinguishment of the Reimbursement Obligation — including the entire Assistance Amount — upon the FELLOW’s completion of the Service Hours (Section 5.8).' },
    { lead: 'Reimbursement Commencement Date.', text: 'The date falling sixty (60) days after the FELLOW’s completion of the Licensure Examination (Section 6.1).' },
    { lead: 'Reimbursement Period.', text: isTindig
        ? 'Three (3) months, regardless of the Assistance Amount (Section 6.1).'
        : 'Three (3) months where the Assistance Amount is Fifty Thousand Pesos (PHP 50,000.00) or less, and six (6) months where it exceeds PHP 50,000.00 (Section 6.1).' },
    { lead: 'Licensure.', text: 'The FELLOW’s passing of the Speech-Language Pathology Licensure Examination and receipt of the corresponding Certificate of Registration and Professional Identification Card from the Professional Regulation Commission (PRC).' },
    { lead: 'OSR.', text: 'The Office of Student Relations of UP Manila – College of Allied Medical Professions, in coordination with which the UGAT Program and this Agreement are offered and coordinated.' },
    { lead: 'Program Assessors.', text: 'The panel or officers designated by SCEI to evaluate applications to the UGAT Program and to determine the award. Their determination shall be final.' },
  ]

  const sec2: LoanBlock[] = isTindig ? [
    { h: '2. THE FELLOWSHIP ASSISTANCE AND REVIEW SUPPORT' },
    { lead: '2.1 Grant of Fellowship Assistance.', text: 'SCEI extends to the FELLOW review-support fellowship assistance under the Tindig Track, in the maximum amount of Thirty Thousand Pesos (PHP 30,000.00). The FELLOW elects in writing, subject to SCEI’s approval, one of two ways of availing of the Grant Facility: (a) direct payment by SCEI of review fees (review-program enrollment + related materials) up to PHP 30,000.00; or (b) a monthly review stipend of PHP 5,000.00 for six (6) months during the Review Period. Under (a), SCEI pays only fees actually incurred: any shortfall below PHP 30,000.00 is not paid out or refunded, and any excess is for the FELLOW’s sole account. This fellowship is offered exclusively to qualified graduates of UP Manila CAMP who have completed the University’s clinical internship requirement and were not Aral awardees, in coordination with the OSR and upon evaluation by the Program Assessors. For emphasis: the amounts disbursed are educational assistance subject only to a contingent Reimbursement Obligation; they are fully condonable — in their entirety — through the Service Condonation Option (Section 5), and no interest or charge of any kind is imposed in any case.' },
    { lead: '2.2 Disbursement.', text: 'Stipend availments are remitted to the FELLOW’s nominated bank account on or before the tenth (10th) day of each month during the Review Period. Review-fee availments are paid by SCEI directly to the review provider upon presentation of enrollment documents or billing, or reimbursed against official receipts.' },
    { lead: '2.3 Acknowledgment; Statement of Account.', text: 'The FELLOW and CO-MAKER acknowledge that each disbursement forms part of the Fellowship Assistance. SCEI furnishes a Statement of Account upon conclusion of the Review Period, deemed accepted unless contested in writing within fifteen (15) days. No interest, fee, or charge of any kind accrues at any time, and none ever arises where the FELLOW discharges the Reimbursement Obligation through the Service Condonation Option.' },
    { lead: '2.4 Discontinuance of Review.', text: 'Should the FELLOW abandon or discontinue the review, or fail to sit for the Licensure Examination as required, disbursements cease as of that date. Since the FELLOW will not yet proceed to Licensure, the Assistance Amount actually received is reimbursed in up to three (3) equal monthly installments, without interest or any other charge, commencing ninety (90) days from discontinuance. Full payment finally settles the Parties’ obligations. SCEI may, with compassion, waive, reduce, or restructure the reimbursement — particularly for serious illness, a death in the immediate family, or circumstances beyond the FELLOW’s control — and may, upon eventual Licensure, allow the balance to be discharged through the Service Condonation Option on proportionate terms.' },
    { lead: '2.5 One-Time Award.', text: 'The Grant Facility is a one-time facility fixed at a maximum of PHP 30,000.00 and shall not be increased, renewed, or extended under any circumstance, including any extension of the review period or retaking of the Licensure Examination. Any review beyond the Grant Facility is at the FELLOW’s own cost. Both modes of discharge under Section 4 remain fully available upon eventual Licensure.' },
  ] : [
    { h: '2. THE FELLOWSHIP ASSISTANCE' },
    { lead: '2.1 Grant of Fellowship Assistance.', text: `SCEI extends to the FELLOW educational fellowship assistance under the Aral Track, released as a monthly Allowance of either Five Thousand Pesos (PHP 5,000.00) or Ten Thousand Pesos (PHP 10,000.00), payable for the Coverage Period awarded — full-year (ten (10) months) or semestral (five (5) months, available only to second-semester applicants). The stipend tier and Coverage Period are determined by the Program Assessors and final. The monthly Allowance awarded to the FELLOW is ${amt} per month, for a Coverage Period of ${cov} months. This fellowship is offered exclusively to qualified Speech-Language Pathology interns of UP Manila CAMP and is coursed through the OSR. For emphasis: the amounts released are educational assistance subject only to a contingent Reimbursement Obligation; they are fully condonable — in their entirety — through the Service Condonation Option (Section 5), and no interest or charge of any kind is imposed in any case.` },
    { lead: '2.2 Disbursement.', text: 'The Allowance is remitted to the FELLOW’s nominated bank account on or before the tenth (10th) day of each month during the Internship Period.' },
    { lead: '2.3 Acknowledgment; Statement of Account.', text: 'The FELLOW and CO-MAKER acknowledge that each release of the Allowance forms part of the Fellowship Assistance. SCEI furnishes a Statement of Account upon conclusion of the Internship Period, deemed accepted unless contested in writing within fifteen (15) days. No interest, fee, or charge of any kind accrues at any time, and none ever arises where the FELLOW discharges the Reimbursement Obligation through the Service Condonation Option.' },
    { lead: '2.4 Cut-Short of Internship and Fellowship.', text: 'Should the FELLOW be unable to continue or complete the internship for any reason (withdrawal, dropping, leave of absence, transfer, or dismissal), releases of the Allowance cease as of that date. Since the FELLOW will not yet proceed to Licensure, the Assistance Amount actually received is reimbursed in equal monthly installments over the applicable Reimbursement Period (Section 6.1), without interest or any other charge, commencing ninety (90) days from discontinuance. Full payment finally settles the Parties’ obligations. SCEI may, with compassion, waive, reduce, or restructure the reimbursement — particularly for serious illness, a death in the immediate family, or circumstances beyond the FELLOW’s control — and may, upon eventual Licensure, allow the balance to be discharged through the Service Condonation Option on proportionate terms.' },
    { lead: '2.5 Extension of Internship or Delayed Graduation.', text: 'The Allowance is fixed at the Coverage Period awarded and shall not be extended under any circumstance, including any internship extension, repetition of requirements, or delayed graduation. The FELLOW continues at his/her own cost beyond the final month of the Coverage Period, and no additional Allowance is due. Both modes of discharge under Section 4 remain fully available upon eventual Licensure.' },
    { lead: '2.6 Application of Unused Allowance to Review Fees.', text: 'Should the University’s internship run for fewer months than the Coverage Period awarded (e.g. eight or nine months against a full-year ten (10)-month Coverage Period) and the FELLOW completes the full internship requirement, the FELLOW may utilize the unused balance of the Allowance to cover Licensure review fees (review-program enrollment + materials), released upon proof of internship completion plus proof of enrollment in (or receipts for) a review program, and in no case exceeding the undisbursed balance at the tier awarded. Any amount so released forms part of the Assistance Amount and does not affect the Service Hours, which remain fixed.' },
  ]

  const sec3: LoanBlock[] = isTindig ? [
    { h: '3. OBLIGATIONS DURING THE REVIEW PERIOD' },
    { text: 'During the Review Period, the FELLOW covenants and agrees to:' },
    { li: 'Enroll in and diligently attend a licensure review program, or otherwise pursue a structured self-review plan disclosed to SCEI;' },
    { li: 'Exert faithful and diligent effort in preparing for the Licensure Examination;' },
    { li: 'Provide SCEI proof of enrollment (or of the review plan) and such reasonable progress updates as SCEI may request;' },
    { li: 'Signify and maintain willingness to be assigned to either or both SCEI clinics for any engagement under the Service Condonation Option (Section 5.6);' },
    { li: 'Disclose any change in review or examination plans to SCEI in writing within seven (7) days;' },
    { li: 'Sit for and complete the Licensure Examination at the next available date after eligibility, exerting best efforts to pass; and' },
    { li: 'Actively participate in “Araw ng Kalinga,” SCEI’s one-day annual community outreach with an LGU or NGO, whenever held during the Review Period or any engagement under Section 5.' },
  ] : [
    { h: '3. OBLIGATIONS DURING THE INTERNSHIP PERIOD' },
    { text: 'During the Internship Period, the FELLOW covenants and agrees to:' },
    { li: 'Maintain good standing as an enrolled Speech-Language Pathology student intern for the entire Internship Period;' },
    { li: 'Faithfully and diligently perform all duties, rotations, and clinical responsibilities assigned by the Clinic’s supervising therapists;' },
    { li: 'Comply with the SCEI Code of Conduct, clinic policies, and the academic and clinical requirements of the FELLOW’s school;' },
    { li: 'Maintain a grade of 3.0 or better (or its equivalent under the UP grading system) throughout the internship year;' },
    { li: 'Signify and maintain willingness to be assigned to either or both SCEI clinics for any engagement under the Service Condonation Option (Section 5.6);' },
    { li: 'Disclose any change in academic or enrollment status to SCEI in writing within seven (7) days;' },
    { li: 'Sit for and complete the Licensure Examination at the next available date after eligibility, exerting best efforts to pass; and' },
    { li: 'Actively participate in “Araw ng Kalinga,” SCEI’s one-day annual community outreach with an LGU or NGO, whenever held during the Internship Period or any engagement under Section 5.' },
  ]

  const sec4: LoanBlock[] = [
    { h: '4. DISCHARGE OF THE REIMBURSEMENT OBLIGATION; ELECTION' },
    { lead: '4.1 Two Modes of Discharge.', text: `Upon Licensure, the FELLOW discharges the Reimbursement Obligation through one — or a combination (Sections 4.3 and 5.9) — of: (a) the Service Condonation Option (Option A), under which the FELLOW practices with SCEI under an Engagement Contract, with full market compensation, and the entire Fellowship Assistance is condoned and written off in full upon completion of the Service Hours (Section 5); or (b) the Reimbursement Option (Option B), under which the FELLOW reimburses the Assistance Amount ${isTindig ? 'in three (3) equal monthly installments' : 'in equal monthly installments over the applicable Reimbursement Period — three (3) months where the Assistance Amount is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00'}, without interest or any other charge (Section 6). A FELLOW who chooses to begin his or her career with SCEI pays nothing at all; a FELLOW who elects reimbursement never pays back more than what was actually received.` },
    { lead: '4.2 Election.', text: 'The FELLOW notifies SCEI in writing of the option elected within thirty (30) days from the official release of the Licensure Examination results. Absent a timely election, SCEI issues a written reminder giving fifteen (15) days; failing which, the FELLOW is deemed to have elected the Reimbursement Option, without prejudice to Section 4.3.' },
    { lead: '4.3 Switching Between Options.', text: 'The FELLOW may, at any time before full reimbursement and with SCEI’s written approval, switch to the Service Condonation Option, in which case the then-outstanding balance is condoned upon rendering the proportionate Service Hours. Conversely, a FELLOW who has commenced service may switch to the Reimbursement Option at any time, in which case Section 5.9 applies. Every hour of service rendered in good faith is always honored and credited.' },
    { lead: '4.4 Retake; Failure to Obtain Licensure.', text: `Should the FELLOW fail the Licensure Examination on the first attempt, the FELLOW may retake it at the next available schedule. No additional Allowance, review support, or other amount is released for the retake, which is for the FELLOW’s own account. On passing the retake, the FELLOW may elect Option A or Option B (Section 4.2), the election period counted from the retake results. Should the FELLOW fail on the second attempt, or fail to take the exam within two (2) examination cycles after eligibility, the Reimbursement Option applies and the Assistance Amount is reimbursed, without interest or any other charge (Section 6), with installments commencing sixty (60) days after the second-cycle results (or the last day of that cycle, if not taken), subject to restructuring under Section 6.5.` },
  ]

  const sec5: LoanBlock[] = [
    { h: '5. OPTION A — SERVICE CONDONATION (FULL WAIVER OF THE ASSISTANCE AMOUNT)' },
    { lead: '5.1 Engagement.', text: 'Where the FELLOW elects the Service Condonation Option, SCEI and the FELLOW execute an Engagement Contract within sixty (60) days from the FELLOW’s receipt of the PRC Certificate of Registration / Professional Identification Card, engaging the FELLOW as a licensed Speech-Language Pathologist under either (a) a fixed-term employment contract or (b) a consultancy / professional services contract, as mutually agreed. Under a consultancy, the FELLOW renders services at SCEI clinics for a minimum of four (4) clinic days per week until the Service Hours are completed. Failing, without SCEI-approved extension, to execute the contract or commence within the sixty (60)-day period, the FELLOW is deemed to have elected the Reimbursement Option.' },
    { lead: '5.2 Service Hours.', text: `The Service Hours consist of ${SHW} hours of direct patient treatment sessions at any SCEI clinic. A “treatment session” means time spent by the FELLOW in direct, billable therapy or intervention with a patient, including the assessment, documentation, and case-management time reasonably attendant to it. Administrative, training, or non-clinical duties are not credited unless expressly approved in writing by the Clinic. At typical clinical loads — including at least four (4) clinic days per week — the Service Hours are ordinarily completed within ${SHdur}. The Service Hours are fixed at ${SHW} hours for all fellows regardless of the amount of Fellowship Assistance, and their completion condones the entire Fellowship Assistance whatever its amount.` },
    { lead: '5.3 Full Compensation.', text: 'Throughout the engagement, the FELLOW receives standard market compensation based on the Clinic’s compensation structure for a licensed Speech-Language Pathologist (or the corresponding professional fees, for a consultancy). Condonation is earned in addition to — and is never deducted from — compensation: no salary or fee deduction of any kind is made on account of the Fellowship Assistance, and the FELLOW is paid in full for every hour worked while simultaneously earning credit toward Condonation.' },
    { lead: '5.4 Fringe Benefits.', text: 'In addition to compensation under Section 5.3, the FELLOW may be entitled to such fringe benefits, allowances, incentives, and professional-development support as SCEI makes available from time to time to similarly situated professionals, as set out in the Engagement Contract or applicable policy; provided that any benefit already earned is not diminished retroactively.' },
    { lead: '5.5 Crediting of Hours.', text: 'Each hour of direct patient treatment sessions actually rendered at any SCEI clinic under the Engagement Contract is credited toward the Service Hours, recorded and monitored in real time through SCEI’s ERP system, which serves as the official record. The FELLOW may request a statement of remaining hours at any reasonable time; any discrepancy must be raised in writing within fifteen (15) days, otherwise the ERP record is conclusive.' },
    { lead: '5.6 Place of Engagement.', text: 'The FELLOW agrees to be willing to work at and accept assignment to either or both SCEI clinics, based on operational need: (a) Aura Health Rehab – East Branch, Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig; and (b) Aura Health Rehab – Greenhills Branch, Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City; or any future SCEI location. Reasonable preference is considered but not guaranteed.' },
    { lead: '5.7 Commitment During the Engagement.', text: 'While rendering the Service Hours, the FELLOW devotes his or her professional practice as a Speech-Language Pathologist to SCEI and its clinics, and shall not render professional services as a Speech-Language Pathologist to any other clinic, hospital, therapy center, school-based program, or similar facility without SCEI’s prior written consent (limited exceptions, such as teaching, may be permitted in writing where they do not interfere with SCEI duties). Under a consultancy, the FELLOW maintains the minimum four (4) clinic days per week. Any breach is addressed solely under Section 5.9 — by proportionate condonation and reimbursement of the balance — never by penalty or compulsion of service.' },
    { lead: '5.8 Full Condonation upon Completion.', text: `Upon completion of the full ${SHW} Service Hours, the entire Fellowship Assistance — the full Assistance Amount — is automatically, fully, and irrevocably condoned, waived, and written off, and the Reimbursement Obligation is fully discharged and extinguished. SCEI issues a Certificate of Full Condonation and Release within thirty (30) days, and the obligations of the FELLOW and CO-MAKER are thereupon extinguished. A FELLOW who discharges under this Option pays nothing at any time.` },
    { lead: '5.9 Partial Service; Proportionate Condonation.', text: `Every hour of service rendered in good faith is honored. Should the FELLOW discontinue the engagement before completing the Service Hours (or switch to the Reimbursement Option under Section 4.3), the Assistance Amount is condoned proportionately, in the ratio that the Service Hours actually rendered bear to ${SHW}, and only the unrendered proportion is reimbursable. The reimbursable balance is paid in ${isTindig ? 'up to three (3)' : 'equal'} monthly installments${isTindig ? '' : ' over the Reimbursement Period applicable to that balance (Section 6.1)'}, without interest or any other charge, commencing sixty (60) days from discontinuance. No penalty, surcharge, or retroactive charge is imposed on the condoned portion.` },
    { lead: '5.10 Continued Engagement After Condonation.', text: 'Nothing prevents the FELLOW from continuing to work with the Clinic after Condonation. Following the Certificate of Full Condonation and Release, the FELLOW may, by mutual agreement, continue with SCEI under a separate arrangement, on terms the Parties then agree — voluntary on both sides, governed by that separate arrangement and not by this Agreement, and reviving no obligation under this Agreement.' },
  ]

  const sec6: LoanBlock[] = [
    { h: '6. OPTION B — REIMBURSEMENT IN INSTALLMENTS (NO INTEREST, NO CHARGES)' },
    { lead: '6.1 Terms of Reimbursement.', text: isTindig
        ? 'Where the Reimbursement Option applies, the FELLOW reimburses the Assistance Amount in three (3) equal consecutive monthly installments, regardless of amount, without interest or any other charge. The first installment falls due on the Reimbursement Commencement Date — sixty (60) days after completion of the Licensure Examination. SCEI provides a reimbursement schedule beforehand. By way of illustration: an Assistance Amount of PHP 30,000.00 over three (3) months entails a monthly installment of exactly PHP 10,000.00, for a total of exactly PHP 30,000.00. Sample computations are attached as Annex “A.” The total of all installments always equals — and never exceeds — the Assistance Amount actually received.'
        : 'Where the Reimbursement Option applies, the FELLOW reimburses the Assistance Amount in equal consecutive monthly installments over the Reimbursement Period: three (3) installments where the Assistance Amount is PHP 50,000.00 or less, and six (6) where it exceeds PHP 50,000.00 — in either case without interest or any other charge. The first installment falls due on the Reimbursement Commencement Date — sixty (60) days after completion of the Licensure Examination. SCEI provides a reimbursement schedule beforehand. By way of illustration: PHP 100,000.00 over six (6) months is about PHP 16,666.67/month (total PHP 100,000.00); PHP 50,000.00 over three (3) months is about PHP 16,666.67/month; PHP 25,000.00 over three (3) months is about PHP 8,333.33/month. Sample computations are attached as Annex “A.” The total always equals — and never exceeds — the Assistance Amount actually received.' },
    { lead: '6.2 Post-Dated Checks.', text: 'Upon election (or deemed election), and not later than five (5) days before the Reimbursement Commencement Date (or before installments commence under Sections 2.4 or 5.9), the FELLOW delivers post-dated checks equal in number to the monthly installments, drawn on the checking account of the FELLOW or CO-MAKER, presented by SCEI only on their due dates. Any dishonor is treated as a failure to pay when due (Section 7.1). SCEI returns all remaining undeposited checks upon full reimbursement or prepayment, an approved switch to Option A, or restructuring (against replacement checks). Where neither maintains a checking account, SCEI may allow an alternative arrangement (such as auto-debit).' },
    { lead: '6.3 No Interest; No Other Charges.', text: 'No interest, application fee, service fee, processing fee, surcharge, or charge of any kind is collected in connection with the Fellowship Assistance or its reimbursement. The FELLOW never pays more than the Assistance Amount actually received, except only as provided in Section 7.3 following an uncured default.' },
    { lead: '6.4 Prepayment.', text: 'The FELLOW may prepay the reimbursable balance, in whole or in part, at any time and without penalty or charge of any kind.' },
    { lead: '6.5 Restructuring.', text: 'Upon the FELLOW’s reasonable request, and particularly in cases of financial hardship, serious illness, a death in the immediate family, or other circumstances beyond the FELLOW’s control, SCEI may, in its discretion, extend, restructure, or re-schedule the reimbursement, or waive or reduce the amounts due, fairly and with compassion.' },
    { lead: '6.6 Reimbursement Undertaking.', text: 'Upon election (or deemed election), and simultaneously with delivery of the post-dated checks, the FELLOW, together with the CO-MAKER as solidary co-obligor, executes and delivers to SCEI a Reimbursement Undertaking substantially in the form of Annex “B,” covering the outstanding balance and conforming to the schedule. Its execution is a covenant of this Agreement; failure or refusal to execute it does not extinguish or diminish the obligations under this Agreement.' },
  ]

  const sec7: LoanBlock[] = [
    { h: '7. DEFAULT' },
    { lead: '7.1 Events of Default.', text: '(a) Failure to pay two (2) or more consecutive monthly installments when due under the Reimbursement Option (including under Sections 2.4 and 5.9), absent an SCEI-approved restructuring; (b) failure to make an election under Section 4.2 and thereafter to pay in accordance with the deemed election, despite the written notices; and (c) material misrepresentation in the FELLOW’s application or any compliance report.' },
    { lead: '7.2 Notice and Cure.', text: 'Prior to any declaration of default, SCEI furnishes written notice to the FELLOW and CO-MAKER of the alleged default. The FELLOW has thirty (30) days from receipt to cure. Failure to cure results in formal acceleration.' },
    { lead: '7.3 Consequences of Default.', text: 'Upon an uncured Event of Default, the outstanding reimbursable balance becomes immediately due and payable, bears legal interest at the rate prescribed by law and prevailing jurisprudence (currently six percent [6%] per annum) from demand until fully paid, and is subject to one-time liquidated damages of five percent (5%) of the accelerated balance. For the avoidance of doubt, professional service can never be demanded or compelled: SCEI’s remedies are purely monetary and limited to the outstanding balance, such legal interest, the liquidated damages, and reasonable costs of collection.' },
  ]

  const sec8to10: LoanBlock[] = [
    { h: '8. CO-MAKER OBLIGATIONS' },
    { text: 'THE CO-MAKER EXPRESSLY ACKNOWLEDGES AND AGREES that he/she is JOINTLY AND SEVERALLY LIABLE with the FELLOW for all monetary obligations under this Agreement, including installments, accelerated balances, legal interest and liquidated damages (Section 7.3), and costs of collection. The CO-MAKER waives demand, presentment, notice of dishonor, and the order of enforcement, and SCEI may proceed against the CO-MAKER directly. The CO-MAKER’s liability is extinguished to the same extent as the FELLOW’s, including by Condonation under Sections 5.8 and 5.9.' },
    { h: '9. CONFIDENTIALITY AND DATA PRIVACY' },
    { text: 'This Agreement and related records are confidential and protected consistent with R.A. 10173 (Data Privacy Act of 2012). The FELLOW and CO-MAKER consent to SCEI’s collection, processing, and use of their personal data to administer this Agreement, including disclosure to SCEI’s accountants, auditors, and legal counsel as needed.' },
    { h: '10. GENERAL PROVISIONS' },
    { lead: '10.1 Voluntary Undertaking; No Compulsion of Service.', text: 'The Service Condonation Option is a privilege and option in favor of the FELLOW and not an obligation. Nothing obliges the FELLOW to render service, and SCEI shall never demand or compel it. The FELLOW’s sole enforceable obligation is the monetary Reimbursement Obligation, to the extent the Fellowship Assistance is not condoned through service actually rendered.' },
    { lead: '10.2 Nature of the Fellowship.', text: 'The Fellowship Assistance is an educational assistance and talent-development benefit extended by SCEI incidental to its business of operating therapy clinics, in contemplation of the FELLOW’s prospective professional engagement with SCEI; SCEI is not engaged in the business of lending and extends no assistance for profit; and nothing in this Agreement shall be construed as the grant of a loan in the course of a lending business.' },
    { lead: '10.3 Governing Law.', text: 'This Agreement is governed by and construed in accordance with the laws of the Republic of the Philippines.' },
    { lead: '10.4 Venue.', text: 'Any action arising out of or in connection with this Agreement shall be brought exclusively before the proper courts of San Juan City, Philippines, to the exclusion of all other venues.' },
    { lead: '10.5 Entire Agreement.', text: 'This Agreement constitutes the entire agreement between the Parties and supersedes all prior or contemporaneous understandings, oral or written, including any prior form of fellowship agreement covering the same fellowship.' },
    { lead: '10.6 Amendments.', text: 'Any amendment shall be in writing and signed by all Parties. No oral modification is enforceable.' },
    { lead: '10.7 Severability.', text: 'If any provision is held invalid or unenforceable, the remaining provisions remain in full force and effect.' },
    { lead: '10.8 Binding Effect.', text: 'This Agreement takes effect upon execution by all Parties and binds them and their respective heirs, executors, administrators, successors, and permitted assigns.' },
    { text: 'IN WITNESS WHEREOF, the Parties have signed this Agreement on the date and at the place first above written, before witnesses (a representative of the UP Manila CAMP Office of Student Relations and a member of the SCEI Board of Directors) and a Notary Public. A Reimbursement Undertaking (Annex “B”) is executed only upon election of the Reimbursement Option.' },
  ]

  return [
    ...intro,
    ...sec1,
    ...sec2,
    ...sec3,
    ...sec4,
    ...sec5,
    ...sec6,
    ...sec7,
    ...sec8to10,
  ]
}

// ── Annex A — sample reimbursement computation (no interest) ──────────────────
export function annexIntro(isTindig: boolean): string {
  return isTindig
    ? 'The computation below is for illustration only. It assumes the maximum Assistance Amount under the Tindig Track of PHP 30,000.00, reimbursed in three (3) equal consecutive monthly installments, without interest or any charge of any kind, per Section 6.1. The FELLOW’s actual schedule is based on the Assistance Amount actually disbursed, as shown in the Statement of Account. The total reimbursed always equals — and never exceeds — the amount actually received. A FELLOW who discharges the Reimbursement Obligation through the Service Condonation Option (Option A) pays nothing at all, and this Annex does not apply.'
    : 'The computations below are for illustration only. They assume reimbursement of the Assistance Amount in equal consecutive monthly installments over the applicable Reimbursement Period — three (3) months where the Assistance Amount is PHP 50,000.00 or less, and six (6) months where it exceeds PHP 50,000.00 — without interest or any charge of any kind, per Section 6.1. The FELLOW’s actual schedule is based on the Assistance Amount actually disbursed, as shown in the Statement of Account. The total reimbursed always equals — and never exceeds — the amount actually received. A FELLOW who discharges the Reimbursement Obligation through the Service Condonation Option (Option A) pays nothing at all, and this Annex does not apply.'
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
      headers: ['Assistance Amount', 'Reimbursement period', 'Monthly installment', 'Total reimbursed'],
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
    {
      caption: 'Full reimbursement schedule — illustrative Assistance Amount of PHP 50,000.00, reimbursed over three (3) months',
      headers: ['Month', 'Outstanding balance', 'Monthly installment', 'Balance after payment'],
      rows: [
        ['1', '50,000.00', '16,666.67', '33,333.33'],
        ['2', '33,333.33', '16,666.67', '16,666.66'],
        ['3', '16,666.66', '16,666.66', '0.00'],
        ['Total', '—', '50,000.00', '0.00'],
      ],
    },
  ]
}
