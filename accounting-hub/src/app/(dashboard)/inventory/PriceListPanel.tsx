'use client'

/**
 * Price List — three prices per product we sell, from its current COGS.
 *
 *   Lowest   COGS + 2× COGS (COGS × 3)
 *   Standard COGS + 6× COGS (COGS × 7) — what POS charges
 *   Highest  COGS + 8× COGS (COGS × 9)
 *
 * each rounded UP to the next ₱10 (Hannah, 2026-11-13). The tiers are always
 * computed live; "Apply Standard to POS" writes Standard into the selling price
 * (server recomputes it, branch copies and variant prices follow, audited).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowUpDown, BadgeCheck, CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, Search, Tags } from 'lucide-react'
import { branchShort } from '@/lib/branch'
import { PRICE_TIERS, type Tiers } from '@/lib/price-tiers'
import { SKU_HIERARCHY } from '@/lib/sku-taxonomy'
import { downloadXlsx, downloadPdf } from '@/lib/export'
import DownloadMenu from '@/components/ui/DownloadMenu'
import { StatCard, HrNoticeModal, hrBtn, hrNoticeBtn } from '@/components/ui/hr-look'

interface VariantRow {
  id: string; label: string; sku: string; ownCost: boolean
  cogs: number | null; currentPrice: number | null; tiers: Tiers | null
}
interface Row {
  id: string; sku: string; name: string; branch: string; department: string; isBundle: boolean
  cogs: number | null; cogsSource: 'unitCost' | 'bundle'; currentPrice: number | null; tiers: Tiers | null
  unitsSold: number; lastSold: string | null; sold: boolean; copies: number; variants: VariantRow[]
}
interface Change { kind: 'item' | 'copy' | 'variant'; id: string; sku: string; cogs: number | null; oldPrice: number | null; newPrice: number }

type View = 'priced' | 'changes' | 'nocogs' | 'notsold'
type SortKey = 'name' | 'sku' | 'cogs' | 'lowest' | 'standard' | 'highest' | 'current' | 'sold'

const peso = (n: number | null | undefined, dp = 0) =>
  n == null ? '—' : `₱${n.toLocaleString('en-PH', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const amt = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2))

/** A variant line is worth its own row when its cost or price differs from the product's. */
const ownVariants = (r: Row) => r.variants.filter(v => v.ownCost || v.currentPrice != null)
/** Product (or a priced variant) charges something other than Standard. */
const isChanged = (r: Row) =>
  !!r.tiers && (r.currentPrice !== r.tiers.standard || ownVariants(r).some(v => v.tiers && v.currentPrice !== v.tiers.standard))

export default function PriceListPanel({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')
  const [view, setView] = useState<View>('priced')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ ids: string[] | null; changes: Change[] } | null>(null)
  const [applying, setApplying] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/inventory/price-list')
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Could not load the price list')
      setRows(d.rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the price list')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const sold = useMemo(() => rows.filter(r => r.sold), [rows])
  const counts = useMemo(() => ({
    priced: sold.filter(r => r.tiers).length,
    nocogs: sold.filter(r => !r.tiers).length,
    changes: sold.filter(isChanged).length,
    notsold: rows.length - sold.length,
  }), [rows, sold])

  const deptKeys = useMemo(() => Array.from(new Set(rows.map(r => r.department))).sort(), [rows])

  const shown = useMemo(() => {
    const base = view === 'notsold' ? rows.filter(r => !r.sold)
      : view === 'nocogs' ? sold.filter(r => !r.tiers)
      : view === 'changes' ? sold.filter(isChanged)
      : sold.filter(r => r.tiers)
    const q = search.trim().toLowerCase()
    const list = base.filter(r =>
      (!dept || r.department === dept) &&
      (!q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.variants.some(v => v.sku.toLowerCase().includes(q))))
    const val = (r: Row): string | number => {
      switch (sort.key) {
        case 'name': return r.name
        case 'sku': return r.sku
        case 'cogs': return r.cogs ?? -1
        case 'lowest': return r.tiers?.lowest ?? -1
        case 'standard': return r.tiers?.standard ?? -1
        case 'highest': return r.tiers?.highest ?? -1
        case 'current': return r.currentPrice ?? -1
        case 'sold': return r.unitsSold
      }
    }
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.dir === 'asc' ? c : -c
    })
  }, [rows, sold, view, search, dept, sort])

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'sku' ? 'asc' : 'desc' }))

  const selectable = shown.filter(r => r.tiers && isChanged(r))
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.id))

  // Ask the server what would change (it recomputes from live COGS), then confirm.
  const startApply = async (ids: string[] | null) => {
    setError(''); setNotice('')
    try {
      const res = await fetch('/api/inventory/price-list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids ?? undefined, dryRun: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Could not check the prices')
      if (!d.changes?.length) { setNotice('Every selected product already charges its Standard price.'); return }
      setConfirm({ ids, changes: d.changes })
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check the prices') }
  }

  const apply = async () => {
    if (!confirm) return
    setApplying(true)
    try {
      const res = await fetch('/api/inventory/price-list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: confirm.ids ?? undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Could not update the prices')
      setNotice(`POS price set to Standard on ${d.updated} row${d.updated === 1 ? '' : 's'} (products, branch copies and variants). Old prices are kept in the audit log.`)
      setConfirm(null); setSelected(new Set())
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the prices') }
    finally { setApplying(false) }
  }

  const handleDownload = (format: 'xlsx' | 'pdf') => {
    const priced = sold.filter(r => r.tiers).sort((a, b) => a.name.localeCompare(b.name))
    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'xlsx') {
      const lines: (string | number | null)[][] = []
      for (const r of priced) {
        lines.push([r.sku, r.name, branchShort(r.branch), SKU_HIERARCHY[r.department]?.label || r.department,
          amt(r.cogs), amt(r.tiers!.lowest), amt(r.tiers!.standard), amt(r.tiers!.highest), amt(r.currentPrice), r.unitsSold])
        for (const v of ownVariants(r)) {
          lines.push([v.sku, `${r.name} — ${v.label}`, branchShort(r.branch), SKU_HIERARCHY[r.department]?.label || r.department,
            amt(v.cogs), amt(v.tiers?.lowest), amt(v.tiers?.standard), amt(v.tiers?.highest), amt(v.currentPrice ?? r.currentPrice), ''])
        }
      }
      const missing = sold.filter(r => !r.tiers).sort((a, b) => a.name.localeCompare(b.name))
        .map(r => [r.sku, r.name, branchShort(r.branch), SKU_HIERARCHY[r.department]?.label || r.department, amt(r.currentPrice), r.unitsSold])
      downloadXlsx(`Price-List-${stamp}`, [
        { name: 'Price List', headers: ['SKU', 'Product', 'Branch', 'Department', 'COGS', 'Lowest (COGS×3)', 'Standard (COGS×7)', 'Highest (COGS×9)', 'POS Price Now', 'Units Sold'], rows: lines },
        { name: 'Missing COGS', headers: ['SKU', 'Product', 'Branch', 'Department', 'POS Price Now', 'Units Sold'], rows: missing },
      ])
    } else {
      const lines: (string | number | null)[][] = []
      for (const r of priced) {
        lines.push([r.sku, r.name, peso(r.tiers!.lowest), peso(r.tiers!.standard), peso(r.tiers!.highest)])
        for (const v of ownVariants(r)) lines.push([v.sku, `${r.name} — ${v.label}`, peso(v.tiers?.lowest), peso(v.tiers?.standard), peso(v.tiers?.highest)])
      }
      downloadPdf({
        title: 'Product Price List',
        subtitle: 'Lowest = COGS + 2× · Standard = COGS + 6× (POS price) · Highest = COGS + 8× — rounded up to the next ₱10',
        headers: ['SKU', 'Product', 'Lowest Price', 'Standard Price', 'Highest Price'],
        rows: lines,
        columnWidths: ['130px', 'auto', '90px', '90px', '90px'],
      })
    }
  }

  const th = (key: SortKey, label: string, right = true) => (
    <th onClick={() => toggleSort(key)}
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.5px] border-b cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      style={{ color: sort.key === key ? 'var(--teal)' : 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label}
        {sort.key === key ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ArrowUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  )

  const viewLabel: Record<View, string> = {
    priced: 'products priced from COGS',
    changes: 'products whose POS price is not the Standard price',
    nocogs: 'sold products with no COGS — set a unit cost to price them',
    notsold: 'products we don’t sell (no selling price and no sales) — internal use',
  }

  return (
    <div>
      {/* Cards (quick filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Products priced" value={loading ? '…' : counts.priced.toLocaleString()} sub="Sold products with a COGS"
          accent={{ line: 'var(--teal)' }} active={view === 'priced'} activeSub="Showing these below"
          onClick={() => setView('priced')} loading={loading} />
        <StatCard label="POS price ≠ Standard" value={counts.changes.toLocaleString()} sub="Charging something other than COGS × 7"
          tone={counts.changes ? 'amber' : 'zero'} active={view === 'changes'} activeSub="Showing these below"
          onClick={() => setView(v => (v === 'changes' ? 'priced' : 'changes'))} loading={loading} />
        <StatCard label="Missing COGS" value={counts.nocogs.toLocaleString()} sub="Sold, but no unit cost to price from"
          tone={counts.nocogs ? 'red' : 'zero'} active={view === 'nocogs'} activeSub="Showing these below"
          onClick={() => setView(v => (v === 'nocogs' ? 'priced' : 'nocogs'))} loading={loading} />
        <StatCard label="Not sold" value={counts.notsold.toLocaleString()} sub="No selling price, no sales — skipped"
          tone="zero" active={view === 'notsold'} activeSub="Showing these below"
          onClick={() => setView(v => (v === 'notsold' ? 'priced' : 'notsold'))} loading={loading} />
      </div>

      {/* Rule strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 px-3 py-2 rounded-lg border text-[12px]"
        style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--charcoal)' }}><Tags size={14} style={{ color: 'var(--teal)' }} /> Price rule</span>
        {PRICE_TIERS.map(t => (
          <span key={t.key}><b style={{ color: t.key === 'standard' ? 'var(--teal)' : 'var(--charcoal)' }}>{t.label}</b> = {t.rule}{t.key === 'standard' ? ' (POS price)' : ''}</span>
        ))}
        <span>Rounded up to the next ₱10 · COGS = current average landed unit cost</span>
      </div>

      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-lg border text-[13px] flex items-start gap-2" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 px-4 py-2.5 rounded-lg border text-[13px] flex items-start gap-2" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {notice}
        </div>
      )}

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or SKU…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border text-[13px] outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="h-9 px-3 rounded-lg border text-[13px] outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All departments</option>
            {deptKeys.map(d => <option key={d} value={d}>{SKU_HIERARCHY[d]?.label || d}</option>)}
          </select>
          <p className="text-[12px] lg:ml-1 flex-1" style={{ color: 'var(--mid-gray)' }}>
            {loading ? 'Loading…' : <>{shown.length.toLocaleString()} {viewLabel[view]}</>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={load} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)' }} title="Recompute from the latest COGS">
              <RefreshCw size={13} /> Refresh
            </button>
            <DownloadMenu onDownload={handleDownload} label="Price list" />
            {canWrite && selected.size > 0 && (
              <button onClick={() => startApply(Array.from(selected))} className={hrBtn.outline} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                <BadgeCheck size={14} /> Apply Standard to {selected.size} selected
              </button>
            )}
            {canWrite && counts.changes > 0 && (
              <button onClick={() => startApply(null)} className={hrBtn.primary} style={{ background: 'var(--teal)' }}
                title="Set every sold product's POS selling price to its Standard price">
                <BadgeCheck size={14} /> Apply Standard to all ({counts.changes})
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: 'var(--hr-head)' }}>
                {canWrite && (
                  <th className="px-3 py-2.5 w-9 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                    <input type="checkbox" className="w-4 h-4 accent-teal-600" disabled={!selectable.length} checked={allSelected}
                      title="Select every product shown whose POS price is not Standard"
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(r => r.id)))} />
                  </th>
                )}
                {th('name', 'Product', false)}
                {th('cogs', 'COGS')}
                {th('lowest', 'Lowest')}
                {th('standard', 'Standard')}
                {th('highest', 'Highest')}
                {th('current', 'POS price now')}
                {th('sold', 'Units sold')}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={canWrite ? 8 : 7} className="px-3 py-2"><div className="h-6 rounded hr-shimmer" /></td></tr>
              ))}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={canWrite ? 8 : 7} className="px-4 py-10 text-center text-[13px]" style={{ color: 'var(--mid-gray)' }}>Nothing to show here.</td></tr>
              )}
              {!loading && shown.map(r => {
                const changed = isChanged(r)
                const diff = r.tiers && r.currentPrice != null ? r.currentPrice - r.tiers.standard : null
                const edge = !r.tiers ? (r.sold ? '#dc2626' : 'transparent') : changed ? '#d97706' : '#059669'
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)', boxShadow: `inset 3px 0 0 ${edge}` }}>
                      {canWrite && (
                        <td className="px-3 py-2">
                          {r.tiers && changed && (
                            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selected.has(r.id)}
                              onChange={() => setSelected(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 min-w-[240px]">
                        <p className="font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>{r.name}</p>
                        <p className="text-[11px] flex flex-wrap items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                          <span className="tabular-nums">{r.sku}</span>
                          <span>· {branchShort(r.branch)}</span>
                          {r.isBundle && <span className="px-1.5 rounded-full text-[10px] font-semibold" style={{ background: '#eff6ff', color: '#1d4ed8' }}>Bundle{r.cogsSource === 'bundle' ? ' · COGS from parts' : ''}</span>}
                          {r.copies > 0 && <span title="Branch consignment copies follow this price">· {r.copies} branch cop{r.copies === 1 ? 'y' : 'ies'}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{!r.cogs ? <span style={{ color: '#b91c1c' }}>No COGS</span> : peso(r.cogs, 2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{peso(r.tiers?.lowest)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold" style={{ color: 'var(--teal)' }}>{peso(r.tiers?.standard)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{peso(r.tiers?.highest)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        <span style={{ color: changed && r.tiers ? '#b45309' : 'var(--charcoal)' }}>{peso(r.currentPrice, r.currentPrice != null && r.currentPrice % 1 ? 2 : 0)}</span>
                        {diff != null && diff !== 0 && (
                          <span className="block text-[11px]" style={{ color: diff < 0 ? '#b91c1c' : '#b45309' }}>
                            {diff > 0 ? '+' : '−'}{peso(Math.abs(diff), Math.abs(diff) % 1 ? 2 : 0)} vs Standard
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--mid-gray)' }}>{r.unitsSold ? r.unitsSold.toLocaleString() : '—'}</td>
                    </tr>
                    {ownVariants(r).map(v => (
                      <tr key={v.id} className="border-b" style={{ borderColor: 'var(--hr-line)', background: '#fcfdfa' }}>
                        {canWrite && <td />}
                        <td className="pl-8 pr-3 py-1.5 text-[12px]" style={{ color: 'var(--mid-gray)' }}>
                          ↳ {v.label} <span className="tabular-nums">· {v.sku}</span>{v.ownCost ? ' · own cost' : ''}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[12px]" style={{ color: 'var(--mid-gray)' }}>{peso(v.cogs, 2)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{peso(v.tiers?.lowest)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[12px] font-bold" style={{ color: 'var(--teal)' }}>{peso(v.tiers?.standard)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{peso(v.tiers?.highest)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{peso(v.currentPrice ?? r.currentPrice)}</td>
                        <td />
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirm && (
        <HrNoticeModal icon={<BadgeCheck size={18} />} tone="green" title="Set POS price to Standard?"
          subtitle={`${confirm.changes.length} price${confirm.changes.length === 1 ? '' : 's'} will change (products, branch copies and variants). Old prices are kept in the audit log.`}
          onClose={() => !applying && setConfirm(null)}
          footer={<>
            <button onClick={apply} disabled={applying} className={hrNoticeBtn.primary} style={{ background: 'var(--teal)' }}>
              {applying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Apply {confirm.changes.length}
            </button>
            <button onClick={() => setConfirm(null)} disabled={applying} className={hrNoticeBtn.ghost} style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
          </>}>
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hr-line)' }}>
            <table className="w-full text-[12px]">
              <thead><tr style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)' }}>
                <th className="text-left px-2.5 py-1.5 font-semibold">SKU</th>
                <th className="text-right px-2.5 py-1.5 font-semibold">Now</th>
                <th className="text-right px-2.5 py-1.5 font-semibold">Standard</th>
              </tr></thead>
              <tbody>
                {confirm.changes.slice(0, 200).map(c => (
                  <tr key={c.kind + c.id} className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                    <td className="px-2.5 py-1 tabular-nums">{c.sku}{c.kind !== 'item' ? <span style={{ color: 'var(--mid-gray)' }}> · {c.kind === 'copy' ? 'branch copy' : 'variant'}</span> : null}</td>
                    <td className="px-2.5 py-1 text-right tabular-nums" style={{ color: 'var(--mid-gray)' }}>{peso(c.oldPrice, c.oldPrice != null && c.oldPrice % 1 ? 2 : 0)}</td>
                    <td className="px-2.5 py-1 text-right tabular-nums font-semibold" style={{ color: 'var(--teal)' }}>{peso(c.newPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {confirm.changes.length > 200 && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>…and {confirm.changes.length - 200} more.</p>}
        </HrNoticeModal>
      )}
    </div>
  )
}
