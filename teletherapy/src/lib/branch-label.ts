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
