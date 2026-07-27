import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listPayments, parsePayment, retrieveCheckout, paymongoConfigured, isPaymongoAccount, configuredAccounts, resolvePaymentMethodUsed } from '@/lib/paymongo'
import { postPaymongoSale } from '@/lib/accounting/post-paymongo-sale'
import { PAYMONGO_READ_ROLES as READ_ROLES, canReadPaymongoAccount } from '@/lib/paymongo-access'

// Friendly department names, matching the labels used in the reports drill-down.
const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology', SPED: 'Special Education',
  PSY: 'Psychology', PSYCHOLOGY: 'Psychology', MD: 'Medical Doctor',
  CLI: 'Clinic', DIG: 'Digital & Tech', EDU: 'Training & Education',
  MER: 'Merchandise', ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis', OTHER: 'Other',
}

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
  // Front desk only sees their own branch's account.
  if (!canReadPaymongoAccount(session.user.role as string, account)) {
    return NextResponse.json({ error: 'Not your branch' }, { status: 403 })
  }

  const configured = paymongoConfigured(account)
  let syncError: string | null = null
  const postWarnings: string[] = []
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

          // The payer typed their details on PayMongo's hosted page — capture them from the
          // payment's billing object. `name` is one field there, so split it on the last
          // space into first/last for the table (single-word names go to first name).
          const billing = (payment.attributes?.billing || {}) as { name?: string; email?: string; phone?: string }
          const fullName = String(billing.name || '').trim()
          const cut = fullName.lastIndexOf(' ')
          const firstName = cut > 0 ? fullName.slice(0, cut).trim() : fullName
          const lastName = cut > 0 ? fullName.slice(cut + 1).trim() : ''
          const payerEmail = String(billing.email || '').trim() || null

          await prisma.paymongoCheckout.update({
            where: { id: rec.id },
            data: {
              status: 'PAID', paymentId: p.paymentId, fee: p.feePhp, netAmount: p.netPhp, paidAt: p.paidAt, raw: payment as object,
              // Which instrument was used → picks the POS PaymentMode on conversion.
              ...(resolvePaymentMethodUsed(payment) ? { paymentMethodUsed: resolvePaymentMethodUsed(payment) } : {}),
              // Don't blank anything already recorded if PayMongo returns an empty billing object.
              ...(firstName ? { customerFirstName: firstName } : {}),
              ...(lastName ? { customerLastName: lastName } : {}),
              ...(payerEmail ? { customerEmail: payerEmail } : {}),
              ...(billing.phone ? { customerPhone: String(billing.phone).trim() } : {}),
            },
          })

          // Attach the payer's email to the voucher redemption reserved at link creation, so
          // ONCE_PER_CUSTOMER is enforceable from here on. Flag a repeat rather than silently
          // allowing it — the money is already collected, so this is a report, not a block.
          if (rec.voucherId && payerEmail) {
            const em = payerEmail.toLowerCase()
            const v = await prisma.voucher.findUnique({ where: { id: rec.voucherId }, select: { usageLimitType: true, code: true } })
            if (v?.usageLimitType === 'ONCE_PER_CUSTOMER') {
              const prior = await prisma.voucherRedemption.count({
                where: { voucherId: rec.voucherId, customerEmail: em, checkoutId: { not: rec.checkoutId } },
              })
              if (prior > 0) postWarnings.push(`${rec.referenceCode || rec.checkoutId}: voucher ${v.code} is once-per-customer but ${em} had already used it`)
            }
            await prisma.voucherRedemption.updateMany({ where: { checkoutId: rec.checkoutId }, data: { customerEmail: em } })
          }
          // Book the collection: cash into clearing, the obligation into unearned revenue.
          // Revenue is recognised later, by the order raised from the clinic schedule.
          try {
            const posted = await postPaymongoSale(prisma, { checkoutId: rec.checkoutId, userId: session.user!.id as string })
            if (!posted.posted && posted.reason && !['already posted', 'GL posting off', 'test mode', 'posted via POS order'].includes(posted.reason)) {
              postWarnings.push(`${rec.referenceCode || rec.checkoutId}: ${posted.reason}`)
            }
          } catch (e) { console.error('[PayMongo] posting sale failed:', e) }
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
      serviceId: true, inventoryItemId: true,
      customerFirstName: true, customerLastName: true, customerEmail: true, customerPhone: true,
      voucherCode: true, grossAmount: true, discountAmount: true,
      amount: true, status: true, checkoutUrl: true, fee: true, netAmount: true,
      paidAt: true, payoutId: true, livemode: true, createdAt: true,
      paymentMethodUsed: true, convertedAt: true, orderId: true,
    },
  })

  // Resolve each row's department: Service.department for services, SKU department for
  // products. Done in two batched lookups rather than per-row joins.
  const svcIds = [...new Set(rows.map(r => r.serviceId).filter(Boolean))] as string[]
  const invIds = [...new Set(rows.map(r => r.inventoryItemId).filter(Boolean))] as string[]
  const [svcs, invs] = await Promise.all([
    svcIds.length ? prisma.service.findMany({ where: { id: { in: svcIds } }, select: { id: true, department: true } }) : [],
    invIds.length ? prisma.inventoryItem.findMany({ where: { id: { in: invIds } }, select: { id: true, skuDepartment: true } }) : [],
  ])
  const svcDept = new Map(svcs.map(x => [x.id, x.department]))
  const invDept = new Map(invs.map(x => [x.id, x.skuDepartment]))
  const deptOf = (r: { serviceId: string | null; inventoryItemId: string | null }) =>
    (r.serviceId ? svcDept.get(r.serviceId) : r.inventoryItemId ? invDept.get(r.inventoryItemId) : null) || null

  return NextResponse.json({
    account, configured, syncError,
    postWarnings,
    transactions: rows.map(r => ({
      ...r,
      department: deptOf(r),
      departmentLabel: DEPT_LABELS[(deptOf(r) || '').toUpperCase()] || deptOf(r),
      kind: r.serviceId ? 'SERVICE' : r.inventoryItemId ? 'PRODUCT' : null,
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
