// Nickel Provider Terms of Service — full agreement, rendered from structured
// data so the same source drives both the signup scroll-box and the standalone
// /provider/terms page. Internal drafting apparatus (reviewer notes, the
// "draft for legal review" banner, and the summary/annex-planning appendix)
// is intentionally NOT reproduced here — only the operative agreement is.
//
// Bracketed [●] markers are business/legal blanks that still require a
// decision by SCEI and its counsel before these terms are finalised.

import type { ReactNode } from 'react'

export const TERMS_VERSION = '1.0'
export const TERMS_EFFECTIVE = 'Effective 28 August 2026'

interface Section { n: string; title: string; body: string[] }

const INTRO: string[] = [
  'These Provider Terms of Service (the "Terms") form a binding agreement between you, the licensed healthcare professional creating a provider account (the "Provider", "you" or "your"), and Sapphire Clinics East Incorporated ("SCEI", "we", "us" or "our"), a corporation duly organised and existing under the laws of the Republic of the Philippines, with SEC Registration No. 2024040147438-01 and principal office at Units L4205, L4203, L4201, L4199, L4168, L4166 and L4164, 4th Floor, Robinsons Metro East, Marcos Highway, Barangay Dela Paz, 1600 City of Pasig, NCR Second District, Philippines.',
  'SCEI operates Nickel, a digital platform through which clients book homecare rehabilitation and allied health sessions with independent, PRC-licensed professionals. Application development for Nickel is undertaken in coordination with Jara Universal OPC. SCEI also operates the clinic brand Aura Health Rehab, with branches at Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig, and Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City.',
  'By ticking the acceptance box, creating a provider account, or accepting any booking through Nickel, you confirm that you have read, understood and agree to be bound by these Terms and by the documents listed in Clause 1.3. If you do not agree, please do not create an account and do not use the Platform.',
  'These Terms are entered into in accordance with the Civil Code of the Philippines, Republic Act No. 10173 (the Data Privacy Act of 2012) and its Implementing Rules and Regulations, DOH Administrative Order No. 2020-0030, the Health Privacy Code (Joint DOH–DOST–PhilHealth Administrative Order No. 2016-0002), Republic Act No. 11967 (the Internet Transactions Act of 2023) and its Implementing Rules, Republic Act No. 8792 (the Electronic Commerce Act of 2000), Republic Act No. 7394 (the Consumer Act of the Philippines), and the professional regulatory laws and issuances of the Professional Regulation Commission applicable to your profession.',
]

const SECTIONS: Section[] = [
  { n: '1', title: 'Definitions and Interpretation', body: [
    '1.1  In these Terms, the following words have the meanings given below:',
    '(a)  "Booking" means a confirmed engagement of the Provider by a Client for one or more Homecare Sessions, arranged through the Platform.',
    '(b)  "Client" means a person who books a Homecare Session through Nickel, and where the context requires, includes that person’s Client Representative.',
    '(c)  "Client Information" means all personal information and sensitive personal information relating to a Client, including health information, assessment findings, plans of care, session notes, images, recordings, contact details and home address.',
    '(d)  "Client Representative" means a parent, legal guardian, or other person legally authorised to give consent for, and to receive information on behalf of, a Client who is a minor or who lacks capacity to consent.',
    '(e)  "Fee Schedule" means Annex A, as amended from time to time in accordance with Clause 10.8.',
    '(f)  "Homecare Session" means a single episode of professional service rendered by the Provider to a Client at the Client’s home or other agreed non-clinic location.',
    '(g)  "Personal Data", "Sensitive Personal Information", "Personal Information Controller" ("PIC"), "Personal Information Processor" ("PIP"), "Data Subject" and "Personal Data Breach" have the meanings given to them in the Data Privacy Act of 2012 and its Implementing Rules and Regulations.',
    '(h)  "Platform" or "Nickel" means the Nickel mobile application, web application, and related systems and services operated by SCEI.',
    '(i)  "Platform Fee" means the fee retained by SCEI from each Session Fee, as set out in the Fee Schedule.',
    '(j)  "Provider Content" means the name, photograph, credentials, biography, rates, service categories and other material you submit for display on your Nickel profile.',
    '(k)  "Provider Rate" means the rate per Homecare Session that you set under Clause 4.2.',
    '(l)  "Service Area" means a geographic coverage area you select under Annex D.',
    '(m)  "Session Fee" means the total amount payable by the Client for a Homecare Session, comprising the Provider Rate and, where applicable, transportation and other charges disclosed to the Client before confirmation.',
    '1.2  Interpretation. Headings are for convenience only. "Including" and "such as" are without limitation. References to days are calendar days unless business days are specified. All times are Philippine Standard Time. All amounts are in Philippine Pesos (PHP) unless stated otherwise. References to a law include that law as amended and any issuance made under it.',
    '1.3  Documents incorporated by reference. The following form part of these Terms: (a) Annex A — Fee Schedule, Cancellation, No-Show and Refund Policy; (b) Annex B — Nickel Provider Code of Conduct; (c) Annex C — Nickel Privacy Notice for Providers; (d) Annex D — Service Areas, Travel and Transportation Policy; and (e) any operational policy published in the Platform and identified as forming part of these Terms.',
    '1.4  Order of precedence. If there is a conflict, these Terms prevail over the Annexes, and the Annexes prevail over in-app policies, except where an Annex expressly states that it prevails on a specific matter.',
  ] },
  { n: '2', title: 'Nature of the Platform and Relationship of the Parties', body: [
    '2.1  Role of SCEI. Nickel is a booking, coordination and payment-facilitation platform. SCEI does not itself render the professional services booked through Nickel, does not direct or control your clinical judgment, and is not a party to the professional service relationship between you and the Client. That relationship, including the duty of care owed to the Client, is yours.',
    '2.2  Independent contractor. You engage with SCEI as an independent professional practitioner and independent contractor. Nothing in these Terms creates an employer-employee, partnership, joint venture, or agency relationship between you and SCEI, save for the limited collection agency created by Clause 10.1. In particular:',
    '(a)  you control the manner, method, means and details of the professional services you render, subject only to your professional standards, the Client’s consent, and the safety and conduct requirements in Sections 6 to 8;',
    '(b)  you determine your own availability and are free to accept or decline any Booking;',
    '(c)  you set your own Provider Rate under Clause 4.2;',
    '(d)  you are free to render professional services to other clients, employers, clinics and platforms, subject only to Section 12;',
    '(e)  you provide your own equipment, materials, professional supplies and transportation, except where SCEI expressly provides them;',
    '(f)  you are not entitled to wages, thirteenth month pay, service incentive leave, holiday or overtime premium, separation pay, or any other benefit payable to an employee under the Labor Code of the Philippines; and',
    '(g)  you are responsible for your own SSS, PhilHealth and Pag-IBIG contributions as a self-employed member, and for your own taxes under Clause 10.5.',
    '2.3  No guarantee of bookings or income. SCEI makes no representation, warranty or guarantee as to the number of Bookings you will receive, the income you will earn, or the continuity of either.',
    '2.4  Providers who are also SCEI personnel. If you are also an employee, consultant or clinic-based practitioner of SCEI or Aura Health Rehab, your engagement as a Nickel Provider is separate and distinct from that relationship, and is governed by these Terms. Nothing in these Terms varies your rights or obligations under that separate relationship, and nothing in that separate relationship entitles you to Bookings on the Platform.',
  ] },
  { n: '3', title: 'Eligibility, Credentialing and Verification', body: [
    '3.1  Minimum eligibility. To hold a provider account you must, at all times: be at least eighteen (18) years of age and a natural person; hold a current and valid Professional Regulation Commission licence in a profession accepted by SCEI on Nickel; hold a current Professional Tax Receipt where required by the local government unit in which you practise; be legally permitted to practise your profession in the Philippines; and have the legal capacity to enter into these Terms.',
    '3.2  Accepted professions. SCEI currently accepts Physical Therapists and Occupational Therapists (Republic Act No. 5680), Speech-Language Pathologists (Republic Act No. 11249), Psychologists and Psychometricians (Republic Act No. 10029), and Special Education practitioners with the qualifications SCEI specifies, and may add or remove professions on notice.',
    '3.3  Documents you must submit. On registration and on request thereafter: your PRC identification card and licence; your current PTR; a valid government-issued identification document; an NBI clearance issued within the preceding [six (6)] months; your curriculum vitae; any professional indemnity insurance you hold under Section 16; your specimen electronic signature; and your payout details.',
    '3.4  Verification. You authorise SCEI to verify the documents and information you submit with the PRC, the NBI, your stated employers, references and other lawful sources, and to re-verify at any time and at least once every twelve (12) months. SCEI may refuse, suspend or deactivate an account where verification is incomplete, inconclusive or unsatisfactory.',
    '3.5  Your continuing duty to notify. You will notify SCEI in writing within [three (3)] business days of any of the following: the expiry, lapse, suspension, revocation or cancellation of your PRC licence or PTR; any administrative, civil or criminal complaint, investigation or case relating to your professional practice or to the safety of a person in your care; any restriction placed on your scope of practice; any change to the information or documents you submitted; and any circumstance that materially affects your fitness to render homecare services safely.',
    '3.6  Scope of practice. You will render only those services that fall within your PRC-licensed scope of practice, within your demonstrated competence, and within the service categories enabled on your Nickel profile. Where a service requires a physician’s referral, prescription or clearance, you will render it only on the basis of a valid and current referral, and will record that referral in the Client’s file.',
    '3.7  Misrepresentation. Submitting false, altered or expired credentials is a material breach of these Terms and will result in immediate deactivation, forfeiture of the right to further Bookings, and referral to the PRC and to law enforcement where warranted.',
  ] },
  { n: '4', title: 'Provider Profile, Rates and Listings', body: [
    '4.1  Your profile. Your Nickel profile displays your name, photograph, profession, PRC licence status, credentials, service categories, Service Areas, languages, Provider Rate and Client ratings. You are responsible for the accuracy and currency of everything you publish on it.',
    '4.2  You set your own rate. You set your own Provider Rate for each Homecare Session and indicate whether that rate is transportation-inclusive. Both are displayed to Clients before booking.',
    '4.3  Transportation. Where your Provider Rate is not transportation-inclusive, transportation is computed under Annex D and disclosed to the Client before the Booking is confirmed. You may not collect any additional transportation, fuel, parking or incidental charge directly from the Client, whether in cash or otherwise.',
    '4.4  Rate changes. A change to your Provider Rate takes effect only for Bookings confirmed after the change. Bookings already confirmed are honoured at the rate in force when they were confirmed.',
    '4.5  Truthful listings. You will not describe yourself as a specialist in a field in which the PRC does not recognise specialisation, claim outcomes you cannot substantiate, guarantee a cure or a result, or use another practitioner’s credentials, photographs or client material. This obligation is additional to your duties as an online merchant under Republic Act No. 11967 and the Consumer Act of the Philippines.',
    '4.6  Moderation. SCEI may format, translate, rank and display Provider Content, and may decline to publish or may remove content that is inaccurate, misleading, unlawful, or inconsistent with these Terms, giving you notice and an opportunity to correct it where circumstances permit.',
  ] },
  { n: '5', title: 'Bookings, Scheduling, Cancellation and No-Shows', body: [
    '5.1  How a Booking is formed. A Client requests a Homecare Session through the Platform; the Booking is formed when SCEI confirms it in the Platform. Each confirmed Booking is a professional service engagement between you and the Client, facilitated and administered by SCEI under these Terms.',
    '5.2  Acceptance and decline. You may accept or decline any Booking offered to you. You may not decline on any ground prohibited by Clause 20.2. Repeated non-response to Booking offers may affect your ranking and eligibility for further offers.',
    '5.3  Punctuality. You will arrive within the arrival window shown in the Platform. If you will be late, you will notify the Client and SCEI through the Platform as soon as you know, and in any case before the scheduled start time.',
    '5.4  Cancellation by you. You will cancel only through the Platform and, except in an emergency or force majeure event, at least [twenty-four (24)] hours before the scheduled start. Late or repeated cancellation may attract the consequences set out in Annex A and may result in suspension.',
    '5.5  Cancellation by the Client and refunds. Client cancellations, the applicable refund, and any compensation payable to you are governed by Annex A.',
    '5.6  Client no-show. If the Client is not present or does not admit you at the scheduled time, you will wait at least [thirty (30)] minutes, attempt to contact the Client and SCEI through the Platform, and record the no-show in the Platform. Compensation for a recorded no-show is governed by Annex A.',
    '5.7  No substitution. Bookings are personal to you. You will not send, subcontract or delegate a Booking to any other person, whether or not that person is licensed, and will not bring any other person to the Client’s home without the Client’s prior consent recorded in the Platform.',
    '5.8  Your right to end a session. You may decline to begin, or may end, a Homecare Session where you reasonably believe that continuing would be unsafe, clinically inappropriate, or would expose you to abuse, harassment or intoxicated or threatening behaviour. You will leave promptly, ensure the Client is not left in immediate danger, and report to SCEI within [twenty-four (24)] hours. You will be compensated in accordance with Annex A.',
    '5.9  Session logging. You will record your arrival and departure in the Platform at the time they occur, and will complete the session note within [twenty-four (24)] hours of the session in accordance with Section 9.',
  ] },
  { n: '6', title: 'Professional and Clinical Standards', body: [
    '6.1  Professional responsibility. You are solely and professionally responsible for the assessment, plan of care, clinical decisions, execution and documentation of every Homecare Session you render. SCEI does not supervise, direct or override your clinical judgment.',
    '6.2  Applicable standards. You will comply with the professional regulatory law governing your profession, the resolutions, rules and Code of Ethics of the relevant PRC Professional Regulatory Board, applicable DOH issuances, and the prevailing standards of practice for homecare in your discipline.',
    '6.3  Informed consent. Before assessment or treatment, you will obtain and record the Client’s informed consent, having explained in language the Client understands the proposed plan of care, its expected benefits, material risks, reasonable alternatives, and the fees payable. Consent is a continuing requirement and may be withdrawn at any time.',
    '6.4  Infection prevention and control. You will observe hand hygiene, clean and disinfect equipment between Clients, use personal protective equipment appropriate to the service, and comply with any DOH or local government health advisory then in force. You will not render a Homecare Session while you have symptoms of a communicable illness that could reasonably be transmitted to the Client.',
    '6.5  Escalation and emergencies. You will recognise and act on findings that require referral, and will refer the Client to a physician or appropriate service where indicated. In an emergency you will activate local emergency services, remain with the Client so far as is safe, and notify SCEI and the Client Representative as soon as practicable, and in any case within [two (2)] hours.',
    '6.6  Limits. You will not diagnose or manage conditions outside your scope of practice, prescribe or dispense medication, hold yourself out as a physician, or represent yourself as an employee of SCEI or of Aura Health Rehab.',
    '6.7  Continuity of care. Where an episode of care will continue beyond your availability, you will prepare a written handover in the Platform sufficient for another practitioner to continue safely.',
    '6.8  Conduct in the Client’s home. You will observe the Nickel Provider Code of Conduct at Annex B. Without limiting it, you will not: solicit or accept gifts, loans, tips or personal favours beyond a token courtesy; enter into a personal, financial or romantic relationship with a Client or a Client Representative during the care relationship; photograph, film or record the Client, any other person, or the interior of the home without documented consent obtained through the Platform; post any content relating to a Client on social media, even in de-identified form; use the Client’s home, utilities or belongings for personal purposes; or market any product, service or platform to the Client.',
    '6.9  Fitness to practise. You will not render a Homecare Session while under the influence of alcohol or of any substance that impairs judgment or coordination.',
  ] },
  { n: '7', title: 'Clients Who Are Minors or Who Require a Substitute Decision-Maker', body: [
    '7.1  Scope. Nickel serves homecare Clients of all ages, including children and older adults, some of whom will require a Client Representative to consent on their behalf.',
    '7.2  Consent for a minor. Consent for a Client who is a minor must be given by a parent or legal guardian and recorded in the Platform before assessment or treatment. Where the child is developmentally able to do so, you will also seek and record the child’s assent, and you will not proceed over a child’s sustained distress or refusal without discussing it with the Client Representative.',
    '7.3  Adult presence. A parent, legal guardian, or other competent adult designated in writing by the Client Representative must be present in the home for the whole of any Homecare Session with a minor Client. You will decline to begin, or will end, a session where no such adult is present, and will record the reason in the Platform. No penalty under Annex A applies to a session declined or ended on this ground.',
    '7.4  Adults with impaired capacity. Where a Client is unable to give informed consent, consent must be given by the person legally authorised to give it, and the basis of that authority recorded. You will continue to involve the Client in decisions to the extent of their ability.',
    '7.5  Safeguarding and reporting. If you have reasonable grounds to believe that a Client is being abused, neglected or exploited, you will take the steps required of you by law, including under Republic Act No. 7610 (Special Protection of Children Against Abuse, Exploitation and Discrimination), Republic Act No. 9262 (Anti-Violence Against Women and Their Children), and Republic Act No. 9994 (Expanded Senior Citizens Act), and will report the matter to the appropriate authorities and to SCEI’s designated safeguarding contact within [twenty-four (24)] hours.',
    '7.6  No retaliation. SCEI will not deactivate, penalise or reduce the Bookings of a Provider for making a report under Clause 7.5 in good faith.',
  ] },
  { n: '8', title: 'Safety During Home Visits', body: [
    '8.1  Information before the visit. SCEI will make available to you, through the Platform, the Client’s address, contact details, the service booked, and any access or hazard information the Client has disclosed. SCEI does not inspect Clients’ homes and does not warrant that they are safe or suitable.',
    '8.2  Check-in and check-out. You will use the Platform’s check-in and check-out function for every visit. Location data is collected for safety and service verification as described in Annex C.',
    '8.3  Your own safety. You are responsible for your own travel, your own safety en route, and your decision to enter or remain in any location. You may refuse entry to or leave any location you reasonably judge unsafe, and Clause 5.8 applies.',
    '8.4  Incident reporting. You will report to SCEI through the Platform, within [twenty-four (24)] hours, any injury to a Client or to yourself, any adverse event, any damage to property, and any threatening, abusive or inappropriate conduct.',
    '8.5  Companions. You may bring a companion for your own safety only with the Client’s prior consent recorded in the Platform. Any companion is bound by your confidentiality obligations and you remain responsible for their conduct.',
  ] },
  { n: '9', title: 'Clinical Documentation and Records', body: [
    '9.1  Documentation. You will document each Homecare Session accurately, contemporaneously and completely in the Platform, using the templates SCEI provides, and will not alter a record after the fact except by a dated and attributed addendum.',
    '9.2  Records held by SCEI. Client records created through Nickel are maintained by SCEI as Personal Information Controller for and on behalf of the Client. You retain a professional right of access to the records of Clients you have served, for continuity of care, for the defence of a claim, and for PRC, NPC or judicial proceedings, subject to Section 13.',
    '9.3  Retention. SCEI will retain Client records for at least [ten (10)] years from the date of the last Homecare Session, or for such longer period as may be required by law, by DOH issuance, or by a pending or reasonably anticipated claim, after which they will be securely disposed of.',
    '9.4  No personal copies. You will not create or keep personal, offline or off-Platform copies of Client Information except where Clause 13.5 expressly permits it, and you will securely dispose of any permitted copy when its purpose is spent or when your account is deactivated, whichever is earlier.',
    '9.5  Cooperation. You will cooperate promptly and fully with any lawful request, subpoena, PRC or NPC proceeding, quality review, or Client data subject request routed to you by SCEI.',
  ] },
  { n: '10', title: 'Fees, Collection, Payouts and Taxes', body: [
    '10.1  Collection by SCEI. Client payments for Bookings are collected online by SCEI through its Verdana payment account. SCEI collects the Session Fee as your limited collection agent for this purpose only, and payment by the Client to SCEI discharges the Client’s obligation to pay you for that Homecare Session.',
    '10.2  No direct collection. You will not collect cash, accept a direct transfer, or request or accept payment of any kind from a Client outside the Platform for a Booking or for any service arising from a Booking.',
    '10.3  Platform Fee. SCEI retains a Platform Fee of fifteen (15) per cent of your Provider Rate, together with the payment processing charges set out in Annex A. The Fee Schedule states in full what is deducted and how each deduction is computed.',
    '10.4  Payouts. SCEI will remit your net earnings to the bank account and/or GCash details recorded in your account weekly, subject to a minimum payout threshold of PHP 500. You are responsible for the accuracy and currency of your payout details, and SCEI is not liable for funds remitted to details you supplied incorrectly.',
    '10.5  Taxes. SCEI will withhold creditable withholding tax on professional fees at the rate required by the National Internal Revenue Code and applicable BIR regulations, and will issue you BIR Form 2307. You are responsible for registering with the BIR, issuing invoices or official receipts where required, filing your own returns, and paying your own income tax and percentage tax or value-added tax as applicable. You will provide SCEI with your Taxpayer Identification Number and any sworn declaration required to apply the correct withholding rate.',
    '10.6  Set-off. SCEI may set off against amounts payable to you: refunds and chargebacks attributable to your act or omission; amounts payable by you under Annex A; overpayments; and any other amount you owe SCEI under these Terms. SCEI will itemise any set-off in your payout statement.',
    '10.7  Payout queries. You will raise any query on a payout within [thirty (30)] days of the payout date, after which the payout is treated as accepted, save in the case of manifest error or fraud.',
    '10.8  Changes to fees. SCEI may change the Platform Fee or the Fee Schedule on at least [thirty (30)] days’ prior notice by email and in-app. Changes apply only to Bookings confirmed on or after the effective date. If you do not accept a change, you may deactivate your account under Clause 23.1 before it takes effect.',
  ] },
  { n: '11', title: 'Refunds, Chargebacks and Client Disputes', body: [
    '11.1  Refund policy. Refunds to Clients are governed by Annex A and are administered consistently with the Consumer Act of the Philippines and Republic Act No. 11967.',
    '11.2  Redress mechanism. SCEI maintains a redress mechanism for Clients and Providers as required by Republic Act No. 11967. You will participate in it in good faith and will respond to a request for your account of events within [five (5)] business days.',
    '11.3  Allocation. Where a refund or credit is attributable to your act or omission, the amount refunded may be set off against your payouts under Clause 10.6. Where it is attributable to SCEI or to the Platform, SCEI bears it.',
    '11.4  Chargebacks. Where a Client initiates a chargeback, SCEI will notify you and you will provide the documentation needed to respond within [three (3)] business days.',
    '11.5  Clinical complaints. A complaint alleging harm, professional misconduct, or a breach of Client privacy is handled under Sections 15, 21 and 23 and under Annex B. SCEI may suspend your account for the duration of an investigation, and will tell you the substance of the allegation and give you a fair opportunity to respond.',
  ] },
  { n: '12', title: 'Non-Circumvention and Off-Platform Engagements', body: [
    '12.1  Undertaking. For [twelve (12)] months following your last Homecare Session with a Client introduced to you through Nickel, you will not solicit, arrange or accept homecare engagements from that Client, or from a member of that Client’s household, outside the Platform.',
    '12.2  What this clause does not restrict. Clause 12.1 does not apply to: a person you can show you were already serving before the introduction; services of a kind not offered through Nickel; a Client you serve in the course of your employment or clinic practice by a lawful referral not arising from the introduction; or any engagement SCEI approves in writing. Nothing in this Section restricts your right to practise your profession, to work for any employer, or to use any other platform.',
    '12.3  Remedy. Where you engage a Client in breach of Clause 12.1, SCEI may recover the Platform Fees it would have earned on the circumvented sessions, and may suspend or deactivate your account. This is without prejudice to any other remedy.',
  ] },
  { n: '13', title: 'Data Privacy and Protection of Client Information', body: [
    '13.1  Roles of the parties. For Client Personal Data processed through Nickel, SCEI is the Personal Information Controller. You process Client Information as a licensed professional exercising independent clinical judgment, and to that extent as a Personal Information Controller in your own right; where you process Client Information on SCEI’s documented instructions within the Platform, you do so as a Personal Information Processor. Both parties will comply with the Data Privacy Act of 2012 and its Implementing Rules and Regulations, DOH Administrative Order No. 2020-0030, the Health Privacy Code, and applicable NPC circulars.',
    '13.2  Health information is sensitive personal information. Client health information is sensitive personal information and forms part of the privileged communication between you and your Client. It attracts the heightened protections of Section 13 of the Data Privacy Act and the criminal penalties in Sections 25 to 32 of that Act.',
    '13.3  Your own personal data. SCEI collects and processes your name, contact details, PRC and PTR details, NBI clearance, electronic signature, payout details, location and session logs, Platform communications and Client feedback about you, in order to operate your account, verify your credentials, coordinate Bookings, effect payment, maintain safety and quality, and comply with legal obligations. The lawful bases, retention periods and disclosures are set out in Annex C. Processing follows the principles of transparency, legitimate purpose and proportionality.',
    '13.4  Your rights as a Data Subject. You may exercise your rights to be informed, to access, to object, to rectification, to erasure or blocking, to data portability, and to damages, and you may lodge a complaint with the National Privacy Commission. Requests are made to the Data Protection Officer at the address in Section 26 and are answered within the periods prescribed by the Data Privacy Act, subject to legal and retention requirements.',
    '13.5  Access limited to your own Clients. You will access, use and disclose Client Personal Data and Sensitive Personal Information only for Clients booked with you, only with their consent or on another lawful basis, and only for legitimate care purposes. You will not access the records of any Client not booked with you, and you will not access the record of a former Client after your engagement has ended except for a purpose permitted by Clause 9.2.',
    '13.6  Where Client Information may be held. You will work within the Platform. You will not screenshot, export, download, photograph, transcribe or otherwise copy Client Information, except where the Platform provides the function and the purpose is legitimate, necessary and recorded. You will not store Client Information on personal cloud storage, nor transmit it through personal messaging applications, personal email, or any channel outside the Platform.',
    '13.7  Device security. Any device on which you access the Platform must have full-disk or device encryption enabled, a screen lock, a supported and currently patched operating system, and no shared user account. You will not access the Platform on a public or shared device, and you will remove the Platform from any device you dispose of, sell or return.',
    '13.8  No secondary use. You will not use Client Information for research, publication, teaching, case presentation, marketing, or the training or evaluation of any artificial intelligence or machine learning system, without SCEI’s prior written approval and the Client’s separate documented consent.',
    '13.9  Disclosure. You will not disclose Client Information to any third party without the Client’s consent or another lawful basis, such as a court order or a disclosure required by law. Where you are compelled to disclose, you will notify SCEI before disclosing unless the law forbids you to.',
    '13.10  No delegation. You will not permit any other person, including an assistant, a transcriptionist, a colleague or a family member, to access Client Information or your Platform account.',
    '13.11  Cooperation. You will cooperate with SCEI’s privacy impact assessments, audits, security reviews, and with any NPC inquiry, and will implement the reasonable organisational, physical and technical measures SCEI specifies.',
    '13.12  Survival. The obligations in this Section survive the termination of these Terms and continue for as long as the information remains confidential or privileged.',
  ] },
  { n: '14', title: 'Confidentiality', body: [
    '14.1  Confidential Information means all Client Information, and all non-public information of SCEI disclosed to you in connection with the Platform, including fee arrangements, business plans, unreleased features, provider and client lists, and the content of investigations.',
    '14.2  Undertaking. You will keep Confidential Information strictly confidential, use it only for the purposes of these Terms, and disclose it only to a person who needs to know it for those purposes and who is bound by equivalent obligations.',
    '14.3  Exceptions. Clause 14.2 does not apply to information that is or becomes public other than through your breach, that you can show you held free of obligation before disclosure, or that you are required by law or by a competent authority to disclose, provided that you notify SCEI in advance where you are permitted to.',
    '14.4  Duration. Your obligations continue for [five (5)] years after deactivation in respect of SCEI business information, and indefinitely in respect of Client Information.',
  ] },
  { n: '15', title: 'Security Incidents and Personal Data Breach Reporting', body: [
    '15.1  Report immediately. You will report to SCEI’s Data Protection Officer, promptly and in any case within [twenty-four (24)] hours of becoming aware, any suspected or actual security incident or Personal Data Breach, including a lost or stolen device, a misdirected message, an unauthorised access or disclosure, a suspected phishing attempt, and any disclosure of Client Information outside the Platform.',
    '15.2  What to report. Your report should describe what happened, when, what information was involved, how many Clients may be affected, and what you have done. You will preserve all evidence, will not attempt your own investigation or remediation beyond securing the information, and will not notify the affected Client directly unless SCEI asks you to.',
    '15.3  SCEI’s role. SCEI leads the assessment of every reported incident and, where the Data Privacy Act and NPC Circular No. 16-03 require it, notifies the National Privacy Commission and the affected Data Subjects within seventy-two (72) hours of knowledge of the breach.',
    '15.4  Consequences. The unauthorised acquisition, access, use, disclosure or disposal of health information may result in suspension or termination of your account and in civil, criminal and administrative liability under the Data Privacy Act, in addition to any liability under professional regulatory law.',
    '15.5  Good faith reporting. SCEI will not penalise a Provider for the prompt, good-faith report of an incident the Provider caused; failing to report, or delaying a report, is treated far more seriously than the incident itself.',
  ] },
  { n: '16', title: 'Insurance', body: [
    '16.1  Professional indemnity. SCEI strongly encourages, but does not require, you to obtain and maintain professional indemnity insurance covering your practice of your profession in the Philippines, including homecare. Where you hold such cover, you will provide evidence of it on request. SCEI may make professional indemnity cover a mandatory condition of participation on reasonable prior notice.',
    '16.2  No cover by SCEI. SCEI’s own insurance does not cover you, your acts or omissions, or your property. You are responsible for insuring your own equipment and your own travel.',
  ] },
  { n: '17', title: 'Intellectual Property', body: [
    '17.1  SCEI property. SCEI owns or licenses the Platform, its software, design, databases, and the marks "Nickel", "Aura Health Rehab" and "Sapphire Clinics East", together with all related intellectual property.',
    '17.2  Licence to you. SCEI grants you a limited, revocable, non-exclusive, non-transferable and non-sublicensable licence to use the Platform for the sole purpose of offering and rendering Homecare Sessions under these Terms.',
    '17.3  Licence to SCEI. You grant SCEI a non-exclusive, royalty-free, worldwide licence to host, store, reproduce, adapt, translate and display your Provider Content for the operation, marketing and promotion of Nickel. The licence ends on deactivation of your account, save for copies retained in archives and in materials already published or distributed.',
    '17.4  Feedback. Suggestions you give SCEI about the Platform may be used freely and without obligation.',
    '17.5  Use of SCEI marks. You will not use SCEI’s marks except as the Platform provides, and will not describe yourself as an employee, agent or representative of SCEI or of Aura Health Rehab.',
  ] },
  { n: '18', title: 'Acceptable Use and Account Security', body: [
    '18.1  Your account. You may hold one provider account. You are responsible for your credentials and for all activity under your account, will not share or transfer them, will enable any multi-factor authentication SCEI offers, and will notify SCEI immediately of any unauthorised use.',
    '18.2  Prohibited conduct. You will not: scrape, crawl or extract Platform data; reverse engineer or attempt to derive the source code of the Platform; circumvent or test its security; introduce malicious code; automate access; create or accept a Booking that is not genuine; manipulate ratings or search ranking; use the Platform to market other services; or harass any user or SCEI personnel.',
    '18.3  Legal compliance. Your use of the Platform is subject to Republic Act No. 10175 (Cybercrime Prevention Act of 2012) and Republic Act No. 8792 (Electronic Commerce Act of 2000), and a breach of Clause 18.2 may constitute an offence under those laws.',
  ] },
  { n: '19', title: 'Ratings, Reviews and Feedback', body: [
    '19.1  Client reviews. Clients may rate and review Homecare Sessions. Reviews are published on your profile in accordance with SCEI’s moderation policy.',
    '19.2  Integrity. You will not solicit a review in exchange for a benefit, offer or accept any inducement for a rating, post or arrange a review of yourself or of another Provider, or retaliate against a Client who leaves an unfavourable review. Fabricated reviews are also prohibited by Republic Act No. 11967 and the Consumer Act.',
    '19.3  Moderation. SCEI will remove a review that is defamatory, discloses Client health information, or breaches these Terms, and will consider a request from you to do so, but does not undertake to remove a review merely because it is unfavourable.',
    '19.4  Effect. Ratings and completion history may affect your ranking, the Bookings offered to you, and your continued eligibility for the Platform.',
  ] },
  { n: '20', title: 'Representations and Warranties', body: [
    '20.1  You represent and warrant that: the information and documents you have given SCEI are true, complete and current; you hold a valid PRC licence and are not under suspension, revocation or any restriction you have not disclosed; there is no pending or threatened administrative, civil or criminal case against you relating to your practice or to the safety of a person in your care that you have not disclosed; you will comply with all laws applicable to your practice; and you have full capacity and authority to enter into these Terms.',
    '20.2  Non-discrimination. You will not refuse a Booking, or vary the standard of care you render, on the basis of a Client’s age, sex, gender, disability, health status, religion, ethnicity, socio-economic status or civil status. You may decline or end a session for a clinical or safety reason, which you will record in the Platform.',
    '20.3  No inducements. You will not give or receive any commission, kickback or other inducement for the referral of a Client, and will disclose to SCEI and to the Client any financial interest you hold in a product, device or service you recommend.',
  ] },
  { n: '21', title: 'Indemnity', body: [
    '21.1  By you. You will indemnify and hold harmless SCEI, its directors, officers, employees and agents against any claim, loss, liability, penalty, and reasonable cost and legal fee arising out of: your professional acts or omissions in rendering Homecare Sessions; your breach of these Terms; your breach of the Data Privacy Act or of Section 13 or 14; any tax or contribution you were required to pay and did not; and your infringement of a third party’s rights.',
    '21.2  By SCEI. SCEI will indemnify and hold you harmless against any claim, loss, liability and reasonable cost arising out of SCEI’s own gross negligence or wilful misconduct in operating the Platform, or SCEI’s breach of these Terms.',
    '21.3  Procedure. The party seeking indemnity will notify the other promptly, will not admit liability or settle without the other’s written consent, and will give reasonable cooperation. The indemnifying party may assume the defence with counsel reasonably acceptable to the other.',
  ] },
  { n: '22', title: 'Disclaimers and Limitation of Liability', body: [
    '22.1  Platform provided as is. The Platform is provided on an "as is" and "as available" basis. SCEI does not warrant that it will be uninterrupted, error-free or secure against every threat, and may modify, suspend or discontinue any feature on reasonable notice.',
    '22.2  Client-supplied information. SCEI does not verify and does not warrant the accuracy of information supplied by Clients, including health history, home conditions and access arrangements.',
    '22.3  Cap. To the fullest extent permitted by Philippine law, SCEI’s aggregate liability to you arising out of or in connection with these Terms will not exceed the total Platform Fees SCEI retained from your Bookings during the [six (6)] months immediately preceding the event giving rise to the claim.',
    '22.4  Excluded loss. Neither party is liable to the other for indirect or consequential loss, or for loss of profit, revenue, goodwill or anticipated savings, however arising.',
    '22.5  What is never limited. Nothing in these Terms limits or excludes liability for fraud, wilful misconduct, gross negligence, death or personal injury caused by negligence, or any other liability that cannot lawfully be limited, including under the Civil Code of the Philippines and the Consumer Act.',
  ] },
  { n: '23', title: 'Suspension, Deactivation and Termination', body: [
    '23.1  By you. You may deactivate your account on [fourteen (14)] days’ notice through the Platform, provided that you complete or properly hand over every confirmed Booking.',
    '23.2  By SCEI for convenience. SCEI may deactivate your account on [thirty (30)] days’ notice, and will honour Bookings already confirmed unless it is unsafe to do so.',
    '23.3  Immediate suspension or termination for cause. SCEI may suspend or deactivate your account immediately where: your PRC licence lapses, is suspended or is revoked; there is a credible allegation of harm, abuse, exploitation or a serious privacy breach; you have misrepresented a credential; you have breached these Terms and have not remedied the breach within [seven (7)] days of notice, or the breach cannot be remedied; your conduct places a Client or another person at risk; or a regulator or court directs it.',
    '23.4  Fair process. Except where immediate action is needed to protect a person, SCEI will tell you the ground for suspension, give you a reasonable opportunity to respond, consider your response, and inform you of the outcome and its reasons. A suspension pending investigation is not a finding against you.',
    '23.5  Review. You may ask SCEI to review a deactivation decision by writing to main@sapphireclinicseast.org within [fifteen (15)] days of notice of the decision. SCEI will respond within [fifteen (15)] days of receiving your request.',
    '23.6  Effect of deactivation. Your access to the Platform ends; confirmed Bookings are cancelled or reassigned; payouts for completed Homecare Sessions are released on the next payout cycle, less any set-off under Clause 10.6; and you will return or securely dispose of any Client Information in your possession.',
    '23.7  Continuity of Client care. You will not abandon a Client in the middle of an episode of care. You will complete outstanding documentation and cooperate in an orderly handover, and SCEI may use your handover notes for that purpose.',
    '23.8  Survival. Sections 9, 12, 13, 14, 15, 17, 21, 22, 26, 27 and this Clause survive the termination of these Terms.',
  ] },
  { n: '24', title: 'Changes to These Terms', body: [
    '24.1  Amendment. SCEI may amend these Terms and the Annexes. SCEI will give at least [thirty (30)] days’ prior notice of any material change, by email to the address on your account and by notice in the Platform, and will make the amended version available for review before it takes effect.',
    '24.2  Acceptance. Continuing to use the Platform on or after the effective date constitutes acceptance of the amended Terms. If you do not accept a change, you may deactivate your account under Clause 23.1 before the effective date, without penalty.',
    '24.3  Version control and evidence of acceptance. Every version of these Terms is numbered, dated and archived. SCEI records the version you accepted, the date and time of acceptance, the account used and the associated device or network identifiers, and this record is admissible as evidence of your acceptance under Republic Act No. 8792.',
  ] },
  { n: '25', title: 'Notices', body: [
    '25.1  To SCEI. Notices to SCEI are given by email to main@sapphireclinicseast.org and, where a formal notice is required, by personal delivery or registered mail to Sapphire Clinics East Incorporated, Units L4205, L4203, L4201, L4199, L4168, L4166 and L4164, 4th Floor, Robinsons Metro East, Marcos Highway, Barangay Dela Paz, 1600 City of Pasig, NCR Second District, Philippines.',
    '25.2  On privacy matters. Notices, data subject requests and breach reports on privacy matters are given to the Data Protection Officer, Jan De Asis, Sapphire Clinics East Incorporated, at jpdeasis.scei@gmail.com, copied to main@sapphireclinicseast.org.',
    '25.3  To you. Notices to you are given through the Platform and by email or SMS to the address and mobile number on your account. You are responsible for keeping them current, and a notice sent to the details on your account is treated as received.',
    '25.4  Branch offices. SCEI’s branches are Aura Health Rehab – East, Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig, telephone (02) 5310-4991; and Aura Health Rehab – Greenhills, Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City, telephone (02) 8529-1590.',
  ] },
  { n: '26', title: 'Governing Law and Dispute Resolution', body: [
    '26.1  Governing law. These Terms are governed by and construed in accordance with the laws of the Republic of the Philippines.',
    '26.2  Discussion first. The parties will first attempt in good faith to resolve any dispute through discussion, within [thirty (30)] days of written notice of the dispute.',
    '26.3  Mediation. If discussion does not resolve the dispute, the parties will refer it to mediation under Republic Act No. 9285 (the Alternative Dispute Resolution Act of 2004) before commencing court proceedings, save where urgent relief is required.',
    '26.4  Venue. Any action arising out of these Terms will be brought exclusively in the proper courts of Pasig City, to the exclusion of all other venues.',
    '26.5  Preserved forums. Nothing in this Section prevents a party from seeking injunctive or other urgent relief, or from bringing a matter before the National Privacy Commission, the Professional Regulation Commission, the Department of Trade and Industry, the Department of Labor and Employment, or any other body on which the law confers jurisdiction.',
  ] },
  { n: '27', title: 'General Provisions', body: [
    '27.1  Entire agreement. These Terms and the Annexes are the entire agreement between you and SCEI on their subject matter and supersede all prior discussions and representations, save for any fraudulent misrepresentation.',
    '27.2  Assignment. You may not assign or transfer your rights or obligations. SCEI may assign to an affiliate or to a successor in its business on notice to you.',
    '27.3  Severability. If a provision is held invalid or unenforceable, it is modified to the minimum extent necessary to make it enforceable, or if it cannot be, severed, and the rest of these Terms continue in force.',
    '27.4  No waiver. A failure or delay in exercising a right is not a waiver of it, and a single or partial exercise does not prevent further exercise.',
    '27.5  Force majeure. Neither party is liable for a failure to perform caused by an event beyond its reasonable control, including a typhoon, earthquake, flood, fire, epidemic, civil disturbance, failure of public utilities or telecommunications, or an act of government. Affected Homecare Sessions are rescheduled or refunded under Annex A.',
    '27.6  Benefit to Clients. Sections 6, 7 and 13 are stipulated in favour of Clients, who may demand their fulfilment in accordance with Article 1311 of the Civil Code of the Philippines.',
    '27.7  Language. These Terms are made in English. SCEI may make a Filipino translation available for convenience; in the event of conflict, the English version prevails.',
    '27.8  Electronic form and signature. These Terms may be accepted and executed electronically. Under Republic Act No. 8792, an electronic document and an electronic signature have the same legal effect and admissibility as their paper and manuscript equivalents.',
    '27.9  Relationship to other agreements. These Terms do not vary any separate employment, consultancy or clinic agreement between you and SCEI, and no such agreement varies these Terms.',
  ] },
]

// The Section 28 acknowledgments — also used as the required signup checkboxes.
export const ACKNOWLEDGMENTS: string[] = [
  'I have read and understood these Provider Terms of Service and the Annexes, and I agree to be bound by them.',
  'I understand that I am engaged as an independent contractor and not as an employee of Sapphire Clinics East Incorporated.',
  'I understand that client health information is sensitive personal information and privileged communication, that I may access only the records of clients booked with me, and that unauthorised access, use or disclosure may result in termination of my account and in civil, criminal and administrative liability.',
  'I consent to the Company collecting and processing my personal information, and verifying my credentials, as described in Section 13 and Annex C.',
  'The information and documents I have submitted are true, complete and current.',
]

// Renders any remaining [●] blank as a subtly highlighted marker so unfilled
// business/legal blanks stay honestly visible; the square brackets around
// agreed default values (e.g. "[fifteen (15)] days") are stripped so they read
// as final text rather than placeholders.
function stripBrackets(s: string): string { return s.replace(/[[\]]/g, '') }
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

export function ProviderTermsBody() {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed text-[color:var(--slate)]">
      <p className="text-[13px] font-semibold text-[color:var(--ink)]">Sapphire Clinics East Incorporated · Nickel — Provider Terms of Service</p>
      <p className="text-[color:var(--muted)]">Version {TERMS_VERSION} · {TERMS_EFFECTIVE}</p>
      <p className="font-semibold text-[color:var(--ink)]">IMPORTANT — PLEASE READ BEFORE CREATING A PROVIDER ACCOUNT</p>
      {INTRO.map((p, i) => <p key={`intro-${i}`}>{withBlanks(p, `intro-${i}`)}</p>)}

      {SECTIONS.map((s) => (
        <div key={s.n} className="pt-1">
          <p className="mt-2 text-[12.5px] font-semibold text-[color:var(--ink)]">{s.n}.  {s.title}</p>
          {s.body.map((c, i) => <p key={`${s.n}-${i}`} className={c.startsWith('(') ? 'pl-4' : ''}>{withBlanks(c, `${s.n}-${i}`)}</p>)}
        </div>
      ))}

      <div className="pt-1">
        <p className="mt-2 text-[12.5px] font-semibold text-[color:var(--ink)]">28.  Acknowledgment and Acceptance</p>
        <p>By ticking the boxes below and submitting your registration, you confirm each of the following:</p>
        {ACKNOWLEDGMENTS.map((a, i) => <p key={`ack-${i}`} className="pl-4">({'abcde'[i]})  {a}</p>)}
      </div>
    </div>
  )
}
