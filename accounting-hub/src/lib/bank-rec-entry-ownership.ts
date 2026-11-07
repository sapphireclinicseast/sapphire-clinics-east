import type { Prisma } from '@prisma/client'

// A bank line's journalEntryId can mean two different things. Categorise, bank
// rules, a match difference and an A/P bill settlement post an entry for the
// line, so undoing the line takes that entry with it. Every other link points at
// an entry that belongs to something else (a dividend, buyback, loan, QB import,
// RFP posting), and one entry can be shared by several lines, so undoing the line
// only clears the link. A POS settlement owns its reclass entry (the move out of
// undeposited funds, see lib/accounting/settlement-reclass.ts) and its batch of
// order payments; the two always go together.

type LinkedLine = { id: string; matchType: string | null; matchId: string | null; journalEntryId: string | null }
type LinkedEntry = { referenceType: string | null; referenceId: string | null }
type Db = Pick<Prisma.TransactionClient, 'journalEntry' | 'beginningBalance' | 'account' | 'posSettlementBatch'>

export function lineOwnsEntry(line: LinkedLine, entry: LinkedEntry): boolean {
  if (entry.referenceType === 'BANK_REC' && entry.referenceId === line.id) return true
  if (entry.referenceType === 'POS_SETTLEMENT_RECLASS' && line.matchType === 'POS_SETTLEMENT' && !!line.matchId && entry.referenceId === line.matchId) return true
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
  // A settlement batch holds its order payments captive; release it with the line
  // so the payments can settle again (and a reclass entry goes below). AUB/card
  // deposits carry POS_SETTLEMENT; BDO cash deposits keep SALES_DEPOSIT and hang
  // their batch off the line (bdo-cash-match).
  const settled = lines.filter(l => l.matchType === 'POS_SETTLEMENT' || l.matchType === 'SALES_DEPOSIT').map(l => l.id)
  if (settled.length) await db.posSettlementBatch.deleteMany({ where: { bankTransactionId: { in: settled } } })
  const linked = lines.filter(l => l.journalEntryId)
  if (linked.length === 0) return { deleted: 0, kept: 0 }
  // A difference on an A/P match has no link of its own, because the line's one
  // link holds the settlement. It names the line in referenceId instead.
  const apLineIds = new Set(linked.filter(l => l.matchType === 'AP_BILL').map(l => l.id))
  const entries = await db.journalEntry.findMany({
    where: {
      OR: [
        { id: { in: linked.map(l => l.journalEntryId as string) } },
        { referenceType: 'BANK_REC', referenceId: { in: [...apLineIds] } },
      ],
    },
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
  for (const e of entries) {
    if (e.referenceType === 'BANK_REC' && apLineIds.has(e.referenceId ?? '')) owned.set(e.id, e)
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
