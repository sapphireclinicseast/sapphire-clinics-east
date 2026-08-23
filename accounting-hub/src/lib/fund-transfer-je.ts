/**
 * The journal entry behind a fund transfer.
 *
 * Moving money between two of our own accounts is a real ledger event — cash
 * leaves one account and arrives in another — but for a long time the Fund
 * Transfer record was the ONLY trace of it. With no journal entry the ledger
 * never moved the money, so accounts that receive transfers (BDO operating)
 * drifted deeply negative while the accounts that send them (AUB settlement)
 * ballooned, and the balance sheet's bank true-up had to swallow the whole
 * difference in one month. Posting the entry keeps per-account cash honest.
 *
 * Total cash is unaffected: one account is debited and the other credited for
 * the same amount, so only the split between accounts changes.
 */

/** Same-currency transfers only — see postFundTransferJE. */
export function isCrossCurrency(ft: { toAmount: unknown | null }): boolean {
  return ft.toAmount != null && Number(ft.toAmount) > 0
}

export const FT_REF_TYPE = 'FUND_TRANSFER'

/**
 * Post (or re-post) the entry for one transfer inside an existing transaction.
 *
 * Cross-currency exchanges are deliberately skipped: the two legs carry
 * different amounts in different currencies, so the entry needs an FX
 * gain/loss policy that has not been decided. Those keep behaving exactly as
 * they do today rather than being booked at a guessed rate.
 *
 * Idempotent — an entry already referencing this transfer is left alone, so
 * backfills and retries cannot double-post.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postFundTransferJE(tx: any, transferId: string, userId: string | null): Promise<string | null> {
  const ft = await tx.fundTransfer.findUnique({
    where: { id: transferId },
    select: {
      id: true, refNumber: true, date: true, amount: true, toAmount: true,
      description: true, checkNumber: true,
      fromAccountId: true, toAccountId: true,
    },
  })
  if (!ft) return null
  if (isCrossCurrency(ft)) return null
  if (!ft.fromAccountId || !ft.toAccountId || ft.fromAccountId === ft.toAccountId) return null
  const amount = Number(ft.amount)
  if (!(amount > 0)) return null

  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: FT_REF_TYPE, referenceId: ft.id },
    select: { id: true },
  })
  if (existing) return existing.id

  const [from, to] = await Promise.all([
    tx.account.findUnique({ where: { id: ft.fromAccountId }, select: { accountNumber: true, accountTitle: true } }),
    tx.account.findUnique({ where: { id: ft.toAccountId }, select: { accountNumber: true, accountTitle: true } }),
  ])
  const label = `${ft.refNumber} · transfer ${from?.accountNumber || ''} → ${to?.accountNumber || ''}`
    + (ft.checkNumber ? ` · check ${ft.checkNumber}` : '')

  const created = await tx.journalEntry.create({
    data: {
      entryDate: ft.date,
      description: ft.description ? `${label} · ${ft.description}`.slice(0, 500) : label,
      referenceType: FT_REF_TYPE,
      referenceId: ft.id,
      totalAmount: amount,
      createdById: userId,
      lines: {
        create: [
          { accountId: ft.toAccountId, debit: amount, credit: 0, description: `Received — ${to?.accountTitle || ''}` },
          { accountId: ft.fromAccountId, debit: 0, credit: amount, description: `Paid out — ${from?.accountTitle || ''}` },
        ],
      },
    },
    select: { id: true },
  })
  return created.id
}

/** Drop the entry when a transfer is deleted or undone, so cash does not move twice. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function removeFundTransferJE(tx: any, transferId: string): Promise<void> {
  await tx.journalEntry.deleteMany({ where: { referenceType: FT_REF_TYPE, referenceId: transferId } })
}
