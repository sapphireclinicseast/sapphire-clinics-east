import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Payroll branch codes (SBEA/SBGH/VERDANA) → order/JE branch codes.
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE' }
const r2 = (n: number) => Math.round(n * 100) / 100

// GET /api/taxes/income-tax-basis?year=&quarter=&branch=
// Cumulative (YTD through the quarter) figures that build the 1702Q taxable
// income from the same data as the other forms:
//   sales          — invoiced (SI) sales, same source as the 2550Q
//   compensation   — gross compensation from payroll, the 1601-C base
//   consultantFees — consultant professional fees, the 0619-E EWT base
//   totalExpenses  — all deductible (EXPENSE-account) costs (incl. the two above)
// Net taxable income = sales − totalExpenses (= sales − comp − fees − other).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const quarter = Math.min(4, Math.max(1, parseInt(sp.get('quarter') || '1')))
  const branch = sp.get('branch') || 'ALL'
  const all = branch === 'ALL' || branch === ''
  const pc = all ? null : PAYROLL_TO_PC[branch] // order / journal-entry branch code
  const pay = all ? null : branch               // payslip / payroll branch code

  const months = quarter * 3
  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year, months, 1)) // exclusive (start of month after the quarter)
  const cutoffMonths = Array.from({ length: months }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const cutoffWhere = { OR: cutoffMonths.map(m => ({ cutoffPeriod: { startsWith: m } })) }

  // Invoiced (SI) sales — same source as the 2550Q.
  const siOrders = await prisma.order.findMany({
    where: { ...(pc ? { branch: pc } : {}), status: { in: ['COMPLETED', 'REOPENED'] }, issuedOfficialInvoice: true, salesInvoiceNumber: { not: null }, transactionDate: { gte: from, lt: to } },
    select: { netAmount: true },
  })
  let sales = siOrders.reduce((s, o) => s + Number(o.netAmount), 0)
  const siAr = await prisma.aRPayment.findMany({
    where: { ...(pc ? { branch: pc } : {}), salesInvoiceNumber: { not: null }, paymentDate: { gte: from, lt: to } },
    select: { amount: true, discount: true },
  })
  sales += siAr.reduce((s, p) => s + Number(p.amount) + Number(p.discount), 0)

  // Compensation (1601-C base) and consultant fees (0619-E base).
  const comp = await prisma.employeePayslip.aggregate({ _sum: { grossPay: true }, where: { status: 'LOCKED', ...(pay ? { branch: pay } : {}), ...cutoffWhere } })
  const compensation = Number(comp._sum.grossPay || 0)
  const cons = await prisma.payrollEntry.aggregate({ _sum: { grossPay: true }, where: { status: 'LOCKED', ...(pay ? { branch: pay } : {}), ...cutoffWhere } })
  const consultantFees = Number(cons._sum.grossPay || 0)

  // Total deductible expenses — every EXPENSE-account posting in the period.
  const rows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(sum(l.debit - l.credit), 0)::float8 AS total
    FROM "JournalEntryLine" l
    JOIN "JournalEntry" je ON je.id = l."journalEntryId"
    JOIN "Account" a ON a.id = l."accountId"
    WHERE a."accountType" = 'EXPENSE'
      AND je."entryDate" >= ${from} AND je."entryDate" < ${to}
      ${pc ? Prisma.sql`AND je.branch = ${pc}` : Prisma.empty}`
  const totalExpenses = rows[0]?.total || 0

  return NextResponse.json({
    year, quarter,
    sales: r2(sales), compensation: r2(compensation), consultantFees: r2(consultantFees), totalExpenses: r2(totalExpenses),
  })
}
