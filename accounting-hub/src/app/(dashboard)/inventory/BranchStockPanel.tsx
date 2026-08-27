'use client'

/**
 * Branch Stock — where consigned inventory physically sits, live.
 *
 * IN = consignments RECEIVED at the branch. OUT = returns plus POS sales
 * attributed by CASHIER: product sales are store orders on paper, but a sale
 * rung by a clinic front-desk account happened at that clinic, out of its
 * consigned stock (policy: user, 2026-08-11). remaining = in − out.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, X, ArrowUpDown, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react'

const BRANCHES = [
  ['SANDBOX_EAST', 'AHEA'],
  ['SANDBOX_GREENHILLS', 'AHGH'],
  ['VERDANA_STORE', 'VER Store'],
] as const

interface Cell { received: number; inTransit: number; returned: number; sold: number; onHand: number | null }
interface Row { itemId: string; name: string; sku: string; totalStock: number; branches: Record<string, Cell> }
interface SoldLine {
  orderNumber: number | null; date: string; patientName: string | null; cashier: string | null
  quantity: number; isFreeSample: boolean; unitPrice: number; lineTotal: number
}

/** One leaf column: what it is called, how to sort it, and what it reads as. */
interface LeafCol {
  key: string
  label: string
  numeric: boolean
  /** Branch this column belongs to, for the group header. */
  branch?: string
  width: number
}

const BASE_COLS: LeafCol[] = [
  { key: 'name', label: 'Item', numeric: false, width: 260 },
  { key: 'sku', label: 'SKU', numeric: false, width: 170 },
  { key: 'total', label: 'Total stock', numeric: true, width: 90 },
]

const LEAF_COLS: LeafCol[] = [
  ...BASE_COLS,
  ...BRANCHES.flatMap(([b]) => ([
    { key: `${b}|in`, label: 'In', numeric: true, branch: b, width: 78 },
    { key: `${b}|sold`, label: 'Sold', numeric: true, branch: b, width: 70 },
    { key: `${b}|left`, label: 'Left', numeric: true, branch: b, width: 70 },
  ] as LeafCol[])),
]

/** Live remaining for a cell — the same figure the Left column shows. */
const leftOf = (c?: Cell) => (c ? (c.onHand ?? c.received - c.returned - c.sold) : 0)

/** Sort value for a column. Missing cells sort as 0, not as absent. */
function valueOf(r: Row, key: string): string | number {
  if (key === 'name') return r.name || ''
  if (key === 'sku') return r.sku || ''
  if (key === 'total') return r.totalStock || 0
  const [b, part] = key.split('|')
  const c = r.branches[b]
  if (part === 'in') return c?.received || 0
  if (part === 'sold') return c?.sold || 0
  return leftOf(c)
}

/**
 * Column filter. A plain string matches as a substring, but a numeric column
 * also accepts a comparison — "<0" to find what has gone negative, ">100" for
 * what is overstocked. Reading a negative off this table is the main reason to
 * filter it at all, and "-" as a substring would match nothing useful.
 */
function matchesFilter(value: string | number, raw: string, numeric: boolean): boolean {
  const f = raw.trim()
  if (!f) return true
  if (numeric) {
    const m = f.match(/^(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)$/)
    if (m) {
      const n = Number(value) || 0
      const t = Number(m[2])
      switch (m[1]) {
        case '<': return n < t
        case '<=': return n <= t
        case '>': return n > t
        case '>=': return n >= t
        default: return n === t
      }
    }
  }
  return String(value).toLowerCase().includes(f.toLowerCase())
}

const WIDTHS_KEY = 'branch-stock-col-widths'

export default function BranchStockPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  // Sold drill-down: the order lines behind one item x branch cell.
  const [drill, setDrill] = useState<{ item: Row; branch: string; label: string } | null>(null)
  const [drillRows, setDrillRows] = useState<SoldLine[] | null>(null)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  // Widths persist per browser: someone who widens Item to read full names
  // should not have to do it again tomorrow.
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(LEAF_COLS.map(c => [c.key, c.width])))

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIDTHS_KEY)
      if (saved) setWidths(w => ({ ...w, ...JSON.parse(saved) }))
    } catch { /* a corrupt entry just means the defaults stand */ }
  }, [])

  const persistWidths = useCallback((next: Record<string, number>) => {
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }, [])

  const resetWidths = () => {
    const d = Object.fromEntries(LEAF_COLS.map(c => [c.key, c.width]))
    setWidths(d); persistWidths(d)
  }

  // Drag-to-resize. Tracked in a ref so the move handler is not re-bound on
  // every pixel, and committed to storage once on release rather than 300 times.
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const next = Math.max(48, d.startW + (e.clientX - d.startX))
      setWidths(w => ({ ...w, [d.key]: next }))
    }
    const onUp = () => {
      if (!drag.current) return
      drag.current = null
      document.body.style.userSelect = ''
      setWidths(w => { persistWidths(w); return w })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [persistWidths])

  const startResize = (key: string) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { key, startX: e.clientX, startW: widths[key] ?? 100 }
    document.body.style.userSelect = 'none'
  }

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' || key === 'sku' ? 'asc' : 'desc') }
  }

  const openDrill = async (item: Row, branch: string, label: string) => {
    setDrill({ item, branch, label })
    setDrillRows(null)
    try {
      const r = await fetch(`/api/inventory/branch-stock?itemId=${item.itemId}&branch=${branch}`)
      const d = await r.json()
      setDrillRows(d.rows || [])
    } catch { setDrillRows([]) }
  }

  useEffect(() => {
    fetch('/api/inventory/branch-stock')
      .then(r => r.json())
      .then(d => setRows(d.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const ql = q.trim().toLowerCase()
  const visible = useMemo(() => {
    let out = ql ? rows.filter(r => r.name.toLowerCase().includes(ql) || r.sku.toLowerCase().includes(ql)) : rows
    for (const col of LEAF_COLS) {
      const f = filters[col.key]
      if (!f?.trim()) continue
      out = out.filter(r => matchesFilter(valueOf(r, col.key), f, col.numeric))
    }
    const col = LEAF_COLS.find(c => c.key === sortKey)
    return [...out].sort((x, y) => {
      const a = valueOf(x, sortKey), b = valueOf(y, sortKey)
      const cmp = col?.numeric
        ? (Number(a) || 0) - (Number(b) || 0)
        : String(a).localeCompare(String(b))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, ql, filters, sortKey, sortDir])

  const activeFilters = Object.values(filters).filter(v => v?.trim()).length
  const tot = (b: string, k: keyof Cell) => visible.reduce((s, r) => s + (r.branches[b]?.[k] || 0), 0)

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Branch Stock</h2>
        <div className="flex items-center gap-2">
          {activeFilters > 0 && (
            <button onClick={() => setFilters({})}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
              Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
            </button>
          )}
          <button onClick={resetWidths} title="Reset column widths"
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <RotateCcw size={11} /> Widths
          </button>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item or SKU…"
            className="px-3 py-1.5 rounded-lg border text-xs w-64" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
        Each branch holds its consigned stock as its own live counter: consignments received add to it, sales rung by
        that branch&apos;s front desk deduct from it. <strong>Left</strong> is that live counter. In = consignments
        received to date (in-transit shown in parentheses — on the way, not yet stock).
        Click a heading to sort, filter under any column, and drag a heading&apos;s right edge to resize it.
        Number columns also take comparisons — <strong>&lt;0</strong> finds what has gone negative.
      </p>
      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></div> : (
        <div className="overflow-x-auto">
          <table className="text-xs" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            {/* Widths live on the colgroup: with tableLayout fixed this is what
                actually sizes a column, and one <col> per leaf keeps the two
                header rows and the body in step automatically. */}
            <colgroup>
              {LEAF_COLS.map(c => <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />)}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                <th colSpan={3} />
                {BRANCHES.map(([b, label]) => (
                  <th key={b} colSpan={3} className="px-2 py-2 text-center font-semibold border-l"
                    style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>{label}</th>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                {LEAF_COLS.map(c => {
                  const active = sortKey === c.key
                  const firstOfBranch = c.branch && c.key.endsWith('|in')
                  return (
                    <th key={c.key}
                      className={`px-2 py-1.5 font-semibold relative select-none ${firstOfBranch ? 'border-l' : ''}`}
                      style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
                      <button onClick={() => toggleSort(c.key)}
                        className={`flex items-center gap-1 w-full hover:opacity-70 ${c.numeric ? 'justify-end' : 'justify-start'}`}
                        title={`Sort by ${c.label}`}>
                        <span className="truncate">{c.label}</span>
                        {active
                          ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                          : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                      </button>
                      {/* Drag the right edge to resize. Sits above the sort
                          button so a drag never registers as a click. */}
                      <span onPointerDown={startResize(c.key)}
                        title="Drag to resize"
                        style={{ position: 'absolute', top: 0, right: -3, width: 7, height: '100%', cursor: 'col-resize', zIndex: 2 }} />
                    </th>
                  )
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--light-gray)' }}>
                {LEAF_COLS.map(c => (
                  <th key={`f-${c.key}`} className={`px-1.5 pb-1.5 ${c.branch && c.key.endsWith('|in') ? 'border-l' : ''}`}
                    style={{ borderColor: 'var(--light-gray)' }}>
                    <input
                      value={filters[c.key] || ''}
                      onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))}
                      placeholder={c.numeric ? '<0' : 'Filter…'}
                      title={c.numeric ? 'Text match, or a comparison such as <0, >=100, =5' : 'Text match'}
                      className="w-full px-1.5 py-1 rounded border text-[10px] font-normal outline-none"
                      style={{ borderColor: 'var(--light-gray)' }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.itemId} className="hover:bg-gray-50" style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {/* No slice(): the column is resizable now, so widening it is
                      how you read a long name. CSS truncates to whatever width
                      the user has chosen. */}
                  <td className="px-3 py-1.5 truncate" style={{ color: 'var(--charcoal)' }} title={r.name}>{r.name}</td>
                  <td className="px-3 py-1.5 truncate" style={{ color: 'var(--mid-gray)' }} title={r.sku}>{r.sku}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.totalStock}</td>
                  {BRANCHES.map(([b]) => {
                    const c = r.branches[b]
                    const rem = c ? (c.onHand ?? c.received - c.returned - c.sold) : 0
                    return (
                      <Fragment key={`${r.itemId}-${b}`}>
                        <td className="px-2 py-1.5 text-right tabular-nums border-l" style={{ borderColor: '#f3f4f6' }}>
                          {c?.received || (c?.inTransit ? '' : '—')}{c?.inTransit ? <span style={{ color: 'var(--mid-gray)' }}> ({c.inTransit})</span> : ''}
                          {c?.returned ? <span style={{ color: 'var(--mid-gray)' }} title="returned"> −{c.returned}</span> : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {c?.sold ? (
                            <button onClick={() => openDrill(r, b, (BRANCHES.find(x => x[0] === b)?.[1]) || b)}
                              className="underline decoration-dotted cursor-pointer hover:opacity-70 font-medium"
                              style={{ color: 'var(--teal)' }}
                              title="Show the orders behind this figure">{c.sold}</button>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold"
                          style={{ color: rem < 0 ? '#b91c1c' : rem > 0 ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                          {c ? rem : '—'}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={LEAF_COLS.length} className="px-3 py-6 text-center" style={{ color: 'var(--mid-gray)' }}>
                  {rows.length === 0 ? 'No consignment or branch sale activity yet.' : 'Nothing matches the current search and filters.'}
                </td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--light-gray)', fontWeight: 600 }}>
                <td className="px-3 py-2" colSpan={3}>Totals</td>
                {BRANCHES.map(([b]) => (
                  <Fragment key={`t-${b}`}>
                    <td className="px-2 py-2 text-right tabular-nums border-l" style={{ borderColor: '#f3f4f6' }}>{tot(b, 'received')}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{tot(b, 'sold')}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{visible.reduce((s, r) => s + leftOf(r.branches[b]), 0)}</td>
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setDrill(null)}>
          <div className="rounded-2xl bg-white w-full max-w-2xl max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                  Sold from {drill.label} — {drill.item.name}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{drill.item.sku} · every POS order line that deducted this branch&apos;s stock (free samples included)</p>
              </div>
              <button onClick={() => setDrill(null)} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
            </div>
            {drillRows === null ? (
              <div className="py-8 text-center"><Loader2 className="animate-spin inline" size={18} /></div>
            ) : drillRows.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--mid-gray)' }}>No order lines found.</p>
            ) : (
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                    <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                    <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Order</th>
                    <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Patient</th>
                    <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                    <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Qty</th>
                    <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Amount</th>
                    <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Cashier</th>
                  </tr>
                </thead>
                <tbody>
                  {drillRows.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{new Date(l.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}</td>
                      <td className="px-2 py-1.5">#{l.orderNumber ?? '—'}</td>
                      <td className="px-2 py-1.5" style={{ maxWidth: 160 }}>{l.patientName || '—'}</td>
                      <td className="px-2 py-1.5">
                        {l.isFreeSample
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#fefce8', color: '#a16207' }}>Free sample</span>
                          : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#fef2f2', color: '#b91c1c' }}>Sale</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.isFreeSample ? '—' : `₱${l.lineTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</td>
                      <td className="px-2 py-1.5">{l.cashier || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--light-gray)', fontWeight: 600 }}>
                    <td className="px-2 py-1.5" colSpan={4}>Total units</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{drillRows.reduce((s, l) => s + l.quantity, 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">₱{drillRows.filter(l => !l.isFreeSample).reduce((s, l) => s + l.lineTotal, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
