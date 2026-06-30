import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE' }

// GET ?payrollBranch=SBEA → unified EWT-to-remit items:
//   consultant professional-fee withholding (PayrollEntry.taxAmount) +
//   expanded withholding captured on paid one-time expenses (PettyCashEntry).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payrollBranch = new URL(req.url).searchParams.get('payrollBranch') || ''
  const pcBranch = PAYROLL_TO_PC[payrollBranch]
  if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })

  const consultants = await prisma.payrollEntry.findMany({
    where: { branch: payrollBranch, taxAmount: { gt: 0 }, status: 'LOCKED' },
    include: { consultant: { select: { name: true, department: true } } },
    orderBy: [{ cutoffPeriod: 'desc' }],
  })
  const expenses = await prisma.pettyCashEntry.findMany({
    where: { branch: pcBranch, recordType: 'ONE_TIME', hasEwt: true, ewtRate: { not: null }, paidAt: { not: null } },
    select: { id: true, pcvNumber: true, requestor: true, description: true, vatable: true, grossAmount: true, ewtRate: true, ewtRemitted: true, paidAt: true },
    orderBy: [{ paidAt: 'desc' }],
  })

  const items = [
    ...consultants.map(e => {
      const base = Number(e.grossPay), ewt = Number(e.taxAmount)
      return {
        id: e.id, source: 'CONSULTANT' as const, name: e.consultant.name, ref: e.cutoffPeriod,
        ym: e.cutoffPeriod.slice(0, 7), periodLabel: e.cutoffPeriod,
        base, rate: base > 0 ? Math.round((ewt / base) * 100) : null, ewt, remitted: e.taxRemitted,
      }
    }),
    ...expenses.map(e => {
      const g = Number(e.grossAmount)
      const net = e.vatable === 'VAT' ? g / 1.12 : g
      const rate = e.ewtRate || 0
      const ym = e.paidAt ? new Date(e.paidAt).toISOString().slice(0, 7) : ''
      return {
        id: e.id, source: 'EXPENSE' as const, name: e.requestor || e.description || e.pcvNumber, ref: e.pcvNumber,
        ym, periodLabel: e.paidAt ? new Date(e.paidAt).toISOString().slice(0, 10) : '',
        base: net, rate, ewt: net * (rate / 100), remitted: e.ewtRemitted,
      }
    }),
  ]
  return NextResponse.json({ items })
}
