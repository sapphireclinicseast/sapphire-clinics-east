import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

const num = (v: unknown) => Number(v || 0)
// released + reimbursed − liquidated − returned
function totals(lines: { kind: string; amount: unknown }[]) {
  let liquidated = 0, returned = 0, reimbursed = 0
  for (const l of lines) {
    if (l.kind === 'LIQUIDATION') liquidated += num(l.amount)
    else if (l.kind === 'RETURN') returned += num(l.amount)
    else if (l.kind === 'REIMBURSE') reimbursed += num(l.amount)
  }
  return { liquidated, returned, reimbursed }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')
  if (id) {
    const a = await prisma.cashAdvance.findUnique({ where: { id }, include: { lines: { orderBy: { date: 'asc' } } } })
    if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const t = totals(a.lines)
    const outstanding = num(a.amount) + t.reimbursed - t.liquidated - t.returned
    return NextResponse.json({
      ...a, amount: num(a.amount),
      lines: a.lines.map(l => ({ ...l, amount: num(l.amount) })),
      ...t, outstanding,
    })
  }
  const branch = sp.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const advances = await prisma.cashAdvance.findMany({ where: { branch }, include: { lines: { select: { kind: true, amount: true } } }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(advances.map(a => {
    const t = totals(a.lines)
    const outstanding = num(a.amount) + t.reimbursed - t.liquidated - t.returned
    return {
      id: a.id, refNumber: a.refNumber, branch: a.branch, accountableName: a.accountableName, purpose: a.purpose,
      dateReleased: a.dateReleased, amount: num(a.amount), sourceAccountId: a.sourceAccountId, status: a.status,
      liquidated: t.liquidated, returned: t.returned, reimbursed: t.reimbursed, outstanding, createdAt: a.createdAt,
    }
  }))
}

// POST — release a new cash advance (posts DR 1160 Due from Employees / CR bank).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, accountableName, purpose, dateReleased, amount, sourceAccountId, proofUrls } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!accountableName?.trim()) return NextResponse.json({ error: 'Accountable staff is required' }, { status: 400 })
    if (!purpose?.trim()) return NextResponse.json({ error: 'Purpose is required' }, { status: 400 })
    if (!dateReleased) return NextResponse.json({ error: 'Release date is required' }, { status: 400 })
    const amt = num(amount)
    if (amt <= 0) return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })
    if (!sourceAccountId) return NextResponse.json({ error: 'Select the source bank account' }, { status: 400 })

    const dueFrom = await prisma.account.findFirst({ where: { accountNumber: '1160' } })
    if (!dueFrom) return NextResponse.json({ error: 'Account 1160 Due from Employees not found in Chart of Accounts' }, { status: 400 })

    const created = await prisma.$transaction(async (tx) => {
      const yy = new Date().getFullYear() % 100
      const prefix = `${BRANCH_CODE[branch]}-CA${yy}-`
      const last = await tx.cashAdvance.findFirst({ where: { branch, refNumber: { startsWith: prefix } }, orderBy: { refSeq: 'desc' } })
      const seq = (last?.refSeq || 0) + 1
      const refNumber = `${prefix}${String(seq).padStart(4, '0')}`
      const adv = await tx.cashAdvance.create({
        data: { branch, refNumber, refSeq: seq, accountableName: accountableName.trim(), purpose: purpose.trim(), dateReleased: new Date(dateReleased), amount: amt, sourceAccountId, proofUrls: Array.isArray(proofUrls) && proofUrls.length ? proofUrls : undefined, createdById: session.user!.id ?? null },
      })
      await postJournalEntry(tx, {
        entryDate: new Date(dateReleased), description: `Cash advance released — ${adv.refNumber} (${accountableName.trim()})`,
        referenceType: 'CASH_ADVANCE', referenceId: adv.id, branch, createdById: session.user!.id as string,
        lines: [
          { accountId: dueFrom.id, debit: amt, description: `Advance to ${accountableName.trim()}` },
          { accountId: sourceAccountId, credit: amt, description: `Cash advance ${adv.refNumber}` },
        ],
      })
      return adv
    })
    return NextResponse.json({ id: created.id, refNumber: created.refNumber })
  } catch (e) {
    console.error('Cash advance create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to release advance' }, { status: 500 })
  }
}

// DELETE ?id= — delete the whole advance, including any liquidation/return/
// reimburse lines, reversing every associated journal entry.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const adv = await prisma.cashAdvance.findUnique({ where: { id }, include: { lines: { select: { id: true, journalEntryId: true } } } })
    if (!adv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.$transaction(async (tx) => {
      // Reverse the release JE + every line JE (by stored id and by reference).
      const jeIds = adv.lines.map(l => l.journalEntryId).filter((x): x is string => !!x)
      if (jeIds.length) await tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } })
      await tx.journalEntry.deleteMany({
        where: {
          referenceType: { in: ['CASH_ADVANCE', 'CASH_ADVANCE_LIQ', 'CASH_ADVANCE_RETURN', 'CASH_ADVANCE_REIMBURSE'] },
          referenceId: { in: [id, ...adv.lines.map(l => l.id)] },
        },
      })
      await tx.cashAdvance.delete({ where: { id } })   // lines cascade via FK
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Cash advance delete error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to delete' }, { status: 500 })
  }
}
