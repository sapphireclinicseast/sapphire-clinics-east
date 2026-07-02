// Sales Invoice number → canonical 4-digit zero-padded numeric form.
// Uses the LAST run of digits so year-prefixed forms collapse to the invoice
// sequence: "SI 349"→"0349", "SI No. 00324"→"0324", "389"→"0389",
// "SI-2026-0330"→"0330". Non-numeric/blank → null. ≥4-digit sequences keep length.
export function normalizeSI(raw: string | null | undefined): string | null {
  const groups = String(raw ?? '').match(/\d+/g)
  if (!groups || groups.length === 0) return null
  return String(parseInt(groups[groups.length - 1], 10)).padStart(4, '0')
}
