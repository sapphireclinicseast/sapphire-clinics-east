import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }

// GET ?payrollBranch=SBEA → unified EWT-to-remit items:
//   consultant professional-fee withholding (PayrollEntry.taxAmount) +
//   expanded withholding captured on paid one-time expenses (PettyCashEntry).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payrollBranch = new URL(req.url).searchParams.get('payrollBranch') || ''
  const pcBranch = PAYROLL_TO_PC[payrollBranch]
  if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })

  const consultants = await prisma.payrollEntry.findMany({
    where: { branch: payrollBranch, taxAmount: { gt: 0 }, status: 'LOCKED' },
    include: { consultant: { select: { name: true, department: true } } },
    orderBy: [{ cutoffPeriod: 'desc' }],
  })
  // EWT to remit is captured on entries with EWT that have committed to payment:
  // a one-time expense marked paid, OR any petty-cash / expense entry included in an
  // RFP (reimbursementId set). The RFP already withholds the EWT from the payee, so
  // it appears here for separate remittance to the BIR.
  const expenses = await prisma.pettyCashEntry.findMany({
    where: { branch: pcBranch, hasEwt: true, ewtRate: { not: null }, OR: [{ paidAt: { not: null } }, { reimbursementId: { not: null } }] },
    select: { id: true, pcvNumber: true, requestor: true, description: true, vatable: true, grossAmount: true, ewtRate: true, ewtRemitted: true, paidAt: true, date: true },
    orderBy: [{ paidAt: 'desc' }],
  })
  // CEO petty-cash entries with EWT that were RFP'd for THIS branch (rfpBranchMap has
  // the branch). The EWT is attributed to the branch's allocation and remitted from
  // that branch's Taxes; per-branch remittance is tracked in ewtRemittedBranches.
  const ceoEntries = await prisma.pettyCashEntry.findMany({
    where: { branch: 'CEO', hasEwt: true, ewtRate: { not: null } },
    select: { id: true, pcvNumber: true, requestor: true, description: true, vatable: true, grossAmount: true, ewtRate: true, paidAt: true, date: true, branchAllocations: true, rfpBranchMap: true, ewtRemittedBranches: true },
  })

  const items = [
    ...consultants.map(e => {
      const base = Number(e.grossPay), ewt = Number(e.taxAmount)
      return {
        id: e.id, source: 'CONSULTANT' as const, name: e.consultant.name, ref: e.cutoffPeriod,
        ym: e.cutoffPeriod.slice(0, 7), periodLabel: e.cutoffPeriod,
        base, rate: base > 0 ? Math.round((ewt / base) * 100) : null, ewt, remitted: e.taxRemitted,
      }
    }),
    ...expenses.map(e => {
      const g = Number(e.grossAmount)
      const net = e.vatable === 'VAT' ? g / 1.12 : g
      const rate = e.ewtRate || 0
      // Period = payment date when paid, else the entry date (so RFP'd-not-yet-paid items still slot into a month).
      const when = e.paidAt || e.date
      const ym = when ? new Date(when).toISOString().slice(0, 7) : ''
      return {
        id: e.id, source: 'EXPENSE' as const, name: e.requestor || e.description || e.pcvNumber, ref: e.pcvNumber,
        ym, periodLabel: when ? new Date(when).toISOString().slice(0, 10) : '',
        base: net, rate, ewt: net * (rate / 100), remitted: e.ewtRemitted,
      }
    }),
    // CEO entries allocated + RFP'd to this branch → one item per (entry, branch),
    // keyed "<id>::<branch>" so remittance can be tracked per branch.
    ...ceoEntries.flatMap(e => {
      const map = (e.rfpBranchMap && typeof e.rfpBranchMap === 'object') ? e.rfpBranchMap as Record<string, string> : {}
      if (!map[pcBranch]) return []
      const allocs = Array.isArray(e.branchAllocations) ? e.branchAllocations as { branch?: string; amount?: number | string }[] : []
      const alloc = allocs.find(a => a?.branch === pcBranch)
      const g = alloc ? Number(alloc.amount) : 0
      if (!(g > 0)) return []
      const net = e.vatable === 'VAT' ? g / 1.12 : g
      const rate = e.ewtRate || 0
      const when = e.paidAt || e.date
      const remitMap = (e.ewtRemittedBranches && typeof e.ewtRemittedBranches === 'object') ? e.ewtRemittedBranches as Record<string, boolean> : {}
      return [{
        id: `${e.id}::${pcBranch}`, source: 'EXPENSE' as const, name: `${e.requestor || e.description || e.pcvNumber} (CEO)`, ref: e.pcvNumber,
        ym: when ? new Date(when).toISOString().slice(0, 7) : '', periodLabel: when ? new Date(when).toISOString().slice(0, 10) : '',
        base: net, rate, ewt: net * (rate / 100), remitted: !!remitMap[pcBranch],
      }]
    }),
  ]
  return NextResponse.json({ items })
}
