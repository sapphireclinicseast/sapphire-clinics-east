/**
 * Tier 3 Step 4 — AR Payment auto-posting.
 *
 *   DR Cash (cashAccount on the payment)         actual cash collected
 *   DR Discount/Write-off (discountAccount)      discount given
 *     CR AR (wallet.account, fall back to 1010)  total settled
 *
 * Gated by ENABLE_GL_POSTING. Non-fatal: returns { posted, reason } so the
 * AR payment row is created either way.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine } from './posting'

export interface PostARResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
  alreadyPosted?: boolean
}

export async function postARPaymentJournal(
  prisma: PrismaClient,
  paymentId: string,
  createdById: string,
): Promise<PostARResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  // Idempotency
  const existing = await prisma.journalEntry.findFirst({
    where: { referenceType: 'AR_PAYMENT', referenceId: paymentId },
    select: { id: true },
  })
  if (existing) return { posted: false, alreadyPosted: true, journalEntryId: existing.id }

  const payment = await prisma.aRPayment.findUnique({
    where: { id: paymentId },
    include: {
      wallet: {
        select: {
          patientName: true,
          walletType: true,
          account: { select: { id: true, accountNumber: true, accountTitle: true } },
        },
      },
      cashAccount:     { select: { id: true, accountNumber: true, accountTitle: true } },
      discountAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
    },
  })
  if (!payment) return { posted: false, reason: 'AR payment not found' }

  const cashAmt     = Number(payment.amount)
  const discountAmt = Number(payment.discount || 0)
  const total       = cashAmt + discountAmt
  if (total <= 0) return { posted: false, reason: 'zero-amount AR payment — nothing to post' }

  // Resolve AR account (CR side)
  let arAccount = payment.wallet?.account
  if (!arAccount) {
    arAccount = await prisma.account.findFirst({
      where: { accountNumber: '1010', accountType: 'ASSET' },
      select: { id: true, accountNumber: true, accountTitle: true },
    })
  }
  if (!arAccount) {
    return { posted: false, reason: `wallet has no AR account and no default 1010 ASSET account exists` }
  }

  // Cash side
  if (cashAmt > 0 && !payment.cashAccount) {
    return { posted: false, reason: `AR payment ${paymentId} has cash amount ${cashAmt} but no cashAccountId set` }
  }

  // Discount side (only required if a discount was recorded)
  if (discountAmt > 0 && !payment.discountAccount) {
    return { posted: false, reason: `AR payment ${paymentId} has discount ${discountAmt} but no discountAccountId set` }
  }

  const lines: PostingLine[] = []
  if (cashAmt > 0 && payment.cashAccount) {
    lines.push({
      accountId: payment.cashAccount.id,
      debit: cashAmt,
      description: `Cash collected from ${payment.wallet?.patientName || 'AR'} (${payment.wallet?.walletType || ''})`.trim(),
    })
  }
  if (discountAmt > 0 && payment.discountAccount) {
    lines.push({
      accountId: payment.discountAccount.id,
      debit: discountAmt,
      description: `AR write-off / discount`,
    })
  }
  lines.push({
    accountId: arAccount.id,
    credit: total,
    description: `AR settled — ${payment.wallet?.patientName || ''} ${payment.wallet?.walletType || ''}`.trim(),
  })

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     payment.paymentDate,
      description:   `AR Payment — ${payment.wallet?.patientName || 'wallet'} (${payment.wallet?.walletType || ''})`.trim(),
      referenceType: 'AR_PAYMENT',
      referenceId:   payment.id,
      branch:        payment.branch || 'ALL',
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[AR_PAYMENT] refused unbalanced JE for payment', payment.id, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}

/**
 * Reverse a previously-posted AR payment JE by writing an equal-and-opposite
 * entry. Used by AR payment DELETE / UPDATE so we never mutate historical JEs.
 */
export async function reverseARPaymentJournal(
  prisma: PrismaClient,
  paymentId: string,
  createdById: string,
  reason: string,
): Promise<PostARResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }
  // Find the most recent forward JE for this payment (ignore prior reversals).
  const original = await prisma.journalEntry.findFirst({
    where: { referenceType: 'AR_PAYMENT', referenceId: paymentId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return { posted: false, reason: 'no original JE found to reverse' }

  const lines: PostingLine[] = original.lines.map(l => ({
    accountId: l.accountId,
    debit:  Number(l.credit) || 0,   // swap sides
    credit: Number(l.debit)  || 0,
    description: `Reversal — ${reason}`,
  }))

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     new Date(),
      description:   `Reversal of AR payment ${paymentId} — ${reason}`,
      referenceType: 'AR_PAYMENT_REVERSAL',
      referenceId:   paymentId,
      branch:        original.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[AR_PAYMENT_REVERSAL] refused unbalanced JE for payment', paymentId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
