/**
 * PayMongo Phase 2 — account resolution / provisioning.
 *
 * A PayMongo sale is settled net-of-fee through a clearing account, exactly like
 * a card/e-wallet processor:
 *
 *   On payment (webhook)   DR PayMongo Clearing (asset)   gross
 *                            CR Revenue                   gross          (via postOrderJournal)
 *                          DR PayMongo Fees (expense)     fee
 *                            CR PayMongo Clearing         fee            (exact fee JE)
 *   On payout (reconcile)  DR Bank                        net
 *                            CR PayMongo Clearing         net
 *
 * The PayMongo PaymentMode carries NO deduction — the fee is booked exactly from
 * PayMongo's reported fee via a separate JE, so the clearing balance is always
 * precise regardless of the processor's rate card. postOrderJournal resolves the
 * clearing account from the payment's paymentModeId.
 *
 * Everything here is find-or-create + idempotent, so the first paid PayMongo
 * order provisions the accounts automatically with no manual COA setup.
 */

import type { PrismaClient } from '@prisma/client'

export interface PaymongoAccounts {
  paymentModeId: string
  clearingAccountId: string
  feeAccountId: string
}

// Find an unused account number, preferring `preferred`, then incrementing.
async function freeAccountNumber(prisma: PrismaClient, preferred: string): Promise<string> {
  let n = parseInt(preferred, 10)
  for (let i = 0; i < 50; i++) {
    const num = String(n)
    const taken = await prisma.account.findUnique({ where: { accountNumber: num }, select: { id: true } })
    if (!taken) return num
    n++
  }
  // Extremely unlikely fallback: a cuid-ish suffix keeps it unique.
  return `${preferred}-PM`
}

async function findOrCreateAccount(
  prisma: PrismaClient,
  opts: { titleMatch: string; title: string; type: 'ASSET' | 'EXPENSE'; preferredNumber: string; createdById: string },
): Promise<string> {
  const existing = await prisma.account.findFirst({
    where: { accountTitle: { contains: opts.titleMatch, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) return existing.id
  const accountNumber = await freeAccountNumber(prisma, opts.preferredNumber)
  const created = await prisma.account.create({
    data: {
      accountNumber,
      accountTitle: opts.title,
      accountType: opts.type,
      normalBalance: 'DEBIT', // both clearing (asset) and fees (expense) are debit-normal
      subType: opts.type === 'ASSET' ? 'CURRENT_ASSETS' : 'OPERATING_EXPENSES',
      description: 'Auto-created for the PayMongo POS integration.',
      isActive: true,
      createdById: opts.createdById,
    },
    select: { id: true },
  })
  return created.id
}

// Resolve the merchant-discount (fee) account: 7140 Merchant Discount Rate by
// number, then by title, then create it if it truly doesn't exist yet.
async function resolveFeeAccount(prisma: PrismaClient, createdById: string): Promise<string> {
  const byNumber = await prisma.account.findUnique({ where: { accountNumber: '7140' }, select: { id: true } })
  if (byNumber) return byNumber.id
  const byTitle = await prisma.account.findFirst({
    where: { accountTitle: { contains: 'merchant discount', mode: 'insensitive' } },
    select: { id: true },
  })
  if (byTitle) return byTitle.id
  const accountNumber = await freeAccountNumber(prisma, '7140')
  const created = await prisma.account.create({
    data: {
      accountNumber,
      accountTitle: 'Merchant Discount Rate',
      accountType: 'EXPENSE',
      normalBalance: 'DEBIT',
      subType: 'OPERATING_EXPENSES',
      description: 'Merchant discount / payment-processor fees (incl. PayMongo).',
      isActive: true,
      createdById,
    },
    select: { id: true },
  })
  return created.id
}

/**
 * Resolve the PayMongo clearing + fee accounts and the PayMongo PaymentMode,
 * creating any that don't yet exist. `createdById` must be a real user id
 * (Account.createdById is a required relation) — use the checkout creator or an
 * admin.
 */
export async function resolvePaymongoAccounts(prisma: PrismaClient, createdById: string): Promise<PaymongoAccounts> {
  const clearingAccountId = await findOrCreateAccount(prisma, {
    titleMatch: 'paymongo clearing',
    title: 'PayMongo Clearing',
    type: 'ASSET',
    preferredNumber: '1055',
    createdById,
  })
  // PayMongo processing fees are booked to the standard merchant-discount account
  // (7140 Merchant Discount Rate), same bucket as card/e-wallet MDR — not a
  // PayMongo-specific account. Resolve by number first, then title, then create.
  const feeAccountId = await resolveFeeAccount(prisma, createdById)

  // PaymentMode named "PayMongo" → clearing account, no deduction (fee booked exactly, separately).
  let pm = await prisma.paymentMode.findFirst({ where: { name: { equals: 'PayMongo', mode: 'insensitive' } } })
  if (!pm) {
    pm = await prisma.paymentMode.create({
      data: { name: 'PayMongo', paymentMethod: 'PAYMONGO', accountId: clearingAccountId, isActive: true },
    })
  } else if (pm.accountId !== clearingAccountId) {
    pm = await prisma.paymentMode.update({ where: { id: pm.id }, data: { accountId: clearingAccountId } })
  }

  return { paymentModeId: pm.id, clearingAccountId, feeAccountId }
}
