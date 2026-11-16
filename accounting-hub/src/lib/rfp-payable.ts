// What an RFP actually pays out: its gross less the expanded withholding tax
// (EWT) withheld from the payee. The same "Amount Payable = GROSS − EWT" the
// petty cash RFP list shows (api/petty-cash/reimbursements): EWT is the entry's
// rate on its net-of-VAT amount; VAT is never deducted from the payee.
//
// Bank Rec needs this because the bank pays the net. Ortigas rent (Hannah
// 2026-11-16): AHGH-RFP26-000014 is ₱353,429.86 gross, the bank sent
// ₱343,435.67 — ₱9,994.19 EWT held back for BIR. Offering the RFP at its gross
// hid it from the suggestions, and picking it by search recorded a "Part
// payment ₱343,435.67 of ₱353,429.86", leaving the RFP looking ₱9,994.19 unpaid.
// Prisma-free so the candidate list, the match guard and tests can share it.

import { netOfVat, type VatSource } from '@/lib/vat'

type Amount = number | string | { toString(): string } | null | undefined

export interface RfpEntryLike extends VatSource {
  hasEwt: boolean | null | undefined
  ewtRate: number | null | undefined
}

// A CEO branch RFP keeps each entry's allocated portion in meta.items.
interface CeoItem { gross?: Amount; vatable?: string | null; vatPortion?: Amount; hasEwt?: boolean | null; ewtRate?: number | null }

const n = (v: Amount) => Number(v ?? 0) || 0
const r2 = (v: number) => Math.round(v * 100) / 100

/** EWT withheld on one entry (or one allocated part of it), to the centavo. */
function ewtOf(src: VatSource, amount: number, hasEwt: boolean | null | undefined, rate: number | null | undefined): number {
  if (!hasEwt || !rate) return 0
  return r2(netOfVat(src, amount) * (Number(rate) / 100))
}

/**
 * The RFP's gross, the EWT withheld from it, and what is paid out (gross − EWT).
 * RFPs with no expense entries (payroll, tax, benefit) withhold nothing here.
 */
export function rfpPayable(r: { grossTotal: Amount; meta?: unknown; entries?: RfpEntryLike[] | null }): { gross: number; ewt: number; payable: number } {
  const gross = n(r.grossTotal)
  const meta = r.meta as { items?: CeoItem[] } | null | undefined
  let ewt = 0
  if (meta && Array.isArray(meta.items)) {
    for (const i of meta.items) {
      const g = n(i.gross)
      ewt += ewtOf({ vatable: i.vatable ?? null, grossAmount: g, vatPortion: i.vatPortion ?? null }, g, i.hasEwt, i.ewtRate)
    }
  } else {
    for (const e of r.entries || []) ewt += ewtOf(e, n(e.grossAmount), e.hasEwt, e.ewtRate)
  }
  ewt = r2(ewt)
  // Never more than the gross, never negative (a credit entry with EWT).
  if (ewt < 0 || ewt > gross) ewt = 0
  return { gross, ewt, payable: r2(gross - ewt) }
}

/**
 * EWT is worked out per line and the payer rounds it their own way, so a
 * net-of-EWT payment can land a few centavos off the computed figure (Ortigas
 * July/August: ₱0.01). Records that withhold EWT are matched within this.
 */
export const EWT_ROUNDING = 0.05
