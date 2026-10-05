import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }

// The bulk mode's "no official sales invoice" population, matching the owner
// ruling of 2026-10-05: consultant EWT where the consultant has NO COR on file
// (cannot issue a BIR sales invoice), and expense EWT with no SI number.
async function bulkNoSiPopulation(throughMonth: string) {
  const endOfMonth = (() => {
    const [y, m] = throughMonth.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0, 23, 59, 59))
  })()
  const cons = await prisma.payrollEntry.findMany({
    where: {
      taxAmount: { gt: 0 }, status: 'LOCKED', taxRemitted: false,
      cutoffPeriod: { lte: `${throughMonth}-9` }, // 'YYYY-MM-1|2' sorts below 'YYYY-MM-9'
      consultant: { corUrl: null },
    },
    include: { consultant: { select: { name: true } } },
  })
  const exps = (await prisma.pettyCashEntry.findMany({
    where: {
      branch: { not: 'CEO' }, hasEwt: true, ewtRate: { not: null }, ewtRemitted: false,
      OR: [{ paidAt: { not: null } }, { reimbursementId: { not: null } }],
      AND: [{ OR: [{ siNumber: null }, { siNumber: '' }] }],
    },
  })).filter(e => {
    const when = e.paidAt || e.date
    return when ? new Date(when) <= endOfMonth : false
  })
  return { cons, exps }
}

// POST { payrollBranch, consultantIds, expenseIds, incomeAccountId }
//   — recognise the SELECTED EWT amounts as Other Income, or
// POST { mode: 'bulk-no-si', throughMonth: 'YYYY-MM', incomeAccountId, preview? }
//   — recognise EVERY eligible no-SI EWT item up to and including that month,
//     across all branches, in one action (preview: true returns the breakdown
//     without posting).
// Either way: Dr Withholding Tax Payable (4070) / Cr chosen income account,
// one journal entry per branch per ACCRUAL month, dated at that month's end.
// Marks items remitted so nothing can be declared twice.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { incomeAccountId } = body

    if (body.mode === 'bulk-no-si') {
      const throughMonth = typeof body.throughMonth === 'string' && /^\d{4}-\d{2}$/.test(body.throughMonth) ? body.throughMonth : ''
      if (!throughMonth) return NextResponse.json({ error: 'throughMonth (YYYY-MM) is required' }, { status: 400 })
      const { cons, exps } = await bulkNoSiPopulation(throughMonth)
      if (cons.length === 0 && exps.length === 0) return NextResponse.json({ error: 'No eligible unremitted no-SI EWT items found' }, { status: 400 })
      if (body.preview === true) {
        const byBranch: Record<string, { items: number; amount: number }> = {}
        const add = (b: string, amt: number) => { const g = byBranch[b] || { items: 0, amount: 0 }; g.items++; g.amount = Math.round((g.amount + amt) * 100) / 100; byBranch[b] = g }
        for (const e of cons) add(e.branch, Number(e.taxAmount))
        for (const e of exps) { const g = Number(e.grossAmount); const net = e.vatable === 'VAT' ? g / 1.12 : g; add(e.branch, net * ((e.ewtRate || 0) / 100)) }
        const total = Math.round(Object.values(byBranch).reduce((s, g) => s + g.amount, 0) * 100) / 100
        return NextResponse.json({ preview: true, throughMonth, byBranch, total })
      }
      if (!incomeAccountId) return NextResponse.json({ error: 'Choose the Other Income account' }, { status: 400 })
      const taxPayableAccount = await prisma.account.findFirst({ where: { accountNumber: '4070' } })
      if (!taxPayableAccount) return NextResponse.json({ error: 'Missing account 4070 (Withholding Tax Payable)' }, { status: 400 })
      const incomeAccount = await prisma.account.findUnique({ where: { id: incomeAccountId } })
      if (!incomeAccount) return NextResponse.json({ error: 'Income account not found' }, { status: 404 })

      // One JE per branch per accrual month, dated at that month's end.
      const groups = new Map<string, { branch: string; ym: string; amount: number; refs: string[]; consIds: string[]; expIds: string[] }>()
      const addTo = (branch: string, ym: string, amount: number, ref: string, id: string, kind: 'cons' | 'exp') => {
        const key = `${branch}|${ym}`
        const g = groups.get(key) || { branch, ym, amount: 0, refs: [], consIds: [], expIds: [] }
        g.amount += amount; g.refs.push(ref); (kind === 'cons' ? g.consIds : g.expIds).push(id)
        groups.set(key, g)
      }
      for (const e of cons) addTo(PAYROLL_TO_PC[e.branch] || e.branch, e.cutoffPeriod.slice(0, 7), Number(e.taxAmount), `${e.consultant?.name} (${e.cutoffPeriod})`, e.id, 'cons')
      for (const e of exps) {
        const g = Number(e.grossAmount); const net = e.vatable === 'VAT' ? g / 1.12 : g
        const when = e.paidAt || e.date
        addTo(e.branch, new Date(when!).toISOString().slice(0, 7), net * ((e.ewtRate || 0) / 100), e.pcvNumber, e.id, 'exp')
      }
      const result = await prisma.$transaction(async (tx) => {
        let totalAmount = 0
        const posted: { branch: string; month: string; journalEntryId: string; amount: number }[] = []
        for (const g of [...groups.values()].sort((a, b) => a.branch.localeCompare(b.branch) || a.ym.localeCompare(b.ym))) {
          const amount = Math.round(g.amount * 100) / 100
          if (!(amount > 0)) continue
          const [y, m] = g.ym.split('-').map(Number)
          const je = await tx.journalEntry.create({
            data: {
              entryDate: new Date(Date.UTC(y, m, 0)),
              description: `EWT recognised as Other Income (no SI, bulk ≤ ${throughMonth}) — ${g.ym} — ${g.refs.join(', ')}`.slice(0, 480),
              referenceType: 'EWT_OTHER_INCOME', referenceId: [...g.consIds, ...g.expIds].join(';').slice(0, 480),
              totalAmount: amount, branch: g.branch, createdById: session.user!.id as string,
              lines: { create: [
                { accountId: taxPayableAccount.id, debit: amount, credit: 0, description: `Withholding Tax Payable (EWT) — ${g.ym}` },
                { accountId: incomeAccount.id, debit: 0, credit: amount, description: `Other Income — ${incomeAccount.accountTitle} — ${g.ym}` },
              ] },
            },
          })
          totalAmount += amount
          posted.push({ branch: g.branch, month: g.ym, journalEntryId: je.id, amount })
        }
        const allConsIds = cons.map(e => e.id)
        const allExpIds = exps.map(e => e.id)
        if (allConsIds.length) await tx.payrollEntry.updateMany({ where: { id: { in: allConsIds } }, data: { taxRemitted: true } })
        if (allExpIds.length) await tx.pettyCashEntry.updateMany({ where: { id: { in: allExpIds } }, data: { ewtRemitted: true } })
        return { entries: posted, totalAmount: Math.round(totalAmount * 100) / 100, items: allConsIds.length + allExpIds.length }
      })
      return NextResponse.json(result, { status: 201 })
    }

    const { payrollBranch, consultantIds, expenseIds } = body
    const pcBranch = PAYROLL_TO_PC[payrollBranch]
    if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!incomeAccountId) return NextResponse.json({ error: 'Choose the Other Income account' }, { status: 400 })
    const cids: string[] = Array.isArray(consultantIds) ? consultantIds : []
    const eids: string[] = Array.isArray(expenseIds) ? expenseIds : []
    if (cids.length === 0 && eids.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })

    const taxPayableAccount = await prisma.account.findFirst({ where: { accountNumber: '4070' } })
    if (!taxPayableAccount) return NextResponse.json({ error: 'Missing account 4070 (Withholding Tax Payable)' }, { status: 400 })
    const incomeAccount = await prisma.account.findUnique({ where: { id: incomeAccountId } })
    if (!incomeAccount) return NextResponse.json({ error: 'Income account not found' }, { status: 404 })

    const result = await prisma.$transaction(async (tx) => {
      const cons = cids.length ? await tx.payrollEntry.findMany({ where: { id: { in: cids }, branch: payrollBranch, status: 'LOCKED', taxRemitted: false, taxAmount: { gt: 0 } }, include: { consultant: { select: { name: true } } } }) : []
      const exps = eids.length ? await tx.pettyCashEntry.findMany({ where: { id: { in: eids }, branch: pcBranch, recordType: 'ONE_TIME', hasEwt: true, ewtRemitted: false, paidAt: { not: null } } }) : []
      if (cons.length === 0 && exps.length === 0) throw new Error('No eligible unremitted EWT items found')

      // One JE per ACCRUAL MONTH (owner ruling 2026-10-05): the income belongs
      // to the month the EWT was withheld — consultant items by their payroll
      // cutoff month, expense items by their paid (or entry) month — each
      // entry dated at that month's end, not at the posting date.
      const groups = new Map<string, { amount: number; refs: string[]; ids: string[] }>()
      const addTo = (ym: string, amount: number, ref: string, id: string) => {
        const g = groups.get(ym) || { amount: 0, refs: [], ids: [] }
        g.amount += amount; g.refs.push(ref); g.ids.push(id)
        groups.set(ym, g)
      }
      for (const e of cons) addTo(e.cutoffPeriod.slice(0, 7), Number(e.taxAmount), `${e.consultant?.name} (${e.cutoffPeriod})`, e.id)
      for (const e of exps) {
        const g = Number(e.grossAmount)
        const net = e.vatable === 'VAT' ? g / 1.12 : g
        const when = e.paidAt || e.date
        const ym = when ? new Date(when).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)
        addTo(ym, net * ((e.ewtRate || 0) / 100), e.pcvNumber, e.id)
      }

      let totalAmount = 0
      const posted: { month: string; journalEntryId: string; amount: number }[] = []
      for (const [ym, g] of [...groups.entries()].sort()) {
        const amount = Math.round(g.amount * 100) / 100
        if (!(amount > 0)) continue
        const [y, m] = ym.split('-').map(Number)
        const je = await tx.journalEntry.create({
          data: {
            entryDate: new Date(Date.UTC(y, m, 0)), // last day of the accrual month
            description: `EWT recognised as Other Income — ${ym} — ${g.refs.join(', ')}`.slice(0, 480),
            referenceType: 'EWT_OTHER_INCOME', referenceId: g.ids.join(';').slice(0, 480),
            totalAmount: amount, branch: pcBranch, createdById: session.user!.id as string,
            lines: { create: [
              { accountId: taxPayableAccount.id, debit: amount, credit: 0, description: `Withholding Tax Payable (EWT) — ${ym}` },
              { accountId: incomeAccount.id, debit: 0, credit: amount, description: `Other Income — ${incomeAccount.accountTitle} — ${ym}` },
            ] },
          },
        })
        totalAmount += amount
        posted.push({ month: ym, journalEntryId: je.id, amount })
      }
      if (cons.length) await tx.payrollEntry.updateMany({ where: { id: { in: cons.map(e => e.id) } }, data: { taxRemitted: true } })
      if (exps.length) await tx.pettyCashEntry.updateMany({ where: { id: { in: exps.map(e => e.id) } }, data: { ewtRemitted: true } })
      return { entries: posted, journalEntryId: posted[0]?.journalEntryId, totalAmount: Math.round(totalAmount * 100) / 100 }
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error('EWT other-income error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to record' }, { status: 500 })
  }
}
