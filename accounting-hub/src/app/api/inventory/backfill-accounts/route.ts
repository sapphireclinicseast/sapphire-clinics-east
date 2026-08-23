import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveProductAccounts, inventorySubTypeForDept } from '@/lib/inventory-accounts'

const RUN_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

/**
 * One-off (but idempotent) repair for products created before the GL accounts were
 * derived from the SKU department — bulk imports and consignment transfers never set
 * them at all, so selling such a product posted to 7000 Unclassified Revenue, or
 * failed to post entirely when it had a cost but no COGS account.
 *
 * GET  → dry run: what would change, plus sub-type mismatches for review.
 * POST → fills blanks only. Sub-type MISMATCHES are never auto-corrected: an
 *        ST product tagged INV_OT is probably a copy-paste slip, but it could be
 *        deliberate, and it moves balance-sheet inventory between lines — so those
 *        are reported for a human to decide, not silently rewritten.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, sku: true, name: true, skuDepartment: true, isActive: true, revenueAccountId: true, expenseAccountId: true, sourceAccountId: true, accountSubType: true },
    orderBy: { sku: 'asc' },
  })
  const needsFill = items.filter(i => !i.revenueAccountId || !i.expenseAccountId || !i.sourceAccountId || !i.accountSubType)
  const mismatches = items.filter(i => {
    const expected = inventorySubTypeForDept(i.skuDepartment)
    return expected && i.accountSubType && i.accountSubType !== expected
  }).map(i => ({ sku: i.sku, name: i.name, department: i.skuDepartment, current: i.accountSubType, expected: inventorySubTypeForDept(i.skuDepartment) }))
  return NextResponse.json({
    total: items.length,
    needsFill: needsFill.map(i => ({
      sku: i.sku, name: i.name, department: i.skuDepartment, isActive: i.isActive,
      missing: [
        !i.revenueAccountId ? 'revenue' : null,
        !i.expenseAccountId ? 'cogs' : null,
        !i.sourceAccountId ? 'inventoryAsset' : null,
        !i.accountSubType ? 'subType' : null,
      ].filter(Boolean),
    })),
    subTypeMismatches: mismatches,
  })
}

export async function POST() {
  const session = await auth()
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, sku: true, skuDepartment: true, revenueAccountId: true, expenseAccountId: true, sourceAccountId: true, accountSubType: true },
  })
  let updated = 0
  const changed: { sku: string; filled: string[] }[] = []
  for (const i of items) {
    const filled = await resolveProductAccounts(prisma, i.skuDepartment, {
      revenueAccountId: i.revenueAccountId,
      expenseAccountId: i.expenseAccountId,
      sourceAccountId: i.sourceAccountId,
      accountSubType: i.accountSubType,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    const filledNames: string[] = []
    if (!i.revenueAccountId && filled.revenueAccountId) { data.revenueAccountId = filled.revenueAccountId; filledNames.push('revenue') }
    if (!i.expenseAccountId && filled.expenseAccountId) { data.expenseAccountId = filled.expenseAccountId; filledNames.push('cogs') }
    if (!i.sourceAccountId && filled.sourceAccountId) { data.sourceAccountId = filled.sourceAccountId; filledNames.push('inventoryAsset') }
    if (!i.accountSubType && filled.accountSubType) { data.accountSubType = filled.accountSubType; filledNames.push('subType') }
    if (Object.keys(data).length === 0) continue
    await prisma.inventoryItem.update({ where: { id: i.id }, data })
    updated++
    changed.push({ sku: i.sku, filled: filledNames })
  }
  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string,
      action: 'BACKFILL_INVENTORY_ACCOUNTS',
      entity: 'inventoryItem',
      details: { scanned: items.length, updated, changed },
    },
  })
  return NextResponse.json({ scanned: items.length, updated, changed })
}
