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
  /**
   * A leg of a recorded currency exchange. The two legs carry different amounts
   * (one per currency), so each is offered against its own account only, and
   * callers hold them to a tighter date window than ordinary candidates.
   */
  fx?: boolean
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
  // RFPs store the paying bank account as "<accountNumber> <accountTitle>" text,
  // so scoping them to the reconciled account needs its number.
  const reconAcct = bankAccountId
    ? await prisma.account.findUnique({ where: { id: bankAccountId }, select: { accountNumber: true } })
    : null
  // An account filter that matches everything when no account is given. Only
  // for NULLABLE columns: the `null` branch also offers rows that never had an
  // account set. On a required column Prisma rejects `{ field: null }` outright
  // (the whole Promise.all dies and every picker shows "no matches") — use
  // onRequired for those.
  const on = <T extends string>(field: T, id: string | null) =>
    (id ? { OR: [{ [field]: id }, { [field]: null }] } : {}) as Record<string, unknown>
  const onRequired = <T extends string>(field: T, id: string | null) =>
    (id ? { [field]: id } : {}) as Record<string, unknown>
  const [
    transfers, rfps, orders, arPayments, salaries, benefits, taxes, advances, common, preferred, expenseEntries,
    shareholderAdvances,
  ] = await Promise.all([
    prisma.fundTransfer.findMany({
      where: { date: range, ...(bankAccountId ? { OR: [{ fromAccountId: bankAccountId }, { toAccountId: bankAccountId }] } : {}) },
      select: { id: true, refNumber: true, amount: true, date: true, fromAccountId: true, toAccountId: true, toAmount: true, exchangeRate: true },
    }),
    // Petty cash, expenses, refunds and taxes all raise a Reimbursement Report;
    // `module` says which. When Record-as-Paid captured the paying bank account
    // (debitAccount, "<number> <title>"), the RFP is offered only against that
    // account; RFPs paid before that field existed stay offered everywhere.
    prisma.reimbursementReport.findMany({
      where: { status: 'PAID', paidAt: range },
      select: { id: true, refNumber: true, grossTotal: true, paidAt: true, module: true, payableTo: true, debitAccount: true },
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
      where: { paymentDate: range, status: 'COMPLETED', ...onRequired('fromAccountId', bankAccountId) },
      select: { id: true, totalAmount: true, paymentDate: true, cutoffPeriod: true, paymentType: true },
    }),
    prisma.benefitPayment.findMany({
      where: { paymentDate: range, status: 'COMPLETED', ...onRequired('fromAccountId', bankAccountId) },
      select: { id: true, totalAmount: true, paymentDate: true, cutoffPeriod: true },
    }),
    prisma.taxPayment.findMany({
      where: { paymentDate: range, status: 'COMPLETED', ...onRequired('fromAccountId', bankAccountId) },
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
    // One-time / petty-cash expense entries paid straight from a bank account
    // (e.g. supplier TT payments recorded in Expenses). Entries already rolled
    // into an RFP are excluded — the paid RFP is the payment record there.
    prisma.pettyCashEntry.findMany({
      where: { date: range, reimbursementId: null, grossAmount: { gt: 0 } },
      select: { id: true, pcvNumber: true, grossAmount: true, date: true, requestor: true, description: true },
    }),
    // Money lent to the company by a shareholder or director — a different
    // thing from the staff cash advances above, and the only inbound source
    // that was not offerable here. Like equity, an advance names the account it
    // was debited into, so it is offered against that account only.
    prisma.advance.findMany({
      where: { dateAcquired: range, ...on('bankAccountId', bankAccountId) },
      select: { id: true, name: true, dateAcquired: true, principalAmount: true, advanceType: true },
    }),
  ])

  const out: Candidate[] = []

  for (const t of transfers) {
    // A currency exchange moves a different number in than out, so it cannot be
    // offered as one amount. Each leg is emitted against its own account: the
    // money that left the source, and the foreign amount that landed.
    if (t.toAmount != null && num(t.toAmount) > 0) {
      const rate = num(t.exchangeRate)
      const suffix = rate > 0 ? ` @ ${rate.toFixed(4)}` : ''
      if (!bankAccountId || t.fromAccountId === bankAccountId) {
        out.push({
          type: 'FUND_TRANSFER', id: t.id, label: `${t.refNumber} · Currency exchange (paid out)${suffix}`,
          date: t.date, amount: num(t.amount), dir: 'out', fx: true,
        })
      }
      if (!bankAccountId || t.toAccountId === bankAccountId) {
        out.push({
          type: 'FUND_TRANSFER', id: t.id, label: `${t.refNumber} · Currency exchange (received)${suffix}`,
          date: t.date, amount: num(t.toAmount), dir: 'in', fx: true,
        })
      }
      continue
    }
    out.push({
      type: 'FUND_TRANSFER', id: t.id, label: `${t.refNumber} · Fund Transfer`,
      date: t.date, amount: num(t.amount),
      dir: !bankAccountId ? 'either' : (t.fromAccountId === bankAccountId ? 'out' : 'in'),
    })
  }
  for (const r of rfps) {
    if (!r.paidAt) continue
    // Paid via a known bank account → only eligible against that account.
    if (reconAcct?.accountNumber && r.debitAccount && !r.debitAccount.startsWith(reconAcct.accountNumber)) continue
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
  for (const e of expenseEntries) {
    if (!e.date) continue
    const desc = (e.description || '').slice(0, 80)
    out.push({
      type: 'EXPENSE_ENTRY', id: e.id,
      label: `${e.pcvNumber || 'Expense'} · ${e.requestor || 'Expense entry'}${desc ? ` · ${desc}` : ''}`,
      date: e.date, amount: num(e.grossAmount), dir: 'out',
    })
  }
  for (const ad of shareholderAdvances) {
    out.push({
      type: 'ADVANCE', id: ad.id,
      label: `Advance received · ${ad.name}${ad.advanceType === 'KIND' ? ' · in kind' : ''}`,
      date: ad.dateAcquired, amount: num(ad.principalAmount), dir: 'in',
    })
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
