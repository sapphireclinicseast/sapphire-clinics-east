// Client-safe branch-code → friendly label map. Kept free of any Prisma
// import so client components (sidebar, switcher) can use it. Accepts both the
// short Staff codes (SBEA/SBGH) and the long Patient-branch enum forms.
const BRANCH_LABELS: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}

export function branchLabel(code?: string | null): string {
  if (!code) return ''
  return BRANCH_LABELS[code] ?? code
}

// String-only equivalent of branch-filter.ts's toPatientBranch() — that
// file returns the actual Prisma `Branch` enum, which pulls @prisma/client
// into any bundle that imports it, so it's server-only. Client components
// that just need to compare/normalize codes (not query the DB) use this.
const TO_PATIENT_BRANCH_CODE: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
  SANDBOX_EAST: 'SANDBOX_EAST',
  SANDBOX_GREENHILLS: 'SANDBOX_GREENHILLS',
}

// Falls back to returning the input unchanged (not null) for codes that
// aren't Staff-short-code aliases (e.g. VERDANA_STORE, which has no SBEA
// -style alias) — callers compare two canonicalized codes for equality, and
// two different unmapped codes both collapsing to the same null would
// wrongly match.
export function toPatientBranchCode(code: string): string {
  return TO_PATIENT_BRANCH_CODE[code] ?? code
}
