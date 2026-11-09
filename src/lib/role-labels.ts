// How a role is written for people.
//
// The role is stored as an enum — AHEA_FRONT_DESK — and that string was being
// printed straight onto the top bar under the user's name. It reads as a
// system fault to anybody who did not write it, and front desk see it on every
// screen, all day.
//
// Settings → Users already had this map. It lives here now so the two cannot
// drift: a role added in one place and not the other is how an account ends up
// labelled one way on its own profile and another way in the corner of every
// page.

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MARKETING_ADMIN: 'Marketing Admin',
  AHEA_ADMIN: 'Aura Health East — Admin',
  AHGH_ADMIN: 'Aura Health Greenhills — Admin',
  VERDANA_ADMIN: 'Verdana Admin',
  AHEA_FRONT_DESK: 'Front Desk — Aura Health East',
  AHGH_FRONT_DESK: 'Front Desk — Aura Health Greenhills',
  INVESTOR: 'Investor (read-only)',
  MEDREP: 'Medical Representative',
}

/**
 * Falls back to the raw value rather than to something invented.
 *
 * A role this map has not been taught is still better shown as itself than as
 * "Staff": the person reading it can at least report what it says.
 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS[role] ?? role
}
