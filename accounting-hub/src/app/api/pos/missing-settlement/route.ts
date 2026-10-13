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

  // Aggregate POS System sales per Manila day → method.
  const byDay = new Map<string, Map<string, number>>()
  for (const o of orders) {
    const day = manilaDay(o.paymentDate || o.transactionDate || o.createdAt)
    if (day < dateFrom || day > dateTo) continue
    for (const p of o.payments) {
      const method = String(p.method)
      if (!SETTLEMENT_METHODS.includes(method)) continue
      let methods = byDay.get(day)
      if (!methods) { methods = new Map(); byDay.set(day, methods) }
      methods.set(method, round2((methods.get(method) || 0) + Number(p.amount)))
    }
  }

  // Source of truth = the auditor's figures in Sales Checking: Actual deposited
  // (actualAmounts), whether the day+method was bank-reconciled (a BANK_REC tick),
  // and any saved review.
  const clearings = await prisma.salesDayClearing.findMany({
    where: { branch, date: { gte: dateFrom, lte: dateTo } },
    select: { date: true, actualAmounts: true, confirmed: true, settlementReview: true },
  })
  const actualOf = new Map<string, number>()
  const bankRecOf = new Set<string>()
  const reviewOf = new Map<string, Review>()
  for (const c of clearings) {
    for (const a of (Array.isArray(c.actualAmounts) ? c.actualAmounts as { method: string; amount: number }[] : [])) {
      if (a?.method) actualOf.set(`${c.date}|${a.method}`, Number(a.amount) || 0)
    }
    for (const cf of (Array.isArray(c.confirmed) ? c.confirmed as { method: string; confirmed?: boolean; source?: string }[] : [])) {
      if (cf?.method && cf.source === 'BANK_REC') bankRecOf.add(`${c.date}|${cf.method}`)
    }
    for (const r of (Array.isArray(c.settlementReview) ? c.settlementReview as Review[] : [])) {
      if (r?.method) reviewOf.set(`${c.date}|${r.method}`, r)
    }
  }

  // "Missing" = the auditor's Actual deposited is less than the POS System amount
  // (an under-deposit). The Bank reconciled? flag shows whether that day+method is
  // already tied to a bank line — a reconciled shortfall is usually just the
  // merchant fees; an unreconciled one is a real gap.
  const items: {
    date: string; method: string; methodLabel: string; amount: number; recorded: number; actual: number
    bankReconciled: boolean; description: string; resolved: boolean; remarks: string
  }[] = []
  for (const [date, methods] of [...byDay.entries()].sort()) {
    for (const method of SETTLEMENT_METHODS) {
      const system = methods.get(method)
      if (!system || system <= 0) continue
      const key = `${date}|${method}`
      const actual = actualOf.get(key) ?? 0
      const shortfall = round2(system - actual)
      if (shortfall <= 0.5) continue // auditor's actual covers (or exceeds) the recorded sales
      const rv = reviewOf.get(key)
      items.push({
        date, method, methodLabel: METHOD_LABEL[method] || method,
        amount: shortfall, recorded: system, actual, bankReconciled: bankRecOf.has(key),
        description: actual > 0
          ? `${METHOD_LABEL[method] || method}: ₱${system.toLocaleString('en-PH', { minimumFractionDigits: 2 })} recorded vs ₱${actual.toLocaleString('en-PH', { minimumFractionDigits: 2 })} actually deposited`
          : `${METHOD_LABEL[method] || method}: ₱${system.toLocaleString('en-PH', { minimumFractionDigits: 2 })} recorded, no actual deposit entered yet`,
        resolved: !!rv?.resolved,
        remarks: rv?.remarks || '',
      })
    }
  }

  return NextResponse.json({ items, totalShort: round2(items.reduce((a, i) => a + i.amount, 0)) })
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
