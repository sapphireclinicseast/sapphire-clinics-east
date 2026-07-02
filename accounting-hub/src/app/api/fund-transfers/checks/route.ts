import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Check Release Monitoring — GET /api/fund-transfers/checks?accountId=<id|all>
 *
 * Aggregates every check drawn from a CHECKING account (Account.isCheckingAccount)
 * across the four payment sources, enumerated by check number:
 *   - Petty Cash / Expenses (PettyCashEntry.paymentBankAccount)
 *   - RFP / Tax payments     (ReimbursementReport.debitAccount | depositAccount)
 *   - Fund Transfers         (FundTransfer.fromAccountId)
 * Not branch-scoped — Fund Transfer shows all transactions regardless of branch.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(req.url).searchParams.get('accountId') || 'all'

  // The dropdown must always list ALL checking accounts. Only the check ROWS are
  // scoped to the selected account — filtering the account list itself made the
  // other accounts vanish once one was picked.
  const allChecking = await prisma.account.findMany({
    where: { isCheckingAccount: true },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
  const accountsList = allChecking.map(a => ({ id: a.id, label: `${a.accountNumber} ${a.accountTitle}` }))
  if (allChecking.length === 0) return NextResponse.json({ checks: [], accounts: [] })

  const checking = accountId !== 'all' ? allChecking.filter(a => a.id === accountId) : allChecking
  if (checking.length === 0) return NextResponse.json({ checks: [], accounts: accountsList })

  const idSet = new Set(checking.map(a => a.id))
  // Petty cash / RFP store the bank as the "<accountNumber> <accountTitle>" string.
  const strMap = new Map<string, { id: string; label: string }>()
  for (const a of checking) {
    strMap.set(`${a.accountNumber} ${a.accountTitle}`, { id: a.id, label: `${a.accountNumber} ${a.accountTitle}` })
  }
  const strKeys = [...strMap.keys()]
  const labelFor = (s: string | null) => (s && strMap.has(s) ? strMap.get(s)!.label : s || '')

  type Row = { source: string; checkNumber: string; date: string | null; amount: number; reference: string; payee: string; bankAccount: string }
  const rows: Row[] = []

  // 1. Petty Cash + Expenses
  const pce = await prisma.pettyCashEntry.findMany({
    where: { checkNumber: { not: null }, paymentBankAccount: { in: strKeys } },
    select: { checkNumber: true, paidAt: true, date: true, grossAmount: true, requestor: true, registeredName: true, accountTitle: true, pcvNumber: true, recordType: true, paymentBankAccount: true },
  })
  for (const e of pce) {
    rows.push({
      source: e.recordType === 'PETTY_CASH' ? 'Petty Cash' : 'Expense',
      checkNumber: e.checkNumber || '',
      date: (e.paidAt || e.date)?.toISOString().slice(0, 10) || null,
      amount: Number(e.grossAmount || 0),
      reference: e.pcvNumber || '',
      payee: e.registeredName || e.requestor || e.accountTitle || '',
      bankAccount: labelFor(e.paymentBankAccount),
    })
  }

  // 2. RFP / Tax payments (amount = sum of linked entries)
  const rfps = await prisma.reimbursementReport.findMany({
    where: { checkNumber: { not: null }, OR: [{ debitAccount: { in: strKeys } }, { depositAccount: { in: strKeys } }] },
    select: { checkNumber: true, paidAt: true, refNumber: true, debitAccount: true, depositAccount: true, entries: { select: { grossAmount: true } } },
  })
  for (const r of rfps) {
    const bank = strMap.has(r.debitAccount || '') ? r.debitAccount : r.depositAccount
    rows.push({
      source: 'RFP / Tax',
      checkNumber: r.checkNumber || '',
      date: r.paidAt?.toISOString().slice(0, 10) || null,
      amount: r.entries.reduce((s, e) => s + Number(e.grossAmount || 0), 0),
      reference: r.refNumber || '',
      payee: '',
      bankAccount: labelFor(bank),
    })
  }

  // 3. Fund Transfers (drawn from the checking account)
  const fts = await prisma.fundTransfer.findMany({
    where: { checkNumber: { not: null }, fromAccountId: { in: [...idSet] } },
    select: { checkNumber: true, date: true, amount: true, description: true, refNumber: true, fromAccountId: true },
  })
  const acctById = new Map(checking.map(a => [a.id, `${a.accountNumber} ${a.accountTitle}`]))
  for (const f of fts) {
    rows.push({
      source: 'Fund Transfer',
      checkNumber: f.checkNumber || '',
      date: f.date?.toISOString().slice(0, 10) || null,
      amount: Number(f.amount || 0),
      reference: f.refNumber || '',
      payee: f.description || '',
      bankAccount: acctById.get(f.fromAccountId) || '',
    })
  }

  // Enumerate by check number (numeric-aware sort)
  rows.sort((a, b) => {
    const na = parseInt(a.checkNumber.replace(/\D/g, '') || '0', 10)
    const nb = parseInt(b.checkNumber.replace(/\D/g, '') || '0', 10)
    return na !== nb ? na - nb : a.checkNumber.localeCompare(b.checkNumber)
  })

  return NextResponse.json({ checks: rows, accounts: accountsList })
}
