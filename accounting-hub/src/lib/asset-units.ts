// Per-piece custody for a multi-pc asset (Asset.units JSON column).
// units = [{ accountableName }] aligned index-for-index with quantity; piece i is
// displayed as `${controlNumber}-${String(i+1).padStart(2,'0')}` — the sub number is
// derived, never stored, so the parent's control-number sequence stays intact.

export type AssetUnit = { accountableName: string | null }

export function sanitizeAssetUnits(units: unknown, quantity: number): AssetUnit[] | null {
  if (quantity <= 1 || !Array.isArray(units)) return null
  return Array.from({ length: Math.min(quantity, 200) }, (_, i) => {
    const u = units[i] as { accountableName?: unknown } | undefined
    const n = typeof u?.accountableName === 'string' ? u.accountableName.trim().slice(0, 200) : ''
    return { accountableName: n || null }
  })
}

// Summary custodian line shown wherever the asset appears as one row
// (register list, audit snapshots, CSV): unique per-piece names in order.
export function summarizeAssetUnits(units: AssetUnit[] | null, fallback: string | null): string | null {
  if (!units?.length) return fallback
  const names = [...new Set(units.map(u => (u.accountableName || '').trim()).filter(Boolean))]
  return names.length ? names.join(', ') : fallback
}
