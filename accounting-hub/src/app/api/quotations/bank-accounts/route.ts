/**
 * The bank accounts a client can deposit a downpayment into.
 *
 * Straight from the chart of accounts — every active account flagged
 * `isBankAccount` — so the list can never drift from the books. The bank itself
 * isn't a column; it lives inside the account title ("AHEA BDO Checking
 * Account"), so it is pulled out here once rather than in each caller.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bankFromTitle } from '@/lib/quotations/banks'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true, bankRetiredAt: null },
    select: { id: true, accountNumber: true, accountTitle: true, branch: true, currency: true },
    orderBy: { accountTitle: 'asc' },
  })

  return NextResponse.json({
    accounts: accounts.map(a => ({ ...a, bankName: bankFromTitle(a.accountTitle) })),
  })
}
