import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'
import { consumeFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import { postJournalEntry, UnbalancedJournalEntryError } from '@/lib/accounting/posting'
import { postOrderJournal } from '@/lib/accounting/post-order'
import { linkReferredPatientFromOrder } from '@/lib/referral-link'

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

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

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
      platform,
      unpaid,
      soldTo,
      isBusiness, businessName, businessTin, issuedSalesInvoice,
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
    // Refunds (returned portion) reduce the net collected: net = gross − discount − refunds.
    const totalRefund = items.reduce(
      (sum: number, item: { refundAmount?: number }) => sum + (Number(item.refundAmount) || 0),
      0
    )

    const netAmount = subtotal - Number(discountAmount) - totalRefund

    // Receivable sale (charge to an outside customer, e.g. Sandbox Clark): no cash
    // now — the order is saved Unpaid and an AR → Others receivable is created.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const receivableLines = (payments || []).filter((p: any) => p.method === 'RECEIVABLE')
    const hasReceivable = receivableLines.length > 0
    if (hasReceivable && !String(soldTo || '').trim()) {
      return NextResponse.json({ error: 'soldTo is required for Receivable payments' }, { status: 400 })
    }
    // A company sale is billed to the company, so the name is what the receivable
    // is raised against — without it there is nobody to collect from.
    if (hasReceivable && isBusiness && !String(businessName || '').trim()) {
      return NextResponse.json({ error: 'businessName is required when the buyer is a business' }, { status: 400 })
    }
    // An official sales invoice to a company must carry the buyer's TIN.
    if (hasReceivable && isBusiness && issuedSalesInvoice && !String(businessTin || '').trim()) {
      return NextResponse.json({ error: 'businessTin is required for an official sales invoice' }, { status: 400 })
    }

    // Unpaid: the session is recorded now (correct transactionDate) but no cash is
    // collected yet — payment (and its collection date) come later via recordPayment.
    const isUnpaid = !!unpaid || hasReceivable
    // Payments required only when there's something to pay (e.g., 100% discount → net 0
    // is allowed with no payments) and the order isn't explicitly saved as Unpaid.
    if (!isUnpaid && netAmount > 0 && !payments?.length) {
      return NextResponse.json(
        { error: 'payments are required when net amount is greater than 0' },
        { status: 400 }
      )
    }
    const payLines = isUnpaid ? [] : (payments || [])

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
        platform: platform || null,
        queueItemId: queueItemId || null,
        referrerId: referrerId || null,
        notes: notes || null,
        issuedOfficialInvoice: issuedOfficialInvoice || false,
        salesInvoiceNumber: (issuedOfficialInvoice && salesInvoiceNumber) ? salesInvoiceNumber.trim() : null,
        referenceNumber: referenceNumber?.trim() || null,
        paymentStatus: isUnpaid ? 'UNPAID' : 'PAID',
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
              returnedQuantity?: number
              refundAmount?: number
            }) => ({
              serviceId: item.serviceId || null,
              inventoryItemId: item.inventoryItemId || null,
              name: item.name,
              // Preserve an explicit 0 (fully-returned line: gross sale + full refund, no net units)
              quantity: typeof item.quantity === 'number' ? item.quantity : 1,
              unitPrice: Number(item.unitPrice),
              lineTotal: Number(item.lineTotal),
              isFreeSample: !!item.isFreeSample,
              variantId: item.variantId || null,
              variantLabel: item.variantLabel || null,
              returnedQuantity: Math.max(0, Math.round(Number(item.returnedQuantity) || 0)),
              refundAmount: Number(item.refundAmount) || 0,
            })),
          },
        },
        payments: {
          createMany: {
            data: payLines.map((p: {
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

    // Receivable sale → create the AR → Others entry the collections live on.
    if (hasReceivable) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recvTotal = receivableLines.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0) || netAmount
      await prisma.otherReceivable.create({
        data: {
          branch,
          customerName: String(soldTo).trim(),
          isBusiness: !!isBusiness,
          businessName: isBusiness ? String(businessName).trim() : null,
          // The TIN only means anything on an official invoice to a company.
          businessTin: isBusiness && issuedSalesInvoice ? String(businessTin).trim() : null,
          issuedSalesInvoice: !!issuedSalesInvoice,
          orderId: order.id,
          principal: recvTotal,
          totalDue: recvTotal,
          notes: `POS order #${order.orderNumber}`,
          createdById: session.user.id ?? null,
        },
      })
    }

    // Mirror the order's referrer into ReferredPatient so the Referral section
    // (Referred Patients tab + Dashboard) reflects front-desk entries.
    await linkReferredPatientFromOrder(prisma, {
      referrerId,
      patientId,
      patientName,
      createdById: session.user.id,
    })

    // Deduct inventory for product orders using FIFO lot consumption
    if (orderType === 'PRODUCT') {
      for (const item of items) {
        if (!item.inventoryItemId) continue
        // Deduct net of returns: a returned unit was delivered then came back (net 0 stock).
        const netQty = (typeof item.quantity === 'number' ? item.quantity : 1) - (Number(item.returnedQuantity) || 0)
        if (netQty <= 0) continue
        const invItem = await prisma.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          include: { bundleComponents: true },
        })
        if (!invItem) continue
        const orderQty = netQty
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
    for (const p of (payments || [])) {
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
    // Unpaid orders are not posted here — the JE is created when payment is
    // recorded (recordPayment), so cash is recognised on its collection date.
    let postingResult: Awaited<ReturnType<typeof postOrderJournal>> | null = null
    try {
      if (!isUnpaid) postingResult = await postOrderJournal(prisma, order.id, session.user.id)
      if (postingResult?.posted) {
        console.log(`[GL] Posted JE ${postingResult.journalEntryId} for order ${order.orderNumber}`)
      } else if (postingResult && process.env.ENABLE_GL_POSTING === 'true') {
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

    // PatientBooking queue items use a queueItemId prefixed `pbk_<bookingId>`.
    // (Patient booked a session via client.sapphireclinicseast.org, paid the
    // downpayment through PayMongo, and the booking surfaced in the cashier
    // appointment queue.) When the cashier converts one to an order, the
    // existing POS flow auto-creates the downpayment DigitalWallet on the
    // accounting side — no wallet creation lives on the marketing hub. Call
    // back marketing-hub here to flip PatientBooking.accountingRecorded=true
    // so the row drops off the Decking nagging list and the cashier queue.
    // Fire-and-forget — a failed webhook must not block the order from saving.
    if (typeof queueItemId === 'string' && queueItemId.startsWith('pbk_')) {
      const bookingId = queueItemId.slice('pbk_'.length)
      const marketingUrl = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
      const apiKey = process.env.EXTERNAL_API_KEY || ''
      if (apiKey && bookingId) {
        void fetch(`${marketingUrl}/api/decking/bookings/${encodeURIComponent(bookingId)}/mark-accounted-external`, {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
        }).catch(err => {
          console.warn('[orders.POST] patient-booking callback failed:', err)
        })
      }
    }

    // Class-portal tuition queue items use a queueItemId prefixed `clsp_<classPortalPaymentId>`.
    // When the cashier converts one to an order, callback the marketing hub
    // so the class-portal student's payment record flips PENDING → PAID on
    // next hydrate. Fire-and-forget — a failed webhook must not block the
    // order from being saved (the front desk's books are the source of truth).
    if (typeof queueItemId === 'string' && queueItemId.startsWith('clsp_')) {
      const classPortalPaymentId = queueItemId.slice('clsp_'.length)
      const marketingUrl = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
      const apiKey = process.env.EXTERNAL_API_KEY || ''
      if (apiKey && classPortalPaymentId) {
        void fetch(`${marketingUrl}/api/internal/class-portal/frontdesk-payments/${encodeURIComponent(classPortalPaymentId)}`, {
          method: 'PATCH',
          headers: {
            'authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            status: 'CONVERTED',
            notes: `Order ${order.orderNumber ?? order.id} by ${session.user.name ?? session.user.id}`,
          }),
        }).catch(err => {
          console.warn('[orders.POST] class-portal callback failed:', err)
        })
      }
    }

    return NextResponse.json(order, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
