// Who may read enquiries.
//
// Enquiry threads carry a member of the public's name, contact details and
// whatever they chose to tell us about their child — the same class of content
// as the patient CRM. /api/inquiries only checked that someone was signed in,
// which let every role in the Hub read them, including Investor (explicitly
// read-only and barred from patient identities elsewhere) and Marketing Admin.
//
// Front desk and the people who run the branches. Nobody else.
export const INQUIRY_ROLES = [
  'ADMIN',
  'AHEA_ADMIN', 'AHGH_ADMIN',
  'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK',
]

export function canUseInquiries(role: string | null | undefined): boolean {
  return !!role && INQUIRY_ROLES.includes(role)
}
