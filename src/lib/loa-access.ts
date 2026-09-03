// Who may read which LOA submissions.
//
// Front desk sees their own branch and nobody else's. That is enforced here and
// applied inside the route's `where`, not by hiding a dropdown: the branch a
// client sends is a request, not a permission, and a branch account can call
// the API directly. Same reasoning as @/lib/role-branch, which this builds on.

import { branchForRole } from '@/lib/role-branch'

export const LOA_READ_ROLES = [
  'ADMIN', 'MARKETING_ADMIN',
  'AHEA_ADMIN', 'AHGH_ADMIN',
  'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK',
]

export const LOA_WRITE_ROLES = [
  'ADMIN', 'MARKETING_ADMIN',
  'AHEA_ADMIN', 'AHGH_ADMIN',
  // Front desk raise the letters and chase the uploads — that is the whole job,
  // so they write as well as read. They are still pinned to their own branch.
  'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK',
]

/**
 * The branch filter to apply for this role, given what the client asked for.
 *
 * Returns a value for `where.branch`:
 *   - a locked short code   → this role may see only that branch
 *   - the requested branch  → unrestricted role that chose a filter
 *   - undefined             → unrestricted role viewing everything
 *
 * `forced` says whether the caller had a choice, so the UI can render the
 * branch control as a fixed label instead of a dropdown that does nothing.
 */
export function loaBranchScope(
  role: string | null | undefined,
  requested: string | null | undefined,
): { branch: string | undefined; forced: boolean } {
  const locked = branchForRole(role)
  if (locked) return { branch: locked, forced: true }
  return { branch: requested?.trim() || undefined, forced: false }
}
