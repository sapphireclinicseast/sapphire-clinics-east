// Fixed section presets by account type. Each preset is the list of sidebar
// hrefs that account can see. ADMIN-role accounts bypass this and see all.
//
// CLINICIAN keeps the full clinical sidebar (plus the new Peers-Love wall).
// FRONT_DESK / ADMIN_STAFF are the limited "employee" presets requested:
//   - Front desk additionally gets "What Patients Love About You".
//   - Both get Peers-Love, Seminars, Templates, Manuals, Directory,
//     Wellness Check and Payroll — but NOT the clinical pages.

// INTERN gets the same sections as a CLINICIAN (falls through to the default
// preset in allowedSections). What sets interns apart is enforced elsewhere:
// they cannot send session notes / IE reports to patients (only their
// supervisor can), and their notes route to the session's supervisor.
export type AccountType = 'CLINICIAN' | 'FRONT_DESK' | 'ADMIN_STAFF' | 'ADMIN' | 'INTERN'

// Every section href the app knows about (admins see this full set).
export const ALL_SECTIONS = [
  '/',
  '/clinic-schedule',
  '/patients',
  '/patients-love',
  '/peers-love',
  '/seminars',
  '/templates',
  '/manuals',
  '/directory',
  '/wellness-check',
  '/payroll',
  '/loans-perks',
  '/intern-supervision',
  '/mentorship',
  '/balik-tanaw',
  '/settings',
]

// Every account type sees the Loans & Perks section (the BDO Loan calculator
// is available to everyone). The employees-only "Company Loan" subsection is
// gated inside the page by employmentType, not by the section preset.
const PRESETS: Record<'CLINICIAN' | 'FRONT_DESK' | 'ADMIN_STAFF' | 'INTERN', string[]> = {
  // Clinicians can supervise interns and mentor — the sections show a
  // "no active supervision/mentorship" descriptor unless they actually have some.
  CLINICIAN: [
    '/', '/clinic-schedule', '/patients', '/patients-love', '/peers-love',
    '/seminars', '/templates', '/manuals', '/directory', '/wellness-check',
    '/payroll', '/loans-perks', '/intern-supervision', '/mentorship', '/settings',
  ],
  // Interns get the clinical pages plus their own Balik-Tanaw submission section,
  // but not the supervisor-facing Intern Supervision / Mentorship sections.
  INTERN: [
    '/', '/clinic-schedule', '/patients', '/patients-love', '/peers-love',
    '/seminars', '/templates', '/manuals', '/directory', '/wellness-check',
    '/payroll', '/loans-perks', '/balik-tanaw', '/settings',
  ],
  FRONT_DESK: [
    '/patients-love', '/peers-love', '/seminars', '/templates', '/manuals',
    '/directory', '/wellness-check', '/payroll', '/loans-perks',
  ],
  ADMIN_STAFF: [
    '/peers-love', '/seminars', '/templates', '/manuals',
    '/directory', '/wellness-check', '/payroll', '/loans-perks',
  ],
}

// Limited presets that should see ALL-department templates/manuals (not the
// clinician's department-scoped view).
export const ALL_DEPARTMENT_TYPES: AccountType[] = ['FRONT_DESK', 'ADMIN_STAFF']

export function isLimitedType(accountType?: string): boolean {
  return accountType === 'FRONT_DESK' || accountType === 'ADMIN_STAFF'
}

// The set of hrefs an account may see (excludes /admin, added separately for admins).
export function allowedSections(role?: string, accountType?: string): string[] {
  if (role === 'ADMIN') return ALL_SECTIONS
  if (accountType === 'FRONT_DESK') return PRESETS.FRONT_DESK
  if (accountType === 'ADMIN_STAFF') return PRESETS.ADMIN_STAFF
  if (accountType === 'INTERN') return PRESETS.INTERN
  return PRESETS.CLINICIAN
}

// Where a limited account should land instead of the clinical dashboard ("/").
export function homeSection(role?: string, accountType?: string): string {
  const allowed = allowedSections(role, accountType)
  return allowed.includes('/') ? '/' : (allowed[0] ?? '/settings')
}
