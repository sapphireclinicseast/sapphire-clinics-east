import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'
import { PAYOUT_HOLD_DAYS } from '@/lib/earnings'
import { providerWalletMove, doctorWalletMove } from '@/lib/wallet'
import { disburse } from '@/lib/disburse'
import { notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const MIN_PAYOUT = 100 // don't cut a payout below this (PHP)
const r2 = (n: number) => Math.round(n * 100) / 100

interface Recipient { kind: 'provider' | 'doctor'; id: string; name: string; email: string | null; total: number; txnIds: string[]; method: string; bankName: string | null; account: string | null; accountName: string | null; missing: string[] }

function csvEscape(s: string) { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

// Weekly rolling payout batch. Pays each provider/doctor the sum of their MATURED,
// unpaid earnings (completed session net, held PAYOUT_HOLD_DAYS for settlement +
// buffer). Tries an API disbursement; anything not auto-sent lands in a CSV batch
// for the bank/PayMongo portal. Auth: NICKEL_CRON_SECRET header, or an admin session.
export async function GET(req: NextRequest) {
  const secret = process.env.NICKEL_CRON_SECRET
  const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  const authed = (secret && provided === secret) || (await isAdmin())
  if (!authed) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  const format = req.nextUrl.searchParams.get('format')
  const now = new Date()
  const holdCutoff = new Date(now.getTime() - PAYOUT_HOLD_DAYS * 86400_000)

  // Matured, unpaid earnings (legacy rows with null eligibility mature by age).
  const credits = await prisma.walletTransaction.findMany({
    where: {
      type: 'EARNING', payoutId: null, amount: { gt: 0 },
      OR: [{ payoutEligibleAt: { lte: now } }, { AND: [{ payoutEligibleAt: null }, { createdAt: { lte: holdCutoff } }] }],
    },
    select: { id: true, amount: true, providerId: true, doctorId: true },
  })

  // Group by recipient.
  const groups = new Map<string, { kind: 'provider' | 'doctor'; id: string; total: number; txnIds: string[] }>()
  for (const c of credits) {
    const key = c.providerId ? `provider:${c.providerId}` : c.doctorId ? `doctor:${c.doctorId}` : null
    if (!key) continue
    const g = groups.get(key) ?? { kind: c.providerId ? 'provider' as const : 'doctor' as const, id: (c.providerId ?? c.doctorId)!, total: 0, txnIds: [] }
    g.total = r2(g.total + Number(c.amount)); g.txnIds.push(c.id)
    groups.set(key, g)
  }

  // Resolve payout details for each recipient.
  const recips: Recipient[] = []
  for (const g of groups.values()) {
    if (g.total < MIN_PAYOUT) continue
    if (g.kind === 'provider') {
      const p = await prisma.provider.findUnique({ where: { id: g.id }, select: { firstName: true, lastName: true, email: true, payoutMethod: true, bankName: true, bankAccountNo: true, bankAccountName: true, gcashNumber: true } })
      if (!p) continue
      const method = p.payoutMethod === 'gcash' ? 'gcash' : 'bank'
      const account = method === 'gcash' ? p.gcashNumber : p.bankAccountNo
      const missing = method === 'gcash' ? (!p.gcashNumber ? ['GCash number'] : []) : [!p.bankName && 'bank name', !p.bankAccountNo && 'account no.', !p.bankAccountName && 'account name'].filter(Boolean) as string[]
      recips.push({ kind: 'provider', id: g.id, name: `${p.firstName} ${p.lastName}`, email: p.email, total: g.total, txnIds: g.txnIds, method, bankName: p.bankName, account: account ?? null, accountName: p.bankAccountName ?? `${p.firstName} ${p.lastName}`, missing })
    } else {
      const d = await prisma.doctor.findUnique({ where: { id: g.id }, select: { firstName: true, lastName: true, email: true, payoutMethod: true, bankName: true, bankAccountNo: true, bankAccountName: true, gcashNumber: true } })
      if (!d) continue
      const method = d.payoutMethod === 'gcash' ? 'gcash' : 'bank'
      const account = method === 'gcash' ? d.gcashNumber : d.bankAccountNo
      const missing = method === 'gcash' ? (!d.gcashNumber ? ['GCash number'] : []) : [!d.bankName && 'bank name', !d.bankAccountNo && 'account no.', !d.bankAccountName && 'account name'].filter(Boolean) as string[]
      recips.push({ kind: 'doctor', id: g.id, name: `Dr. ${d.firstName} ${d.lastName}`, email: d.email, total: g.total, txnIds: g.txnIds, method, bankName: d.bankName, account: account ?? null, accountName: d.bankAccountName ?? `${d.firstName} ${d.lastName}`, missing })
    }
  }

  const results: { name: string; kind: string; amount: number; method: string; status: string; note?: string }[] = []
  const csvRows: string[] = ['Payee,Method,Bank,Account,Amount,PayoutId']

  for (const rc of recips) {
    if (rc.missing.length) { results.push({ name: rc.name, kind: rc.kind, amount: rc.total, method: rc.method, status: 'skipped', note: `missing ${rc.missing.join(', ')}` }); continue }
    if (dryRun) { results.push({ name: rc.name, kind: rc.kind, amount: rc.total, method: rc.method, status: 'would-pay' }); continue }

    // Allocate the credits + write the payout + the negative wallet entry atomically.
    const payout = await prisma.$transaction(async (tx) => {
      const po = await tx.payout.create({ data: {
        providerId: rc.kind === 'provider' ? rc.id : null,
        doctorId: rc.kind === 'doctor' ? rc.id : null,
        amount: rc.total, method: rc.method, account: rc.account, accountName: rc.accountName, status: 'PENDING',
        note: `Weekly payout · ${rc.txnIds.length} session(s)`,
      } })
      await tx.walletTransaction.updateMany({ where: { id: { in: rc.txnIds }, payoutId: null }, data: { payoutId: po.id } })
      const move = rc.kind === 'provider' ? providerWalletMove : doctorWalletMove
      await move(tx, rc.id, { amount: -rc.total, type: 'PAYOUT', payoutId: po.id, note: 'Weekly payout' })
      return po
    })

    // Try to disburse via the configured rail; otherwise it stays PENDING → CSV batch.
    const d = await disburse({ amount: rc.total, method: rc.method, bankName: rc.bankName, account: rc.account, accountName: rc.accountName, reference: payout.id, recipientEmail: rc.email })
    if (d.ok && d.ref) {
      await prisma.payout.update({ where: { id: payout.id }, data: { status: 'PAID', reference: d.ref } })
      results.push({ name: rc.name, kind: rc.kind, amount: rc.total, method: rc.method, status: 'paid' })
    } else {
      results.push({ name: rc.name, kind: rc.kind, amount: rc.total, method: rc.method, status: 'pending-manual', note: d.error })
      csvRows.push([rc.name, rc.method, rc.bankName ?? '', rc.account ?? '', rc.total.toFixed(2), payout.id].map((x) => csvEscape(String(x))).join(','))
    }
    // Tell the recipient their payout is on the way.
    await notify(rc.kind === 'provider'
      ? { to: 'PROVIDER', providerId: rc.id, type: 'PAYOUT', title: 'Payout on the way', body: `₱${rc.total.toLocaleString('en-PH')} for your completed sessions is being sent to your ${rc.method === 'gcash' ? 'GCash' : 'bank account'}.` }
      : { to: 'DOCTOR', doctorId: rc.id, type: 'PAYOUT', title: 'Payout on the way', body: `₱${rc.total.toLocaleString('en-PH')} for your completed consults is being sent to your ${rc.method === 'gcash' ? 'GCash' : 'bank account'}.` })
  }

  const csv = csvRows.length > 1 ? csvRows.join('\n') : ''
  if (format === 'csv') return new NextResponse(csv || 'No manual payouts.', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="nickel-payouts-${now.toISOString().slice(0, 10)}.csv"` } })

  const totalPaid = results.filter((r) => r.status === 'paid' || r.status === 'pending-manual').reduce((s, r) => s + r.amount, 0)
  return NextResponse.json({ ok: true, dryRun, ranAt: now.toISOString(), recipients: results.length, totalAmount: r2(totalPaid), results, csv })
}
