// Friendly display labels for the internal Branch enum keys (kept as SANDBOX_* for
// historical reasons; NEVER rename the keys — only the labels). Used wherever a
// branch is shown to users.
const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'Aura Health East',
  SANDBOX_GREENHILLS: 'Aura Health Greenhills',
  VERDANA_STORE: 'Verdana',
  AURA_INSTITUTE: 'Aura Health Institute',
  ALL: 'All Branches',
}

export function branchLabel(branch?: string | null): string {
  if (!branch) return '—'
  return BRANCH_LABELS[branch] ?? branch
}

// Which branch a bank account belongs to, read off its title. Bank accounts are
// named by the branch that holds them — "AHEA BDO Checking Account",
// "AHGH Petty Cash on Hand", "VER AUB Checking Account" — so the title is the
// authority; there is no branch column on Account.
//
// Returns 'ALL' for the company-wide accounts (SCEI / SCI), where the branch
// genuinely cannot be inferred and the caller should let a human choose.
//
// This matters because the reports engine filters journal entries by branch
// (src/lib/reports/v2/engine.ts), so an entry left on 'ALL' shows up only in
// the All Branches view and is invisible on every per-branch statement.
// The branch keys an entry may actually be posted under. Used to vet a branch
// that arrived from a client before it reaches a journal entry.
export const POSTABLE_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE', 'ALL'] as const

export function isPostableBranch(branch?: string | null): boolean {
  return !!branch && (POSTABLE_BRANCHES as readonly string[]).includes(branch)
}

export function branchForBankAccount(accountTitle?: string | null): string {
  const t = (accountTitle || '').trim().toUpperCase()
  if (/^AHEA\b/.test(t)) return 'SANDBOX_EAST'
  if (/^AHGH\b/.test(t)) return 'SANDBOX_GREENHILLS'
  if (/^VER\b/.test(t)) return 'VERDANA_STORE'
  return 'ALL'
}
