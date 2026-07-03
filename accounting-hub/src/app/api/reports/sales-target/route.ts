import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
const TARGET_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] // only these may set the target

// GET ?branch=&month=&year= — Sales with SI (net) vs manual target for the month.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const month = parseInt(sp.get('month') || '0', 10)
  const year = parseInt(sp.get('year') || '0', 10)
  if (!VALID_BRANCHES.includes(branch) || month < 1 || month > 12 || year < 2000) {
    return NextResponse.json({ error: 'Valid branch, month and year are required' }, { status: 400 })
  }
  try {
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 1))
    const orders = await prisma.order.findMany({
      where: { branch, status: { in: ['COMPLETED', 'REOPENED'] }, issuedOfficialInvoice: true, salesInvoiceNumber: { not: null }, transactionDate: { gte: start, lt: end } },
      select: { netAmount: true },
    })
    const salesWithSI = orders.reduce((s, o) => s + Number(o.netAmount), 0)
    const t = await prisma.salesTarget.findUnique({ where: { branch_periodMonth_periodYear: { branch, periodMonth: month, periodYear: year } } })
    const target = t ? Number(t.target) : 0
    return NextResponse.json({ branch, month, year, salesWithSI, target, difference: target - salesWithSI, orderCount: orders.length })
  } catch (err) {
    console.error('Sales target error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT { branch, month, year, target } — set the monthly target (admin/accountant/bookkeeper only).
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !TARGET_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Only Admin, Accountant or Bookkeeper can set the sales target' }, { status: 403 })
  }
  try {
    const { branch, month, year, target } = await req.json()
    if (!VALID_BRANCHES.includes(branch) || !(month >= 1 && month <= 12) || !(year >= 2000)) {
      return NextResponse.json({ error: 'Valid branch, month and year are required' }, { status: 400 })
    }
    const amt = Number(target) || 0
    await prisma.salesTarget.upsert({
      where: { branch_periodMonth_periodYear: { branch, periodMonth: month, periodYear: year } },
      update: { target: amt },
      create: { branch, periodMonth: month, periodYear: year, target: amt, createdById: session.user.id as string },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Sales target set error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
