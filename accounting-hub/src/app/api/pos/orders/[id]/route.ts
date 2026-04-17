import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { restoreFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

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

    // Handle status change actions (reopen / void)
    if (body.action === 'reopen' || body.action === 'void') {
      const newStatus = body.action === 'reopen' ? 'REOPENED' : 'VOIDED'

      const updated = await prisma.order.update({
        where: { id },
        data: { status: newStatus },
        include: { items: true, payments: true },
      })

      // When voiding, reverse ALL wallet changes
      if (body.action === 'void') {
        for (const p of updated.payments) {
          if (!p.walletId || Number(p.amount) <= 0) continue

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
          } else if (p.method === 'PACKAGE' && p.reference?.startsWith('PKG:')) {
            // Package: session was incremented → decrement to restore
            const pkgId = p.reference.replace('PKG:', '')
            if (pkgId) {
              const pkg = await prisma.walletPackage.findUnique({ where: { id: pkgId } })
              if (pkg && pkg.usedSessions > 0) {
                await prisma.walletPackage.update({
                  where: { id: pkgId },
                  data: { usedSessions: { decrement: 1 } },
                })
                await prisma.walletLog.create({
                  data: {
                    walletId: p.walletId,
                    packageId: pkgId,
                    action: 'VOID_REVERSAL',
                    sessions: -1,
                    description: `Reversed 1 session (order voided)`,
                    createdById: session.user.id,
                  },
                })
              }
            }
          } else if (['VIP_CARD', 'PREPAID_CARD', 'DOWNPAYMENT'].includes(p.method)) {
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

    // Use a transaction to replace items/payments atomically
    const updated = await prisma.$transaction(async (tx) => {
      // Delete and recreate items if provided
      if (items?.length) {
        await tx.orderItem.deleteMany({ where: { orderId: id } })
        await tx.orderItem.createMany({
          data: items.map((item: {
            serviceId?: string
            inventoryItemId?: string
            name: string
            quantity: number
            unitPrice: number
            lineTotal: number
          }) => ({
            orderId: id,
            serviceId: item.serviceId || null,
            inventoryItemId: item.inventoryItemId || null,
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.lineTotal),
          })),
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
            walletId?: string
            reference?: string
          }) => ({
            orderId: id,
            method: p.method,
            amount: Number(p.amount),
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

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
