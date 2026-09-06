// Discount vouchers (POS → Services → Vouchers).
//   GET   → list batches with their vouchers and counts
//   POST  { count, discountKind: PERCENTAGE|FIXED|FREE, value, validUntil, reason }
//         → generate `count` uniquely-coded vouchers in one batch
//   PUT   { batchId, ... } → edit a batch (reason, discount, validity, departments);
//         applies to all its not-yet-redeemed vouchers from then on
//   PATCH { voucherId } | { batchId } → void one voucher / every unused voucher in a batch
// Creating and voiding is restricted to ADMIN / ACCOUNTANT / BOOKKEEPER;
// front desk and branch admins can view (redemption happens through order
// creation, which validates the voucher server-side).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const READ_ROLES = [...WRITE_ROLES, 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'VIEWER']

// Unambiguous alphabet (no 0/O/1/I/L) — codes are read aloud and typed as
// often as they are scanned.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return `VC-${s}`
}

const num = (v: unknown) => Number(v || 0)

// Service departments a batch can be scoped to (same set as DiscountSetting).
const VALID_DEPARTMENTS = ['PT', 'MD', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'ORTHOSIS_PROSTHESIS']

export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const batches = await prisma.serviceVoucherBatch.findMany({
    include: { vouchers: { orderBy: { code: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  const now = new Date()
  return NextResponse.json({
    canWrite: WRITE_ROLES.includes(session.user.role as string),
    batches: batches.map(b => {
      const expired = b.validUntil < now
      const counts = { total: b.vouchers.length, active: 0, used: 0, voided: 0 }
      for (const v of b.vouchers) {
        if (v.status === 'USED') counts.used++
        else if (v.status === 'VOIDED') counts.voided++
        else counts.active++
      }
      return {
        id: b.id, reason: b.reason, discountKind: b.discountKind, value: num(b.value),
        validUntil: b.validUntil, expired, departments: b.departments, createdAt: b.createdAt, counts,
        vouchers: b.vouchers.map(v => ({ id: v.id, code: v.code, status: v.status, usedAt: v.usedAt, usedOrderId: v.usedOrderId })),
      }
    }),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Only Admin, Accountant, and Bookkeeper accounts can generate vouchers' }, { status: 403 })
  try {
    const b = await req.json()
    const count = Math.round(num(b.count))
    const discountKind = String(b.discountKind || '')
    const value = num(b.value)
    const reason = String(b.reason || '').trim()
    const departments: string[] = Array.isArray(b.departments) ? b.departments.filter((x: string) => VALID_DEPARTMENTS.includes(x)) : []
    if (!(count > 0) || count > 1000) return NextResponse.json({ error: 'Number of vouchers must be between 1 and 1,000' }, { status: 400 })
    if (!['PERCENTAGE', 'FIXED', 'FREE'].includes(discountKind)) return NextResponse.json({ error: 'Pick a discount type' }, { status: 400 })
    if (discountKind === 'PERCENTAGE' && !(value > 0 && value <= 100)) return NextResponse.json({ error: 'Percentage must be between 1 and 100' }, { status: 400 })
    if (discountKind === 'FIXED' && !(value > 0)) return NextResponse.json({ error: 'Enter the peso amount of the discount' }, { status: 400 })
    if (!b.validUntil) return NextResponse.json({ error: 'Validity date is required' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'Reason for creating the vouchers is required' }, { status: 400 })
    // Vouchers are valid through the END of the chosen day.
    const validUntil = new Date(`${String(b.validUntil).slice(0, 10)}T23:59:59.999`)
    if (isNaN(+validUntil)) return NextResponse.json({ error: 'Invalid validity date' }, { status: 400 })

    // Generate unique codes up front (collision-checked against the table).
    const codes = new Set<string>()
    while (codes.size < count) codes.add(randomCode())
    const clashes = await prisma.serviceVoucher.findMany({ where: { code: { in: [...codes] } }, select: { code: true } })
    for (const c of clashes) {
      codes.delete(c.code)
      while (codes.size < count) {
        const fresh = randomCode()
        if (!clashes.some(x => x.code === fresh)) codes.add(fresh)
      }
    }

    const batch = await prisma.serviceVoucherBatch.create({ data: {
      reason, discountKind, value: discountKind === 'FREE' ? 0 : value, validUntil, departments,
      createdById: (session.user.id as string) || null,
      vouchers: { create: [...codes].map(code => ({ code })) },
    }, include: { vouchers: true } })
    return NextResponse.json({ id: batch.id, count: batch.vouchers.length })
  } catch (e) {
    console.error('Voucher batch create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

// Edit a batch after creation. Changes take effect for every voucher not yet
// redeemed (validation always reads the batch); already-redeemed vouchers keep
// the discount their order recorded at the time.
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Only Admin, Accountant, and Bookkeeper accounts can edit vouchers' }, { status: 403 })
  try {
    const b = await req.json()
    const batch = await prisma.serviceVoucherBatch.findUnique({ where: { id: String(b.batchId || '') } })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    const discountKind = String(b.discountKind || batch.discountKind)
    const value = b.value !== undefined ? num(b.value) : num(batch.value)
    const reason = b.reason !== undefined ? String(b.reason).trim() : batch.reason
    if (!['PERCENTAGE', 'FIXED', 'FREE'].includes(discountKind)) return NextResponse.json({ error: 'Pick a discount type' }, { status: 400 })
    if (discountKind === 'PERCENTAGE' && !(value > 0 && value <= 100)) return NextResponse.json({ error: 'Percentage must be between 1 and 100' }, { status: 400 })
    if (discountKind === 'FIXED' && !(value > 0)) return NextResponse.json({ error: 'Enter the peso amount of the discount' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
    let validUntil = batch.validUntil
    if (b.validUntil) {
      validUntil = new Date(`${String(b.validUntil).slice(0, 10)}T23:59:59.999`)
      if (isNaN(+validUntil)) return NextResponse.json({ error: 'Invalid validity date' }, { status: 400 })
    }
    const departments: string[] = Array.isArray(b.departments)
      ? b.departments.filter((x: string) => VALID_DEPARTMENTS.includes(x))
      : batch.departments
    await prisma.serviceVoucherBatch.update({ where: { id: batch.id }, data: {
      reason, discountKind, value: discountKind === 'FREE' ? 0 : value, validUntil, departments,
    } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Voucher batch edit error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Only Admin, Accountant, and Bookkeeper accounts can void vouchers' }, { status: 403 })
  try {
    const b = await req.json()
    if (b.voucherId) {
      const v = await prisma.serviceVoucher.findUnique({ where: { id: String(b.voucherId) } })
      if (!v) return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
      if (v.status === 'USED') return NextResponse.json({ error: 'This voucher has already been redeemed — it cannot be voided' }, { status: 400 })
      await prisma.serviceVoucher.update({ where: { id: v.id }, data: { status: 'VOIDED' } })
      return NextResponse.json({ success: true })
    }
    if (b.batchId) {
      // Void everything still unused in the batch; redeemed vouchers keep their history.
      const r = await prisma.serviceVoucher.updateMany({ where: { batchId: String(b.batchId), status: 'ACTIVE' }, data: { status: 'VOIDED' } })
      return NextResponse.json({ success: true, voided: r.count })
    }
    return NextResponse.json({ error: 'voucherId or batchId required' }, { status: 400 })
  } catch (e) {
    console.error('Voucher void error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
