import type { Prisma } from '@prisma/client'

// A bank line's journalEntryId can mean two different things. Categorise, bank
// rules, a match difference and an A/P bill settlement post an entry for the
// line, so undoing the line takes that entry with it. Every other link points at
// an entry that belongs to something else (a dividend, buyback, loan, QB import,
// RFP posting), and one entry can be shared by several lines, so undoing the line
// only clears the link.

type LinkedLine = { id: string; matchType: string | null; matchId: string | null; journalEntryId: string | null }
type LinkedEntry = { referenceType: string | null; referenceId: string | null }
type Db = Pick<Prisma.TransactionClient, 'journalEntry' | 'beginningBalance' | 'account'>

export function lineOwnsEntry(line: LinkedLine, entry: LinkedEntry): boolean {
  if (entry.referenceType === 'BANK_REC' && entry.referenceId === line.id) return true
  return line.matchType === 'AP_BILL' && !!line.matchId && entry.referenceId === `APSETTLE:${line.matchId}`
}

// Settling a pre-2026 bill moves the 2025 closing, so the 2026 opening balances
// move with it: the payable by `delta`, retained earnings by the opposite, which
// keeps them balanced. Removing the settlement calls this with the opposite sign.
export async function shiftOpeningsForSettlement(db: Db, payableAccountId: string, delta: number): Promise<void> {
  const re = await db.account.findFirst({ where: { accountNumber: '6030' }, select: { id: true } })
  const shifts: Array<[string, number]> = [[payableAccountId, delta]]
  if (re) shifts.push([re.id, -delta])
  for (const [accountId, amount] of shifts) {
    await db.beginningBalance.updateMany({
      where: { accountId, periodYear: 2026 },
      data: { amount: { increment: amount } },
    })
  }
}

const isPre2026Settlement = (e: LinkedEntry) =>
  e.referenceType === 'QB_IMPORT_JE' && !!e.referenceId?.startsWith('APSETTLE:')

// Deletes the linked entries these lines own, and for a pre-2026 settlement gives
// back what it took from the 2026 opening balances. Pass a transaction client so
// the delete and the reversal commit together. Clearing the link itself stays with
// the caller, which is updating or deleting the line anyway. A link to an entry
// that no longer exists counts as neither deleted nor kept.
export async function removeOwnedEntries(db: Db, lines: LinkedLine[]): Promise<{ deleted: number; kept: number }> {
  const linked = lines.filter(l => l.journalEntryId)
  if (linked.length === 0) return { deleted: 0, kept: 0 }
  const entries = await db.journalEntry.findMany({
    where: { id: { in: linked.map(l => l.journalEntryId as string) } },
    select: {
      id: true, referenceType: true, referenceId: true,
      lines: { where: { debit: { gt: 0 } }, select: { accountId: true, debit: true } },
    },
  })
  const byId = new Map(entries.map(e => [e.id, e]))
  const owned = new Map<string, (typeof entries)[number]>()
  for (const l of linked) {
    const entry = byId.get(l.journalEntryId as string)
    if (entry && lineOwnsEntry(l, entry)) owned.set(entry.id, entry)
  }
  const settlements = [...owned.values()].filter(isPre2026Settlement)
  const others = [...owned.values()].filter(e => !isPre2026Settlement(e))
  // Deleted one at a time so that of two Undos racing on the same line, only the
  // one that really removed the entry reverses the balances.
  for (const s of settlements) {
    const { count } = await db.journalEntry.deleteMany({ where: { id: s.id } })
    const payable = s.lines[0]
    if (count && payable) await shiftOpeningsForSettlement(db, payable.accountId, Number(payable.debit))
  }
  if (others.length) await db.journalEntry.deleteMany({ where: { id: { in: others.map(e => e.id) } } })
  return { deleted: owned.size, kept: entries.length - owned.size }
}
