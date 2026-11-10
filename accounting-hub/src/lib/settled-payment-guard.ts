import type { Prisma, PrismaClient } from '@prisma/client'

// A POS payment that bank reconciliation has matched to a deposit carries a
// PosSettlementPayment link (orderPaymentId, no FK). Deleting that payment, or
// changing its amount, leaves the link pointing at nothing (or at the wrong
// amount): the deposit stops tying, Sales Checking loses the day's tick and the
// link has to be found and repaired by hand. So an order edit may not remove or
// re-amount a matched payment — the match has to be undone in Bank Rec first.
// Method / mode / reference corrections are fine: the link stays valid.

type Db = PrismaClient | Prisma.TransactionClient

export interface IncomingPaymentLine { id?: string; method: string; amount: number }

export interface SettledPaymentEdit {
  paymentId: string
  method: string
  amount: number
  newAmount: number | null // null = the edit removes this payment
  depositDate: string | null // YYYY-MM-DD of the bank line
  depositAmount: number | null
  bankAccount: string | null
}

const METHOD_LABEL: Record<string, string> = {
  CREDIT_CARD: 'card', DEBIT: 'debit', GCASH: 'GCash', PAYMAYA: 'PayMaya', CASH: 'cash', PAYMONGO: 'PayMongo',
}

export class SettledPaymentEditError extends Error {
  constructor(public readonly edits: SettledPaymentEdit[]) {
    super(settledEditMessage(edits))
    this.name = 'SettledPaymentEditError'
  }
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Existing payments on the order that the incoming lines would remove or re-amount AND that bank rec has matched to a deposit. */
export async function settledPaymentEdits(db: Db, orderId: string, incoming: IncomingPaymentLine[]): Promise<SettledPaymentEdit[]> {
  const old = await db.orderPayment.findMany({ where: { orderId }, select: { id: true, method: true, amount: true } })
  if (!old.length) return []
  const sent = new Map<string, IncomingPaymentLine>()
  for (const p of incoming) if (p.id) sent.set(p.id, p)
  const touched = old
    .map(o => {
      const line = sent.get(o.id)
      const newAmount = line ? Number(line.amount) || 0 : null
      return { o, newAmount }
    })
    .filter(({ o, newAmount }) => newAmount === null || newAmount <= 0 || Math.abs(newAmount - Number(o.amount)) > 0.005)
  if (!touched.length) return []

  const links = await db.posSettlementPayment.findMany({
    where: { orderPaymentId: { in: touched.map(t => t.o.id) } },
    select: { orderPaymentId: true, batchId: true },
  })
  if (!links.length) return []
  const batches = await db.posSettlementBatch.findMany({
    where: { id: { in: [...new Set(links.map(l => l.batchId))] } },
    select: { id: true, bankTransactionId: true },
  })
  const txns = await db.bankTransaction.findMany({
    where: { id: { in: [...new Set(batches.map(b => b.bankTransactionId))] } },
    select: { id: true, date: true, received: true, bankAccountId: true },
  })
  const accounts = await db.account.findMany({
    where: { id: { in: [...new Set(txns.map(t => t.bankAccountId))] } },
    select: { id: true, accountTitle: true },
  })
  const batchById = new Map(batches.map(b => [b.id, b]))
  const txnById = new Map(txns.map(t => [t.id, t]))
  const acctById = new Map(accounts.map(a => [a.id, a.accountTitle]))
  const linkByPayment = new Map(links.map(l => [l.orderPaymentId, l]))

  const out: SettledPaymentEdit[] = []
  for (const { o, newAmount } of touched) {
    const link = linkByPayment.get(o.id)
    if (!link) continue
    const txn = txnById.get(batchById.get(link.batchId)?.bankTransactionId ?? '')
    out.push({
      paymentId: o.id,
      method: String(o.method),
      amount: Number(o.amount),
      newAmount: newAmount !== null && newAmount > 0 ? newAmount : null,
      depositDate: txn ? new Date(txn.date).toISOString().slice(0, 10) : null,
      depositAmount: txn ? Number(txn.received) : null,
      bankAccount: txn ? acctById.get(txn.bankAccountId) ?? null : null,
    })
  }
  return out
}

export function settledEditMessage(edits: SettledPaymentEdit[]): string {
  const e = edits[0]
  if (!e) return ''
  const what = `${peso(e.amount)} ${METHOD_LABEL[e.method] || e.method.toLowerCase()} payment`
  const change = e.newAmount === null ? 'removed' : `changed to ${peso(e.newAmount)}`
  const deposit = e.depositDate
    ? `the ${e.bankAccount ? `${e.bankAccount} ` : ''}deposit of ${e.depositDate}${e.depositAmount !== null ? ` (${peso(e.depositAmount)})` : ''}`
    : 'a bank deposit'
  const more = edits.length > 1 ? ` (and ${edits.length - 1} more matched payment${edits.length > 2 ? 's' : ''})` : ''
  return `The ${what}${more} is matched to ${deposit} in Bank Rec, so it can't be ${change} here. Undo that match in Bank Rec first (or ask Accounting), then edit the payment. Changing only the method or reference is fine.`
}
