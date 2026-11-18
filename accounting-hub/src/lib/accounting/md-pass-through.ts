// MD pass-through (owner directive 2026-08-24): when every item on an order is a
// consult the HMO settles with the clinician directly, and no paying wallet is a
// pays-the-clinic exception, nothing on it is our revenue or receivable — the
// books get no entry at all. A consult the HMO paid through the clinic this once
// (Payments to Doctors, lib/hmo-coursed-fee) is our sale after all.
//
// One rule for the live posting (post-order.ts) and the reports engine, which
// fills in an entry only for completed orders that SHOULD have one: it used to
// fill one in for these consults too, putting them back into 1010 and MD sales.

export type MdPassThroughOrder = {
  hmoCoursedThroughClinic?: boolean | null
  items: { service?: { hmoPaysClinicianDirect?: boolean | null } | null }[]
  payments: { method: string; wallet?: { paysClinicForMd?: boolean | null } | null }[]
}

export function isMdPassThrough(o: MdPassThroughOrder): boolean {
  return !o.hmoCoursedThroughClinic
    && o.items.length > 0
    && o.items.every(i => !!i.service?.hmoPaysClinicianDirect)
    && o.payments.some(p => p.method === 'HMO')
    && !o.payments.some(p => !!p.wallet?.paysClinicForMd)
}
