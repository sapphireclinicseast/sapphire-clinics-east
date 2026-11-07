import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CUTOFF_RX } from '@/lib/payroll/si-coverage'

const MONTH_RX = /^\d{4}-\d{2}$/
// Same roles that could already see these figures through the reminder preview.
const ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * GET /api/payroll/si-tracking[?from=YYYY-MM]
 *
 * Everything the Service Invoice tracking screen needs in one call, so no row
 * has to fetch its own figures:
 *  - payroll: finalized pay per consultant per cutoff (gross, withholding,
 *    net), summed across branches, from `from` (default: 24 months back);
 *  - submissions: every recorded invoice row from that month on. A row's
 *    `month` is a whole month ("YYYY-MM") or one cutoff ("YYYY-MM-1"/"-2").
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const now = new Date()
  const back = new Date(now.getFullYear(), now.getMonth() - 23, 1)
  const fallback = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}`
  const asked = new URL(req.url).searchParams.get('from') || ''
  const from = MONTH_RX.test(asked) && asked < fallback ? asked : fallback

  try {
    const [groups, submissions] = await Promise.all([
      prisma.payrollEntry.groupBy({
        by: ['consultantId', 'cutoffPeriod'],
        where: { status: { in: ['LOCKED', 'FINAL'] }, cutoffPeriod: { gte: `${from}-1` } },
        _sum: { grossPay: true, taxAmount: true, netPay: true },
      }),
      prisma.consultantSiSubmission.findMany({
        where: { month: { gte: from } },
        select: { consultantId: true, month: true, siUrl: true, uploadedAt: true },
        orderBy: [{ month: 'asc' }],
      }),
    ])
    const payroll: Record<string, Record<string, { gross: number; tax: number; net: number }>> = {}
    for (const g of groups) {
      // Special runs (e.g. "2026-07-GOVCON") are not invoice cutoffs.
      if (!CUTOFF_RX.test(g.cutoffPeriod)) continue
      const gross = Number(g._sum.grossPay || 0)
      const tax = Number(g._sum.taxAmount || 0)
      if (!gross && !tax) continue
      ;(payroll[g.consultantId] ||= {})[g.cutoffPeriod] = { gross, tax, net: Number(g._sum.netPay || 0) }
    }
    return NextResponse.json({ from, payroll, submissions })
  } catch (e) {
    console.error('SI tracking load error:', e)
    return NextResponse.json({ error: 'Failed to load service invoice tracking' }, { status: 500 })
  }
}
