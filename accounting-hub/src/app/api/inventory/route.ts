import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const branch = searchParams.get('branch') || ''
  const department = searchParams.get('department') || ''
  const all = searchParams.get('all') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (branch) where.branch = branch
  if (department) where.skuDepartment = department

  if (all) {
    const items = await prisma.inventoryItem.findMany({
      where,
      select: { id: true, name: true, sku: true, branch: true, quantity: true, sellingPrice: true, unitCost: true, barcode: true, imageUrl: true, rewardPointsPrice: true, dimensionLength: true, dimensionWidth: true, dimensionHeight: true, variants: { where: { isActive: true }, select: { id: true, variantType: true, variantLabel: true, quantity: true }, orderBy: { variantLabel: 'asc' } } },
      orderBy: { sku: 'asc' },
    })
    // Ensure Decimal fields are serialized as numbers
    const serialized = items.map(item => ({
      ...item,
      sellingPrice: item.sellingPrice ? Number(item.sellingPrice) : 0,
      unitCost: item.unitCost ? Number(item.unitCost) : 0,
    }))
    return NextResponse.json(serialized)
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: {
        supplier: { select: { id: true, supplierName: true, isForeign: true, currency: true } },
        revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
        sourceAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
        expenseAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
        variants: { where: { isActive: true }, orderBy: { variantLabel: 'asc' } },
        bundleComponents: { include: { component: { select: { id: true, name: true, sku: true, quantity: true, unitCost: true } } } },
      },
      orderBy: { sku: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.inventoryItem.count({ where }),
  ])

  return NextResponse.json(paginatedResult(items, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, skuDepartment, skuCategory, skuSubcategory, branch, accountSubType,
            unitCost, sellingPrice, rewardPointsPrice, quantity, reorderLevel, supplierId, supplierExchangeRate,
            revenueAccountId, sourceAccountId, expenseAccountId,
            dimensionLength, dimensionWidth, dimensionHeight } = body

    if (!name?.trim() || !skuDepartment || !skuCategory || !skuSubcategory || !branch) {
      return NextResponse.json({ error: 'Name, SKU components, and branch are required' }, { status: 400 })
    }

    // Auto-generate SKU sequence
    const prefix = `${skuDepartment}-${skuCategory}-${skuSubcategory}`
    const lastItem = await prisma.inventoryItem.findFirst({
      where: { sku: { startsWith: prefix } },
      orderBy: { skuSequence: 'desc' },
      select: { skuSequence: true },
    })
    const nextSequence = (lastItem?.skuSequence || 0) + 1
    const sku = `${prefix}-${String(nextSequence).padStart(3, '0')}`

    // Check uniqueness
    const existing = await prisma.inventoryItem.findUnique({ where: { sku } })
    if (existing) {
      return NextResponse.json({ error: 'SKU already exists' }, { status: 409 })
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name: name.trim(),
        sku,
        skuDepartment,
        skuCategory,
        skuSubcategory,
        skuSequence: nextSequence,
        barcode: sku, // Code128 uses the SKU string directly
        branch,
        accountSubType: accountSubType || null,
        unitCost: unitCost ? parseFloat(unitCost) : 0,
        initialUnitCost: unitCost ? parseFloat(unitCost) : 0,
        sellingPrice: sellingPrice ? parseFloat(sellingPrice) : null,
        rewardPointsPrice: rewardPointsPrice ? parseInt(rewardPointsPrice) : null,
        quantity: quantity ? parseInt(quantity) : 0,
        reorderLevel: reorderLevel ? parseInt(reorderLevel) : null,
        supplierId: supplierId || null,
        supplierExchangeRate: supplierExchangeRate ? parseFloat(supplierExchangeRate) : null,
        revenueAccountId: revenueAccountId || null,
        sourceAccountId: sourceAccountId || null,
        fromPettyCash: body.fromPettyCash === true,
        expenseAccountId: expenseAccountId || null,
        issuedOfficialInvoice: body.issuedOfficialInvoice || false,
        dimensionLength: dimensionLength ? parseFloat(dimensionLength) : null,
        dimensionWidth: dimensionWidth ? parseFloat(dimensionWidth) : null,
        dimensionHeight: dimensionHeight ? parseFloat(dimensionHeight) : null,
        createdById: session.user.id,
      },
      include: { supplier: { select: { supplierName: true } } },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'inventoryItem',
        entityId: item.id,
        details: { sku: item.sku, name: item.name, branch: item.branch },
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, name, branch, accountSubType, unitCost, sellingPrice, rewardPointsPrice, quantity,
            reorderLevel, supplierId, supplierExchangeRate, revenueAccountId, sourceAccountId, expenseAccountId,
            issuedOfficialInvoice, imageUrl,
            dimensionLength, dimensionWidth, dimensionHeight } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (branch !== undefined) data.branch = branch
    if (accountSubType !== undefined) data.accountSubType = accountSubType || null
    if (unitCost !== undefined) data.unitCost = parseFloat(unitCost)
    if (sellingPrice !== undefined) data.sellingPrice = sellingPrice ? parseFloat(sellingPrice) : null
    if (rewardPointsPrice !== undefined) data.rewardPointsPrice = rewardPointsPrice ? parseInt(rewardPointsPrice) : null
    if (quantity !== undefined) data.quantity = parseInt(quantity)
    if (reorderLevel !== undefined) data.reorderLevel = reorderLevel ? parseInt(reorderLevel) : null
    if (supplierId !== undefined) data.supplierId = supplierId || null
    if (supplierExchangeRate !== undefined) data.supplierExchangeRate = supplierExchangeRate ? parseFloat(supplierExchangeRate) : null
    if (revenueAccountId !== undefined) data.revenueAccountId = revenueAccountId || null
    if (sourceAccountId !== undefined) data.sourceAccountId = sourceAccountId || null
    if (expenseAccountId !== undefined) data.expenseAccountId = expenseAccountId || null
    if (issuedOfficialInvoice !== undefined) data.issuedOfficialInvoice = issuedOfficialInvoice
    if (imageUrl !== undefined) data.imageUrl = imageUrl || null
    if (dimensionLength !== undefined) data.dimensionLength = dimensionLength !== '' && dimensionLength !== null ? parseFloat(dimensionLength) : null
    if (dimensionWidth !== undefined) data.dimensionWidth = dimensionWidth !== '' && dimensionWidth !== null ? parseFloat(dimensionWidth) : null
    if (dimensionHeight !== undefined) data.dimensionHeight = dimensionHeight !== '' && dimensionHeight !== null ? parseFloat(dimensionHeight) : null

    const item = await prisma.inventoryItem.update({ where: { id }, data })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'inventoryItem',
        entityId: item.id,
        details: { updated: Object.keys(data) },
      },
    })

    return NextResponse.json(item)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { ids, revenueAccountId, sourceAccountId, expenseAccountId, supplierId, branch, unitCost,
            sellingPrice, rewardPointsPrice, reorderLevel, accountSubType } = await req.json()

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'At least one item ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (revenueAccountId !== undefined) data.revenueAccountId = revenueAccountId || null
    if (sourceAccountId !== undefined) data.sourceAccountId = sourceAccountId || null
    if (expenseAccountId !== undefined) data.expenseAccountId = expenseAccountId || null
    if (supplierId !== undefined) data.supplierId = supplierId || null
    if (branch !== undefined) data.branch = branch
    if (unitCost !== undefined) data.unitCost = parseFloat(unitCost)
    if (sellingPrice !== undefined) data.sellingPrice = sellingPrice ? parseFloat(sellingPrice) : null
    if (rewardPointsPrice !== undefined) data.rewardPointsPrice = rewardPointsPrice ? parseInt(rewardPointsPrice) : null
    if (reorderLevel !== undefined) data.reorderLevel = reorderLevel ? parseInt(reorderLevel) : null
    if (accountSubType !== undefined) data.accountSubType = accountSubType || null

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const result = await prisma.inventoryItem.updateMany({
      where: { id: { in: ids }, isActive: true },
      data,
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BULK_UPDATE',
        entity: 'inventoryItem',
        entityId: ids.join(','),
        details: { count: result.count, fields: Object.keys(data) },
      },
    })

    return NextResponse.json({ updated: result.count })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })

    await prisma.inventoryItem.update({ where: { id }, data: { isActive: false } })
    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'DEACTIVATE', entity: 'inventoryItem', entityId: id },
    })

    return NextResponse.json({ message: 'Item deactivated' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
