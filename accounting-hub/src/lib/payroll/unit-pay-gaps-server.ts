// Server side of the red-consultant payroll block (see unit-pay-gaps.ts).

import { prisma } from '@/lib/prisma'
import { zeroUnitPays } from './unit-pay-gaps'

/** Of these consultants, the ones still red: id → name. */
export async function redConsultants(consultantIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(consultantIds.filter(Boolean))]
  if (ids.length === 0) return out
  const [unitPays, consultants] = await Promise.all([
    prisma.unitPay.findMany({ where: { isActive: true }, select: { id: true, name: true, departments: true } }),
    prisma.consultant.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, department: true, unitPayRates: { select: { unitPayId: true, amount: true, disabled: true, varies: true } } },
    }),
  ])
  for (const c of consultants) {
    if (zeroUnitPays(c.department, c.unitPayRates, unitPays).length > 0) out.set(c.id, c.name)
  }
  return out
}
