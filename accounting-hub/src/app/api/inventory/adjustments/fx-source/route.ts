import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?currency=CNY — foreign-currency bank accounts with their available balance
// and the weighted exchange rate their money was actually bought at.
//
// The rate comes from forex purchases recorded in Fund Transfer / Bank Recon:
// cross-currency FundTransfers into the account carry `amount` (PHP that left the
// source) and `toAmount` (foreign units that landed), so the weighted purchase
// rate is Σ PHP / Σ foreign across those buys. If the account has no recorded
// forex purchase, the latest Bank-Recon exchange rate for the currency is offered
// as a fallback.
//
// Balance = Σ(received − spent) over the account's non-excluded Bank Recon lines
// (in the account's own currency).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currency = (new URL(req.url).searchParams.get('currency') || 'CNY').toUpperCase()

  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true, currency },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true, isForexAccount: true },
    orderBy: { accountNumber: 'asc' },
  })
  if (accounts.length === 0) return NextResponse.json({ currency, accounts: [] })
  const ids = accounts.map(a => a.id)

  const [transfers, txSums, latestRate] = await Promise.all([
    // Forex buys INTO these accounts (cross-currency transfers have toAmount set).
    prisma.fundTransfer.findMany({
      where: { toAccountId: { in: ids }, toAmount: { not: null } },
      select: { toAccountId: true, refNumber: true, date: true, amount: true, toAmount: true, exchangeRate: true },
      orderBy: { date: 'asc' },
    }),
    prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { bankAccountId: { in: ids }, status: { not: 'EXCLUDED' } },
      _sum: { received: true, spent: true },
    }),
    prisma.exchangeRate.findFirst({ where: { currency }, orderBy: { date: 'desc' } }),
  ])

  const sumMap = new Map(txSums.map(t => [t.bankAccountId, Number(t._sum.received || 0) - Number(t._sum.spent || 0)]))

  const result = accounts.map(a => {
    const buys = transfers.filter(t => t.toAccountId === a.id && Number(t.toAmount) > 0)
    const phpTotal = buys.reduce((s, t) => s + Number(t.amount), 0)
    const fxTotal = buys.reduce((s, t) => s + Number(t.toAmount), 0)
    const weightedRate = fxTotal > 0 ? phpTotal / fxTotal : null
    return {
      ...a,
      balance: sumMap.get(a.id) ?? 0,
      weightedRate,
      phpTotal,
      fxTotal,
      purchases: buys.map(t => ({
        refNumber: t.refNumber,
        date: t.date.toISOString().slice(0, 10),
        php: Number(t.amount),
        foreign: Number(t.toAmount),
        rate: Number(t.toAmount) > 0 ? Number(t.amount) / Number(t.toAmount) : null,
      })),
      fallbackRate: latestRate ? { phpPerUnit: Number(latestRate.phpPerUnit), date: latestRate.date.toISOString().slice(0, 10), source: latestRate.source } : null,
    }
  })

  return NextResponse.json({ currency, accounts: result })
}
