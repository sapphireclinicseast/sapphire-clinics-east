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
  // Month range within the year (1-12); defaults to the whole year.
  const fromM = Math.min(12, Math.max(1, Number(searchParams.get('from') || 1)))
  const toM = Math.min(12, Math.max(fromM, Number(searchParams.get('to') || 12)))
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

    const inRange = (monthly: number[] | undefined, closing: number) => {
      if (fromM === 1 && toM === 12) return closing
      if (!monthly || monthly.length !== 12) return closing // no monthly detail — whole-year value
      let s = 0
      for (let m = fromM - 1; m <= toM - 1; m++) s += monthly[m] || 0
      return s
    }
    for (const b of branches) {
      const st = await computeLedgerStatements(year, b)
      for (const sec of st.incomeStatement.sections) {
        for (const r of sec.rows) {
          const v = inRange(r.monthly, r.closing)
          if (sec.key === 'REVENUE') {
            const dept = ACCOUNT_DEPT[r.number] || 'OTHER'
            gross[dept] = (gross[dept] || 0) + v
          } else if (sec.key === 'DISCOUNTS') {
            discountsTotal += v
          } else if (RENT_ACCOUNTS.has(r.number)) {
            rentByBranch[b] = (rentByBranch[b] || 0) + v
          } else if (r.number === PROF_FEE_ACCOUNT) {
            profFees8190 += v
          } else if (r.number === PRODUCT_COGS_ACCOUNT) {
            retailCogs += v
          } else if (sec.key === 'COGS' || sec.key === 'OPEX' || sec.key === 'DEPRECIATION' || sec.key === 'INTEREST') {
            otherByBranch[b] = (otherByBranch[b] || 0) + v
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
      // cutoffPeriod is `${year}-${month}-${half}`; month filtering happens below.
      select: { grossPay: true, cutoffPeriod: true, consultant: { select: { department: true } } },
    })
    const fees: Record<string, number> = {}
    let adminFees = 0
    let liveFeesTotal = 0
    const cutoffMonth = (cp: string) => Number((cp.split('-')[1] || '0'))
    for (const e of entries) {
      const g = Number(e.grossPay)
      if (!g) continue
      const m = cutoffMonth((e as unknown as { cutoffPeriod?: string }).cutoffPeriod || '')
      if (m && (m < fromM || m > toM)) continue
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
    // Department-tagged expense entries (petty cash / RFP expense rows and
    // tagged journal entries): each charges its own department(s), split
    // equally when several are ticked. Everything untagged — including all
    // history — follows the RENT percentages, per the owner's rule.
    const rangeStart = new Date(Date.UTC(year, fromM - 1, 1))
    const rangeEnd = new Date(Date.UTC(year, toM, 1))
    const ORDER_BRANCH: Record<string, string> = {
      SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS',
      VERDANA_STORE: 'VERDANA_STORE', AURA_INSTITUTE: 'AURA_INSTITUTE',
    }
    const ledgerBranches = branches.map(b => ORDER_BRANCH[b] || b)
    const tagged: Record<string, number> = {}
    let taggedTotal = 0
    const addTagged = (depts: string[], amount: number) => {
      const ds = depts.filter(d => DEPT_LABEL[d])
      if (!ds.length || !(amount > 0)) return
      taggedTotal += amount
      for (const d of ds) tagged[d] = (tagged[d] || 0) + amount / ds.length
    }
    const taggedPcv = await prisma.pettyCashEntry.findMany({
      where: {
        branch: { in: ledgerBranches },
        date: { gte: rangeStart, lt: rangeEnd },
        departments: { isEmpty: false },
      },
      select: { grossAmount: true, departments: true },
    })
    for (const e of taggedPcv) addTagged(e.departments as string[], Number(e.grossAmount))
    const taggedJes = await prisma.journalEntry.findMany({
      where: {
        entryDate: { gte: rangeStart, lt: rangeEnd },
        departments: { isEmpty: false },
        ...(branchSel === 'ALL' ? {} : { branch: { in: [...ledgerBranches, 'ALL'] } }),
      },
      select: { departments: true, lines: { select: { debit: true, credit: true, account: { select: { accountType: true, accountNumber: true } } } } },
    })
    for (const je of taggedJes) {
      const exp = je.lines.reduce((s, l) =>
        l.account.accountType === 'EXPENSE' && !RENT_ACCOUNTS.has(l.account.accountNumber) && l.account.accountNumber !== PROF_FEE_ACCOUNT
          ? s + Number(l.debit) - Number(l.credit) : s, 0)
      addTagged(je.departments as string[], exp)
    }

    const rentAlloc = allocate(rentByBranch, 'RENT')
    // Untagged expenses = the books' other-expense total less the tagged detail
    // (clamped at zero if tagging ever outruns the ledger), allocated by the
    // same RENT percentages.
    const otherTotalAll = Object.values(otherByBranch).reduce((s, v) => s + v, 0)
    const untaggedScale = otherTotalAll > 0 ? Math.max(0, otherTotalAll - taggedTotal) / otherTotalAll : 0
    const untaggedByBranch = Object.fromEntries(Object.entries(otherByBranch).map(([k, v]) => [k, v * untaggedScale]))
    const otherAlloc = allocate(untaggedByBranch, 'RENT')
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
      const other = round2((tagged[k] || 0) + (otherAlloc.out[k] || 0) + (k === 'RETAIL' ? retailCogs : 0))
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
      year, from: fromM, to: toM, branch: branchSel, rows,
      taggedExpenses: Math.round(taggedTotal * 100) / 100,
      adminFees: round2(adminFees),
      untaggedFees,
      rentTotal: round2(rentTotal),
      rentByBranch: Object.fromEntries(Object.entries(rentByBranch).map(([k, v]) => [k, round2(v)])),
      rentUnallocated: round2(rentUnallocated),
      otherUnallocated: round2(otherAlloc.unallocated),
      branchesMissingConfig,
      branchesMissingOtherConfig: [],
      notes: [
        'Revenue, discounts and every expense figure come from the ledger engine (identical to the income statement). Discounts are allocated pro-rata by gross-sales share.',
        'Professional fees are the consultant payroll gross by department (from the 2026-04-1 cutoff); fees beyond the tagged payroll are on the "not yet department-tagged" line so the total ties to account 8190.',
        'Other expenses: entries tagged to departments (petty cash, expense rows, journal entries) charge those departments directly — split equally when several are ticked. Everything untagged, including all historical entries, is allocated per branch by the RENT percentages. Product Cost of Sales (8320) is charged to Retail.',
        'Rent (8210 indirect + 8211 direct) is allocated per branch using the configured percentages — the "Rent allocation" button. Branches without a configuration are split equally across active departments.',
      ],
    })
  } catch (e) {
    console.error('[contribution] failed:', e)
    return NextResponse.json({ error: 'Failed to compute contribution analysis' }, { status: 500 })
  }
}
