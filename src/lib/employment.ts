// Employment classification, resolved for the branch you are looking at.
//
// A person can hold one profile and a different classification per branch — the
// Staff Module has let an admin set that for a while (employmentByBranch), and
// HR sends its own per-branch view (branchEmployment). Reading the staff-level
// employmentType alone gets the wrong answer for anyone interbranch, so
// everything that cares should go through here.
//
// Precedence, most specific first:
//   1. employmentByBranch[branch] — set in Operations, deliberately never
//      overwritten by the HR sync, so it wins.
//   2. branchEmployment[branch].employmentType — HR's per-branch value.
//   3. employmentType — HR's staff-level value; the answer for most people.

/** HR slug for a clinician who rents the facility rather than being paid by us. */
export const RENTER = 'renter'

/** The shape this module needs. Deliberately loose so callers can pass a
 *  Prisma row, an API DTO, or a client-side object without casting. */
export interface EmploymentBearing {
  employmentType?: string | null
  employmentByBranch?: unknown
  branchEmployment?: unknown
}

function branchMap(value: unknown): Record<string, unknown> | null {
  // Prisma Json columns arrive as unknown and can legitimately be null, a
  // string, or an array; only a plain object is usable here.
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * The classification that applies at `branch`, lowercased, or null if untagged.
 * Pass no branch to get the staff-level value.
 */
export function employmentTypeFor(
  staff: EmploymentBearing | null | undefined,
  branch?: string | null,
): string | null {
  if (!staff) return null

  if (branch) {
    const override = branchMap(staff.employmentByBranch)?.[branch]
    if (typeof override === 'string' && override.trim()) return override.trim().toLowerCase()

    const hr = branchMap(staff.branchEmployment)?.[branch]
    const hrType = branchMap(hr)?.employmentType
    if (typeof hrType === 'string' && hrType.trim()) return hrType.trim().toLowerCase()
  }

  const base = staff.employmentType
  return typeof base === 'string' && base.trim() ? base.trim().toLowerCase() : null
}

/**
 * Is this clinician a renter at this branch?
 *
 * Renters bring their own private clients and pay us a monthly facility fee, so
 * the clinic does not own the relationship with those patients: we schedule the
 * room, and the clinician handles their own reminders. Sending on their behalf
 * would be messaging somebody else's clients under our name.
 *
 * Untagged (null) is NOT a renter. Most of the roster carries no classification
 * at all, and defaulting the other way would silently switch off reminders for
 * a large part of the clinic.
 */
export function isRenter(
  staff: EmploymentBearing | null | undefined,
  branch?: string | null,
): boolean {
  return employmentTypeFor(staff, branch) === RENTER
}

/** Why the notify buttons are off — one sentence, shown to front desk. */
export const RENTER_NOTIFY_REASON =
  'Renters manage their own private clients, so reminders are not sent from the clinic.'
