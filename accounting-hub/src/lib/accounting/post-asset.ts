/**
 * Tier 3 Step 6 — Asset (PPE) acquisition auto-posting.
 *
 *   DR  PPE account looked up via Asset.classification (e.g. "2020")
 *     CR Cash account (default 10xx — the earliest cash account)
 *
 * Asset doesn't yet carry a sourceAccountId; if/when you add one (mirroring
 * InventoryItem.sourceAccount), the same logic kicks in here:
 *   - sourceAccount=ASSET → CR that cash account
 *   - sourceAccount=LIABILITY → CR that AP/loan account
 *
 * Gated by ENABLE_GL_POSTING. Non-fatal: returns { posted, reason }.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine, type PostingPayload } from './posting'
import { addedCostForAsset } from '@/lib/asset-entry-retag'
import { carriedTotal } from '@/lib/asset-parts'

export interface PostAssetResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
  alreadyPosted?: boolean
}

// Years before this report from the imported QuickBooks GL alone, so a hub JE
// dated earlier only twins the QuickBooks line in the branch views.
export const HUB_LEDGER_START = 2026

// Branch → the prefix its own accounts are titled with, e.g. "AHEA BDO Checking
// Account". Keeps a fallback on the branch that actually spent the money.
const BRANCH_PREFIX: Record<string, string> = {
  SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER',
}

/**
 * The account to credit when nobody said which one paid.
 *
 * This used to be "any ASSET account numbered 10* or titled cash/bank, lowest
 * account number wins". That is not a funding account, it is an alphabetical
 * accident: it resolved to 004680350310 VER BDO Petty Cash — a ~P10k float with
 * no imported bank statement — and quietly credited P10.2M of asset purchases
 * there across 2024-2026, where no bank reconciliation could ever correct it.
 *
 * Now it prefers the branch's own CHECKING account, then the company account,
 * and never a petty cash account. A fallback is still a guess, so the real fix
 * is for the purchase to name its source account.
 */
async function findDefaultCashAccount(prisma: PrismaClient, branch?: string | null) {
  const checking = {
    accountType: 'ASSET' as const,
    isBankAccount: true,
    isCheckingAccount: true,
    isActive: true,
    NOT: { accountTitle: { contains: 'petty cash', mode: 'insensitive' as const } },
  }
  const select = { id: true, accountNumber: true, accountTitle: true }
  const prefix = branch ? BRANCH_PREFIX[branch] : undefined
  if (prefix) {
    const own = await prisma.account.findFirst({
      where: { ...checking, accountTitle: { startsWith: prefix } },
      orderBy: { accountNumber: 'asc' },
      select,
    })
    if (own) return own
  }
  return await prisma.account.findFirst({
    where: { ...checking, accountTitle: { contains: 'Main Corporate', mode: 'insensitive' } },
    orderBy: { accountNumber: 'asc' },
    select,
  }) ?? await prisma.account.findFirst({ where: checking, orderBy: { accountNumber: 'asc' }, select })
}

/**
 * What the ledger carries for this asset right now: purchase entries minus
 * reversals, in centavos. Same reckoning as orderGlNetCents for POS (667ca40e).
 */
export async function assetGlNetCents(prisma: PrismaClient, assetId: string): Promise<number> {
  const jes = await prisma.journalEntry.findMany({
    where: { referenceId: assetId, referenceType: { in: ['ASSET_PURCHASE', 'ASSET_PURCHASE_REVERSAL'] } },
    select: { referenceType: true, lines: { select: { debit: true } } },
  })
  return jes.reduce((net, je) => {
    const totalCents = je.lines.reduce((s, l) => s + Math.round(Number(l.debit) * 100), 0)
    return net + (je.referenceType === 'ASSET_PURCHASE' ? totalCents : -totalCents)
  }, 0)
}

/**
 * The part of an asset's total its own purchase entry covers. Balance payments
 * that came from expense entries book their own cost (PettyCashEntry.addedToAssetId),
 * and so do combined parts their petty-cash vouchers book (parts marked carried).
 */
export async function assetBookableCost(
  prisma: PrismaClient,
  asset: { id: string; totalAmount: unknown; parts: unknown },
): Promise<number> {
  const added = await addedCostForAsset(prisma, asset.id)
  return Math.round((Number(asset.totalAmount) - added - carriedTotal(asset.parts)) * 100) / 100
}

/**
 * The FIRST posting of a purchase. Any entry already on file answers
 * alreadyPosted, reversed or not: a reversed purchase stays reversed unless
 * repostAssetJournal replaces it or someone repairs it on purpose. Backfill GL
 * runs this over a whole year, and those reversed pre-2026 entries are mostly
 * twins of the QuickBooks lines.
 */
export async function postAssetJournal(
  prisma: PrismaClient,
  assetId: string,
  createdById: string,
): Promise<PostAssetResult> {
  // Idempotency
  const existing = await prisma.journalEntry.findFirst({
    where: { referenceType: 'ASSET_PURCHASE', referenceId: assetId },
    select: { id: true },
  })
  if (existing) return { posted: false, alreadyPosted: true, journalEntryId: existing.id }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true, name: true, branch: true, totalAmount: true, parts: true,
      classification: true, dateBought: true, sourceAccountId: true, sourceEntryId: true, fromPettyCash: true,
    },
  })
  if (!asset) return { posted: false, reason: 'asset not found' }
  // Made from a petty-cash / expense entry ("Add to Asset Management"): the
  // entry already books the cost. Moving PLS5 Test to Greenhills (1 Nov) re-ran
  // this and credited AHGH BDO ₱45,944.75 for a purchase the CEO entry carries.
  if (asset.sourceEntryId) return { posted: false, reason: 'made from an expense entry — the entry carries the cost' }
  // Same for an asset paid from petty cash: its voucher books it (the reports skip these too).
  if (asset.fromPettyCash) return { posted: false, reason: 'paid from petty cash — its voucher carries the cost' }

  // Post whenever the user identified the funding bank account (they want the
  // purchase recorded); otherwise fall back to the global Tier-3 GL flag.
  if (!asset.sourceAccountId && process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off and no source account selected' }
  }
  // Older than the hub ledger and nobody named who paid: QuickBooks carries it.
  // Crediting a guessed bank account here would only break "cash = bank".
  if (!asset.sourceAccountId && asset.dateBought.getUTCFullYear() < HUB_LEDGER_START) {
    return { posted: false, reason: `bought before ${HUB_LEDGER_START} with no source account — the QuickBooks books carry it` }
  }

  const amount = await assetBookableCost(prisma, asset)
  if (amount <= 0) return { posted: false, reason: 'zero-amount asset — nothing to post' }

  // PPE side (DR) — look up the COA account whose accountNumber matches the
  // asset's classification (e.g. "2020" → "2020 Office Equipment").
  const ppeAcct = await prisma.account.findFirst({
    where: { accountNumber: asset.classification, accountType: 'ASSET' },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
  if (!ppeAcct) {
    return { posted: false, reason: `no ASSET account with accountNumber=${asset.classification} found for asset "${asset.name}"` }
  }

  // Funding side (CR) — the bank/COA account the asset was purchased from, if the
  // user picked one; otherwise fall back to the earliest cash account.
  const fundingAcct = asset.sourceAccountId
    ? await prisma.account.findUnique({ where: { id: asset.sourceAccountId }, select: { id: true, accountNumber: true, accountTitle: true } })
    : await findDefaultCashAccount(prisma, asset.branch)
  if (!fundingAcct) {
    return { posted: false, reason: 'no funding account found to credit for asset purchase' }
  }

  const lines: PostingLine[] = [
    { accountId: ppeAcct.id,      debit:  amount, description: `Acquired ${asset.name}` },
    { accountId: fundingAcct.id,  credit: amount, description: `Paid for ${asset.name}` },
  ]

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     asset.dateBought,
      description:   `Asset Purchase — ${asset.name}`,
      referenceType: 'ASSET_PURCHASE',
      referenceId:   asset.id,
      branch:        asset.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[ASSET_PURCHASE] refused unbalanced JE for asset', asset.id, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}

/**
 * Delete an asset the safe way: reverse its acquisition JE first (if one was
 * ever posted — assets born from petty-cash/expense entries usually have none,
 * but the backfill or a material edit in Asset Management can have posted one),
 * then remove the row. Shared by the Asset Management DELETE and by the
 * entry-edit auto-removal (an expense row re-tagged from an asset account to
 * an expense account withdraws its auto-created assets).
 */
export async function deleteAssetWithReversal(
  prisma: PrismaClient,
  assetId: string,
  userId: string,
  reason: string,
): Promise<void> {
  try {
    await reverseAssetJournal(prisma, assetId, userId, reason)
  } catch (e) {
    // Non-fatal by design: a missing original JE already comes back as
    // { posted: false }; anything thrown here should not strand the deletion.
    console.error('[ASSET_DELETE] reversal failed for asset', assetId, '—', e instanceof Error ? e.message : e)
  }
  await prisma.asset.delete({ where: { id: assetId } })
}

/**
 * Replace an asset's live purchase entry after an edit: reverse it and post it
 * again as the asset now stands, in one transaction. With no live entry there is
 * nothing to replace and nothing is posted, so an edit never creates a purchase
 * for a record that deliberately has none (a split-off branch share, a pre-2026
 * row QuickBooks carries, a reversed twin).
 *
 * The new entry carries what the ledger carried, moved only by what the edit
 * changed (costDelta). It is not recomputed from the row: a split leaves the
 * whole cost on the original's entry at half the row's total, and combined
 * pre-2026 rows leave their parts' entries standing.
 *
 * It credits the source account the asset names, else the account the replaced
 * entry credited. Who paid does not change because the record was edited, and
 * the fallback guess would move a stockholder advance or a petty-cash purchase
 * onto a bank account.
 */
export async function repostAssetJournal(
  prisma: PrismaClient,
  assetId: string,
  createdById: string,
  reason: string,
  costDelta = 0,
): Promise<PostAssetResult> {
  const netCents = await assetGlNetCents(prisma, assetId)
  if (netCents <= 0) return { posted: false, reason: 'no live purchase entry to replace' }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, name: true, branch: true, classification: true, dateBought: true, sourceAccountId: true, sourceEntryId: true },
  })
  if (!asset) return { posted: false, reason: 'asset not found' }

  const amount = Math.round((netCents / 100 + costDelta) * 100) / 100
  // The entry carries the cost, or the cost is gone: the old purchase only comes off.
  if (asset.sourceEntryId || amount <= 0) {
    await reverseAssetJournal(prisma, assetId, createdById, reason)
    return { posted: false, reason: asset.sourceEntryId ? 'made from an expense entry — the entry carries the cost' : 'zero-amount asset — nothing to post' }
  }

  const original = await prisma.journalEntry.findFirst({
    where: { referenceType: 'ASSET_PURCHASE', referenceId: assetId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  // Settle the new entry BEFORE touching the old one: a re-post that can't go
  // through must leave the old entry standing, not net the asset to zero.
  const ppeAcct = await prisma.account.findFirst({
    where: { accountNumber: asset.classification, accountType: 'ASSET' },
    select: { id: true },
  })
  if (!ppeAcct) return { posted: false, reason: `no ASSET account with accountNumber=${asset.classification} found for asset "${asset.name}"` }
  const paidFrom = original?.lines.filter(l => Number(l.credit) > 0).sort((x, y) => Number(y.credit) - Number(x.credit))[0]
  const fundingAccountId = asset.sourceAccountId ?? paidFrom?.accountId
  if (!original || !fundingAccountId) return { posted: false, reason: 'no funding account found to credit for asset purchase' }

  const je = await prisma.$transaction(async (tx) => {
    await postJournalEntry(tx, reversalPayload(original, assetId, createdById, reason))
    return postJournalEntry(tx, {
      entryDate:     asset.dateBought,
      description:   `Asset Purchase — ${asset.name}`,
      referenceType: 'ASSET_PURCHASE',
      referenceId:   asset.id,
      branch:        asset.branch,
      createdById,
      lines: [
        { accountId: ppeAcct.id,       debit:  amount, description: `Acquired ${asset.name}` },
        { accountId: fundingAccountId, credit: amount, description: `Paid for ${asset.name}` },
      ],
    })
  })
  return { posted: true, journalEntryId: je.id }
}

type PurchaseEntry = {
  entryDate: Date
  branch: string
  lines: { accountId: string; debit: unknown; credit: unknown }[]
}

function reversalPayload(original: PurchaseEntry, assetId: string, createdById: string, reason: string): PostingPayload {
  return {
    // Date the reversal AT THE ORIGINAL ENTRY'S DATE so the pair nets inside
    // the period the purchase was booked. Dating it "now" put the credit in
    // the edit month while the repost went back to dateBought — an asset
    // bought in a PRIOR year (already embodied in the opening balance) then
    // showed as a naked current-year credit, and its repost (prior-year
    // dated, created after the opening balances were seeded) never reached
    // current-year balances at all. Same fix as POS reversals (667ca40e).
    entryDate:     original.entryDate,
    description:   `Reversal of asset purchase ${assetId} — ${reason}`,
    referenceType: 'ASSET_PURCHASE_REVERSAL',
    referenceId:   assetId,
    branch:        original.branch,
    createdById,
    lines: original.lines.map(l => ({
      accountId: l.accountId,
      debit:  Number(l.credit) || 0,
      credit: Number(l.debit)  || 0,
      description: `Reversal — ${reason}`,
    })),
  }
}

/** Reverse a previously-posted asset acquisition JE. */
export async function reverseAssetJournal(
  prisma: PrismaClient,
  assetId: string,
  createdById: string,
  reason: string,
): Promise<PostAssetResult> {
  // Reverse whenever an original acquisition JE exists — regardless of the flag —
  // so editing/deleting an asset always unwinds its posted entry.
  const original = await prisma.journalEntry.findFirst({
    where: { referenceType: 'ASSET_PURCHASE', referenceId: assetId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return { posted: false, reason: 'no original JE found to reverse' }
  // Only what still stands can come off: a second reversal would leave the
  // asset's entries negative.
  if (await assetGlNetCents(prisma, assetId) <= 0) return { posted: false, reason: 'purchase entry already reversed' }

  try {
    const je = await postJournalEntry(prisma, reversalPayload(original, assetId, createdById, reason))
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[ASSET_PURCHASE_REVERSAL] refused unbalanced JE for asset', assetId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
