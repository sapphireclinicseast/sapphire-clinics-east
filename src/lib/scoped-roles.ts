// Roles that see a deliberately small slice of the Hub.
//
// Investor came first and its gate lived inline in (dashboard)/layout.tsx.
// Medical Representative is the second such role, so the rule moved here
// rather than being copied: one place that says which paths a scoped role may
// reach and where it lands, read by the route gate, the sidebar, the login
// redirect and the /dashboard bounce. Copying it would have meant four places
// to keep in step, and the one that drifted would be a permissions hole.
//
// Everything NOT listed here is unscoped and sees the Hub as before.

export interface ScopedRole {
  /** Human label, used in Settings → Team. */
  label: string
  /** One-line description shown beside the option. */
  hint: string
  /**
   * PREFIX matches. A prefix opens that path and everything beneath it, so
   * keep them as specific as the module allows — '/customer-satisfaction' is
   * its own top-level route precisely because '/customer-survey' would have
   * handed over the whole admin survey module.
   */
  prefixes: string[]
  /** Where the role lands on sign-in, and where an out-of-scope path bounces to. */
  home: string
}

export const SCOPED_ROLES: Record<string, ScopedRole> = {
  INVESTOR: {
    label: 'Investor (read-only)',
    hint: 'Investor — Patient Dashboard only, read-only',
    prefixes: ['/patients/dashboard', '/customer-satisfaction'],
    home: '/patients/dashboard',
  },
  MEDREP: {
    label: 'Medical Representative',
    hint: 'Medical Representative — registrations, patient relationships, partners',
    // Registration Forms, Patient Relationship, Partner Institutions and the
    // handbook. Note '/patient-relationship' does NOT open '/patients' — they
    // are separate top-level routes, so a MedRep cannot reach the patient CRM.
    prefixes: ['/registration-forms', '/patient-relationship', '/partner-institutions', '/handbook'],
    home: '/registration-forms',
  },
}

/** Is this role scoped to a subset of the Hub? */
export function isScopedRole(role: string | null | undefined): boolean {
  return !!role && role in SCOPED_ROLES
}

/** The scope for this role, or null when the role sees everything. */
export function scopeFor(role: string | null | undefined): ScopedRole | null {
  return (role && SCOPED_ROLES[role]) || null
}

/**
 * May this role open this path?
 *
 * Unscoped roles get true. An empty pathname also gets true, deliberately:
 * the caller reads the path from a middleware-set header, and if that header
 * ever goes missing every request — including the role's own home — would
 * redirect to home, which re-renders the same layout with the same missing
 * header and redirects again. That loop is what rendered as a permanently
 * blank page for investor accounts. Only redirect on positive evidence of an
 * out-of-scope path, never on not knowing.
 */
export function pathAllowedForRole(role: string | null | undefined, pathname: string): boolean {
  // Admin-only paths are checked FIRST, because the rest of this function is
  // about roles that see LESS than everything, and these paths are the
  // opposite case: a page that even a full branch admin may not open.
  if (pathname && isAdminOnlyPath(pathname) && role !== 'ADMIN') return false

  const scope = scopeFor(role)
  if (!scope) return true
  if (!pathname) return true
  return scope.prefixes.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Paths only the main admin account may open.
 *
 * The inverse of SCOPED_ROLES. Those describe roles that see a slice of the
 * Hub; this describes a page that is closed to everyone EXCEPT the top role,
 * including MARKETING_ADMIN and the branch admins, who otherwise see all of
 * it.
 *
 * /awards ranks named colleagues against each other and names everyone who did
 * not qualify. That is the whole point of the page and also the reason it is
 * not for general circulation — it is a management view, and it reads very
 * differently to the person ranked eleventh.
 *
 * ADMIN is one account today (main@). If a second is ever created it will see
 * this too, which is the right behaviour for a role that already grants
 * everything else; pin it to an address here if that stops being true.
 */
export const ADMIN_ONLY_PREFIXES = ['/awards'] as const

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}
