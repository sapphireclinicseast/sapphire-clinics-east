import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { parseMonitoringRemark } from '@/lib/si-monitoring'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const TARGET_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'] // only these may set the target

// GET ?branch=&year=&month=            — Sales with SI (net) vs manual target for the month.
//     ?branch=&year=&mode=quarter&quarter=1..4 — the quarter's totals.
//     ?branch=&year=&mode=annual        — the whole year's totals.
// Quarter/annual SUM the stored monthly targets and the SI sales over the span
// (targets are only ever encoded per month — see PUT) and return a per-month
// breakdown so the view stays consistent with the month views it aggregates.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = enforceBranch((session.user as { branch?: string; branches?: string[] }).branch, (session.user as { branches?: string[] }).branches, sp.get('branch')) ?? (sp.get('branch') || '')
  const mode = sp.get('mode') || 'month'
  const month = parseInt(sp.get('month') || '0', 10)
  const quarter = parseInt(sp.get('quarter') || '0', 10)
  const year = parseInt(sp.get('year') || '0', 10)
  if (
    !VALID_BRANCHES.includes(branch) || year < 2000
    || !['month', 'quarter', 'annual'].includes(mode)
    || (mode === 'month' && (month < 1 || month > 12))
    || (mode === 'quarter' && (quarter < 1 || quarter > 4))
  ) {
    return NextResponse.json({ error: 'Valid branch, period and year are required' }, { status: 400 })
  }
  try {
    const startIdx = mode === 'month' ? month - 1 : mode === 'quarter' ? (quarter - 1) * 3 : 0
    const spanLen = mode === 'month' ? 1 : mode === 'quarter' ? 3 : 12
    const start = new Date(Date.UTC(year, startIdx, 1))
    const end = new Date(Date.UTC(year, startIdx + spanLen, 1))
    const orders = await prisma.order.findMany({
      where: {
        branch, status: { in: ['COMPLETED', 'REOPENED'] }, issuedOfficialInvoice: true, salesInvoiceNumber: { not: null },
        // A converted sale ("Convert to have Sales Invoice") counts toward the
        // month it was DECLARED in, matching the With SI book.
        OR: [
          { siDeclaredDate: null, transactionDate: { gte: start, lt: end } },
          { siDeclaredDate: { gte: start, lt: end } },
        ],
      },
      select: { netAmount: true, siDeclaredDate: true, transactionDate: true },
    })
    const targets = await prisma.salesTarget.findMany({
      where: { branch, periodYear: year, periodMonth: { gte: startIdx + 1, lte: startIdx + spanLen } },
    })
    const months = Array.from({ length: spanLen }, (_, i) => ({ month: startIdx + i + 1, salesWithSI: 0, target: 0 }))
    for (const o of orders) {
      const effective = o.siDeclaredDate ?? o.transactionDate
      const slot = months[new Date(effective).getUTCMonth() - startIdx]
      if (slot) slot.salesWithSI += Number(o.netAmount)
    }

    /* ── Migrated invoices from the manual SI monitoring workbook ──────
       Pre-hub sales (East, and GH before the hub) exist only as
       SalesInvoiceFlag REMARKS rows, amounts encoded in the remark text —
       the same rows the Sales Summary report counts. Bucket them by the
       workbook date (net amount when a PWD/SC net was recorded, matching
       sales-summary). An UNDATED row can't be placed in any month, so it is
       excluded from every period sum (keeping month/quarter/annual mutually
       consistent) and reported separately for the UI to disclose. */
    const flags = await prisma.salesInvoiceFlag.findMany({ where: { status: 'REMARKS', branch } })
    const migrated = { count: 0, amount: 0 }
    const migratedUndated = { count: 0, amount: 0 }
    for (const f of flags) {
      const info = parseMonitoringRemark(f.remarks)
      if (!info || info.amount == null || info.amount <= 0) continue
      const amt = info.netAmount ?? info.amount
      // A declared (SI-book) date set on the row wins over the workbook date.
      const dateStr = f.declaredDate ? new Date(f.declaredDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : info.date
      if (!dateStr) { migratedUndated.count++; migratedUndated.amount += amt; continue }
      if (parseInt(dateStr.slice(0, 4), 10) !== year) continue
      const slot = months[parseInt(dateStr.slice(5, 7), 10) - 1 - startIdx]
      if (slot) { slot.salesWithSI += amt; migrated.count++; migrated.amount += amt }
    }

    for (const t of targets) {
      const slot = months[t.periodMonth - 1 - startIdx]
      if (slot) slot.target = Number(t.target)
    }
    const salesWithSI = months.reduce((s, m) => s + m.salesWithSI, 0)
    const target = months.reduce((s, m) => s + m.target, 0)
    return NextResponse.json({
      branch, mode, year, salesWithSI, target, difference: target - salesWithSI, orderCount: orders.length, months,
      migrated, migratedUndated,
      ...(mode === 'month' ? { month } : {}), ...(mode === 'quarter' ? { quarter } : {}),
    })
  } catch (err) {
    console.error('Sales target error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT { branch, month, year, target } — set the monthly target (admin/accountant/bookkeeper only).
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !TARGET_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Only Admin, Accountant or Bookkeeper can set the sales target' }, { status: 403 })
  }
  try {
    const { branch, month, year, target } = await req.json()
    if (!VALID_BRANCHES.includes(branch) || !(month >= 1 && month <= 12) || !(year >= 2000)) {
      return NextResponse.json({ error: 'Valid branch, month and year are required' }, { status: 400 })
    }
    // Tolerate formatted input ("494,785.00", "₱494,785"); reject anything that
    // is not an amount rather than silently storing 0.
    const cleaned = typeof target === 'number' ? target : String(target ?? '').replace(/[^0-9.-]/g, '')
    const amt = cleaned === '' ? 0 : Number(cleaned)
    if (!Number.isFinite(amt) || amt < 0) return NextResponse.json({ error: `Target must be a number (got "${target}")` }, { status: 400 })
    await prisma.salesTarget.upsert({
      where: { branch_periodMonth_periodYear: { branch, periodMonth: month, periodYear: year } },
      update: { target: amt },
      create: { branch, periodMonth: month, periodYear: year, target: amt, createdById: session.user.id as string },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Sales target set error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
