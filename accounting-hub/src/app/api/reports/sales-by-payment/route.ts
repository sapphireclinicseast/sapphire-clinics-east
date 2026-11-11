import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLedgerStatements, ledgerBranchValues } from '@/lib/reports/v2/engine'

/**
 * GET /api/reports/sales-by-payment?year=&branch=&from=&to=
 *
 * Reports → Sales by Payment (Hannah 2026-11-11): the income statement's Gross
 * Sales only, each line split by how it was paid —
 *   · HMO  — OrderPayment.method HMO
 *   · GL   — OrderPayment.method GL (guarantee letters)
 *   · Cash — everything the patient paid: cash, credit/debit card, GCash/Maya,
 *            package, VIP card, prepaid card, advance / downpayment, TikTok…
 *
 * Line totals come from the ledger engine, so they tie to the Income Statement.
 * The split reads the POS sale entries behind them (POS_ORDER, its reversals and
 * the MD pass-through removals, all keyed to the order): each order's gross sale
 * on each revenue account is divided by the order's own payments, in proportion.
 * Revenue not posted from a POS sale (manual journals, EWT other income…) and
 * sales with no payment recorded stay in "Not from POS", so every line adds up.
 * `monthly` carries the same split per line per month (the Monthly view).
 */

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const POS_SALE_TYPES = ['POS_ORDER', 'POS_ORDER_REVERSAL', 'MD_PASSTHROUGH_REMOVAL']
/** Before 2026 the books are the imported QuickBooks GL, which carries no payment method. */
const FIRST_POS_YEAR = 2026

type Cat = 'CASH' | 'GL' | 'HMO'
const categoryOf = (method: string): Cat => (method === 'HMO' ? 'HMO' : method === 'GL' ? 'GL' : 'CASH')
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', CREDIT_CARD: 'Credit card', DEBIT: 'Debit card', GCASH: 'GCash', PAYMAYA: 'Maya',
  PAYMONGO: 'PayMongo', PACKAGE: 'Package', VIP_CARD: 'VIP card', PREPAID_CARD: 'Prepaid card',
  ADVANCE: 'Advance payment', DOWNPAYMENT: 'Downpayment', REWARD_POINTS: 'Reward points', TIKTOK: 'TikTok',
}
const round2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: Request) {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  if (!session?.user || !READ_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') || new Date().getFullYear())
  const fromM = Math.min(12, Math.max(1, Number(searchParams.get('from') || 1)))
  const toM = Math.min(12, Math.max(fromM, Number(searchParams.get('to') || 12)))
  const branchSel = searchParams.get('branch') || 'ALL'
  const branches = branchSel === 'ALL' ? ['ALL'] : branchSel.split('+').filter(Boolean)

  try {
    // ── Line totals: the Income Statement's Gross Revenue rows (ledger engine), by month ──
    const lines = new Map<string, { number: string; title: string; monthly: number[] }>()
    for (const b of branches) {
      const st = await computeLedgerStatements(year, b)
      const sec = st.incomeStatement.sections.find(s => s.key === 'REVENUE')
      for (const r of sec?.rows || []) {
        const cur = lines.get(r.number) || { number: r.number, title: r.title, monthly: Array(12).fill(0) }
        for (let m = 0; m < 12; m++) cur.monthly[m] += r.monthly?.[m] || 0
        lines.set(r.number, cur)
      }
    }

    // ── The split, by month: POS sale entries in the same window and branches ──
    // account number → month (0–11) → per category
    const split = new Map<string, Record<Cat, number>[]>()
    const addSplit = (acct: string, m: number, cat: Cat, v: number) => {
      let arr = split.get(acct)
      if (!arr) { arr = Array.from({ length: 12 }, () => ({ CASH: 0, GL: 0, HMO: 0 })); split.set(acct, arr) }
      arr[m][cat] += v
    }
    const byMethod: Record<string, number> = {}
    const notes: string[] = []
    if (year >= FIRST_POS_YEAR) {
      const branchValues = branches.includes('ALL') ? null
        : Array.from(new Set(branches.flatMap(b => ledgerBranchValues(b) || [])))
      const start = new Date(Date.UTC(year, fromM - 1, 1))
      const end = new Date(Date.UTC(year, toM, 1))
      const jeLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            referenceType: { in: POS_SALE_TYPES },
            entryDate: { gte: start, lt: end },
            ...(branchValues ? { branch: { in: branchValues } } : {}),
          },
          account: { accountType: 'REVENUE', normalBalance: 'CREDIT' },
        },
        select: {
          debit: true, credit: true,
          account: { select: { accountNumber: true } },
          journalEntry: { select: { referenceId: true, entryDate: true } },
        },
      })
      // order → "account|month" → gross sale (credit − debit). Months as the
      // engine buckets them: the UTC month of the entry date.
      const perOrder = new Map<string, Map<string, number>>()
      for (const l of jeLines) {
        const oid = l.journalEntry.referenceId
        if (!oid) continue
        const amt = Number(l.credit) - Number(l.debit)
        if (!amt) continue
        const k = `${l.account.accountNumber}|${new Date(l.journalEntry.entryDate).getUTCMonth()}`
        const m = perOrder.get(oid) || new Map<string, number>()
        m.set(k, (m.get(k) || 0) + amt)
        perOrder.set(oid, m)
      }
      const payments = new Map<string, { method: string; amount: number }[]>()
      const loadPayments = async (ids: string[]) => {
        for (let i = 0; i < ids.length; i += 5000) {
          const ps = await prisma.orderPayment.findMany({ where: { orderId: { in: ids.slice(i, i + 5000) } }, select: { orderId: true, method: true, amount: true } })
          for (const p of ps) {
            const arr = payments.get(p.orderId) || []
            arr.push({ method: String(p.method), amount: Math.max(0, Number(p.amount) || 0) })
            payments.set(p.orderId, arr)
          }
        }
      }
      await loadPayments([...perOrder.keys()])
      /** Spread an amount over the order's payments, in proportion. false = no payment recorded. */
      const allocate = (orderId: string, acct: string, m: number, amount: number) => {
        const ps = (payments.get(orderId) || []).filter(p => p.amount > 0)
        const paid = ps.reduce((t, p) => t + p.amount, 0)
        if (paid <= 0) return false
        for (const p of ps) {
          const part = amount * (p.amount / paid)
          const cat = categoryOf(p.method)
          addSplit(acct, m, cat, part)
          if (cat === 'CASH') byMethod[p.method] = (byMethod[p.method] || 0) + part
        }
        return true
      }
      let unpaidOrders = 0
      for (const [oid, parts] of perOrder) {
        let any = false
        for (const [k, gross] of parts) {
          const [acct, m] = k.split('|')
          if (allocate(oid, acct, Number(m), gross)) any = true
        }
        if (!any) unpaidOrders++ // stays in "Not from POS / no payment"
      }
      // Period fees (tuition): the Income Statement recognizes them over the months
      // they cover (engine 3b), not all in the payment month as the POS entry does.
      // Reshape the split the same way, by each order's own payment mix, so the
      // split ties to the statement line month by month.
      const pfItems = await prisma.orderItem.findMany({
        where: {
          service: { recognitionMonths: { gt: 1 } },
          order: {
            status: 'COMPLETED',
            revenueType: { not: 'UNEARNED' },
            transactionDate: { gte: new Date(Date.UTC(year - 2, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
            ...(branchValues ? { branch: { in: branchValues } } : {}),
          },
        },
        select: {
          lineTotal: true,
          service: { select: { recognitionMonths: true, revenueAccount: { select: { accountNumber: true } } } },
          order: { select: { id: true, transactionDate: true, subtotal: true, netAmount: true } },
        },
      })
      const pfAdj: { orderId: string; acct: string; m: number; amount: number }[] = []
      const inWindow = (m: number) => m >= fromM && m <= toM
      for (const it of pfItems) {
        const N = it.service?.recognitionMonths || 1
        if (N <= 1) continue
        const o = it.order
        const gross = Number(it.lineTotal)
        const subtotal = Number(o.subtotal)
        const net = round2(subtotal > 0 ? gross * Number(o.netAmount) / subtotal : gross)
        if (net <= 0) continue
        const acct = it.service?.revenueAccount?.accountNumber || '7000'
        const td = new Date(o.transactionDate)
        const startAbs = (td.getUTCFullYear() - year) * 12 + td.getUTCMonth() + 1
        if (startAbs >= 1 && startAbs <= 12 && inWindow(startAbs)) pfAdj.push({ orderId: o.id, acct, m: startAbs - 1, amount: -net })
        const per = round2(net / N)
        for (let k = 0; k < N; k++) {
          const m = startAbs + k
          if (m < 1 || m > 12 || !inWindow(m)) continue
          pfAdj.push({ orderId: o.id, acct, m: m - 1, amount: k === N - 1 ? round2(net - per * (N - 1)) : per })
        }
      }
      await loadPayments([...new Set(pfAdj.map(a => a.orderId))].filter(id => !payments.has(id)))
      for (const a of pfAdj) allocate(a.orderId, a.acct, a.m, a.amount)
      if (pfAdj.length) notes.push('Tuition and other period fees count in the months they cover, as on the Income Statement — split by how each was paid.')
      if (unpaidOrders) notes.push(`${unpaidOrders} sale${unpaidOrders === 1 ? '' : 's'} with no payment recorded (fully discounted or free) stay in "Not from POS".`)
    } else {
      notes.push(`Before ${FIRST_POS_YEAR} the books are the imported QuickBooks journals, which carry no payment method — every line shows under "Not from POS".`)
    }

    // One row per line per month in the window, then the summary rows over the window.
    const monthsIn = Array.from({ length: toM - fromM + 1 }, (_, i) => fromM - 1 + i)
    const cell = (acct: string, m: number, lineTotal: number) => {
      const s = split.get(acct)?.[m] || { CASH: 0, GL: 0, HMO: 0 }
      const cash = round2(s.CASH), gl = round2(s.GL), hmo = round2(s.HMO), total = round2(lineTotal)
      return { cash, gl, hmo, other: round2(total - cash - gl - hmo), total }
    }
    const nonZero = (r: { cash: number; gl: number; hmo: number; total: number }) =>
      Math.abs(r.total) > 0.004 || Math.abs(r.cash) + Math.abs(r.gl) + Math.abs(r.hmo) > 0.004
    const monthly = [...lines.values()]
      .flatMap(l => monthsIn.map(m => ({ number: l.number, month: m + 1, ...cell(l.number, m, l.monthly[m]) })))
      .filter(nonZero)
    const rows = [...lines.values()]
      .map(l => {
        const own = monthly.filter(x => x.number === l.number)
        const sum = (k: 'cash' | 'gl' | 'hmo' | 'other' | 'total') => round2(own.reduce((t, x) => t + x[k], 0))
        return { number: l.number, title: l.title, cash: sum('cash'), gl: sum('gl'), hmo: sum('hmo'), other: sum('other'), total: sum('total') }
      })
      .filter(nonZero)
      .sort((a, b) => a.number.localeCompare(b.number))
    const totals = rows.reduce((t, r) => ({
      cash: t.cash + r.cash, gl: t.gl + r.gl, hmo: t.hmo + r.hmo, other: t.other + r.other, total: t.total + r.total,
    }), { cash: 0, gl: 0, hmo: 0, other: 0, total: 0 })
    const cashMethods = Object.entries(byMethod)
      .map(([method, amount]) => ({ method, label: METHOD_LABEL[method] || method, amount: round2(amount) }))
      .filter(m => Math.abs(m.amount) > 0.004)
      .sort((a, b) => b.amount - a.amount)

    return NextResponse.json({
      year, branch: branchSel, from: fromM, to: toM,
      rows,
      monthly,
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
      cashMethods,
      notes,
    })
  } catch (e) {
    console.error('[reports/sales-by-payment] failed:', e)
    return NextResponse.json({ error: 'Failed to build the sales by payment report' }, { status: 500 })
  }
}
