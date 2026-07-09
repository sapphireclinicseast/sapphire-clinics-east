/**
 * GET /api/internal/bank-accounts
 *
 * Internal endpoint consumed by the HR Hub (Uniform Order — recording where a
 * staff member's paid extra was deposited). Returns active accounts flagged as
 * bank accounts.
 *
 * Auth: x-api-key: ${ACCOUNTING_INTERNAL_KEY}  (default matches HR's default)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const KEY = process.env.ACCOUNTING_INTERNAL_KEY || process.env.HR_INTERNAL_KEY || 'scei-internal-2026'

function verify(req: NextRequest): boolean {
  const k = req.headers.get('x-api-key')
  const bearer = req.headers.get('authorization')
  return k === KEY || bearer === `Bearer ${KEY}`
}

export async function GET(req: NextRequest) {
  if (!verify(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const accounts = await prisma.account.findMany({
      where: { isBankAccount: true, isActive: true },
      orderBy: { accountNumber: 'asc' },
      select: { id: true, accountNumber: true, accountTitle: true, currency: true },
    })
    return NextResponse.json({
      ok: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        number: a.accountNumber,
        title: a.accountTitle,
        currency: a.currency,
        label: `${a.accountNumber} — ${a.accountTitle}`,
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load bank accounts'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
