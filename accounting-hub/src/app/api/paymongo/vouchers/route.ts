import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const ACCOUNTS = ['AHEA', 'AHGH', 'VERDANA', 'AHI']
const LIMIT_TYPES = ['UNLIMITED', 'ONCE_PER_CUSTOMER', 'MAX_USES']

// GET — list vouchers (with redemption counts)
export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const vouchers = await prisma.voucher.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      account: { select: { id: true, accountNumber: true, accountTitle: true } },
      _count: { select: { redemptions: true } },
    },
  })
  return NextResponse.json(vouchers.map(v => ({
    id: v.id, name: v.name, code: v.code,
    discountType: v.discountType, discountValue: Number(v.discountValue),
    isLifetime: v.isLifetime,
    startDate: v.startDate ? v.startDate.toISOString().slice(0, 10) : null,
    endDate: v.endDate ? v.endDate.toISOString().slice(0, 10) : null,
    branches: v.branches, usageLimitType: v.usageLimitType, maxUses: v.maxUses,
    requiresPwdId: v.requiresPwdId,
    accountId: v.accountId, accountLabel: v.account ? `${v.account.accountNumber} ${v.account.accountTitle}` : null,
    isActive: v.isActive, uses: v._count.redemptions, createdAt: v.createdAt,
  })))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(b: any) {
  const discountType = b.discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE'
  const discountValue = Number(b.discountValue) || 0
  const usageLimitType = LIMIT_TYPES.includes(b.usageLimitType) ? b.usageLimitType : 'UNLIMITED'
  const branches: string[] = Array.isArray(b.branches) ? b.branches.filter((x: string) => ACCOUNTS.includes(x)) : []
  const isLifetime = !!b.isLifetime
  return {
    name: String(b.name || '').trim(),
    code: String(b.code || '').trim().toUpperCase(),
    discountType, discountValue,
    isLifetime,
    startDate: !isLifetime && b.startDate ? new Date(b.startDate) : null,
    endDate: !isLifetime && b.endDate ? new Date(b.endDate) : null,
    branches,
    usageLimitType,
    maxUses: usageLimitType === 'MAX_USES' ? (parseInt(String(b.maxUses), 10) || null) : null,
    // Only honoured for a payer whose Patient CRM record holds a PWD/Senior ID + photo.
    requiresPwdId: !!b.requiresPwdId,
    accountId: b.accountId || null,
    isActive: b.isActive === undefined ? true : !!b.isActive,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateShape(d: ReturnType<typeof normalise>): string | null {
  if (!d.name) return 'Voucher name is required'
  if (!d.code) return 'Voucher code is required'
  if (d.discountValue <= 0) return 'Discount value must be greater than zero'
  if (d.discountType === 'PERCENTAGE' && d.discountValue > 100) return 'A percentage discount cannot exceed 100%'
  if (!d.isLifetime && (!d.startDate || !d.endDate)) return 'Set both effectivity dates, or tick Lifetime'
  if (!d.isLifetime && d.startDate && d.endDate && d.startDate > d.endDate) return 'The start date must be on or before the end date'
  if (d.branches.length === 0) return 'Select at least one branch'
  if (d.usageLimitType === 'MAX_USES' && (!d.maxUses || d.maxUses < 1)) return 'Set a max number of uses'
  return null
}

// POST — create a voucher
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const d = normalise(await req.json())
    const err = validateShape(d)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const dup = await prisma.voucher.findUnique({ where: { code: d.code } })
    if (dup) return NextResponse.json({ error: `Code "${d.code}" is already used by another voucher` }, { status: 400 })
    const v = await prisma.voucher.create({ data: { ...d, createdById: session.user.id ?? null } })
    return NextResponse.json(v, { status: 201 })
  } catch (e) {
    console.error('Voucher create error:', e)
    return NextResponse.json({ error: 'Failed to create voucher' }, { status: 500 })
  }
}

// PUT { id, ... } — update a voucher
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const d = normalise(b)
    const err = validateShape(d)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const dup = await prisma.voucher.findFirst({ where: { code: d.code, id: { not: b.id } } })
    if (dup) return NextResponse.json({ error: `Code "${d.code}" is already used by another voucher` }, { status: 400 })
    const v = await prisma.voucher.update({ where: { id: b.id }, data: d })
    return NextResponse.json(v)
  } catch (e) {
    console.error('Voucher update error:', e)
    return NextResponse.json({ error: 'Failed to update voucher' }, { status: 500 })
  }
}

// DELETE ?id= — remove a voucher (redemptions cascade). Blocked once it has been used,
// so the discount history behind past checkouts is never silently erased.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const uses = await prisma.voucherRedemption.count({ where: { voucherId: id } })
  if (uses > 0) {
    return NextResponse.json({ error: `This voucher has ${uses} redemption(s) — deactivate it instead of deleting.` }, { status: 400 })
  }
  await prisma.voucher.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
