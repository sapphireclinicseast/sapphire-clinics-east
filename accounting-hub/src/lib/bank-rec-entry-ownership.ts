import type { Prisma } from '@prisma/client'

// A bank line's journalEntryId can mean two different things. Categorise, bank
// rules, a match difference and an A/P bill settlement post an entry for the
// line, so undoing the line takes that entry with it. Every other link points at
// an entry that belongs to something else (a dividend, buyback, loan, QB import,
// RFP posting), and one entry can be shared by several lines, so undoing the line
// only clears the link.

type LinkedLine = { id: string; matchType: string | null; matchId: string | null; journalEntryId: string | null }
type LinkedEntry = { referenceType: string | null; referenceId: string | null }

export function lineOwnsEntry(line: LinkedLine, entry: LinkedEntry): boolean {
  if (entry.referenceType === 'BANK_REC' && entry.referenceId === line.id) return true
  return line.matchType === 'AP_BILL' && !!line.matchId && entry.referenceId === `APSETTLE:${line.matchId}`
}

// Deletes the linked entries these lines own. Clearing the link itself stays with
// the caller, which is updating or deleting the line anyway. A link to an entry
// that no longer exists counts as neither deleted nor kept.
export async function removeOwnedEntries(
  db: Pick<Prisma.TransactionClient, 'journalEntry'>,
  lines: LinkedLine[],
): Promise<{ deleted: number; kept: number }> {
  const linked = lines.filter(l => l.journalEntryId)
  if (linked.length === 0) return { deleted: 0, kept: 0 }
  const entries = await db.journalEntry.findMany({
    where: { id: { in: linked.map(l => l.journalEntryId as string) } },
    select: { id: true, referenceType: true, referenceId: true },
  })
  const byId = new Map(entries.map(e => [e.id, e]))
  const owned = new Set<string>()
  for (const l of linked) {
    const entry = byId.get(l.journalEntryId as string)
    if (entry && lineOwnsEntry(l, entry)) owned.add(entry.id)
  }
  if (owned.size) await db.journalEntry.deleteMany({ where: { id: { in: [...owned] } } })
  return { deleted: owned.size, kept: entries.length - owned.size }
}
