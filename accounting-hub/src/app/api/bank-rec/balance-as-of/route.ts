import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?date=YYYY-MM-DD → for every bank account that has uploaded statement
// lines carrying a running balance, the balance as of that date.
//
// This reads the figure the bank itself printed on the last line on or before
// the date, rather than summing movements: a sum gives the change over a
// period, not the position at a point in time.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const date = new URL(req.url).searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date=YYYY-MM-DD is required' }, { status: 400 })
  }
  const upTo = new Date(`${date}T23:59:59.999Z`)

  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true },
    orderBy: { accountNumber: 'asc' },
  })

  const out = []
  for (const a of accounts) {
    const line = await prisma.bankTransaction.findFirst({
      where: { bankAccountId: a.id, date: { lte: upTo }, statementBalance: { not: null } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { date: true, statementBalance: true, description: true },
    })
    // How far the uploaded data actually runs, so a stale figure is visible.
    const latest = await prisma.bankTransaction.findFirst({
      where: { bankAccountId: a.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    })
    out.push({
      accountId: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle,
      currency: a.currency || 'PHP',
      balance: line?.statementBalance != null ? Number(line.statementBalance) : null,
      asOf: line?.date ? line.date.toISOString().slice(0, 10) : null,
      dataThrough: latest?.date ? latest.date.toISOString().slice(0, 10) : null,
    })
  }
  return NextResponse.json({ date, accounts: out })
}
