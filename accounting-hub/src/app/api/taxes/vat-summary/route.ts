import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE' }
const VAT_RATE = 0.12

// GET ?payrollBranch=SBEA&from=YYYY-MM-DD&to=YYYY-MM-DD
// Output VAT (from POS/orders) vs creditable Input VAT (from VAT expenses).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const pcBranch = PAYROLL_TO_PC[sp.get('payrollBranch') || '']
  if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const from = sp.get('from'), to = sp.get('to')
  const range: { gte?: Date; lt?: Date } = {}
  if (from) range.gte = new Date(from)
  if (to) { const d = new Date(to); d.setUTCDate(d.getUTCDate() + 1); range.lt = d }

  // Output VAT: completed sales in the period (VAT-inclusive).
  const orders = await prisma.order.findMany({
    where: { branch: pcBranch, status: 'COMPLETED', returnedByBuyer: false, ...(from || to ? { transactionDate: range } : {}) },
    select: { netAmount: true },
  })
  const outputGross = orders.reduce((s, o) => s + Number(o.netAmount), 0)
  const outputVat = outputGross * (VAT_RATE / (1 + VAT_RATE))

  // Input VAT: paid VATable expenses in the period (VAT-inclusive gross).
  const exps = await prisma.pettyCashEntry.findMany({
    where: { branch: pcBranch, recordType: { in: ['ONE_TIME', 'RECURRING'] }, vatable: 'VAT', paidAt: { not: null }, ...(from || to ? { date: range } : {}) },
    select: { grossAmount: true },
  })
  const inputGross = exps.reduce((s, e) => s + Number(e.grossAmount), 0)
  const inputVat = inputGross * (VAT_RATE / (1 + VAT_RATE))

  return NextResponse.json({
    outputGross, outputVat, orderCount: orders.length,
    inputGross, inputVat, expenseCount: exps.length,
    computedPayable: outputVat - inputVat,
  })
}
