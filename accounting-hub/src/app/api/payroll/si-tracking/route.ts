import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CUTOFF_RX, SI_BRANCHES, siTrackKey } from '@/lib/payroll/si-coverage'
import { toAdjustment } from '@/lib/payroll/si-amounts-server'
import { fetchHrStaffForSync } from '@/lib/external-staff'
import { normalizePersonName } from '@/lib/payroll/hr-cor'

/**
 * Each consultant's start date from HR Hub Staff Profiles ("Date Hired"),
 * matched by name the same way the COR sync matches. Months before it are
 * N/A in Compliance by Person. Empty when the HR Hub can't be reached in time.
 */
async function hrStartDates(consultants: { id: string; name: string }[]): Promise<Record<string, string>> {
  const staff = await Promise.race([
    fetchHrStaffForSync(),
    new Promise<[]>(resolve => setTimeout(() => resolve([]), 5000)),
  ])
  const byName = new Map<string, string>()
  for (const s of staff) {
    const m = typeof s.dateHired === 'string' ? s.dateHired.trim().match(/^(\d{4}-\d{2}(-\d{2})?)/) : null
    if (m) byName.set(normalizePersonName(`${s.firstName || ''} ${s.lastName || ''}`), m[1])
  }
  const out: Record<string, string> = {}
  for (const c of consultants) {
    const d = byName.get(normalizePersonName(c.name))
    if (d) out[c.id] = d
  }
  return out
}

const MONTH_RX = /^\d{4}-\d{2}$/
// Same roles that could already see these figures through the reminder preview.
const ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * GET /api/payroll/si-tracking[?from=YYYY-MM]
 *
 * Everything the Service Invoice tracking screen needs in one call, so no row
 * has to fetch its own figures:
 *  - payroll: finalized pay per row per cutoff (gross, withholding, net),
 *    from `from` (default: 24 months back). A row is a consultant (all
 *    branches summed) or, for a consultant paid at more than one branch, one
 *    of their branches ("cid@SBGH"), since each branch is invoiced apart;
 *  - splits: consultantId → the branches they are tracked by, for those
 *    consultants only;
 *  - submissions: every recorded invoice row from that month on. A row's
 *    `month` is a whole month ("YYYY-MM") or one cutoff ("YYYY-MM-1"/"-2"),
 *    with the SI number and amount when they were entered, its `branch` and
 *    the `track` (row key) it is shown under;
 *  - adjustments: invoice-vs-payroll differences and where each is carried
 *    (with `branch` and `track` too);
 *  - startDates: consultantId → start date from the HR Hub (see hrStartDates).
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
    const startDatesP = prisma.consultant.findMany({ select: { id: true, name: true } }).then(hrStartDates).catch(() => ({}))
    const [groups, submissionRows, adjustmentRows, homes] = await Promise.all([
      prisma.payrollEntry.groupBy({
        by: ['consultantId', 'cutoffPeriod', 'branch'],
        where: { status: { in: ['LOCKED', 'FINAL'] }, cutoffPeriod: { gte: `${from}-1` } },
        _sum: { grossPay: true, taxAmount: true, netPay: true },
      }),
      prisma.consultantSiSubmission.findMany({
        where: { month: { gte: from } },
        select: { consultantId: true, month: true, branch: true, siUrl: true, uploadedAt: true, siNumber: true, invoiceAmount: true, expectedAmount: true },
        orderBy: [{ month: 'asc' }],
      }),
      prisma.consultantSiAdjustment.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.consultant.findMany({ select: { id: true, branch: true } }),
    ])
    // Special runs (e.g. "2026-07-GOVCON") are not invoice cutoffs.
    const paid = groups.filter(g => CUTOFF_RX.test(g.cutoffPeriod) && (Number(g._sum.grossPay || 0) || Number(g._sum.taxAmount || 0)))

    // Who is invoiced per branch: paid at (or invoiced to) more than one branch.
    const siBranch = (b: string | null | undefined) => (SI_BRANCHES as readonly string[]).includes(b || '') ? b as string : ''
    const seen = new Map<string, Set<string>>()
    const note = (cid: string, b: string) => { if (b) (seen.get(cid) || seen.set(cid, new Set()).get(cid)!).add(b) }
    for (const g of paid) note(g.consultantId, siBranch(g.branch))
    for (const r of submissionRows) note(r.consultantId, siBranch(r.branch))
    const splits: Record<string, string[]> = {}
    for (const [cid, set] of seen) if (set.size > 1) splits[cid] = [...set].sort()
    const home = new Map(homes.map(c => [c.id, c.branch]))
    /** The row a record belongs to. An untagged record of an interbranch consultant (saved before branches) sits under their home branch. */
    const trackOf = (cid: string, branch: string | null | undefined) => {
      const list = splits[cid]
      if (!list) return cid
      const b = siBranch(branch)
      const h = home.get(cid) || ''
      return siTrackKey(cid, b && list.includes(b) ? b : list.includes(h) ? h : list[0])
    }

    const submissions = submissionRows.map(r => ({
      ...r,
      invoiceAmount: r.invoiceAmount === null ? null : Number(r.invoiceAmount),
      expectedAmount: r.expectedAmount === null ? null : Number(r.expectedAmount),
      track: trackOf(r.consultantId, r.branch),
    }))
    const adjustments = adjustmentRows.map(toAdjustment).map(a => ({ ...a, track: trackOf(a.consultantId, a.branch) }))
    const payroll: Record<string, Record<string, { gross: number; tax: number; net: number }>> = {}
    for (const g of paid) {
      const p = ((payroll[trackOf(g.consultantId, g.branch)] ||= {})[g.cutoffPeriod] ||= { gross: 0, tax: 0, net: 0 })
      p.gross += Number(g._sum.grossPay || 0)
      p.tax += Number(g._sum.taxAmount || 0)
      p.net += Number(g._sum.netPay || 0)
    }
    return NextResponse.json({ from, payroll, splits, submissions, adjustments, startDates: await startDatesP })
  } catch (e) {
    console.error('SI tracking load error:', e)
    return NextResponse.json({ error: 'Failed to load service invoice tracking' }, { status: 500 })
  }
}
