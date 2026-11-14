import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLedgerStatements, ledgerBranchValues } from '@/lib/reports/v2/engine'

/**
 * GET /api/reports/sales-by-payment?year=&branch=&from=&to=
 *
 * Reports → Sales by Payment (Hannah 2026-11-11): the income statement's sales,
 * by department (revenue line), split by how they were paid —
 *   · HMO  — OrderPayment.method HMO
 *   · GL   — OrderPayment.method GL (guarantee letters)
 *   · Cash — everything the patient paid: cash, credit/debit card, GCash/Maya,
 *            package, VIP card, prepaid card, advance / downpayment, TikTok…
 * on two bases: GROSS (before discounts) and NET (after discounts) — net
 * matters because PWD/SC discounts sit mostly on cash-paying patients.
 *
 * Line totals come from the ledger engine, so gross ties to the IS Gross
 * Revenue lines and net to IS Net Sales. The split reads the POS sale entries
 * behind them (POS_ORDER, its reversals and the MD pass-through removals, keyed
 * to the order): each order's gross on each revenue line is divided by the
 * order's own payments, in proportion; each order's discounts are spread over
 * its revenue lines (by their gross) and over its payments (card MDR over its
 * card/cash payments only). AR collection entries go to the paying wallet's
 * type (HMO / GL). Anything else — sales booked by journal, discounts not tied
 * to a POS sale, sales with no payment — stays in "Not from POS", so every line
 * adds up. Sales only: non-operating revenue (other income, interest, rental,
 * dividends) is left out (Hannah 2026-11-11).
 */

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const POS_SALE_TYPES = ['POS_ORDER', 'POS_ORDER_REVERSAL', 'MD_PASSTHROUGH_REMOVAL']
/** Revenue that is not a sale — left out of this report. */
const NON_OPERATING = 'NON_OPERATING_REVENUE'
/** Card merchant fees: charged on card payments only. */
const MDR_ACCOUNT = '7140'
/** The row that carries discounts no POS sale explains (collection discounts, TikTok fees, journals). */
const UNTIED = 'DISC'
/** Before 2026 the books are the imported QuickBooks GL, which carries no payment method. */
const FIRST_POS_YEAR = 2026

type Cat = 'CASH' | 'GL' | 'HMO'
type Split = Record<Cat, number>
const categoryOf = (method: string): Cat => (method === 'HMO' ? 'HMO' : method === 'GL' ? 'GL' : 'CASH')
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', CREDIT_CARD: 'Credit card', DEBIT: 'Debit card', GCASH: 'GCash', PAYMAYA: 'Maya',
  PAYMONGO: 'PayMongo', PACKAGE: 'Package', VIP_CARD: 'VIP card', PREPAID_CARD: 'Prepaid card', GIFT_CARD: 'Gift card',
  ADVANCE: 'Advance payment', DOWNPAYMENT: 'Downpayment', REWARD_POINTS: 'Reward points', TIKTOK: 'TikTok',
}
const round2 = (n: number) => Math.round(n * 100) / 100
const zero = (): Split => ({ CASH: 0, GL: 0, HMO: 0 })

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
    // ── Line totals from the ledger engine, by month ──
    // Gross: the IS Gross Revenue rows (sales lines only). Discounts: the IS
    // "Discounts and Refunds" total, which net sales subtracts.
    const nonOperating = new Set((await prisma.account.findMany({
      where: { accountType: 'REVENUE', subType: NON_OPERATING },
      select: { accountNumber: true },
    })).map(a => a.accountNumber))
    const lines = new Map<string, { number: string; title: string; monthly: number[] }>()
    const discMonthly = Array(12).fill(0) as number[]
    for (const b of branches) {
      const st = await computeLedgerStatements(year, b)
      for (const sec of st.incomeStatement.sections) {
        if (sec.key === 'REVENUE') {
          for (const r of sec.rows) {
            if (r.subType === NON_OPERATING || nonOperating.has(r.number)) continue
            const cur = lines.get(r.number) || { number: r.number, title: r.title, monthly: Array(12).fill(0) }
            for (let m = 0; m < 12; m++) cur.monthly[m] += r.monthly?.[m] || 0
            lines.set(r.number, cur)
          }
        } else if (sec.key === 'DISCOUNTS') {
          for (const r of sec.rows) for (let m = 0; m < 12; m++) discMonthly[m] += r.monthly?.[m] || 0
        }
      }
    }

    // ── The split ── account → month (0–11) → category
    const gross = new Map<string, Split[]>()
    const disc = new Map<string, Split[]>() // discounts charged to each revenue line (and UNTIED)
    const add = (map: Map<string, Split[]>, acct: string, m: number, cat: Cat, v: number) => {
      let arr = map.get(acct)
      if (!arr) { arr = Array.from({ length: 12 }, zero); map.set(acct, arr) }
      arr[m][cat] += v
    }
    const byMethod: Record<string, { gross: number; disc: number }> = {}
    const notes: string[] = ['Other income and interest (non-operating revenue) are left out — sales only.']
    if (year >= FIRST_POS_YEAR) {
      const branchValues = branches.includes('ALL') ? null
        : Array.from(new Set(branches.flatMap(b => ledgerBranchValues(b) || [])))
      const start = new Date(Date.UTC(year, fromM - 1, 1))
      const end = new Date(Date.UTC(year, toM, 1))
      const jeLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            referenceType: { in: [...POS_SALE_TYPES, 'AR_PAYMENT', 'AR_PAYMENT_REVERSAL'] },
            entryDate: { gte: start, lt: end },
            ...(branchValues ? { branch: { in: branchValues } } : {}),
          },
          account: { accountType: 'REVENUE' },
        },
        select: {
          debit: true, credit: true,
          account: { select: { accountNumber: true, normalBalance: true } },
          journalEntry: { select: { referenceId: true, referenceType: true, entryDate: true } },
        },
      })
      // order → month → { gross by line, discounts by account }
      type OM = { gross: Map<string, number>; disc: Map<string, number> }
      const perOrder = new Map<string, Map<number, OM>>()
      // AR collection entries → wallet type decides the category
      const arLines: { paymentId: string; m: number; acct: string; amount: number; isDisc: boolean }[] = []
      for (const l of jeLines) {
        const ref = l.journalEntry.referenceId
        const acct = l.account.accountNumber
        if (!ref || nonOperating.has(acct)) continue
        const isDisc = l.account.normalBalance === 'DEBIT'
        const amt = isDisc ? Number(l.debit) - Number(l.credit) : Number(l.credit) - Number(l.debit)
        if (!amt) continue
        const m = new Date(l.journalEntry.entryDate).getUTCMonth()
        const type = l.journalEntry.referenceType || ''
        if (type === 'AR_PAYMENT' || type === 'AR_PAYMENT_REVERSAL') { arLines.push({ paymentId: ref, m, acct, amount: amt, isDisc }); continue }
        const byM = perOrder.get(ref) || new Map<number, OM>()
        const om = byM.get(m) || { gross: new Map(), disc: new Map() }
        const target = isDisc ? om.disc : om.gross
        target.set(acct, (target.get(acct) || 0) + amt)
        byM.set(m, om)
        perOrder.set(ref, byM)
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
      const paidOf = (orderId: string, cashOnly = false) => {
        let ps = (payments.get(orderId) || []).filter(p => p.amount > 0)
        if (cashOnly) { const c = ps.filter(p => categoryOf(p.method) === 'CASH'); if (c.length) ps = c }
        return { ps, paid: ps.reduce((t, p) => t + p.amount, 0) }
      }
      /** Spread a gross amount on one line over the order's payments. false = no payment recorded. */
      const allocGross = (orderId: string, acct: string, m: number, amount: number) => {
        const { ps, paid } = paidOf(orderId)
        if (paid <= 0) return false
        for (const p of ps) {
          const part = amount * (p.amount / paid)
          const cat = categoryOf(p.method)
          add(gross, acct, m, cat, part)
          if (cat === 'CASH') (byMethod[p.method] ||= { gross: 0, disc: 0 }).gross += part
        }
        return true
      }
      /** Spread a discount over the order's lines (by gross) and payments (MDR: card/cash payments). */
      const allocDisc = (orderId: string, m: number, grossByLine: Map<string, number>, discAcct: string, amount: number) => {
        const { ps, paid } = paidOf(orderId, discAcct === MDR_ACCOUNT)
        if (paid <= 0) return
        const G = [...grossByLine.values()].reduce((t, v) => t + v, 0)
        const shares: [string, number][] = Math.abs(G) > 0.004 ? [...grossByLine].map(([a, g]) => [a, g / G]) : [[UNTIED, 1]]
        for (const [line, share] of shares) {
          for (const p of ps) {
            const part = amount * share * (p.amount / paid)
            const cat = categoryOf(p.method)
            add(disc, line, m, cat, part)
            if (cat === 'CASH') (byMethod[p.method] ||= { gross: 0, disc: 0 }).disc += part
          }
        }
      }
      let unpaidOrders = 0
      for (const [oid, byM] of perOrder) {
        let any = false
        for (const [m, om] of byM) {
          for (const [acct, g] of om.gross) if (allocGross(oid, acct, m, g)) any = true
          // Discounts in a month with no gross on the order (e.g. a later-month
          // adjustment) spread by the order's lines in any month.
          let lineBase = om.gross
          if (![...lineBase.values()].some(v => Math.abs(v) > 0.004)) {
            lineBase = new Map()
            for (const o of byM.values()) for (const [a, g] of o.gross) lineBase.set(a, (lineBase.get(a) || 0) + g)
          }
          for (const [dAcct, d] of om.disc) allocDisc(oid, m, lineBase, dAcct, d)
        }
        if (!any) unpaidOrders++
      }

      // AR collection entries (e.g. an HMO's prompt-payment discount, a GL partner discount)
      if (arLines.length) {
        const pays = await prisma.aRPayment.findMany({
          where: { id: { in: [...new Set(arLines.map(a => a.paymentId))] } },
          select: { id: true, wallet: { select: { walletType: true } } },
        })
        const typeOf = new Map(pays.map(p => [p.id, p.wallet?.walletType || '']))
        for (const a of arLines) {
          const wt = typeOf.get(a.paymentId)
          const cat: Cat = wt === 'HMO' ? 'HMO' : wt === 'GL' ? 'GL' : 'CASH'
          if (a.isDisc) add(disc, UNTIED, a.m, cat, a.amount)
          else add(gross, a.acct, a.m, cat, a.amount)
        }
      }

      // Period fees (tuition): the Income Statement recognizes them over the months
      // they cover (engine 3b), not all in the payment month as the POS entry does.
      // Reshape the gross split the same way, by each order's own payment mix.
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
        const g = Number(it.lineTotal)
        const subtotal = Number(o.subtotal)
        const net = round2(subtotal > 0 ? g * Number(o.netAmount) / subtotal : g)
        if (net <= 0) continue
        const acct = it.service?.revenueAccount?.accountNumber || '7000'
        if (nonOperating.has(acct)) continue
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
      for (const a of pfAdj) allocGross(a.orderId, a.acct, a.m, a.amount)
      if (pfAdj.length) notes.push('Tuition and other period fees count in the months they cover, as on the Income Statement — split by how each was paid.')
      if (unpaidOrders) notes.push(`${unpaidOrders} sale${unpaidOrders === 1 ? '' : 's'} with no payment recorded (fully discounted or free) stay in "Not from POS".`)
      notes.push('Net sales: each sale’s discounts (PWD/SC, VIP, employee, card MDR, returns…) are taken off the department and the payment they belong to; card MDR only off card and cash payments. Discounts not tied to a POS sale show on their own row.')
    } else {
      notes.push(`Before ${FIRST_POS_YEAR} the books are the imported QuickBooks journals, which carry no payment method — every line shows under "Not from POS".`)
    }

    // ── Rows ──
    const monthsIn = Array.from({ length: toM - fromM + 1 }, (_, i) => fromM - 1 + i)
    type Cell = { cash: number; gl: number; hmo: number; other: number; total: number }
    const mk = (s: Split, total: number): Cell => {
      const cash = round2(s.CASH), gl = round2(s.GL), hmo = round2(s.HMO), t = round2(total)
      return { cash, gl, hmo, other: round2(t - cash - gl - hmo), total: t }
    }
    const nonZero = (r: Cell) => Math.abs(r.total) > 0.004 || Math.abs(r.cash) + Math.abs(r.gl) + Math.abs(r.hmo) > 0.004
    const sumCells = (cs: Cell[]): Cell => cs.reduce((t, c) => ({
      cash: t.cash + c.cash, gl: t.gl + c.gl, hmo: t.hmo + c.hmo, other: t.other + c.other, total: t.total + c.total,
    }), { cash: 0, gl: 0, hmo: 0, other: 0, total: 0 })
    const r2 = (c: Cell): Cell => ({ cash: round2(c.cash), gl: round2(c.gl), hmo: round2(c.hmo), other: round2(c.other), total: round2(c.total) })

    // Discounts the POS sales explain, per line; the rest of the IS discounts → UNTIED.
    const discOn = (acct: string, m: number) => disc.get(acct)?.[m] || zero()
    const discAmt = (acct: string, m: number) => { const d = discOn(acct, m); return d.CASH + d.GL + d.HMO }
    const monthly: ({ number: string; month: number } & Cell)[] = []
    const monthlyNet: ({ number: string; month: number } & Cell)[] = []
    for (const l of lines.values()) {
      for (const m of monthsIn) {
        const g = mk(gross.get(l.number)?.[m] || zero(), l.monthly[m])
        if (nonZero(g)) monthly.push({ number: l.number, month: m + 1, ...g })
        const d = discOn(l.number, m)
        const n = mk({ CASH: (gross.get(l.number)?.[m]?.CASH || 0) - d.CASH, GL: (gross.get(l.number)?.[m]?.GL || 0) - d.GL, HMO: (gross.get(l.number)?.[m]?.HMO || 0) - d.HMO },
          l.monthly[m] - discAmt(l.number, m))
        if (nonZero(n)) monthlyNet.push({ number: l.number, month: m + 1, ...n })
      }
    }
    // Untied discounts per month: the IS discount total minus what the lines carry.
    for (const m of monthsIn) {
      let onLines = 0
      for (const l of lines.values()) onLines += discAmt(l.number, m)
      const d = discOn(UNTIED, m)
      const untiedTotal = discMonthly[m] - onLines
      const n = mk({ CASH: -d.CASH, GL: -d.GL, HMO: -d.HMO }, -untiedTotal)
      if (nonZero(n)) monthlyNet.push({ number: UNTIED, month: m + 1, ...n })
    }

    const lineRows = (src: typeof monthly, withUntied: boolean) => [
      ...[...lines.values()].map(l => ({ number: l.number, title: l.title, ...r2(sumCells(src.filter(x => x.number === l.number))) })),
      ...(withUntied ? [{ number: UNTIED, title: 'Discounts not tied to a POS sale', ...r2(sumCells(src.filter(x => x.number === UNTIED))) }] : []),
    ].filter(nonZero).sort((a, b) => (a.number === UNTIED ? 1 : b.number === UNTIED ? -1 : a.number.localeCompare(b.number)))
    const rows = lineRows(monthly, false)
    const netRows = lineRows(monthlyNet, true)
    const totals = r2(sumCells(rows))
    const netTotals = r2(sumCells(netRows))
    const discountTotal = round2(monthsIn.reduce((t, m) => t + discMonthly[m], 0))
    const cashMethods = Object.entries(byMethod)
      .map(([method, v]) => ({ method, label: METHOD_LABEL[method] || method, amount: round2(v.gross), net: round2(v.gross - v.disc) }))
      .filter(m => Math.abs(m.amount) > 0.004 || Math.abs(m.net) > 0.004)
      .sort((a, b) => b.net - a.net)

    return NextResponse.json({
      year, branch: branchSel, from: fromM, to: toM,
      rows, monthly, totals,
      netRows, monthlyNet, netTotals, discountTotal,
      cashMethods,
      notes,
    })
  } catch (e) {
    console.error('[reports/sales-by-payment] failed:', e)
    return NextResponse.json({ error: 'Failed to build the sales by payment report' }, { status: 500 })
  }
}
