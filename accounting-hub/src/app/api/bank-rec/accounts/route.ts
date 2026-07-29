import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const [counts, postedAgg, balances] = await Promise.all([
    prisma.bankTransaction.groupBy({ by: ['bankAccountId', 'status'], where: { bankAccountId: { in: ids } }, _count: { _all: true } }),
    prisma.bankTransaction.groupBy({ by: ['bankAccountId'], where: { bankAccountId: { in: ids }, status: 'POSTED' }, _sum: { spent: true, received: true } }),
    prisma.beginningBalance.findMany({ where: { accountId: { in: ids } }, orderBy: { periodYear: 'desc' } }),
  ])
  const countOf = (id: string, st: string) => counts.find(c => c.bankAccountId === id && c.status === st)?._count._all || 0
  const begOf = (id: string) => balances.find(b => b.accountId === id) // latest year
  const postOf = (id: string) => postedAgg.find(p => p.bankAccountId === id)

  return NextResponse.json(accounts.map(a => {
    const beg = begOf(a.id)
    const begAmt = beg ? Number(beg.amount) : 0
    const p = postOf(a.id)
    const movement = p ? (Number(p._sum.received || 0) - Number(p._sum.spent || 0)) : 0
    return {
      id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle, currency: a.currency,
      pendingCount: countOf(a.id, 'PENDING'), postedCount: countOf(a.id, 'POSTED'), excludedCount: countOf(a.id, 'EXCLUDED'),
      archivedCount: countOf(a.id, 'ARCHIVED'),
      beginningBalance: begAmt, startDate: beg?.startDate ? new Date(beg.startDate).toISOString().slice(0, 10) : null,
      postedBalance: begAmt + movement,
    }
  }))
}
