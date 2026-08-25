'use client'

/**
 * Branch Stock — where consigned inventory physically sits, live.
 *
 * IN = consignments RECEIVED at the branch. OUT = returns plus POS sales
 * attributed by CASHIER: product sales are store orders on paper, but a sale
 * rung by a clinic front-desk account happened at that clinic, out of its
 * consigned stock (policy: user, 2026-08-11). remaining = in − out.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

const BRANCHES = [
  ['SANDBOX_EAST', 'AHEA'],
  ['SANDBOX_GREENHILLS', 'AHGH'],
  ['VERDANA_STORE', 'VER Store'],
] as const

interface Cell { received: number; inTransit: number; returned: number; sold: number; onHand: number | null }
interface Row { itemId: string; name: string; sku: string; totalStock: number; branches: Record<string, Cell> }

export default function BranchStockPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/inventory/branch-stock')
      .then(r => r.json())
      .then(d => setRows(d.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const ql = q.trim().toLowerCase()
  const visible = ql ? rows.filter(r => r.name.toLowerCase().includes(ql) || r.sku.toLowerCase().includes(ql)) : rows
  const tot = (b: string, k: keyof Cell) => visible.reduce((s, r) => s + (r.branches[b]?.[k] || 0), 0)

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Branch Stock</h2>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item or SKU…"
          className="px-3 py-1.5 rounded-lg border text-xs w-64" style={{ borderColor: 'var(--light-gray)' }} />
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
        Each branch holds its consigned stock as its own live counter: consignments received add to it, sales rung by
        that branch&apos;s front desk deduct from it. <strong>Left</strong> is that live counter. In = consignments
        received to date (in-transit shown in parentheses — on the way, not yet stock).
      </p>
      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Item</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>SKU</th>
                <th className="px-2 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Total stock</th>
                {BRANCHES.map(([b, label]) => (
                  <th key={b} colSpan={3} className="px-2 py-2 text-center font-semibold border-l" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>{label}</th>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--light-gray)' }}>
                <th colSpan={3}></th>
                {BRANCHES.map(([b]) => (
                  <>
                    <th key={`${b}-i`} className="px-2 py-1 text-right font-medium border-l" style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>In</th>
                    <th key={`${b}-s`} className="px-2 py-1 text-right font-medium" style={{ color: 'var(--mid-gray)' }}>Sold</th>
                    <th key={`${b}-r`} className="px-2 py-1 text-right font-medium" style={{ color: 'var(--mid-gray)' }}>Left</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.itemId} className="hover:bg-gray-50" style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)', maxWidth: 260 }} title={r.name}>{r.name.slice(0, 48)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{r.sku}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.totalStock}</td>
                  {BRANCHES.map(([b]) => {
                    const c = r.branches[b]
                    const rem = c ? (c.onHand ?? c.received - c.returned - c.sold) : 0
                    return (
                      <>
                        <td key={`${r.itemId}-${b}-i`} className="px-2 py-1.5 text-right tabular-nums border-l" style={{ borderColor: '#f3f4f6' }}>
                          {c?.received || (c?.inTransit ? '' : '—')}{c?.inTransit ? <span style={{ color: 'var(--mid-gray)' }}> ({c.inTransit})</span> : ''}
                          {c?.returned ? <span style={{ color: 'var(--mid-gray)' }} title="returned"> −{c.returned}</span> : ''}
                        </td>
                        <td key={`${r.itemId}-${b}-s`} className="px-2 py-1.5 text-right tabular-nums">{c?.sold || '—'}</td>
                        <td key={`${r.itemId}-${b}-l`} className="px-2 py-1.5 text-right tabular-nums font-semibold"
                          style={{ color: rem < 0 ? '#b91c1c' : rem > 0 ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                          {c ? rem : '—'}
                        </td>
                      </>
                    )
                  })}
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={12} className="px-3 py-6 text-center" style={{ color: 'var(--mid-gray)' }}>No consignment or branch sale activity yet.</td></tr>}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--light-gray)', fontWeight: 600 }}>
                <td className="px-3 py-2" colSpan={3}>Totals</td>
                {BRANCHES.map(([b]) => (
                  <>
                    <td key={`t-${b}-i`} className="px-2 py-2 text-right tabular-nums border-l" style={{ borderColor: '#f3f4f6' }}>{tot(b, 'received')}</td>
                    <td key={`t-${b}-s`} className="px-2 py-2 text-right tabular-nums">{tot(b, 'sold')}</td>
                    <td key={`t-${b}-l`} className="px-2 py-2 text-right tabular-nums">{visible.reduce((s, r) => { const c = r.branches[b]; return s + (c ? (c.onHand ?? c.received - c.returned - c.sold) : 0) }, 0)}</td>
                  </>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
