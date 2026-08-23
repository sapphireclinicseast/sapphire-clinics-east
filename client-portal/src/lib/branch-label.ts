// Branch-code → friendly label. Accepts both code families this app uses —
// SBEA/SBGH (booking flows) and SANDBOX_EAST/SANDBOX_GREENHILLS (patient
// registration, matching the Patient.branch enum). Was independently
// duplicated (identical ternary) in bookings/page.tsx, book/confirm/page.tsx,
// book/teletherapy/page.tsx, and book/page.tsx — this is the one copy.
const BRANCH_LABELS: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
}

export function branchLabel(code?: string | null): string {
  if (!code) return ''
  return BRANCH_LABELS[code] ?? code
}
