import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Which POS order payments a bank deposit has actually confirmed.
//
// A payment counts as settled when a PosSettlementPayment row ties it to a
// PosSettlementBatch — the same link the bank-rec Match modal writes when a
// BDO cash deposit or an AUB card/e-wallet settlement is matched. That link is
// the single definition of "the money arrived"; Sales Checking reads it rather
// than keeping a parallel notion of cleared.
//
// Only payments made through a configured PaymentMode are in scope: those are
// the ones that lodge into a bank or cash account and so are expected to turn
// up as a deposit. HMO and wallet payments carry no mode — they settle through
// AR and a wallet balance, not through a bank line.
//
// GET ?branch=&dateFrom=&dateTo=
//   → settled:  one row per payment a deposit has confirmed
//   → untagged: one row per payment no deposit has been identified for. This is
//     the point of the exercise — it surfaces revenue that may never have
//     arrived, rather than money merely waiting to be reconciled.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const dateFrom = sp.get('dateFrom') || ''
  const dateTo = sp.get('dateTo') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: 'dateFrom and dateTo (YYYY-MM-DD) are required' }, { status: 400 })
  }
  // Same window arithmetic as /api/pos/orders — Manila day boundaries, filtered
  // on transactionDate — so this list and the grid Sales Checking already shows
  // cover exactly the same orders.
  const lo = new Date(`${dateFrom}T00:00:00+08:00`)
  const hi = new Date(`${dateTo}T23:59:59.999+08:00`)

  const payments = await prisma.orderPayment.findMany({
    where: {
      paymentModeId: { not: null },
      order: {
        status: 'COMPLETED',
        transactionDate: { gte: lo, lte: hi },
        ...(branch ? { branch } : {}),
      },
    },
    select: {
      id: true, amount: true, method: true,
      paymentMode: { select: { name: true } },
      order: { select: { orderNumber: true, patientName: true, buyerName: true, transactionDate: true, paymentDate: true, branch: true } },
    },
    orderBy: { order: { transactionDate: 'asc' } },
  })
  if (!payments.length) return NextResponse.json({ settled: [], untagged: [] })

  const links = await prisma.posSettlementPayment.findMany({
    where: { orderPaymentId: { in: payments.map(p => p.id) } },
    select: { orderPaymentId: true, batch: { select: { id: true, label: true, bankTransactionId: true } } },
  })
  // PosSettlementBatch points at its bank line by id without a Prisma relation,
  // so the deposit date is a second lookup rather than an include.
  const bankLines = links.length
    ? await prisma.bankTransaction.findMany({
        where: { id: { in: [...new Set(links.map(l => l.batch.bankTransactionId))] } },
        select: { id: true, date: true, received: true },
      })
    : []
  const bankById = new Map(bankLines.map(b => [b.id, b]))
  const linkById = new Map(links.map(l => [l.orderPaymentId, l]))

  // Bucket by the day Sales Checking files the sale under: money collected
  // later (Unpaid → paid) reconciles on its payment date, not the session date.
  const day = (p: (typeof payments)[number]) =>
    (p.order.paymentDate ?? p.order.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

  const row = (p: (typeof payments)[number]) => ({
    orderPaymentId: p.id,
    date: day(p),
    orderNumber: p.order.orderNumber,
    name: p.order.patientName || p.order.buyerName || '',
    branch: p.order.branch,
    method: p.method as string,
    modeName: p.paymentMode?.name ?? '',
    amount: Number(p.amount),
  })

  const settled: unknown[] = []
  const untagged: unknown[] = []
  for (const p of payments) {
    const l = linkById.get(p.id)
    if (!l) { untagged.push(row(p)); continue }
    const bank = bankById.get(l.batch.bankTransactionId)
    settled.push({
      ...row(p),
      batchId: l.batch.id,
      label: l.batch.label,
      bankDate: bank ? bank.date.toISOString().slice(0, 10) : null,
      bankAmount: bank ? Number(bank.received) : null,
    })
  }
  return NextResponse.json({ settled, untagged })
}
