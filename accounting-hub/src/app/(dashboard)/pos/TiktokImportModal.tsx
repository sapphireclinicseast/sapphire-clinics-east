'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Upload, CheckCircle2 } from 'lucide-react'

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const BRANCH = 'VERDANA_STORE'

interface Coa { id: string; accountNumber: string; accountTitle: string; accountType: string }
interface Mode { id: string; name: string; paymentMethod: string | null; account: { id: string; accountNumber: string; accountTitle: string } | null }
interface Item { id: string; sku: string; name: string; sellingPrice?: number | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const numAt = (r: any, k: string) => { const v = parseFloat(String(r[k] ?? '').replace(/[^0-9.-]/g, '')); return isNaN(v) ? 0 : v }
const toYmd = (v: unknown) => { const d = new Date(String(v)); return isNaN(+d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function TiktokImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [coa, setCoa] = useState<Coa[]>([])
  const [modes, setModes] = useState<Mode[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [modeId, setModeId] = useState('')
  const [feesAcct, setFeesAcct] = useState('')
  const [cwtAcct, setCwtAcct] = useState('')
  const [bankAcct, setBankAcct] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(d => setCoa(d.data || [])).catch(() => {})
    fetch('/api/pos/payment-modes').then(r => r.ok ? r.json() : []).then(d => setModes(Array.isArray(d) ? d.filter((m: Mode) => m.paymentMethod === 'TIKTOK') : [])).catch(() => {})
    fetch('/api/inventory?all=true').then(r => r.ok ? r.json() : []).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const skuMap = useMemo(() => { const m = new Map<string, Item>(); items.forEach(i => m.set(i.sku.trim().toUpperCase(), i)); return m }, [items])
  const banks = coa.filter(c => c.accountType === 'ASSET')
  const say = (s: string) => setLog(l => [...l, s])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readSheet = async (file: File, sheetIndex = 0): Promise<any[]> => {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[sheetIndex]] || wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { defval: '' })
  }

  async function importOrders(file: File) {
    if (!modeId) { alert('Choose the TikTok payment mode first.'); return }
    setBusy(true); setLog([])
    try {
      const rows = await readSheet(file)
      // Skip TikTok's description row (Order ID cell reads "Platform unique order ID.")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = rows.filter((r: any) => r['Order ID'] && !String(r['Order ID']).startsWith('Platform') && String(r['Order Status']).toLowerCase() === 'completed')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byOrder = new Map<string, any[]>()
      for (const r of data) { const id = String(r['Order ID']).trim(); if (!byOrder.has(id)) byOrder.set(id, []); byOrder.get(id)!.push(r) }
      const allIds = [...byOrder.keys()]
      say(`Found ${allIds.length} completed order(s).`)
      // Dedupe against already-imported Tiktok orders + find legacy (e.g. CASH-
      // tagged) orders under the same reference to replace.
      let existing = new Set<string>()
      let legacy: { id: string; referenceNumber: string; netAmount: number }[] = []
      try { const ex = await fetch(`/api/pos/tiktok/existing?ids=${encodeURIComponent(allIds.join(','))}`); const ed = await ex.json(); existing = new Set(ed.existing || []); legacy = ed.legacy || [] } catch { /* ignore */ }
      let ok = 0, dup = 0, skipped = 0, replaced = 0
      const unmatched = new Set<string>()
      for (const id of allIds) {
        if (existing.has(id)) { dup++; continue }
        const rs = byOrder.get(id)!
        let anyReturn = false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const its = rs.map((r: any) => {
          const sku = String(r['Seller SKU'] || '').trim().toUpperCase()
          const item = skuMap.get(sku)
          if (!item) unmatched.add(sku || '(blank)')
          const qty = Math.max(0, Math.round(numAt(r, 'Quantity')))
          const ret = Math.max(0, Math.round(numAt(r, 'Sku Quantity of return')))
          const sold = qty - ret
          if (ret > 0) anyReturn = true
          if (sold <= 0) return { skip: true }   // fully returned → not sold, stays in stock
          const frac = qty > 0 ? sold / qty : 1
          return item ? { inventoryItemId: item.id, name: item.name, quantity: sold, unitPrice: numAt(r, 'SKU Unit Original Price'), lineTotal: numAt(r, 'SKU Subtotal After Discount') * frac, _before: numAt(r, 'SKU Subtotal Before Discount') * frac } : null
        })
        if (its.some(x => x === null)) { skipped++; continue }       // unmatched SKU
        const lines = its.filter((x): x is { inventoryItemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; _before: number } => !!x && !('skip' in x))
        if (lines.length === 0) { skipped++; continue }              // whole order fully returned
        const subtotal = lines.reduce((s, l) => s + l._before, 0)
        const net = lines.reduce((s, l) => s + l.lineTotal, 0)
        // Replace a matching legacy (non-Tiktok) order first — voids it (reverses inventory).
        const match = legacy.find(l => l.referenceNumber === id && Math.abs(l.netAmount - net) < 0.5)
        if (match) {
          try { const v = await fetch(`/api/pos/orders/${match.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void' }) }); if (v.ok) replaced++ } catch { /* ignore */ }
        }
        const txnDate = toYmd(rs[0]['Paid Time'] || rs[0]['Created Time']) || new Date().toISOString().slice(0, 10)
        const body = {
          orderType: 'PRODUCT', branch: BRANCH, platform: 'Tiktok', transactionDate: txnDate,
          subtotal, discountType: subtotal > net ? 'FIXED' : 'NONE', discountAmount: Math.max(0, subtotal - net), discountLabel: subtotal > net ? 'TikTok seller discount' : null,
          netAmount: net, referenceNumber: id, notes: anyReturn ? 'Includes returned item(s) — net of returns' : null,
          items: lines.map(l => ({ inventoryItemId: l.inventoryItemId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
          payments: [{ method: 'TIKTOK', amount: net, paymentModeId: modeId, reference: id }],
        }
        try {
          const res = await fetch('/api/pos/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          if (res.ok) ok++; else { skipped++; say(`Order ${id}: ${(await res.json()).error || 'failed'}`) }
        } catch { skipped++ }
      }
      say(`Imported ${ok} order(s). Replaced ${replaced} legacy (e.g. CASH) order(s) — their stock was restored, then re-deducted correctly. Skipped ${dup} already-imported, ${skipped} unmatched/empty.`)
      if (unmatched.size) say(`Unmatched Seller SKUs (add them to Inventory, then re-upload): ${[...unmatched].join(', ')}`)
      onDone()
    } finally { setBusy(false) }
  }

  async function importSettlement(file: File) {
    if (!feesAcct || !bankAcct || !modeId) { alert('Choose TikTok payment mode, Marketplace Fees account, and Bank account first.'); return }
    const clearing = modes.find(m => m.id === modeId)?.account?.id
    if (!clearing) { alert('The selected TikTok payment mode has no linked account (clearing). Set its account in POS payment settings.'); return }
    setBusy(true); setLog([])
    try {
      const rows = await readSheet(file, 0) // "Order details" is the first sheet
      const hdrs = rows.length ? Object.keys(rows[0]) : []
      const cwtKey = hdrs.find(h => /withhold|cwt/i.test(h)) || ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = rows.filter((r: any) => String(r['Transaction type'] || 'Order').toLowerCase() === 'order' && r['Order/Adjustment ID']).map((r: any) => ({
        orderId: String(r['Order/Adjustment ID']).trim(),
        settlement: numAt(r, 'Total settlement amount'),
        totalFees: Math.abs(numAt(r, 'Total Fees')),
        cwt: cwtKey ? Math.abs(numAt(r, cwtKey)) : 0,
        settledDate: toYmd(r['Order settled time']),
      })).filter((r: { settlement: number }) => r.settlement !== 0 || true)
      say(`Found ${payload.length} settlement row(s)${cwtKey ? ` (CWT column: ${cwtKey})` : ' (no CWT column — recording 0)'}.`)
      const res = await fetch('/api/pos/tiktok/settlement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload, feesAccountId: feesAcct, cwtAccountId: cwtAcct || null, bankAccountId: bankAcct, clearingAccountId: clearing, branch: BRANCH }),
      })
      const d = await res.json()
      if (!res.ok) { say(`Error: ${d.error || 'failed'}`); return }
      say(`Booked ${d.created} settlement(s), skipped ${d.skipped} already-recorded.`)
      if (d.errors?.length) d.errors.forEach((e: string) => say(e))
      onDone()
    } finally { setBusy(false) }
  }

  const AcctSelect = ({ value, onChange, list, placeholder }: { value: string; onChange: (v: string) => void; list: Coa[]; placeholder: string }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
      <option value="">{placeholder}</option>
      {list.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
    </select>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Bulk Upload — TikTok Shop (Verdana)</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          Step 1: upload the <strong>Completed Orders</strong> export to record sales (matched by Seller SKU, platform = Tiktok — reduces stock, books revenue/COGS). Step 2 (a few days later): upload the <strong>Settlement / income</strong> export to book fees, CWT, and the net bank deposit. Both steps are safe to re-run — duplicates are skipped.
        </p>

        {/* Account mapping */}
        <div className="rounded-xl border p-3 mb-4 space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Account mapping</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>TikTok payment mode (clearing)</label>
              <select value={modeId} onChange={e => setModeId(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">Select mode…</option>
                {modes.map(m => <option key={m.id} value={m.id}>{m.name}{m.account ? ` → ${m.account.accountNumber}` : ' (no account!)'}</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>Marketplace Fees (expense)</label><AcctSelect value={feesAcct} onChange={setFeesAcct} list={coa.filter(c => c.accountType === 'EXPENSE')} placeholder="Select account…" /></div>
            <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>Creditable Withholding Tax (asset, optional)</label><AcctSelect value={cwtAcct} onChange={setCwtAcct} list={banks} placeholder="Select account…" /></div>
            <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>Settlement bank account</label><AcctSelect value={bankAcct} onChange={setBankAcct} list={banks} placeholder="Select account…" /></div>
          </div>
          {modes.length === 0 && <p className="text-[11px]" style={{ color: '#b91c1c' }}>No TikTok payment mode found. Create one in POS payment settings (method = TIKTOK, linked to a &quot;TikTok Clearing&quot; asset account, no % deductions).</p>}
        </div>

        {/* Uploads */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer" style={{ borderColor: 'var(--teal)' }}>
            <Upload size={18} className="mx-auto mb-1" style={{ color: 'var(--teal)' }} />
            <span className="block text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>1. Completed Orders</span>
            <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>Records sales</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importOrders(f) }} />
          </label>
          <label className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer" style={{ borderColor: 'var(--deep-teal)' }}>
            <Upload size={18} className="mx-auto mb-1" style={{ color: 'var(--deep-teal)' }} />
            <span className="block text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>2. Settlement / Income</span>
            <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>Books fees, CWT, bank deposit</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importSettlement(f) }} />
          </label>
        </div>

        {busy && <p className="text-sm mb-2" style={{ color: 'var(--teal)' }}><Loader2 size={14} className="inline animate-spin" /> Processing…</p>}
        {log.length > 0 && (
          <div className="rounded-xl border p-3 text-xs space-y-1 max-h-52 overflow-auto" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            {log.map((l, i) => <div key={i} className="flex items-start gap-1"><CheckCircle2 size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--teal)' }} />{l}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}
