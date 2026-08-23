import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

const num = (v: unknown) => Number(v ?? 0)

/**
 * GET /api/staff-loans
 *   ?suggest=<cutoffPeriod>&branch=<SBEA|SBGH|VERDANA>
 *     → active loans with a standing per-cutoff deduction for that branch,
 *       shaped as payroll deduction suggestions.
 *   (no params) → the full register with per-loan totals and deduction history.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const suggest = searchParams.get('suggest')
  const branch = searchParams.get('branch')

  if (suggest) {
    const loans = await prisma.staffLoan.findMany({
      where: { status: 'ACTIVE', perCutoff: { gt: 0 }, employeeId: { not: null }, ...(branch ? { branch } : {}) },
      select: {
        id: true, employeeId: true, staffName: true, category: true, perCutoff: true, principal: true,
        deductions: { select: { amount: true } },
      },
    })
    const out = loans
      .map(l => {
        const repaid = l.deductions.reduce((s, d) => s + num(d.amount), 0)
        const balance = Math.max(0, num(l.principal) - repaid)
        return {
          staffLoanId: l.id, employeeId: l.employeeId, staffName: l.staffName,
          // never suggest more than what is left
          deduction: Math.min(num(l.perCutoff), balance),
          deductionLabel: `Staff Loan — ${l.category.replace(/_/g, ' ').toLowerCase()}`,
          balance,
        }
      })
      .filter(s => s.deduction > 0)
    return NextResponse.json(out)
  }

  const loans = await prisma.staffLoan.findMany({
    include: {
      employee: { select: { firstName: true, lastName: true, branch: true } },
      deductions: { orderBy: { cutoffPeriod: 'asc' } },
    },
    orderBy: [{ status: 'asc' }, { staffName: 'asc' }],
  })
  return NextResponse.json(loans.map(l => {
    const repaid = l.deductions.reduce((s, d) => s + num(d.amount), 0)
    return { ...l, repaid, balance: num(l.principal) - repaid }
  }))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json()
  if (!b.staffName || !(num(b.principal) > 0)) {
    return NextResponse.json({ error: 'staffName and a positive principal are required' }, { status: 400 })
  }
  const loan = await prisma.staffLoan.create({
    data: {
      employeeId: b.employeeId || null, staffName: String(b.staffName), branch: b.branch || null,
      category: b.category || 'LOAN', description: b.description || null,
      principal: num(b.principal), dateReleased: b.dateReleased ? new Date(b.dateReleased) : null,
      chequeRef: b.chequeRef || null, perCutoff: num(b.perCutoff), status: b.status || 'ACTIVE',
      notes: b.notes || null, createdById: session.user.id,
    },
  })
  return NextResponse.json(loan)
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const loan = await prisma.staffLoan.update({
    where: { id: b.id },
    data: {
      ...(b.employeeId !== undefined ? { employeeId: b.employeeId || null } : {}),
      ...(b.staffName !== undefined ? { staffName: String(b.staffName) } : {}),
      ...(b.branch !== undefined ? { branch: b.branch || null } : {}),
      ...(b.category !== undefined ? { category: b.category } : {}),
      ...(b.description !== undefined ? { description: b.description || null } : {}),
      ...(b.principal !== undefined ? { principal: num(b.principal) } : {}),
      ...(b.dateReleased !== undefined ? { dateReleased: b.dateReleased ? new Date(b.dateReleased) : null } : {}),
      ...(b.chequeRef !== undefined ? { chequeRef: b.chequeRef || null } : {}),
      ...(b.perCutoff !== undefined ? { perCutoff: num(b.perCutoff) } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.notes !== undefined ? { notes: b.notes || null } : {}),
    },
  })
  return NextResponse.json(loan)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // A loan with recorded deductions is history, not clutter — refuse to delete it.
  const nDed = await prisma.staffLoanDeduction.count({ where: { loanId: id } })
  if (nDed > 0) {
    return NextResponse.json({ error: 'This loan has recorded deductions. Mark it PAID or WAIVED instead of deleting.' }, { status: 400 })
  }
  await prisma.staffLoan.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
