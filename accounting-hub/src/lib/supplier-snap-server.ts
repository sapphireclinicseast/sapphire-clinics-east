import type { Prisma, PrismaClient } from '@prisma/client'
import { snapSupplierName, supplierNameIndex, type SnapResult, type SupplierNameIndex } from '@/lib/supplier-snap'

type Db = PrismaClient | Prisma.TransactionClient

// Every supplier name we know, best spelling first: saved suppliers (Suppliers
// page), then each branch's Expenses supplier list, then names that only appear
// on expense entries — most-used spelling first.
export async function loadSupplierNameIndex(db: Db): Promise<SupplierNameIndex> {
  const masters = await db.supplier.findMany({ where: { isActive: true }, select: { supplierName: true }, orderBy: { createdAt: 'asc' } })
  const saved = await db.expenseSupplier.findMany({ select: { registeredName: true }, orderBy: { createdAt: 'asc' } })
  const used = await db.pettyCashEntry.groupBy({ by: ['registeredName'], where: { registeredName: { not: null } }, _count: { _all: true } })
  used.sort((a, b) => b._count._all - a._count._all)
  return supplierNameIndex([
    ...masters.map(m => m.supplierName),
    ...saved.map(s => s.registeredName),
    ...used.map(u => u.registeredName || ''),
  ])
}

// A Registered Name as it should be saved (capitals, like every entry route).
export function snapRegisteredName(typed: string | null | undefined, index: SupplierNameIndex): SnapResult {
  const r = snapSupplierName(typed || '', index)
  return { name: r.name.toUpperCase(), snappedFrom: r.snappedFrom }
}
