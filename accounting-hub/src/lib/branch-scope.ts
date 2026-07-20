// Branch scoping for users assigned to a single branch.
// User.branch is stored in enum form: ALL | SANDBOX_EAST | SANDBOX_GREENHILLS | VERDANA_STORE.
// A user whose branch is a specific branch (not ALL) only sees that branch's data in
// branch-scoped modules (petty cash, expenses, payroll, inventory, AR, etc.).
// EXCEPT Bank Reconciliation and Fund Transfer, which always show all branches/accounts.

export const BRANCH_ENUM_TO_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'SBEA',
  SANDBOX_GREENHILLS: 'SBGH',
  VERDANA_STORE: 'VERDANA',
  AURA_INSTITUTE: 'AHI',
}

export interface BranchScope {
  locked: boolean       // true only when the user is confined to exactly ONE branch
  enum: string | null   // e.g. 'SANDBOX_EAST' (petty cash / expenses / inventory form) — set only when locked
  short: string | null  // e.g. 'SBEA' (payroll / short-code modules) — set only when locked
  allowed: string[]     // the full set of enum branches the user may access ([] = all branches)
}

/**
 * The set of branches a user may access. Multi-branch `branches[]` takes precedence;
 * otherwise fall back to the legacy single `branch`. Empty result = unrestricted (all).
 */
export function effectiveBranches(
  userBranch: string | null | undefined,
  userBranches?: string[] | null,
): string[] {
  const multi = (userBranches || []).filter(b => b && b !== 'ALL')
  if (multi.length) return multi
  if (userBranch && userBranch !== 'ALL') return [userBranch]
  return []
}

/** Client-side: derive the branch scope from the user's session branch(es). */
export function userBranchScope(
  userBranch: string | null | undefined,
  userBranches?: string[] | null,
): BranchScope {
  const allowed = effectiveBranches(userBranch, userBranches)
  const locked = allowed.length === 1
  return {
    locked,
    enum: locked ? allowed[0] : null,
    short: locked ? (BRANCH_ENUM_TO_SHORT[allowed[0]] || allowed[0]) : null,
    allowed,
  }
}

/**
 * Server-side guard: return the branch a request is allowed to act on.
 * - Unrestricted (no branch set) → null (caller uses the requested branch as-is).
 * - Single branch → that branch is forced, ignoring `requested`.
 * - Multiple branches → the `requested` branch if it is one of the user's, else their first.
 * Legacy callers that pass only `userBranch` keep the original single-branch behaviour.
 */
export function enforceBranch(
  userBranch: string | null | undefined,
  userBranches?: string[] | null,
  requested?: string | null,
): string | null {
  const allowed = effectiveBranches(userBranch, userBranches)
  if (allowed.length === 0) return null
  if (allowed.length === 1) return allowed[0]
  if (requested && allowed.includes(requested)) return requested
  return allowed[0]
}

/** True if a requested branch value (enum or short) is within the user's scope. */
export function branchAllowed(
  userBranch: string | null | undefined,
  requested: string,
  userBranches?: string[] | null,
): boolean {
  const allowed = effectiveBranches(userBranch, userBranches)
  if (allowed.length === 0) return true
  return allowed.some(b => requested === b || requested === (BRANCH_ENUM_TO_SHORT[b] || b))
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
