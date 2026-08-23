/**
 * The bank behind a chart-of-accounts entry.
 *
 * There is no bank column — an account is identified by title ("AHEA BDO
 * Checking Account") with the real bank account number in `accountNumber`. This
 * pulls the bank out of the title so the quotation can print it separately.
 */

const BANKS = [
  'BDO', 'AUB', 'BPI', 'METROBANK', 'UNIONBANK', 'SECURITY BANK',
  'LANDBANK', 'PNB', 'RCBC', 'CHINABANK', 'EASTWEST', 'MAYBANK',
]

/** "AHEA BDO Checking Account" → "BDO". Null when the title names no bank we know. */
export function bankFromTitle(title: string): string | null {
  const upper = (title || '').toUpperCase()
  return BANKS.find(b => new RegExp(`\\b${b}\\b`).test(upper)) || null
}
