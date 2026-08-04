// Deposits (consideration received) against a common shareholding — a holding
// may have several: cash paid into different bank accounts on different dates,
// plus non-cash consideration such as equipment bought for the company.
//
// Unlike buybacks, a deposit has no journal entry of its own. The holding's
// single issuance entry itemises every deposit as a debit line, so each change
// here re-posts that entry via repostCommonIssuance.
//   GET    ?commonShareId= → list deposits for that shareholding
//   POST   { commonShareId, date, amount, kind, bankAccountId|assetAccountId, note, proofUrls }
//   DELETE ?id= → remove a deposit
// Access: ADMIN only (matches the common-share routes).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { repostCommonIssuance } from '@/lib/accounting/equity'

const ADMIN = ['ADMIN']
const num = (v: unknown) => Number(v || 0)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape = (d: any) => ({
  id: d.id, date: d.date, amount: num(d.amount), kind: d.kind,
  bankAccountId: d.bankAccountId, assetAccountId: d.assetAccountId,
  note: d.note, proofUrls: d.proofUrls,
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const commonShareId = new URL(req.url).searchParams.get('commonShareId') || ''
  if (!commonShareId) return NextResponse.json({ error: 'commonShareId required' }, { status: 400 })
  const deposits = await prisma.equityDeposit.findMany({ where: { commonShareId }, orderBy: { date: 'asc' } })
  return NextResponse.json(deposits.map(shape))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const commonShareId = String(b.commonShareId || '')
    const amount = num(b.amount)
    const kind = b.kind === 'NON_CASH' ? 'NON_CASH' : 'CASH'
    if (!commonShareId) return NextResponse.json({ error: 'commonShareId is required' }, { status: 400 })
    if (!(amount > 0)) return NextResponse.json({ error: 'Deposit amount must be greater than zero' }, { status: 400 })
    if (kind === 'CASH' && !b.bankAccountId) return NextResponse.json({ error: 'Choose the bank account the deposit landed in' }, { status: 400 })
    if (kind === 'NON_CASH' && !b.assetAccountId) return NextResponse.json({ error: 'Choose the account the non-cash consideration is debited to' }, { status: 400 })

    const share = await prisma.commonShare.findUnique({
      where: { id: commonShareId },
      select: { numberOfShares: true, pricePerShare: true, deposits: { select: { amount: true } } },
    })
    if (!share) return NextResponse.json({ error: 'Shareholding not found' }, { status: 404 })

    // Consideration can never exceed what the shares were issued for.
    const cap = num(share.numberOfShares) * num(share.pricePerShare)
    const already = share.deposits.reduce((s, d) => s + num(d.amount), 0)
    if (already + amount > cap + 0.005) {
      return NextResponse.json({
        error: `That would record ${(already + amount).toLocaleString('en-PH')} against a ${cap.toLocaleString('en-PH')} subscription. Only ${(cap - already).toLocaleString('en-PH')} remains unrecorded.`,
      }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx) => {
      const dep = await tx.equityDeposit.create({ data: {
        commonShareId, date: b.date ? new Date(b.date) : new Date(), amount, kind,
        bankAccountId: kind === 'CASH' ? (b.bankAccountId || null) : null,
        assetAccountId: kind === 'NON_CASH' ? (b.assetAccountId || null) : null,
        note: b.note?.trim() || null,
        proofUrls: Array.isArray(b.proofUrls) ? b.proofUrls : undefined,
        createdById: session.user!.id ?? null,
      } })
      await repostCommonIssuance(tx, commonShareId, session.user!.id as string)
      return dep
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Equity deposit create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const dep = await prisma.equityDeposit.findUnique({ where: { id } })
  if (!dep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.$transaction(async (tx) => {
    await tx.equityDeposit.delete({ where: { id } })
    await repostCommonIssuance(tx, dep.commonShareId, session.user!.id as string)
  })
  return NextResponse.json({ success: true })
}
