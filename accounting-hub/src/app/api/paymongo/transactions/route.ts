import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listPayments, parsePayment, retrieveCheckout, paymongoConfigured, isPaymongoAccount, configuredAccounts } from '@/lib/paymongo'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * GET ?account=AHEA[&sync=1] — transactions for one PayMongo account.
 *
 * Always returns our stored checkouts for the account. With sync=1 it first refreshes any
 * PENDING links from PayMongo (so a paid link flips to PAID without waiting for a webhook)
 * and also returns the account's recent raw PayMongo payments, which covers money taken
 * outside our links.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const account = String(sp.get('account') || '').toUpperCase()
  if (!account) return NextResponse.json({ accounts: configuredAccounts() })
  if (!isPaymongoAccount(account)) return NextResponse.json({ error: 'Invalid account' }, { status: 400 })

  const configured = paymongoConfigured(account)
  let syncError: string | null = null
  let livePayments: { paymentId: string; amount: number; fee: number; net: number; status: string; paidAt: string | null; description: string; payer: string }[] = []

  if (sp.get('sync') === '1' && configured) {
    // 1) Refresh PENDING checkouts for this account.
    try {
      const pending = await prisma.paymongoCheckout.findMany({
        where: { account, status: 'PENDING', checkoutId: { not: '' } },
        orderBy: { createdAt: 'desc' }, take: 40,
      })
      for (const rec of pending) {
        try {
          const cs = await retrieveCheckout(account, rec.checkoutId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payment = (cs?.attributes?.payments || [])[0] as any
          if (!payment) continue
          const p = parsePayment(payment)
          if (p.status !== 'paid') continue
          await prisma.paymongoCheckout.update({
            where: { id: rec.id },
            data: { status: 'PAID', paymentId: p.paymentId, fee: p.feePhp, netAmount: p.netPhp, paidAt: p.paidAt, raw: payment as object },
          })
        } catch (e) { console.warn('[PayMongo] refresh checkout failed:', e) }
      }
    } catch (e) { syncError = e instanceof Error ? e.message : 'Sync failed' }

    // 2) Recent raw payments straight from the account.
    try {
      const raw = await listPayments(account, { limit: 50 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      livePayments = raw.map((r: any) => {
        const p = parsePayment(r)
        const a = r?.attributes || {}
        const billing = a.billing || {}
        return {
          paymentId: p.paymentId, amount: p.amountPhp, fee: p.feePhp, net: p.netPhp,
          status: p.status, paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          description: a.description || a.remarks || '',
          payer: billing.name || billing.email || '',
        }
      })
    } catch (e) { syncError = syncError || (e instanceof Error ? e.message : 'Could not list payments') }
  }

  const rows = await prisma.paymongoCheckout.findMany({
    where: { account },
    orderBy: { createdAt: 'desc' }, take: 200,
    select: {
      id: true, checkoutId: true, referenceCode: true, itemName: true, description: true,
      customerFirstName: true, customerLastName: true, customerEmail: true, customerPhone: true,
      voucherCode: true, grossAmount: true, discountAmount: true,
      amount: true, status: true, checkoutUrl: true, fee: true, netAmount: true,
      paidAt: true, payoutId: true, livemode: true, createdAt: true,
    },
  })

  return NextResponse.json({
    account, configured, syncError,
    transactions: rows.map(r => ({
      ...r,
      customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' '),
      grossAmount: r.grossAmount == null ? null : Number(r.grossAmount),
      discountAmount: r.discountAmount == null ? null : Number(r.discountAmount),
      amount: Number(r.amount),
      fee: r.fee == null ? null : Number(r.fee),
      netAmount: r.netAmount == null ? null : Number(r.netAmount),
    })),
    livePayments,
  })
}
