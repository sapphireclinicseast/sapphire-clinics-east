import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] // accountants/bookkeepers fill & lock the budget

// GET ?year=&month=&branch= — budget amounts + lock status for the period.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const year = parseInt(sp.get('year') || '0', 10)
  const month = parseInt(sp.get('month') || '0', 10)
  const branch = sp.get('branch') || 'ALL'
  if (!year || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year and month (1-12) are required' }, { status: 400 })
  }
  const [entries, lock] = await Promise.all([
    prisma.budgetEntry.findMany({ where: { year, month, branch }, select: { accountKey: true, accountType: true, amount: true } }),
    prisma.budgetLock.findUnique({ where: { year_month_branch: { year, month, branch } } }),
  ])
  const map: Record<string, number> = {}
  for (const e of entries) map[e.accountKey] = Number(e.amount)
  return NextResponse.json({ year, month, branch, locked: !!lock, budgets: map })
}

// PUT { year, month, branch, entries:[{accountKey, accountType, amount}] } — upsert the budget (blocked when locked).
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { year, month, branch = 'ALL', entries } = await req.json()
  if (!year || month < 1 || month > 12 || !Array.isArray(entries)) {
    return NextResponse.json({ error: 'year, month and entries are required' }, { status: 400 })
  }
  const lock = await prisma.budgetLock.findUnique({ where: { year_month_branch: { year, month, branch } } })
  if (lock) return NextResponse.json({ error: 'This budget period is locked. Unlock it to edit.' }, { status: 409 })

  for (const e of entries) {
    const accountKey = String(e.accountKey || '').trim()
    if (!accountKey) continue
    const amount = Number(e.amount) || 0
    await prisma.budgetEntry.upsert({
      where: { year_month_branch_accountKey: { year, month, branch, accountKey } },
      update: { amount, accountType: String(e.accountType || 'EXPENSE') },
      create: { year, month, branch, accountKey, accountType: String(e.accountType || 'EXPENSE'), amount, createdById: session.user.id as string },
    })
  }
  return NextResponse.json({ success: true })
}

// POST { action:'lock'|'unlock', year, month, branch } — lock/unlock a budget period.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { action, year, month, branch = 'ALL' } = await req.json()
  if (!year || month < 1 || month > 12) return NextResponse.json({ error: 'year and month are required' }, { status: 400 })
  if (action === 'lock') {
    await prisma.budgetLock.upsert({
      where: { year_month_branch: { year, month, branch } },
      update: { lockedById: session.user.id as string, lockedAt: new Date() },
      create: { year, month, branch, lockedById: session.user.id as string },
    })
    return NextResponse.json({ locked: true })
  }
  if (action === 'unlock') {
    await prisma.budgetLock.deleteMany({ where: { year, month, branch } })
    return NextResponse.json({ locked: false })
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
