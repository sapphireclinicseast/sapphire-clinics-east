import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postOrderJournal, reverseOrderJournal } from '@/lib/accounting/post-order'

// Revising a sale down to what the HMO paid changes revenue, commissions and
// PF thresholds, so front desk can't do it.
const SETTLE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'HMO_OFFICER', 'AHEA_ADMIN', 'AHGH_ADMIN']

const round2 = (n: number) => Math.round(n * 100) / 100
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * POST /api/pos/orders/[id]/hmo-settlement
 * Body: { paidAmount: number, reference?: string, note?: string, paymentId?: string }
 *
 * "Decrease due to HMO Payment": the HMO approved less than the session was
 * billed. The order's lines, HMO payment and net come down to the amount the
 * HMO paid (gross, before its 5% discount and WHT), and the sale is reversed and
 * re-posted on its own date — so POS sales, the ledger, commissions and PF
 * thresholds all read the real amount. The billed amount and original lines are
 * kept on an OrderHmoSettlement row for the order history and the Payroll alert.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || !SETTLE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const paidAmount = round2(Number(body.paidAmount))
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 120) : ''
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return NextResponse.json({ error: 'Enter the amount the HMO paid' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: { include: { wallet: { select: { id: true, walletType: true, patientName: true } } } },
      },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed orders can be decreased' }, { status: 400 })
    }
    if (order.revenueType === 'UNEARNED') {
      return NextResponse.json({ error: 'Package / deposit orders cannot be decreased this way' }, { status: 400 })
    }

    const hmoPayments = order.payments.filter(p => p.method === 'HMO' && Number(p.amount) > 0)
    const payment = body.paymentId ? hmoPayments.find(p => p.id === body.paymentId) : hmoPayments.length === 1 ? hmoPayments[0] : undefined
    if (!payment) {
      return NextResponse.json({ error: hmoPayments.length ? 'Choose which HMO payment to decrease' : 'This order has no HMO payment' }, { status: 400 })
    }
    const billed = round2(Number(payment.amount))
    if (paidAmount >= billed) {
      return NextResponse.json({ error: `The HMO paid amount must be lower than the billed ${peso(billed)}` }, { status: 400 })
    }
    const reduction = round2(billed - paidAmount)

    // Take the reduction out of the priced lines. A line that alone equals the
    // reduction (e.g. an uncovered ₱700 Shockwave) takes all of it; otherwise it
    // is spread in proportion to each line, with the centavo remainder on the
    // largest line.
    const open = order.items
      .map(i => ({ item: i, room: round2(Number(i.lineTotal) - Number(i.refundAmount || 0)) }))
      .filter(x => x.room > 0)
    const roomTotal = round2(open.reduce((s, x) => s + x.room, 0))
    if (roomTotal < reduction) {
      return NextResponse.json({ error: `The order's lines only carry ${peso(roomTotal)} — cannot take off ${peso(reduction)}` }, { status: 400 })
    }
    const take = new Map<string, number>()
    const exact = open.filter(x => Math.abs(x.room - reduction) < 0.005)
    if (exact.length === 1) {
      take.set(exact[0].item.id, reduction)
    } else {
      let allocated = 0
      for (const x of open) {
        const t = Math.floor((x.room / roomTotal) * reduction * 100) / 100
        take.set(x.item.id, t)
        allocated = round2(allocated + t)
      }
      const largest = open.reduce((a, b) => (b.room > a.room ? b : a))
      take.set(largest.item.id, round2((take.get(largest.item.id) || 0) + reduction - allocated))
    }

    const userName = (session.user.name as string) || 'Unknown'
    const today = new Date().toISOString().slice(0, 10)
    const stamp = `HMO settlement ${today}: billed ${peso(billed)} → paid ${peso(paidAmount)} (−${peso(reduction)})${reference ? ` · ${reference}` : ''}${note ? ` · ${note}` : ''} — ${userName}`

    const settlement = await prisma.$transaction(async tx => {
      for (const i of order.items) {
        const t = take.get(i.id)
        if (!t) continue
        const lineTotal = round2(Number(i.lineTotal) - t)
        const qty = i.quantity > 0 ? i.quantity : 1
        await tx.orderItem.update({ where: { id: i.id }, data: { lineTotal, unitPrice: round2(lineTotal / qty) } })
      }
      await tx.orderPayment.update({ where: { id: payment.id }, data: { amount: paidAmount } })
      await tx.order.update({
        where: { id },
        data: {
          subtotal: round2(Number(order.subtotal) - reduction),
          netAmount: round2(Number(order.netAmount) - reduction),
          notes: order.notes ? `${order.notes} | ${stamp}` : stamp,
        },
      })
      // The POS adds HMO sales to the wallet's stored balance; take the decrease back out.
      if (payment.wallet && payment.wallet.walletType !== 'GL') {
        await tx.digitalWallet.update({ where: { id: payment.wallet.id }, data: { balance: { decrement: reduction } } })
      }
      return tx.orderHmoSettlement.create({
        data: {
          orderId: id,
          paymentId: payment.id,
          walletId: payment.walletId,
          billedAmount: billed,
          paidAmount,
          difference: reduction,
          reference: reference || null,
          note: note || null,
          originalItems: order.items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })),
          createdById: session.user.id as string,
          createdByName: userName,
        },
      })
    })

    // Re-post the sale at the new amount, on the session's own date: the
    // reversal mirrors the standing entry at its original date, then the forward
    // entry is rebuilt from the revised lines. If the re-post is refused (e.g. an
    // MD consult the posting rules treat as pass-through) the reversal is undone,
    // so revenue is never silently dropped — the status says the entry needs a hand fix.
    let glStatus = 'UNCHANGED (GL posting is off)'
    try {
      const rev = await reverseOrderJournal(prisma, id, session.user.id as string, 'HMO settlement — repriced to the HMO-paid amount')
      if (rev.posted && rev.journalEntryId) {
        const post = await postOrderJournal(prisma, id, session.user.id as string)
        if (post.posted) {
          glStatus = 'REPOSTED'
        } else {
          await prisma.journalEntry.delete({ where: { id: rev.journalEntryId } })
          glStatus = `UNCHANGED (re-post refused: ${post.reason || 'already posted'}) — adjust the sale's entry by hand`
        }
      } else if (rev.reason === 'no forward JE to reverse') {
        const post = await postOrderJournal(prisma, id, session.user.id as string)
        glStatus = post.posted ? 'POSTED' : `UNCHANGED (${post.reason || 'already posted'})`
      } else if (rev.alreadyPosted) {
        glStatus = 'UNCHANGED (the sale is not standing in the ledger)'
      } else if (rev.reason) {
        glStatus = `UNCHANGED (${rev.reason})`
      }
    } catch (e) {
      console.error('[HMO settlement] re-post failed for order', id, e)
      glStatus = 'UNCHANGED (re-post failed — check the server log)'
    }
    await prisma.orderHmoSettlement.update({ where: { id: settlement.id }, data: { glStatus } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string,
        action: 'HMO_SETTLEMENT',
        entity: 'order',
        entityId: id,
        details: { orderNumber: order.orderNumber, billed, paidAmount, reduction, reference, glStatus },
      },
    })

    return NextResponse.json({ ok: true, settlementId: settlement.id, billed, paidAmount, reduction, glStatus })
  } catch (e) {
    console.error('HMO settlement failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
