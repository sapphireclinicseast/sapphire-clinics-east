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
  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 })

  /* "All Branches" is a ROLLUP, not a budget of its own: it returns the SUM of
     every branch's entries for the period (any legacy rows saved under 'ALL'
     itself are included so no historical figure disappears — the 'ALL' bucket
     can no longer be written to, see PUT/POST). A month reads as locked on the
     rollup only when EVERY real branch has locked it. */
  const REAL_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
  const isRollup = branch === 'ALL'
  const branchFilter = isRollup ? {} : { branch }
  const rollupLocked = (locks: { month: number; branch: string }[]): number[] => {
    const byMonth = new Map<number, Set<string>>()
    for (const l of locks) { if (!byMonth.has(l.month)) byMonth.set(l.month, new Set()); byMonth.get(l.month)!.add(l.branch) }
    return [...byMonth.entries()].filter(([, brs]) => REAL_BRANCHES.every(b => brs.has(b))).map(([m]) => m)
  }

  // Whole-year mode (no month): budgets keyed by month + the set of locked months.
  if (!month) {
    const [entries, locks] = await Promise.all([
      prisma.budgetEntry.findMany({ where: { year, ...branchFilter }, select: { month: true, accountKey: true, amount: true } }),
      prisma.budgetLock.findMany({ where: { year, ...branchFilter }, select: { month: true, branch: true } }),
    ])
    const byMonth: Record<number, Record<string, number>> = {}
    for (const e of entries) {
      const m = (byMonth[e.month] ||= {})
      m[e.accountKey] = (m[e.accountKey] || 0) + Number(e.amount)
    }
    const lockedMonths = isRollup ? rollupLocked(locks) : locks.map(l => l.month)
    return NextResponse.json({ year, branch, rollup: isRollup, budgetsByMonth: byMonth, lockedMonths })
  }

  if (month < 1 || month > 12) return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 })
  const [entries, locks] = await Promise.all([
    prisma.budgetEntry.findMany({ where: { year, month, ...branchFilter }, select: { accountKey: true, accountType: true, amount: true } }),
    prisma.budgetLock.findMany({ where: { year, month, ...branchFilter }, select: { month: true, branch: true } }),
  ])
  const map: Record<string, number> = {}
  for (const e of entries) map[e.accountKey] = (map[e.accountKey] || 0) + Number(e.amount)
  const locked = isRollup ? rollupLocked(locks).includes(month) : locks.length > 0
  return NextResponse.json({ year, month, branch, rollup: isRollup, locked, budgets: map })
}

// PUT { year, month, branch, entries:[{accountKey, accountType, amount}] } — upsert the budget (blocked when locked).
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json()
  const { year, branch = 'ALL' } = body
  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 })
  if (branch === 'ALL') {
    return NextResponse.json({ error: 'All Branches is the total of each branch’s budget — pick a branch to enter its amounts.' }, { status: 400 })
  }
  const uid = session.user.id as string

  const upsertOne = async (month: number, e: { accountKey?: string; accountType?: string; amount?: number }) => {
    const accountKey = String(e.accountKey || '').trim()
    if (!accountKey) return
    const amount = Number(e.amount) || 0
    await prisma.budgetEntry.upsert({
      where: { year_month_branch_accountKey: { year, month, branch, accountKey } },
      update: { amount, accountType: String(e.accountType || 'EXPENSE') },
      create: { year, month, branch, accountKey, accountType: String(e.accountType || 'EXPENSE'), amount, createdById: uid },
    })
  }

  // Bulk mode: { monthly: { [month]: [{accountKey, accountType, amount}] } } — save
  // every non-locked month in one call; locked months are skipped (reported back).
  if (body.monthly && typeof body.monthly === 'object') {
    const locks = await prisma.budgetLock.findMany({ where: { year, branch }, select: { month: true } })
    const lockedSet = new Set(locks.map(l => l.month))
    const skipped: number[] = []
    for (const [mStr, entries] of Object.entries(body.monthly as Record<string, unknown>)) {
      const month = parseInt(mStr, 10)
      if (month < 1 || month > 12 || !Array.isArray(entries)) continue
      if (lockedSet.has(month)) { skipped.push(month); continue }
      for (const e of entries) await upsertOne(month, e)
    }
    return NextResponse.json({ success: true, skippedLocked: skipped })
  }

  // Single-month mode (legacy): { month, entries }
  const month = body.month
  const entries = body.entries
  if (month < 1 || month > 12 || !Array.isArray(entries)) {
    return NextResponse.json({ error: 'month and entries (or monthly) are required' }, { status: 400 })
  }
  const lock = await prisma.budgetLock.findUnique({ where: { year_month_branch: { year, month, branch } } })
  if (lock) return NextResponse.json({ error: 'This budget period is locked. Unlock it to edit.' }, { status: 409 })
  for (const e of entries) await upsertOne(month, e)
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
  if (branch === 'ALL') {
    return NextResponse.json({ error: 'All Branches is the total of each branch’s budget — lock each branch’s own months instead.' }, { status: 400 })
  }
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
