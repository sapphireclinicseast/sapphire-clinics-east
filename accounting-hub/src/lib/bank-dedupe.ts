// Is an uploaded bank line one this account already holds? (Hannah 2026-11-15:
// "make sure that uploaded bank history doesn't get reuploaded again when they
// update it with bank history. make sure to flag it.")
//
// Staff re-download statements that overlap what is already in Bank Rec, and
// the same BDO line reaches the hub in different shapes: the Transaction
// History export gives "ONLINE TRANSFER BOB TO 4680280371 Reference # …", an
// older converted upload stored "TBG-BUSINESS ONLINE BANKING; ONLINE TRANSFER …;
// check number 00000", and the "Current Day" export pads every field with
// spaces. Matching on the exact description let those through twice. A line
// is the same line when the date and amounts agree AND either the statement's
// running balance agrees or the descriptions agree once branch prefixes, the
// check-number suffix, case and spacing are set aside.

export interface BankLineLike {
  date: Date | string
  description: string | null
  // numbers, numeric strings or Prisma Decimals
  spent: unknown
  received: unknown
  balance?: unknown
}

const day = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100)

/** The bank's own wording, without the branch prefix / check-number suffix some uploads add. */
export function coreDescription(s: string | null | undefined): string {
  const n = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/;\s*check number\s*\d*\s*$/, '')
  const parts = n.split('; ').map(p => p.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : n
}

export function sameBankLine(a: BankLineLike, b: BankLineLike): boolean {
  if (day(a.date) !== day(b.date)) return false
  if (cents(a.spent) !== cents(b.spent) || cents(a.received) !== cents(b.received)) return false
  const hasBal = (v: unknown) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
  if (hasBal(a.balance) && hasBal(b.balance) && cents(a.balance) === cents(b.balance)) return true
  const ca = coreDescription(a.description), cb = coreDescription(b.description)
  if (!ca || !cb) return false
  if (ca === cb) return true
  // One upload kept more of the line than the other (e.g. a trailing reference).
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  return short.length >= 8 && long.includes(short)
}

/**
 * Split an upload into lines to add and lines already on the account. Counted,
 * not de-duplicated: each existing line answers for ONE incoming line, so a
 * statement that legitimately repeats a line (two equal deposits that day)
 * still adds the copy the account does not have yet.
 */
export function splitAlreadyUploaded<T extends BankLineLike>(incoming: T[], existing: BankLineLike[]): { fresh: T[]; already: T[] } {
  const claimed = new Set<number>()
  const fresh: T[] = []
  const already: T[] = []
  for (const r of incoming) {
    const hit = existing.findIndex((e, i) => !claimed.has(i) && sameBankLine(r, e))
    if (hit >= 0) { claimed.add(hit); already.push(r) } else fresh.push(r)
  }
  return { fresh, already }
}
