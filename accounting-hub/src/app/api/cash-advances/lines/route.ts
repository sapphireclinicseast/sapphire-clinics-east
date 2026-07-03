import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

// Recompute status after a line change: CLOSED when outstanding ≈ 0, else OPEN.
async function refreshStatus(advanceId: string) {
  const adv = await prisma.cashAdvance.findUnique({ where: { id: advanceId }, include: { lines: true } })
  if (!adv) return
  let liq = 0, ret = 0, reimb = 0
  for (const l of adv.lines) { if (l.kind === 'LIQUIDATION') liq += num(l.amount); else if (l.kind === 'RETURN') ret += num(l.amount); else if (l.kind === 'REIMBURSE') reimb += num(l.amount) }
  const outstanding = num(adv.amount) + reimb - liq - ret
  const status = Math.abs(outstanding) < 0.005 && adv.lines.length > 0 ? 'CLOSED' : 'OPEN'
  if (status !== adv.status) await prisma.cashAdvance.update({ where: { id: advanceId }, data: { status } })
}

// POST — add a LIQUIDATION | RETURN | REIMBURSE line and post its journal entry.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { advanceId, kind, date, accountTitle, description, vatable, amount, siNumber, registeredName, proofUrl, proofUrls, bankAccountId,
            requestor, department, validity, tinNumber, registeredAddress, hasEwt, ewtRate } = body
    if (!advanceId || !['LIQUIDATION', 'RETURN', 'REIMBURSE'].includes(kind)) return NextResponse.json({ error: 'advanceId and a valid kind are required' }, { status: 400 })
    const amt = num(amount)
    if (amt <= 0) return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })
    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })

    const adv = await prisma.cashAdvance.findUnique({ where: { id: advanceId } })
    if (!adv) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })

    const dueFrom = await prisma.account.findFirst({ where: { accountNumber: '1160' } })
    if (!dueFrom) return NextResponse.json({ error: 'Account 1160 Due from Employees not found' }, { status: 400 })

    // Build the JE lines per kind.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jeLines: any[] = []
    if (kind === 'LIQUIDATION') {
      if (!accountTitle?.trim()) return NextResponse.json({ error: 'Expense account is required' }, { status: 400 })
      const exp = await prisma.account.findFirst({ where: { accountTitle: accountTitle.trim(), accountType: 'EXPENSE' } })
      if (!exp) return NextResponse.json({ error: `Expense account "${accountTitle}" not found` }, { status: 400 })
      const net = vatable === 'VAT' ? amt / 1.12 : amt
      const vat = amt - net
      jeLines = [{ accountId: exp.id, debit: net, description: description || adv.refNumber }]
      if (vat > 0) {
        const inputVat = await prisma.account.findFirst({ where: { accountNumber: '1040' } })
        if (!inputVat) return NextResponse.json({ error: 'Account 1040 Input VAT not found' }, { status: 400 })
        jeLines.push({ accountId: inputVat.id, debit: vat, description: `Input VAT — ${adv.refNumber}` })
      }
      jeLines.push({ accountId: dueFrom.id, credit: amt, description: `Liquidation ${adv.refNumber}` })
    } else if (kind === 'RETURN') {
      if (!bankAccountId) return NextResponse.json({ error: 'Bank account is required' }, { status: 400 })
      jeLines = [
        { accountId: bankAccountId, debit: amt, description: `Return of unspent advance ${adv.refNumber}` },
        { accountId: dueFrom.id, credit: amt, description: `Return ${adv.refNumber}` },
      ]
    } else { // REIMBURSE (overspend paid back to staff)
      if (!bankAccountId) return NextResponse.json({ error: 'Bank account is required' }, { status: 400 })
      jeLines = [
        { accountId: dueFrom.id, debit: amt, description: `Reimburse overspend ${adv.refNumber}` },
        { accountId: bankAccountId, credit: amt, description: `Reimbursement ${adv.refNumber}` },
      ]
    }

    const line = await prisma.$transaction(async (tx) => {
      const created = await tx.cashAdvanceLine.create({
        data: {
          advanceId, kind, date: new Date(date), accountTitle: accountTitle?.trim() || null, description: description?.trim() || null,
          vatable: kind === 'LIQUIDATION' ? (vatable || 'Non-VAT') : null, amount: amt, siNumber: siNumber?.trim() || null,
          registeredName: registeredName?.trim() || null, proofUrl: proofUrl || (Array.isArray(proofUrls) ? proofUrls[0] : null) || null,
          proofUrls: Array.isArray(proofUrls) ? proofUrls : undefined, bankAccountId: bankAccountId || null, createdById: session.user!.id ?? null,
          requestor: kind === 'LIQUIDATION' ? (requestor?.trim() || null) : null,
          department: kind === 'LIQUIDATION' ? (department?.trim() || null) : null,
          validity: kind === 'LIQUIDATION' ? (validity?.trim() || null) : null,
          tinNumber: kind === 'LIQUIDATION' ? (tinNumber?.trim() || null) : null,
          registeredAddress: kind === 'LIQUIDATION' ? (registeredAddress?.trim() || null) : null,
          hasEwt: kind === 'LIQUIDATION' ? !!hasEwt : false,
          ewtRate: kind === 'LIQUIDATION' && hasEwt ? (Number(ewtRate) || null) : null,
        },
      })
      const refType = kind === 'LIQUIDATION' ? 'CASH_ADVANCE_LIQ' : kind === 'RETURN' ? 'CASH_ADVANCE_RETURN' : 'CASH_ADVANCE_REIMBURSE'
      const je = await postJournalEntry(tx, {
        entryDate: new Date(date), description: `${kind === 'LIQUIDATION' ? 'Cash advance liquidation' : kind === 'RETURN' ? 'Cash advance return' : 'Cash advance reimbursement'} — ${adv.refNumber}`,
        referenceType: refType, referenceId: created.id, branch: adv.branch, createdById: session.user!.id as string, lines: jeLines,
      })
      await tx.cashAdvanceLine.update({ where: { id: created.id }, data: { journalEntryId: je.id } })
      return created
    })
    await refreshStatus(advanceId)
    return NextResponse.json({ id: line.id })
  } catch (e) {
    console.error('Cash advance line error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to add line' }, { status: 500 })
  }
}

// DELETE ?id= — remove a line and reverse its journal entry.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const line = await prisma.cashAdvanceLine.findUnique({ where: { id } })
    if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.$transaction(async (tx) => {
      if (line.journalEntryId) await tx.journalEntry.deleteMany({ where: { id: line.journalEntryId } })
      await tx.cashAdvanceLine.delete({ where: { id } })
    })
    await refreshStatus(line.advanceId)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Cash advance line delete error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to delete line' }, { status: 500 })
  }
}
