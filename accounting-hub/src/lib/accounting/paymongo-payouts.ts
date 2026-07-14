/**
 * PayMongo payout auto-reconciliation.
 *
 * PayMongo settles collected money to your bank as periodic payouts. There is no
 * payout webhook, so this polls the Payouts API and, for each settled payout not
 * yet recorded, posts:
 *
 *   DR Bank                        payout net
 *   DR 7140 Merchant Discount Rate payout-level fee (if any)
 *     CR PayMongo Clearing         net + fee
 *
 * The JE amount is driven by the authoritative payout figures, so the books
 * always balance. Individual PaymongoCheckout rows are tagged settled FIFO by
 * amount (best-effort — a payout doesn't always itemise its transactions).
 *
 * Idempotent: a payout already booked (JE PAYMONGO_PAYOUT:<payoutId>) is skipped.
 * No-ops unless autoReconcile is on, a settlement bank is set, and GL posting is
 * enabled (else the sale-side clearing debits don't exist to offset).
 */

import type { PrismaClient } from '@prisma/client'
import { listPayouts, parsePayout } from '@/lib/paymongo'
import { postJournalEntry, type PostingLine } from './posting'
import { resolvePaymongoAccounts } from './paymongo-accounts'

export interface PayoutSyncResult { recorded: number; net: number; skipped?: string }

export async function syncPayouts(prisma: PrismaClient, userId: string): Promise<PayoutSyncResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') return { recorded: 0, net: 0, skipped: 'GL posting off' }

  const settings = await prisma.paymongoSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.autoReconcile || !settings.bankAccountId) return { recorded: 0, net: 0, skipped: 'not configured' }

  const bank = await prisma.account.findUnique({ where: { id: settings.bankAccountId }, select: { id: true, accountType: true } })
  if (!bank || bank.accountType !== 'ASSET') return { recorded: 0, net: 0, skipped: 'bank invalid' }

  // Stamp the sync time up front so the on-load poll is throttled even if the API is slow/down.
  await prisma.paymongoSettings.update({ where: { id: 'singleton' }, data: { lastSyncAt: new Date() } })

  let payouts: unknown[]
  try { payouts = await listPayouts({ limit: 20 }) }
  catch (e) { console.error('[PayMongo] listPayouts failed:', e); return { recorded: 0, net: 0, skipped: 'api error' } }

  let accounts: { clearingAccountId: string; feeAccountId: string } | null = null
  let recorded = 0, netTotal = 0

  for (const raw of payouts) {
    const p = parsePayout(raw)
    if (!p.settled || p.netPhp <= 0) continue

    // Idempotency: skip payouts already booked.
    const dup = await prisma.journalEntry.findFirst({
      where: { referenceType: 'PAYMONGO_PAYOUT', referenceId: p.payoutId }, select: { id: true },
    })
    if (dup) continue

    if (!accounts) accounts = await resolvePaymongoAccounts(prisma, userId)
    const covered = p.netPhp + p.feePhp

    // FIFO-tag unsettled paid checkouts up to the covered amount (display only).
    const unsettled = await prisma.paymongoCheckout.findMany({
      where: { status: 'PAID', payoutId: null }, orderBy: { paidAt: 'asc' },
      select: { id: true, amount: true, fee: true, netAmount: true, branch: true },
    })
    const ids: string[] = []
    const bset = new Set<string>()
    let acc = 0
    for (const c of unsettled) {
      if (acc >= covered - 0.005) break
      ids.push(c.id)
      acc += Number(c.netAmount ?? (Number(c.amount) - Number(c.fee || 0)))
      if (c.branch) bset.add(c.branch)
    }
    const branch = bset.size === 1 ? [...bset][0] : 'ALL'

    const lines: PostingLine[] = [{ accountId: bank.id, debit: p.netPhp, description: 'PayMongo payout received' }]
    if (p.feePhp > 0) lines.push({ accountId: accounts.feeAccountId, debit: p.feePhp, description: 'PayMongo payout fee' })
    lines.push({ accountId: accounts.clearingAccountId, credit: p.netPhp + p.feePhp, description: 'PayMongo clearing settled' })

    try {
      await postJournalEntry(prisma, {
        entryDate: p.paidAt || new Date(),
        description: `PayMongo payout to bank — ${p.payoutId}`,
        referenceType: 'PAYMONGO_PAYOUT',
        referenceId: p.payoutId,
        branch,
        createdById: userId,
        lines,
      })
    } catch (e) { console.error('[PayMongo] payout JE failed for', p.payoutId, e); continue }

    if (ids.length) await prisma.paymongoCheckout.updateMany({ where: { id: { in: ids } }, data: { payoutId: p.payoutId } })
    recorded++; netTotal += p.netPhp
  }

  return { recorded, net: netTotal }
}
