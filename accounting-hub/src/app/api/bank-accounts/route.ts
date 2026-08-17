import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET → active Chart-of-Accounts accounts flagged as bank accounts.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true, bankRetiredAt: null },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true, isCheckingAccount: true },
    orderBy: { accountNumber: 'asc' },
  })
  return NextResponse.json(accounts)
}
