'use client'

import { useRef } from 'react'

export interface SortCol { key: string; label: string }

// Filter (case-insensitive contains) + sort an array using a value accessor.
// `get` drives sorting (return a number for numeric/date columns so they order
// correctly). Pass `filterGet` when the text a user should filter on differs
// from the sort value (e.g. a date that sorts by timestamp but filters by its
// displayed "MM/DD/YYYY" string). Defaults to `get` for backward compatibility.
export function applySortFilter<T>(
  rows: T[],
  get: (r: T, key: string) => string | number,
  sortKey: string,
  sortDir: 'asc' | 'desc',
  filters: Record<string, string>,
  filterGet?: (r: T, key: string) => string | number,
): T[] {
  const fget = filterGet || get
  let out = rows.filter(r =>
    Object.entries(filters).every(([k, v]) => !v || String(fget(r, k) ?? '').toLowerCase().includes(v.toLowerCase())),
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

const MIN_COL_WIDTH = 70

// A <thead> with clickable sort + per-column filter inputs. Pass `widths` +
// `onWidthsChange` to make the columns user-resizable: each header gets a drag
// handle on its right edge; the first drag snapshots every column's rendered
// width (so only the dragged one changes) and the parent should switch its
// <table> to `tableLayout: 'fixed'` once widths exist.
export function SortFilterHead({ cols, sortKey, sortDir, filters, onToggleSort, onFilter, trailing, widths, onWidthsChange }: {
  cols: SortCol[]; sortKey: string; sortDir: 'asc' | 'desc'; filters: Record<string, string>
  onToggleSort: (k: string) => void; onFilter: (k: string, v: string) => void; trailing?: boolean
  widths?: Record<string, number> | null
  onWidthsChange?: (w: Record<string, number>) => void
}) {
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({})

  const startResize = (key: string, e: React.PointerEvent) => {
    if (!onWidthsChange) return
    e.preventDefault()
    e.stopPropagation()
    // Snapshot every column at its current rendered width so switching the
    // table to fixed layout doesn't reflow the untouched columns.
    const snapshot: Record<string, number> = {}
    for (const c of cols) snapshot[c.key] = widths?.[c.key] ?? Math.round(thRefs.current[c.key]?.offsetWidth || 120)
    const startX = e.clientX
    const startW = snapshot[key]
    const move = (ev: PointerEvent) => {
      onWidthsChange({ ...snapshot, [key]: Math.max(MIN_COL_WIDTH, startW + Math.round(ev.clientX - startX)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <thead className="sticky top-0 z-10">
      <tr style={{ background: 'var(--off-white)' }}>
        {cols.map(c => (
          <th key={c.key} ref={el => { thRefs.current[c.key] = el }}
            className="border-b border-r px-3 py-2 text-left align-top whitespace-nowrap"
            style={{
              color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)',
              position: 'relative',
              ...(widths?.[c.key] ? { width: widths[c.key] } : {}),
            }}>
            <button onClick={() => onToggleSort(c.key)} className="flex items-center gap-1 text-xs font-semibold">
              {c.label}
              <span style={{ color: sortKey === c.key ? 'var(--teal)' : 'var(--light-gray)' }}>{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
            </button>
            <input value={filters[c.key] || ''} onChange={e => onFilter(c.key, e.target.value)} placeholder="filter…"
              className="mt-1 w-full px-2 py-1 rounded border text-[11px] font-normal" style={{ borderColor: 'var(--light-gray)' }} />
            {onWidthsChange && (
              <span
                onPointerDown={e => startResize(c.key, e)}
                onClick={e => e.stopPropagation()}
                title="Drag to resize column"
                style={{
                  position: 'absolute', top: 0, right: -3, width: 7, height: '100%',
                  cursor: 'col-resize', zIndex: 11, touchAction: 'none',
                }}
              />
            )}
          </th>
        ))}
        {trailing && <th className="border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }} />}
      </tr>
    </thead>
  )
}
