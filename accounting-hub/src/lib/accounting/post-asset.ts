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
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine } from './posting'

export interface PostAssetResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
  alreadyPosted?: boolean
}

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
      id: true, name: true, branch: true, totalAmount: true,
      classification: true, dateBought: true, sourceAccountId: true,
    },
  })
  if (!asset) return { posted: false, reason: 'asset not found' }

  // Post whenever the user identified the funding bank account (they want the
  // purchase recorded); otherwise fall back to the global Tier-3 GL flag.
  if (!asset.sourceAccountId && process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off and no source account selected' }
  }

  const amount = Number(asset.totalAmount)
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

  const lines: PostingLine[] = original.lines.map(l => ({
    accountId: l.accountId,
    debit:  Number(l.credit) || 0,
    credit: Number(l.debit)  || 0,
    description: `Reversal — ${reason}`,
  }))

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     new Date(),
      description:   `Reversal of asset purchase ${assetId} — ${reason}`,
      referenceType: 'ASSET_PURCHASE_REVERSAL',
      referenceId:   assetId,
      branch:        original.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[ASSET_PURCHASE_REVERSAL] refused unbalanced JE for asset', assetId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
