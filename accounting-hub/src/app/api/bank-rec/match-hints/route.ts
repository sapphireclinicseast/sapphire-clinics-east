import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Which bank lines look like they correspond to something already recorded in
// the Hub, so the grid can flag them instead of the user opening every row.
//
// Money in is the interesting case. A card sale does not reach the bank as the
// amount that was charged: the mode's deductions (merchant discount, withholding)
// come off first, and it lands a few days later. PaymentMode already carries both
// the bank account the net is lodged to and the deduction rules, so the expected
// deposit is calculable rather than guessed — and both shapes are checked, one
// deposit per sale and a day's takings settled together.
const WINDOW_DAYS = 5
const TOLERANCE = 1.0   // pesos; absorbs per-item rounding inside a settlement

type Hint = { kind: string; label: string; amount: number; date: string; n: number }

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const within = (a: Date, b: Date) => Math.abs(+a - +b) <= WINDOW_DAYS * 86400000
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const bankAccountId = sp.get('bankAccountId') || ''
  const status = sp.get('status') || 'PENDING'
  if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })

  const txns = await prisma.bankTransaction.findMany({
    where: { bankAccountId, status },
    select: { id: true, date: true, spent: true, received: true },
  })
  if (txns.length === 0) return NextResponse.json({ hints: {} })

  const times = txns.map(t => +t.date)
  const lo = new Date(Math.min(...times) - WINDOW_DAYS * 86400000)
  const hi = new Date(Math.max(...times) + WINDOW_DAYS * 86400000)

  // ── money in: settlements expected to land in this bank account ───────────
  const modes = await prisma.paymentMode.findMany({
    where: { accountId: bankAccountId },
    select: { id: true, name: true, deductions: { select: { rate: true, valueType: true } } },
  })
  const netOf = (modeId: string, gross: number) => {
    const m = modes.find(x => x.id === modeId)
    if (!m) return gross
    const cut = m.deductions.reduce((s, d) =>
      s + (d.valueType === 'PERCENTAGE' ? gross * Number(d.rate) / 100 : Number(d.rate)), 0)
    return Math.round((gross - cut) * 100) / 100
  }

  const singles: { date: Date; label: string; amount: number }[] = []
  const batches = new Map<string, { date: Date; label: string; amount: number; n: number }>()
  if (modes.length) {
    const payments = await prisma.orderPayment.findMany({
      where: {
        paymentModeId: { in: modes.map(m => m.id) },
        order: { status: 'COMPLETED', transactionDate: { gte: lo, lte: hi } },
      },
      select: {
        amount: true, paymentModeId: true,
        order: { select: { orderNumber: true, transactionDate: true, patientName: true } },
      },
    })
    for (const p of payments) {
      if (!p.order || !p.paymentModeId) continue
      const net = netOf(p.paymentModeId, Number(p.amount))
      const mode = modes.find(m => m.id === p.paymentModeId)!
      singles.push({
        date: p.order.transactionDate, amount: net,
        label: `Order #${p.order.orderNumber}${p.order.patientName ? ` · ${p.order.patientName}` : ''} · ${mode.name}`,
      })
      // a day's takings on one mode, settled as a single deposit
      const k = `${dayKey(p.order.transactionDate)}|${p.paymentModeId}`
      const cur = batches.get(k)
      if (cur) { cur.amount = Math.round((cur.amount + net) * 100) / 100; cur.n++ }
      else batches.set(k, { date: p.order.transactionDate, label: mode.name, amount: net, n: 1 })
    }
  }

  // ── money out: things the Hub already knows were paid ─────────────────────
  const [rfps, transfers] = await Promise.all([
    prisma.reimbursementReport.findMany({
      where: { status: 'PAID', paidAt: { gte: lo, lte: hi } },
      select: { refNumber: true, grossTotal: true, paidAt: true },
    }),
    prisma.fundTransfer.findMany({
      where: { date: { gte: lo, lte: hi }, OR: [{ fromAccountId: bankAccountId }, { toAccountId: bankAccountId }] },
      select: { refNumber: true, amount: true, date: true, fromAccountId: true },
    }),
  ])

  const hints: Record<string, Hint> = {}
  for (const t of txns) {
    const spent = Number(t.spent), received = Number(t.received)
    const out = spent > 0
    const amount = out ? spent : received

    const transfer = transfers.find(f => within(f.date, t.date) && close(Number(f.amount), amount)
      && (out ? f.fromAccountId === bankAccountId : f.fromAccountId !== bankAccountId))
    if (transfer) {
      hints[t.id] = { kind: 'Fund transfer', label: `${transfer.refNumber} · Fund Transfer`, amount: Number(transfer.amount), date: dayKey(transfer.date), n: 1 }
      continue
    }

    if (out) {
      const rfp = rfps.find(r => r.paidAt && within(r.paidAt, t.date) && close(Number(r.grossTotal), amount))
      if (rfp) hints[t.id] = { kind: 'Paid RFP', label: `${rfp.refNumber} · RFP`, amount: Number(rfp.grossTotal), date: dayKey(rfp.paidAt!), n: 1 }
      continue
    }

    // One sale settling on its own reads more clearly than a day's total, so it wins.
    const single = singles.find(s => within(s.date, t.date) && close(s.amount, received))
    if (single) {
      hints[t.id] = { kind: 'Card/e-wallet sale', label: single.label, amount: single.amount, date: dayKey(single.date), n: 1 }
      continue
    }
    const batch = [...batches.values()].find(b => b.n > 1 && within(b.date, t.date) && close(b.amount, received))
    if (batch) {
      hints[t.id] = { kind: 'Day settlement', label: `${batch.n} × ${batch.label} on ${dayKey(batch.date)}`, amount: batch.amount, date: dayKey(batch.date), n: batch.n }
    }
  }

  return NextResponse.json({ hints, windowDays: WINDOW_DAYS })
}
