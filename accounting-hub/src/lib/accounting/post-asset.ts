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

async function findDefaultCashAccount(prisma: PrismaClient) {
  return prisma.account.findFirst({
    where: {
      accountType: 'ASSET',
      OR: [
        { accountNumber: { startsWith: '10' } },
        { accountTitle: { contains: 'cash', mode: 'insensitive' } },
        { accountTitle: { contains: 'bank', mode: 'insensitive' } },
      ],
    },
    orderBy: { accountNumber: 'asc' },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
}

export async function postAssetJournal(
  prisma: PrismaClient,
  assetId: string,
  createdById: string,
): Promise<PostAssetResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

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
      classification: true, dateBought: true,
    },
  })
  if (!asset) return { posted: false, reason: 'asset not found' }

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

  // Funding side (CR) — default to cash. Future enhancement: if Asset.sourceAccountId
  // is added, branch on its accountType to support loan-financed acquisitions.
  const cashAcct = await findDefaultCashAccount(prisma)
  if (!cashAcct) {
    return { posted: false, reason: 'no default cash ASSET account found to credit for asset purchase' }
  }

  const lines: PostingLine[] = [
    { accountId: ppeAcct.id,  debit:  amount, description: `Acquired ${asset.name}` },
    { accountId: cashAcct.id, credit: amount, description: `Cash paid for ${asset.name}` },
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
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

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
