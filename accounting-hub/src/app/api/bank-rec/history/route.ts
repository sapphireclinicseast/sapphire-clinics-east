import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildHistory, sliceHistory } from '@/lib/bank-history'

// GET ?bankAccountId=&from=YYYY-MM-DD&to=YYYY-MM-DD&excluded=1
// A bank account the way the bank's app shows it: the bank's own lines, money
// in, money out, and the running balance after each one. Read-only.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const bankAccountId = sp.get('bankAccountId') || ''
  if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })
  const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const from = isDate(sp.get('from')) ? sp.get('from') : null
  const to = isDate(sp.get('to')) ? sp.get('to') : null
  const includeExcluded = sp.get('excluded') === '1'

  const account = await prisma.account.findFirst({
    where: { id: bankAccountId, isBankAccount: true },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true },
  })
  if (!account) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

  // The whole account is read so a period's opening balance is right however
  // far back it starts; the busiest account holds a few thousand lines.
  const rows = await prisma.bankTransaction.findMany({
    where: { bankAccountId },
    select: {
      id: true, date: true, description: true, fromToName: true, spent: true, received: true, status: true,
      statementBalance: true, splitFromId: true, sourceRowIds: true, matchLabel: true, createdAt: true,
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })
  const { lines, anchor, excludedCount, dayClose } = buildHistory(rows.map(r => ({
    ...r,
    spent: Number(r.spent), received: Number(r.received),
    statementBalance: r.statementBalance === null ? null : Number(r.statementBalance),
  })), { includeExcluded })
  const slice = sliceHistory(lines, anchor, dayClose, from, to)
  const lastDay = Object.keys(dayClose).sort().pop() ?? null

  return NextResponse.json({
    account: { ...account, currency: account.currency || 'PHP' },
    from, to,
    firstDate: lines.length ? lines[0].date : null,
    latestDate: lastDay,
    latestBalance: lastDay ? dayClose[lastDay] : null,
    excludedCount,
    ...slice,
  })
}
