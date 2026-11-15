import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HMO_VOID_REF } from '@/lib/hmo-session-void'
import { CANCEL_SESSION_ROLES, isArCancelNote } from '@/lib/hmo-cancel-shared'
import { postOrderJournal } from '@/lib/accounting/post-order'
import { noteGlFailure } from '@/lib/accounting/pos-gl-check'

/**
 * POST /api/accounts-receivable/uncancel   Body: { orderId }
 * Undo AR's "Mark cancelled" (Hannah 2026-11-15: "allow for an undo button").
 * Puts back exactly what the cancel's POS void changed for an HMO session:
 *   · the order → COMPLETED again (so payroll counts it and its PF stands),
 *   · the HMO wallet's receivable (+amount; a GL wallet −amount),
 *   · the Session Adjustments row is removed (its PF-to-recover alert goes with it),
 *   · the books: an order the hub posts per order is re-posted (postOrderJournal,
 *     net-idempotent); QuickBooks-era sessions never had an entry, so none is made.
 * Refused when the PF recovery was already recorded to a payroll cutoff (undo it
 * in Payroll first) or when the order also had cash/package payments (re-enter
 * it in POS) — those can't be put back safely from here.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !CANCEL_SESSION_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'VOIDED') return NextResponse.json({ error: `#${order.orderNumber} is not cancelled.` }, { status: 409 })

    const adj = await prisma.orderHmoSettlement.findFirst({ where: { orderId, reference: HMO_VOID_REF } })
    if (!adj || !isArCancelNote(adj.note)) {
      return NextResponse.json({ error: `#${order.orderNumber} was voided in POS, not cancelled from AR — undo it from POS.` }, { status: 409 })
    }
    if (adj.pfResolvedAt) {
      const cutoff = /cutoff:([^\s—]+)/.exec(adj.pfResolvedNote || '')?.[1]
      return NextResponse.json({ error: `The PF recovery for #${order.orderNumber} is already recorded${cutoff ? ` in cutoff ${cutoff}` : ''}. Undo it in Payroll → HMO PF Adjustments first, then undo the cancel.` }, { status: 409 })
    }
    const other = order.payments.filter(p => !['HMO', 'GL'].includes(p.method) && Number(p.amount) > 0)
    if (other.length) {
      return NextResponse.json({ error: `#${order.orderNumber} also had ${[...new Set(other.map(p => p.method))].join(', ')} payments — re-enter it in POS instead.` }, { status: 409 })
    }

    await prisma.$transaction(async tx => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'COMPLETED' } })
      for (const p of order.payments) {
        if (!p.walletId || !(Number(p.amount) > 0)) continue
        // The void reversed these; put them back as the sale had them.
        if (p.method === 'HMO') await tx.digitalWallet.update({ where: { id: p.walletId }, data: { balance: { increment: Number(p.amount) } } })
        else if (p.method === 'GL') await tx.digitalWallet.update({ where: { id: p.walletId }, data: { balance: { decrement: Number(p.amount) } } })
      }
      await tx.orderHmoSettlement.delete({ where: { id: adj.id } })
      await tx.auditLog.create({
        data: {
          userId: session.user!.id as string, action: 'UNVOID', entity: 'order', entityId: orderId,
          details: { orderNumber: order.orderNumber, undoOf: adj.note, via: 'AR undo cancel' },
        },
      })
    })

    // Books: only orders the hub posts per order (any POS entry history).
    let gl: string = 'no entry (QuickBooks-era session)'
    const history = await prisma.journalEntry.count({ where: { referenceId: orderId, referenceType: { in: ['POS_ORDER', 'POS_ORDER_REVERSAL'] } } })
    if (history) {
      try {
        const r = await postOrderJournal(prisma, orderId, session.user.id as string)
        gl = r.posted ? 're-posted' : r.alreadyPosted ? 'already posted' : (r.reason || 'not posted')
        await noteGlFailure(prisma, { orderId, userId: session.user.id as string, step: 'edit', result: r })
      } catch (e) {
        gl = 'not posted — on Posting Check'
        await noteGlFailure(prisma, { orderId, userId: session.user.id as string, step: 'edit', error: e })
      }
    }
    return NextResponse.json({ ok: true, orderNumber: order.orderNumber, gl })
  } catch (e) {
    console.error('[uncancel]', e)
    return NextResponse.json({ error: 'Could not undo the cancel' }, { status: 500 })
  }
}
