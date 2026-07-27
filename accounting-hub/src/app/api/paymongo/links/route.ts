import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isPaymongoAccount, PAYMONGO_ACCOUNTS } from '@/lib/paymongo'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const branchOf = (a: string) => PAYMONGO_ACCOUNTS.find(x => x.code === a)?.branch || null

// GET ?account= — reusable links for an account, with how many payments each has taken.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const account = String(new URL(req.url).searchParams.get('account') || '').toUpperCase()
  if (!isPaymongoAccount(account)) return NextResponse.json({ error: 'Invalid account' }, { status: 400 })

  const links = await prisma.paymentLink.findMany({ where: { account }, orderBy: { createdAt: 'desc' } })
  const ids = links.map(l => l.id)
  // Payment counts per link (only real, paid ones).
  const paid = ids.length
    ? await prisma.paymongoCheckout.groupBy({ by: ['paymentLinkId'], where: { paymentLinkId: { in: ids }, status: 'PAID' }, _count: { _all: true } })
    : []
  const paidMap = new Map(paid.map(p => [p.paymentLinkId, p._count._all]))

  return NextResponse.json(links.map(l => ({
    id: l.id, token: l.token, itemName: l.itemName, department: l.department,
    quantity: l.quantity, unitPrice: Number(l.unitPrice),
    amount: Number(l.unitPrice) * l.quantity,
    allowVoucher: l.allowVoucher, isActive: l.isActive,
    kind: l.serviceId ? 'SERVICE' : 'PRODUCT',
    paidCount: paidMap.get(l.id) || 0,
    createdAt: l.createdAt,
  })))
}

// POST { account, kind, itemId, quantity?, allowVoucher? } — create a reusable link.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    const account = String(b.account || '').toUpperCase()
    if (!isPaymongoAccount(account)) return NextResponse.json({ error: 'Valid account is required' }, { status: 400 })
    const kind = b.kind === 'PRODUCT' ? 'PRODUCT' : 'SERVICE'
    const itemId = String(b.itemId || '')
    if (!itemId) return NextResponse.json({ error: 'Select a service or product' }, { status: 400 })
    const quantity = Math.max(1, parseInt(String(b.quantity ?? 1), 10) || 1)

    // Price + department come from our catalogue, never the client.
    let itemName = '', department: string | null = null, unitPrice = 0
    let serviceId: string | null = null, inventoryItemId: string | null = null
    if (kind === 'SERVICE') {
      const svc = await prisma.service.findUnique({ where: { id: itemId }, select: { id: true, name: true, price: true, department: true, isActive: true } })
      if (!svc || !svc.isActive) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
      serviceId = svc.id; itemName = svc.name; unitPrice = Number(svc.price); department = svc.department
    } else {
      const inv = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true, name: true, sellingPrice: true, skuDepartment: true, isActive: true } })
      if (!inv || !inv.isActive) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      if (inv.sellingPrice == null) return NextResponse.json({ error: `"${inv.name}" has no selling price set` }, { status: 400 })
      inventoryItemId = inv.id; itemName = inv.name; unitPrice = Number(inv.sellingPrice); department = inv.skuDepartment
    }
    if (!(unitPrice > 0)) return NextResponse.json({ error: 'The selected item has no price' }, { status: 400 })

    const link = await prisma.paymentLink.create({
      data: {
        token: crypto.randomBytes(9).toString('base64url'),   // ~12 chars, unguessable
        account, branch: branchOf(account),
        serviceId, inventoryItemId, itemName, department, quantity, unitPrice,
        allowVoucher: b.allowVoucher !== false,
        createdById: session.user.id ?? null,
      },
    })
    return NextResponse.json({ id: link.id, token: link.token, itemName, amount: unitPrice * quantity }, { status: 201 })
  } catch (e) {
    console.error('Payment link create error:', e)
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 })
  }
}

// PATCH { id, isActive } — enable/disable a link (paid history is kept either way).
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const link = await prisma.paymentLink.update({ where: { id: b.id }, data: { isActive: !!b.isActive } })
  return NextResponse.json({ id: link.id, isActive: link.isActive })
}

// DELETE ?id= — only when it has never been paid; otherwise deactivate it.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const used = await prisma.paymongoCheckout.count({ where: { paymentLinkId: id, status: 'PAID' } })
  if (used > 0) return NextResponse.json({ error: `This link has ${used} paid payment(s) — deactivate it instead of deleting.` }, { status: 400 })
  await prisma.paymongoCheckout.updateMany({ where: { paymentLinkId: id }, data: { paymentLinkId: null } })
  await prisma.paymentLink.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
