import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET → active Chart-of-Accounts accounts flagged as bank accounts.
// ?includeRetired=1 also returns retired/inactive bank accounts (with their
// flags) so historical transactions can be tagged to a since-closed account.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const includeRetired = new URL(req.url).searchParams.get('includeRetired') === '1'
  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, ...(includeRetired ? {} : { isActive: true, bankRetiredAt: null }) },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true, isCheckingAccount: true, isActive: true, bankRetiredAt: true },
    orderBy: { accountNumber: 'asc' },
  })
  return NextResponse.json(accounts)
}
