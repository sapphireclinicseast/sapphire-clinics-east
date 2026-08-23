import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: fetch clearing records for a date range + branch
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branch) where.branch = branch
  if (dateFrom && dateTo) {
    where.date = { gte: dateFrom, lte: dateTo }
  } else if (dateFrom) {
    where.date = { gte: dateFrom }
  } else if (dateTo) {
    where.date = { lte: dateTo }
  }

  const records = await prisma.salesDayClearing.findMany({ where, orderBy: { date: 'asc' } })
  return NextResponse.json(records)
}

// PUT: save draft (actualAmounts + remarks) without marking the day as cleared
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, branch, actualAmounts, remarks, confirmed } = body

  if (!date || !branch) {
    return NextResponse.json({ error: 'date and branch are required' }, { status: 400 })
  }

  const record = await prisma.salesDayClearing.upsert({
    where: { date_branch: { date, branch } },
    update: {
      actualAmounts: actualAmounts ?? null,
      remarks: remarks ?? null,
      // Per-method OK ticks (auto ticks carry source 'BANK_REC'); omitted by
      // older callers, in which case whatever is stored is left alone.
      ...(confirmed === undefined ? {} : { confirmed: confirmed ?? null }),
    },
    create: {
      date,
      branch,
      clearedById: session.user.id as string,
      isCleared: false,
      actualAmounts: actualAmounts ?? null,
      remarks: remarks ?? null,
      confirmed: confirmed ?? null,
    },
  })

  return NextResponse.json(record)
}

// POST: mark a day as cleared (upsert)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, branch, actualAmounts, remarks, confirmed } = body

  if (!date || !branch) {
    return NextResponse.json({ error: 'date and branch are required' }, { status: 400 })
  }

  const record = await prisma.salesDayClearing.upsert({
    where: { date_branch: { date, branch } },
    update: {
      clearedById: session.user.id as string,
      clearedAt: new Date(),
      isCleared: true,
      actualAmounts: actualAmounts ?? null,
      remarks: remarks ?? null,
      ...(confirmed === undefined ? {} : { confirmed: confirmed ?? null }),
    },
    create: {
      date,
      branch,
      clearedById: session.user.id as string,
      isCleared: true,
      actualAmounts: actualAmounts ?? null,
      remarks: remarks ?? null,
      confirmed: confirmed ?? null,
    },
  })

  return NextResponse.json(record)
}

// DELETE: unmark a cleared day (preserves saved draft data, just un-clears)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || ''
  const branch = searchParams.get('branch') || ''

  if (!date || !branch) {
    return NextResponse.json({ error: 'date and branch are required' }, { status: 400 })
  }

  try {
    // Set isCleared to false rather than deleting, so saved actualAmounts/remarks are preserved
    await prisma.salesDayClearing.update({
      where: { date_branch: { date, branch } },
      data: { isCleared: false },
    })
  } catch {
    // Record doesn't exist — ignore
  }

  return NextResponse.json({ ok: true })
}
