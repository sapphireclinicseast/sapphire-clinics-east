import { NextResponse } from 'next/server'
import { pushWeightsToStore } from '@/lib/store-weight-sync'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'
import { resolveProductAccounts, inventorySubTypeForDept } from '@/lib/inventory-accounts'
import { consumeFifoLots } from '@/lib/fifo'
import { SKU_HIERARCHY } from '@/lib/sku-taxonomy'

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
  // Disabled (retired) items are hidden by default; the Inventory list opts in
  // with ?includeDisabled=true to show them alongside active items.
  const includeDisabled = searchParams.get('includeDisabled') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (branch) where.branch = branch
  if (department) where.skuDepartment = department
  // '__none__' finds items not yet given a customer-facing category.
  const webClass = searchParams.get('websiteClassification')
  if (webClass === '__none__') where.websiteClassification = null
  else if (webClass) where.websiteClassification = webClass

  if (all) {
    const items = await prisma.inventoryItem.findMany({
      where: { ...where, isActive: true },
      select: { id: true, name: true, supplierProductName: true, description: true, sku: true, branch: true, quantity: true, sellingPrice: true, unitCost: true, barcode: true, imageUrl: true, rewardPointsPrice: true, isPreOrder: true, websiteClassification: true, dimensionLength: true, dimensionWidth: true, dimensionHeight: true, weightKg: true, variants: { where: { isActive: true }, select: { id: true, variantType: true, variantLabel: true, variantSku: true, quantity: true, unitCost: true, sellingPrice: true, dimensionLength: true, dimensionWidth: true, dimensionHeight: true, weightKg: true }, orderBy: { variantLabel: 'asc' } } },
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

  // Main paginated list: hide disabled (retired) items unless explicitly requested.
  if (!includeDisabled) where.isActive = true

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
            dimensionLength, dimensionWidth, dimensionHeight, weightKg } = body

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

    // Wire the GL accounts from the SKU department unless the form supplied them,
    // so a product is always postable — and lands on the right income-statement
    // line and sub-classification — the moment it's created.
    const acct = await resolveProductAccounts(prisma, skuDepartment, {
      revenueAccountId, expenseAccountId, sourceAccountId, accountSubType,
    })

    const item = await prisma.inventoryItem.create({
      data: {
        // Product names are stored upper case so the catalogue reads uniformly.
        // The Verdana storefront title-cases them for display.
        name: name.trim().toUpperCase(),
        sku,
        skuDepartment,
        skuCategory,
        skuSubcategory,
        skuSequence: nextSequence,
        barcode: sku, // Code128 uses the SKU string directly
        branch,
        accountSubType: acct.accountSubType,
        unitCost: unitCost ? parseFloat(unitCost) : 0,
        initialUnitCost: unitCost ? parseFloat(unitCost) : 0,
        sellingPrice: sellingPrice ? parseFloat(sellingPrice) : null,
        rewardPointsPrice: rewardPointsPrice ? parseInt(rewardPointsPrice) : null,
        quantity: quantity ? parseInt(quantity) : 0,
        reorderLevel: reorderLevel ? parseInt(reorderLevel) : null,
        supplierId: supplierId || null,
        supplierProductName: body.supplierProductName?.trim() || null,
        description: body.description?.trim() || null,
        supplierExchangeRate: supplierExchangeRate ? parseFloat(supplierExchangeRate) : null,
        revenueAccountId: acct.revenueAccountId,
        sourceAccountId: acct.sourceAccountId,
        fromPettyCash: body.fromPettyCash === true,
        expenseAccountId: acct.expenseAccountId,
        issuedOfficialInvoice: body.issuedOfficialInvoice || false,
        isPreOrder: body.isPreOrder || false,
        websiteClassification: body.websiteClassification || null,
        dimensionLength: dimensionLength ? parseFloat(dimensionLength) : null,
        dimensionWidth: dimensionWidth ? parseFloat(dimensionWidth) : null,
        dimensionHeight: dimensionHeight ? parseFloat(dimensionHeight) : null,
        weightKg: weightKg ? parseFloat(weightKg) : null,
        createdById: session.user.id,
      },
      include: { supplier: { select: { supplierName: true } } },
    })

    // A new product with a weight should reach the storefront too.
    if (item.weightKg != null && item.sku) {
      const sync = await pushWeightsToStore([{ sku: item.sku, weightKg: Number(item.weightKg) }])
      if (!sync.pushed) console.warn(`[STORE SYNC] weight for ${item.sku} not pushed: ${sync.reason}`)
    }

    // An item born with stock needs an opening lot, or its sales have no FIFO
    // cost and its movement history starts from a phantom balance. (The petty-
    // cash flow already posts its own INCREASE via /adjustments — it sends
    // quantity 0 here, so this doesn't double up.)
    if (item.quantity > 0) {
      await prisma.inventoryAdjustment.create({
        data: {
          itemId: item.id,
          type: 'INCREASE',
          quantityChange: item.quantity,
          previousQuantity: 0,
          newQuantity: item.quantity,
          remainingQuantity: item.quantity,
          localCost: Number(item.unitCost) || null,
          adjustmentDate: new Date(),
          remarks: 'Opening quantity at item creation',
          adjustedById: session.user.id,
        },
      })
    }

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
            reorderLevel, supplierId, supplierProductName, description, supplierExchangeRate, revenueAccountId, sourceAccountId, expenseAccountId,
            issuedOfficialInvoice, isPreOrder, websiteClassification, imageUrl, isActive,
            skuDepartment, skuCategory, skuSubcategory,
            dimensionLength, dimensionWidth, dimensionHeight, weightKg } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim().toUpperCase()
    if (branch !== undefined) data.branch = branch
    if (accountSubType !== undefined) data.accountSubType = accountSubType || null
    if (unitCost !== undefined) data.unitCost = parseFloat(unitCost)
    if (sellingPrice !== undefined) data.sellingPrice = sellingPrice ? parseFloat(sellingPrice) : null
    if (rewardPointsPrice !== undefined) data.rewardPointsPrice = rewardPointsPrice ? parseInt(rewardPointsPrice) : null
    if (quantity !== undefined) data.quantity = parseInt(quantity)
    if (reorderLevel !== undefined) data.reorderLevel = reorderLevel ? parseInt(reorderLevel) : null
    if (supplierId !== undefined) data.supplierId = supplierId || null
    if (supplierProductName !== undefined) data.supplierProductName = supplierProductName?.trim() || null
    if (description !== undefined) data.description = description?.trim() || null
    if (supplierExchangeRate !== undefined) data.supplierExchangeRate = supplierExchangeRate ? parseFloat(supplierExchangeRate) : null
    if (revenueAccountId !== undefined) data.revenueAccountId = revenueAccountId || null
    if (sourceAccountId !== undefined) data.sourceAccountId = sourceAccountId || null
    if (expenseAccountId !== undefined) data.expenseAccountId = expenseAccountId || null
    if (issuedOfficialInvoice !== undefined) data.issuedOfficialInvoice = issuedOfficialInvoice
    if (isPreOrder !== undefined) data.isPreOrder = !!isPreOrder
    if (websiteClassification !== undefined) data.websiteClassification = websiteClassification || null
    if (isActive !== undefined) data.isActive = !!isActive  // disable (retire) / restore
    if (imageUrl !== undefined) data.imageUrl = imageUrl || null
    if (dimensionLength !== undefined) data.dimensionLength = dimensionLength !== '' && dimensionLength !== null ? parseFloat(dimensionLength) : null
    if (dimensionWidth !== undefined) data.dimensionWidth = dimensionWidth !== '' && dimensionWidth !== null ? parseFloat(dimensionWidth) : null
    if (dimensionHeight !== undefined) data.dimensionHeight = dimensionHeight !== '' && dimensionHeight !== null ? parseFloat(dimensionHeight) : null
    if (weightKg !== undefined) data.weightKg = weightKg !== '' && weightKg !== null ? parseFloat(weightKg) : null

    const current = await prisma.inventoryItem.findUnique({
      where: { id },
      select: { sku: true, skuDepartment: true, skuCategory: true, skuSubcategory: true, skuSequence: true,
                revenueAccountId: true, expenseAccountId: true, sourceAccountId: true, accountSubType: true,
                quantity: true, unitCost: true },
    })

    // Reclassification. The edit form has always SENT these three fields; the API
    // just ignored them, so changing a product's department in the UI silently did
    // nothing. Applying them means re-cutting the SKU under the new prefix, since a
    // SKU that says OT- on a merchandise item is worse than no structure at all.
    //
    // The BARCODE is deliberately left alone: it's the string printed on labels
    // already stuck to physical stock, so re-cutting it would strand every unit in
    // the stockroom. Old label keeps scanning; the SKU is the accounting identity.
    let reclassified: { from: string; to: string } | null = null
    if (current && (skuDepartment || skuCategory || skuSubcategory)) {
      const nextDept = (skuDepartment || current.skuDepartment).trim().toUpperCase()
      const nextCat = (skuCategory || current.skuCategory).trim().toUpperCase()
      const nextSub = (skuSubcategory || current.skuSubcategory).trim().toUpperCase()
      const changed = nextDept !== current.skuDepartment || nextCat !== current.skuCategory || nextSub !== current.skuSubcategory
      if (changed) {
        if (!SKU_HIERARCHY[nextDept]?.categories?.[nextCat]?.subcategories?.[nextSub]) {
          return NextResponse.json({ error: `Unknown SKU classification ${nextDept}-${nextCat}-${nextSub}` }, { status: 400 })
        }
        const prefix = `${nextDept}-${nextCat}-${nextSub}`
        const last = await prisma.inventoryItem.findFirst({
          where: { sku: { startsWith: prefix } },
          orderBy: { skuSequence: 'desc' },
          select: { skuSequence: true },
        })
        const nextSeq = (last?.skuSequence || 0) + 1
        // Consignment copies carry a "-BRANCH" suffix on the parent SKU; keep it so
        // the copy stays recognisable as the same product at another branch.
        const suffix = current.sku.startsWith(`${current.skuDepartment}-${current.skuCategory}-${current.skuSubcategory}-`)
          ? current.sku.split('-').slice(4).join('-')
          : ''
        const newSku = `${prefix}-${String(nextSeq).padStart(3, '0')}${suffix ? `-${suffix}` : ''}`
        data.skuDepartment = nextDept
        data.skuCategory = nextCat
        data.skuSubcategory = nextSub
        data.skuSequence = nextSeq
        data.sku = newSku
        reclassified = { from: current.sku, to: newSku }
        // Keep the sub-type aligned with the new department when it was aligned with
        // the old one (i.e. auto-derived, not a deliberate override).
        if (accountSubType === undefined && current.accountSubType === inventorySubTypeForDept(current.skuDepartment)) {
          data.accountSubType = inventorySubTypeForDept(nextDept)
        }
      }
    }

    // Self-heal on save: a product created before the accounts were derived (or by
    // a path that didn't set them) gets its blanks filled the first time anyone
    // edits it. Only ever fills nulls — an explicit value in this request, or one
    // already on the row, is left exactly as it is.
    if (current) {
      const filled = await resolveProductAccounts(prisma, data.skuDepartment ?? current.skuDepartment, {
        revenueAccountId: data.revenueAccountId !== undefined ? data.revenueAccountId : current.revenueAccountId,
        expenseAccountId: data.expenseAccountId !== undefined ? data.expenseAccountId : current.expenseAccountId,
        sourceAccountId: data.sourceAccountId !== undefined ? data.sourceAccountId : current.sourceAccountId,
        accountSubType: data.accountSubType !== undefined ? data.accountSubType : current.accountSubType,
      })
      if (filled.revenueAccountId) data.revenueAccountId = filled.revenueAccountId
      if (filled.expenseAccountId) data.expenseAccountId = filled.expenseAccountId
      if (filled.sourceAccountId) data.sourceAccountId = filled.sourceAccountId
      if (filled.accountSubType) data.accountSubType = filled.accountSubType
    }

    // A quantity edit through the item form used to overwrite the counter
    // silently — no adjustment row, no lot, no history — so every stale form
    // save erased real sales and consignments (the "phantom opening balance"
    // in movement history). Now the change is recorded as a real adjustment:
    // an INCREASE lot when raised, a lot-consuming SHRINKAGE when lowered.
    let quantityEdit: { from: number; to: number } | null = null
    if (current && data.quantity !== undefined && data.quantity !== current.quantity) {
      quantityEdit = { from: current.quantity, to: data.quantity }
      const delta = data.quantity - current.quantity
      if (delta < 0) await consumeFifoLots(prisma, id, -delta)
      await prisma.inventoryAdjustment.create({
        data: {
          itemId: id,
          type: delta > 0 ? 'INCREASE' : 'SHRINKAGE',
          quantityChange: Math.abs(delta),
          previousQuantity: current.quantity,
          newQuantity: data.quantity,
          remainingQuantity: delta > 0 ? delta : null,
          localCost: delta > 0 ? Number(data.unitCost ?? current.unitCost) : null,
          adjustmentDate: new Date(),
          remarks: 'Quantity edited via item form',
          adjustedById: session.user.id,
        },
      })
    } else if (current && data.quantity !== undefined) {
      // Unchanged — don't touch the counter at all (a stale form re-sending
      // the same number must not clobber concurrent sales).
      delete data.quantity
    }

    const item = await prisma.inventoryItem.update({ where: { id }, data })

    // The storefront prices delivery by weight, so its copy has to follow this
    // one. Non-fatal: the item is saved either way, and the log records a
    // divergence rather than hiding it.
    if (weightKg !== undefined && item.sku) {
      const sync = await pushWeightsToStore([{ sku: item.sku, weightKg: item.weightKg == null ? null : Number(item.weightKg) }])
      if (!sync.pushed) console.warn(`[STORE SYNC] weight for ${item.sku} not pushed: ${sync.reason}`)
      else if (sync.unmatched?.length) console.warn(`[STORE SYNC] no storefront product for SKU ${sync.unmatched.join(', ')}`)
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: reclassified ? 'RECLASSIFY' : 'UPDATE',
        entity: 'inventoryItem',
        entityId: item.id,
        details: { updated: Object.keys(data), ...(quantityEdit ? { quantityEdit } : {}), ...(reclassified ? { skuChanged: reclassified } : {}) },
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
            sellingPrice, rewardPointsPrice, reorderLevel, accountSubType, websiteClassification: bulkWebClass } = await req.json()

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
    if (bulkWebClass !== undefined) data.websiteClassification = bulkWebClass || null

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
