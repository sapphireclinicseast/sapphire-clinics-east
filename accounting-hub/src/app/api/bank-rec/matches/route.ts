import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WINDOW_DAYS = 7
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

// GET ?txnId=... → suggested matches (already-recorded Hub records) for a bank line.
// Money-out (spent) → Fund Transfers out, paid RFPs. Money-in (received) → Fund Transfers in, sales/AR.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const txnId = new URL(req.url).searchParams.get('txnId') || ''
  if (!txnId) return NextResponse.json({ error: 'txnId is required' }, { status: 400 })
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } })
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isSpent = Number(txn.spent) > 0
  const amount = isSpent ? Number(txn.spent) : Number(txn.received)
  const lo = new Date(txn.date); lo.setUTCDate(lo.getUTCDate() - WINDOW_DAYS)
  const hi = new Date(txn.date); hi.setUTCDate(hi.getUTCDate() + WINDOW_DAYS + 1)
  // Cut-off: bank's beginning-balance start date (only consider entries on/after).
  const beg = await prisma.beginningBalance.findFirst({ where: { accountId: txn.bankAccountId, startDate: { not: null } }, orderBy: { periodYear: 'desc' } })
  const cutoff = beg?.startDate ? new Date(beg.startDate) : null
  const gte = (d: Date) => (!cutoff || d >= cutoff)

  const out: { type: string; id: string; label: string; date: string; amount: number }[] = []

  // Fund transfers (direction-aware on the bank account)
  const transfers = await prisma.fundTransfer.findMany({
    where: { date: { gte: lo, lt: hi }, ...(isSpent ? { fromAccountId: txn.bankAccountId } : { toAccountId: txn.bankAccountId }) },
  })
  for (const t of transfers) if (near(Number(t.amount), amount) && gte(t.date)) out.push({ type: 'FUND_TRANSFER', id: t.id, label: `${t.refNumber} · Fund Transfer`, date: t.date.toISOString().slice(0, 10), amount: Number(t.amount) })

  if (isSpent) {
    // Paid RFPs (petty cash / expense / tax) — money out.
    const rfps = await prisma.reimbursementReport.findMany({ where: { status: 'PAID', paidAt: { gte: lo, lt: hi } } })
    for (const r of rfps) if (r.paidAt && near(Number(r.grossTotal), amount) && gte(r.paidAt)) out.push({ type: 'RFP', id: r.id, label: `${r.refNumber} · RFP`, date: r.paidAt.toISOString().slice(0, 10), amount: Number(r.grossTotal) })
  } else {
    // Sales / AR receipts — money in.
    const orders = await prisma.order.findMany({ where: { status: 'COMPLETED', transactionDate: { gte: lo, lt: hi } }, select: { id: true, orderNumber: true, netAmount: true, transactionDate: true, patientName: true } })
    for (const o of orders) if (near(Number(o.netAmount), amount) && gte(o.transactionDate)) out.push({ type: 'ORDER', id: o.id, label: `Order #${o.orderNumber}${o.patientName ? ` · ${o.patientName}` : ''}`, date: o.transactionDate.toISOString().slice(0, 10), amount: Number(o.netAmount) })
  }

  // Closest dates first.
  out.sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
  return NextResponse.json({ matches: out.slice(0, 20) })
}
