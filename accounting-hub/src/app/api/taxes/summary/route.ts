import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLedgerStatements } from '@/lib/reports/v2/engine'

const VAT_RATE = 0.12
const CORP_RATE = 0.20

// GET /api/taxes/summary — company-wide (all-branch) current tax positions for
// the Taxes → Guide & Summary snapshot. Each figure is derived from the same
// data the individual computation panels use, for the current month / quarter.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const y = now.getUTCFullYear()
  const ym = `${y}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const qIdx = Math.floor(now.getUTCMonth() / 3) // 0..3
  const qMonthNums = [qIdx * 3 + 1, qIdx * 3 + 2, qIdx * 3 + 3] // 1-based
  const monthsThroughQ = (qIdx + 1) * 3
  const qStart = new Date(Date.UTC(y, qIdx * 3, 1))
  const qEnd = new Date(Date.UTC(y, qIdx * 3 + 3, 1)) // exclusive
  const inQuarterYm = (cp: string) => cp.startsWith(`${y}-`) && qMonthNums.includes(parseInt(cp.slice(5, 7)))

  // ── 1601-C: current-month withholding on compensation (LOCKED, all branches) ──
  const wcSlips = await prisma.employeePayslip.findMany({
    where: { status: 'LOCKED', cutoffPeriod: { startsWith: ym }, taxDeduction: { gt: 0 } },
    select: { taxDeduction: true },
  })
  const wc = wcSlips.reduce((s, p) => s + Number(p.taxDeduction), 0)

  // ── EWT: consultant professional-fee withholding (PayrollEntry.taxAmount) +
  //    expense expanded withholding (PettyCashEntry). Month → 0619-E, quarter → 1601-EQ.
  const consult = await prisma.payrollEntry.findMany({
    where: { taxAmount: { gt: 0 }, status: 'LOCKED' },
    select: { taxAmount: true, cutoffPeriod: true },
  })
  let ewtMonth = 0, ewtQuarter = 0
  for (const e of consult) {
    const amt = Number(e.taxAmount)
    if (e.cutoffPeriod.startsWith(ym)) ewtMonth += amt
    if (inQuarterYm(e.cutoffPeriod)) ewtQuarter += amt
  }
  const ewtExps = await prisma.pettyCashEntry.findMany({
    where: { hasEwt: true, ewtRate: { not: null }, OR: [{ paidAt: { not: null } }, { reimbursementId: { not: null } }] },
    select: { grossAmount: true, ewtRate: true, vatable: true, paidAt: true, date: true },
  })
  for (const e of ewtExps) {
    const when = e.paidAt || e.date
    if (!when) continue
    const w = new Date(when)
    const net = e.vatable === 'VAT' ? Number(e.grossAmount) / 1.12 : Number(e.grossAmount)
    const ewt = net * ((e.ewtRate || 0) / 100)
    const wym = w.toISOString().slice(0, 7)
    if (wym === ym) ewtMonth += ewt
    if (w >= qStart && w < qEnd) ewtQuarter += ewt
  }

  // ── 2550Q: current-quarter output VAT − input VAT (all branches), before carryover ──
  const orders = await prisma.order.findMany({
    where: { orderType: 'PRODUCT', status: 'COMPLETED', returnedByBuyer: false, transactionDate: { gte: qStart, lt: qEnd } },
    select: { netAmount: true },
  })
  const outputVat = orders.reduce((s, o) => s + Number(o.netAmount), 0) * (VAT_RATE / (1 + VAT_RATE))
  const vExps = await prisma.pettyCashEntry.findMany({
    where: { recordType: { in: ['ONE_TIME', 'RECURRING'] }, vatable: 'VAT', paidAt: { not: null }, date: { gte: qStart, lt: qEnd } },
    select: { grossAmount: true },
  })
  const inputVat = vExps.reduce((s, e) => s + Number(e.grossAmount), 0) * (VAT_RATE / (1 + VAT_RATE))
  const vat = outputVat - inputVat // before input-tax carryover

  // ── 1702Q: cumulative net income (pre-tax) through the quarter × 20% ──
  let it = 0
  try {
    const st = await computeLedgerStatements(y, 'ALL')
    const arr: number[] = st?.cashFlow?.monthly?.netIncome || []
    const cumNi = arr.slice(0, monthsThroughQ).reduce((s, v) => s + (v || 0), 0)
    it = Math.max(0, cumNi * CORP_RATE)
  } catch { /* engine failure → leave income tax at 0 */ }

  const r2 = (n: number) => Math.round(n * 100) / 100
  return NextResponse.json({
    month: ym, quarter: qIdx + 1, year: y,
    wc: r2(wc), ewt0619: r2(ewtMonth), ewt1601eq: r2(ewtQuarter), vat: r2(vat), it: r2(it),
  })
}
