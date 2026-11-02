// Shared by the Suppliers page and /api/suppliers/directory (Hannah, 2026-11-02).

// Supplier names are matched with spacing and punctuation ignored, so
// "OFFICE WAREHOUSE, INC." and "Office Warehouse Inc" are the same supplier.
export const supplierKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface DirectoryRow {
  key: string
  name: string
  names: string[] // every spelling on record — used to pull the history
  masterId: string | null
  isActive: boolean
  expenseIds: { id: string; branch: string }[]
  branches: string[]
  tin: string
  address: string
  contactPerson: string
  contactNumber: string
  email: string
  contactMethod: string
  contactHandle: string
  isForeign: boolean
  currency: string
  defaultExchangeRate: number | null
  notes: string
  itemsProvided: string
  provided: { accounts: { title: string; count: number; total: number }[]; assets: string[]; assetCount: number; inventory: string[]; inventoryCount: number }
  entryCount: number
  firstAppeared: string | null
  validity: 'Valid' | 'Invalid'
}
