import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }

// POST { payrollBranch, consultantIds, expenseIds, incomeAccountId }
// Recognise selected EWT amounts as Other Income (no bank movement):
// Dr Withholding Tax Payable (4070) / Cr chosen income account. Marks items remitted.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { payrollBranch, consultantIds, expenseIds, incomeAccountId } = await req.json()
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
