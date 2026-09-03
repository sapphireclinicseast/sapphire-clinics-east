import type { PrismaClient, Prisma } from '@prisma/client'

/* SOA reference numbers: BR-YYYYMMDD-HMO-000x, e.g. AHEA-20260903-ITCR-0001.
 * BR       — branch the claims belong to (AHEA = East, AHGH = Greenhills)
 * YYYYMMDD — the date the SOA was submitted
 * HMO      — provider code from SOA Settings (falls back to a derived code)
 * 000x     — sequence within that exact prefix; no duplicates.
 * Assigned only when a submission is actually recorded — a generated-but-
 * unsubmitted SOA has no reference number yet. */

export const SOA_BRANCH_CODE: Record<string, string> = {
  SANDBOX_EAST: 'AHEA',
  SANDBOX_GREENHILLS: 'AHGH',
}

export function soaBranchCode(branch: string | null | undefined): string {
  return SOA_BRANCH_CODE[branch || ''] || 'SCEI'
}

/** Provider code: the SOA Settings override for this wallet, else the first
 *  four letters of the provider name (letters only, upper-cased). */
export function soaHmoCode(
  hmoCodes: unknown,
  walletId: string,
  walletName: string,
): string {
  const codes = (hmoCodes && typeof hmoCodes === 'object') ? hmoCodes as Record<string, unknown> : {}
  const override = typeof codes[walletId] === 'string' ? (codes[walletId] as string).trim().toUpperCase() : ''
  if (override) return override.replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'HMO'
  const letters = (walletName || '').toUpperCase().replace(/[^A-Z]/g, '')
  return letters.slice(0, 4) || 'HMO'
}

export function soaDatePart(submittedDate: Date): string {
  // Clinic dates are Manila dates; format the calendar day in Asia/Manila.
  return submittedDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).replace(/-/g, '')
}

/** Next free reference number for a prefix. Call inside the same transaction
 *  that creates the submission; the unique index is the final referee. */
export async function nextSoaReferenceNo(
  tx: PrismaClient | Prisma.TransactionClient,
  branchCode: string,
  submittedDate: Date,
  hmoCode: string,
): Promise<string> {
  const prefix = `${branchCode}-${soaDatePart(submittedDate)}-${hmoCode}-`
  const existing = await tx.soaSubmission.findMany({
    where: { referenceNo: { startsWith: prefix } },
    select: { referenceNo: true },
  })
  let max = 0
  for (const r of existing) {
    const n = parseInt((r.referenceNo || '').slice(prefix.length), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
