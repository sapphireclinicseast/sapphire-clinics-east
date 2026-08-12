import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Which bank accounts take part in buying foreign currency.
//
// Currency-exchange matching pairs on direction and date alone — the two sides
// never share an amount — so it needs to be told which accounts are actually
// involved, or it offers every account that merely happens to hold another
// currency.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true, bankRetiredAt: null },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true, isForexAccount: true },
    orderBy: { accountNumber: 'asc' },
  })
  const chosen = accounts.filter(a => a.isForexAccount).length
  return NextResponse.json({
    accounts,
    // Nothing chosen means no preference has been recorded, not "none of them" —
    // matching keeps considering every cross-currency account until it is set.
    configured: chosen > 0,
  })
}

// POST { accountIds: string[] } — the complete set, replacing what was there.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { accountIds } = await req.json() as { accountIds: string[] }
    const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : []
    await prisma.$transaction([
      prisma.account.updateMany({ where: { isBankAccount: true }, data: { isForexAccount: false } }),
      ...(ids.length ? [prisma.account.updateMany({ where: { id: { in: ids } }, data: { isForexAccount: true } })] : []),
    ])
    return NextResponse.json({ success: true, count: ids.length })
  } catch (e) {
    console.error('Forex account settings error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
