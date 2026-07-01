import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES  = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// GET /api/beginning-balances?year=2026
//   Returns one row per Account for the requested fiscal year. Accounts with no
//   stored opening balance get amount=0 so the UI can list every account.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true, normalBalance: true, isBankAccount: true },
      orderBy: { accountNumber: 'asc' },
    }),
    prisma.beginningBalance.findMany({ where: { periodYear: year } }),
  ])

  const byAcct = new Map(balances.map(b => [b.accountId, b]))
  const rows = accounts.map(a => {
    const b = byAcct.get(a.id)
    return {
      accountId: a.id,
      accountNumber: a.accountNumber,
      accountTitle: a.accountTitle,
      accountType: a.accountType,
      subType: a.subType,
      normalBalance: a.normalBalance,
      amount: b ? Number(b.amount) : 0,
      notes: b?.notes || '',
      startDate: b?.startDate ? new Date(b.startDate).toISOString().slice(0, 10) : '',
      isBankAccount: a.isBankAccount,
      hasRow: !!b,
    }
  })

  return NextResponse.json({ year, rows })
}

// POST /api/beginning-balances  body: { year, entries: [{ accountId, amount, notes? }, ...] }
//   Upserts every entry as a single transaction.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { year, entries } = await req.json() as {
      year: number
      entries: { accountId: string; amount: number; notes?: string; startDate?: string | null }[]
    }
    if (!year || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'year and entries are required' }, { status: 400 })
    }

    const results = await prisma.$transaction(entries.map(e =>
      prisma.beginningBalance.upsert({
        where: { accountId_periodYear: { accountId: e.accountId, periodYear: year } },
        update: { amount: e.amount, notes: e.notes || null, startDate: e.startDate ? new Date(e.startDate) : null },
        create: {
          accountId: e.accountId,
          periodYear: year,
          amount: e.amount,
          notes: e.notes || null,
          startDate: e.startDate ? new Date(e.startDate) : null,
          createdById: session.user.id,
        },
      })
    ))

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPSERT',
        entity: 'beginningBalance',
        details: { year, count: entries.length },
      },
    })

    return NextResponse.json({ count: results.length })
  } catch (err) {
    console.error('beginning-balances POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
