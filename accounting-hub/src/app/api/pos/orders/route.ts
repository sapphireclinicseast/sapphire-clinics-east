import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'
import { consumeFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import { postJournalEntry, UnbalancedJournalEntryError } from '@/lib/accounting/posting'
import { postOrderJournal } from '@/lib/accounting/post-order'

/* ── Free-sample JE: DR 8120 Marketing, CR Inventory ──────────────
   Tier 3: routed through the central posting service so any future
   imbalance (e.g. missing inventory account) raises an error instead
   of silently writing a one-sided entry. */
async function createFreeSampleJournalEntry(
  createdById: string,
  branch: string,
  transactionDate: string,
  orderItemId: string,
  itemName: string,
  fifoAmount: number,
) {
  if (fifoAmount <= 0) return
  const marketingAcct = await prisma.account.findFirst({ where: { accountNumber: '8120' } })
  if (!marketingAcct) {
    console.warn('[FREE_SAMPLE] Account 8120 not found — skipping marketing journal entry')
    return
  }
  const inventoryAcct = await prisma.account.findFirst({
    where: {
      accountType: 'ASSET',
      OR: [
        { accountTitle: { contains: 'inventory', mode: 'insensitive' } },
        { accountTitle: { contains: 'merchandise', mode: 'insensitive' } },
        { accountNumber: { startsWith: '13' } },
      ],
    },
  })
  if (!inventoryAcct) {
    // Without a credit side this would be unbalanced. Refuse rather than half-post.
    console.warn('[FREE_SAMPLE] No inventory ASSET account found — skipping JE to keep books balanced')
    return
  }

  try {
    await postJournalEntry(prisma, {
      entryDate: new Date(`${transactionDate}T08:00:00+08:00`),
      description: `Free sample (marketing) — ${itemName}`,
      referenceType: 'FREE_SAMPLE',
      referenceId: orderItemId,
      branch,
      createdById,
      lines: [
        { accountId: marketingAcct.id, debit: fifoAmount, description: `Free sample — ${itemName}` },
        { accountId: inventoryAcct.id, credit: fifoAmount, description: `Free sample inventory out — ${itemName}` },
      ],
    })
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[FREE_SAMPLE] refused unbalanced JE:', e.message)
      return
    }
    throw e
  }
}

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const branch = searchParams.get('branch')
  const orderType = searchParams.get('orderType')
  const status = searchParams.get('status')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const search = searchParams.get('search')?.trim() || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (branch) where.branch = branch
  if (orderType) where.orderType = orderType
  if (status) where.status = status

  if (dateFrom || dateTo) {
    where.transactionDate = {}
    if (dateFrom) where.transactionDate.gte = new Date(`${dateFrom}T00:00:00+08:00`)
    if (dateTo) where.transactionDate.lte = new Date(`${dateTo}T23:59:59.999+08:00`)
  }

  if (search) {
    const num = parseInt(search, 10)
    where.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { clinicianName: { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
      { items: { some: { name: { contains: search, mode: 'insensitive' } } } },
      ...(!isNaN(num) ? [{ orderNumber: num }] : []),
    ]
  }

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          items: {
            include: {
              service: { select: { id: true, name: true, department: true, revenueType: true } },
            },
          },
          payments: true,
          arPaymentItems: { select: { paymentId: true } },
          referrer: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json(paginatedResult(orders, total, params))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      orderType,
      branch,
      patientId,
      patientName,
      clinicianName,
      transactionDate,
      items,
      payments,
      discountType = 'NONE',
      discountAmount = 0,
      discountLabel,
      revenueType = 'EARNED',
      queueItemId,
      referrerId,
      notes,
      issuedOfficialInvoice,
      salesInvoiceNumber,
      referenceNumber,
    } = body

    if (!orderType || !branch || !items?.length) {
      return NextResponse.json(
        { error: 'orderType, branch, and items are required' },
        { status: 400 }
      )
    }

    // Calculate subtotal from items
    const subtotal = items.reduce(
      (sum: number, item: { lineTotal: number }) => sum + Number(item.lineTotal),
      0
    )

    const netAmount = subtotal - Number(discountAmount)

    // Payments required only when there's something to pay (e.g., 100% discount → net 0 is allowed with no payments)
    if (netAmount > 0 && !payments?.length) {
      return NextResponse.json(
        { error: 'payments are required when net amount is greater than 0' },
        { status: 400 }
      )
    }

    const order = await prisma.order.create({
      data: {
        orderType,
        branch,
        patientId: patientId || null,
        patientName: patientName || null,
        clinicianName: clinicianName || null,
        transactionDate: new Date(`${transactionDate}T08:00:00+08:00`),
        subtotal,
        discountType,
        discountAmount: Number(discountAmount),
        discountLabel: discountLabel || null,
        netAmount,
        revenueType,
        queueItemId: queueItemId || null,
        referrerId: referrerId || null,
        notes: notes || null,
        issuedOfficialInvoice: issuedOfficialInvoice || false,
        salesInvoiceNumber: (issuedOfficialInvoice && salesInvoiceNumber) ? salesInvoiceNumber.trim() : null,
        referenceNumber: referenceNumber?.trim() || null,
        createdById: session.user.id,
        items: {
          createMany: {
            data: items.map((item: {
              serviceId?: string
              inventoryItemId?: string
              name: string
              quantity: number
              unitPrice: number
              lineTotal: number
              isFreeSample?: boolean
              variantId?: string
              variantLabel?: string
            }) => ({
              serviceId: item.serviceId || null,
              inventoryItemId: item.inventoryItemId || null,
              name: item.name,
              quantity: item.quantity || 1,
              unitPrice: Number(item.unitPrice),
              lineTotal: Number(item.lineTotal),
              isFreeSample: !!item.isFreeSample,
              variantId: item.variantId || null,
              variantLabel: item.variantLabel || null,
            })),
          },
        },
        payments: {
          createMany: {
            data: payments.map((p: {
              method: string
              amount: number
              walletId?: string
              reference?: string
              paymentModeId?: string
            }) => ({
              method: p.method,
              amount: Number(p.amount),
              walletId: p.walletId || null,
              reference: p.reference || null,
              paymentModeId: p.paymentModeId || null,
            })),
          },
        },
      },
      include: {
        items: true,
        payments: true,
        referrer: true,
      },
    })

    // Deduct inventory for product orders using FIFO lot consumption
    if (orderType === 'PRODUCT') {
      for (const item of items) {
        if (!item.inventoryItemId) continue
        const invItem = await prisma.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          include: { bundleComponents: true },
        })
        if (!invItem) continue
        const orderQty = item.quantity || 1
        const isFreeSample = !!item.isFreeSample

        // Find the created OrderItem to record COGS / free sample
        const orderItem = order.items.find(oi => oi.inventoryItemId === item.inventoryItemId)

        if (invItem.isBundle && invItem.bundleComponents.length > 0) {
          // Bundle: deduct each component using FIFO
          let bundleCogs = 0
          for (const bc of invItem.bundleComponents) {
            const consumeQty = bc.quantity * orderQty
            const fifo = await consumeFifoLots(prisma, bc.componentId, consumeQty)
            bundleCogs += fifo.totalCost
            await prisma.inventoryItem.update({
              where: { id: bc.componentId },
              data: { quantity: { decrement: consumeQty } },
            })
            // Update weighted-average unitCost on the component
            const newCost = await recalcWeightedUnitCost(prisma, bc.componentId)
            if (newCost > 0) {
              await prisma.inventoryItem.update({ where: { id: bc.componentId }, data: { unitCost: newCost } })
            }
          }
          if (orderItem) {
            if (isFreeSample) {
              // Free sample: FIFO cost → 8120 Marketing Expense journal entry, cogsCost = 0 (not COGS)
              await createFreeSampleJournalEntry(session.user.id, branch, transactionDate, orderItem.id, item.name, bundleCogs)
              await prisma.orderItem.update({ where: { id: orderItem.id }, data: { cogsCost: 0 } })
            } else {
              await prisma.orderItem.update({ where: { id: orderItem.id }, data: { cogsCost: bundleCogs } })
            }
          }
        } else {
          // Regular item: FIFO consumption
          const fifo = await consumeFifoLots(prisma, item.inventoryItemId, orderQty)
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { quantity: { decrement: orderQty } },
          })
          // If a specific variant was selected, deduct from variant stock too
          if (item.variantId) {
            await prisma.inventoryVariant.update({
              where: { id: item.variantId },
              data: { quantity: { decrement: orderQty } },
            })
          }
          if (orderItem) {
            if (isFreeSample) {
              // Free sample: FIFO cost → 8120 Marketing Expense journal entry, cogsCost = 0 (not COGS)
              await createFreeSampleJournalEntry(session.user.id, branch, transactionDate, orderItem.id, item.name, fifo.totalCost)
              await prisma.orderItem.update({ where: { id: orderItem.id }, data: { cogsCost: 0 } })
            } else {
              await prisma.orderItem.update({ where: { id: orderItem.id }, data: { cogsCost: fifo.totalCost } })
            }
          }
          // Update weighted-average unitCost
          const newCost = await recalcWeightedUnitCost(prisma, item.inventoryItemId)
          if (newCost > 0) {
            await prisma.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { unitCost: newCost } })
          }
        }
      }
    }

    // HMO: increment balance (accumulate charges as AR)
    // GL: decrement balance (use up the pre-set GL amount)
    const RECEIVABLE_METHODS = ['HMO', 'GL']
    for (const p of payments) {
      if (RECEIVABLE_METHODS.includes(p.method) && p.walletId) {
        try {
          if (p.method === 'GL') {
            // GL: deduct from the pre-set GL amount (consuming the guarantee letter)
            await prisma.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { decrement: Number(p.amount) } },
            })
          } else {
            // HMO: accumulate charges as accounts receivable
            await prisma.digitalWallet.update({
              where: { id: p.walletId },
              data: { balance: { increment: Number(p.amount) } },
            })
          }
        } catch (walletErr) {
          console.error(`[WALLET] Failed to update wallet ${p.walletId}:`, walletErr)
        }
      }
    }

    // Tier 3 Step 3: Auto-post the order to the General Ledger.
    // Gated by ENABLE_GL_POSTING=true. Non-fatal — order succeeds even if the
    // JE can't be built (e.g. accounts not yet configured); we log and move on.
    let postingResult: Awaited<ReturnType<typeof postOrderJournal>> | null = null
    try {
      postingResult = await postOrderJournal(prisma, order.id, session.user.id)
      if (postingResult.posted) {
        console.log(`[GL] Posted JE ${postingResult.journalEntryId} for order ${order.orderNumber}`)
      } else if (process.env.ENABLE_GL_POSTING === 'true') {
        console.warn(`[GL] Skipped posting for order ${order.orderNumber}: ${postingResult.reason}`)
      }
    } catch (postErr) {
      console.error(`[GL] Posting threw for order ${order.orderNumber}:`, postErr)
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'order',
        entityId: order.id,
        details: {
          orderNumber: order.orderNumber,
          orderType,
          branch,
          netAmount,
          itemCount: items.length,
          glPosted: postingResult?.posted ?? false,
          glReason: postingResult?.posted ? undefined : postingResult?.reason,
        },
      },
    })

    return NextResponse.json(order, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
