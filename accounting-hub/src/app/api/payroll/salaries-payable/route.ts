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
    // Per-consultant payslip rows (LOCKED or FINAL entries with netPay > 0)
    // Only show LOCKED entries — unlocked payrolls should not appear here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      status: 'LOCKED',
      netPay: { gt: 0 },
    }
    if (!showRemitted) where.salariesRemitted = false
    if (branch) where.branch = branch

    const entries = await prisma.payrollEntry.findMany({
      where,
      include: { consultant: { select: { id: true, name: true, department: true } } },
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
      status: e.status,
    })))
  }

  // EMPLOYEE — keep aggregate PayrollPayableStatus rows for now
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { payrollType: 'EMPLOYEE' }
  if (!showRemitted) where.salariesRemitted = false
  if (branch) where.branch = branch

  const payables = await prisma.payrollPayableStatus.findMany({
    where,
    orderBy: { cutoffPeriod: 'desc' },
  })

  return NextResponse.json(payables.map(p => ({
    id: p.id,
    cutoffPeriod: p.cutoffPeriod,
    branch: p.branch,
    payrollType: p.payrollType,
    grossPay: null,
    taxAmount: null,
    netPay: Number(p.totalSalariesPayable),
    salariesRemitted: p.salariesRemitted,
    consultantName: null,
    department: null,
    isAggregateRow: true,
  })))
}
