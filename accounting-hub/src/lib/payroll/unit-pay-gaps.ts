// A consultant shows red in the Consultant List while a unit pay that applies to
// their department is neither disabled, given an amount, nor marked Varies: a
// session under it would pay ₱0 PF. Payroll does not process them until that is
// set (Hannah 2026-11-04). Pure helpers shared by the list and the payroll routes
// so the red row and the block always agree.

type UnitPayLite = { name: string; id: string; isActive?: boolean | null; departments?: unknown }
type RateLite = { unitPayId: string; amount: unknown; disabled?: boolean | null; varies?: boolean | null }

export function zeroUnitPays<U extends UnitPayLite>(department: string, rates: RateLite[], unitPays: U[]): U[] {
  return unitPays.filter(up => {
    if (up.isActive === false) return false
    const depts = Array.isArray(up.departments) ? (up.departments as string[]) : []
    if (depts.length > 0 && !depts.includes(department)) return false
    const r = rates.find(x => x.unitPayId === up.id)
    return !r || (!r.disabled && !r.varies && !(Number(r.amount) > 0))
  })
}

export const redBlockMessage = (names: string[]) =>
  `${names.join(', ')} still ${names.length === 1 ? 'has' : 'have'} unit pays at ₱0. Set an amount, tick Varies, or untick them in the Consultant List before processing payroll.`
