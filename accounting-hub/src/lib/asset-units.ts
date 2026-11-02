// Per-piece custody for a multi-pc asset (Asset.units JSON column).
// units = [{ accountableName }] aligned index-for-index with quantity; piece i is
// displayed as `${controlNumber}-${String(i+1).padStart(2,'0')}` — the sub number is
// derived, never stored, so the parent's control-number sequence stays intact.

// Each piece can also carry its own item name (one bulk order of different
// things — Hannah, 2026-11-01: an Amazon order of six toys is one amount and one
// depreciation, but each toy is named), its own condition and whether it is
// counted in audits. Older rows only have accountableName.
// A piece kept somewhere other than the asset's own location carries that room,
// and a piece assigned to other departments carries its own list (null = the
// asset's room / departments).
export type AssetUnit = { accountableName: string | null; name?: string | null; isDefective?: boolean; auditable?: boolean; location?: string | null; departments?: string[] | null }

export function sanitizeAssetUnits(units: unknown, quantity: number): AssetUnit[] | null {
  if (quantity <= 1 || !Array.isArray(units)) return null
  return Array.from({ length: Math.min(quantity, 200) }, (_, i) => {
    const u = units[i] as { accountableName?: unknown; name?: unknown; isDefective?: unknown; auditable?: unknown; location?: unknown; departments?: unknown } | undefined
    const depts = Array.isArray(u?.departments)
      ? [...new Set(u.departments.filter((d): d is string => typeof d === 'string').map(d => d.trim()).filter(Boolean))].slice(0, 20)
      : []
    const n = typeof u?.accountableName === 'string' ? u.accountableName.trim().slice(0, 200) : ''
    const item = typeof u?.name === 'string' ? u.name.trim().toUpperCase().slice(0, 300) : ''
    return { accountableName: n || null, name: item || null, isDefective: u?.isDefective === true, auditable: u?.auditable !== false, location: cleanLocation(u?.location), departments: depts.length ? depts : null }
  })
}

// A room name as stored on an asset (Location Settings names, trimmed).
export function cleanLocation(v: unknown): string | null {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 100) || null : null
}

// The departments each piece serves: its own list, else the asset's.
export function pieceDepartments(assetDepartments: unknown, units: unknown, quantity: number): string[][] {
  const own = Array.isArray(assetDepartments) ? (assetDepartments as string[]) : []
  const list = Array.isArray(units) ? (units as AssetUnit[]) : []
  return quantity > 1 && list.length ? list.map(u => (u?.departments?.length ? u.departments : own)) : [own]
}

// Summary custodian line shown wherever the asset appears as one row
// (register list, audit snapshots, CSV): unique per-piece names in order.
export function summarizeAssetUnits(units: AssetUnit[] | null, fallback: string | null): string | null {
  if (!units?.length) return fallback
  const names = [...new Set(units.map(u => (u.accountableName || '').trim()).filter(Boolean))]
  return names.length ? names.join(', ') : fallback
}
