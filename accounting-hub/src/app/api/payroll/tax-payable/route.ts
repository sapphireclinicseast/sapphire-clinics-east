import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const remitted = searchParams.get('remitted') // 'true', 'false', or null (all)

  const payrollType = searchParams.get('payrollType') || 'CONSULTANT'

  // Only show LOCKED entries — unlocked payrolls should not appear here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { taxAmount: { gt: 0 }, status: 'LOCKED' }
  if (branch) where.branch = branch
  if (remitted === 'true') where.taxRemitted = true
  if (remitted === 'false') where.taxRemitted = false

  // EMPLOYEE type — query EmployeePayslip withholding tax
  if (payrollType === 'EMPLOYEE') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empWhere: any = { taxDeduction: { gt: 0 }, status: 'LOCKED' }
    if (branch) empWhere.branch = branch
    if (remitted === 'true') empWhere.taxRemitted = true
    if (remitted === 'false') empWhere.taxRemitted = false

    const payslips = await prisma.employeePayslip.findMany({
      where: empWhere,
      include: { employee: { select: { id: true, firstName: true, lastName: true, department: true } } },
      orderBy: [{ cutoffPeriod: 'desc' }, { employee: { lastName: 'asc' } }],
    })

    return NextResponse.json(payslips.map(p => ({
      payrollEntryId: p.id,
      consultantId: p.employeeId,
      consultantName: `${p.employee.firstName} ${p.employee.lastName}`,
      department: p.employee.department,
      branch: p.branch,
      cutoffPeriod: p.cutoffPeriod,
      grossPay: Number(p.grossPay),
      taxAmount: Number(p.taxDeduction),
      netPay: Number(p.netPay),
      taxRemitted: p.taxRemitted,
      status: p.status,
      paymentDate: null,
    })))
  }

  const entries = await prisma.payrollEntry.findMany({
    where,
    include: {
      consultant: { select: { id: true, name: true, department: true } },
      taxPaymentEntries: {
        include: {
          taxPayment: { select: { id: true, paymentDate: true } },
        },
        take: 1,
        orderBy: { taxPayment: { paymentDate: 'desc' } },
      },
    },
    orderBy: [{ cutoffPeriod: 'desc' }, { consultant: { name: 'asc' } }],
  })

  const result = entries.map(e => ({
    payrollEntryId: e.id,
    consultantId: e.consultantId,
    consultantName: e.consultant.name,
    department: e.consultant.department,
    branch: e.branch,
    cutoffPeriod: e.cutoffPeriod,
    grossPay: Number(e.grossPay),
    taxAmount: Number(e.taxAmount),
    netPay: Number(e.netPay),
    taxRemitted: e.taxRemitted,
    status: e.status,
    paymentDate: e.taxPaymentEntries[0]?.taxPayment.paymentDate?.toISOString() || null,
  }))

  return NextResponse.json(result)
}
