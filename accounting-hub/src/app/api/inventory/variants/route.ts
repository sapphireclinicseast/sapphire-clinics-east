import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// GET /api/inventory/variants?itemId=xxx
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
  }

  const variants = await prisma.inventoryVariant.findMany({
    where: { itemId, isActive: true },
    orderBy: { color: 'asc' },
  })

  return NextResponse.json(variants)
}

// POST /api/inventory/variants — add a color variant
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { itemId, color, quantity } = await req.json()

    if (!itemId || !color?.trim()) {
      return NextResponse.json({ error: 'itemId and color are required' }, { status: 400 })
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Generate variant SKU: base SKU + color code
    const colorCode = color.trim().toUpperCase().replace(/\s+/g, '').slice(0, 3)
    const variantSku = `${item.sku}-${colorCode}`

    // Check for duplicate
    const existing = await prisma.inventoryVariant.findUnique({ where: { variantSku } })
    if (existing) {
      return NextResponse.json({ error: `Variant SKU ${variantSku} already exists` }, { status: 409 })
    }

    const variant = await prisma.inventoryVariant.create({
      data: {
        itemId,
        color: color.trim().toUpperCase(),
        variantSku,
        barcode: variantSku,
        quantity: quantity ? parseInt(quantity) : 0,
      },
    })

    // Update parent item total quantity
    const allVariants = await prisma.inventoryVariant.findMany({
      where: { itemId, isActive: true },
      select: { quantity: true },
    })
    const totalQty = allVariants.reduce((s, v) => s + v.quantity, 0)
    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: totalQty },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'inventoryVariant',
        entityId: variant.id,
        details: { itemName: item.name, color: variant.color, variantSku, quantity: variant.quantity },
      },
    })

    return NextResponse.json(variant, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/inventory/variants — update variant quantity
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, quantity, color } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Variant ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (quantity !== undefined) data.quantity = parseInt(quantity)
    if (color !== undefined) data.color = color.trim().toUpperCase()

    const variant = await prisma.inventoryVariant.update({ where: { id }, data })

    // Update parent item total quantity
    const allVariants = await prisma.inventoryVariant.findMany({
      where: { itemId: variant.itemId, isActive: true },
      select: { quantity: true },
    })
    const totalQty = allVariants.reduce((s, v) => s + v.quantity, 0)
    await prisma.inventoryItem.update({
      where: { id: variant.itemId },
      data: { quantity: totalQty },
    })

    return NextResponse.json(variant)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/inventory/variants — soft delete
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await req.json()
    const variant = await prisma.inventoryVariant.update({
      where: { id },
      data: { isActive: false },
    })

    // Update parent total
    const allVariants = await prisma.inventoryVariant.findMany({
      where: { itemId: variant.itemId, isActive: true },
      select: { quantity: true },
    })
    const totalQty = allVariants.reduce((s, v) => s + v.quantity, 0)
    await prisma.inventoryItem.update({
      where: { id: variant.itemId },
      data: { quantity: totalQty },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
