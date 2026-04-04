import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Check if account 7080 exists and its settings
  const account7080 = await prisma.account.findFirst({
    where: { accountNumber: { contains: '7080' } },
  })

  // 2. Check all REVENUE accounts
  const revenueAccounts = await prisma.account.findMany({
    where: { accountType: 'REVENUE', isActive: true },
    select: { accountNumber: true, accountTitle: true, subType: true, normalBalance: true },
    orderBy: { accountNumber: 'asc' },
  })

  // 3. Check inventory items with revenueAccountId set
  const inventoryWithRevAcct = await prisma.inventoryItem.findMany({
    where: { revenueAccountId: { not: null }, isActive: true },
    select: { id: true, name: true, sku: true, revenueAccountId: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } },
    take: 20,
  })

  // 4. Check inventory items WITHOUT revenueAccountId
  const inventoryWithoutRevAcct = await prisma.inventoryItem.count({
    where: { revenueAccountId: null, isActive: true },
  })

  // 5. Check recent product orders and their items
  const productOrders = await prisma.order.findMany({
    where: { orderType: 'PRODUCT', status: 'COMPLETED' },
    select: {
      id: true, transactionDate: true, netAmount: true, branch: true, revenueType: true,
      items: {
        select: {
          id: true, name: true, inventoryItemId: true, lineTotal: true,
          inventoryItem: {
            select: { id: true, name: true, sku: true, revenueAccountId: true,
              revenueAccount: { select: { accountNumber: true, accountTitle: true } } },
          },
        },
      },
    },
    orderBy: { transactionDate: 'desc' },
    take: 10,
  })

  // 6. Summary: how many product order items have inventoryItemId, and of those, how many have revenueAccount
  const allProductOrderItems = await prisma.orderItem.findMany({
    where: { order: { orderType: 'PRODUCT', status: 'COMPLETED' } },
    select: {
      inventoryItemId: true,
      inventoryItem: { select: { revenueAccountId: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
    },
  })

  const summary = {
    totalProductOrderItems: allProductOrderItems.length,
    withInventoryItemId: allProductOrderItems.filter(i => i.inventoryItemId).length,
    withRevenueAccount: allProductOrderItems.filter(i => i.inventoryItem?.revenueAccountId).length,
    revenueAccountBreakdown: {} as Record<string, number>,
  }

  for (const item of allProductOrderItems) {
    if (item.inventoryItem?.revenueAccount) {
      const key = `${item.inventoryItem.revenueAccount.accountNumber} ${item.inventoryItem.revenueAccount.accountTitle}`
      summary.revenueAccountBreakdown[key] = (summary.revenueAccountBreakdown[key] || 0) + 1
    }
  }

  return NextResponse.json({
    account7080,
    revenueAccounts,
    inventoryWithRevAcct,
    inventoryWithoutRevAcct,
    productOrders,
    summary,
  })
}
