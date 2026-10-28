import { NextResponse } from 'next/server'
import { PayslipStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notMigratedOrder } from '@/lib/payroll/exclude-migrated'
import { cutoffRange } from '@/lib/payroll-cutoff'

export const dynamic = 'force-dynamic'

// Payroll branch codes (SBEA/SBGH/…) → POS/order branch enums, so a cutoff's
// payroll total can be compared against the sales rung up at the same branch.
const PAYROLL_TO_ORDER_BRANCH: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
  VERDANA: 'VERDANA_STORE',
  VERDANA_STORE: 'VERDANA_STORE',
}
// For "All branches", only the clinics that actually run payroll — not every
// order branch (e.g. the Institute), which would inflate the sales side.
const CLINIC_ORDER_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

// A finalized cutoff is one that has been locked in — drafts are in-progress and
// would make the trend jump around as a cutoff is being worked on.
const FINAL_STATUSES = ['FINAL', 'LOCKED']
// Only the fortnightly cutoffs form the trend; special runs (13th month,
// maternity, final pay, gov-con catch-up) carry a suffix and are one-offs.
const REGULAR_CUTOFF = /^\d{4}-\d{2}-[12]$/

const num = (v: unknown) => Number(v ?? 0)

/**
 * GET /api/payroll/history?branch=SBEA&cutoffs=12
 *
 * Finalized gross payroll per cutoff (consultants + employees), with the net
 * POS sales rung up in the same cutoff window alongside it, so the payroll
 * officer can see payroll rise and fall against sales. Branch optional:
 * omitted = all clinics summed.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = (searchParams.get('branch') || '').trim() // '' = all clinics
  const cutoffs = Math.min(Math.max(parseInt(searchParams.get('cutoffs') || '12', 10) || 12, 2), 36)

  // PayrollEntry.status is a plain string; EmployeePayslip.status is the
  // PayslipStatus enum — so the two where clauses are typed separately.
  const consWhere = { status: { in: FINAL_STATUSES }, ...(branch ? { branch } : {}) }
  const empWhere = { status: { in: [PayslipStatus.FINAL, PayslipStatus.LOCKED] }, ...(branch ? { branch } : {}) }

  const [cons, emps] = await Promise.all([
    prisma.payrollEntry.groupBy({
      by: ['cutoffPeriod'],
      where: consWhere,
      _sum: { grossPay: true, netPay: true },
    }),
    prisma.employeePayslip.groupBy({
      by: ['cutoffPeriod'],
      where: empWhere,
      _sum: { grossPay: true, netPay: true },
    }),
  ])

  type Acc = { consGross: number; consNet: number; empGross: number; empNet: number }
  const byPeriod = new Map<string, Acc>()
  const ensure = (p: string): Acc => {
    let a = byPeriod.get(p)
    if (!a) { a = { consGross: 0, consNet: 0, empGross: 0, empNet: 0 }; byPeriod.set(p, a) }
    return a
  }
  for (const r of cons) { const a = ensure(r.cutoffPeriod); a.consGross += num(r._sum?.grossPay); a.consNet += num(r._sum?.netPay) }
  for (const r of emps) { const a = ensure(r.cutoffPeriod); a.empGross += num(r._sum?.grossPay); a.empNet += num(r._sum?.netPay) }

  // Regular cutoffs only, most recent `cutoffs`, oldest → newest for the trend.
  const periods = [...byPeriod.keys()].filter(p => REGULAR_CUTOFF.test(p)).sort().slice(-cutoffs)

  const salesBranchWhere = branch
    ? { branch: PAYROLL_TO_ORDER_BRANCH[branch] ?? branch }
    : { branch: { in: CLINIC_ORDER_BRANCHES } }

  const rows = await Promise.all(periods.map(async (p) => {
    const a = byPeriod.get(p)!
    const range = cutoffRange(p)
    let sales = 0
    let dateFrom: string | null = null
    let dateTo: string | null = null
    if (range) {
      dateFrom = range.from
      dateTo = range.to
      const salesAgg = await prisma.order.aggregate({
        _sum: { netAmount: true },
        where: {
          status: 'COMPLETED',
          AND: [notMigratedOrder],
          transactionDate: {
            gte: new Date(`${range.from}T00:00:00+08:00`),
            lte: new Date(`${range.to}T23:59:59.999+08:00`),
          },
          ...salesBranchWhere,
        },
      })
      sales = num(salesAgg._sum.netAmount)
    }
    const totalGross = a.consGross + a.empGross
    return {
      cutoffPeriod: p,
      dateFrom,
      dateTo,
      consultantGross: a.consGross,
      employeeGross: a.empGross,
      totalGross,
      consultantNet: a.consNet,
      employeeNet: a.empNet,
      totalNet: a.consNet + a.empNet,
      sales,
      payrollPctOfSales: sales > 0 ? (totalGross / sales) * 100 : null,
    }
  }))

  return NextResponse.json({ branch: branch || 'ALL', rows })
}
