import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Backfill inventoryItemId on product order items that are missing the link.
 * Matches by item name to active inventory items.
 *
 * GET  = dry run (preview matches)
 * POST = apply fixes
 */

const ADMIN_ROLES = ['ADMIN', 'AHEA_ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user || !ADMIN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find product order items without inventoryItemId
  const orphanItems = await prisma.orderItem.findMany({
    where: {
      inventoryItemId: null,
      order: { orderType: 'PRODUCT', status: 'COMPLETED' },
    },
    select: { id: true, name: true, orderId: true },
  })

  // Get all active inventory items for matching
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sku: true, revenueAccountId: true },
  })

  // Build name→item map (case-insensitive)
  const nameMap = new Map<string, typeof inventoryItems[0]>()
  for (const inv of inventoryItems) {
    nameMap.set(inv.name.toLowerCase().trim(), inv)
  }

  const matches: { itemId: string; itemName: string; matchedInventoryId: string; matchedInventoryName: string; hasRevenueAccount: boolean }[] = []
  const noMatch: { itemId: string; itemName: string }[] = []

  for (const item of orphanItems) {
    const match = nameMap.get(item.name.toLowerCase().trim())
    if (match) {
      matches.push({
        itemId: item.id,
        itemName: item.name,
        matchedInventoryId: match.id,
        matchedInventoryName: match.name,
        hasRevenueAccount: !!match.revenueAccountId,
      })
    } else {
      noMatch.push({ itemId: item.id, itemName: item.name })
    }
  }

  return NextResponse.json({
    totalOrphanItems: orphanItems.length,
    matchable: matches.length,
    unmatched: noMatch.length,
    matches,
    noMatch,
  })
}

export async function POST() {
  const session = await auth()
  if (!session?.user || !ADMIN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const orphanItems = await prisma.orderItem.findMany({
    where: {
      inventoryItemId: null,
      order: { orderType: 'PRODUCT', status: 'COMPLETED' },
    },
    select: { id: true, name: true },
  })

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  const nameMap = new Map<string, string>()
  for (const inv of inventoryItems) {
    nameMap.set(inv.name.toLowerCase().trim(), inv.id)
  }

  let updated = 0
  let skipped = 0

  for (const item of orphanItems) {
    const inventoryId = nameMap.get(item.name.toLowerCase().trim())
    if (inventoryId) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { inventoryItemId: inventoryId },
      })
      updated++
    } else {
      skipped++
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'BACKFILL',
      entity: 'orderItem',
      entityId: 'batch',
      details: { updated, skipped, total: orphanItems.length },
    },
  })

  return NextResponse.json({ updated, skipped, total: orphanItems.length })
}
