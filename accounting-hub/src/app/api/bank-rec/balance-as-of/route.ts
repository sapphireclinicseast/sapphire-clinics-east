import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isForeign, rateFor, toPhp } from '@/lib/fx'
import { closingLine, statementDay } from '@/lib/bank-statement-order'

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
    // Excluded/archived lines are ones the user switched off in Bank Rec, so
    // their printed running balance must not seed an opening balance either.
    const live = {
      bankAccountId: a.id, date: { lte: upTo }, statementBalance: { not: null },
      status: { in: ['PENDING', 'POSTED'] },
    }
    const last = await prisma.bankTransaction.findFirst({ where: live, orderBy: { date: 'desc' }, select: { date: true } })
    // The line that closed that day, read from the running balance — a
    // newest-first upload stores the day's first line last (lib/bank-statement-order).
    const line = last
      ? closingLine(await prisma.bankTransaction.findMany({
          where: { ...live, date: { gte: new Date(`${statementDay(last.date)}T00:00:00.000Z`), lte: upTo } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          select: { date: true, statementBalance: true, spent: true, received: true },
        }))
      : undefined
    // How far the uploaded data actually runs, so a stale figure is visible.
    const latest = await prisma.bankTransaction.findFirst({
      where: { bankAccountId: a.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    })
    const native = line?.statementBalance != null ? Number(line.statementBalance) : null
    // Beginning Balances feeds the Balance Sheet, which is PHP throughout, so a
    // foreign account's opening figure has to be its PHP equivalent — posting
    // the native figure would read as pesos and misstate total assets.
    const cur = a.currency || 'PHP'
    const rate = native !== null && isForeign(cur) ? await rateFor(cur, new Date(date)) : null
    out.push({
      accountId: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle,
      currency: cur,
      native,
      balance: native === null ? null : (isForeign(cur) ? (rate ? toPhp(native, rate.phpPerUnit) : null) : native),
      rate: rate?.phpPerUnit ?? null,
      rateDate: rate?.rateDate ?? null,
      needsRate: native !== null && isForeign(cur) && !rate,
      asOf: line?.date ? line.date.toISOString().slice(0, 10) : null,
      dataThrough: latest?.date ? latest.date.toISOString().slice(0, 10) : null,
    })
  }
  return NextResponse.json({ date, accounts: out })
}
