/**
 * Canonical GL wiring for a product, derived from its SKU classification.
 *
 * Every product sale posts the same shape of entry, so the accounts never vary by
 * product — what varies is the SKU department, which drives (a) the inventory
 * sub-classification on the balance sheet and (b) the "Department · Category"
 * breakdown under 7080 on the income statement (see sku-taxonomy.ts).
 *
 *   Revenue   7080 Sales of Product Income   ← income-statement line for the sale
 *   COGS      8320 Cost of Sales             ← expense side of the COGS pair
 *   Inventory 1050 Inventory Asset           ← asset side of the COGS pair
 *
 * Those three were already uniform across all 215 catalogued products before this
 * helper existed — they were just typed in by hand each time, so any product created
 * through a path that didn't ask for them (bulk import, consignment transfer) got
 * none, and its sales had no revenue account to resolve. postOrderJournal then either
 * fell back to 7000 Unclassified Revenue (revenue missing) or refused to post the
 * whole order (COGS/inventory missing on an item with cost). Deriving them here
 * instead means a product is wired correctly by construction, from its classification
 * alone, whichever path created it.
 */

// SKU department → inventory sub-type. Mirrors INV_SUB_TYPES in the Inventory page;
// note SP (Special Education) → INV_SPED, the one code that isn't a straight copy.
export const INV_SUBTYPE_BY_DEPT: Record<string, string> = {
  PT: 'INV_PT',
  OT: 'INV_OT',
  ST: 'INV_ST',
  SP: 'INV_SPED',
  PSY: 'INV_PSY',
  CLI: 'INV_CLI',
  DIG: 'INV_DIG',
  EDU: 'INV_EDU',
  MER: 'INV_MER',
}

export const PRODUCT_REVENUE_ACCOUNT = '7080'
export const PRODUCT_COGS_ACCOUNT = '8320'
export const PRODUCT_INVENTORY_ACCOUNT = '1050'

/** Inventory sub-type for a SKU department, or null for an unrecognised department. */
export function inventorySubTypeForDept(skuDepartment?: string | null): string | null {
  const d = (skuDepartment || '').trim().toUpperCase()
  return INV_SUBTYPE_BY_DEPT[d] ?? null
}

export interface ProductAccountFields {
  revenueAccountId?: string | null
  expenseAccountId?: string | null
  sourceAccountId?: string | null
  accountSubType?: string | null
}

// Minimal shape so this works with both PrismaClient and a transaction client.
interface AccountLookup {
  account: { findFirst(args: unknown): Promise<{ id: string } | null> }
}

/**
 * Fill in whichever GL fields are missing, from the product's SKU department.
 * Explicit values always win — this only ever fills blanks, so a deliberate
 * override (e.g. a product routed to a different revenue line) is never
 * clobbered, and calling it on an already-wired product is a no-op.
 *
 * Accounts are resolved by number so this survives a chart-of-accounts reseed;
 * a missing account simply leaves that field null rather than throwing, since a
 * product with no COGS account is still a valid catalogue entry — it just can't
 * post a COGS pair until the account exists.
 */
export async function resolveProductAccounts<T extends AccountLookup>(
  db: T,
  skuDepartment: string | null | undefined,
  provided: ProductAccountFields = {},
): Promise<ProductAccountFields> {
  const need = {
    revenue: !provided.revenueAccountId,
    expense: !provided.expenseAccountId,
    source: !provided.sourceAccountId,
  }
  const [revenue, expense, source] = await Promise.all([
    need.revenue ? db.account.findFirst({ where: { accountNumber: PRODUCT_REVENUE_ACCOUNT }, select: { id: true } }) : null,
    need.expense ? db.account.findFirst({ where: { accountNumber: PRODUCT_COGS_ACCOUNT }, select: { id: true } }) : null,
    need.source ? db.account.findFirst({ where: { accountNumber: PRODUCT_INVENTORY_ACCOUNT }, select: { id: true } }) : null,
  ])
  return {
    revenueAccountId: provided.revenueAccountId || revenue?.id || null,
    expenseAccountId: provided.expenseAccountId || expense?.id || null,
    sourceAccountId: provided.sourceAccountId || source?.id || null,
    accountSubType: provided.accountSubType || inventorySubTypeForDept(skuDepartment),
  }
}
