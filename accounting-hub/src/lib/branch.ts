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

// Short names for tables, pickers, file names and messages. Hannah (11/10): the
// word "Sandbox" must never reach a screen, a download or a message, so show
// these instead of the raw SANDBOX_* keys.
const BRANCH_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'East',
  SANDBOX_GREENHILLS: 'Greenhills',
  VERDANA_STORE: 'Verdana',
  VERDANA: 'Verdana',
  AURA_INSTITUTE: 'Aura Health Institute',
  ALL: 'All branches',
  CEO: 'CEO',
}

export function branchShort(branch?: string | null): string {
  if (!branch) return '—'
  return BRANCH_SHORT[branch] ?? branch.replace(/^SANDBOX[_ ]?/i, '')
}

// Branch name for a download's file name: "East", "Greenhills", "All-branches".
export function branchFileTag(branch?: string | null): string {
  return branchShort(branch || 'ALL').replace(/\s+/g, '-')
}

// What a person may type for a branch in an upload (CSV/XLSX): the short name,
// the AHEA/AHGH/VER prefixes, or the internal key. Unknown text comes back
// trimmed so the caller's own check still flags it.
const BRANCH_INPUT: Record<string, string> = {
  EAST: 'SANDBOX_EAST', AHEA: 'SANDBOX_EAST', SBEA: 'SANDBOX_EAST', AURAEAST: 'SANDBOX_EAST', AURAHEALTHEAST: 'SANDBOX_EAST', SANDBOXEAST: 'SANDBOX_EAST',
  GREENHILLS: 'SANDBOX_GREENHILLS', GH: 'SANDBOX_GREENHILLS', AHGH: 'SANDBOX_GREENHILLS', SBGH: 'SANDBOX_GREENHILLS', AURAGREENHILLS: 'SANDBOX_GREENHILLS', AURAHEALTHGREENHILLS: 'SANDBOX_GREENHILLS', SANDBOXGREENHILLS: 'SANDBOX_GREENHILLS',
  VERDANA: 'VERDANA_STORE', VER: 'VERDANA_STORE', VERDANASTORE: 'VERDANA_STORE',
  INSTITUTE: 'AURA_INSTITUTE', AHI: 'AURA_INSTITUTE', AURAINSTITUTE: 'AURA_INSTITUTE', AURAHEALTHINSTITUTE: 'AURA_INSTITUTE',
}

export function branchFromInput(text?: string | null): string {
  const raw = (text || '').trim()
  return BRANCH_INPUT[raw.toUpperCase().replace(/[^A-Z]/g, '')] ?? raw
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
