// Branch scoping for users assigned to a single branch.
// User.branch is stored in enum form: ALL | SANDBOX_EAST | SANDBOX_GREENHILLS | VERDANA_STORE.
// A user whose branch is a specific branch (not ALL) only sees that branch's data in
// branch-scoped modules (petty cash, expenses, payroll, inventory, AR, etc.).
// EXCEPT Bank Reconciliation and Fund Transfer, which always show all branches/accounts.

export const BRANCH_ENUM_TO_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'SBEA',
  SANDBOX_GREENHILLS: 'SBGH',
  VERDANA_STORE: 'VERDANA',
}

export interface BranchScope {
  locked: boolean
  enum: string | null   // e.g. 'SANDBOX_EAST' (petty cash / expenses / inventory form)
  short: string | null  // e.g. 'SBEA' (payroll / short-code modules)
}

/** Client-side: derive the branch a user is locked to from their session branch. */
export function userBranchScope(userBranch: string | null | undefined): BranchScope {
  const locked = !!userBranch && userBranch !== 'ALL'
  return {
    locked,
    enum: locked ? userBranch! : null,
    short: locked ? (BRANCH_ENUM_TO_SHORT[userBranch!] || userBranch!) : null,
  }
}

/**
 * Server-side guard: given the session user's branch and a requested branch, return the
 * branch the request is allowed to act on. If the user is scoped to one branch, any
 * request is forced to that branch (both enum and short-code forms accepted).
 * Returns null when unrestricted (branch=ALL or unset).
 */
export function enforceBranch(userBranch: string | null | undefined): string | null {
  if (!userBranch || userBranch === 'ALL') return null
  return userBranch
}

/** True if a requested branch value (enum or short) is within the user's scope. */
export function branchAllowed(userBranch: string | null | undefined, requested: string): boolean {
  if (!userBranch || userBranch === 'ALL') return true
  const short = BRANCH_ENUM_TO_SHORT[userBranch] || userBranch
  return requested === userBranch || requested === short
}

// Branches that East/Greenhills accountants & bookkeepers may VIEW (read-only)
// in Petty Cash, in addition to their own branch: the CEO and Verdana sections.
export const PETTY_CASH_VIEW_ONLY_BRANCHES = ['CEO', 'VERDANA_STORE']

/**
 * True if the user is an Accountant or Bookkeeper locked to the East or Greenhills
 * branch — these users get read-only visibility into the CEO and Verdana petty-cash
 * sections (but cannot create, edit, delete, or audit them).
 */
export function canViewPettyCashCeoVerdana(
  role: string | null | undefined,
  userBranch: string | null | undefined,
): boolean {
  return (role === 'ACCOUNTANT' || role === 'BOOKKEEPER')
    && (userBranch === 'SANDBOX_EAST' || userBranch === 'SANDBOX_GREENHILLS')
}
