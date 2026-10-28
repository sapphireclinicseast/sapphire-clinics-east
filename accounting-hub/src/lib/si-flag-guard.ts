import { prisma } from '@/lib/prisma'
import { parseMonitoringRemark } from './si-monitoring'

// Normalized SI integer ("0187" / "SI 187" → 187); null when there are no
// digits, or too many to be a booklet number (bank refs typed into SI fields).
export const siIntOf = (s: string | null | undefined): number | null => {
  const d = String(s || '').replace(/\D/g, '')
  return d && d.length < 10 ? parseInt(d, 10) : null
}

/**
 * SI numbers already carried by an order or an AR collection, per branch,
 * normalized to integers. Queried WITHOUT a date window on purpose: the SI
 * booklet is one continuous series, so a number is taken forever once any
 * record carries it, whatever period a report is looking at.
 *
 * Why this exists: the 2026-09-09 monitoring-workbook import created REMARKS
 * flags for pre-hub invoices; some of those invoices were later SI-tagged onto
 * their POS orders (Convert / declared-date retro-tagging). Counting the flag
 * AND the order double-counts the sale — GH's SI book was overstated ₱126,235
 * this way. The order is the system of record once it carries the SI, so every
 * SI-based computation skips such flags via isShadowedMonitoringFlag.
 */
export async function takenSiNumbers(branch?: string | null): Promise<Map<string, Set<number>>> {
  const branchWhere = branch && branch !== 'ALL' ? { branch } : {}
  const [orders, arPays] = await Promise.all([
    prisma.order.findMany({
      where: { ...branchWhere, status: { in: ['COMPLETED', 'REOPENED'] }, issuedOfficialInvoice: true, salesInvoiceNumber: { not: null } },
      select: { branch: true, salesInvoiceNumber: true },
    }),
    prisma.aRPayment.findMany({
      where: { ...branchWhere, salesInvoiceNumber: { not: null } },
      select: { branch: true, salesInvoiceNumber: true },
    }),
  ])
  const taken = new Map<string, Set<number>>()
  const add = (b: string | null, si: string | null) => {
    const n = siIntOf(si)
    if (n === null || !b) return
    const set = taken.get(b) ?? new Set<number>()
    set.add(n)
    taken.set(b, set)
  }
  for (const o of orders) add(o.branch, o.salesInvoiceNumber)
  for (const p of arPays) add(p.branch, p.salesInvoiceNumber)
  return taken
}

// True when this REMARKS flag is a migrated monitoring row whose SI number an
// order / AR collection in the same branch already carries — a duplicate book
// row to skip. Hand-typed REMARKS annotations ("2 orders in one SI", "DOUBLE
// ENTRY") never parse as monitoring remarks, so they survive on taken numbers.
export function isShadowedMonitoringFlag(
  flag: { branch: string; siNumber: string; remarks: string | null },
  taken: Map<string, Set<number>>,
): boolean {
  const n = siIntOf(flag.siNumber)
  if (n === null || !taken.get(flag.branch)?.has(n)) return false
  return parseMonitoringRemark(flag.remarks) !== null
}
