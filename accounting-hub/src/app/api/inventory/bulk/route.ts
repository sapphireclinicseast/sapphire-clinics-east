import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

/**
 * POST /api/inventory/bulk
 *
 * Body: {
 *   items: [{ name, department, category, subcategory, branch, unitCost, sellingPrice, quantity, reorderLevel, supplierId }]
 * }
 *
 * Auto-generates SKU and barcode for each item based on department/category/subcategory.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { items } = await req.json()

    if (!items?.length) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    const results = []
    const errors = []

    for (let i = 0; i < items.length; i++) {
      const row = items[i]
      const rowNum = i + 1

      if (!row.name?.trim() || !row.department || !row.category || !row.subcategory || !row.branch) {
        errors.push(`Row ${rowNum}: name, department, category, subcategory, and branch are required`)
        continue
      }

      // Generate SKU: DEPT-CAT-SUB-NNN
      const deptCode = row.department.toUpperCase().slice(0, 4)
      const catCode = row.category.toUpperCase().slice(0, 3)
      const subCode = row.subcategory.toUpperCase().slice(0, 3)
      const prefix = `${deptCode}-${catCode}-${subCode}`

      // Find next sequence number for this prefix
      const existingCount = await prisma.inventoryItem.count({
        where: { sku: { startsWith: prefix } },
      })
      const seq = existingCount + 1
      const sku = `${prefix}-${String(seq).padStart(3, '0')}`

      // Check for duplicate SKU
      const existing = await prisma.inventoryItem.findUnique({ where: { sku } })
      if (existing) {
        errors.push(`Row ${rowNum}: SKU ${sku} already exists`)
        continue
      }

      try {
        const item = await prisma.inventoryItem.create({
          data: {
            name: row.name.trim().toUpperCase(),
            sku,
            skuDepartment: row.department,
            skuCategory: row.category,
            skuSubcategory: row.subcategory,
            barcode: sku, // Use SKU as barcode
            branch: row.branch,
            accountSubType: row.accountSubType || null,
            unitCost: row.unitCost ? parseFloat(row.unitCost) : 0,
            sellingPrice: row.sellingPrice ? parseFloat(row.sellingPrice) : null,
            rewardPointsPrice: row.rewardPointsPrice ? parseInt(row.rewardPointsPrice) : null,
            quantity: row.quantity ? parseInt(row.quantity) : 0,
            reorderLevel: row.reorderLevel ? parseInt(row.reorderLevel) : null,
            supplierId: row.supplierId || null,
            createdById: session.user.id,
          },
        })

        results.push({
          row: rowNum,
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          quantity: item.quantity,
        })
      } catch (err) {
        errors.push(`Row ${rowNum}: ${(err as Error).message}`)
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BULK_ITEM_IMPORT',
        entity: 'inventoryItem',
        entityId: `BULK-${Date.now()}`,
        details: {
          totalRows: items.length,
          successCount: results.length,
          errorCount: errors.length,
        },
      },
    })

    return NextResponse.json({
      success: results.length,
      errors: errors.length,
      items: results,
      errorDetails: errors,
    }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
