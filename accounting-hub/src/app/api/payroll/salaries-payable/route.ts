import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const showRemitted = searchParams.get('showRemitted') === 'true'
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
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
    totalSalariesPayable: Number(p.totalSalariesPayable),
    salariesRemitted: p.salariesRemitted,
    salaryPaymentId: p.salaryPaymentId,
  })))
}
