import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkVoucher } from '@/lib/vouchers'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// POST { code, account, amountPhp, email? } — preview a voucher without consuming it.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json()
  const res = await checkVoucher(prisma, {
    code: String(b.code || ''),
    account: String(b.account || '').toUpperCase(),
    amountPhp: Number(b.amountPhp) || 0,
    // Item context for a department-scoped voucher: the service's department,
    // or null for products. Omitting it refuses department-scoped codes.
    department: b.department === undefined ? undefined : (b.department || null),
    customerEmail: b.email || null,
  })
  return NextResponse.json(res)
}
