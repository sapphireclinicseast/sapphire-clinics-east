'use client'

// Asset Calculator — the Freight Purchase modal, for assets.
//
// Assets bought abroad arrive on the same shipment as inventory and carry the
// same costs: a foreign price, and freight that belongs to the shipment rather
// than to any one item. This lands both onto each asset the same way inventory
// does — goods at the exchange rate, freight split by the volume each occupies
// (CBM) — so the purchase price it saves is the true landed cost, which is what
// depreciation should be computed from.
import { useMemo, useState } from 'react'
import { X, Plus, Loader2, Calculator } from 'lucide-react'

interface Row {
  name: string; classification: string; yearsDepreciation: string
  price: string; priceIsForeign: boolean; quantity: string
  dimL: string; dimW: string; dimH: string
}
const emptyRow = (): Row => ({ name: '', classification: '2040', yearsDepreciation: '5', price: '', priceIsForeign: true, quantity: '', dimL: '', dimW: '', dimH: '' })
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CLASSES = ['2020', '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100']

export default function AssetCalculator({ branch, onClose, onSaved }: { branch: string; onClose: () => void; onSaved: () => void }) {
  const [dateBought, setDateBought] = useState(new Date().toISOString().slice(0, 10))
  const [remarks, setRemarks] = useState('')
  const [hasForeign, setHasForeign] = useState(true)
  const [currency, setCurrency] = useState('CNY')
  const [exRate, setExRate] = useState('')
  const [f1, setF1] = useState(''); const [f1F, setF1F] = useState(false)
  const [f2, setF2] = useState(''); const [f2F, setF2F] = useState(false)
  const [f3, setF3] = useState(''); const [f3F, setF3F] = useState(false)
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const rate = hasForeign && exRate ? parseFloat(exRate) || 0 : 1
  const totalFreight = useMemo(() => {
    const c = (v: string, foreign: boolean) => (parseFloat(v) || 0) * (foreign && hasForeign ? rate : 1)
    return c(f1, f1F) + c(f2, f2F) + c(f3, f3F)
  }, [f1, f1F, f2, f2F, f3, f3F, hasForeign, rate])

  // Per-row landed cost, mirroring the server's allocation exactly.
  const computed = useMemo(() => {
    const withCbm = rows.map(r => {
      const l = parseFloat(r.dimL) || 0, w = parseFloat(r.dimW) || 0, h = parseFloat(r.dimH) || 0
      const qty = parseInt(r.quantity) || 0
      const per = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1_000_000 : 0
      return { per, total: per * qty, qty }
    })
    const grand = withCbm.reduce((s, r) => s + r.total, 0)
    const valid = rows.filter(r => r.name.trim() && parseInt(r.quantity) > 0).length
    return rows.map((r, i) => {
      const { per, total, qty } = withCbm[i]
      const share = grand > 0 ? total / grand : (valid > 0 ? 1 / valid : 0)
      const freightPerUnit = qty > 0 ? (share * totalFreight) / qty : 0
      const price = parseFloat(r.price) || 0
      const goodsPHP = r.priceIsForeign && hasForeign ? price * rate : price
      const landed = goodsPHP + freightPerUnit
      const years = parseInt(r.yearsDepreciation) || 0
      return { cbmPerUnit: per, totalCbm: total, freightPerUnit, landed, monthly: years > 0 ? landed / (years * 12) : 0 }
    })
  }, [rows, totalFreight, hasForeign, rate])

  const grandTotal = computed.reduce((s, c, i) => s + c.landed * (parseInt(rows[i].quantity) || 0), 0)

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/assets/freight-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch, dateBought, hasForeignPurchase: hasForeign, exchangeRate: exRate || undefined,
          freight1Amount: f1 || undefined, freight1IsForeign: f1F,
          freight2Amount: f2 || undefined, freight2IsForeign: f2F,
          freight3Amount: f3 || undefined, freight3IsForeign: f3F,
          remarks: remarks || undefined,
          rows: rows.filter(r => r.name.trim() && parseInt(r.quantity) > 0),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Failed to save'); return }
      alert(`${d.created.length} asset(s) created with landed costs.`)
      onSaved()
    } catch { setErr('Network error') } finally { setBusy(false) }
  }

  const inp = 'w-full px-2 py-1.5 rounded-lg border text-xs outline-none'
  const setRow = (i: number, patch: Partial<Row>) => setRows(prev => prev.map((r, j) => j === i ? { ...r, ...patch } : r))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full mx-4" style={{ maxWidth: '1000px' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              <Calculator size={18} style={{ color: 'var(--teal)' }} /> Asset Calculator — Freight Purchase
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Enter assets, prices and freight; the landed cost per asset is computed proportionally by CBM and becomes its depreciation basis.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg ml-4"><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {err && <div className="p-3 rounded-lg text-sm bg-red-50 text-red-600">{err}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Purchase Date</label>
              <input type="date" value={dateBought} onChange={e => setDateBought(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Remarks</label>
              <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. GH clinic assets, Aug 2025 shipment" className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
          </div>

          {/* Exchange rate */}
          <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Exchange Rate</span>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={!hasForeign} onChange={e => setHasForeign(!e.target.checked)} /> No foreign purchase (all PHP)
              </label>
            </div>
            {hasForeign && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Foreign Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                    {['CNY', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'HKD'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Exchange Rate (PHP per 1 {currency})</label>
                  <input type="number" step="0.0001" min="0" value={exRate} onChange={e => setExRate(e.target.value)} placeholder="e.g. 8.02" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              </div>
            )}
          </div>

          {/* Freight */}
          <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Freight Costs</span>
            {([
              ['Manufacturing → Warehouse', f1, setF1, f1F, setF1F],
              ['Foreign → Local', f2, setF2, f2F, setF2F],
              ['Warehouse → Office', f3, setF3, f3F, setF3F],
            ] as const).map(([label, val, setVal, isF, setF]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs w-44 shrink-0" style={{ color: 'var(--mid-gray)' }}>{label}</span>
                <input type="number" step="0.01" min="0" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
                <button type="button" onClick={() => setF(!isF)} className="px-3 py-2 rounded-lg border text-xs font-medium"
                  style={isF && hasForeign ? { background: '#f0fdfa', borderColor: 'var(--teal)', color: 'var(--teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  {isF && hasForeign ? currency : 'PHP'}
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Total Freight (PHP)</span>
              <span className="text-sm font-bold" style={{ color: 'var(--teal)' }}>₱{peso(totalFreight)}</span>
            </div>
          </div>

          {/* Rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Assets</span>
              <button type="button" onClick={() => setRows(p => [...p, emptyRow()])} className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                <Plus size={12} /> Add Row
              </button>
            </div>
            <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs" style={{ minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    {['Asset', 'Class', 'Yrs', 'Price', 'Qty', 'L', 'W', 'H', 'Freight/unit', 'Landed Cost', 'Monthly Dep.', ''].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap" style={{ color: h === 'Landed Cost' ? 'var(--teal)' : 'var(--charcoal)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-2 py-1.5" style={{ minWidth: 160 }}><input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="Asset name" className={inp} style={{ borderColor: 'var(--light-gray)' }} /></td>
                      <td className="px-2 py-1.5"><select value={r.classification} onChange={e => setRow(i, { classification: e.target.value })} className={inp} style={{ borderColor: 'var(--light-gray)' }}>{CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                      <td className="px-2 py-1.5" style={{ width: 60 }}><input type="number" min={1} value={r.yearsDepreciation} onChange={e => setRow(i, { yearsDepreciation: e.target.value })} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></td>
                      <td className="px-2 py-1.5" style={{ width: 120 }}>
                        <div className="flex gap-1">
                          <input type="number" step="0.01" value={r.price} onChange={e => setRow(i, { price: e.target.value })} placeholder="0.00" className={inp} style={{ borderColor: 'var(--light-gray)' }} />
                          {hasForeign && (
                            <button type="button" onClick={() => setRow(i, { priceIsForeign: !r.priceIsForeign })} className="px-1.5 rounded-lg border text-[10px] font-medium shrink-0"
                              style={r.priceIsForeign ? { background: '#f0fdfa', borderColor: 'var(--teal)', color: 'var(--teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                              {r.priceIsForeign ? currency : 'PHP'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5" style={{ width: 60 }}><input type="number" min={1} value={r.quantity} onChange={e => setRow(i, { quantity: e.target.value })} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></td>
                      {(['dimL', 'dimW', 'dimH'] as const).map(k => (
                        <td key={k} className="px-2 py-1.5" style={{ width: 56 }}><input type="number" value={r[k]} onChange={e => setRow(i, { [k]: e.target.value } as Partial<Row>)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>₱{peso(computed[i].freightPerUnit)}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>₱{peso(computed[i].landed)}</td>
                      <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>₱{peso(computed[i].monthly)}</td>
                      <td className="px-2 py-1.5">{rows.length > 1 && <button onClick={() => setRows(p => p.filter((_, j) => j !== i))} className="text-red-500">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
              Total capitalised: <span className="ml-2" style={{ color: 'var(--teal)' }}>₱{peso(grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--deep-teal)' }}>
            {busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Create Assets'}
          </button>
        </div>
      </div>
    </div>
  )
}
