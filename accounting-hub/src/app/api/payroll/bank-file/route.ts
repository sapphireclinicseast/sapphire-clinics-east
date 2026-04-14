import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''
  const payrollType = searchParams.get('payrollType') || 'CONSULTANT'

  if (!cutoffPeriod) {
    return NextResponse.json({ error: 'cutoffPeriod is required' }, { status: 400 })
  }

  const lines: string[] = []

  if (payrollType === 'CONSULTANT' || payrollType === 'ALL') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      cutoffPeriod,
      status: { in: ['FINAL', 'LOCKED'] },
      netPay: { gt: 0 },
    }
    if (branch) where.branch = branch

    const entries = await prisma.payrollEntry.findMany({
      where,
      include: { consultant: { select: { name: true, bankName: true, bankAccountNo: true } } },
      orderBy: { consultant: { name: 'asc' } },
    })

    for (const e of entries) {
      const accountNo = e.consultant?.bankAccountNo?.trim()
      if (!accountNo) continue
      lines.push(`${accountNo}\t${Number(e.netPay).toFixed(2)}`)
    }
  }

  if (payrollType === 'EMPLOYEE' || payrollType === 'ALL') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      cutoffPeriod,
      status: { in: ['FINAL', 'LOCKED'] },
      netPay: { gt: 0 },
    }
    if (branch) where.branch = branch

    const payslips = await prisma.employeePayslip.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, bankName: true, bankAccountNo: true } } },
      orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
    })

    for (const p of payslips) {
      const accountNo = p.employee?.bankAccountNo?.trim()
      if (!accountNo) continue
      lines.push(`${accountNo}\t${Number(p.netPay).toFixed(2)}`)
    }
  }

  const content = lines.join('\n')
  const filename = `bank-${payrollType.toLowerCase()}-${cutoffPeriod}${branch ? `-${branch}` : ''}.txt`

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
