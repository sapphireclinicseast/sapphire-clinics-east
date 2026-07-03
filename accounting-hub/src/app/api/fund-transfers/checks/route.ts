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

  type Row = { id?: string; source: string; checkNumber: string; date: string | null; amount: number; reference: string; payee: string; bankAccount: string; proofUrls?: string[] }
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

  // 4. Manually-recorded cancelled checks
  const cancelled = await prisma.cancelledCheck.findMany({
    where: { accountId: { in: [...idSet] } },
    select: { id: true, checkNumber: true, date: true, amount: true, reason: true, payee: true, accountId: true, proofUrls: true },
  })
  for (const cc of cancelled) {
    rows.push({
      id: cc.id,
      source: 'Cancelled',
      checkNumber: cc.checkNumber || '',
      date: cc.date?.toISOString().slice(0, 10) || null,
      amount: Number(cc.amount || 0),
      reference: cc.reason || '',
      payee: cc.payee || '',
      bankAccount: acctById.get(cc.accountId) || '',
      proofUrls: Array.isArray(cc.proofUrls) ? (cc.proofUrls as string[]) : [],
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

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// POST — record a cancelled check for a checking account.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { accountId, checkNumber, date, reason, payee, amount, proofUrls } = await req.json()
    if (!accountId || !checkNumber?.trim() || !date) {
      return NextResponse.json({ error: 'Checking account, check number and date are required' }, { status: 400 })
    }
    const acct = await prisma.account.findFirst({ where: { id: accountId, isCheckingAccount: true } })
    if (!acct) return NextResponse.json({ error: 'Not a valid checking account' }, { status: 400 })
    const created = await prisma.cancelledCheck.create({
      data: {
        accountId,
        checkNumber: String(checkNumber).trim(),
        date: new Date(date),
        reason: reason?.trim() || null,
        payee: payee?.trim() || null,
        amount: Number(amount) || 0,
        proofUrls: Array.isArray(proofUrls) && proofUrls.length ? proofUrls : undefined,
        createdById: session.user.id as string,
      },
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e) {
    console.error('Cancelled check create error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a mistakenly-recorded cancelled check by id.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.cancelledCheck.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}
