// Downpayment rates in PHP, keyed by branch then department.
// Used by /api/decking/bookings/[id]/approve to compute the PayMongo amount.

export type BranchCode = 'SBEA' | 'SBGH'

export const DOWNPAYMENT_RATES: Record<BranchCode, Record<string, number>> = {
  SBEA: {
    PT: 500,
    OT: 1000,
    SLP: 1000,
    SPED: 500,
    PSYCHOLOGY: 1000,
    MD: 1000,                            // legacy generic — kept for any stale records
    PSYCHIATRY: 1000,                    // MD sub-specialty at SBEA
    DEVELOPMENTAL_PEDIATRICIAN: 6000,    // MD sub-specialty at SBEA
    REHABILITATION_MEDICINE: 1000,       // MD sub-specialty at SBEA
    ORTHOSIS: 0,
  },
  SBGH: {
    PT: 1000,
    OT: 1000,
    SLP: 1000,
    SPED: 1000,
    PSYCHOLOGY: 1000,
    PSYCHIATRY: 1000,
    DEVELOPMENTAL_PEDIATRICIAN: 6000,
    REHABILITATION_MEDICINE: 1000,
    MD: 1000,
  },
}

export function getDownpayment(branch: string, department: string): number {
  const b = branch as BranchCode
  const table = DOWNPAYMENT_RATES[b]
  if (!table) return 0
  return table[department] ?? 0
}
