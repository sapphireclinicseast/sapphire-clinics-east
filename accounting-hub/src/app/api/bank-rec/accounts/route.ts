import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isForeign, rateFor, toPhp } from '@/lib/fx'

// GET → bank accounts (COA isBankAccount) with pending/posted/excluded counts,
// beginning balance + start date, and a posted running balance.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true },
    orderBy: { accountNumber: 'asc' },
  })
  if (accounts.length === 0) return NextResponse.json([])

  const ids = accounts.map(a => a.id)
  const balances = await prisma.beginningBalance.findMany({ where: { accountId: { in: ids } }, orderBy: { periodYear: 'desc' } })
  const begOf = (id: string) => balances.find(b => b.accountId === id) // latest year

  // Movement counts only from the beginning-balance date onwards — the opening
  // figure already contains everything before it. Summing every POSTED line
  // regardless of date stacked the whole of 2024-25 on top of a 2026-01-01
  // opening balance, so the card overstated by millions and grew further every
  // time a historical line was matched.
  const dateWindow = () => accounts.map(a => {
    const start = begOf(a.id)?.startDate
    return start ? { bankAccountId: a.id, date: { gte: new Date(start) } } : { bankAccountId: a.id }
  })
  const [counts, postedAgg, statementAgg] = await Promise.all([
    prisma.bankTransaction.groupBy({ by: ['bankAccountId', 'status'], where: { bankAccountId: { in: ids } }, _count: { _all: true } }),
    prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { status: 'POSTED', OR: dateWindow() },
      _sum: { spent: true, received: true },
    }),
    // Every line the statement actually carries — tagged or not. The posted
    // figure only moves once a line is categorised or matched, so deleting a
    // still-pending line left the card unchanged and the page looked stuck.
    // This one counts pending lines too, so adding or removing any line shows.
    prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { status: { in: ['PENDING', 'POSTED'] }, OR: dateWindow() },
      _sum: { spent: true, received: true },
    }),
  ])
  const countOf = (id: string, st: string) => counts.find(c => c.bankAccountId === id && c.status === st)?._count._all || 0
  const postOf = (id: string) => postedAgg.find(p => p.bankAccountId === id)
  const stmtOf = (id: string) => statementAgg.find(p => p.bankAccountId === id)

  // Foreign accounts are also shown in PHP, at the latest rate on file, so the
  // figure on the card can be read against the rest of the (PHP) books.
  const fx = new Map<string, { phpPerUnit: number; rateDate: string } | null>()
  for (const a of accounts) {
    const cur = a.currency || 'PHP'
    if (isForeign(cur) && !fx.has(cur)) fx.set(cur, await rateFor(cur, new Date()))
  }

  return NextResponse.json(accounts.map(a => {
    const beg = begOf(a.id)
    const begAmt = beg ? Number(beg.amount) : 0
    const p = postOf(a.id)
    const movement = p ? (Number(p._sum.received || 0) - Number(p._sum.spent || 0)) : 0
    const s = stmtOf(a.id)
    const stmtMovement = s ? (Number(s._sum.received || 0) - Number(s._sum.spent || 0)) : 0
    return {
      id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle, currency: a.currency,
      pendingCount: countOf(a.id, 'PENDING'), postedCount: countOf(a.id, 'POSTED'), excludedCount: countOf(a.id, 'EXCLUDED'),
      archivedCount: countOf(a.id, 'ARCHIVED'),
      beginningBalance: begAmt, startDate: beg?.startDate ? new Date(beg.startDate).toISOString().slice(0, 10) : null,
      postedBalance: begAmt + movement,
      statementBalance: begAmt + stmtMovement,
      fxRate: isForeign(a.currency || 'PHP') ? (fx.get(a.currency || 'PHP')?.phpPerUnit ?? null) : null,
      fxRateDate: isForeign(a.currency || 'PHP') ? (fx.get(a.currency || 'PHP')?.rateDate ?? null) : null,
      postedBalancePhp: isForeign(a.currency || 'PHP') && fx.get(a.currency || 'PHP')
        ? toPhp(begAmt + movement, fx.get(a.currency || 'PHP')!.phpPerUnit) : null,
    }
  }))
}
