import { NextResponse } from 'next/server'
import { readVouchers, writeVouchers, normalizeCode, type Voucher, type DiscountType } from '@/lib/vouchers'

// Auth: covered by src/middleware.ts (Basic auth on /api/admin/*).

function sanitize(input: Record<string, unknown>): Voucher | { error: string } {
  const code = normalizeCode(String(input.code || ''))
  if (!code) return { error: 'Code is required.' }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return { error: 'Code can only contain letters, numbers, hyphens and underscores.' }
  }

  const discountType = (['percent', 'fixed', 'none'].includes(String(input.discountType))
    ? input.discountType
    : 'none') as DiscountType

  let discountValue = Number(input.discountValue) || 0
  if (discountValue < 0) discountValue = 0
  if (discountType === 'percent' && discountValue > 100) discountValue = 100
  if (discountType === 'none') discountValue = 0

  const freeShipping = !!input.freeShipping

  if (discountType === 'none' && !freeShipping) {
    return { error: 'Pick a discount (percent or fixed) and/or enable free shipping.' }
  }

  const v: Voucher = {
    code,
    discountType,
    discountValue,
    freeShipping,
    active: input.active === undefined ? true : !!input.active,
    usedCount: Number(input.usedCount) || 0,
  }

  const minSubtotal = Number(input.minSubtotal)
  if (minSubtotal > 0) v.minSubtotal = minSubtotal

  const usageLimit = Number(input.usageLimit)
  if (usageLimit > 0) v.usageLimit = Math.floor(usageLimit)

  const expiresAt = String(input.expiresAt || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) v.expiresAt = expiresAt

  const description = String(input.description || '').trim()
  if (description) v.description = description.slice(0, 200)

  return v
}

export async function GET() {
  const vouchers = await readVouchers()
  return NextResponse.json({ vouchers })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = sanitize(body)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const vouchers = await readVouchers()
    if (vouchers.some((x) => normalizeCode(x.code) === result.code)) {
      return NextResponse.json({ error: `Code "${result.code}" already exists.` }, { status: 409 })
    }
    vouchers.push(result)
    await writeVouchers(vouchers)
    return NextResponse.json({ voucher: result })
  } catch {
    return NextResponse.json({ error: 'Failed to create voucher.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const originalCode = normalizeCode(String(body.originalCode || body.code || ''))
    const result = sanitize(body)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const vouchers = await readVouchers()
    const idx = vouchers.findIndex((x) => normalizeCode(x.code) === originalCode)
    if (idx === -1) return NextResponse.json({ error: 'Voucher not found.' }, { status: 404 })

    // If the code was renamed, ensure the new code doesn't collide.
    if (result.code !== originalCode && vouchers.some((x) => normalizeCode(x.code) === result.code)) {
      return NextResponse.json({ error: `Code "${result.code}" already exists.` }, { status: 409 })
    }

    // Preserve redemption count across edits.
    result.usedCount = vouchers[idx].usedCount || 0
    vouchers[idx] = result
    await writeVouchers(vouchers)
    return NextResponse.json({ voucher: result })
  } catch {
    return NextResponse.json({ error: 'Failed to update voucher.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = normalizeCode(searchParams.get('code') || '')
    if (!code) return NextResponse.json({ error: 'Code is required.' }, { status: 400 })

    const vouchers = await readVouchers()
    const next = vouchers.filter((x) => normalizeCode(x.code) !== code)
    if (next.length === vouchers.length) {
      return NextResponse.json({ error: 'Voucher not found.' }, { status: 404 })
    }
    await writeVouchers(next)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete voucher.' }, { status: 500 })
  }
}
