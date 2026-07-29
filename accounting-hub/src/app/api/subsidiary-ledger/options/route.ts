/**
 * Filter options for the Subsidiary Ledger page.
 *
 *   GET /api/subsidiary-ledger/options?includeInactive=true
 *     → { accounts: [{ id, accountNumber, accountTitle, accountType, isActive }],
 *         refTypes: ['AR_PAYMENT', 'POS_ORDER', ...] }
 *
 * `refTypes` are the transaction types actually present in the GL, so the
 * dropdown never offers a type with zero postings.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true'

  try {
    const [accounts, refTypes] = await Promise.all([
      prisma.account.findMany({
        where: includeInactive ? {} : { isActive: true },
        select: { id: true, accountNumber: true, accountTitle: true, accountType: true, isActive: true },
        orderBy: { accountNumber: 'asc' },
      }),
      prisma.journalEntry.findMany({
        distinct: ['referenceType'],
        select: { referenceType: true },
        orderBy: { referenceType: 'asc' },
      }),
    ])

    return NextResponse.json({
      accounts,
      refTypes: refTypes.map(r => r.referenceType),
    })
  } catch (err) {
    console.error('[GET /api/subsidiary-ledger/options]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
