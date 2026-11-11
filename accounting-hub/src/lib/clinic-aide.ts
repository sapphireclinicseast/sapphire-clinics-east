// Clinic Aide (Hannah 2026-11-11): a sign-in that sees ONLY Asset Management, view-only.
// - Sidebar: the Asset Management link and nothing else.
// - Any other page sends them to Asset Management (DashboardShell); /dashboard too.
// - Global search is off for them (UI hidden, /api/search answers nothing).
// - The asset list is limited to the branch on their account (when one is set).
// - Writes stay closed: no asset API write role includes CLINIC_AIDE.
export const CLINIC_AIDE = 'CLINIC_AIDE'
export const CLINIC_AIDE_HOME = '/asset-management'

export const isClinicAide = (role?: string | null) => role === CLINIC_AIDE

/** Pages a clinic aide may open. */
export const clinicAideMayOpen = (pathname: string) =>
  pathname === CLINIC_AIDE_HOME || pathname.startsWith(`${CLINIC_AIDE_HOME}/`)
