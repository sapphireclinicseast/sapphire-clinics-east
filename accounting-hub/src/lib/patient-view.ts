/**
 * Branches that have a patient-facing tablet, and the codes each upstream
 * system knows them by.
 *
 * The slug is what goes in the URL, so a tablet is set up once by typing a
 * readable address and never touched again. Keep the slugs stable: changing one
 * silently breaks a device nobody is watching.
 */

export interface PatientViewBranch {
  slug: string
  /** Accounting Hub branch enum. */
  branch: string
  /** Operations Hub / survey branch code. */
  surveyCode: string
  name: string
  shortName: string
}

export const PATIENT_VIEW_BRANCHES: PatientViewBranch[] = [
  {
    slug: 'east',
    branch: 'SANDBOX_EAST',
    surveyCode: 'SBEA',
    name: 'Aura Health Rehab — East',
    shortName: 'East Branch',
  },
  {
    slug: 'greenhills',
    branch: 'SANDBOX_GREENHILLS',
    surveyCode: 'SBGH',
    name: 'Aura Health Rehab — Greenhills',
    shortName: 'Greenhills Branch',
  },
]

/** Resolve a URL slug, or an accounting branch enum, to its config. */
export function resolvePatientViewBranch(v: string | undefined | null): PatientViewBranch | null {
  if (!v) return null
  const key = String(v).trim().toLowerCase()
  return (
    PATIENT_VIEW_BRANCHES.find(b => b.slug === key) ??
    PATIENT_VIEW_BRANCHES.find(b => b.branch.toLowerCase() === key) ??
    PATIENT_VIEW_BRANCHES.find(b => b.surveyCode.toLowerCase() === key) ??
    null
  )
}

/** The patient-facing address for a branch, used by the staff-side button. */
export function patientViewPath(branchEnum: string): string | null {
  const b = resolvePatientViewBranch(branchEnum)
  return b ? `/patient/${b.slug}` : null
}

/**
 * Both of these are owned elsewhere and simply linked to. Rewards in particular
 * already has a public page — re-implementing the lookup here would have meant
 * a second, publicly reachable copy of cardholder balances to keep in step.
 */
export const COMPLAINT_FORM_URL = 'https://hr.sapphireclinicseast.org/patient-complaint-form.html'
export const REWARD_POINTS_URL = 'https://sapphireclinicseast.org/reward-points/'
