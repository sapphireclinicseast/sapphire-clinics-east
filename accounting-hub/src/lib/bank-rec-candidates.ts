import { prisma } from '@/lib/prisma'

/**
 * Everything the Hub has recorded that a bank line could correspond to.
 *
 * Both the Match picker and the grid's highlighting read from here, so a source
 * added once is offered in both places — previously they each knew about a
 * different subset, and anything missing from a list simply looked unmatchable.
 */
export interface Candidate {
  type: string
  id: string
  label: string
  date: Date
  amount: number
  /** 'out' leaves the bank account, 'in' arrives, 'either' can be both */
  dir: 'in' | 'out' | 'either'
}

const num = (v: unknown) => Number(v ?? 0)

/**
 * @param bankAccountId scope to one bank account, or null for every record the
 *   Hub holds regardless of which account it moved through — what the untagged
 *   view needs, since a record with no bank account named is exactly the kind
 *   that goes unnoticed.
 */
export async function candidates(bankAccountId: string | null, lo: Date, hi: Date): Promise<Candidate[]> {
  const range = { gte: lo, lte: hi }
  // An account filter that matches everything when no account is given.
  const on = <T extends string>(field: T, id: string | null) =>
    (id ? { OR: [{ [field]: id }, { [field]: null }] } : {}) as Record<string, unknown>
  const [
    transfers, rfps, orders, arPayments, salaries, benefits, taxes, advances, common, preferred,
  ] = await Promise.all([
    prisma.fundTransfer.findMany({
      where: { date: range, ...(bankAccountId ? { OR: [{ fromAccountId: bankAccountId }, { toAccountId: bankAccountId }] } : {}) },
      select: { id: true, refNumber: true, amount: true, date: true, fromAccountId: true },
    }),
    // Petty cash, expenses, refunds and taxes all raise a Reimbursement Report;
    // `module` says which. It carries no bank account, so it is offered against
    // any account and settled on amount and date.
    prisma.reimbursementReport.findMany({
      where: { status: 'PAID', paidAt: range },
      select: { id: true, refNumber: true, grossTotal: true, paidAt: true, module: true, payableTo: true },
    }),
    prisma.order.findMany({
      where: { status: 'COMPLETED', transactionDate: range },
      select: { id: true, orderNumber: true, netAmount: true, transactionDate: true, patientName: true },
    }),
    // The rest name the bank account they moved through. Rows that never had one
    // set are still offered, so nothing is hidden by an unfilled field.
    prisma.aRPayment.findMany({
      where: { paymentDate: range, ...on('cashAccountId', bankAccountId) },
      select: { id: true, amount: true, paymentDate: true, salesInvoiceNumber: true },
    }),
    prisma.salaryPayment.findMany({
      where: { paymentDate: range, status: 'COMPLETED', ...on('fromAccountId', bankAccountId) },
      select: { id: true, totalAmount: true, paymentDate: true, cutoffPeriod: true, paymentType: true },
    }),
    prisma.benefitPayment.findMany({
      where: { paymentDate: range, status: 'COMPLETED', ...on('fromAccountId', bankAccountId) },
      select: { id: true, totalAmount: true, paymentDate: true, cutoffPeriod: true },
    }),
    prisma.taxPayment.findMany({
      where: { paymentDate: range, status: 'COMPLETED', ...on('fromAccountId', bankAccountId) },
      select: { id: true, totalAmount: true, paymentDate: true, paymentType: true },
    }),
    prisma.cashAdvance.findMany({
      where: { dateReleased: range, ...on('sourceAccountId', bankAccountId) },
      select: { id: true, refNumber: true, amount: true, dateReleased: true, accountableName: true },
    }),
    // Equity deposits name the account they were debited into, so they are only
    // offered against that account.
    prisma.commonShare.findMany({
      where: { dateAcquired: range, ...on('bankAccountId', bankAccountId) },
      select: { id: true, dateAcquired: true, numberOfShares: true, pricePerShare: true, shareholder: { select: { name: true } } },
    }),
    prisma.preferredShare.findMany({
      where: { dateAcquired: range, ...on('bankAccountId', bankAccountId) },
      select: { id: true, dateAcquired: true, numberOfShares: true, pricePerShare: true, shareholder: { select: { name: true } } },
    }),
  ])

  const out: Candidate[] = []

  for (const t of transfers) {
    out.push({
      type: 'FUND_TRANSFER', id: t.id, label: `${t.refNumber} · Fund Transfer`,
      date: t.date, amount: num(t.amount),
      dir: !bankAccountId ? 'either' : (t.fromAccountId === bankAccountId ? 'out' : 'in'),
    })
  }
  for (const r of rfps) {
    if (!r.paidAt) continue
    const kind = (r.module || 'RFP').replace(/_/g, ' ').toLowerCase()
    out.push({ type: 'RFP', id: r.id, label: `${r.refNumber} · ${kind}${r.payableTo ? ` · ${r.payableTo}` : ''}`, date: r.paidAt, amount: num(r.grossTotal), dir: 'out' })
  }
  for (const o of orders) {
    out.push({
      type: 'ORDER', id: o.id, label: `Order #${o.orderNumber}${o.patientName ? ` · ${o.patientName}` : ''}`,
      date: o.transactionDate, amount: num(o.netAmount), dir: 'in',
    })
  }
  for (const p of arPayments) {
    out.push({
      type: 'AR_PAYMENT', id: p.id, label: `AR payment${p.salesInvoiceNumber ? ` · SI ${p.salesInvoiceNumber}` : ''}`,
      date: p.paymentDate, amount: num(p.amount), dir: 'in',
    })
  }
  for (const s of salaries) {
    out.push({ type: 'SALARY', id: s.id, label: `Salaries payable${s.cutoffPeriod ? ` · ${s.cutoffPeriod}` : ''}${s.paymentType ? ` · ${s.paymentType}` : ''}`, date: s.paymentDate, amount: num(s.totalAmount), dir: 'out' })
  }
  for (const b of benefits) {
    out.push({ type: 'BENEFIT', id: b.id, label: `Benefits payable${b.cutoffPeriod ? ` · ${b.cutoffPeriod}` : ''}`, date: b.paymentDate, amount: num(b.totalAmount), dir: 'out' })
  }
  for (const t of taxes) {
    out.push({ type: 'TAX', id: t.id, label: `Tax payment${t.paymentType ? ` · ${t.paymentType}` : ''}`, date: t.paymentDate, amount: num(t.totalAmount), dir: 'out' })
  }
  for (const a of advances) {
    out.push({ type: 'CASH_ADVANCE', id: a.id, label: `${a.refNumber} · Cash advance${a.accountableName ? ` · ${a.accountableName}` : ''}`, date: a.dateReleased, amount: num(a.amount), dir: 'out' })
  }
  for (const [rows, kind] of [[common, 'Common'], [preferred, 'Preferred']] as const) {
    for (const s of rows) {
      out.push({
        type: 'EQUITY', id: s.id,
        label: `Equity deposit · ${kind}${s.shareholder?.name ? ` · ${s.shareholder.name}` : ''}`,
        date: s.dateAcquired, amount: Math.round(num(s.numberOfShares) * num(s.pricePerShare) * 100) / 100,
        dir: 'in',
      })
    }
  }
  return out
}

/** Candidates that could account for a bank line of this direction. */
export function forDirection(all: Candidate[], isSpent: boolean): Candidate[] {
  return all.filter(c => c.dir === 'either' || c.dir === (isSpent ? 'out' : 'in'))
}
