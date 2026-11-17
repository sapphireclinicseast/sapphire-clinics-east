import type { PrismaClient, Prisma } from '@prisma/client'

// The branch an HMO / GL collection belongs to — the branch its journal entry
// is tagged with, so the branch Balance Sheets see it (Hannah 2026-11-18 ledger
// reconciliation: a payment saved with no branch posts its entry under "ALL",
// which the East / Greenhills views never count).
//
// The Payment History form used to send the page's branch FILTER as the
// payment's branch: recording with the filter on "All" saved no branch, and
// editing a payment with the filter on "All" erased the branch it had
// (AHEA-AR26-0017, 2026-10-31). The branch now comes from the collection itself:
//   1. the wallet's branch — a Guarantee Letter belongs to one branch;
//   2. else the branch of the sessions it pays, when they all share one
//      (HMO wallets are company-wide);
//   3. else the branch of the bank account it was deposited to;
//   4. else the branch the screen was filtered to, if any.
// A Greenhills session paid into East's bank stays Greenhills (rule 2 before 3).

type Db = PrismaClient | Prisma.TransactionClient

const real = (b: string | null | undefined) => (b && b !== 'ALL' ? b : null)

export async function collectionBranch(db: Db, opts: {
  walletBranch?: string | null
  orderIds?: string[] | null
  cashAccountId?: string | null
  requested?: string | null
}): Promise<string | null> {
  const fromWallet = real(opts.walletBranch)
  if (fromWallet) return fromWallet

  if (opts.orderIds?.length) {
    const orders = await db.order.findMany({ where: { id: { in: opts.orderIds } }, select: { branch: true } })
    const branches = [...new Set(orders.map(o => real(o.branch as string | null)).filter(Boolean))]
    if (branches.length === 1) return branches[0] as string
  }

  if (opts.cashAccountId) {
    const acct = await db.account.findUnique({ where: { id: opts.cashAccountId }, select: { branch: true } })
    const fromBank = real(acct?.branch as string | null)
    if (fromBank) return fromBank
  }

  return real(opts.requested)
}
