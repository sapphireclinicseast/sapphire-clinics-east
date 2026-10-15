// EWT → Other Income, automatically (accounting's standing treatment, 2026-10):
// withheld tax with NO official sales invoice behind it (consultants without a
// COR; expenses without an SI number) can never be remitted against a BIR
// invoice, so it is recognised as Other Income (7220) as soon as it exists —
// one entry per branch per accrual month, Dr 4070 / Cr 7220. When items ARE
// ticked for a BIR remittance RFP, their declarations reverse first, putting
// the amount back in 4070 for the payment. EwtIncomeDeclaration rows (unique
// per item) carry the link that makes both directions exact and idempotent.
import type { Prisma, PrismaClient } from '@prisma/client'

const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(v || 0)

const expEwtAmount = (e: { grossAmount: unknown; vatable: string | null; ewtRate: number | null }) => {
  const g = num(e.grossAmount)
  const net = e.vatable === 'VAT' ? g / 1.12 : g
  return r2(net * ((e.ewtRate || 0) / 100))
}
const expYm = (e: { paidAt: Date | null; date: Date | null }) => {
  const when = e.paidAt || e.date
  return when ? new Date(when).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)
}

// Declare every currently-eligible no-SI EWT item (through the current month)
// as Other Income. Idempotent: items already declared are excluded up front and
// hard-blocked by the unique constraints; a quiet run with nothing to declare
// costs two indexed queries. Safe to call after payroll locks and on tab loads.
export async function sweepNoSiEwtToOtherIncome(db: PrismaClient, createdById: string): Promise<{ entries: number; items: number; totalAmount: number }> {
  const zero = { entries: 0, items: 0, totalAmount: 0 }
  const now = new Date()
  const throughMonth = now.toISOString().slice(0, 7)
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59))

  const declared = await db.ewtIncomeDeclaration.findMany({ select: { payrollEntryId: true, pettyCashEntryId: true } })
  const dPay = declared.map(d => d.payrollEntryId).filter((x): x is string => !!x)
  const dPc = declared.map(d => d.pettyCashEntryId).filter((x): x is string => !!x)

  // Self-heal: an item flagged remitted AFTER it was declared (e.g. a
  // reconciliation against actual BIR filings) must come back OFF income —
  // the remittance already relieves 4070, so keeping the declaration would
  // relieve it twice. Reverse those declarations before declaring anything new.
  const stalePay = dPay.length ? (await db.payrollEntry.findMany({ where: { id: { in: dPay }, taxRemitted: true }, select: { id: true } })).map(r => r.id) : []
  const stalePc = dPc.length ? (await db.pettyCashEntry.findMany({ where: { id: { in: dPc }, ewtRemitted: true }, select: { id: true } })).map(r => r.id) : []

  const cons = await db.payrollEntry.findMany({
    where: {
      taxAmount: { gt: 0 }, status: 'LOCKED', taxRemitted: false,
      cutoffPeriod: { lte: `${throughMonth}-9` }, consultant: { corUrl: null },
      ...(dPay.length ? { id: { notIn: dPay } } : {}),
    },
    include: { consultant: { select: { name: true } } },
  })
  const exps = (await db.pettyCashEntry.findMany({
    where: {
      branch: { not: 'CEO' }, hasEwt: true, ewtRate: { not: null }, ewtRemitted: false,
      OR: [{ paidAt: { not: null } }, { reimbursementId: { not: null } }],
      AND: [{ OR: [{ siNumber: null }, { siNumber: '' }] }],
      ...(dPc.length ? { id: { notIn: dPc } } : {}),
    },
  })).filter(e => {
    const when = e.paidAt || e.date
    return when ? new Date(when) <= cutoff : false
  })
  if (cons.length === 0 && exps.length === 0 && stalePay.length === 0 && stalePc.length === 0) return zero

  // Repair-only run: nothing new to declare, but stale declarations to reverse.
  if (cons.length === 0 && exps.length === 0) {
    await db.$transaction(async (tx) => { await undoEwtIncomeDeclarations(tx, stalePay, stalePc) })
    return zero
  }

  const [incomeAccount, taxPayableAccount] = await Promise.all([
    db.account.findFirst({ where: { accountNumber: '7220', isActive: true } }),
    db.account.findFirst({ where: { accountNumber: '4070' } }),
  ])
  if (!incomeAccount || !taxPayableAccount) {
    console.error('EWT auto-sweep skipped: account 7220 or 4070 not found')
    return zero
  }

  type GI = { id: string; kind: 'cons' | 'exp'; amount: number; ref: string }
  const groups = new Map<string, { branch: string; ym: string; items: GI[] }>()
  const addTo = (branch: string, ym: string, gi: GI) => {
    const k = `${branch}|${ym}`
    const g = groups.get(k) || { branch, ym, items: [] }
    g.items.push(gi)
    groups.set(k, g)
  }
  for (const e of cons) addTo(PAYROLL_TO_PC[e.branch] || e.branch, e.cutoffPeriod.slice(0, 7), { id: e.id, kind: 'cons', amount: r2(num(e.taxAmount)), ref: `${e.consultant?.name} (${e.cutoffPeriod})` })
  for (const e of exps) addTo(e.branch, expYm(e), { id: e.id, kind: 'exp', amount: expEwtAmount(e), ref: e.pcvNumber })

  return db.$transaction(async (tx) => {
    if (stalePay.length || stalePc.length) await undoEwtIncomeDeclarations(tx, stalePay, stalePc)
    const out = { entries: 0, items: 0, totalAmount: 0 }
    for (const g of [...groups.values()].sort((a, b) => a.branch.localeCompare(b.branch) || a.ym.localeCompare(b.ym))) {
      const amount = r2(g.items.reduce((s, i) => s + i.amount, 0))
      if (!(amount > 0)) continue
      const [y, m] = g.ym.split('-').map(Number)
      const je = await tx.journalEntry.create({
        data: {
          entryDate: new Date(Date.UTC(y, m, 0)),
          description: `EWT recognised as Other Income (no SI, auto) — ${g.ym} — ${g.items.map(i => i.ref).join(', ')}`.slice(0, 480),
          referenceType: 'EWT_OTHER_INCOME', referenceId: g.items.map(i => i.id).join(';').slice(0, 480),
          totalAmount: amount, branch: g.branch, createdById,
          lines: { create: [
            { accountId: taxPayableAccount.id, debit: amount, credit: 0, description: `Withholding Tax Payable (EWT) — ${g.ym}` },
            { accountId: incomeAccount.id, debit: 0, credit: amount, description: `Other Income — ${incomeAccount.accountTitle} — ${g.ym}` },
          ] },
        },
      })
      await tx.ewtIncomeDeclaration.createMany({
        data: g.items.map(i => ({
          journalEntryId: je.id,
          payrollEntryId: i.kind === 'cons' ? i.id : null,
          pettyCashEntryId: i.kind === 'exp' ? i.id : null,
          branch: g.branch, ym: g.ym, amount: i.amount, createdById,
        })),
      })
      out.entries++
      out.items += g.items.length
      out.totalAmount = r2(out.totalAmount + amount)
    }
    return out
  })
}

// Reverse the income declarations of specific items — called when they are
// ticked for a BIR remittance RFP (and by the manual untick flow). Each
// affected journal entry shrinks by the item's share; an entry that empties
// out is deleted. Items without declaration rows are simply not touched.
export async function undoEwtIncomeDeclarations(tx: Prisma.TransactionClient, payrollEntryIds: string[], pettyCashEntryIds: string[]): Promise<{ items: number; totalAmount: number }> {
  const or: { payrollEntryId?: { in: string[] }; pettyCashEntryId?: { in: string[] } }[] = []
  if (payrollEntryIds.length) or.push({ payrollEntryId: { in: payrollEntryIds } })
  if (pettyCashEntryIds.length) or.push({ pettyCashEntryId: { in: pettyCashEntryIds } })
  if (!or.length) return { items: 0, totalAmount: 0 }
  const rows = await tx.ewtIncomeDeclaration.findMany({ where: { OR: or } })
  if (!rows.length) return { items: 0, totalAmount: 0 }

  const byJe = new Map<string, typeof rows>()
  for (const r of rows) {
    const g = byJe.get(r.journalEntryId) || []
    g.push(r)
    byJe.set(r.journalEntryId, g)
  }
  let totalAmount = 0
  for (const [jeId, rs] of byJe) {
    const undoAmt = r2(rs.reduce((s, r) => s + num(r.amount), 0))
    const je = await tx.journalEntry.findUnique({ where: { id: jeId }, include: { lines: true } })
    if (je) {
      if (je.referenceType !== 'EWT_OTHER_INCOME' || je.lines.length !== 2) {
        throw new Error(`Journal entry ${jeId} was modified since the income declaration — undo it manually in the General Journal first.`)
      }
      const newTotal = r2(num(je.totalAmount) - undoAmt)
      if (newTotal <= 0.004) {
        await tx.journalEntry.delete({ where: { id: jeId } })
      } else {
        for (const ln of je.lines) {
          await tx.journalEntryLine.update({
            where: { id: ln.id },
            data: num(ln.debit) > 0 ? { debit: r2(num(ln.debit) - undoAmt) } : { credit: r2(num(ln.credit) - undoAmt) },
          })
        }
        await tx.journalEntry.update({ where: { id: jeId }, data: { totalAmount: newTotal } })
      }
    }
    totalAmount = r2(totalAmount + undoAmt)
  }
  await tx.ewtIncomeDeclaration.deleteMany({ where: { id: { in: rows.map(r => r.id) } } })
  return { items: rows.length, totalAmount }
}
