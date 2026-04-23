import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// Recompute bundle unit cost as sum of (component unitCost * quantity)
async function recomputeBundleCost(bundleId: string) {
  const components = await prisma.bundleComponent.findMany({
    where: { bundleId },
    include: { component: { select: { unitCost: true } } },
  })
  const totalCost = components.reduce((sum, bc) => sum + Number(bc.component.unitCost) * bc.quantity, 0)
  await prisma.inventoryItem.update({
    where: { id: bundleId },
    data: { unitCost: totalCost },
  })
}

// GET /api/inventory/bundles?bundleId=xxx — get bundle components
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const bundleId = searchParams.get('bundleId')

  if (!bundleId) {
    return NextResponse.json({ error: 'bundleId is required' }, { status: 400 })
  }

  const components = await prisma.bundleComponent.findMany({
    where: { bundleId },
    include: {
      component: { select: { id: true, name: true, sku: true, quantity: true, sellingPrice: true, unitCost: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(components)
}

// POST /api/inventory/bundles — add component to bundle
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { bundleId, componentId, quantity } = await req.json()

    if (!bundleId || !componentId) {
      return NextResponse.json({ error: 'bundleId and componentId are required' }, { status: 400 })
    }

    if (bundleId === componentId) {
      return NextResponse.json({ error: 'Cannot add item as component of itself' }, { status: 400 })
    }

    // Verify both items exist
    const [bundle, component] = await Promise.all([
      prisma.inventoryItem.findUnique({ where: { id: bundleId } }),
      prisma.inventoryItem.findUnique({ where: { id: componentId } }),
    ])

    if (!bundle) return NextResponse.json({ error: 'Bundle item not found' }, { status: 404 })
    if (!component) return NextResponse.json({ error: 'Component item not found' }, { status: 404 })

    // Mark as bundle if not already
    if (!bundle.isBundle) {
      await prisma.inventoryItem.update({ where: { id: bundleId }, data: { isBundle: true } })
    }

    // Check for duplicate
    const existing = await prisma.bundleComponent.findUnique({
      where: { bundleId_componentId: { bundleId, componentId } },
    })
    if (existing) {
      // Update quantity
      const updated = await prisma.bundleComponent.update({
        where: { id: existing.id },
        data: { quantity: quantity ? parseInt(quantity) : 1 },
        include: { component: { select: { id: true, name: true, sku: true, quantity: true, unitCost: true } } },
      })
      // Auto-compute bundle cost
      await recomputeBundleCost(bundleId)
      return NextResponse.json(updated)
    }

    const bc = await prisma.bundleComponent.create({
      data: {
        bundleId,
        componentId,
        quantity: quantity ? parseInt(quantity) : 1,
      },
      include: {
        component: { select: { id: true, name: true, sku: true, quantity: true, unitCost: true } },
      },
    })
    // Auto-compute bundle cost
    await recomputeBundleCost(bundleId)

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BUNDLE_ADD_COMPONENT',
        entity: 'bundleComponent',
        entityId: bc.id,
        details: { bundleName: bundle.name, componentName: component.name, quantity: bc.quantity },
      },
    })

    return NextResponse.json(bc, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/inventory/bundles — remove component from bundle
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await req.json()
    // Get bundleId before deleting so we can recompute cost
    const toDelete = await prisma.bundleComponent.findUnique({ where: { id }, select: { bundleId: true } })
    await prisma.bundleComponent.delete({ where: { id } })

    // Recompute bundle cost after removal
    if (toDelete?.bundleId) {
      await recomputeBundleCost(toDelete.bundleId)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
