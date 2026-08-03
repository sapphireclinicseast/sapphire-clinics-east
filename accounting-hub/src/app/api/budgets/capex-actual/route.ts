import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// GET /api/budgets/capex-actual?year=&branch=
// Actual asset purchases for the year, grouped by month and classification, so the
// budget's Capital Expenditure section can be compared against what was really bought.
// Uses totalAmount (price x quantity) on dateBought — the same figure the acquisition
// journal entry debits to the classification account.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '', 10)
  const branch = searchParams.get('branch') || 'ALL'
  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 })

  const where: Prisma.AssetWhereInput = {
    dateBought: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
  }
  if (branch !== 'ALL') where.branch = branch as Prisma.AssetWhereInput['branch']

  const assets = await prisma.asset.findMany({
    where,
    select: { classification: true, totalAmount: true, dateBought: true },
  })

  // { month: { "2050": amount } } — keyed by classification code alone; the page
  // matches it against its "<code> <label>" budget lines.
  const byMonth: Record<number, Record<string, number>> = {}
  for (const a of assets) {
    const m = a.dateBought.getMonth() + 1
    byMonth[m] ??= {}
    byMonth[m][a.classification] = (byMonth[m][a.classification] || 0) + Number(a.totalAmount)
  }

  return NextResponse.json({ year, branch, capexByMonth: byMonth })
}
