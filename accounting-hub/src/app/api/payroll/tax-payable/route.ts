import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const remitted = searchParams.get('remitted') // 'true', 'false', or null (all)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { taxAmount: { gt: 0 } }
  if (branch) where.branch = branch
  if (remitted === 'true') where.taxRemitted = true
  if (remitted === 'false') where.taxRemitted = false

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
