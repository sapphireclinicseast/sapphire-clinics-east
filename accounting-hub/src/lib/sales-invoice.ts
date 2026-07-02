// Sales Invoice number → canonical 4-digit zero-padded numeric form.
// "SI 349" → "0349", "SI No. 00324" → "0324", "389" → "0389". Non-numeric input
// (or blank) → null. Values already ≥4 digits keep their length (e.g. 12345).
export function normalizeSI(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  return String(parseInt(digits, 10)).padStart(4, '0')
}
