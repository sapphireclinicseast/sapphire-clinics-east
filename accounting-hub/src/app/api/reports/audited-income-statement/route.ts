import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { parseMonitoringRemark } from '@/lib/si-monitoring'
import { isPayrollItem } from '@/lib/payroll-item-guard'

/**
 * Audited Income Statement — GET ?year=&branch=
 *
 * The declarable view of the year, built from SOURCE RECORDS rather than the
 * GL, because every inclusion rule is a record-level attribute the ledger
 * does not carry:
 *
 *   Sales     — only sales WITH a Sales Invoice: SI orders (attributed to the
 *               month of siDeclaredDate when set, transactionDate otherwise,
 *               matching the With SI book), AR collections issued an SI, and
 *               dated invoices migrated from the manual SI monitoring workbook.
 *   Expenses  — petty-cash / one-time entries tagged Valid, excluding
 *               payroll-pattern lines (compensation is reported from Payroll
 *               below, never twice). VAT entries count net of input VAT.
 *   Salaries  — every finalized employee payslip (gross pay).
 *   Prof fees — finalized consultant payroll gross, ONLY for consultants with
 *               a BIR Certificate of Registration (2303) on file.
 *
 * Everything is bucketed per month (1–12) so the page renders the standard
 * Jan–Dec + Total layout.
 */

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER']
const VALID_BRANCHES = ['ALL', 'SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
// Payroll stores its own branch codes; map to the petty-cash/order enum.
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }

const r2 = (n: number) => Math.round(n * 100) / 100
const emptyMonths = () => Array.from({ length: 12 }, () => 0)

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const year = parseInt(sp.get('year') || '', 10)
  if (!(year >= 2000 && year <= 2100)) return NextResponse.json({ error: 'A valid year is required' }, { status: 400 })
  const branch = enforceBranch((session.user as { branch?: string; branches?: string[] }).branch, (session.user as { branches?: string[] }).branches, sp.get('branch')) ?? (sp.get('branch') || 'ALL')
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })

  // Manila-anchored year window.
  const from = new Date(`${year}-01-01T00:00:00+08:00`)
  const to = new Date(`${year + 1}-01-01T00:00:00+08:00`)
  const monthOf = (d: Date) => parseInt(d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'numeric' }), 10) - 1
  const yearOf = (d: Date) => parseInt(d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric' }), 10)

  try {
    /* ── Sales with Sales Invoice ──────────────────────────────── */
    const range = { gte: from, lt: to }
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['COMPLETED', 'REOPENED'] },
        issuedOfficialInvoice: true, salesInvoiceNumber: { not: null },
        ...(branch !== 'ALL' ? { branch } : {}),
        OR: [
          { siDeclaredDate: null, transactionDate: range },
          { siDeclaredDate: range },
        ],
      },
      select: { netAmount: true, transactionDate: true, siDeclaredDate: true },
    })
    const siOrders = emptyMonths()
    for (const o of orders) siOrders[monthOf(o.siDeclaredDate || o.transactionDate)] += Number(o.netAmount)

    const arPays = await prisma.aRPayment.findMany({
      where: {
        salesInvoiceNumber: { not: null }, paymentDate: range,
        ...(branch !== 'ALL' ? { branch } : {}),
      },
      select: { amount: true, discount: true, paymentDate: true },
    })
    const siAr = emptyMonths()
    // Gross of the waived discount — the invoice covers the full service value,
    // matching the With SI tab's totals.
    for (const p of arPays) siAr[monthOf(p.paymentDate)] += Number(p.amount) + Number(p.discount)

    // Pre-hub invoices from the manual monitoring workbook: REMARKS flags with
    // date/amount encoded in the remark. Only dated rows can join a monthly
    // statement; undated ones are counted and surfaced so they are never
    // silently dropped.
    const flags = await prisma.salesInvoiceFlag.findMany({
      where: { status: 'REMARKS', ...(branch !== 'ALL' ? { branch } : {}) },
      select: { remarks: true },
    })
    const siMigrated = emptyMonths()
    let migratedUndated = 0
    for (const f of flags) {
      const info = parseMonitoringRemark(f.remarks)
      if (!info || !(info.amount != null && info.amount > 0)) continue
      if (!info.date) { migratedUndated++; continue }
      const d = new Date(`${info.date}T12:00:00+08:00`)
      if (yearOf(d) !== year) continue
      siMigrated[monthOf(d)] += Number(info.netAmount ?? info.amount)
    }

    /* ── Valid expenses (net of input VAT) ─────────────────────── */
    const entries = await prisma.pettyCashEntry.findMany({
      where: { validity: 'Valid', date: range },
      select: { date: true, grossAmount: true, vatable: true, accountTitle: true, description: true, branch: true, branchAllocations: true },
    })
    const expenseByTitle = new Map<string, number[]>()
    let payrollPatternExcluded = 0
    for (const e of entries) {
      // Compensation is reported from Payroll below — a salary-pattern entry
      // here would double-count it.
      if (isPayrollItem(e)) { payrollPatternExcluded++; continue }
      const allocs = (Array.isArray(e.branchAllocations) ? e.branchAllocations : []) as { branch?: string; amount?: number | string }[]
      let gross = Number(e.grossAmount) || 0
      if (branch !== 'ALL') {
        if (allocs.some(a => a?.branch)) {
          gross = allocs.filter(a => a?.branch === branch).reduce((s, a) => s + (Number(a.amount) || 0), 0)
        } else if (e.branch !== branch) {
          gross = 0
        }
      }
      if (gross === 0 || !e.date) continue
      const net = e.vatable === 'VAT' ? gross / 1.12 : gross
      const title = (e.accountTitle || 'Uncategorized').trim() || 'Uncategorized'
      const arr = expenseByTitle.get(title) || emptyMonths()
      arr[monthOf(e.date)] += net
      expenseByTitle.set(title, arr)
    }
    const expenses = [...expenseByTitle.entries()]
      .map(([title, byMonth]) => ({ title, byMonth: byMonth.map(r2), total: r2(byMonth.reduce((s, v) => s + v, 0)) }))
      .sort((a, b) => b.total - a.total)

    /* ── Salaries — finalized employee payslips, gross ─────────── */
    const cutoffMonth = (cutoff: string): number | null => {
      const m = cutoff.match(/^(\d{4})-(\d{1,2})-/)
      if (!m || parseInt(m[1], 10) !== year) return null
      const mo = parseInt(m[2], 10)
      return mo >= 1 && mo <= 12 ? mo - 1 : null
    }
    const pcOfPayroll = (b: string) => PAYROLL_TO_PC[b] || b
    const payslips = await prisma.employeePayslip.findMany({
      where: { status: { in: ['FINAL', 'LOCKED'] }, cutoffPeriod: { startsWith: `${year}-` } },
      select: { cutoffPeriod: true, grossPay: true, branch: true },
    })
    const salaries = emptyMonths()
    for (const p of payslips) {
      if (branch !== 'ALL' && pcOfPayroll(p.branch) !== branch) continue
      const mo = cutoffMonth(p.cutoffPeriod)
      if (mo === null) continue
      salaries[mo] += Number(p.grossPay)
    }

    /* ── Professional fees — consultants WITH a COR only ───────── */
    const pf = emptyMonths()
    const pfEntries = await prisma.payrollEntry.findMany({
      where: {
        status: { in: ['FINAL', 'LOCKED'] },
        cutoffPeriod: { startsWith: `${year}-` },
        consultant: { corUrl: { not: null } },
      },
      select: { cutoffPeriod: true, grossPay: true, branch: true },
    })
    let pfExcludedNoCor = 0
    const pfNoCor = await prisma.payrollEntry.aggregate({
      where: {
        status: { in: ['FINAL', 'LOCKED'] },
        cutoffPeriod: { startsWith: `${year}-` },
        consultant: { corUrl: null },
        ...(branch !== 'ALL' ? { branch: Object.entries(PAYROLL_TO_PC).find(([, pc]) => pc === branch)?.[0] || '—' } : {}),
      },
      _sum: { grossPay: true }, _count: true,
    })
    pfExcludedNoCor = Number(pfNoCor._sum.grossPay || 0)
    for (const e of pfEntries) {
      if (branch !== 'ALL' && pcOfPayroll(e.branch) !== branch) continue
      const mo = cutoffMonth(e.cutoffPeriod)
      if (mo === null) continue
      pf[mo] += Number(e.grossPay)
    }

    /* ── Assemble ──────────────────────────────────────────────── */
    const sum = (a: number[]) => r2(a.reduce((s, v) => s + v, 0))
    const salesByMonth = siOrders.map((v, i) => r2(v + siAr[i] + siMigrated[i]))
    const expenseTotalByMonth = emptyMonths().map((_, i) => r2(expenses.reduce((s, e) => s + e.byMonth[i], 0)))
    const netByMonth = salesByMonth.map((v, i) => r2(v - expenseTotalByMonth[i] - r2(salaries[i]) - r2(pf[i])))

    return NextResponse.json({
      year, branch,
      sales: {
        orders: siOrders.map(r2), arCollections: siAr.map(r2), migrated: siMigrated.map(r2),
        byMonth: salesByMonth, total: sum(salesByMonth), migratedUndated,
      },
      expenses: { lines: expenses, byMonth: expenseTotalByMonth, total: sum(expenseTotalByMonth), payrollPatternExcluded },
      salaries: { byMonth: salaries.map(r2), total: sum(salaries) },
      professionalFees: { byMonth: pf.map(r2), total: sum(pf), excludedNoCorTotal: r2(pfExcludedNoCor), excludedNoCorCount: pfNoCor._count },
      netIncome: { byMonth: netByMonth, total: sum(netByMonth) },
    })
  } catch (err) {
    console.error('Audited income statement error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
