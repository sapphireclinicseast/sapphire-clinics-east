import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'HMO_OFFICER']

/** GET /api/accounts-receivable/invoice-settings → returns all rows as an array */
export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const rows = await prisma.invoiceSettings.findMany({ orderBy: { branch: 'asc' } })
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PUT /api/accounts-receivable/invoice-settings
 *  Body: { branch, companyName?, address?, phone?, email? }
 *  Upserts the row for that branch.
 */
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, companyName, tradeName, address, phone, email } = await req.json()
    if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

    const data = {
      companyName: companyName ?? null,
      tradeName: tradeName ?? null,
      address: address ?? null,
      phone: phone ?? null,
      email: email ?? null,
    }

    const row = await prisma.invoiceSettings.upsert({
      where: { branch },
      update: data,
      create: { branch, ...data },
    })
    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
