import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const [lines, drawnLoans] = await Promise.all([
    prisma.creditLine.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.loan.findMany({ where: { fromCreditLineId: { not: null } }, select: { id: true, fromCreditLineId: true, name: true, principalAmount: true, creditAccountId: true, dateAcquired: true } }),
  ])
  const loanByLine = new Map<string, { id: string; name: string; principalAmount: number; creditAccountId: string | null; dateAcquired: Date }[]>()
  for (const l of drawnLoans) {
    const k = l.fromCreditLineId as string
    if (!loanByLine.has(k)) loanByLine.set(k, [])
    loanByLine.get(k)!.push({ id: l.id, name: l.name, principalAmount: num(l.principalAmount), creditAccountId: l.creditAccountId, dateAcquired: l.dateAcquired })
  }
  return NextResponse.json({
    rows: lines.map(c => ({
      ...c, amount: num(c.amount), interestPct: c.interestPct != null ? num(c.interestPct) : null,
      drawnLoans: loanByLine.get(c.id) || [],
      drawnTotal: (loanByLine.get(c.id) || []).reduce((s, l) => s + l.principalAmount, 0),
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    if (!b.entityName?.trim() || !(num(b.amount) > 0)) return NextResponse.json({ error: 'Entity and amount are required' }, { status: 400 })
    const created = await prisma.creditLine.create({ data: {
      entityName: b.entityName.trim(), amount: num(b.amount), interestPct: b.interestPct != null ? num(b.interestPct) : null,
      utilized: !!b.utilized, remarks: b.remarks?.trim() || null, createdById: session.user.id as string,
    } })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Credit line create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // "Paid full earlier": settle the outstanding balance + any early-payment charges.
    if (b.action === 'settle') {
      const bankAccountId = b.bankAccountId as string
      const balanceAccountId = b.balanceAccountId as string // loan liability account to debit
      const balance = num(b.balance)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const charges = (Array.isArray(b.charges) ? b.charges : []).filter((c: any) => num(c.amount) > 0 && c.accountId)
      if (!bankAccountId || !balanceAccountId || !(balance > 0)) return NextResponse.json({ error: 'Balance, liability account and bank account are required' }, { status: 400 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chargeTotal = charges.reduce((s: number, c: any) => s + num(c.amount), 0)
      const total = balance + chargeTotal
      const je = await postJournalEntry(prisma as never, {
        entryDate: b.date ? new Date(b.date) : new Date(), description: `Credit line paid in full (early) — ${b.entityName || ''}`.trim(),
        referenceType: 'CREDIT_LINE_SETTLE', referenceId: b.id, branch: 'ALL', createdById: session.user.id as string,
        lines: [
          { accountId: balanceAccountId, debit: balance, description: 'Credit line principal settled' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...charges.map((c: any) => ({ accountId: c.accountId as string, debit: num(c.amount), description: c.description || 'Early payment charge' })),
          { accountId: bankAccountId, credit: total, description: 'Credit line early settlement' },
        ],
      })
      await prisma.creditLine.update({ where: { id: b.id }, data: { settledAt: new Date(), settledJournalEntryId: je.id } })
      return NextResponse.json({ success: true })
    }

    await prisma.creditLine.update({ where: { id: b.id }, data: {
      entityName: b.entityName?.trim(), amount: num(b.amount), interestPct: b.interestPct != null ? num(b.interestPct) : null,
      utilized: !!b.utilized, remarks: b.remarks?.trim() || null,
    } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Credit line update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { referenceType: 'CREDIT_LINE_SETTLE', referenceId: id } })
    // Detach any drawdown loans (keep the loans themselves).
    await tx.loan.updateMany({ where: { fromCreditLineId: id }, data: { fromCreditLineId: null } })
    await tx.creditLine.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}
