import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isPaymongoAccount, PAYMONGO_ACCOUNTS } from '@/lib/paymongo'

import { PAYMONGO_READ_ROLES as ROLES, canReadPaymongoAccount } from '@/lib/paymongo-access'

// Service.branch is its own enum (ServiceBranch) that also allows ALL.
const SERVICE_BRANCH: Record<string, string> = {
  AHEA: 'SANDBOX_EAST', AHGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE',
}

/**
 * GET ?account=AHEA — the services and products that can be charged on this account.
 * Branch-scoped (plus ALL-branch rows) so each subsection only offers its own catalogue.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const account = String(new URL(req.url).searchParams.get('account') || '').toUpperCase()
  if (!isPaymongoAccount(account)) return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
  if (!canReadPaymongoAccount(session.user.role as string, account)) {
    return NextResponse.json({ error: 'Not your branch' }, { status: 403 })
  }
  const branch = PAYMONGO_ACCOUNTS.find(a => a.code === account)!.branch
  const svcBranch = SERVICE_BRANCH[account]

  const [services, products] = await Promise.all([
    prisma.service.findMany({
      where: { isActive: true, branch: { in: [svcBranch, 'ALL'] as never } },
      select: { id: true, name: true, price: true, department: true },
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true, branch: { in: [branch, 'ALL'] as never }, sellingPrice: { not: null } },
      select: { id: true, name: true, sku: true, sellingPrice: true, quantity: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    account,
    services: services.map(s => ({ id: s.id, name: s.name, price: Number(s.price), department: s.department })),
    products: products.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: Number(p.sellingPrice), stock: p.quantity })),
  })
}
