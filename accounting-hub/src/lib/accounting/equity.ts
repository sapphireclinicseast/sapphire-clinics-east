import type { PrismaClient } from '@prisma/client'
import { postJournalEntry } from './posting'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PrismaClient | any

// One item of consideration received for a shareholding: a cash deposit into a
// bank account, or non-cash consideration (equipment, say) debited to an asset
// account. `accountId` is whichever of the two applies.
export type EquityConsideration = {
  accountId: string
  amount: number
  date?: Date | null
  note?: string | null
}

// Issuance: DR whatever was received / CR the chosen equity account.
//
// The simple case is one debit to a single bank account, which is what a caller
// passing `bankAccountId` gets. Passing `considerations` instead itemises the
// debits — several deposits across different bank accounts and dates, plus any
// non-cash consideration — while still crediting equity once for the full
// capitalization. Anything not covered by the itemised consideration is debited
// to `receivableAccountId` as an unpaid subscription; without that account a
// short-paid holding cannot balance, so no entry is posted at all rather than
// an unbalanced one.
export async function postEquityIssuance(db: Db, opts: {
  kind: 'COMMON' | 'PREFERRED'; refId: string; date: Date; amount: number
  bankAccountId?: string | null; equityAccountId?: string | null
  considerations?: EquityConsideration[] | null
  receivableAccountId?: string | null
  investor: string; createdById: string
}): Promise<string | null> {
  if (!opts.equityAccountId || !(opts.amount > 0)) return null

  const items = (opts.considerations || []).filter(c => c.accountId && c.amount > 0)

  // No itemised consideration → legacy single-bank behaviour, unchanged.
  const debits: { accountId: string; debit: number; description: string }[] = []
  if (items.length === 0) {
    if (!opts.bankAccountId) return null
    debits.push({ accountId: opts.bankAccountId, debit: opts.amount, description: `Investment from ${opts.investor}` })
  } else {
    const received = items.reduce((s, c) => s + c.amount, 0)
    // Guard against itemised consideration exceeding what the shares are worth —
    // that is a data-entry error, not an over-payment to book.
    if (received > opts.amount + 0.005) return null
    for (const c of items) {
      debits.push({
        accountId: c.accountId,
        debit: c.amount,
        description: c.note?.trim()
          ? `Investment from ${opts.investor} — ${c.note.trim()}`
          : `Investment from ${opts.investor}`,
      })
    }
    const shortfall = opts.amount - received
    if (shortfall > 0.005) {
      if (!opts.receivableAccountId) return null
      debits.push({ accountId: opts.receivableAccountId, debit: shortfall, description: `Subscription receivable — ${opts.investor}` })
    }
  }

  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `${opts.kind === 'COMMON' ? 'Common' : 'Preferred'} share issuance — ${opts.investor}`,
    referenceType: opts.kind === 'COMMON' ? 'EQUITY_COMMON' : 'EQUITY_PREFERRED',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      ...debits,
      { accountId: opts.equityAccountId, credit: opts.amount, description: `Share capital — ${opts.investor}` },
    ],
  })
  return je.id
}

// Re-post a common holding's issuance entry from whatever is currently stored:
// its itemised deposits if it has any, else its single bank account. Call this
// after anything that changes the consideration — adding, editing or removing a
// deposit — so the journal always mirrors the deposit list.
//
// Returns the new journal entry id, or null when the entry could not be posted
// (no equity account, or short-paid with no receivable account). A null result
// leaves the holding with no issuance entry, which is deliberate: better an
// obviously missing entry than a quietly wrong one.
export async function repostCommonIssuance(db: Db, commonShareId: string, createdById: string): Promise<string | null> {
  const share = await db.commonShare.findUnique({
    where: { id: commonShareId },
    include: { shareholder: { select: { name: true } }, deposits: { orderBy: { date: 'asc' } } },
  })
  if (!share) return null

  // A holding created by a share transfer (bought from another shareholder)
  // must never carry an issuance entry: the equity was already credited when
  // the shares were first issued to the seller, and no consideration reached
  // the company. Reverse anything stale and stop here — even if someone later
  // sets a bank account on the row.
  const transferIn = await db.shareTransfer.findFirst({ where: { toCommonShareId: commonShareId }, select: { id: true } })
  if (transferIn) {
    await reverseEquityJournal(db, 'EQUITY_COMMON', commonShareId)
    await db.commonShare.update({ where: { id: commonShareId }, data: { journalEntryId: null } })
    return null
  }

  const n = (v: unknown) => Number(v || 0)
  const considerations: EquityConsideration[] = (share.deposits || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({
      accountId: (d.kind === 'NON_CASH' ? d.assetAccountId : d.bankAccountId) || '',
      amount: n(d.amount),
      date: d.date,
      note: d.note,
    }))
    .filter((c: EquityConsideration) => c.accountId && c.amount > 0)

  await reverseEquityJournal(db, 'EQUITY_COMMON', commonShareId)
  const jeId = await postEquityIssuance(db, {
    kind: 'COMMON',
    refId: share.id,
    date: share.dateAcquired,
    amount: n(share.numberOfShares) * n(share.pricePerShare),
    bankAccountId: share.bankAccountId,
    equityAccountId: share.equityAccountId,
    considerations: considerations.length ? considerations : null,
    receivableAccountId: share.receivableAccountId,
    investor: share.shareholder.name,
    createdById,
  })
  await db.commonShare.update({ where: { id: commonShareId }, data: { journalEntryId: jeId } })
  return jeId
}

/** Same as repostCommonIssuance, for a preferred holding. Preferred shares are paid
 *  for the same way, so their deposits drive the issuance entry identically. */
export async function repostPreferredIssuance(db: Db, preferredShareId: string, createdById: string): Promise<string | null> {
  const share = await db.preferredShare.findUnique({
    where: { id: preferredShareId },
    include: { shareholder: { select: { name: true } }, deposits: { orderBy: { date: 'asc' } } },
  })
  if (!share) return null

  const n = (v: unknown) => Number(v || 0)
  const considerations: EquityConsideration[] = (share.deposits || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({
      accountId: (d.kind === 'NON_CASH' ? d.assetAccountId : d.bankAccountId) || '',
      amount: n(d.amount),
      date: d.date,
      note: d.note,
    }))
    .filter((c: EquityConsideration) => c.accountId && c.amount > 0)

  await reverseEquityJournal(db, 'EQUITY_PREFERRED', preferredShareId)
  const jeId = await postEquityIssuance(db, {
    kind: 'PREFERRED',
    refId: share.id,
    date: share.dateAcquired,
    amount: n(share.numberOfShares) * n(share.pricePerShare),
    bankAccountId: share.bankAccountId,
    equityAccountId: share.equityAccountId,
    considerations: considerations.length ? considerations : null,
    receivableAccountId: share.receivableAccountId,
    investor: share.shareholder.name,
    createdById,
  })
  await db.preferredShare.update({ where: { id: preferredShareId }, data: { journalEntryId: jeId } })
  return jeId
}

// Secondary sale (share transfer): the seller and buyer settle the price
// privately, so NO cash touches the company's books and total equity on the
// balance sheet must not move. The entry is a net-zero memo within the same
// equity account — DR "Share capital — seller" / CR "Share capital — buyer" —
// measured at BOOK value (shares × the seller's issue price), never at the
// private sale price. Its only job is to keep the per-investor attribution in
// the ledger correct; the balance sheet total is unchanged by construction.
export async function postEquityTransfer(db: Db, opts: {
  refId: string; date: Date; amount: number; equityAccountId?: string | null
  fromInvestor: string; toInvestor: string; createdById: string
}): Promise<string | null> {
  if (!opts.equityAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `Share transfer — ${opts.fromInvestor} → ${opts.toInvestor}`,
    referenceType: 'EQUITY_TRANSFER',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.equityAccountId, debit: opts.amount, description: `Share capital — ${opts.fromInvestor} (transferred out)` },
      { accountId: opts.equityAccountId, credit: opts.amount, description: `Share capital — ${opts.toInvestor} (transferred in)` },
    ],
  })
  return je.id
}

// Buyback → Treasury: DR the chosen treasury/equity account / CR bank (money out).
export async function postEquityBuyback(db: Db, opts: {
  refId: string; date: Date; amount: number; bankAccountId?: string | null; treasuryAccountId?: string | null; investor: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.treasuryAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `Share buyback (treasury) — ${opts.investor}`,
    referenceType: 'EQUITY_BUYBACK',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.treasuryAccountId, debit: opts.amount, description: `Treasury shares — ${opts.investor}` },
      { accountId: opts.bankAccountId, credit: opts.amount, description: `Paid buyback to ${opts.investor}` },
    ],
  })
  return je.id
}

// Dividend / preferred payout: DR the chosen Retained Earnings account / CR bank.
export async function postDividend(db: Db, opts: {
  refType: string; refId: string; date: Date; amount: number; bankAccountId?: string | null; retainedAccountId?: string | null; label: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.retainedAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: opts.label,
    referenceType: opts.refType,
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.retainedAccountId, debit: opts.amount, description: opts.label },
      { accountId: opts.bankAccountId, credit: opts.amount, description: opts.label },
    ],
  })
  return je.id
}

// Scholarship monthly release: DR the chosen scholarship account / CR bank
// (money out). The DR account is configurable: an EQUITY "Scholarship Fund"
// (appropriated retained earnings) keeps it OFF the income statement, while an
// EXPENSE account would fold it into the P&L. The IS fold keys off account type.
export async function postScholarship(db: Db, opts: {
  refId: string; date: Date; amount: number; bankAccountId?: string | null; expenseAccountId?: string | null; label: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.expenseAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: opts.label,
    referenceType: 'SCHOLAR_RELEASE',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.expenseAccountId, debit: opts.amount, description: opts.label },
      { accountId: opts.bankAccountId, credit: opts.amount, description: opts.label },
    ],
  })
  return je.id
}

// Reverse any equity JE by referenceType+referenceId (for edits/deletes).
export async function reverseEquityJournal(db: Db, referenceType: string, referenceId: string) {
  await db.journalEntry.deleteMany({ where: { referenceType, referenceId } })
}
