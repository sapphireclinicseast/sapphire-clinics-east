import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// The card/digital methods that settle into a bank account (AUB card/QR etc.).
// CASH and PAYMONGO are excluded — cash goes to BDO deposits, not AUB settlement.
const SETTLEMENT_METHODS = ['CREDIT_CARD', 'DEBIT', 'GCASH', 'PAYMAYA']
const METHOD_LABEL: Record<string, string> = { CREDIT_CARD: 'Credit Card', DEBIT: 'Debit', GCASH: 'GCash', PAYMAYA: 'PayMaya' }

const round2 = (n: number) => Math.round(n * 100) / 100
const manilaDay = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10)

type Review = { method: string; resolved: boolean; remarks: string }

// GET ?branch=&dateFrom=&dateTo= — one row per (day, method) where POS sales under
// a settlement method are NOT fully accounted for by a reconciled bank settlement.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const dateFrom = sp.get('dateFrom') || ''
  const dateTo = sp.get('dateTo') || ''
  if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: 'dateFrom and dateTo (YYYY-MM-DD) are required' }, { status: 400 })
  }

  // Window a day either side so payments dated apart from the sale still land.
  const lo = new Date(dateFrom + 'T00:00:00.000Z'); lo.setUTCDate(lo.getUTCDate() - 1)
  const hi = new Date(dateTo + 'T00:00:00.000Z'); hi.setUTCDate(hi.getUTCDate() + 2)

  const orders = await prisma.order.findMany({
    where: {
      branch,
      status: { notIn: ['VOIDED'] },
      OR: [
        { paymentDate: { gte: lo, lt: hi } },
        { paymentDate: null, transactionDate: { gte: lo, lt: hi } },
      ],
    },
    select: {
      paymentDate: true, transactionDate: true, createdAt: true,
      payments: { select: { id: true, method: true, amount: true } },
    },
  })

  const paymentIds = orders.flatMap(o => o.payments.map(p => p.id))
  // A payment is "settled" when it is linked to a reconciled bank line via a
  // PosSettlementPayment row (written by AUB clearing / the settlement picker).
  const linked = paymentIds.length
    ? new Set((await prisma.posSettlementPayment.findMany({
        where: { orderPaymentId: { in: paymentIds } }, select: { orderPaymentId: true },
      })).map(l => l.orderPaymentId))
    : new Set<string>()

  // Aggregate per Manila day → method: system (recorded) vs settled (linked).
  const byDay = new Map<string, Map<string, { system: number; settled: number }>>()
  for (const o of orders) {
    const day = manilaDay(o.paymentDate || o.transactionDate || o.createdAt)
    if (day < dateFrom || day > dateTo) continue
    for (const p of o.payments) {
      const method = String(p.method)
      if (!SETTLEMENT_METHODS.includes(method)) continue
      let methods = byDay.get(day)
      if (!methods) { methods = new Map(); byDay.set(day, methods) }
      let m = methods.get(method)
      if (!m) { m = { system: 0, settled: 0 }; methods.set(method, m) }
      const amt = Number(p.amount)
      m.system = round2(m.system + amt)
      if (linked.has(p.id)) m.settled = round2(m.settled + amt)
    }
  }

  // Saved resolved/remarks per (date, method).
  const clearings = await prisma.salesDayClearing.findMany({
    where: { branch, date: { gte: dateFrom, lte: dateTo } },
    select: { date: true, settlementReview: true },
  })
  const reviewOf = new Map<string, Review>()
  for (const c of clearings) {
    const arr = Array.isArray(c.settlementReview) ? c.settlementReview as Review[] : []
    for (const r of arr) if (r?.method) reviewOf.set(`${c.date}|${r.method}`, r)
  }

  const items: {
    date: string; method: string; methodLabel: string; amount: number; recorded: number; settled: number
    description: string; resolved: boolean; remarks: string
  }[] = []
  for (const [date, methods] of [...byDay.entries()].sort()) {
    for (const method of SETTLEMENT_METHODS) {
      const m = methods.get(method)
      if (!m || m.system <= 0) continue
      const unsettled = round2(m.system - m.settled)
      if (unsettled <= 0.5) continue // fully accounted for in the bank
      const rv = reviewOf.get(`${date}|${method}`)
      items.push({
        date, method, methodLabel: METHOD_LABEL[method] || method,
        amount: unsettled, recorded: m.system, settled: m.settled,
        description: m.settled > 0
          ? `${METHOD_LABEL[method] || method}: ₱${m.system.toLocaleString('en-PH', { minimumFractionDigits: 2 })} recorded, ₱${m.settled.toLocaleString('en-PH', { minimumFractionDigits: 2 })} settled — ₱${unsettled.toLocaleString('en-PH', { minimumFractionDigits: 2 })} not matched to a bank settlement`
          : `${METHOD_LABEL[method] || method} sales not matched to any bank settlement`,
        resolved: !!rv?.resolved,
        remarks: rv?.remarks || '',
      })
    }
  }

  return NextResponse.json({ items, totalUnsettled: round2(items.reduce((a, i) => a + i.amount, 0)) })
}

// PATCH { branch, date, method, resolved?, remarks? } — save the review for one item.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, date, method, resolved, remarks } = await req.json()
    if (!branch || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !method) {
      return NextResponse.json({ error: 'branch, date (YYYY-MM-DD) and method are required' }, { status: 400 })
    }
    const existing = await prisma.salesDayClearing.findUnique({ where: { date_branch: { date, branch } }, select: { settlementReview: true } })
    const arr: Review[] = Array.isArray(existing?.settlementReview) ? existing!.settlementReview as Review[] : []
    const next = arr.filter(r => r.method !== method)
    next.push({ method, resolved: !!resolved, remarks: String(remarks ?? '').trim() })

    await prisma.salesDayClearing.upsert({
      where: { date_branch: { date, branch } },
      update: { settlementReview: next },
      create: { date, branch, clearedById: session.user.id as string, isCleared: false, settlementReview: next },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Missing settlement save error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
