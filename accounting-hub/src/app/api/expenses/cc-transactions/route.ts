import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

// GET /api/expenses/cc-transactions?branch=&cardId=&month=&year=
// One-time expenses paid via this credit card whose payment date is in the month.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const cardId = sp.get('cardId') || ''
  const month = parseInt(sp.get('month') || '', 10)
  const year = parseInt(sp.get('year') || '', 10)
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  if (!cardId || isNaN(month) || isNaN(year)) return NextResponse.json({ error: 'cardId, month and year are required' }, { status: 400 })

  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  const entries = await prisma.pettyCashEntry.findMany({
    where: {
      branch, recordType: 'ONE_TIME', paymentMethod: 'Credit card', creditCardId: cardId,
      paidAt: { gte: start, lt: end },
    },
    select: {
      id: true, pcvNumber: true, requestor: true, date: true, description: true,
      accountTitle: true, grossAmount: true, paidAt: true, creditCard: true,
    },
    orderBy: { paidAt: 'asc' },
  })
  return NextResponse.json(entries)
}
