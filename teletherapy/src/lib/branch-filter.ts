import { Prisma, Branch } from '@prisma/client'

/**
 * Interbranch (multi-branch) consultant helpers.
 *
 * A consultant can work at more than one branch. Two data shapes exist:
 *   • NEW  — one merged Staff row with extraBranches[] (all schedules under
 *            a single staffId; a session's branch = its patient's branch).
 *   • LEGACY — the same email maps to one Staff row per branch (distinct
 *            staffIds). Those are filtered by staffId and never reach the
 *            patient-branch filters below.
 *
 * These helpers implement the NEW model's branch filtering, mirroring the
 * ops hub (`src/app/api/clinic-schedule`): scope by the PATIENT's branch.
 */

/**
 * Staff short branch codes (SBEA/SBGH — as stored on Staff.branch and
 * Staff.extraBranches) → the Patient.branch enum. Accepts either form so
 * callers can pass whatever the switcher hands them.
 */
const TO_PATIENT_BRANCH: Record<string, Branch> = {
  SBEA: Branch.SANDBOX_EAST,
  SBGH: Branch.SANDBOX_GREENHILLS,
  SANDBOX_EAST: Branch.SANDBOX_EAST,
  SANDBOX_GREENHILLS: Branch.SANDBOX_GREENHILLS,
}

export function toPatientBranch(code?: string | null): Branch | null {
  if (!code) return null
  return TO_PATIENT_BRANCH[code] ?? null
}

/** True when two codes name the same branch, in either short or long form. */
export function sameBranch(a?: string | null, b?: string | null): boolean {
  const pa = toPatientBranch(a)
  return !!pa && pa === toPatientBranch(b)
}

/**
 * Prisma `where` fragment scoping a Schedule query to one branch of an
 * interbranch consultant. A session's branch is its PATIENT's branch. The
 * consultant's PRIMARY branch also owns any session whose patient has no
 * branch set, or that has no patient at all — so none of their sessions
 * vanish when a branch is selected. Non-primary ("extra") branches match
 * strictly. Returns {} when the code can't be mapped (caller then doesn't
 * filter).
 */
export function scheduleBranchWhere(
  patientBranch: string,
  primaryBranch: string,
): Prisma.ScheduleWhereInput {
  const target = toPatientBranch(patientBranch)
  if (!target) return {}
  if (sameBranch(patientBranch, primaryBranch)) {
    return { OR: [{ patient: { branch: target } }, { patient: { branch: null } }, { patientId: null }] }
  }
  return { patient: { branch: target } }
}

/**
 * Same idea as a Patient-level filter, for querying patients / assignments
 * directly. The primary branch also matches patients with no branch set.
 */
export function patientBranchWhere(
  patientBranch: string,
  primaryBranch: string,
): Prisma.PatientWhereInput {
  const target = toPatientBranch(patientBranch)
  if (!target) return {}
  if (sameBranch(patientBranch, primaryBranch)) {
    return { OR: [{ branch: target }, { branch: null }] }
  }
  return { branch: target }
}
