import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const showRemitted = searchParams.get('showRemitted') === 'true'
  const branch = searchParams.get('branch') || ''

  // Per-employee benefit contributions from LOCKED payslips
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: 'LOCKED' }
  if (!showRemitted) where.benefitsRemitted = false
  if (branch) where.branch = branch

  // Only show employees who have at least one benefit contribution
  where.OR = [
    { sssDeduction: { gt: 0 } },
    { philhealthDeduction: { gt: 0 } },
    { pagibigDeduction: { gt: 0 } },
    { sssEmployerShare: { gt: 0 } },
    { philhealthEmployerShare: { gt: 0 } },
    { pagibigEmployerShare: { gt: 0 } },
  ]

  const payslips = await prisma.employeePayslip.findMany({
    where,
    include: { employee: { select: { id: true, firstName: true, lastName: true, department: true } } },
    orderBy: [{ cutoffPeriod: 'desc' }, { branch: 'asc' }],
  })

  return NextResponse.json(payslips.map(p => {
    const sssEE = Number(p.sssDeduction)
    const sssER = Number(p.sssEmployerShare)
    const philEE = Number(p.philhealthDeduction)
    const philER = Number(p.philhealthEmployerShare)
    const pagEE = Number(p.pagibigDeduction)
    const pagER = Number(p.pagibigEmployerShare)
    return {
      id: p.id,
      employeeId: p.employeeId,
      employeeName: `${p.employee.lastName}, ${p.employee.firstName}`,
      department: p.employee.department ?? '',
      branch: p.branch,
      cutoffPeriod: p.cutoffPeriod,
      sssEE,
      sssER,
      philEE,
      philER,
      pagEE,
      pagER,
      totalBenefitsPayable: sssEE + sssER + philEE + philER + pagEE + pagER,
      benefitsRemitted: p.benefitsRemitted,
      benefitPaymentId: p.benefitPaymentId,
    }
  }))
}
