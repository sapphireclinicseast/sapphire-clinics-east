import type { PrismaClient } from '@prisma/client'

// Sales Invoice number → canonical 4-digit zero-padded numeric form.
// Uses the LAST run of digits so year-prefixed forms collapse to the invoice
// sequence: "SI 349"→"0349", "SI No. 00324"→"0324", "389"→"0389",
// "SI-2026-0330"→"0330". Non-numeric/blank → null. ≥4-digit sequences keep length.
export function normalizeSI(raw: string | null | undefined): string | null {
  const groups = String(raw ?? '').match(/\d+/g)
  if (!groups || groups.length === 0) return null
  return String(parseInt(groups[groups.length - 1], 10)).padStart(4, '0')
}

// ── SI on an AR / HMO collection (Hannah 2026-11-19: "if a sales invoice is
// marked in payment history of HMO, it should reflect automatically in the
// sales summary SI section") ──────────────────────────────────────────────
// The SI field on a payment feeds the Sales Summary's invoiced view and the
// With-SI book, so it must hold an invoice number and nothing else. Typed
// remarks ("No SI c/o …") and bank references ("UB181909") used to land there
// and were counted as invoices.

/** "4045", "SI 4045", "SI No. 4045", "#4045" → "4045"; anything else is not an SI. */
export const AR_SI_PATTERN = /^(?:s\.?\s*i\.?\s*(?:no\.?)?\s*)?#?\s*\d{1,8}$/i

export function arSiFromInput(raw: string | null | undefined): { si: string | null; error?: string } {
  const s = String(raw ?? '').trim()
  if (!s) return { si: null }
  if (!AR_SI_PATTERN.test(s)) {
    return { si: null, error: `"${s.slice(0, 40)}" is not a Sales Invoice number — type the invoice number only (e.g. 4045), and put any remark in Notes` }
  }
  return { si: normalizeSI(s) }
}

/** True when a stored AR SI value is a real invoice number (old records may hold remarks). */
export const isArSiNumber = (raw: string | null | undefined): boolean => !!raw && AR_SI_PATTERN.test(raw.trim())

type SiDb = Pick<PrismaClient, 'order' | 'aRPayment' | 'salesInvoiceFlag'>

/**
 * Why `si` cannot go on a collection from `walletIds` in `branch`, or null when
 * it can. One invoice may cover two remittances from the same payer, so only
 * another payer's collection, an order, or a tagged book flag clash.
 */
export async function arSiClash(db: SiDb, branch: string | null, si: string, walletIds: string[], excludePaymentId?: string): Promise<string | null> {
  if (!branch) return null
  const [order, ar, flag] = await Promise.all([
    db.order.findFirst({ where: { branch, salesInvoiceNumber: si, status: { in: ['COMPLETED', 'REOPENED'] } }, select: { orderNumber: true } }),
    db.aRPayment.findFirst({ where: { branch, salesInvoiceNumber: si, walletId: { notIn: walletIds }, ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}) }, select: { notes: true } }),
    db.salesInvoiceFlag.findUnique({ where: { branch_siNumber: { branch, siNumber: si } } }),
  ])
  if (order) return `SI ${si} is already on order #${order.orderNumber}`
  if (ar) return `SI ${si} is already on another payer's collection${ar.notes ? ` (${ar.notes.split(/[;|]/)[0].trim().slice(0, 30)})` : ''}`
  if (flag?.status === 'TAGGED') return `SI ${si} is already tagged to an order in the SI book`
  return null
}
