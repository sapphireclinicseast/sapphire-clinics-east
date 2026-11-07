// CEO petty cash: what each branch carries of an entry (branchAllocations).
// The RFP pays these shares and the Income Statement posts them, so a share left
// behind when Gross changes spends real money. Two October 2026 rows were paid
// ₱9,654.44 too much that way (found 2026-11-07).

export interface BranchShare {
  branch: string
  amount: number
}

/**
 * The shares a row should hold once Gross changes, or null to leave them alone.
 *
 * A row charged to one branch carries the whole entry, so its share follows
 * Gross. A split across branches is someone's decision and can't be redone from
 * the new total alone, so it stays as it is and the grid's red total flags it.
 */
export function sharesAfterGrossChange(shares: unknown, gross: number): BranchShare[] | null {
  if (!Array.isArray(shares) || shares.length !== 1) return null
  const only = shares[0] as { branch?: unknown; amount?: unknown } | null
  if (!only || typeof only.branch !== 'string' || !only.branch) return null
  if (Number(only.amount) === gross) return null
  return [{ branch: only.branch, amount: gross }]
}
