// Matching referred patients to POS orders by name has to survive the two ways
// names are typed in the wild: the referral list holds "FEMARIE KATE POMALOY"
// (first-name first) while cashiers often key orders as "POMALOY FEMARIE KATE"
// or "POMALOY, FEMARIE KATE" (surname first). Same words, different order — an
// exact-equality match silently finds nothing.

/** Canonical token-set key: case-, punctuation- and word-order-insensitive. */
export function nameKey(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-zñ ]+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

/** The common spellings of a name, for an indexed `IN (...)` equality query. */
export function nameVariants(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ')
  const out = new Set<string>([clean])
  const words = clean.replace(/,/g, '').split(' ').filter(Boolean)
  if (words.length >= 2) {
    const last = words[words.length - 1]
    const rest = words.slice(0, -1).join(' ')
    out.add(`${last} ${rest}`)      // POMALOY FEMARIE KATE
    out.add(`${last}, ${rest}`)     // POMALOY, FEMARIE KATE
    const first = words[0]
    const tail = words.slice(1).join(' ')
    out.add(`${tail} ${first}`)     // the reverse direction, when the stored name is surname-first
    out.add(`${tail}, ${first}`)
  }
  return [...out]
}

/** Longest token (≥ 4 letters) — a cheap `contains` net for the fuzzy pass. */
export function longestToken(name: string): string | null {
  const words = String(name || '').replace(/[^a-zñ ]+/gi, ' ').split(/\s+/).filter(Boolean)
  const best = words.sort((a, b) => b.length - a.length)[0] || ''
  return best.length >= 4 ? best : null
}
