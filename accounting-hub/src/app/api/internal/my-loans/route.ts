/**
 * GET /api/internal/my-loans?staffId=<externalStaffId>&email=<email>
 *
 * Internal endpoint consumed by the teletherapy staff portal. Returns the
 * person's ACTIVE staff loans (the company loan register), with the
 * outstanding balance per loan = principal − Σ deductions. Company loans
 * only exist for Employees (not Consultants), so this matches the Employee
 * roster only, by externalStaffId first (stable across the email transition)
 * then by email.
 *
 * Auth: Authorization: Bearer ${TELETHERAPY_INTERNAL_API_KEY}
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.TELETHERAPY_INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

const CATEGORY_LABELS: Record<string, string> = {
  LOAN: 'Salary Loan',
  BIR_ASSISTANCE: 'BIR Assistance',
  TRAINING: 'Training',
  MEDICAL: 'Medical',
  SOS: 'SOS Program',
  PERK: 'Perk',
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staffId = (req.nextUrl.searchParams.get('staffId') ?? '').trim()
  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!staffId && !email) {
    return NextResponse.json({ error: 'staffId or email is required' }, { status: 400 })
  }

  const or: Prisma.EmployeeWhereInput[] = []
  if (staffId) or.push({ externalStaffId: staffId })
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } })

  const employees = await prisma.employee.findMany({
    where: { OR: or },
    select: { id: true },
  })
  const empIds = employees.map((e) => e.id)
  if (empIds.length === 0) {
    return NextResponse.json({ matchedAsEmployee: false, loans: [], totalOutstanding: 0 })
  }

  const loans = await prisma.staffLoan.findMany({
    where: { employeeId: { in: empIds }, status: 'ACTIVE' },
    include: { deductions: { select: { amount: true } } },
    orderBy: [{ dateReleased: 'desc' }, { createdAt: 'desc' }],
  })

  const out = loans.map((l) => {
    const principal = Number(l.principal)
    const paid = l.deductions.reduce((s, d) => s + Number(d.amount), 0)
    const outstanding = Math.max(0, principal - paid)
    return {
      id: l.id,
      category: l.category,
      categoryLabel: CATEGORY_LABELS[l.category] ?? l.category,
      description: l.description ?? null,
      branch: l.branch ?? null,
      principal,
      paid,
      outstanding,
      perCutoff: Number(l.perCutoff),
      status: l.status,
      dateReleased: l.dateReleased ? l.dateReleased.toISOString().slice(0, 10) : null,
    }
  })
  const totalOutstanding = out.reduce((s, l) => s + l.outstanding, 0)

  return NextResponse.json({ matchedAsEmployee: true, loans: out, totalOutstanding })
}
