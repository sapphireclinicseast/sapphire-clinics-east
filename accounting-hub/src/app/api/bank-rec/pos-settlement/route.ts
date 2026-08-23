import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// POS settlement matching: a bank deposit settles a group of POS order
// payments — a day's cash count deposited 1-3 days later, or a card/GCash/
// PayMaya batch credited net of the payment mode's deductions.
//
//   GET  ?txnId=            → payment modes (those lodging into this bank
//                             account first) + suggested date window
//   GET  ?txnId=&modeId=&from=&to=
//                           → that mode's order payments in the window, each
//                             with its net-of-deductions value and whether it
//                             is already settled by another deposit
//   POST { txnId, modeId, orderPaymentIds } → create the batch, post the bank
//                             line as POS_SETTLEMENT, and — when the mode's
//                             orders book to a clearing account rather than
//                             straight into this bank account — post the
//                             reclassifying entry (Dr Bank / Cr Clearing) that
//                             moves the settled net out of clearing. Deduction
//                             fees (MDR/CWT) were already expensed at order
//                             time (post-order.ts), so this JE only ever
//                             carries the two cash-movement legs.
//
// Net per payment: gross − Σ(percentage deductions × gross) − Σ(fixed).

import { netOfDeductions as netOf } from '@/lib/pos-settlement-shapes'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const txnId = sp.get('txnId') || ''
  if (!txnId) return NextResponse.json({ error: 'txnId is required' }, { status: 400 })
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } })
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const modeId = sp.get('modeId')
  if (!modeId) {
    // Mode list: every active mode, flagged when its NET lodges straight into
    // the account being reconciled (card/GCash/PayMaya settlements). Cash modes
    // lodge into a cash-on-hand account and get deposited later, so they are
    // offered too — just unflagged.
    const modes = await prisma.paymentMode.findMany({
      where: { isActive: true },
      select: { id: true, name: true, paymentMethod: true, branch: true, accountId: true, settlementBankAccountId: true, deductions: { select: { name: true, rate: true, valueType: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({
      modes: modes.map(m => ({
        id: m.id, name: m.name, method: m.paymentMethod, branch: m.branch,
        settlesHere: m.accountId === txn.bankAccountId || m.settlementBankAccountId === txn.bankAccountId,
        deductions: m.deductions.map(d => `${d.name} ${d.valueType === 'FIXED' ? '₱' : ''}${Number(d.rate)}${d.valueType === 'FIXED' ? '' : '%'}`),
      })),
      // POS money reaches the bank 0-3 days after the sale.
      suggestedFrom: new Date(+new Date(txn.date) - 3 * 86_400_000).toISOString().slice(0, 10),
      suggestedTo: new Date(txn.date).toISOString().slice(0, 10),
    })
  }

  const mode = await prisma.paymentMode.findUnique({ where: { id: modeId }, include: { deductions: true } })
  if (!mode) return NextResponse.json({ error: 'Payment mode not found' }, { status: 404 })
  const fromStr = sp.get('from') || ''
  const toStr = sp.get('to') || ''
  const lo = /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? new Date(fromStr + 'T00:00:00.000Z') : new Date(+new Date(txn.date) - 3 * 86_400_000)
  const hi = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? new Date(toStr + 'T00:00:00.000Z') : new Date(txn.date)
  hi.setUTCDate(hi.getUTCDate() + 1)

  const payments = await prisma.orderPayment.findMany({
    where: {
      paymentModeId: modeId,
      order: { status: 'COMPLETED', transactionDate: { gte: lo, lt: hi } },
    },
    select: {
      id: true, amount: true,
      order: { select: { orderNumber: true, patientName: true, buyerName: true, transactionDate: true, branch: true } },
    },
    orderBy: { order: { transactionDate: 'asc' } },
  })
  const settled = await prisma.posSettlementPayment.findMany({
    where: { orderPaymentId: { in: payments.map(p => p.id) } },
    select: { orderPaymentId: true, batch: { select: { label: true } } },
  })
  const settledBy = new Map(settled.map(s => [s.orderPaymentId, s.batch.label]))

  return NextResponse.json({
    mode: { id: mode.id, name: mode.name },
    payments: payments.map(p => ({
      id: p.id,
      date: p.order.transactionDate.toISOString().slice(0, 10),
      orderNumber: p.order.orderNumber,
      name: p.order.patientName || p.order.buyerName || '',
      branch: p.order.branch,
      gross: Number(p.amount),
      net: netOf(Number(p.amount), mode.deductions, p.order.transactionDate),
      settledBy: settledBy.get(p.id) || null,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { txnId, modeId, orderPaymentIds } = await req.json()
    if (!txnId || !Array.isArray(orderPaymentIds) || orderPaymentIds.length === 0) {
      return NextResponse.json({ error: 'txnId and orderPaymentIds are required' }, { status: 400 })
    }
    const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } })
    if (!txn) return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 })
    if (txn.status !== 'PENDING') return NextResponse.json({ error: 'Bank transaction is not pending' }, { status: 400 })
    if (Number(txn.received) <= 0) return NextResponse.json({ error: 'POS settlements match money-in lines only' }, { status: 400 })

    const mode = modeId ? await prisma.paymentMode.findUnique({ where: { id: modeId }, include: { deductions: true } }) : null

    const payments = await prisma.orderPayment.findMany({
      where: { id: { in: orderPaymentIds } },
      select: { id: true, amount: true, order: { select: { transactionDate: true } } },
    })
    if (payments.length !== orderPaymentIds.length) {
      return NextResponse.json({ error: 'Some order payments no longer exist' }, { status: 400 })
    }
    const already = await prisma.posSettlementPayment.findMany({ where: { orderPaymentId: { in: orderPaymentIds } }, select: { orderPaymentId: true } })
    if (already.length) return NextResponse.json({ error: `${already.length} of the selected payments are already settled by another deposit` }, { status: 409 })

    const gross = payments.reduce((s, p) => s + Number(p.amount), 0)
    const net = mode ? payments.reduce((s, p) => s + netOf(Number(p.amount), mode.deductions, p.order.transactionDate), 0) : gross
    const dates = [...new Set(payments.map(p => p.order.transactionDate.toISOString().slice(0, 10)))].sort()
    const dateLabel = dates.length === 1 ? dates[0] : `${dates[0]}…${dates[dates.length - 1]}`
    const label = `POS settlement · ${mode?.name || 'POS'} · ${dateLabel} · ${payments.length} payment(s) · net ₱${net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

    // If this mode's orders book to a clearing account (e.g. 1170 Undeposited
    // Funds) rather than straight into the bank the deposit landed in, the
    // settled net is still sitting in clearing — reclassify it into the real
    // bank account now that the deposit confirms it arrived. Modes still
    // booking directly to the settling bank account (accountId === the bank
    // being reconciled) need no reclass — the money was already there.
    const netRounded = Math.round(net * 100) / 100
    const clearingAccountId = mode?.accountId && mode.accountId !== txn.bankAccountId ? mode.accountId : null
    const needsReclass = Boolean(clearingAccountId) && netRounded > 0

    const batch = await prisma.$transaction(async (tx) => {
      const b = await tx.posSettlementBatch.create({
        data: {
          bankTransactionId: txn.id, paymentModeId: modeId || null, label,
          grossTotal: Math.round(gross * 100) / 100, netTotal: netRounded,
          createdById: session.user!.id ?? null,
          payments: { create: payments.map(p => ({ orderPaymentId: p.id, amount: Number(p.amount) })) },
        },
      })
      await tx.bankTransaction.update({
        where: { id: txn.id },
        data: { status: 'POSTED', matchType: 'POS_SETTLEMENT', matchId: b.id, matchLabel: label, categoryAccountId: null },
      })
      if (needsReclass && clearingAccountId) {
        await postJournalEntry(tx, {
          entryDate: txn.date,
          description: `POS settlement reclass — ${label}`,
          referenceType: 'POS_SETTLEMENT_RECLASS',
          referenceId: b.id,
          branch: 'ALL',
          createdById: session.user!.id as string,
          lines: [
            { accountId: txn.bankAccountId, debit: netRounded, description: 'Settled into bank' },
            { accountId: clearingAccountId, credit: netRounded, description: `Cleared from ${mode?.name || 'clearing'}` },
          ],
        })
      }
      return b
    })
    return NextResponse.json({ success: true, batchId: batch.id, label, gross, net, reclassPosted: needsReclass })
  } catch (e) {
    console.error('POS settlement error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
