import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { netOfDeductions } from '@/lib/pos-settlement-shapes'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const AUTO_PREFIX = 'Bank rec:'
// The only methods Sales Checking reconciles — the ones that reach a bank
// account. Must stay in step with CHECKING_METHODS in the POS page: the rest
// (HMO, GL, PREPAID_CARD, PACKAGE, VIP_CARD, DOWNPAYMENT, ADVANCE…) are
// receivables or drawdowns of money already banked, are not shown in the
// panel, and must not hold a day open.
const CHECKING_METHODS = ['CASH', 'CREDIT_CARD', 'DEBIT', 'GCASH', 'PAYMAYA', 'PAYMONGO']

// Auto-tag Sales Checking from what bank reconciliation already accounts for.
//
// A day's takings on one payment method are "considered" exactly when EVERY one
// of that day's payments on that method is linked to a reconciled bank line —
// that link is a PosSettlementPayment row, which is written by the AUB clearing
// settlements, the POS settlement picker, and the ORDER_BATCH cash deposits.
// Nothing is inferred: a bank credit merely *labelled* a cash-sales deposit
// (matchType SALES_DEPOSIT) names no sales day and no order, so it can never
// clear a day here — those are counted and reported back as unattributed so the
// gap stays visible instead of being papered over.
//
// Actual Amount is set to what the bank actually credited (gross less the
// mode's deductions in force on the sale date), so the Difference column shows
// the merchant fees rather than a phantom shortfall.
//
// POST { branch, dateFrom, dateTo, dryRun? }

interface MethodResult {
  method: string
  system: number
  settledGross: number
  settledNet: number
  payments: number
  settledPayments: number
  full: boolean
  depositDates: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const manilaDay = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10)

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, dateFrom, dateTo, dryRun } = await req.json()
    if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo || '')) {
      return NextResponse.json({ error: 'dateFrom and dateTo (YYYY-MM-DD) are required' }, { status: 400 })
    }
    // Manila day boundaries, widened a day each way so a sale that lands on the
    // edge in UTC is still grouped onto the right local day below.
    const lo = new Date(dateFrom + 'T00:00:00.000Z'); lo.setUTCDate(lo.getUTCDate() - 1)
    const hi = new Date(dateTo + 'T00:00:00.000Z'); hi.setUTCDate(hi.getUTCDate() + 2)

    const orders = await prisma.order.findMany({
      where: {
        branch,
        status: { not: 'VOIDED' },
        OR: [
          { paymentDate: { gte: lo, lt: hi } },
          { paymentDate: null, transactionDate: { gte: lo, lt: hi } },
        ],
      },
      select: {
        id: true, paymentDate: true, transactionDate: true, createdAt: true,
        payments: { select: { id: true, method: true, amount: true } },
      },
    })
    const paymentIds = orders.flatMap(o => o.payments.map(p => p.id))
    if (!paymentIds.length) return NextResponse.json({ days: [], tagged: 0, cleared: 0, unattributed: null })

    // The settlement link, plus the mode whose deductions produced the net that
    // reached the bank and the bank line's date for the remark. PosSettlementBatch
    // holds bankTransactionId/paymentModeId as plain columns (no Prisma relation),
    // so these are resolved with follow-up lookups rather than a nested select.
    const links = await prisma.posSettlementPayment.findMany({
      where: { orderPaymentId: { in: paymentIds } },
      select: { orderPaymentId: true, batchId: true },
    })
    const batches = links.length
      ? await prisma.posSettlementBatch.findMany({
          where: { id: { in: [...new Set(links.map(l => l.batchId))] } },
          select: { id: true, paymentModeId: true, grossTotal: true, netTotal: true, bankTransactionId: true },
        })
      : []
    const [txns, modes] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { id: { in: [...new Set(batches.map(b => b.bankTransactionId))] } },
        select: { id: true, date: true },
      }),
      prisma.paymentMode.findMany({
        where: { id: { in: [...new Set(batches.map(b => b.paymentModeId).filter((v): v is string => !!v))] } },
        select: { id: true, deductions: { select: { rate: true, valueType: true, effectiveFrom: true, effectiveTo: true } } },
      }),
    ])
    const txnDate = new Map(txns.map(t => [t.id, t.date]))
    const modeDeductions = new Map(modes.map(m => [m.id, m.deductions]))
    const batchById = new Map(batches.map(b => [b.id, b]))
    const linkOf = new Map(links.map(l => [l.orderPaymentId, batchById.get(l.batchId)]))

    // Aggregate per Manila day → method.
    const byDay = new Map<string, Map<string, MethodResult>>()
    for (const o of orders) {
      const day = manilaDay(o.paymentDate || o.transactionDate || o.createdAt)
      if (day < dateFrom || day > dateTo) continue
      const saleDate = o.transactionDate || o.paymentDate || o.createdAt
      let methods = byDay.get(day)
      if (!methods) { methods = new Map(); byDay.set(day, methods) }
      for (const p of o.payments) {
        const method = String(p.method)
        if (!CHECKING_METHODS.includes(method)) continue
        let m = methods.get(method)
        if (!m) {
          m = { method, system: 0, settledGross: 0, settledNet: 0, payments: 0, settledPayments: 0, full: false, depositDates: [] }
          methods.set(method, m)
        }
        const amt = Number(p.amount)
        m.system = round2(m.system + amt)
        m.payments++
        const batch = linkOf.get(p.id)
        if (!batch) continue
        m.settledPayments++
        m.settledGross = round2(m.settledGross + amt)
        // Net credited for this payment. A batch with no mode (AUB clearing rows
        // carry their fees in the batch totals) is prorated by the batch's own
        // gross→net ratio; otherwise the mode's dated deductions apply.
        const deductions = batch.paymentModeId ? modeDeductions.get(batch.paymentModeId) : null
        let net: number
        if (deductions && deductions.length) {
          net = netOfDeductions(amt, deductions, saleDate)
        } else {
          const g = Number(batch.grossTotal)
          net = g > 0 ? round2(amt * (Number(batch.netTotal) / g)) : amt
        }
        m.settledNet = round2(m.settledNet + net)
        const dep = txnDate.get(batch.bankTransactionId)
        if (dep) {
          const ds = dep.toISOString().slice(0, 10)
          if (!m.depositDates.includes(ds)) m.depositDates.push(ds)
        }
      }
    }
    for (const methods of byDay.values()) {
      for (const m of methods.values()) m.full = m.payments > 0 && m.settledPayments === m.payments
    }

    // Existing records — never clobber a figure the accountant typed. An auto
    // value only lands where the cell is empty or was written by a previous run.
    const existing = await prisma.salesDayClearing.findMany({
      where: { branch, date: { gte: dateFrom, lte: dateTo } },
    })
    const existingBy = new Map(existing.map(r => [r.date, r]))

    const results: { date: string; methods: { method: string; amount: number; confirmed: boolean; note: string }[]; cleared: boolean; skipped: string[] }[] = []
    let tagged = 0, clearedCount = 0

    for (const [date, methods] of [...byDay.entries()].sort()) {
      const rec = existingBy.get(date)
      const prevAmounts = new Map((Array.isArray(rec?.actualAmounts) ? rec!.actualAmounts as { method: string; amount: number }[] : []).map(a => [a.method, Number(a.amount)]))
      const prevRemarks = new Map((Array.isArray(rec?.remarks) ? rec!.remarks as { method: string; remarks: string }[] : []).map(r => [r.method, r.remarks]))
      const prevConfirmed = new Map((Array.isArray(rec?.confirmed) ? rec!.confirmed as { method: string; confirmed: boolean; source?: string }[] : []).map(c => [c.method, c]))

      const amounts: { method: string; amount: number }[] = []
      const remarks: { method: string; remarks: string }[] = []
      const confirmed: { method: string; confirmed: boolean; source: string }[] = []
      const applied: { method: string; amount: number; confirmed: boolean; note: string }[] = []
      const skipped: string[] = []

      for (const m of [...methods.values()].sort((a, b) => a.method.localeCompare(b.method))) {
        const priorAmt = prevAmounts.get(m.method)
        const priorRemark = prevRemarks.get(m.method) || ''
        const priorWasAuto = priorRemark.startsWith(AUTO_PREFIX)
        const cellFree = !priorAmt || priorWasAuto
        const priorConf = prevConfirmed.get(m.method)

        if (m.settledPayments === 0) {
          // Nothing linked — carry whatever the accountant already had.
          if (priorAmt !== undefined) amounts.push({ method: m.method, amount: priorAmt })
          if (priorRemark && !priorWasAuto) remarks.push({ method: m.method, remarks: priorRemark })
          if (priorConf) confirmed.push({ method: m.method, confirmed: !!priorConf.confirmed, source: priorConf.source || 'USER' })
          continue
        }
        const fees = round2(m.settledGross - m.settledNet)
        const deps = m.depositDates.sort()
        const depLabel = deps.length === 1 ? deps[0] : deps.length ? `${deps[0]}…${deps[deps.length - 1]}` : 'bank'
        const note = m.full
          ? `${AUTO_PREFIX} all ${m.payments} payment(s) settled — gross ₱${m.settledGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}${fees ? ` less ₱${fees.toLocaleString('en-PH', { minimumFractionDigits: 2 })} fees` : ''}, credited ${depLabel}`
          : `${AUTO_PREFIX} ${m.settledPayments} of ${m.payments} payment(s) settled (₱${m.settledGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })} of ₱${m.system.toLocaleString('en-PH', { minimumFractionDigits: 2 })}) — rest not yet tagged in bank rec`

        if (!cellFree) {
          // Keep the accountant's figure and note; still record what bank rec knows.
          amounts.push({ method: m.method, amount: priorAmt! })
          if (priorRemark) remarks.push({ method: m.method, remarks: priorRemark })
          if (priorConf) confirmed.push({ method: m.method, confirmed: !!priorConf.confirmed, source: priorConf.source || 'USER' })
          skipped.push(m.method)
          continue
        }
        amounts.push({ method: m.method, amount: m.settledNet })
        remarks.push({ method: m.method, remarks: note })
        confirmed.push({ method: m.method, confirmed: m.full, source: 'BANK_REC' })
        applied.push({ method: m.method, amount: m.settledNet, confirmed: m.full, note })
        tagged++
      }

      // The day clears only when every method that took money that day is fully
      // settled — a single untagged method leaves the day open.
      const allFull = [...methods.values()].every(m => m.full)
      const willClear = allFull && applied.length > 0 && skipped.length === 0
      if (willClear) clearedCount++
      results.push({ date, methods: applied, cleared: willClear, skipped })

      if (!dryRun && applied.length) {
        await prisma.salesDayClearing.upsert({
          where: { date_branch: { date, branch } },
          update: {
            actualAmounts: amounts,
            remarks: remarks.length ? remarks : undefined,
            confirmed,
            ...(willClear ? { isCleared: true, clearedAt: new Date(), clearedById: session.user.id as string } : {}),
          },
          create: {
            date, branch,
            clearedById: session.user.id as string,
            isCleared: willClear,
            actualAmounts: amounts,
            remarks: remarks.length ? remarks : undefined,
            confirmed,
          },
        })
      }
    }

    // Cash credits that bank rec holds but cannot attribute to a sales day —
    // reported so the remaining manual work is explicit rather than invisible.
    const unattributed = await prisma.bankTransaction.aggregate({
      where: { matchType: 'SALES_DEPOSIT', date: { gte: new Date(dateFrom + 'T00:00:00.000Z'), lte: new Date(dateTo + 'T23:59:59.999Z') } },
      _count: true, _sum: { received: true },
    })

    return NextResponse.json({
      days: results.filter(r => r.methods.length || r.skipped.length),
      tagged, cleared: clearedCount, dryRun: !!dryRun,
      unattributedDeposits: { count: unattributed._count, total: Number(unattributed._sum.received || 0) },
    })
  } catch (e) {
    console.error('Sales checking auto-tag error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
