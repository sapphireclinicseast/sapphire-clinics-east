import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { restoreFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import { postOrderJournal, reverseOrderJournal } from '@/lib/accounting/post-order'
import { linkReferredPatientFromOrder } from '@/lib/referral-link'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            service: { select: { id: true, name: true, department: true } },
            inventoryItem: { select: { id: true, name: true, sku: true } },
          },
        },
        payments: {
          include: {
            wallet: { select: { id: true, patientName: true, barcode: true } },
          },
        },
        referrer: true,
        createdBy: { select: { id: true, name: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()

    const existing = await prisma.order.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Refund: keep the sale on the books but record it as fully refunded — each product line's
    // still-sold units are added back to inventory, returnedQuantity/refundAmount are set (so it
    // shows under 7160 Refunds + the products-analysis refund rate), and net collected → 0.
    if (body.action === 'refund') {
      const order = await prisma.order.findUnique({ where: { id }, include: { items: true } })
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      for (const oi of order.items) {
        if (oi.inventoryItemId) {
          const soldUnits = oi.quantity - (oi.returnedQuantity || 0)   // units still deducted from stock
          if (soldUnits > 0) {
            await restoreFifoLots(prisma, oi.inventoryItemId, soldUnits)
            await prisma.inventoryItem.update({ where: { id: oi.inventoryItemId }, data: { quantity: { increment: soldUnits } } })
            if (oi.variantId) await prisma.inventoryVariant.update({ where: { id: oi.variantId }, data: { quantity: { increment: soldUnits } } })
            const nc = await recalcWeightedUnitCost(prisma, oi.inventoryItemId)
            if (nc > 0) await prisma.inventoryItem.update({ where: { id: oi.inventoryItemId }, data: { unitCost: nc } })
          }
        }
        await prisma.orderItem.update({ where: { id: oi.id }, data: { returnedQuantity: oi.quantity, refundAmount: oi.lineTotal } })
      }
      await prisma.order.update({ where: { id }, data: { status: 'COMPLETED', returnedByBuyer: true, netAmount: 0 } })
      return NextResponse.json({ ok: true, refunded: true })
    }

    // Record payment on a previously-Unpaid order. The session stays on its
    // original transactionDate; the cash is stamped with paymentDate (collection
    // day) so the POS Sales Summary reconciles the drawer on the day it's received.
    if (body.action === 'recordPayment') {
      if (existing.paymentStatus !== 'UNPAID') {
        return NextResponse.json({ error: 'This order is already paid' }, { status: 400 })
      }
      const pays: { method: string; amount: number; walletId?: string; reference?: string; paymentModeId?: string }[] = body.payments || []
      const total = pays.reduce((s, p) => s + Number(p.amount || 0), 0)
      if (!(total > 0)) return NextResponse.json({ error: 'Enter the payment collected' }, { status: 400 })
      // Collected total must equal the amount due — a mismatch is accepted by
      // the POS but the GL refuses the lopsided entry, so the sale silently
      // never posts. Refuse it at collection time instead.
      const amountDue = Number(existing.netAmount)
      if (Math.abs(total - amountDue) > 0.05) {
        return NextResponse.json(
          { error: `Payments total ₱${total.toFixed(2)} but the amount due is ₱${amountDue.toFixed(2)}. The collected amount must equal the net amount — check the discount and downpayment math.` },
          { status: 400 }
        )
      }
      const payDate = body.paymentDate ? new Date(`${body.paymentDate}T08:00:00+08:00`) : new Date()
      await prisma.$transaction(async (tx) => {
        await tx.orderPayment.createMany({
          data: pays.map(p => ({ orderId: id, method: p.method as never, amount: Number(p.amount), walletId: p.walletId || null, reference: p.reference || null, paymentModeId: p.paymentModeId || null })),
        })
        await tx.order.update({
          where: { id },
          data: {
            paymentStatus: 'PAID', paymentDate: payDate, status: 'COMPLETED',
            ...(body.issuedOfficialInvoice ? { issuedOfficialInvoice: true, salesInvoiceNumber: body.salesInvoiceNumber?.trim() || null } : {}),
          },
        })
      })
      try { await postOrderJournal(prisma, id, session.user.id) } catch (e) { console.error('[GL] recordPayment posting threw:', e) }
      return NextResponse.json({ ok: true, paid: true })
    }

    // Handle status change actions (reopen / void / returnByBuyer)
    if (body.action === 'reopen' || body.action === 'void' || body.action === 'returnByBuyer') {
      const isReturn = body.action === 'returnByBuyer'
      // A buyer return reverses the sale (VOIDED) and is also flagged returnedByBuyer.
      const newStatus = body.action === 'reopen' ? 'REOPENED' : 'VOIDED'

      const updated = await prisma.order.update({
        where: { id },
        data: { status: newStatus, ...(isReturn ? { returnedByBuyer: true } : {}) },
        include: { items: true, payments: true },
      })

      // The sale no longer stands — cancel its GL posting with a mirrored
      // POS_ORDER_REVERSAL (no-op if the order was never posted). A reopened
      // order that gets completed again posts a fresh forward JE.
      try { await reverseOrderJournal(prisma, id, session.user.id, body.action === 'reopen' ? 'order reopened' : isReturn ? 'returned by buyer' : 'order voided') }
      catch (e) { console.error('[GL] void/reopen reversal posting threw:', e) }

      // When voiding or returning, reverse ALL wallet changes
      if (body.action === 'void' || isReturn) {
        // A voucher redeemed by this order goes back into circulation (it may
        // have expired in the meantime — validation at re-use handles that).
        await prisma.serviceVoucher.updateMany({
          where: { usedOrderId: id, status: 'USED' },
          data: { status: 'ACTIVE', usedAt: null, usedOrderId: null, usedById: null },
        }).catch(() => {})
        for (const p of updated.payments) {
          if (!p.walletId) continue
          // Allow PACKAGE through even at amount=0 — session still needs to be restored
          if (Number(p.amount) <= 0 && p.method !== 'PACKAGE') continue

          if (p.method === 'GL') {
            // GL: was decremented on creation → increment to restore
            await prisma.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { increment: Number(p.amount) } },
            })
          } else if (p.method === 'HMO') {
            // HMO: was incremented on creation (AR) → decrement to reverse
            await prisma.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { decrement: Number(p.amount) } },
            })
          } else if (p.method === 'PACKAGE') {
            // Package: session was consumed → restore it (decrement usedSessions)
            // Try to get pkgId from reference first; fall back to most-recently-used package on wallet
            let pkgId = p.reference?.startsWith('PKG:') ? p.reference.replace('PKG:', '') : null
            if (!pkgId) {
              // Legacy orders may have no PKG: reference — find the wallet's package with usedSessions > 0
              const fallback = await prisma.walletPackage.findFirst({
                where: { walletId: p.walletId, usedSessions: { gt: 0 } },
                orderBy: { purchaseDate: 'desc' },
              })
              pkgId = fallback?.id ?? null
            }
            if (pkgId) {
              const pkg = await prisma.walletPackage.findUnique({ where: { id: pkgId } })
              const used = pkg ? Number(pkg.usedSessions) : 0
              if (pkg && used > 0) {
                // Services can cost fractional/multiple sessions — restore what the
                // order actually deducted (recorded on its DEDUCTION wallet log),
                // falling back to 1 for legacy orders without a tagged log.
                const dedLog = await prisma.walletLog.findFirst({
                  where: {
                    packageId: pkgId,
                    action: 'DEDUCTION',
                    description: { contains: `[order:${p.orderId}]` },
                  },
                  orderBy: { createdAt: 'desc' },
                })
                const toRestore = Math.min(used, dedLog?.sessions ? Number(dedLog.sessions) : 1)
                await prisma.walletPackage.update({
                  where: { id: pkgId },
                  data: { usedSessions: { decrement: toRestore } },
                })
                await prisma.walletLog.create({
                  data: {
                    walletId: p.walletId,
                    packageId: pkgId,
                    action: 'VOID_REVERSAL',
                    sessions: -toRestore,
                    description: `Reversed ${toRestore} session(s) (order voided)`,
                    createdById: session.user.id,
                  },
                })
              }
            }
          } else if (['VIP_CARD', 'PREPAID_CARD', 'DOWNPAYMENT', 'ADVANCE'].includes(p.method)) {
            // Wallet balance was deducted → increment to restore
            await prisma.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { increment: Number(p.amount) } },
            })
            await prisma.walletLog.create({
              data: {
                walletId: p.walletId,
                action: 'VOID_REVERSAL',
                description: `Restored ${Number(p.amount).toFixed(2)} (order voided)`,
                createdById: session.user.id,
              },
            })
          } else if (p.method === 'REWARD_POINTS') {
            // Reward points were deducted → restore them to the wallet
            // Parse the points from the reference (e.g. "500 pts from PATIENT NAME")
            const ptsMatch = p.reference?.match(/^(\d+)\s*pts/)
            const pointsToRestore = ptsMatch ? parseInt(ptsMatch[1]) : 0
            if (pointsToRestore > 0) {
              await prisma.digitalWallet.update({
                where: { id: p.walletId },
                data: { rewardPoints: { increment: pointsToRestore } },
              })
              await prisma.walletLog.create({
                data: {
                  walletId: p.walletId,
                  action: 'VOID_REVERSAL',
                  description: `Restored ${pointsToRestore} reward points (order voided)`,
                  createdById: session.user.id,
                },
              })
            }
          }
        }
      }

      // ── Void: restore inventory + delete free-sample journal entries ──
      if (body.action === 'void' && updated.orderType === 'PRODUCT') {
        for (const orderItem of updated.items) {
          if (!orderItem.inventoryItemId) continue

          const invItem = await prisma.inventoryItem.findUnique({
            where: { id: orderItem.inventoryItemId },
            include: { bundleComponents: true },
          })
          if (!invItem) continue

          const qtyToRestore = orderItem.quantity

          if (invItem.isBundle && invItem.bundleComponents.length > 0) {
            // Bundle: restore each component's lots + quantity
            for (const bc of invItem.bundleComponents) {
              const compQty = bc.quantity * qtyToRestore
              await restoreFifoLots(prisma, bc.componentId, compQty)
              await prisma.inventoryItem.update({
                where: { id: bc.componentId },
                data: { quantity: { increment: compQty } },
              })
              const newCost = await recalcWeightedUnitCost(prisma, bc.componentId)
              if (newCost > 0) {
                await prisma.inventoryItem.update({ where: { id: bc.componentId }, data: { unitCost: newCost } })
              }
            }
          } else {
            // Regular item: restore lots + quantity
            await restoreFifoLots(prisma, orderItem.inventoryItemId, qtyToRestore)
            await prisma.inventoryItem.update({
              where: { id: orderItem.inventoryItemId },
              data: { quantity: { increment: qtyToRestore } },
            })
            // Restore variant stock if applicable
            if (orderItem.variantId) {
              await prisma.inventoryVariant.update({
                where: { id: orderItem.variantId },
                data: { quantity: { increment: qtyToRestore } },
              })
            }
            const newCost = await recalcWeightedUnitCost(prisma, orderItem.inventoryItemId)
            if (newCost > 0) {
              await prisma.inventoryItem.update({ where: { id: orderItem.inventoryItemId }, data: { unitCost: newCost } })
            }
          }

          // Delete free-sample marketing expense journal entry
          if (orderItem.isFreeSample) {
            await prisma.journalEntry.deleteMany({
              where: { referenceType: 'FREE_SAMPLE', referenceId: orderItem.id },
            })
          }
        }
      }

      // ── Returned by buyer: restock each product line via an INCREASE inventory
      //    adjustment so it appears in the item's Qty history with a clear reference.
      //    (Uses the adjustment mechanism, NOT restoreFifoLots — that would double-restock.)
      if (isReturn && updated.orderType === 'PRODUCT') {
        const refLabel = `Order #${updated.orderNumber} RETURNED BY BUYER · ${updated.branch}`
        const restock = async (itemId: string, addQty: number, unitCost: number | null) => {
          const it = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
          if (!it || addQty <= 0) return
          const prev = it.quantity
          const next = prev + addQty
          await prisma.inventoryAdjustment.create({
            data: {
              itemId,
              type: 'INCREASE',
              quantityChange: addQty,
              remainingQuantity: addQty,
              previousQuantity: prev,
              newQuantity: next,
              adjustmentDate: new Date(),
              remarks: refLabel,
              adjustedById: session.user.id,
              ...(unitCost && unitCost > 0 ? { localCost: unitCost, totalLandedCost: unitCost * addQty } : {}),
            },
          })
          await prisma.inventoryItem.update({ where: { id: itemId }, data: { quantity: next } })
          const newCost = await recalcWeightedUnitCost(prisma, itemId)
          if (newCost > 0) await prisma.inventoryItem.update({ where: { id: itemId }, data: { unitCost: newCost } })
        }
        for (const orderItem of updated.items) {
          if (!orderItem.inventoryItemId || orderItem.isFreeSample) continue
          const invItem = await prisma.inventoryItem.findUnique({
            where: { id: orderItem.inventoryItemId },
            include: { bundleComponents: true },
          })
          if (!invItem) continue
          const qty = orderItem.quantity
          const perUnitCost = orderItem.cogsCost && qty > 0 ? Number(orderItem.cogsCost) / qty : null
          if (invItem.isBundle && invItem.bundleComponents.length > 0) {
            for (const bc of invItem.bundleComponents) await restock(bc.componentId, bc.quantity * qty, null)
          } else {
            await restock(orderItem.inventoryItemId, qty, perUnitCost)
            if (orderItem.variantId) {
              await prisma.inventoryVariant.update({ where: { id: orderItem.variantId }, data: { quantity: { increment: qty } } })
            }
          }
        }
      }

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: body.action.toUpperCase(),
          entity: 'order',
          entityId: id,
          details: {
            orderNumber: existing.orderNumber,
            previousStatus: existing.status,
            newStatus,
            reason: body.reason || null,
          },
        },
      })

      // Class-portal callback: orders converted from a class-portal tuition
      // queue item carry queueItemId="clsp_<classPortalPaymentId>". When the
      // cashier voids one, the corresponding student-portal payment should
      // flip back to PENDING (and the queue item should re-appear in the
      // cashier so it can be re-converted). Mirror reopen the same way.
      if (typeof updated.queueItemId === 'string' && updated.queueItemId.startsWith('clsp_')) {
        const classPortalPaymentId = updated.queueItemId.slice('clsp_'.length)
        const marketingUrl = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
        const apiKey = process.env.EXTERNAL_API_KEY || ''
        if (apiKey && classPortalPaymentId) {
          // Voiding sends the row back to PENDING (re-appears in queue).
          // Reopen we treat the same as a void from the class-portal point
          // of view: the order's no longer authoritative, so the student
          // should see PENDING again until the cashier re-completes.
          void fetch(`${marketingUrl}/api/internal/class-portal/frontdesk-payments/${encodeURIComponent(classPortalPaymentId)}`, {
            method: 'PATCH',
            headers: {
              'authorization': `Bearer ${apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              status: 'PENDING',
              notes: `Order ${existing.orderNumber ?? id} ${body.action} by ${session.user.name ?? session.user.id}${body.reason ? ': ' + body.reason : ''}`,
            }),
          }).catch(err => {
            console.warn('[orders.PUT void/reopen] class-portal callback failed:', err)
          })
        }
      }

      return NextResponse.json(updated)
    }

    // Handle full order edit (only allowed for REOPENED orders)
    if (existing.status !== 'REOPENED') {
      return NextResponse.json(
        { error: 'Only reopened orders can be edited. Reopen the order first.' },
        { status: 400 }
      )
    }

    const {
      patientName,
      clinicianName,
      items,
      payments,
      discountType,
      discountAmount,
      discountLabel,
      revenueType,
      referrerId,
      notes,
      issuedOfficialInvoice,
      salesInvoiceNumber,
      referenceNumber,
    } = body

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { status: 'COMPLETED' }

    if (patientName !== undefined) data.patientName = patientName || null
    if (clinicianName !== undefined) data.clinicianName = clinicianName || null
    if (body.transactionDate) data.transactionDate = new Date(body.transactionDate)
    if (body.dateChangeReason) data.notes = `${existing.notes || ''}${existing.notes ? ' | ' : ''}Date changed: ${body.dateChangeReason}`.trim()
    if (discountType !== undefined) data.discountType = discountType
    if (discountAmount !== undefined) data.discountAmount = Number(discountAmount)
    if (discountLabel !== undefined) data.discountLabel = discountLabel || null
    if (revenueType !== undefined) data.revenueType = revenueType
    if (referrerId !== undefined) data.referrerId = referrerId || null
    if (notes !== undefined) data.notes = notes || null
    if (issuedOfficialInvoice !== undefined) data.issuedOfficialInvoice = !!issuedOfficialInvoice
    if (salesInvoiceNumber !== undefined) data.salesInvoiceNumber = salesInvoiceNumber || null
    if (referenceNumber !== undefined) data.referenceNumber = referenceNumber || null

    // If items are provided, recalculate subtotal and netAmount
    if (items?.length) {
      const subtotal = items.reduce(
        (sum: number, item: { lineTotal: number }) => sum + Number(item.lineTotal),
        0
      )
      data.subtotal = subtotal
      data.netAmount = subtotal - Number(data.discountAmount ?? existing.discountAmount)
    }

    // Re-completing must leave payments equal to the net amount — otherwise
    // the POS accepts the order but the GL refuses the lopsided entry and the
    // sale silently never posts. (Same guard as order creation.)
    if (payments?.length) {
      const paidTotal = payments.reduce(
        (s: number, p: { amount: number }) => s + (Number(p.amount) || 0),
        0
      )
      const expectedNet = Number(data.netAmount ?? existing.netAmount)
      if (Math.abs(paidTotal - expectedNet) > 0.05) {
        return NextResponse.json(
          { error: `Payments total ₱${paidTotal.toFixed(2)} but the net amount is ₱${expectedNet.toFixed(2)}. The collected amount must equal the net amount — fix the discount/downpayment or the payment lines before completing.` },
          { status: 400 }
        )
      }
    }

    // Use a transaction to replace items/payments atomically
    const updated = await prisma.$transaction(async (tx) => {
      // Delete and recreate items if provided. The client often resends lines
      // without their inventoryItemId / cogsCost / free-sample flag — recreating
      // them bare severs the line from its stock item, and with it the movement
      // history and any later void's stock restore. Carry those over from the
      // old line (matched by name) whenever the new line doesn't provide them.
      if (items?.length) {
        const oldItems = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { name: true, inventoryItemId: true, cogsCost: true, isFreeSample: true, variantId: true },
        })
        const oldByName = new Map(oldItems.map(oi => [oi.name, oi]))
        await tx.orderItem.deleteMany({ where: { orderId: id } })
        await tx.orderItem.createMany({
          data: items.map((item: {
            serviceId?: string
            inventoryItemId?: string
            name: string
            quantity: number
            unitPrice: number
            lineTotal: number
          }) => {
            const prev = oldByName.get(item.name)
            return {
              orderId: id,
              serviceId: item.serviceId || null,
              inventoryItemId: item.inventoryItemId || prev?.inventoryItemId || null,
              name: item.name,
              quantity: item.quantity || 1,
              unitPrice: Number(item.unitPrice),
              lineTotal: Number(item.lineTotal),
              cogsCost: prev?.cogsCost ?? null,
              isFreeSample: prev?.isFreeSample ?? false,
              variantId: prev?.variantId ?? null,
            }
          }),
        })
      }

      // Delete and recreate payments if provided
      if (payments?.length) {
        // Reverse old wallet changes before deleting payments
        // HMO: was incremented → decrement to reverse
        // GL: was decremented → increment to reverse (restore GL balance)
        const oldPayments = await tx.orderPayment.findMany({ where: { orderId: id } })
        for (const op of oldPayments) {
          if (op.method === 'GL' && op.walletId) {
            await tx.digitalWallet.update({
              where: { id: op.walletId },
              data: { balance: { increment: Number(op.amount) } },
            })
          } else if (op.method === 'HMO' && op.walletId) {
            await tx.digitalWallet.update({
              where: { id: op.walletId },
              data: { balance: { decrement: Number(op.amount) } },
            })
          }
        }

        await tx.orderPayment.deleteMany({ where: { orderId: id } })
        await tx.orderPayment.createMany({
          data: payments.map((p: {
            method: string
            amount: number
            paymentModeId?: string
            walletId?: string
            reference?: string
          }) => ({
            orderId: id,
            method: p.method,
            amount: Number(p.amount),
            paymentModeId: p.paymentModeId || null,
            walletId: p.walletId || null,
            reference: p.reference || null,
          })),
        })

        // Apply new wallet changes
        // HMO: increment (accumulate AR)
        // GL: decrement (consume GL amount)
        for (const p of payments) {
          if (p.method === 'GL' && p.walletId) {
            await tx.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { decrement: Number(p.amount) } },
            })
          } else if (p.method === 'HMO' && p.walletId) {
            await tx.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { increment: Number(p.amount) } },
            })
          }
        }
      }

      return tx.order.update({
        where: { id },
        data,
        include: { items: true, payments: true, referrer: true },
      })
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'order',
        entityId: id,
        details: {
          orderNumber: existing.orderNumber,
          updatedFields: Object.keys(body),
          itemsReplaced: !!items,
          paymentsReplaced: !!payments,
        },
      },
    })

    // Mirror the (possibly newly-set) referrer into ReferredPatient so the
    // Referral section reflects it.
    await linkReferredPatientFromOrder(prisma, {
      referrerId: updated.referrerId,
      patientId: updated.patientId,
      patientName: updated.patientName,
      createdById: session.user.id,
    })

    // Keep the GL in sync: reopening posted a POS_ORDER_REVERSAL that cancels the
    // original forward JE, so completing the order again must post a fresh forward
    // entry — postOrderJournal's forwardCount>reversalCount check makes this call
    // idempotent, so it runs on every re-complete, not just item/payment edits
    // (a name/date/discount-only edit still needs its revenue re-posted).
    // The old forward JE must NOT be deleted: it pairs with the reopen reversal,
    // and deleting it leaves that reversal dangling — the fresh forward then nets
    // to zero against it and the sale silently vanishes from the books.
    if (updated.status !== 'VOIDED') {
      try { await postOrderJournal(prisma, id, session.user.id) } catch (e) { console.error('Order re-post after edit failed:', e) }
    }

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
