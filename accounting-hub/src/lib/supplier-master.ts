import { prisma } from '@/lib/prisma'
import { supplierKey } from '@/lib/supplier-directory'

/**
 * The supplier record for a Registered Name, created when there is none yet
 * (Hannah, 2026-11-02: an expense's supplier must carry over to the asset made
 * from it). Names match with spacing and punctuation ignored; an active record
 * wins over a deactivated one.
 */
export async function findOrCreateSupplier(name: string, extra: { tin?: string | null; address?: string | null }, userId: string): Promise<string | null> {
  const key = supplierKey(name || '')
  if (!key) return null
  const all = await prisma.supplier.findMany({ select: { id: true, supplierName: true, isActive: true }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] })
  const hit = all.find(s => supplierKey(s.supplierName) === key)
  if (hit) return hit.id
  const created = await prisma.supplier.create({
    data: {
      supplierName: name.replace(/\s+/g, ' ').trim().toUpperCase(),
      tin: extra.tin?.trim() || null,
      address: extra.address?.trim().toUpperCase() || null,
      createdById: userId,
    },
  })
  await prisma.auditLog.create({ data: { userId, action: 'CREATE', entity: 'supplier', entityId: created.id, details: { supplierName: created.supplierName, via: 'expense-to-asset' } } })
  return created.id
}
