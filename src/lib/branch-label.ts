// Branch-code → friendly label. Accepts every code family this app's
// routes/pages use — SANDBOX_EAST/SANDBOX_GREENHILLS/VERDANA_STORE (the
// Branch/ClassPortalBranch enums) and SBEA/SBGH (legacy Staff short codes).
// Deliberately has no Prisma import so both server routes (api/*) and
// 'use client' components can import it — was independently duplicated
// (often byte-for-byte identical) across ~19 files.
const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}

export function branchLabel(code?: string | null): string {
  if (!code) return ''
  return BRANCH_LABELS[code] ?? code
}
