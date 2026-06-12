// Fixed section presets by account type. Each preset is the list of sidebar
// hrefs that account can see. ADMIN-role accounts bypass this and see all.
//
// CLINICIAN keeps the full clinical sidebar (plus the new Peers-Love wall).
// FRONT_DESK / ADMIN_STAFF are the limited "employee" presets requested:
//   - Front desk additionally gets "What Patients Love About You".
//   - Both get Peers-Love, Seminars, Templates, Manuals, Directory,
//     Wellness Check and Payroll — but NOT the clinical pages.

export type AccountType = 'CLINICIAN' | 'FRONT_DESK' | 'ADMIN_STAFF' | 'ADMIN'

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
  '/settings',
]

const PRESETS: Record<'CLINICIAN' | 'FRONT_DESK' | 'ADMIN_STAFF', string[]> = {
  CLINICIAN: [
    '/', '/clinic-schedule', '/patients', '/patients-love', '/peers-love',
    '/seminars', '/templates', '/manuals', '/directory', '/wellness-check',
    '/payroll', '/settings',
  ],
  FRONT_DESK: [
    '/patients-love', '/peers-love', '/seminars', '/templates', '/manuals',
    '/directory', '/wellness-check', '/payroll',
  ],
  ADMIN_STAFF: [
    '/peers-love', '/seminars', '/templates', '/manuals',
    '/directory', '/wellness-check', '/payroll',
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
  return PRESETS.CLINICIAN
}

// Where a limited account should land instead of the clinical dashboard ("/").
export function homeSection(role?: string, accountType?: string): string {
  const allowed = allowedSections(role, accountType)
  return allowed.includes('/') ? '/' : (allowed[0] ?? '/settings')
}
