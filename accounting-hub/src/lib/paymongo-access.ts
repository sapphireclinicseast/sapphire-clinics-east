/**
 * Who may see and change PayMongo.
 *
 * Front desk is read-only, and only for their own branch's account: they need to look up a
 * patient's payment, not to mint links or edit vouchers. Everyone else keeps full access.
 * Kept in one place so the page and every API route agree — the UI hiding a button is not
 * enforcement, so each route checks these too.
 */

export const PAYMONGO_READ_ROLES = [
  'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER',
  'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'AHEA_FRONTDESK', 'AHGH_FRONTDESK',
]

export const PAYMONGO_WRITE_ROLES = [
  'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER',
  'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
]

/** PayMongo account codes a role may read. `null` = no restriction. */
export function allowedPaymongoAccounts(role?: string | null): string[] | null {
  if (role === 'AHEA_FRONTDESK') return ['AHEA']
  if (role === 'AHGH_FRONTDESK') return ['AHGH']
  return null
}

export function canReadPaymongoAccount(role: string | undefined | null, account: string): boolean {
  const allowed = allowedPaymongoAccounts(role)
  return !allowed || allowed.includes((account || '').toUpperCase())
}

export const canWritePaymongo = (role?: string | null) => PAYMONGO_WRITE_ROLES.includes(role || '')
