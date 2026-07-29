/**
 * Who is what, at which branch.
 *
 * Someone can be a consultant at one branch and an employee at another, which the single
 * `employmentType` on a staff record can't express. Two fields carry the detail:
 *
 *   branchEmployment    — synced from HR, the richer shape
 *                         { SBEA: { employmentType, employeeId, department, jobTitle }, … }
 *   employmentByBranch  — a plain { SBEA: 'consultant' } override owned by Operations,
 *                         for cases HR doesn't (or can't) describe
 *
 * Both are read here so neither system has to be the only source, and the Operations
 * override wins where it is set. Returns lowercase 'employee' | 'consultant' per branch.
 */

export type BranchRoles = Record<string, 'employee' | 'consultant'>

const normalise = (v: unknown): 'employee' | 'consultant' | null => {
  const t = String(v || '').trim().toLowerCase()
  return t === 'employee' || t === 'consultant' ? t : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function branchRolesOf(staff: any): BranchRoles {
  const out: BranchRoles = {}

  // HR's per-branch detail.
  const hr = staff?.branchEmployment
  if (hr && typeof hr === 'object') {
    for (const [branch, detail] of Object.entries(hr as Record<string, unknown>)) {
      const t = normalise((detail as { employmentType?: unknown } | null)?.employmentType)
      if (t) out[branch] = t
    }
  }

  // Operations override — last word.
  const ops = staff?.employmentByBranch
  if (ops && typeof ops === 'object') {
    for (const [branch, value] of Object.entries(ops as Record<string, unknown>)) {
      const t = normalise(value)
      if (t) out[branch] = t
    }
  }

  return out
}

/** Branches where this person is a consultant. */
export const consultantBranchesOf = (staff: unknown): string[] =>
  Object.entries(branchRolesOf(staff)).filter(([, t]) => t === 'consultant').map(([b]) => b)

/** Branches where this person is an employee. */
export const employeeBranchesOf = (staff: unknown): string[] =>
  Object.entries(branchRolesOf(staff)).filter(([, t]) => t === 'employee').map(([b]) => b)
