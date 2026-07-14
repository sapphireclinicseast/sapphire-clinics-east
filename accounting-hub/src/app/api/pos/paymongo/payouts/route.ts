import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'
import { resolvePaymongoAccounts } from '@/lib/accounting/paymongo-accounts'
import { syncPayouts } from '@/lib/accounting/paymongo-payouts'

// Reconciliation is an accounting action.
const RECON_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const SYNC_THROTTLE_MS = 60 * 60 * 1000 // auto-poll at most hourly on page load

async function getSettings() {
  return prisma.paymongoSettings.findUnique({ where: { id: 'singleton' } })
}

// GET → unsettled paid transactions + settled batches + auto-reconcile settings.
// Also runs a throttled payout sync so opening the page auto-books new payouts.
export async function GET() {
  const session = await auth()
  if (!session?.user || !RECON_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const settings = await getSettings()
  const stale = !settings?.lastSyncAt || (Date.now() - new Date(settings.lastSyncAt).getTime()) > SYNC_THROTTLE_MS
  if (settings?.autoReconcile && settings.bankAccountId && stale) {
    try { await syncPayouts(prisma, session.user.id) } catch (e) { console.error('[PayMongo] on-load sync failed:', e) }
  }

  const unsettled = await prisma.paymongoCheckout.findMany({
    where: { status: 'PAID', payoutId: null },
    orderBy: { paidAt: 'asc' },
    select: { id: true, referenceCode: true, description: true, branch: true, amount: true, fee: true, netAmount: true, paidAt: true, livemode: true },
  })
  const settled = await prisma.paymongoCheckout.findMany({
    where: { status: 'PAID', payoutId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, payoutId: true, referenceCode: true, amount: true, fee: true, netAmount: true, paidAt: true },
  })
  const netTotal = unsettled.reduce((s, r) => s + Number(r.netAmount ?? (Number(r.amount) - Number(r.fee || 0))), 0)
  const fresh = await getSettings()
  return NextResponse.json({
    unsettled, settled, netTotal,
    settings: { bankAccountId: fresh?.bankAccountId ?? null, autoReconcile: fresh?.autoReconcile ?? true, lastSyncAt: fresh?.lastSyncAt ?? null },
  })
}

// POST — three actions:
//   { action: 'settings', bankAccountId, autoReconcile }  → save auto-reconcile config
//   { action: 'sync' }                                    → force a payout sync now
//   { bankAccountId, checkoutIds? }                       → manual settle (fallback)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !RECON_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()

    if (body.action === 'settings') {
      if (body.bankAccountId) {
        const bank = await prisma.account.findUnique({ where: { id: body.bankAccountId }, select: { accountType: true } })
        if (!bank || bank.accountType !== 'ASSET') return NextResponse.json({ error: 'Bank account not found' }, { status: 400 })
      }
      const data = { bankAccountId: body.bankAccountId || null, autoReconcile: body.autoReconcile !== false }
      const saved = await prisma.paymongoSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data })
      return NextResponse.json({ ok: true, settings: { bankAccountId: saved.bankAccountId, autoReconcile: saved.autoReconcile } })
    }

    if (body.action === 'sync') {
      const res = await syncPayouts(prisma, session.user.id)
      return NextResponse.json({ ok: true, ...res })
    }

    // Manual settle (fallback): post DR Bank / CR Clearing for the combined net.
    const { bankAccountId, checkoutIds, payoutDate } = body
    if (!bankAccountId) return NextResponse.json({ error: 'Select the bank account the payout landed in' }, { status: 400 })

    const bank = await prisma.account.findUnique({ where: { id: bankAccountId }, select: { id: true, accountType: true } })
    if (!bank || bank.accountType !== 'ASSET') return NextResponse.json({ error: 'Bank account not found' }, { status: 400 })

    const rows = await prisma.paymongoCheckout.findMany({
      where: {
        status: 'PAID', payoutId: null,
        ...(Array.isArray(checkoutIds) && checkoutIds.length ? { id: { in: checkoutIds } } : {}),
      },
      select: { id: true, amount: true, fee: true, netAmount: true, branch: true },
    })
    if (!rows.length) return NextResponse.json({ error: 'Nothing to reconcile' }, { status: 400 })

    const net = rows.reduce((s, r) => s + Number(r.netAmount ?? (Number(r.amount) - Number(r.fee || 0))), 0)
    if (!(net > 0)) return NextResponse.json({ error: 'Net payout is zero' }, { status: 400 })

    const when = payoutDate ? new Date(`${payoutDate}T08:00:00+08:00`) : new Date()
    const stamp = when.toISOString().slice(0, 10).replace(/-/g, '')
    const payoutId = `PM-PAYOUT-${stamp}-${rows.length}`

    const { clearingAccountId } = await resolvePaymongoAccounts(prisma, session.user.id)
    const branches = new Set(rows.map(r => r.branch).filter(Boolean))
    const branch = branches.size === 1 ? (rows[0].branch as string) : 'ALL'

    await postJournalEntry(prisma, {
      entryDate: when,
      description: `PayMongo payout to bank — ${rows.length} transaction(s)`,
      referenceType: 'PAYMONGO_PAYOUT',
      referenceId: payoutId,
      branch,
      createdById: session.user.id,
      lines: [
        { accountId: bank.id, debit: net, description: 'PayMongo payout received' },
        { accountId: clearingAccountId, credit: net, description: 'PayMongo clearing settled' },
      ],
    })

    await prisma.paymongoCheckout.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { payoutId } })
    return NextResponse.json({ ok: true, payoutId, count: rows.length, net })
  } catch (e) {
    console.error('PayMongo payout reconcile error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to reconcile' }, { status: 500 })
  }
}
