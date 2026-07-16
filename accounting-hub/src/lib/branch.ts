// Friendly display labels for the internal Branch enum keys (kept as SANDBOX_* for
// historical reasons; NEVER rename the keys — only the labels). Used wherever a
// branch is shown to users.
const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'Aura Health – East',
  SANDBOX_GREENHILLS: 'Aura Health – Greenhills',
  VERDANA_STORE: 'Verdana',
  ALL: 'All Branches',
}

export function branchLabel(branch?: string | null): string {
  if (!branch) return '—'
  return BRANCH_LABELS[branch] ?? branch
}
