import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HMO_CHANGE_ROLES } from '@/lib/hmo-change'

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * PATCH /api/accounts-receivable/hmo
 * Body: { orderId: string, walletId: string }
 *
 * Moves an HMO session to another HMO (Hannah 2026-11-17: sessions re-tagged
 * to AVEGA services still read INTELLICARE). The HMO a session belongs to is
 * the wallet on its HMO payment line, which AR, Generate SOA, the collection
 * reports and the POS order all read, so that line is what changes:
 * - the payment line moves to the new HMO and the two HMOs' wallet balances
 *   follow (the same bookkeeping as a POS Edit Order switch);
 * - a session on the old HMO's SOA comes off it (Hannah: "take it off that
 *   SOA"), the old batch gets a remark saying so, and its per-claim SOA status
 *   is cleared — it waits for an SOA of the new HMO;
 * - no journal entry: every HMO posts to the same receivable account
 *   (1010, "AR — HMO") — Hannah: "no JE needed". If two HMOs ever differ,
 *   the change is refused instead.
 * Refused for a session already tagged paid, and for a voided or reopened one.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !HMO_CHANGE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { orderId, walletId } = await req.json()
    if (!orderId || !walletId) return NextResponse.json({ error: 'orderId and walletId are required' }, { status: 400 })

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNumber: true, status: true, soaApprovalStatus: true,
        payments: {
          where: { method: 'HMO' },
          select: { id: true, amount: true, walletId: true, wallet: { select: { patientName: true, accountId: true } } },
        },
        arPaymentItems: { select: { paymentId: true }, take: 1 },
        soaSubmissionItems: { select: { id: true, submission: { select: { id: true, referenceNo: true, walletId: true } } } },
      },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status === 'VOIDED') return NextResponse.json({ error: 'This session is voided.' }, { status: 409 })
    if (order.status === 'REOPENED') {
      return NextResponse.json({ error: 'This order is reopened in POS. Set the HMO there when you complete it again.' }, { status: 409 })
    }
    if (order.payments.length !== 1) {
      return NextResponse.json({
        error: order.payments.length === 0
          ? 'This order has no HMO payment line.'
          : `This order is split across ${order.payments.length} HMO payment lines — change it in POS (Reopen → Edit Order).`,
      }, { status: 409 })
    }
    const line = order.payments[0]
    if (line.walletId === walletId) return NextResponse.json({ error: 'The session is already under that HMO.' }, { status: 400 })
    if (order.arPaymentItems.length) {
      return NextResponse.json({ error: 'This session is already tagged as paid in AR → Payment History, so its HMO cannot be switched. Untag it in Payment History first, then change the HMO.' }, { status: 409 })
    }

    const target = await prisma.digitalWallet.findUnique({
      where: { id: walletId },
      select: { id: true, patientName: true, walletType: true, isActive: true, accountId: true },
    })
    if (!target || target.walletType !== 'HMO' || !target.isActive) {
      return NextResponse.json({ error: 'Pick an active HMO.' }, { status: 400 })
    }
    if (line.wallet && line.wallet.accountId !== target.accountId) {
      return NextResponse.json({ error: `${line.wallet.patientName} and ${target.patientName} post to different receivable accounts, so the journal entry would have to move too. Change it in POS (Reopen → Edit Order) instead.` }, { status: 409 })
    }

    const fromName = line.wallet?.patientName || 'no HMO'
    const amount = Number(line.amount)
    const offSoa = order.soaSubmissionItems.filter(i => i.submission.walletId !== walletId)
    const byName = (session.user.name as string) || 'Unknown'
    const at = new Date().toISOString()

    await prisma.$transaction(async tx => {
      await tx.orderPayment.update({ where: { id: line.id }, data: { walletId } })
      // HMO wallets accumulate what they owe (POS edit does the same).
      if (line.walletId) {
        await tx.digitalWallet.update({ where: { id: line.walletId }, data: { balance: { decrement: amount } } })
      }
      await tx.digitalWallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } })

      if (offSoa.length) {
        await tx.soaSubmissionItem.deleteMany({ where: { id: { in: offSoa.map(i => i.id) } } })
        for (const subId of new Set(offSoa.map(i => i.submission.id))) {
          const sub = await tx.soaSubmission.findUnique({ where: { id: subId }, select: { remarks: true } })
          const prev = Array.isArray(sub?.remarks) ? sub.remarks : []
          await tx.soaSubmission.update({
            where: { id: subId },
            data: {
              remarks: [...prev, {
                text: `Session #${order.orderNumber} (${peso(amount)}) taken off this SOA — its HMO was changed from ${fromName} to ${target.patientName} in AR.`,
                byId: session.user.id as string,
                byName,
                at,
              }],
            },
          })
        }
      }

      // Generated (not yet submitted) SOAs of the old HMO list the session
      // too; drop it so the AR row stops reading "on SOA" for the wrong HMO.
      if (line.walletId) {
        const records = await tx.soaRecord.findMany({ where: { walletId: line.walletId }, select: { id: true, orderIds: true } })
        for (const r of records) {
          const ids = Array.isArray(r.orderIds) ? (r.orderIds as string[]) : []
          if (ids.includes(order.id)) {
            await tx.soaRecord.update({ where: { id: r.id }, data: { orderIds: ids.filter(x => x !== order.id) } })
          }
        }
      }

      if (offSoa.length && order.soaApprovalStatus) {
        await tx.order.update({ where: { id: order.id }, data: { soaApprovalStatus: null } })
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id as string,
          action: 'HMO_CHANGE',
          entity: 'order',
          entityId: order.id,
          details: {
            orderNumber: order.orderNumber,
            from: fromName,
            fromWalletId: line.walletId,
            to: target.patientName,
            toWalletId: walletId,
            amount,
            takenOffSoa: offSoa.map(i => i.submission.referenceNo || i.submission.id),
            soaApprovalStatusCleared: offSoa.length ? order.soaApprovalStatus : null,
          },
        },
      })
    })

    return NextResponse.json({
      orderId: order.id,
      walletId,
      walletName: target.patientName,
      takenOffSoa: offSoa.map(i => ({ submissionId: i.submission.id, referenceNo: i.submission.referenceNo })),
      soaApprovalStatus: offSoa.length ? null : order.soaApprovalStatus,
    })
  } catch (err) {
    console.error('[AR] HMO change failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
