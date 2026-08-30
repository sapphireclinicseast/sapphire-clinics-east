// Nickel Provider Terms of Service — Annexes A–D, rendered from structured data.
// Internal drafting apparatus (the "draft for legal review" banner, every
// DRAFTING NOTE, the internal Jara revenue-share note, and the "OPEN ITEMS FOR
// SCEI" appendix) is intentionally NOT reproduced — only the operative annexes.
//
// Any remaining [●] marks an operational figure SCEI has not yet set
// (transportation tiers, tolls cap, SMS fallback number, hosting location).

import type { ReactNode } from 'react'

const OFFICE = 'Units L4205, L4203, L4201, L4199, L4168, L4166 and L4164, 4th Floor, Robinsons Metro East, Marcos Highway, Barangay Dela Paz, 1600 City of Pasig, NCR Second District, Philippines'

type Block =
  | { k: 'p'; t: string }
  | { k: 'h'; t: string }
  | { k: 'table'; head: string[]; rows: string[][] }

interface Annex { id: string; title: string; blocks: Block[] }

const ANNEX_A: Annex = {
  id: 'A', title: 'Annex A — Fee Schedule, Cancellation, No-Show and Refund Policy',
  blocks: [
    { k: 'p', t: 'This Annex sets out what SCEI deducts, when you are paid, and what happens when a Homecare Session is cancelled, missed or cut short. It is written to be read by Providers, and every figure in it is disclosed to you before you accept a Booking.' },
    { k: 'h', t: 'A1.  The Platform Fee' },
    { k: 'p', t: 'A1.1  A flat PHP 20.00 per session. SCEI retains a flat Platform Fee of twenty pesos (PHP 20.00) for each completed Homecare Session, whatever your Provider Rate. There is no percentage commission, no joining fee, no monthly fee, no listing fee and no charge for declining a Booking.' },
    { k: 'p', t: 'A1.2  Payment processing charges (borne by you). Client payments are collected online through SCEI’s payment channel partner, PayMongo, on SCEI’s Verdana account. PayMongo charges a transaction fee (a Merchant Discount Rate, or MDR) on each payment, which varies with the payment method the Client chooses. This processing charge is deducted from the Session Fee before your payout. The prevailing rates are:' },
    { k: 'table', head: ['Payment method', 'PayMongo fee'], rows: [
      ['Credit / Debit card (local)', '3.125% + PHP 13.39'],
      ['International card', '4.02% + PHP 13.39'],
      ['GCash', '2.23%'],
      ['Maya', '1.79%'],
      ['GrabPay', '1.96%'],
      ['ShopeePay / SPayLater / MariBank', '1.70%'],
      ['QR Ph', '1.34%'],
      ['Online banking (BDO, BPI, UnionBank, Landbank, Metrobank)', '0.71% or PHP 13.39, whichever is higher'],
      ['Buy Now, Pay Later (BillEase)', '1.34%'],
    ] },
    { k: 'p', t: 'These are PayMongo’s published rates and may change if PayMongo revises its pricing. The exact fee applied is whatever PayMongo charges on the actual payment. Where a Client pays wholly or partly with Nickel wallet credit, no processing fee applies to the portion paid from credit.' },
    { k: 'p', t: 'A1.3  Transportation. Where transportation is charged to the Client separately under Annex D, that amount is passed through to you in full and no Platform Fee is charged on it (a payment processing charge may still apply to it, as it forms part of the amount collected).' },
    { k: 'p', t: 'A1.4  What SCEI provides for the Platform Fee. Client acquisition and matching, booking and scheduling, online payment collection, remittance and payout administration, credential verification, the safety and check-in system, clinical documentation tools, client support, and the redress mechanism under Section 11 of the Terms.' },
    { k: 'h', t: 'A2.  How your payout is computed' },
    { k: 'p', t: 'A2.1  For each completed Homecare Session, SCEI computes your payout as: the Session Fee collected from the Client, less the flat PHP 20.00 Platform Fee, less the PayMongo payment processing charge for the method the Client used, plus any transportation pass-through. SCEI does not withhold income tax from your earnings (see Clause 10.5 of the Terms).' },
    { k: 'p', t: 'A2.2  Worked example 1 — rate of PHP 1,500.00, Client pays by GCash' },
    { k: 'table', head: ['Item', 'Amount (PHP)', 'Note'], rows: [
      ['Provider Rate', '1,500.00', 'set by you'],
      ['Session Fee collected from Client', '1,500.00', ''],
      ['Less: Platform Fee (flat)', '(20.00)', 'PHP 20.00 per session'],
      ['Less: PayMongo fee (GCash 2.23%)', '(33.45)', '2.23% of 1,500.00'],
      ['Net remitted to you', '1,446.55', ''],
    ] },
    { k: 'p', t: 'A2.3  Worked example 2 — rate of PHP 1,500.00, Client pays by local card' },
    { k: 'table', head: ['Item', 'Amount (PHP)', 'Note'], rows: [
      ['Provider Rate', '1,500.00', 'set by you'],
      ['Session Fee collected from Client', '1,500.00', ''],
      ['Less: Platform Fee (flat)', '(20.00)', 'PHP 20.00 per session'],
      ['Less: PayMongo fee (card 3.125% + PHP 13.39)', '(60.27)', '46.88 + 13.39'],
      ['Net remitted to you', '1,419.73', ''],
    ] },
    { k: 'p', t: 'A2.4  Your net varies with the payment method. Because the PayMongo fee differs by method, your exact net differs slightly depending on how each Client pays. The in-app calculator on your rate-setting screen shows your net for every payment method before you set your rate.' },
    { k: 'h', t: 'A3.  Payout schedule' },
    { k: 'p', t: 'A3.1  Weekly. Payouts are made weekly. The cut-off is Sunday at 11:59 pm, and SCEI remits the net earnings for all Homecare Sessions completed and documented in that week on the following [Wednesday].' },
    { k: 'p', t: 'A3.2  A session is payable once it is documented. A Homecare Session enters the payout run only after you have recorded check-in and check-out and completed the session note under Clause 5.9 of the Terms. A session completed but not documented by the cut-off rolls into the next week’s run.' },
    { k: 'p', t: 'A3.3  Where the money goes. To the bank account or GCash number recorded in your account. You may nominate one of each and choose which receives the payout. Changes to payout details take effect after verification and never apply retrospectively to a run already in progress.' },
    { k: 'p', t: 'A3.4  Small balances. There is no minimum payout threshold. A net balance below PHP 100.00 rolls to the next weekly run, and any balance is released in full on deactivation of your account.' },
    { k: 'p', t: 'A3.5  Payout statement. Each run is accompanied by a statement listing every session, the Session Fee, the flat Platform Fee, the PayMongo processing charge, any transportation pass-through, and any set-off applied under Clause 10.6 of the Terms.' },
    { k: 'p', t: 'A3.6  Queries. Raise a payout query within thirty (30) days of the payout date, through the Platform. SCEI responds within [five (5)] business days.' },
    { k: 'h', t: 'A4.  Cancellation by the Client' },
    { k: 'p', t: 'The table below applies to the Provider Rate. Transportation is treated under Clause A4.2.' },
    { k: 'table', head: ['When the Client cancels', 'Refunded to the Client', 'Paid to you (before fees)'], rows: [
      ['24 hours or more before the start time', '100% of the Session Fee', 'Nothing'],
      ['12 hours to less than 24 hours before', '50% of the Provider Rate, plus transportation in full', '50% of the Provider Rate'],
      ['Less than 12 hours before', 'Nothing', '100% of the Provider Rate'],
      ['Client not present or does not admit you (Clause 5.6 of the Terms)', 'Nothing', '100% of the Provider Rate, plus transportation'],
    ] },
    { k: 'p', t: 'A4.1  Rescheduling. A Client who reschedules at least twenty-four (24) hours before the start time, to a slot you have available, is treated as not having cancelled, and no charge arises. A reschedule requested inside twenty-four (24) hours is treated as a cancellation at the applicable band.' },
    { k: 'p', t: 'A4.2  Transportation on a late cancellation. Where you have already begun travelling to the Client when the cancellation is made, transportation is payable to you in full and is not refunded to the Client. Where you have not, transportation is refunded to the Client in full.' },
    { k: 'p', t: 'A4.3  Waiting for a no-show. For Clause 5.6 of the Terms to apply, you must have arrived within the arrival window, waited at least thirty (30) minutes, attempted contact through the Platform, and recorded the no-show. The Platform’s check-in record is the evidence of this.' },
    { k: 'p', t: 'A4.4  First-time forgiveness. SCEI may, once per Client in any twelve (12) month period, waive a late cancellation charge where the reason is a genuine emergency. Where SCEI waives the charge, SCEI, not you, absorbs the amount payable to you under the table above.' },
    { k: 'h', t: 'A5.  Cancellation by you' },
    { k: 'p', t: 'A5.1  Notice. Cancel through the Platform as early as you can, and at least twenty-four (24) hours before the start time. SCEI will attempt to reassign the Booking to another Provider.' },
    { k: 'p', t: 'A5.2  No monetary penalty. SCEI does not charge you a cancellation fee. Reliability is managed through your record on the Platform rather than through deductions from your earnings.' },
    { k: 'p', t: 'A5.3  Reliability record. A cancellation made less than twenty-four (24) hours before the start time, and a failure to attend a Booking you accepted, are recorded against your account. In any rolling ninety (90) day period:' },
    { k: 'p', t: '(a)  three (3) such records prompt a conversation with SCEI and may affect your ranking;' },
    { k: 'p', t: '(b)  five (5) such records place your account under review under Clause 23.4 of the Terms; and' },
    { k: 'p', t: '(c)  a failure to attend without notice, at any time, is treated as a serious matter and may result in immediate suspension.' },
    { k: 'p', t: 'A5.4  What is not recorded against you. A cancellation is not recorded where it is caused by your own illness or injury, a bereavement, a force majeure event under Clause A7, a Client-side change, a safety concern under Clause 5.8 of the Terms, or the absence of a required adult under Clause 7.3 of the Terms. SCEI may ask for reasonable substantiation, and will not ask you to disclose the nature of a medical condition.' },
    { k: 'h', t: 'A6.  Sessions ended early' },
    { k: 'table', head: ['Situation', 'Paid to you', 'Refunded to the Client'], rows: [
      ['You end the session on safety grounds under Clause 5.8 of the Terms', '100% of the Provider Rate, plus transportation', 'At SCEI’s discretion; SCEI absorbs any refund'],
      ['You end the session because a required adult is absent under Clause 7.3 of the Terms', '100% of the Provider Rate, plus transportation', 'Nothing'],
      ['You decline to treat for a clinical reason found on arrival (for example a contraindication or an acute illness)', '50% of the Provider Rate, plus transportation', 'The balance of the Provider Rate'],
      ['The Client ends the session early for their own reasons', '100% of the Provider Rate, plus transportation', 'Nothing'],
      ['You end the session early for your own reasons', 'Pro-rated to the time actually rendered', 'The balance'],
    ] },
    { k: 'p', t: 'A6.1  In every case you must record in the Platform, before leaving, the time the session ended and the reason. Payment under this Clause depends on that record.' },
    { k: 'h', t: 'A7.  Weather, calamity and force majeure' },
    { k: 'p', t: 'A7.1  Automatic cancellation. A Homecare Session is cancelled with no consequence to either party, and with no record against your reliability, where at the scheduled time: a tropical cyclone wind signal No. [2] or above is in force over the Client’s locality; the local government unit or a national authority has suspended work or classes on safety grounds; flooding, a landslide or a road closure makes the journey unsafe; or a comparable event beyond either party’s control prevents the session.' },
    { k: 'p', t: 'A7.2  What happens. The Client is offered a free reschedule or a full refund. Where you had already begun travelling, transportation actually incurred is reimbursed to you by SCEI on presentation of proof.' },
    { k: 'p', t: 'A7.3  Your judgment. You are never required to travel to or remain at a location you reasonably judge unsafe, whether or not a signal or suspension has been declared.' },
    { k: 'h', t: 'A8.  Refunds, chargebacks and set-off' },
    { k: 'p', t: 'A8.1  How refunds are made. Refunds are made to the Client’s original payment method within [seven (7)] banking days of approval, or such shorter period as the Consumer Act of the Philippines and Republic Act No. 11967 require.' },
    { k: 'p', t: 'A8.2  Who bears a refund. A refund arising from your act or omission is set off against your payouts under Clause 10.6 of the Terms. A refund arising from a Platform failure, an SCEI error, or a force majeure event is borne by SCEI.' },
    { k: 'p', t: 'A8.3  Chargebacks. Where a Client initiates a chargeback, SCEI notifies you and you provide the documentation needed to respond within [three (3)] business days. Where the chargeback succeeds and the underlying complaint is attributable to you, the amount is set off against your payouts.' },
    { k: 'p', t: 'A8.4  Limit on set-off. SCEI will not set off more than fifty per cent (50%) of any single weekly payout, and will carry the balance forward, so that a dispute does not remove a week’s income at once. SCEI will not set off an amount that is genuinely disputed until the dispute is resolved under Section 11 of the Terms.' },
    { k: 'h', t: 'A9.  Changes to this Annex' },
    { k: 'p', t: 'A9.1  SCEI may change this Annex on at least thirty (30) days’ prior notice by email and in-app, in accordance with Clause 10.8 of the Terms. Changes apply only to Bookings confirmed on or after the effective date, and you may deactivate your account before that date without penalty if you do not accept them.' },
  ],
}

const ANNEX_B: Annex = {
  id: 'B', title: 'Annex B — Nickel Provider Code of Conduct',
  blocks: [
    { k: 'p', t: 'You are a guest in someone’s home, and often in the home of a person who is unwell, in pain, or caring for a child who is. This Code sets out what that asks of you. It supplements, and does not replace, the Code of Ethics of your PRC Professional Regulatory Board.' },
    { k: 'h', t: 'B1.  Arriving and presenting yourself' },
    { k: 'p', t: 'B1.1  Wear clean, professional attire appropriate to hands-on work, and display your Nickel identification for the whole visit. Carry your PRC identification card and show it on request.' },
    { k: 'p', t: 'B1.2  Arrive within the arrival window. Where you will be late, tell the Client and SCEI through the Platform before the start time, not after it.' },
    { k: 'p', t: 'B1.3  Bring your own equipment, linen and supplies. Do not expect the Client to provide them, and do not ask the Client to purchase anything for the session.' },
    { k: 'p', t: 'B1.4  Introduce yourself to the Client and to the adult present, explain what the session will involve, and confirm consent before you begin.' },
    { k: 'h', t: 'B2.  Conduct in the home' },
    { k: 'p', t: 'B2.1  Remove your shoes if asked, and observe the household’s customs and religious practices without comment.' },
    { k: 'p', t: 'B2.2  Use only the space needed for the session. Ask before moving furniture, opening doors, or using the bathroom, and leave the space as you found it.' },
    { k: 'p', t: 'B2.3  Do not smoke or vape anywhere on the premises. Do not consume the household’s food or drink beyond what is freely offered as a courtesy.' },
    { k: 'p', t: 'B2.4  Treat everyone in the household with courtesy, including children, household staff, drivers and carers.' },
    { k: 'p', t: 'B2.5  Do not bring any other person to the home except with the Client’s prior consent recorded in the Platform under Clause 8.5 of the Terms.' },
    { k: 'h', t: 'B3.  Professional boundaries' },
    { k: 'p', t: 'B3.1  Do not enter into a personal, romantic or sexual relationship with a Client or a member of the Client’s household during the care relationship, and do not pursue one afterwards while a professional imbalance persists.' },
    { k: 'p', t: 'B3.2  Do not borrow money from, or lend money to, a Client or their household, and do not solicit investment, employment or business from them.' },
    { k: 'p', t: 'B3.3  Decline gifts beyond a token courtesy. Food or drink offered during a visit may be accepted. Anything of more than nominal value, and any cash, is declined politely and reported to SCEI through the Platform.' },
    { k: 'p', t: 'B3.4  Do not proselytise, whether religiously, politically or commercially, and do not market any product, service, clinic or platform to the Client.' },
    { k: 'p', t: 'B3.5  Do not discuss another Client with anyone, and do not discuss your fees or your arrangements with SCEI in a way that invites the Client to transact outside the Platform.' },
    { k: 'h', t: 'B4.  Privacy in the home' },
    { k: 'p', t: 'B4.1  Do not photograph, film or record the Client, any other person, or the interior of the home, without consent documented in the Platform, and only where the recording serves a clinical purpose.' },
    { k: 'p', t: 'B4.2  Never post anything about a Client, a session or a home on social media, including in de-identified or composite form. A description a family could recognise is a disclosure.' },
    { k: 'p', t: 'B4.3  Take care with conversations that others in the home can overhear, including telephone calls about other Clients.' },
    { k: 'p', t: 'B4.4  Keep your device locked and the Platform closed when not in use, and never leave clinical notes visible.' },
    { k: 'h', t: 'B5.  Safeguarding' },
    { k: 'p', t: 'B5.1  A parent, guardian or designated competent adult must be present throughout any session with a minor Client, in accordance with Clause 7.3 of the Terms. Do not conduct a session with a minor behind a closed door.' },
    { k: 'p', t: 'B5.2  Explain any hands-on technique before you apply it, use appropriate draping, and stop immediately if the Client or the child indicates they want you to.' },
    { k: 'p', t: 'B5.3  Report any concern about abuse, neglect or exploitation under Clause 7.5 of the Terms. If you are unsure whether what you saw meets the threshold, report it anyway and let SCEI’s safeguarding contact make that judgment.' },
    { k: 'h', t: 'B6.  Communication' },
    { k: 'p', t: 'B6.1  Communicate with Clients through the Platform. Do not give out your personal mobile number, personal email, or social media accounts, and do not accept a Client’s invitation to move the conversation elsewhere.' },
    { k: 'p', t: 'B6.2  Do not contact a Client outside session hours except through the Platform and for a clinical reason.' },
    { k: 'p', t: 'B6.3  Answer SCEI’s messages about a Booking, a complaint or a safety matter within [two (2)] business days.' },
    { k: 'h', t: 'B7.  Conduct that will end your account' },
    { k: 'p', t: 'The following are treated as incompatible with practising through Nickel and will ordinarily result in immediate deactivation, in addition to any referral required by law:' },
    { k: 'p', t: '(a)  causing harm to a Client through recklessness, or any act of abuse, exploitation, or sexual misconduct;' },
    { k: 'p', t: '(b)  attending a session under the influence of alcohol or an impairing substance;' },
    { k: 'p', t: '(c)  accessing the record of a Client not booked with you, or disclosing Client Information outside the Platform;' },
    { k: 'p', t: '(d)  submitting a false, altered or expired credential, or practising while your PRC licence is lapsed, suspended or revoked;' },
    { k: 'p', t: '(e)  sending another person to render a Booking in your place;' },
    { k: 'p', t: '(f)  failing to report a safeguarding concern you recognised; and' },
    { k: 'p', t: '(g)  photographing or recording a Client or their home without consent, or posting Client content publicly.' },
    { k: 'h', t: 'B8.  How SCEI responds to a concern' },
    { k: 'table', head: ['Level', 'Examples', 'What happens'], rows: [
      ['Coaching', 'A first late arrival; a documentation lapse; a tone that a Client found abrupt', 'A written note through the Platform, and a conversation if you want one. No record against your standing.'],
      ['Written warning', 'Repeated lateness or late cancellation; incomplete notes after a reminder; a boundary lapse without harm', 'A warning you acknowledge in the Platform, with what needs to change and by when.'],
      ['Suspension pending review', 'A credible complaint of a boundary breach, unauthorised photography, or off-platform solicitation', 'Bookings paused, the substance of the allegation put to you, and a fair opportunity to respond under Clause 23.4 of the Terms.'],
      ['Immediate deactivation', 'Anything in Clause B7', 'Account closed, earnings for completed sessions released, and referral to the PRC, the NPC or law enforcement where the law requires it.'],
    ] },
    { k: 'p', t: 'B8.1  Your right to be heard. Except where immediate action is needed to protect someone, SCEI tells you what has been alleged, gives you a reasonable opportunity to respond, considers your response, and tells you the outcome and the reasons for it.' },
    { k: 'p', t: 'B8.2  Your right to ask for a review. You may ask SCEI to review a deactivation under Clause 23.5 of the Terms.' },
    { k: 'p', t: 'B8.3  Speaking up. SCEI will not penalise you for reporting a safety concern, a safeguarding concern, a privacy incident, or a problem with the Platform itself, in good faith.' },
  ],
}

const ANNEX_C: Annex = {
  id: 'C', title: 'Annex C — Privacy Notice for Providers',
  blocks: [
    { k: 'p', t: 'This notice explains what personal data SCEI collects about you as a Nickel Provider, why, on what lawful basis, who it is shared with, how long it is kept, and what you can do about it. It is given under Republic Act No. 10173 (the Data Privacy Act of 2012) and its Implementing Rules and Regulations. It covers your data. Client data is covered by Section 13 of the Terms and by the Client-facing privacy notice.' },
    { k: 'h', t: 'C1.  Who is responsible' },
    { k: 'p', t: `C1.1  The Personal Information Controller is Sapphire Clinics East Incorporated, with principal office at ${OFFICE} and SEC Registration No. 2024040147438-01.` },
    { k: 'p', t: 'C1.2  The Data Protection Officer is Jan De Asis, contactable at jpdeasis.scei@gmail.com and at the principal office address. Please direct any privacy question, request or complaint to the DPO in the first instance.' },
    { k: 'h', t: 'C2.  What SCEI collects and why' },
    { k: 'table', head: ['Category', 'What it includes', 'Purpose and lawful basis'], rows: [
      ['Identity and contact', 'Name, date of birth, photograph, address, mobile number, email, government-issued identification', 'To create and operate your account, and to identify you to Clients. Necessary for the performance of these Terms.'],
      ['Professional credentials', 'PRC licence and identification card, PTR, curriculum vitae, training records, specialisations', 'To verify that you are licensed and competent, and to display your credentials to Clients. Necessary for these Terms and for SCEI’s legal obligations.'],
      ['Background verification', 'NBI clearance and the results of verification with the PRC and your references', 'To protect Clients, who are often children or unwell adults, in their own homes. Processed with your consent and on the basis of SCEI’s legitimate interest in Client safety.'],
      ['Financial and tax', 'Bank account and GCash details, Taxpayer Identification Number, BIR Certificate of Registration, sworn declarations, payout history', 'To pay you and to withhold and remit tax. Necessary for these Terms and for SCEI’s legal obligations under the National Internal Revenue Code.'],
      ['Booking and session data', 'Bookings accepted and declined, check-in and check-out times and locations, session duration, cancellations, session notes you author', 'To coordinate Bookings, verify that sessions took place, compute payouts, and keep you and the Client safe. Necessary for these Terms.'],
      ['Communications', 'Messages in the Platform, support tickets, incident and complaint records, call recordings where notified', 'To operate the service, investigate complaints, and resolve disputes. Legitimate interest.'],
      ['Quality and feedback', 'Client ratings and reviews, complaints about you, outcomes of reviews', 'To maintain the standard of care and decide eligibility for continued access. Legitimate interest.'],
      ['Device and technical', 'Device type, operating system, application version, IP address, log-in records, crash logs', 'To secure the Platform, detect fraud and unauthorised access, and support you. Legitimate interest.'],
      ['Electronic signature', 'Your specimen signature and the record of your acceptance of these Terms', 'To execute documents and evidence your agreement, under Republic Act No. 8792. Necessary for these Terms.'],
    ] },
    { k: 'p', t: 'C2.1  Sensitive personal information. Information about any case or offence, including the content of your NBI clearance, is sensitive personal information under the Data Privacy Act. SCEI processes it only for credentialing and Client safety, only with your consent, and only for as long as Clause C6 allows.' },
    { k: 'p', t: 'C2.2  Location data. Location is collected at check-in and check-out and, where you enable it, for the duration of a visit, for the safety of both you and the Client and to verify that a session took place. It is not used to track you outside a Booking, and you can see in the Platform when it is being collected.' },
    { k: 'h', t: 'C3.  Where the information comes from' },
    { k: 'p', t: 'C3.1  From you, at registration and afterwards; from the PRC, the NBI and your references, when SCEI verifies what you submitted; from Clients, in the form of bookings, ratings, reviews and complaints; from the payment provider and your bank or GCash, in the form of remittance confirmations; and from the Platform itself, in the form of logs and device data.' },
    { k: 'h', t: 'C4.  Who it is shared with' },
    { k: 'table', head: ['Recipient', 'Why'], rows: [
      ['Clients and their representatives', 'Your name, photograph, profession, credentials, ratings, Provider Rate and Service Areas are displayed so a Client can choose you. Your contact details are not displayed.'],
      ['Jara Universal OPC', 'Development, hosting support and maintenance of the Platform, as SCEI’s personal information processor under a written agreement.'],
      ['The payment provider operating SCEI’s Verdana account, and your bank or GCash', 'To collect Client payments and remit your earnings.'],
      ['SCEI’s professional advisers, auditors and insurers', 'For accounting, tax, audit, legal advice and insurance, under confidentiality.'],
      ['Regulators and authorities', 'The National Privacy Commission, the Professional Regulation Commission, the Department of Health, the Bureau of Internal Revenue, the Department of Labor and Employment, and law enforcement, where the law requires or a lawful order compels disclosure.'],
    ] },
    { k: 'p', t: 'C4.1  SCEI does not sell your personal data and does not share it with advertisers.' },
    { k: 'p', t: 'C4.2  Storage location and transfers. The Platform and its data are hosted at [●]. Where personal data is transferred outside the Philippines, SCEI remains accountable for it and puts in place the contractual protections required by the Data Privacy Act.' },
    { k: 'h', t: 'C5.  What is shown publicly' },
    { k: 'p', t: 'C5.1  Your Nickel profile displays your name, photograph, profession, PRC licence status, credentials and training, service categories, Service Areas, languages, Provider Rate, and your ratings and reviews. Your home address, contact details, financial details, NBI clearance and payout history are never displayed.' },
    { k: 'h', t: 'C6.  How long it is kept' },
    { k: 'table', head: ['Category', 'Retention', 'Why'], rows: [
      ['Account, identity and credential records', 'Duration of your account plus [five (5)] years', 'Defence of claims and regulatory inquiry'],
      ['Session and booking records, including your session notes', 'With the Client record, at least [ten (10)] years from the last session', 'Clause 9.3 of the Terms'],
      ['Financial, payout and tax records', '[Ten (10)] years', 'National Internal Revenue Code and BIR regulations'],
      ['NBI clearance and verification results', 'Until superseded by a later clearance, and in any case no more than [two (2)] years', 'Proportionality — it is only current for a limited period'],
      ['Communications, complaints and incident records', '[Five (5)] years from closure', 'Defence of claims'],
      ['Device and technical logs', '[Twelve (12)] months', 'Security and fraud detection'],
      ['Records of your acceptance of each version of these Terms', 'Duration of your account plus [ten (10)] years', 'Evidence of agreement under RA 8792'],
    ] },
    { k: 'p', t: 'C6.1  At the end of a retention period the data is securely deleted or anonymised, unless a claim, an investigation or a legal obligation requires it to be kept longer.' },
    { k: 'h', t: 'C7.  How it is protected' },
    { k: 'p', t: 'C7.1  SCEI applies organisational, physical and technical measures proportionate to the risk, including access control on a need-to-know basis, encryption of data in transit and at rest, logging of access to Client records, multi-factor authentication where available, staff and Provider training, vendor due diligence, and a documented breach response procedure. No system is perfectly secure, and Section 15 of the Terms sets out what to do if something goes wrong.' },
    { k: 'h', t: 'C8.  Your rights' },
    { k: 'p', t: 'C8.1  Under the Data Privacy Act you have the right to be informed; to access your personal data; to object to processing, including to processing for profiling; to have inaccurate data corrected; to have data erased or blocked in the circumstances the law allows; to data portability; and to be indemnified for damage caused by unlawful processing.' },
    { k: 'p', t: 'C8.2  How to exercise them. Write to the Data Protection Officer at the address in Clause C1.2. SCEI acknowledges within [five (5)] business days and responds within the period the Data Privacy Act prescribes. SCEI may need to verify your identity first, and may decline a request where the law or a retention obligation requires the data to be kept.' },
    { k: 'p', t: 'C8.3  Complaints. If you are not satisfied with SCEI’s response you may complain to the National Privacy Commission, 25th to 27th Floors, The Upper Class Tower, Quezon Avenue corner Scout Reyes Street, Quezon City, telephone (02) 5322-1322, using the contact details published at privacy.gov.ph.' },
    { k: 'h', t: 'C9.  Automated processing' },
    { k: 'p', t: 'C9.1  The Platform uses automated matching to decide which Bookings are offered to which Providers, taking account of Service Area, availability, service category, credentials, ratings and reliability record. No decision to suspend or deactivate an account is made by automated means alone; a person makes that decision and Clause 23.4 of the Terms applies. You may ask the DPO how the matching applies to you and may object to processing on the grounds the law allows.' },
    { k: 'h', t: 'C10.  Changes to this notice' },
    { k: 'p', t: 'C10.1  SCEI will notify you of any material change to this notice at least [thirty (30)] days before it takes effect, by email and in the Platform, and will keep prior versions available on request.' },
  ],
}

const ANNEX_D: Annex = {
  id: 'D', title: 'Annex D — Service Areas, Travel and Transportation Policy',
  blocks: [
    { k: 'p', t: 'Nickel operates throughout the Philippines. This Annex explains how you choose where you work, how transportation is calculated and disclosed, and what applies when a Booking is far from home.' },
    { k: 'h', t: 'D1.  Coverage and your Service Areas' },
    { k: 'p', t: 'D1.1  Nationwide. Nickel accepts Clients anywhere in the Philippines. Coverage in any given place depends on whether a verified Provider has selected it, so availability varies by locality.' },
    { k: 'p', t: 'D1.2  Your home base. You nominate one home base — a barangay and city or municipality — from which travel is measured. You may change it once in any [ninety (90)] day period, or more often with SCEI’s agreement if you relocate.' },
    { k: 'p', t: 'D1.3  Your Service Areas. You select the cities, municipalities or distance bands you are willing to travel to. You are only offered Bookings within them, and you may change them at any time, effective for Bookings confirmed afterwards.' },
    { k: 'p', t: 'D1.4  Local practice requirements. You are responsible for holding a Professional Tax Receipt in each locality where the local government unit requires one of a practising professional, and for any other local permit that applies to your practice. SCEI does not obtain these for you.' },
    { k: 'h', t: 'D2.  Transportation' },
    { k: 'p', t: 'D2.1  Two ways to charge it. You either set a transportation-inclusive Provider Rate, in which case nothing further is added, or you set a rate exclusive of transportation, in which case the allowance below is added to the Session Fee and disclosed to the Client before they confirm. Either way, the Client sees one total before booking.' },
    { k: 'p', t: 'D2.2  Allowance by distance. Transportation is set by the band into which the one-way road distance from your home base to the Client’s address falls, as computed by the Platform:' },
    { k: 'table', head: ['Tier', 'One-way distance from your base', 'Allowance (PHP)', 'Approval'], rows: [
      ['Tier 1', 'Up to 10 km', '[●]', 'Automatic'],
      ['Tier 2', 'Over 10 km and up to 25 km', '[●]', 'Automatic'],
      ['Tier 3', 'Over 25 km and up to 50 km', '[●]', 'Automatic'],
      ['Tier 4', 'Over 50 km, no overnight stay required', 'Quoted per Booking', 'You and the Client both confirm before the Booking is accepted'],
      ['Tier 5', 'Requiring air or sea travel, or an overnight stay', 'Actual documented cost, agreed in advance', 'Written pre-approval by SCEI'],
    ] },
    { k: 'p', t: 'D2.3  No direct collection. Transportation is collected by SCEI as part of the Session Fee and passed through to you in full under Clause A1.2. You may not ask the Client for fuel, fare, parking or any other travel money at the visit.' },
    { k: 'p', t: 'D2.4  Tolls and parking. Tolls and paid parking actually incurred are reimbursed at cost, up to PHP [●] per Booking, on upload of the receipt to the Platform within [seven (7)] days.' },
    { k: 'p', t: 'D2.5  Travel time. Travel time within Tiers 1 to 3 is not separately compensated and should be reflected in the Provider Rate you set. Tier 4 and Tier 5 Bookings may include a travel-time allowance agreed in advance.' },
    { k: 'p', t: 'D2.6  Consecutive Bookings. Where you have consecutive Bookings and travel directly between them, transportation for the second Booking is computed from the first Client’s address rather than from your base, where that is the shorter distance.' },
    { k: 'h', t: 'D3.  Long-distance and overnight Bookings' },
    { k: 'p', t: 'D3.1  Pre-approval. A Tier 5 Booking proceeds only where SCEI has approved it in writing, the Client has agreed the total cost in advance, and the arrangements for travel and accommodation are settled before you depart.' },
    { k: 'p', t: 'D3.2  Accommodation. Where an overnight stay is required, accommodation of a reasonable standard is arranged and paid for as part of the agreed cost, and is not deducted from your Provider Rate. You are not asked to stay in the Client’s home.' },
    { k: 'p', t: 'D3.3  Block Bookings. A series of sessions in one trip is booked and priced as a block, with the transportation and accommodation cost apportioned across the sessions and disclosed to the Client as a single total.' },
    { k: 'p', t: 'D3.4  Cancellation of a Tier 5 Booking. Where a Tier 5 Booking is cancelled by the Client after travel or accommodation has been booked and cannot be refunded, the non-refundable cost is borne by the Client and you are paid under the table in Clause A4, computed on the Provider Rate for the first session.' },
    { k: 'h', t: 'D4.  Safety when working away from your base' },
    { k: 'p', t: 'D4.1  Check-in. Use the Platform’s check-in and check-out function for every visit. Where connectivity does not allow it, send an SMS to [●] on arrival and on departure, and record the times in the Platform when you regain signal.' },
    { k: 'p', t: 'D4.2  Late sessions in unfamiliar areas. Take particular care with sessions ending after dark in an area you do not know, and where transport home is uncertain. SCEI will not schedule a session ending after [7:00 pm] in a Tier 4 or Tier 5 area without confirming your return arrangements first.' },
    { k: 'p', t: 'D4.3  Your discretion. Clause 8.3 of the Terms applies wherever you are. You may decline a Booking, or leave a location, on safety grounds, and no reliability record follows from it.' },
    { k: 'p', t: 'D4.4  Emergency contacts. Keep an emergency contact current in your account. SCEI will use it only if you cannot be reached during or immediately after a Booking.' },
    { k: 'h', t: 'D5.  Changes' },
    { k: 'p', t: 'D5.1  SCEI may change the tiers and allowances in this Annex on at least thirty (30) days’ prior notice, in accordance with Clause 10.8 of the Terms. Changes apply only to Bookings confirmed on or after the effective date.' },
  ],
}

const ANNEXES: Annex[] = [ANNEX_A, ANNEX_B, ANNEX_C, ANNEX_D]

function stripBrackets(s: string): string { return s.replace(/\[(?!●)/g, '').replace(/\]/g, '') }
function withBlanks(text: string, keyBase: string): ReactNode {
  const parts = text.split('[●]')
  if (parts.length === 1) return stripBrackets(text)
  const out: ReactNode[] = []
  parts.forEach((p, i) => {
    out.push(stripBrackets(p))
    if (i < parts.length - 1) out.push(<span key={`${keyBase}-b${i}`} className="rounded bg-amber-100 px-1 text-amber-800">[ — ]</span>)
  })
  return out
}

export function ProviderAnnexesBody() {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed text-[color:var(--slate)]">
      <p className="text-[13px] font-semibold text-[color:var(--ink)]">Nickel Provider Terms of Service — Annexes A to D</p>
      <p>These Annexes form part of the Nickel Provider Terms of Service under Clause 1.3 of those Terms and are read together with them. Words defined in the Terms have the same meaning here.</p>
      {ANNEXES.map((a) => (
        <div key={a.id} className="pt-2">
          <p className="mt-2 text-[13px] font-bold text-[color:var(--ink)]">{a.title}</p>
          {a.blocks.map((b, i) => {
            if (b.k === 'h') return <p key={`${a.id}-${i}`} className="mt-2 text-[12.5px] font-semibold text-[color:var(--ink)]">{b.t}</p>
            if (b.k === 'p') return <p key={`${a.id}-${i}`} className={b.t.startsWith('(') ? 'pl-4' : ''}>{withBlanks(b.t, `${a.id}-${i}`)}</p>
            return (
              <div key={`${a.id}-${i}`} className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr>{b.head.map((h, j) => <th key={j} className="border border-[color:var(--line)] bg-[color:var(--mist-2)] px-2 py-1.5 text-left font-semibold text-[color:var(--ink)]">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-[color:var(--line)] px-2 py-1.5 align-top">{withBlanks(c, `${a.id}-${i}-${ri}-${ci}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
