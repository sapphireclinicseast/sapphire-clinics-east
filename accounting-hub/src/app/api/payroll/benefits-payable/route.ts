import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Consultants store branch as SBEA/SBGH/VERDANA; employees the same. Both use short codes here.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const showRemitted = searchParams.get('showRemitted') === 'true'
  const branch = searchParams.get('branch') || ''
  const type = searchParams.get('type') || '' // 'employee' | 'consultant' | ''

  const benefitOR = [
    { sssDeduction: { gt: 0 } },
    { philhealthDeduction: { gt: 0 } },
    { pagibigDeduction: { gt: 0 } },
    { sssEmployerShare: { gt: 0 } },
    { philhealthEmployerShare: { gt: 0 } },
    { pagibigEmployerShare: { gt: 0 } },
  ]

  const rows: {
    id: string; type: 'employee' | 'consultant'; personId: string; name: string; department: string
    branch: string; cutoffPeriod: string
    sssEE: number; sssER: number; philEE: number; philER: number; pagEE: number; pagER: number
    totalBenefitsPayable: number; benefitsRemitted: boolean; benefitPaymentId: string | null; benefitRfpId: string | null
    sssRfpId: string | null; philhealthRfpId: string | null; pagibigRfpId: string | null
  }[] = []

  // ── Employees (from locked payslips) ──
  if (type !== 'consultant') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: 'LOCKED', OR: benefitOR }
    if (!showRemitted) where.benefitsRemitted = false
    if (branch) where.branch = branch
    const payslips = await prisma.employeePayslip.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, department: true } } },
      orderBy: [{ cutoffPeriod: 'desc' }, { branch: 'asc' }],
    })
    for (const p of payslips) {
      const sssEE = Number(p.sssDeduction), sssER = Number(p.sssEmployerShare)
      const philEE = Number(p.philhealthDeduction), philER = Number(p.philhealthEmployerShare)
      const pagEE = Number(p.pagibigDeduction), pagER = Number(p.pagibigEmployerShare)
      rows.push({
        id: p.id, type: 'employee', personId: p.employeeId,
        name: `${p.employee.lastName}, ${p.employee.firstName}`, department: p.employee.department ?? '',
        branch: p.branch, cutoffPeriod: p.cutoffPeriod,
        sssEE, sssER, philEE, philER, pagEE, pagER,
        totalBenefitsPayable: sssEE + sssER + philEE + philER + pagEE + pagER,
        benefitsRemitted: p.benefitsRemitted, benefitPaymentId: p.benefitPaymentId, benefitRfpId: p.benefitRfpId,
        sssRfpId: p.sssRfpId, philhealthRfpId: p.philhealthRfpId, pagibigRfpId: p.pagibigRfpId,
      })
    }
  }

  // ── Consultants (from locked payroll entries) ──
  if (type !== 'employee') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: 'LOCKED', OR: benefitOR }
    if (!showRemitted) where.benefitsRemitted = false
    if (branch) where.branch = branch
    const entries = await prisma.payrollEntry.findMany({
      where,
      include: { consultant: { select: { id: true, name: true, department: true } } },
      orderBy: [{ cutoffPeriod: 'desc' }, { branch: 'asc' }],
    })
    for (const e of entries) {
      const sssEE = Number(e.sssDeduction), sssER = Number(e.sssEmployerShare)
      const philEE = Number(e.philhealthDeduction), philER = Number(e.philhealthEmployerShare)
      const pagEE = Number(e.pagibigDeduction), pagER = Number(e.pagibigEmployerShare)
      rows.push({
        id: e.id, type: 'consultant', personId: e.consultantId,
        name: e.consultant?.name ?? '—', department: e.consultant?.department ?? '',
        branch: e.branch, cutoffPeriod: e.cutoffPeriod,
        sssEE, sssER, philEE, philER, pagEE, pagER,
        totalBenefitsPayable: sssEE + sssER + philEE + philER + pagEE + pagER,
        benefitsRemitted: e.benefitsRemitted, benefitPaymentId: e.benefitPaymentId, benefitRfpId: e.benefitRfpId,
        sssRfpId: e.sssRfpId, philhealthRfpId: e.philhealthRfpId, pagibigRfpId: e.pagibigRfpId,
      })
    }
  }

  return NextResponse.json(rows)
}
