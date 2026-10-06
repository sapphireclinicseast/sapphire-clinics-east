import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }

const r2 = (n: number) => Math.round(n * 100) / 100
const expEwtAmount = (e: { grossAmount: unknown; vatable: string | null; ewtRate: number | null }) => {
  const g = Number(e.grossAmount)
  const net = e.vatable === 'VAT' ? g / 1.12 : g
  return r2(net * ((e.ewtRate || 0) / 100))
}
const expYm = (e: { paidAt: Date | null; date: Date | null }) => {
  const when = e.paidAt || e.date
  return when ? new Date(when).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)
}
const endOfMonth = (throughMonth: string) => {
  const [y, m] = throughMonth.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0, 23, 59, 59))
}

// The bulk mode's "no official sales invoice" population, matching the owner
// ruling of 2026-10-05: consultant EWT where the consultant has NO COR on file
// (cannot issue a BIR sales invoice), and expense EWT with no SI number.
async function bulkNoSiPopulation(throughMonth: string) {
  const cutoff = endOfMonth(throughMonth)
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
    return when ? new Date(when) <= cutoff : false
  })
  return { cons, exps }
}

// POST { payrollBranch, consultantIds, expenseIds, incomeAccountId }
//   — recognise the SELECTED EWT amounts as Other Income, or
// POST { mode: 'no-si-people', throughMonth: 'YYYY-MM' }
//   — list every no-SI EWT item up to that month grouped per person, with
//     already-declared items flagged (for the tick/untick modal), or
// POST { mode: 'no-si-apply', throughMonth, incomeAccountId?,
//        declareConsIds, declareExpIds, undoConsIds, undoExpIds }
//   — declare the ticked items and undo the unticked declared ones.
// ('bulk-no-si' preview is kept for stale tabs; its execution is retired.)
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

    // ── People list for the bulk modal: every eligible no-SI item up to the
    // chosen month, grouped per person (consultant per branch; expenses as
    // their own rows), INCLUDING already-declared ones (flagged) so they can
    // be unticked to undo. Genuinely BIR-remitted EWT never appears — it has
    // no EwtIncomeDeclaration row and fails the unremitted filters.
    if (body.mode === 'no-si-people') {
      const throughMonth = typeof body.throughMonth === 'string' && /^\d{4}-\d{2}$/.test(body.throughMonth) ? body.throughMonth : ''
      if (!throughMonth) return NextResponse.json({ error: 'throughMonth (YYYY-MM) is required' }, { status: 400 })
      const { cons, exps } = await bulkNoSiPopulation(throughMonth)
      const decls = await prisma.ewtIncomeDeclaration.findMany({ where: { ym: { lte: throughMonth } } })
      const dPayIds = decls.map(d => d.payrollEntryId).filter((x): x is string => !!x)
      const dExpIds = decls.map(d => d.pettyCashEntryId).filter((x): x is string => !!x)
      const dCons = dPayIds.length ? await prisma.payrollEntry.findMany({ where: { id: { in: dPayIds } }, include: { consultant: { select: { name: true } } } }) : []
      const dExps = dExpIds.length ? await prisma.pettyCashEntry.findMany({ where: { id: { in: dExpIds } } }) : []
      const declAmt = new Map(decls.map(d => [(d.payrollEntryId || d.pettyCashEntryId) as string, Number(d.amount)]))

      type Item = { id: string; kind: 'cons' | 'exp'; ym: string; amount: number; declared: boolean; label: string }
      const people = new Map<string, { key: string; kind: string; name: string; branch: string; items: Item[] }>()
      const put = (key: string, kind: string, name: string, branch: string, item: Item) => {
        const p = people.get(key) || { key, kind, name, branch, items: [] }
        p.items.push(item)
        people.set(key, p)
      }
      for (const e of cons) put(`c|${e.branch}|${e.consultantId}`, 'consultant', e.consultant?.name || 'Unknown', e.branch,
        { id: e.id, kind: 'cons', ym: e.cutoffPeriod.slice(0, 7), amount: r2(Number(e.taxAmount)), declared: false, label: e.cutoffPeriod })
      for (const e of dCons) put(`c|${e.branch}|${e.consultantId}`, 'consultant', e.consultant?.name || 'Unknown', e.branch,
        { id: e.id, kind: 'cons', ym: e.cutoffPeriod.slice(0, 7), amount: r2(declAmt.get(e.id) ?? Number(e.taxAmount)), declared: true, label: e.cutoffPeriod })
      for (const e of exps) put(`e|${e.id}`, 'expense', `${e.pcvNumber} — ${e.description || ''}`.trim().slice(0, 120), e.branch,
        { id: e.id, kind: 'exp', ym: expYm(e), amount: expEwtAmount(e), declared: false, label: e.pcvNumber })
      for (const e of dExps) put(`e|${e.id}`, 'expense', `${e.pcvNumber} — ${e.description || ''}`.trim().slice(0, 120), e.branch,
        { id: e.id, kind: 'exp', ym: expYm(e), amount: r2(declAmt.get(e.id) ?? expEwtAmount(e)), declared: true, label: e.pcvNumber })

      const list = [...people.values()].map(p => ({
        ...p,
        items: p.items.sort((a, b) => a.ym.localeCompare(b.ym)),
        amount: r2(p.items.reduce((s, i) => s + i.amount, 0)),
        declaredCount: p.items.filter(i => i.declared).length,
      })).sort((a, b) => a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name))
      return NextResponse.json({ people: list, throughMonth })
    }

    // ── Apply the modal's tick state: declare the newly-ticked items and undo
    // the unticked already-declared ones, in one transaction. Undo rewrites the
    // exact journal entry each item's share sits in (via EwtIncomeDeclaration),
    // deleting the entry outright when nothing of it remains, and flips the
    // items back to unremitted.
    if (body.mode === 'no-si-apply') {
      const throughMonth = typeof body.throughMonth === 'string' && /^\d{4}-\d{2}$/.test(body.throughMonth) ? body.throughMonth : ''
      if (!throughMonth) return NextResponse.json({ error: 'throughMonth (YYYY-MM) is required' }, { status: 400 })
      const asIds = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : []
      const decConsIds = asIds(body.declareConsIds)
      const decExpIds = asIds(body.declareExpIds)
      const undConsIds = asIds(body.undoConsIds)
      const undExpIds = asIds(body.undoExpIds)
      if (!decConsIds.length && !decExpIds.length && !undConsIds.length && !undExpIds.length) {
        return NextResponse.json({ error: 'Nothing to apply — no changes were ticked or unticked' }, { status: 400 })
      }
      let taxPayableAccount: { id: string } | null = null
      let incomeAccount: { id: string; accountTitle: string } | null = null
      if (decConsIds.length || decExpIds.length) {
        if (!incomeAccountId) return NextResponse.json({ error: 'Choose the Other Income account' }, { status: 400 })
        taxPayableAccount = await prisma.account.findFirst({ where: { accountNumber: '4070' } })
        if (!taxPayableAccount) return NextResponse.json({ error: 'Missing account 4070 (Withholding Tax Payable)' }, { status: 400 })
        incomeAccount = await prisma.account.findUnique({ where: { id: incomeAccountId } })
        if (!incomeAccount) return NextResponse.json({ error: 'Income account not found' }, { status: 404 })
      }

      const result = await prisma.$transaction(async (tx) => {
        const declared = { entries: 0, items: 0, totalAmount: 0 }
        if (decConsIds.length || decExpIds.length) {
          // Re-validate eligibility inside the transaction — the list the
          // client ticked could be stale.
          const cons = decConsIds.length ? await tx.payrollEntry.findMany({
            where: {
              id: { in: decConsIds }, taxAmount: { gt: 0 }, status: 'LOCKED', taxRemitted: false,
              cutoffPeriod: { lte: `${throughMonth}-9` }, consultant: { corUrl: null },
            },
            include: { consultant: { select: { name: true } } },
          }) : []
          const exps = decExpIds.length ? (await tx.pettyCashEntry.findMany({
            where: {
              id: { in: decExpIds }, branch: { not: 'CEO' }, hasEwt: true, ewtRate: { not: null }, ewtRemitted: false,
              OR: [{ paidAt: { not: null } }, { reimbursementId: { not: null } }],
              AND: [{ OR: [{ siNumber: null }, { siNumber: '' }] }],
            },
          })).filter(e => {
            const when = e.paidAt || e.date
            return when ? new Date(when) <= endOfMonth(throughMonth) : false
          }) : []
          if (cons.length + exps.length !== decConsIds.length + decExpIds.length) {
            throw new Error('Some ticked items are no longer eligible to declare — reload and try again.')
          }
          type GI = { id: string; kind: 'cons' | 'exp'; amount: number; ref: string }
          const groups = new Map<string, { branch: string; ym: string; items: GI[] }>()
          const addTo = (branch: string, ym: string, gi: GI) => {
            const k = `${branch}|${ym}`
            const g = groups.get(k) || { branch, ym, items: [] }
            g.items.push(gi)
            groups.set(k, g)
          }
          for (const e of cons) addTo(PAYROLL_TO_PC[e.branch] || e.branch, e.cutoffPeriod.slice(0, 7), { id: e.id, kind: 'cons', amount: r2(Number(e.taxAmount)), ref: `${e.consultant?.name} (${e.cutoffPeriod})` })
          for (const e of exps) addTo(e.branch, expYm(e), { id: e.id, kind: 'exp', amount: expEwtAmount(e), ref: e.pcvNumber })
          for (const g of [...groups.values()].sort((a, b) => a.branch.localeCompare(b.branch) || a.ym.localeCompare(b.ym))) {
            const amount = r2(g.items.reduce((s, i) => s + i.amount, 0))
            if (!(amount > 0)) continue
            const [y, m] = g.ym.split('-').map(Number)
            const je = await tx.journalEntry.create({
              data: {
                entryDate: new Date(Date.UTC(y, m, 0)),
                description: `EWT recognised as Other Income (no SI, ≤ ${throughMonth}) — ${g.ym} — ${g.items.map(i => i.ref).join(', ')}`.slice(0, 480),
                referenceType: 'EWT_OTHER_INCOME', referenceId: g.items.map(i => i.id).join(';').slice(0, 480),
                totalAmount: amount, branch: g.branch, createdById: session.user!.id as string,
                lines: { create: [
                  { accountId: taxPayableAccount!.id, debit: amount, credit: 0, description: `Withholding Tax Payable (EWT) — ${g.ym}` },
                  { accountId: incomeAccount!.id, debit: 0, credit: amount, description: `Other Income — ${incomeAccount!.accountTitle} — ${g.ym}` },
                ] },
              },
            })
            await tx.ewtIncomeDeclaration.createMany({
              data: g.items.map(i => ({
                journalEntryId: je.id,
                payrollEntryId: i.kind === 'cons' ? i.id : null,
                pettyCashEntryId: i.kind === 'exp' ? i.id : null,
                branch: g.branch, ym: g.ym, amount: i.amount,
                createdById: session.user!.id as string,
              })),
            })
            declared.entries++
            declared.items += g.items.length
            declared.totalAmount = r2(declared.totalAmount + amount)
          }
          if (cons.length) await tx.payrollEntry.updateMany({ where: { id: { in: cons.map(e => e.id) } }, data: { taxRemitted: true } })
          if (exps.length) await tx.pettyCashEntry.updateMany({ where: { id: { in: exps.map(e => e.id) } }, data: { ewtRemitted: true } })
        }

        const undone = { items: 0, totalAmount: 0, deletedEntries: 0, adjustedEntries: 0 }
        if (undConsIds.length || undExpIds.length) {
          const or: { payrollEntryId?: { in: string[] }; pettyCashEntryId?: { in: string[] } }[] = []
          if (undConsIds.length) or.push({ payrollEntryId: { in: undConsIds } })
          if (undExpIds.length) or.push({ pettyCashEntryId: { in: undExpIds } })
          const rows = await tx.ewtIncomeDeclaration.findMany({ where: { OR: or } })
          if (rows.length !== undConsIds.length + undExpIds.length) {
            throw new Error('Some unticked items have no income declaration on record (they may be real BIR remittances) — reload and try again.')
          }
          const byJe = new Map<string, typeof rows>()
          for (const r of rows) {
            const g = byJe.get(r.journalEntryId) || []
            g.push(r)
            byJe.set(r.journalEntryId, g)
          }
          for (const [jeId, rs] of byJe) {
            const undoAmt = r2(rs.reduce((s, r) => s + Number(r.amount), 0))
            const je = await tx.journalEntry.findUnique({ where: { id: jeId }, include: { lines: true } })
            if (je) {
              if (je.referenceType !== 'EWT_OTHER_INCOME' || je.lines.length !== 2) {
                throw new Error(`Journal entry ${jeId} was modified since the declaration — undo it manually in the General Journal.`)
              }
              const newTotal = r2(Number(je.totalAmount) - undoAmt)
              if (newTotal <= 0.004) {
                await tx.journalEntry.delete({ where: { id: jeId } })
                undone.deletedEntries++
              } else {
                for (const ln of je.lines) {
                  await tx.journalEntryLine.update({
                    where: { id: ln.id },
                    data: Number(ln.debit) > 0 ? { debit: r2(Number(ln.debit) - undoAmt) } : { credit: r2(Number(ln.credit) - undoAmt) },
                  })
                }
                await tx.journalEntry.update({
                  where: { id: jeId },
                  data: { totalAmount: newTotal, description: `${je.description}`.slice(0, 430) + ` [${rs.length} item(s) undone]` },
                })
                undone.adjustedEntries++
              }
            }
            undone.totalAmount = r2(undone.totalAmount + undoAmt)
          }
          await tx.ewtIncomeDeclaration.deleteMany({ where: { id: { in: rows.map(r => r.id) } } })
          const upc = rows.map(r => r.payrollEntryId).filter((x): x is string => !!x)
          const upe = rows.map(r => r.pettyCashEntryId).filter((x): x is string => !!x)
          if (upc.length) await tx.payrollEntry.updateMany({ where: { id: { in: upc } }, data: { taxRemitted: false } })
          if (upe.length) await tx.pettyCashEntry.updateMany({ where: { id: { in: upe } }, data: { ewtRemitted: false } })
          undone.items = rows.length
        }

        return { declared, undone }
      })
      return NextResponse.json(result, { status: 201 })
    }

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
      // Execution via the old all-or-nothing mode is retired: it marked items
      // without per-item declaration records, which the undo flow depends on.
      // A stale tab still running the old modal lands here.
      return NextResponse.json({ error: 'This action was upgraded — refresh the page and use the new tick/untick list.' }, { status: 409 })
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
      type GI = { id: string; kind: 'cons' | 'exp'; amount: number; ref: string }
      const groups = new Map<string, GI[]>()
      const addTo = (ym: string, gi: GI) => {
        const g = groups.get(ym) || []
        g.push(gi)
        groups.set(ym, g)
      }
      for (const e of cons) addTo(e.cutoffPeriod.slice(0, 7), { id: e.id, kind: 'cons', amount: r2(Number(e.taxAmount)), ref: `${e.consultant?.name} (${e.cutoffPeriod})` })
      for (const e of exps) addTo(expYm(e), { id: e.id, kind: 'exp', amount: expEwtAmount(e), ref: e.pcvNumber })

      let totalAmount = 0
      const posted: { month: string; journalEntryId: string; amount: number }[] = []
      for (const [ym, g] of [...groups.entries()].sort()) {
        const amount = r2(g.reduce((s, i) => s + i.amount, 0))
        if (!(amount > 0)) continue
        const [y, m] = ym.split('-').map(Number)
        const je = await tx.journalEntry.create({
          data: {
            entryDate: new Date(Date.UTC(y, m, 0)), // last day of the accrual month
            description: `EWT recognised as Other Income — ${ym} — ${g.map(i => i.ref).join(', ')}`.slice(0, 480),
            referenceType: 'EWT_OTHER_INCOME', referenceId: g.map(i => i.id).join(';').slice(0, 480),
            totalAmount: amount, branch: pcBranch, createdById: session.user!.id as string,
            lines: { create: [
              { accountId: taxPayableAccount.id, debit: amount, credit: 0, description: `Withholding Tax Payable (EWT) — ${ym}` },
              { accountId: incomeAccount.id, debit: 0, credit: amount, description: `Other Income — ${incomeAccount.accountTitle} — ${ym}` },
            ] },
          },
        })
        await tx.ewtIncomeDeclaration.createMany({
          data: g.map(i => ({
            journalEntryId: je.id,
            payrollEntryId: i.kind === 'cons' ? i.id : null,
            pettyCashEntryId: i.kind === 'exp' ? i.id : null,
            branch: pcBranch, ym, amount: i.amount,
            createdById: session.user!.id as string,
          })),
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
