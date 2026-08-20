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
  // POS proceeds only ever land in an account named as a "Net Proceeds Account"
  // in POS → Payment Mode Settings. Petty cash accounts are funded by transfer,
  // never by sales, so orders must not be offered against them. Inactive modes
  // still count: an account that used to take proceeds holds real old deposits.
  const proceedsAccounts = new Set(
    (await prisma.paymentMode.findMany({
      where: { accountId: { not: null } },
      select: { accountId: true },
    })).map(m => m.accountId as string)
  )
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
    shareholderAdvances, loans, equityDeposits, itemisedHoldings,
    buybacks, advancePayouts, loanPayouts, staffLoans, onHandAccts,
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
      select: {
        id: true, orderNumber: true, netAmount: true, transactionDate: true, patientName: true,
        payments: { select: { paymentMode: { select: { accountId: true } } } },
      },
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
    // Loan and corporate-bond releases. Money borrowed lands in the account the
    // loan names, exactly as an advance or an equity deposit does, but was the
    // one inbound source never offered here — so a ₱1,000,000 bond subscription
    // could not be tied to the deposits that paid it.
    prisma.loan.findMany({
      where: { dateAcquired: range, ...on('bankAccountId', bankAccountId) },
      select: { id: true, name: true, dateAcquired: true, principalAmount: true, netAmountToDebit: true, loanType: true, loanEntity: true },
    }),
    // Itemised equity consideration. A holding is offered above at its full
    // issuance value on one date, which never matches a subscription paid in
    // several transfers — these are the individual deposits, each on its own
    // date and for its own amount, so each can be tied to one bank line.
    // Non-cash consideration never touched a bank account, so it is excluded.
    prisma.equityDeposit.findMany({
      where: { date: range, kind: 'CASH', ...on('bankAccountId', bankAccountId) },
      select: {
        id: true, date: true, amount: true, note: true, commonShareId: true, preferredShareId: true,
        commonShare: { select: { shareholder: { select: { name: true } } } },
        preferredShare: { select: { shareholder: { select: { name: true } } } },
      },
    }),
    // Which holdings have itemised consideration at all — deliberately NOT
    // scoped to this bank account or date range. A holding must be suppressed
    // wherever it is offered, or it would still appear at full value in the
    // account it names while its deposits are offered in another.
    prisma.equityDeposit.findMany({ select: { commonShareId: true, preferredShareId: true } }),
    // Money going back OUT to shareholders. Everything equity-shaped above is a
    // receipt, so before these a buyback or a repayment could not be matched at
    // all and had to be written straight into the database.
    prisma.shareBuyback.findMany({
      where: { date: range, ...on('bankAccountId', bankAccountId) },
      select: {
        id: true, date: true, shares: true, price: true,
        commonShare: { select: { shareholder: { select: { name: true } } } },
      },
    }),
    // Repayments of shareholder advances and of loans. Only rows already
    // recorded as paid are offered: those are actual cash movements with a date
    // and an amount, the same rule salaries and taxes follow. A scheduled
    // instalment nobody has paid yet is not a bank line waiting to be found.
    prisma.advancePayout.findMany({
      where: { status: 'PAID', paidDate: range, ...on('bankAccountId', bankAccountId) },
      select: { id: true, paidDate: true, amount: true, advance: { select: { name: true } } },
    }),
    prisma.loanPayout.findMany({
      where: { status: 'PAID', paidDate: range, ...on('bankAccountId', bankAccountId) },
      select: { id: true, paidDate: true, amount: true, loan: { select: { name: true } } },
    }),
    // Staff loan / perk releases: money out to a staff member that comes back
    // through payroll deductions. The register does not name the paying bank
    // account, so a release is offered against every account — the cheque
    // reference in the label says where to look.
    prisma.staffLoan.findMany({
      where: { dateReleased: { gte: lo, lte: hi }, principal: { gt: 0 } },
      select: { id: true, staffName: true, category: true, principal: true, dateReleased: true, chequeRef: true },
    }),
    // A transfer into a branch's petty cash account is a replenishment —
    // labelled as such so the bank's withdrawal line reads like what it is.
    // This used to key off the separate "Petty Cash on Hand" floats; those are
    // retired, and each branch's BDO Petty Cash account now holds the whole
    // pool, so the match is on "Petty Cash" alone.
    prisma.account.findMany({
      where: { accountTitle: { contains: 'Petty Cash', mode: 'insensitive' } },
      select: { id: true },
    }),
  ])
  const onHand = new Set(onHandAccts.map(a => a.id))

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
      type: 'FUND_TRANSFER', id: t.id,
      label: `${t.refNumber} · ${onHand.has(t.toAccountId) ? 'Petty cash replenishment' : 'Fund Transfer'}`,
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
    if (bankAccountId) {
      // Not a proceeds account at all (petty cash, loan accounts …) → no sales.
      if (!proceedsAccounts.has(bankAccountId)) continue
      // Otherwise offer the order only where its own payment modes lodge it.
      // Orders whose modes were never set stay offered against any proceeds
      // account, so nothing is hidden by an unfilled field.
      const lodgedIn = o.payments.map(p => p.paymentMode?.accountId).filter(Boolean) as string[]
      if (lodgedIn.length && !lodgedIn.includes(bankAccountId)) continue
    }
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
  for (const l of loans) {
    // Charges deducted at source mean the bank receives the net, so that is the
    // figure offered when one is recorded; the gross still shows in the label.
    const net = num(l.netAmountToDebit) > 0 ? num(l.netAmountToDebit) : num(l.principalAmount)
    const kind = l.loanType === 'CORPORATE_BOND' ? 'Corporate bond' : l.loanType === 'KIND' ? 'Loan in kind' : 'Loan'
    out.push({
      type: 'LOAN', id: l.id,
      label: `${kind} received · ${l.name}${net !== num(l.principalAmount) ? ` · net of charges (₱${num(l.principalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} gross)` : ''}`,
      date: l.dateAcquired, amount: net, dir: 'in',
    })
  }
  // A holding whose consideration is itemised is represented by its deposits
  // below, not by its own full issuance value — offering both would invite the
  // same subscription being tagged twice.
  const itemisedCommon = new Set(itemisedHoldings.map(d => d.commonShareId).filter(Boolean) as string[])
  const itemisedPreferred = new Set(itemisedHoldings.map(d => d.preferredShareId).filter(Boolean) as string[])
  for (const [rows, kind] of [[common, 'Common'], [preferred, 'Preferred']] as const) {
    for (const s of rows) {
      if (kind === 'Common' ? itemisedCommon.has(s.id) : itemisedPreferred.has(s.id)) continue
      out.push({
        type: 'EQUITY', id: s.id,
        label: `Equity deposit · ${kind}${s.shareholder?.name ? ` · ${s.shareholder.name}` : ''}`,
        date: s.dateAcquired, amount: Math.round(num(s.numberOfShares) * num(s.pricePerShare) * 100) / 100,
        dir: 'in',
      })
    }
  }
  for (const b of buybacks) {
    const who = b.commonShare?.shareholder?.name || ''
    const shares = num(b.shares)
    out.push({
      type: 'BUYBACK', id: b.id,
      label: `Share buyback · ${who || 'shareholder'}${shares > 0 ? ` · ${shares.toLocaleString('en-PH')} shares @ ₱${num(b.price)}` : ''}`,
      date: b.date, amount: Math.round(shares * num(b.price) * 100) / 100,
      dir: 'out',
    })
  }
  for (const p of advancePayouts) {
    out.push({
      type: 'ADVANCE_PAYMENT', id: p.id,
      label: `Advance repayment · ${p.advance?.name || 'shareholder'}`,
      date: p.paidDate as Date, amount: num(p.amount), dir: 'out',
    })
  }
  for (const p of loanPayouts) {
    out.push({
      type: 'LOAN_PAYMENT', id: p.id,
      label: `Loan repayment · ${p.loan?.name || 'lender'}`,
      date: p.paidDate as Date, amount: num(p.amount), dir: 'out',
    })
  }
  for (const sl of staffLoans) {
    out.push({
      type: 'STAFF_LOAN', id: sl.id,
      label: `Staff loan release · ${sl.staffName} · ${sl.category.replace(/_/g, ' ').toLowerCase()}${sl.chequeRef ? ` · cheque ${sl.chequeRef}` : ''}`,
      date: sl.dateReleased as Date, amount: num(sl.principal), dir: 'out',
    })
  }
  for (const d of equityDeposits) {
    const who = d.commonShare?.shareholder?.name || d.preferredShare?.shareholder?.name || ''
    const kind = d.commonShare ? 'Common' : 'Preferred'
    out.push({
      type: 'EQUITY_DEPOSIT', id: d.id,
      label: `Equity deposit · ${kind}${who ? ` · ${who}` : ''}${d.note ? ` · ${d.note}` : ''}`,
      date: d.date, amount: Math.round(num(d.amount) * 100) / 100,
      dir: 'in',
    })
  }
  // Open payable bills — accruals (Dr expense-or-asset / Cr A-P) whose payment
  // was never recorded, mostly QB-era imports. They carry no bank leg, so the
  // matcher could never offer them; the AP_BILL match action posts the
  // settlement (Dr the payable / Cr the reconciled bank account) when picked.
  const payableAccts = await prisma.account.findMany({
    where: { accountNumber: { in: ['4010', '5040'] } }, select: { id: true },
  })
  if (payableAccts.length) {
    const billLines = await prisma.journalEntryLine.findMany({
      where: {
        accountId: { in: payableAccts.map(p => p.id) },
        credit: { gt: 0 },
        journalEntry: { entryDate: range, referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] } },
      },
      select: {
        credit: true,
        journalEntry: { select: { id: true, entryDate: true, description: true } },
      },
    })
    if (billLines.length) {
      const settled = new Set((await prisma.journalEntry.findMany({
        where: { referenceId: { in: billLines.map(l => `APSETTLE:${l.journalEntry.id}`) } },
        select: { referenceId: true },
      })).map(j => (j.referenceId || '').slice('APSETTLE:'.length)))
      for (const l of billLines) {
        if (settled.has(l.journalEntry.id)) continue
        out.push({
          type: 'AP_BILL', id: l.journalEntry.id,
          label: `${(l.journalEntry.description || 'Payable bill').slice(0, 140)} · unpaid A/P bill`,
          date: l.journalEntry.entryDate, amount: num(l.credit), dir: 'out',
        })
      }
    }
  }

  return out
}

/** Candidates that could account for a bank line of this direction. */
export function forDirection(all: Candidate[], isSpent: boolean): Candidate[] {
  return all.filter(c => c.dir === 'either' || c.dir === (isSpent ? 'out' : 'in'))
}
