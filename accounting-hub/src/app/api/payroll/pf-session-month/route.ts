import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PF_ACCRUAL_TYPE, otherMonthSessionPf, syncPfSessionAccruals, usesSessionMonthAccruals,
} from '@/lib/payroll/pf-session-month'

// Catch-up for cutoffs locked before payroll finalize booked consultant fees
// in their session month (see lib/payroll/pf-session-month.ts). New locks do
// it themselves; this rebuilds the accruals for every locked consultant cutoff
// on or after PF_SESSION_MONTH_FROM. Safe to re-run — each cutoff's pairs are
// deleted and rebuilt from its locked payslips.

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER']
const BRANCH_DISPLAY: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH' }
const LEDGER_BRANCH: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', SBVR: 'VERDANA_STORE', VERDANA: 'VERDANA_STORE' }

async function lockedCutoffs() {
  const rows = await prisma.payrollPayableStatus.findMany({
    where: { payrollType: 'CONSULTANT' },
    select: { cutoffPeriod: true, branch: true },
    orderBy: [{ cutoffPeriod: 'asc' }, { branch: 'asc' }],
  })
  return rows.filter(r => usesSessionMonthAccruals(r.cutoffPeriod))
}

// GET: what each cutoff should move vs what the ledger holds today.
export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const cutoffs = await lockedCutoffs()
  const [entries, posted] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { status: 'LOCKED', OR: cutoffs.map(c => ({ cutoffPeriod: c.cutoffPeriod, branch: c.branch })) },
      select: { cutoffPeriod: true, branch: true, items: true },
    }),
    prisma.journalEntry.findMany({
      where: { referenceType: PF_ACCRUAL_TYPE },
      select: { referenceId: true, totalAmount: true },
    }),
  ])
  const due = new Map<string, number>()
  for (const e of entries) {
    for (const [ym, amt] of otherMonthSessionPf(e.items, e.cutoffPeriod)) {
      const k = `${e.cutoffPeriod}|${e.branch}|${ym}`
      due.set(k, (due.get(k) || 0) + amt)
    }
  }
  const have = new Map(posted.map(p => [p.referenceId || '', Number(p.totalAmount)]))
  const rows = [...new Set([...due.keys(), ...have.keys()].filter(Boolean))].sort().map(k => {
    const [cutoffPeriod, branch, sessionMonth] = k.split('|')
    const shouldBe = Math.round((due.get(k) || 0) * 100) / 100
    const booked = have.get(k) || 0
    return { cutoffPeriod, branch, sessionMonth, shouldBe, booked, upToDate: Math.abs(shouldBe - booked) < 0.01 }
  })
  return NextResponse.json({ rows })
}

// POST: rebuild the accruals. Body { cutoffPeriod?, branch? } narrows it to one
// cutoff; empty body = every eligible locked cutoff.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({})) as { cutoffPeriod?: string; branch?: string }
  const mapping = await prisma.payrollCOAMapping.findFirst()
  if (!mapping?.professionalFeesAccountId || !mapping.salariesPayableAccountId) {
    return NextResponse.json({ error: 'Professional Fees and Salaries Payable accounts must be configured.' }, { status: 400 })
  }
  const feesAccountId = mapping.professionalFeesAccountId
  const payableAccountId = mapping.salariesPayableAccountId
  const cutoffs = (await lockedCutoffs()).filter(c =>
    (!body.cutoffPeriod || c.cutoffPeriod === body.cutoffPeriod) && (!body.branch || c.branch === body.branch))

  const results: { cutoffPeriod: string; branch: string; sessionMonth: string; amount: number }[] = []
  for (const c of cutoffs) {
    const posted = await prisma.$transaction(tx => syncPfSessionAccruals(tx, {
      cutoffPeriod: c.cutoffPeriod, branch: c.branch,
      ledgerBranch: LEDGER_BRANCH[c.branch] ?? c.branch, branchLabel: BRANCH_DISPLAY[c.branch] ?? c.branch,
      feesAccountId, payableAccountId, userId: session.user.id as string,
    }))
    for (const p of posted) results.push({ cutoffPeriod: c.cutoffPeriod, branch: c.branch, sessionMonth: p.ym, amount: p.amount })
  }
  return NextResponse.json({ cutoffs: cutoffs.length, results })
}
