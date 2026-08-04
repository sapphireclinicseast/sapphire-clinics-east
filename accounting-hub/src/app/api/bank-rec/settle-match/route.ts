import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Bulk day-settlement matcher. A card/e-wallet/marketplace mode's takings for
// one day settle as a single deposit, net of that mode's fees, a few banking
// days later. The manual flow matches these one line at a time via the hints;
// this does the same pairing in bulk: for every pending money-in line, find
// the one unclaimed (day × mode) batch whose net matches within tolerance and
// whose lag is 0–5 banking days. Matching marks the line POSTED against the
// batch — no journal posts, because the orders that make up the batch already
// carry the money; the settlement line is the bank confirming it arrived.
const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const bankingDays = (a: Date, b: Date) => {
  let n = 0
  const d = new Date(Math.min(+a, +b))
  const end = new Date(Math.max(+a, +b))
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++
  }
  return n
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const dryRun = !!body.dryRun

  const modes = await prisma.paymentMode.findMany({
    where: { accountId: { not: null } },
    select: { id: true, name: true, accountId: true, deductions: { select: { rate: true, valueType: true } } },
  })
  if (!modes.length) return NextResponse.json({ error: 'No payment modes are mapped to bank accounts' }, { status: 400 })
  const netOf = (modeId: string, gross: number) => {
    const m = modes.find(x => x.id === modeId)!
    const cut = m.deductions.reduce((s, d) =>
      s + (d.valueType === 'PERCENTAGE' ? gross * Number(d.rate) / 100 : Number(d.rate)), 0)
    return Math.round((gross - cut) * 100) / 100
  }

  const pending = await prisma.bankTransaction.findMany({
    where: { status: 'PENDING', received: { gt: 0 }, bankAccountId: { in: [...new Set(modes.map(m => m.accountId as string))] } },
    orderBy: { date: 'asc' },
  })
  if (!pending.length) return NextResponse.json({ success: true, matched: 0, note: 'No pending money-in lines on settlement accounts' })

  const lo = new Date(Math.min(...pending.map(t => +t.date)) - 10 * 86400000)
  const hi = new Date(Math.max(...pending.map(t => +t.date)) + 1 * 86400000)
  const payments = await prisma.orderPayment.findMany({
    where: { paymentModeId: { in: modes.map(m => m.id) }, order: { status: 'COMPLETED', transactionDate: { gte: lo, lte: hi } } },
    select: { amount: true, paymentModeId: true, order: { select: { transactionDate: true } } },
  })
  type Batch = { day: string; modeId: string; accountId: string; modeName: string; net: number; gross: number; n: number; claimed: boolean }
  const batches = new Map<string, Batch>()
  for (const p of payments) {
    if (!p.order || !p.paymentModeId) continue
    const mode = modes.find(m => m.id === p.paymentModeId)!
    const k = `${dayKey(p.order.transactionDate)}|${p.paymentModeId}`
    const b = batches.get(k) || { day: dayKey(p.order.transactionDate), modeId: p.paymentModeId, accountId: mode.accountId as string, modeName: mode.name, net: 0, gross: 0, n: 0, claimed: false }
    b.net = Math.round((b.net + netOf(p.paymentModeId, Number(p.amount))) * 100) / 100
    b.gross = Math.round((b.gross + Number(p.amount)) * 100) / 100
    b.n++
    batches.set(k, b)
  }

  let matched = 0
  const results: { id: string; label: string }[] = []
  for (const t of pending) {
    const recv = Number(t.received)
    const tol = Math.max(1, recv * 0.005)
    const bias = (b: Batch) => Math.abs(bankingDays(new Date(b.day), t.date) - 1.5)
    const cands = [...batches.values()].filter(b =>
      !b.claimed && b.accountId === t.bankAccountId && Math.abs(b.net - recv) <= tol)
      .filter(b => { const lag = bankingDays(new Date(b.day), t.date); return t.date >= new Date(b.day) && lag <= 5 })
      .sort((a, b) => bias(a) - bias(b))
    const b = cands[0]
    if (!b) continue
    b.claimed = true
    matched++
    const fees = Math.round((b.gross - b.net) * 100) / 100
    const label = `Day settlement: ${b.n} × ${b.modeName} on ${b.day} · ${b.gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })} gross less ${fees.toLocaleString('en-PH', { minimumFractionDigits: 2 })} fees`
    results.push({ id: t.id, label })
    if (!dryRun) {
      await prisma.bankTransaction.update({
        where: { id: t.id },
        data: { status: 'POSTED', matchType: 'ORDER_BATCH', matchId: `${b.day}|${b.modeId}`, matchLabel: label.slice(0, 200) },
      })
    }
  }
  const remaining = await prisma.bankTransaction.count({ where: { status: 'PENDING' } })
  return NextResponse.json({ success: true, dryRun, matched, remainingPending: remaining, sample: results.slice(0, 5) })
}
