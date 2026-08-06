/**
 * What counts as a cheque number, and what it looks like once written down.
 *
 * The `checkNumber` column is free text and has been used for more than cheques:
 * a telegraphic transfer keeps its bank reference there ("NA TELEGRAPHIC TRANSFER
 * FTO-07212026-161926-21979578"), and the same cheque has been typed as
 * "BDO 0000321601", "0000321601" and "BDO Check 321601" on different days. Check
 * Release Monitoring is a cheque book, so it should show cheques only, once each,
 * written the same way every time.
 */

/** References that name a non-cheque instrument, however many digits they carry. */
const NOT_A_CHEQUE = /telegraphic|\bt\/?t\b|wire|online|fund\s*transfer|fto-|remittance|payroll\s+bob|\bbob\s+reference|\bsss\b/i

/** A cheque number is this many digits once the decoration is stripped. */
const MIN_DIGITS = 4
const MAX_DIGITS = 12

/**
 * The digits of a cheque number, or null when the reference is not a cheque.
 * Leading zeros are kept — they are part of the number printed on the cheque.
 */
export function chequeDigits(raw: string | null | undefined): string | null {
  const s = (raw || '').trim()
  if (!s) return null
  if (NOT_A_CHEQUE.test(s)) return null
  const digits = s.replace(/\D/g, '')
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null
  return digits
}

/** True when this reference should appear in Check Release Monitoring. */
export const isCheque = (raw: string | null | undefined): boolean => chequeDigits(raw) !== null

/** What the user types, reduced to what we store. Used by the cheque-number inputs. */
export const toChequeInput = (raw: string): string => (raw || '').replace(/\D/g, '').slice(0, MAX_DIGITS)
