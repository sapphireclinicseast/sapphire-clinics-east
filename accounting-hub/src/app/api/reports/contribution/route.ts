import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLedgerStatements } from '@/lib/reports/v2/engine'

/**
 * Contribution-margin analysis per department — a full department P&L:
 *
 *   Gross Sales → Discounts (pro-rata) → Net Sales
 *   − Professional Fees (live consultant payroll, by department)
 *   = Contribution Margin
 *   − Other Expenses (every other expense on the IS, split EQUALLY across the
 *     departments with sales; product Cost of Sales 8320 goes to Retail)
 *   − Rent (8210 indirect + 8211 direct, allocated per branch by the owner's
 *     configured percentages — ContributionRentAllocation; unconfigured
 *     branches fall back to an equal split)
 *   = Net Margin
 *
 * Revenue and every expense figure come from the ledger engine, so the totals
 * tie to the income statement.
 */

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const ACCOUNT_DEPT: Record<string, string> = {
  '7010': 'PT', '7020': 'OT', '7030': 'SLP', '7040': 'SPED',
  '7050': 'MD', '7120': 'ORTHOSIS', '7150': 'PSYCHOLOGY',
  '7070': 'TRAINING', '7080': 'RETAIL',
}
const DEPT_LABEL: Record<string, string> = {
  PT: 'PT', OT: 'OT', SLP: 'Speech', SPED: 'SPED', MD: 'Medical',
  ORTHOSIS: 'Orthosis', PSYCHOLOGY: 'Psychology', TRAINING: 'Training',
  RETAIL: 'Retail', OTHER: 'Other',
}
const CONSULTANT_DEPT: Record<string, string> = {
  PT: 'PT', OT: 'OT', SLP: 'SLP', SPED: 'SPED', MD: 'MD',
  ORTHOSIS: 'ORTHOSIS', PSYCHOLOGY: 'PSYCHOLOGY', EDU: 'TRAINING',
}
const PAYROLL_BRANCH: Record<string, string[]> = {
  SBEA: ['SBEA'], SANDBOX_EAST: ['SBEA'],
  SBGH: ['SBGH'], SANDBOX_GREENHILLS: ['SBGH'],
  VERDANA_STORE: ['VERDANA'], AURA_INSTITUTE: ['AHI'],
}
const RENT_ACCOUNTS = new Set(['8210', '8211'])
const PROF_FEE_ACCOUNT = '8190'
const PRODUCT_COGS_ACCOUNT = '8320'

export async function GET(req: Request) {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  if (!session?.user || !READ_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') || new Date().getFullYear())
  const branchSel = searchParams.get('branch') || 'ALL'
  // Rent is allocated per branch, so 'ALL' expands to the real branches.
  const branches = branchSel === 'ALL'
    ? ['SBEA', 'SBGH', 'VERDANA_STORE', 'AURA_INSTITUTE']
    : branchSel.split('+')

  try {
    const gross: Record<string, number> = {}
    let discountsTotal = 0
    let profFees8190 = 0
    let retailCogs = 0
    const rentByBranch: Record<string, number> = {}
    const otherByBranch: Record<string, number> = {}

    for (const b of branches) {
      const st = await computeLedgerStatements(year, b)
      for (const sec of st.incomeStatement.sections) {
        for (const r of sec.rows) {
          if (sec.key === 'REVENUE') {
            const dept = ACCOUNT_DEPT[r.number] || 'OTHER'
            gross[dept] = (gross[dept] || 0) + r.closing
          } else if (sec.key === 'DISCOUNTS') {
            discountsTotal += r.closing
          } else if (RENT_ACCOUNTS.has(r.number)) {
            rentByBranch[b] = (rentByBranch[b] || 0) + r.closing
          } else if (r.number === PROF_FEE_ACCOUNT) {
            profFees8190 += r.closing
          } else if (r.number === PRODUCT_COGS_ACCOUNT) {
            retailCogs += r.closing
          } else if (sec.key === 'COGS' || sec.key === 'OPEX' || sec.key === 'DEPRECIATION' || sec.key === 'INTEREST') {
            otherByBranch[b] = (otherByBranch[b] || 0) + r.closing
          }
        }
      }
    }
    const grossTotal = Object.values(gross).reduce((s, v) => s + v, 0)

    // ── Professional fees per department (live consultant payroll) ──
    const payrollBranches = branches.flatMap(b => PAYROLL_BRANCH[b] || [])
    const entries = await prisma.payrollEntry.findMany({
      where: {
        branch: { in: payrollBranches },
        cutoffPeriod: { startsWith: `${year}-` },
        status: { in: ['FINAL', 'LOCKED'] },
      },
      select: { grossPay: true, consultant: { select: { department: true } } },
    })
    const fees: Record<string, number> = {}
    let adminFees = 0
    let liveFeesTotal = 0
    for (const e of entries) {
      const g = Number(e.grossPay)
      if (!g) continue
      liveFeesTotal += g
      const dept = CONSULTANT_DEPT[e.consultant?.department || '']
      if (dept) fees[dept] = (fees[dept] || 0) + g
      else adminFees += g
    }
    const untaggedFees = Math.round((profFees8190 - liveFeesTotal) * 100) / 100

    // ── Allocation: per branch, by configured % per category (equal split fallback) ──
    const allocRows = await prisma.contributionRentAllocation.findMany({
      where: { branch: { in: branches } },
    })
    const deptKeys = Array.from(new Set([...Object.keys(gross), ...Object.keys(fees)]))
      .sort((a, b) => (gross[b] || 0) - (gross[a] || 0))
    const activeDepts = deptKeys.filter(k => (gross[k] || 0) > 0)
    const allocate = (byBranch: Record<string, number>, category: string) => {
      const out: Record<string, number> = {}
      let unallocated = 0
      const missing: string[] = []
      for (const b of branches) {
        const total = byBranch[b] || 0
        if (!total) continue
        const cfg = allocRows.filter(a => a.branch === b && (a.category || 'RENT') === category && Number(a.pct) > 0)
        const cfgSum = cfg.reduce((s, a) => s + Number(a.pct), 0)
        if (cfgSum > 0) {
          for (const a of cfg) out[a.department] = (out[a.department] || 0) + total * Number(a.pct) / 100
          if (cfgSum < 99.995) unallocated += total * (100 - cfgSum) / 100
        } else {
          missing.push(b)
          for (const k of activeDepts) out[k] = (out[k] || 0) + total / (activeDepts.length || 1)
        }
      }
      return { out, unallocated, missing }
    }
    const rentAlloc = allocate(rentByBranch, 'RENT')
    const otherAlloc = allocate(otherByBranch, 'OTHER')
    const rent = rentAlloc.out
    const rentUnallocated = rentAlloc.unallocated
    const branchesMissingConfig = rentAlloc.missing
    const rentTotal = Object.values(rentByBranch).reduce((s, v) => s + v, 0)

    const round2 = (v: number) => Math.round(v * 100) / 100
    const rows = deptKeys.map(k => {
      const g = round2(gross[k] || 0)
      const disc = grossTotal > 0 ? round2(discountsTotal * (gross[k] || 0) / grossTotal) : 0
      const net = round2(g - disc)
      const f = round2(fees[k] || 0)
      const cm = round2(net - f)
      const other = round2((otherAlloc.out[k] || 0) + (k === 'RETAIL' ? retailCogs : 0))
      const rentK = round2(rent[k] || 0)
      const nm = round2(cm - other - rentK)
      return {
        key: k, label: DEPT_LABEL[k] || k,
        gross: g, discounts: disc, net, fees: f, cm,
        cmPct: net > 0 ? Math.round((cm / net) * 1000) / 10 : null,
        other, rent: rentK, nm,
        nmPct: net > 0 ? Math.round((nm / net) * 1000) / 10 : null,
      }
    })

    return NextResponse.json({
      year, branch: branchSel, rows,
      adminFees: round2(adminFees),
      untaggedFees,
      rentTotal: round2(rentTotal),
      rentByBranch: Object.fromEntries(Object.entries(rentByBranch).map(([k, v]) => [k, round2(v)])),
      rentUnallocated: round2(rentUnallocated),
      otherUnallocated: round2(otherAlloc.unallocated),
      branchesMissingConfig,
      branchesMissingOtherConfig: otherAlloc.missing,
      notes: [
        'Revenue, discounts and every expense figure come from the ledger engine (identical to the income statement). Discounts are allocated pro-rata by gross-sales share.',
        'Professional fees are the consultant payroll gross by department (from the 2026-04-1 cutoff); fees beyond the tagged payroll are on the "not yet department-tagged" line so the total ties to account 8190.',
        'Other expenses (all remaining cost of sales, operating expenses, depreciation and interest) are allocated per branch using the configured percentages (\'Expense allocation\' button, Other tab); branches without a configuration split equally across departments with sales. Product Cost of Sales (8320) is charged to Retail.',
        'Rent (8210 indirect + 8211 direct) is allocated per branch using the configured percentages — the "Rent allocation" button. Branches without a configuration are split equally across active departments.',
      ],
    })
  } catch (e) {
    console.error('[contribution] failed:', e)
    return NextResponse.json({ error: 'Failed to compute contribution analysis' }, { status: 500 })
  }
}
