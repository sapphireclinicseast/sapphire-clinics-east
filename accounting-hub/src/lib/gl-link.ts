// Linking GL sessions to their Guarantee Letter (Hannah 2026-11-18).
//
// Many GL sessions — most of 2025, a quarter of 2026 — were imported or rung up
// with no letter attached (OrderPayment.walletId null), so the letter they used
// shows nothing consumed on AR → GL. These helpers find a letter's sessions by the
// patient's name and pre-pick the run that plausibly used it; a person confirms.

/** Who may attach or detach sessions: the roles that record AR payments. */
export const GL_LINK_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

const DROP = new Set(['JR', 'SR', 'II', 'III', 'IV', 'APPLICATION', 'APP'])

/** The person on a letter: "GAVIN AZAREEL RIVERA (1st Application)" → "GAVIN AZAREEL RIVERA". */
export function letterPerson(name: string): string {
  return (name || '').replace(/\([^)]*\)/g, ' ').replace(/\b\d+(st|nd|rd|th)\b/gi, ' ').trim()
}

export function nameTokens(name: string): Set<string> {
  return new Set(
    (name || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z ]+/g, ' ').split(/\s+/)
      .filter(t => t.length >= 2 && !DROP.has(t)),
  )
}

/**
 * Same person, whatever the word order or case: "RIVERA GAVIN AZAREEL" and
 * "Gavin Azareel Rivera (1st Application)" match. Every name word of the shorter
 * name must appear in the longer one, and each needs at least two words.
 */
export function samePerson(letterName: string, patientName: string): boolean {
  const a = nameTokens(letterPerson(letterName))
  const b = nameTokens(patientName)
  if (a.size < 2 || b.size < 2) return false
  const [short, long] = a.size <= b.size ? [a, b] : [b, a]
  for (const t of short) if (!long.has(t)) return false
  return true
}

const DAY = 86_400_000

/**
 * The sessions that plausibly used this letter: in date order from about a month
 * before the letter was obtained, until the approved amount is reached or the
 * sessions stop for more than two months (a later letter takes over). A letter
 * with no approved amount (billed per session) gets no pre-picks.
 */
export function suggestedSessions(
  candidates: { id: string; date: Date; amount: number }[],
  opts: { approved: number; alreadyLinked: number; obtained?: Date | null },
): Set<string> {
  const out = new Set<string>()
  if (!(opts.approved > 0)) return out
  const start = opts.obtained ? opts.obtained.getTime() - 30 * DAY : -Infinity
  let total = opts.alreadyLinked
  let last: number | null = null
  for (const c of [...candidates].sort((x, y) => x.date.getTime() - y.date.getTime())) {
    const t = c.date.getTime()
    if (t < start) continue
    if (last !== null && t - last > 60 * DAY) break
    if (total + c.amount > opts.approved + 0.005) break
    out.add(c.id)
    total += c.amount
    last = t
  }
  return out
}
