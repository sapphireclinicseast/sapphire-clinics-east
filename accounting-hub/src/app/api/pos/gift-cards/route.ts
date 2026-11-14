// Gift cards (POS → Services → Vouchers) — prepaid value, see lib/gift-cards.
//   GET   → batches with their cards, uses and counts, plus the total still
//           outstanding (the gift card share of 4050 Unearned Revenue)
//   POST  { count, faceValue, reason } → generate `count` UNSOLD cards
//   PUT   { batchId, reason, faceValue? } → edit a batch; the value can only
//         change while none of its cards has been sold
//   PATCH { cardId } | { batchId } → void one unsold card / every unsold card
// Generating, editing and voiding: ADMIN / ACCOUNTANT / BOOKKEEPER. Selling and
// spending happen at the Cashier (order creation, server-side), so front desk
// only needs to view and print here.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomGiftCardCode } from '@/lib/gift-cards'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const READ_ROLES = [...WRITE_ROLES, 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'VIEWER']

const num = (v: unknown) => Number(v || 0)
const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const batches = await prisma.giftCardBatch.findMany({
    include: { cards: { orderBy: { code: 'asc' }, include: { uses: { orderBy: { createdAt: 'asc' } } } } },
    orderBy: { createdAt: 'desc' },
  })
  // Order numbers for the sale and every use, in one lookup.
  const orderIds = new Set<string>()
  for (const b of batches) for (const c of b.cards) {
    if (c.soldOrderId) orderIds.add(c.soldOrderId)
    for (const u of c.uses) orderIds.add(u.orderId)
  }
  const orders = orderIds.size
    ? await prisma.order.findMany({ where: { id: { in: [...orderIds] } }, select: { id: true, orderNumber: true, transactionDate: true, patientName: true, status: true } })
    : []
  const byId = new Map(orders.map(o => [o.id, o]))

  let outstanding = 0
  let outstandingCards = 0
  const out = batches.map(b => {
    const counts = { total: b.cards.length, unsold: 0, active: 0, usedUp: 0, voided: 0 }
    let batchOutstanding = 0
    for (const c of b.cards) {
      if (c.status === 'UNSOLD') counts.unsold++
      else if (c.status === 'ACTIVE') { counts.active++; batchOutstanding += num(c.balance) }
      else if (c.status === 'USED_UP') counts.usedUp++
      else if (c.status === 'VOIDED') counts.voided++
    }
    outstanding += batchOutstanding
    outstandingCards += counts.active
    return {
      id: b.id, reason: b.reason, faceValue: num(b.faceValue), createdAt: b.createdAt,
      counts, outstanding: r2(batchOutstanding),
      cards: b.cards.map(c => {
        const sold = c.soldOrderId ? byId.get(c.soldOrderId) : undefined
        return {
          id: c.id, code: c.code, status: c.status, faceValue: num(c.faceValue), balance: num(c.balance),
          soldAt: c.soldAt, soldBranch: c.soldBranch, buyerName: c.buyerName,
          soldOrderNumber: sold?.orderNumber ?? null,
          uses: c.uses.map(u => {
            const o = byId.get(u.orderId)
            return { amount: num(u.amount), at: u.createdAt, orderNumber: o?.orderNumber ?? null, patientName: o?.patientName ?? null }
          }),
        }
      }),
    }
  })
  return NextResponse.json({
    canWrite: WRITE_ROLES.includes(session.user.role as string),
    outstanding: r2(outstanding), outstandingCards,
    batches: out,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Only Admin, Accountant, and Bookkeeper accounts can generate gift cards' }, { status: 403 })
  try {
    const b = await req.json()
    const count = Math.round(num(b.count))
    const faceValue = r2(num(b.faceValue))
    const reason = String(b.reason || '').trim()
    if (!(count > 0) || count > 1000) return NextResponse.json({ error: 'Number of gift cards must be between 1 and 1,000' }, { status: 400 })
    if (!(faceValue > 0)) return NextResponse.json({ error: 'Enter the peso value of each gift card' }, { status: 400 })
    if (faceValue > 1_000_000) return NextResponse.json({ error: 'A gift card can be worth at most ₱1,000,000' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'Enter what these gift cards are for' }, { status: 400 })

    // Unique codes, checked against both gift cards and discount vouchers so a
    // scanned code always means one thing.
    const codes = new Set<string>()
    for (let guard = 0; codes.size < count && guard < 20; guard++) {
      while (codes.size < count) codes.add(randomGiftCardCode())
      const clash = await prisma.giftCard.findMany({ where: { code: { in: [...codes] } }, select: { code: true } })
      for (const c of clash) codes.delete(c.code)
    }
    if (codes.size < count) return NextResponse.json({ error: 'Could not generate unique codes — try again' }, { status: 500 })

    const batch = await prisma.giftCardBatch.create({ data: {
      reason, faceValue, createdById: (session.user.id as string) || null,
      cards: { create: [...codes].map(code => ({ code, faceValue })) },
    }, include: { cards: true } })
    await prisma.auditLog.create({ data: {
      userId: session.user.id as string, action: 'CREATE', entity: 'giftCardBatch', entityId: batch.id,
      details: { count: batch.cards.length, faceValue, reason },
    } }).catch(() => {})
    return NextResponse.json({ id: batch.id, count: batch.cards.length })
  } catch (e) {
    console.error('Gift card batch create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Only Admin, Accountant, and Bookkeeper accounts can edit gift cards' }, { status: 403 })
  try {
    const b = await req.json()
    const batch = await prisma.giftCardBatch.findUnique({ where: { id: String(b.batchId || '') } })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    const reason = b.reason !== undefined ? String(b.reason).trim() : batch.reason
    if (!reason) return NextResponse.json({ error: 'Enter what these gift cards are for' }, { status: 400 })
    const faceValue = b.faceValue !== undefined ? r2(num(b.faceValue)) : num(batch.faceValue)
    if (!(faceValue > 0)) return NextResponse.json({ error: 'Enter the peso value of each gift card' }, { status: 400 })
    const valueChanged = Math.abs(faceValue - num(batch.faceValue)) > 0.004
    if (valueChanged) {
      const sold = await prisma.giftCard.count({ where: { batchId: batch.id, status: { not: 'UNSOLD' }, soldAt: { not: null } } })
      if (sold > 0) return NextResponse.json({ error: 'Some cards in this batch are already sold — their value can no longer change. Generate a new batch instead.' }, { status: 400 })
    }
    await prisma.$transaction([
      prisma.giftCardBatch.update({ where: { id: batch.id }, data: { reason, faceValue } }),
      ...(valueChanged ? [prisma.giftCard.updateMany({ where: { batchId: batch.id, status: 'UNSOLD' }, data: { faceValue } })] : []),
    ])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Gift card batch edit error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Only Admin, Accountant, and Bookkeeper accounts can void gift cards' }, { status: 403 })
  try {
    const b = await req.json()
    if (b.cardId) {
      const c = await prisma.giftCard.findUnique({ where: { id: String(b.cardId) } })
      if (!c) return NextResponse.json({ error: 'Gift card not found' }, { status: 404 })
      // A sold card is money the clinic holds (4050): it goes away only by
      // voiding its sale (refund) or by being spent.
      if (c.status !== 'UNSOLD') return NextResponse.json({ error: c.status === 'VOIDED' ? 'This gift card is already voided' : 'This gift card has been sold — to take it back, void the order that sold it' }, { status: 400 })
      const r = await prisma.giftCard.updateMany({ where: { id: c.id, status: 'UNSOLD' }, data: { status: 'VOIDED' } })
      if (r.count === 0) return NextResponse.json({ error: 'This gift card was just sold — it can no longer be voided here' }, { status: 400 })
      return NextResponse.json({ success: true })
    }
    if (b.batchId) {
      const r = await prisma.giftCard.updateMany({ where: { batchId: String(b.batchId), status: 'UNSOLD' }, data: { status: 'VOIDED' } })
      return NextResponse.json({ success: true, voided: r.count })
    }
    return NextResponse.json({ error: 'cardId or batchId required' }, { status: 400 })
  } catch (e) {
    console.error('Gift card void error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
