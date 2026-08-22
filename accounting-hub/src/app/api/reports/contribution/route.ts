import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLedgerStatements } from '@/lib/reports/v2/engine'

/**
 * Contribution-margin analysis per department.
 *
 * Revenue comes from the ledger engine's income statement (the same numbers as
 * the on-screen statements), with each revenue account mapped to its
 * department. Order-level discounts cannot be tied to one department, so they
 * are allocated pro-rata by gross-sales share. Professional fees come from the
 * live consultant payroll (PayrollEntry × Consultant.department) — available
 * from the 2026-04-1 cutoff; earlier fees exist only as untagged journal
 * imports and are shown on their own "not yet department-tagged" line so the
 * section still ties to the income statement's 8190 total.
 */

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// Revenue account → department bucket.
const ACCOUNT_DEPT: Record<string, string> = {
  '7010': 'PT', '7020': 'OT', '7030': 'SLP', '7040': 'SPED',
  '7050': 'MD', '7120': 'ORTHOSIS', '7150': 'PSYCHOLOGY',
  '7070': 'TRAINING', '7080': 'RETAIL',
}
const DEPT_LABEL: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', SLP: 'Speech Therapy',
  SPED: 'SPED', MD: 'Medical Consultation', ORTHOSIS: 'Orthosis & Prosthesis',
  PSYCHOLOGY: 'Psychology', TRAINING: 'Training & Education', RETAIL: 'Retail / Products',
  OTHER: 'Other Operating Income',
}
// Consultant.department → the same buckets (EDU trains; ADMINISTRATION is overhead).
const CONSULTANT_DEPT: Record<string, string> = {
  PT: 'PT', OT: 'OT', SLP: 'SLP', SPED: 'SPED', MD: 'MD',
  ORTHOSIS: 'ORTHOSIS', PSYCHOLOGY: 'PSYCHOLOGY', EDU: 'TRAINING',
}
// Payroll stores its own branch codes.
const PAYROLL_BRANCH: Record<string, string[]> = {
  SBEA: ['SBEA'], SANDBOX_EAST: ['SBEA'],
  SBGH: ['SBGH'], SANDBOX_GREENHILLS: ['SBGH'],
  VERDANA_STORE: ['VERDANA'], AURA_INSTITUTE: ['AHI'],
}

export async function GET(req: Request) {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  if (!session?.user || !READ_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') || new Date().getFullYear())
  const branchSel = searchParams.get('branch') || 'ALL'
  const branches = branchSel === 'ALL' ? ['ALL'] : branchSel.split('+')

  try {
    // ── Revenue per department, from the engine (summed over ticked branches) ──
    const gross: Record<string, number> = {}
    let discountsTotal = 0
    let profFees8190 = 0
    for (const b of branches) {
      const st = await computeLedgerStatements(year, b)
      for (const sec of st.incomeStatement.sections) {
        for (const r of sec.rows) {
          if (sec.key === 'REVENUE') {
            const dept = ACCOUNT_DEPT[r.number] || 'OTHER'
            gross[dept] = (gross[dept] || 0) + r.closing
          } else if (sec.key === 'DISCOUNTS') {
            discountsTotal += r.closing
          } else if (sec.key === 'COGS' && r.number === '8190') {
            profFees8190 += r.closing
          }
        }
      }
    }
    const grossTotal = Object.values(gross).reduce((s, v) => s + v, 0)

    // ── Professional fees per department, from live consultant payroll ──
    const payrollBranches = branchSel === 'ALL'
      ? ['SBEA', 'SBGH', 'VERDANA', 'AHI']
      : branches.flatMap(b => PAYROLL_BRANCH[b] || [])
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
    // 8190 on the books beyond what live payroll explains (QB-era months,
    // manual entries) — kept visible so the section ties to the statements.
    const untaggedFees = Math.round((profFees8190 - liveFeesTotal) * 100) / 100

    const deptKeys = Array.from(new Set([...Object.keys(gross), ...Object.keys(fees)]))
      .sort((a, b) => (gross[b] || 0) - (gross[a] || 0))
    const rows = deptKeys.map(k => {
      const g = Math.round((gross[k] || 0) * 100) / 100
      const disc = grossTotal > 0 ? Math.round((discountsTotal * (gross[k] || 0) / grossTotal) * 100) / 100 : 0
      const net = Math.round((g - disc) * 100) / 100
      const f = Math.round((fees[k] || 0) * 100) / 100
      const cm = Math.round((net - f) * 100) / 100
      return {
        key: k, label: DEPT_LABEL[k] || k,
        gross: g, discounts: disc, net, fees: f, cm,
        cmPct: net > 0 ? Math.round((cm / net) * 1000) / 10 : null,
      }
    })

    return NextResponse.json({
      year, branch: branchSel, rows,
      adminFees: Math.round(adminFees * 100) / 100,
      untaggedFees,
      notes: [
        'Revenue and discounts come from the ledger engine (identical to the income statement). Discounts are order-level, so they are allocated to departments pro-rata by gross-sales share.',
        'Professional fees are the consultant payroll gross (rates × sessions + retainers + incentives) by each consultant\'s department, available from the 2026-04-1 cutoff. Fees on the books beyond the tagged payroll (earlier months, manual entries) appear on the "not yet department-tagged" line so the total ties to account 8190.',
        'Contribution margin = net sales − professional fees: what each department contributes toward indirect salaries, rent, utilities and other fixed costs.',
      ],
    })
  } catch (e) {
    console.error('[contribution] failed:', e)
    return NextResponse.json({ error: 'Failed to compute contribution analysis' }, { status: 500 })
  }
}
