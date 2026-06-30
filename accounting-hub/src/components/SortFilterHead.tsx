'use client'

export interface SortCol { key: string; label: string }

// Filter (case-insensitive contains) + sort an array using a value accessor.
export function applySortFilter<T>(
  rows: T[],
  get: (r: T, key: string) => string | number,
  sortKey: string,
  sortDir: 'asc' | 'desc',
  filters: Record<string, string>,
): T[] {
  let out = rows.filter(r =>
    Object.entries(filters).every(([k, v]) => !v || String(get(r, k) ?? '').toLowerCase().includes(v.toLowerCase())),
  )
  if (sortKey) {
    out = [...out].sort((a, b) => {
      const av = get(a, sortKey), bv = get(b, sortKey)
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv))
      return cmp * (sortDir === 'asc' ? 1 : -1)
    })
  }
  return out
}

// A <thead> with clickable sort + per-column filter inputs.
export function SortFilterHead({ cols, sortKey, sortDir, filters, onToggleSort, onFilter, trailing }: {
  cols: SortCol[]; sortKey: string; sortDir: 'asc' | 'desc'; filters: Record<string, string>
  onToggleSort: (k: string) => void; onFilter: (k: string, v: string) => void; trailing?: boolean
}) {
  return (
    <thead className="sticky top-0 z-10">
      <tr style={{ background: 'var(--off-white)' }}>
        {cols.map(c => (
          <th key={c.key} className="border-b border-r px-3 py-2 text-left align-top whitespace-nowrap"
            style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <button onClick={() => onToggleSort(c.key)} className="flex items-center gap-1 text-xs font-semibold">
              {c.label}
              <span style={{ color: sortKey === c.key ? 'var(--teal)' : 'var(--light-gray)' }}>{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
            </button>
            <input value={filters[c.key] || ''} onChange={e => onFilter(c.key, e.target.value)} placeholder="filter…"
              className="mt-1 w-full px-2 py-1 rounded border text-[11px] font-normal" style={{ borderColor: 'var(--light-gray)' }} />
          </th>
        ))}
        {trailing && <th className="border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }} />}
      </tr>
    </thead>
  )
}
