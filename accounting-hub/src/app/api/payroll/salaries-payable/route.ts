import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const showRemitted = searchParams.get('showRemitted') === 'true'
  const branch = searchParams.get('branch') || ''
  const payrollType = searchParams.get('payrollType') || 'CONSULTANT'

  if (payrollType === 'CONSULTANT') {
    // Per-consultant payslip rows (LOCKED entries with netPay > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      status: 'LOCKED',
      netPay: { gt: 0 },
    }
    if (!showRemitted) where.salariesRemitted = false
    if (branch) where.branch = branch

    const entries = await prisma.payrollEntry.findMany({
      where,
      include: { consultant: { select: { id: true, name: true, department: true } }, salarySplits: { orderBy: { seq: 'asc' } } },
      orderBy: [{ cutoffPeriod: 'desc' }, { branch: 'asc' }],
    })

    return NextResponse.json(entries.map(e => ({
      id: e.id,
      consultantId: e.consultantId,
      consultantName: e.consultant?.name ?? '—',
      department: e.consultant?.department ?? '',
      branch: e.branch,
      cutoffPeriod: e.cutoffPeriod,
      grossPay: Number(e.grossPay),
      taxAmount: Number(e.taxAmount),
      netPay: Number(e.netPay),
      salariesRemitted: e.salariesRemitted,
      salaryRfpId: e.salaryRfpId,
      status: e.status,
      isConsultantEntry: true,
      splits: e.salarySplits.map(sp => ({
        id: sp.id, seq: sp.seq, amount: Number(sp.amount), note: sp.note,
        salariesRemitted: sp.salariesRemitted, salaryRfpId: sp.salaryRfpId,
      })),
    })))
  }

  // EMPLOYEE — per-employee from EmployeePayslip (status=LOCKED)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: 'LOCKED' }
  if (!showRemitted) where.salariesRemitted = false
  if (branch) where.branch = branch

  const payslips = await prisma.employeePayslip.findMany({
    where,
    include: { employee: { select: { id: true, firstName: true, lastName: true, department: true } }, salarySplits: { orderBy: { seq: 'asc' } } },
    orderBy: [{ cutoffPeriod: 'desc' }, { branch: 'asc' }],
  })

  return NextResponse.json(payslips.map(p => ({
    id: p.id,
    employeeId: p.employeeId,
    employeeName: `${p.employee.lastName}, ${p.employee.firstName}`,
    department: p.employee.department ?? '',
    branch: p.branch,
    cutoffPeriod: p.cutoffPeriod,
    grossPay: Number(p.grossPay),
    taxAmount: Number(p.taxDeduction),
    netPay: Number(p.netPay),
    salariesRemitted: p.salariesRemitted,
    salaryRfpId: p.salaryRfpId,
    isEmployeePayslip: true,
    splits: p.salarySplits.map(sp => ({
      id: sp.id, seq: sp.seq, amount: Number(sp.amount), note: sp.note,
      salariesRemitted: sp.salariesRemitted, salaryRfpId: sp.salaryRfpId,
    })),
  })))
}
