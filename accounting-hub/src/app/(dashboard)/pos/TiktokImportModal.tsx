'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Upload, CheckCircle2 } from 'lucide-react'

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const BRANCH = 'VERDANA_STORE'
// Sentinel for the unmatched-product resolver: "classify this product as not-imported".
// Its line(s) are dropped; any order left with no lines is skipped entirely.
const SKIP = '__SKIP__'

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
  // Unmatched-product resolution: parsed orders held until the uploader maps every
  // unknown SKU/product to an inventory item.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parsedOrders, setParsedOrders] = useState<[string, any[]][] | null>(null)
  const [unmatched, setUnmatched] = useState<{ key: string; sku: string; name: string }[]>([])
  const [manualMap, setManualMap] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(d => setCoa(d.data || [])).catch(() => {})
    fetch('/api/pos/payment-modes').then(r => r.ok ? r.json() : []).then(d => setModes(Array.isArray(d) ? d.filter((m: Mode) => m.paymentMethod === 'TIKTOK') : [])).catch(() => {})
    fetch('/api/inventory?all=true').then(r => r.ok ? r.json() : []).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const skuMap = useMemo(() => { const m = new Map<string, Item>(); items.forEach(i => m.set(i.sku.trim().toUpperCase(), i)); return m }, [items])
  // Fallback: match by product name when Seller SKU is blank/unknown (unique names only).
  const nameMap = useMemo(() => {
    const counts = new Map<string, number>(); items.forEach(i => { const k = i.name.toUpperCase().replace(/\s+/g, ' ').trim(); counts.set(k, (counts.get(k) || 0) + 1) })
    const m = new Map<string, Item>(); items.forEach(i => { const k = i.name.toUpperCase().replace(/\s+/g, ' ').trim(); if (counts.get(k) === 1) m.set(k, i) }); return m
  }, [items])
  const itemById = useMemo(() => { const m = new Map<string, Item>(); items.forEach(i => m.set(i.id, i)); return m }, [items])
  const banks = coa.filter(c => c.accountType === 'ASSET')
  const say = (s: string) => setLog(l => [...l, s])
  const normS = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowKey = (r: any) => String(r['Seller SKU'] || '').trim().toUpperCase() || `NAME:${normS(String(r['Product Name'] || ''))}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemFor = (r: any, mmap: Record<string, string>): Item | undefined => {
    const mapped = mmap[rowKey(r)]
    if (mapped) return itemById.get(mapped)
    const sku = String(r['Seller SKU'] || '').trim().toUpperCase()
    const pname = normS(String(r['Product Name'] || ''))
    return skuMap.get(sku) || (pname ? nameMap.get(pname) : undefined)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readSheet = async (file: File, sheetIndex = 0): Promise<any[]> => {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[sheetIndex]] || wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { defval: '' })
  }

  // Parse the file, then either open the unmatched-product resolver or import directly.
  async function onOrdersFile(file: File) {
    if (!modeId) { alert('Choose the TikTok payment mode first.'); return }
    setBusy(true); setLog([]); setUnmatched([]); setParsedOrders(null)
    try {
      const rows = await readSheet(file)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = rows.filter((r: any) => r['Order ID'] && !String(r['Order ID']).startsWith('Platform') && String(r['Order Status']).toLowerCase() === 'completed')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byOrder = new Map<string, any[]>()
      for (const r of data) { const id = String(r['Order ID']).trim(); if (!byOrder.has(id)) byOrder.set(id, []); byOrder.get(id)!.push(r) }
      const entries = [...byOrder.entries()]
      // Distinct products with no match (skip fully-returned lines — not sold).
      const seen = new Set<string>()
      const missing: { key: string; sku: string; name: string }[] = []
      for (const [, rs] of entries) for (const r of rs) {
        const qty = Math.max(0, Math.round(numAt(r, 'Quantity'))), ret = Math.max(0, Math.round(numAt(r, 'Sku Quantity of return')))
        if (qty - ret <= 0) continue
        if (!itemFor(r, {})) { const k = rowKey(r); if (!seen.has(k)) { seen.add(k); missing.push({ key: k, sku: String(r['Seller SKU'] || '').trim(), name: String(r['Product Name'] || '') }) } }
      }
      say(`Found ${entries.length} completed order(s).`)
      setParsedOrders(entries)
      if (missing.length > 0) { setUnmatched(missing); setManualMap({}); say(`${missing.length} product(s) are not in Inventory — match each below, then click Confirm & Import.`); return }
      await runOrdersImport(entries, {})
    } finally { setBusy(false) }
  }

  async function runOrdersImport(orders: [string, unknown[]][], mmap: Record<string, string>) {
    if (!modeId) { alert('Choose the TikTok payment mode first.'); return }
    setBusy(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byOrder = new Map<string, any[]>(orders as [string, any[]][])
      const allIds = [...byOrder.keys()]
      // Date window (for the fallback legacy match) from the file's order dates.
      const dates = allIds.map(id => toYmd(byOrder.get(id)![0]['Paid Time'] || byOrder.get(id)![0]['Created Time'])).filter(Boolean).sort()
      const from = dates[0] || '', to = dates[dates.length - 1] || ''
      // Dedupe against already-imported Tiktok orders + find legacy (e.g. CASH-
      // tagged) orders to replace — by reference OR (net + items + date ±3 days).
      let existing = new Set<string>()
      let legacy: { id: string; referenceNumber: string | null; netAmount: number; ymd: string; itemIds: string[]; itemNames: string[] }[] = []
      try { const ex = await fetch(`/api/pos/tiktok/existing?ids=${encodeURIComponent(allIds.join(','))}&from=${from}&to=${to}`); const ed = await ex.json(); existing = new Set(ed.existing || []); legacy = ed.legacyCandidates || [] } catch { /* ignore */ }
      const usedLegacy = new Set<string>()
      const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
      const sameSet = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((v, i) => v === b[i])
      const withinDays = (a: string, b: string, n: number) => !!a && !!b && Math.abs((+new Date(a) - +new Date(b)) / 86400000) <= n
      let ok = 0, dup = 0, skipped = 0, replaced = 0
      for (const id of allIds) {
        if (existing.has(id)) { dup++; continue }
        const rs = byOrder.get(id)!
        let anyReturn = false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const its = rs.map((r: any) => {
          const classifiedSkip = mmap[rowKey(r)] === SKIP   // uploader chose "do not import"
          const item = classifiedSkip ? undefined : itemFor(r, mmap)
          const qty = Math.max(0, Math.round(numAt(r, 'Quantity')))
          const ret = Math.max(0, Math.round(numAt(r, 'Sku Quantity of return')))
          const sold = qty - ret
          if (ret > 0) anyReturn = true
          if (classifiedSkip) return { skip: true }
          if (!item) return null
          const perBefore = qty > 0 ? numAt(r, 'SKU Subtotal Before Discount') / qty : 0
          const perAfter = qty > 0 ? numAt(r, 'SKU Subtotal After Discount') / qty : 0
          // Declared as sale (full gross) + refund deduction. Full qty carries revenue; the
          // returned units are booked as refundAmount (7160). Inventory deducts qty − returned.
          return {
            inventoryItemId: item.id, name: item.name, unitPrice: numAt(r, 'SKU Unit Original Price'),
            quantity: qty,                     // full ordered units
            lineTotal: perBefore * qty,        // full gross-before-discount
            _after: perAfter * qty,            // full after-discount
            returnedQuantity: ret,
            refundAmount: perAfter * ret,      // after-discount refund for returned units
          }
        })
        if (its.some(x => x === null)) { skipped++; continue }       // unmatched SKU
        const lines = its.filter((x): x is { inventoryItemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; _after: number; returnedQuantity: number; refundAmount: number } => !!x && !('skip' in x))
        if (lines.length === 0) { skipped++; continue }              // all products classified as Skip
        const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)      // full gross (before discount)
        const fullAfter = lines.reduce((s, l) => s + l._after, 0)        // full after discount
        const totalRefund = lines.reduce((s, l) => s + l.refundAmount, 0)
        const net = fullAfter - totalRefund                              // actually collected (after discount, less refunds)
        const txnDate = toYmd(rs[0]['Paid Time'] || rs[0]['Created Time']) || new Date().toISOString().slice(0, 10)
        const orderItemIds = [...new Set(lines.map(l => l.inventoryItemId))].sort()
        const orderNames = [...new Set(lines.map(l => norm(l.name)))].sort()
        // Replace a matching legacy (non-Tiktok) order first — voids it (reverses inventory).
        // Rule: reference  OR  (net + date)  OR  (net + product name)  OR  (date + SKU)  OR  (date + product name).
        const match = legacy.find(l => {
          if (usedLegacy.has(l.id)) return false
          const refM = !!l.referenceNumber && l.referenceNumber === id
          const netM = Math.abs(l.netAmount - net) < 0.5
          const dateM = withinDays(l.ymd, txnDate, 3)
          const skuM = sameSet(l.itemIds, orderItemIds)
          const nameM = sameSet(l.itemNames, orderNames)
          return refM || (netM && dateM) || (netM && nameM) || (dateM && skuM) || (dateM && nameM)
        })
        if (match) {
          usedLegacy.add(match.id)
          try { const v = await fetch(`/api/pos/orders/${match.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void' }) }); if (v.ok) replaced++ } catch { /* ignore */ }
        }
        const disc = Math.max(0, +(subtotal - fullAfter).toFixed(2))   // discount on full order (before − after)
        const body = {
          orderType: 'PRODUCT', branch: BRANCH, platform: 'Tiktok', transactionDate: txnDate,
          discountType: disc > 0.005 ? 'CUSTOM' : 'NONE', discountAmount: disc, discountLabel: disc > 0.005 ? 'TikTok seller discount' : null,
          referenceNumber: id, notes: anyReturn ? 'Includes returned/refunded item(s)' : null,
          // handler: subtotal = sum(item.lineTotal) (gross); netAmount = gross − discount − refunds
          items: lines.map(l => ({ inventoryItemId: l.inventoryItemId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal, returnedQuantity: l.returnedQuantity, refundAmount: l.refundAmount })),
          payments: net > 0 ? [{ method: 'TIKTOK', amount: net, paymentModeId: modeId, reference: id }] : [],
        }
        try {
          const res = await fetch('/api/pos/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          if (res.ok) ok++; else { skipped++; say(`Order ${id}: ${(await res.json()).error || 'failed'}`) }
        } catch { skipped++ }
      }
      say(`Imported ${ok} order(s). Replaced ${replaced} legacy (e.g. CASH) order(s) — their stock was restored, then re-deducted correctly. Skipped ${dup} already-imported, ${skipped} empty/fully-returned/skipped.`)
      setParsedOrders(null); setUnmatched([])
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
      const isType = (r: any, t: string) => String(r['Transaction type'] || '').toLowerCase() === t
      // TikTok can split one order across several rows (e.g. a fee-adjustment leg plus
      // the main payout). The server is idempotent per order ID, so unmerged extra rows
      // would be dropped as "already recorded" — sum them per order before sending.
      // Fees stay SIGNED while summing (TikTok charges are negative, refunds positive);
      // totalFees is sent as positive-when-net-charge, negative-when-net-refund.
      const merged = new Map<string, { settlement: number; fees: number; cwt: number; settledDate: string; rowCount: number }>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of rows.filter((r: any) => isType(r, 'order') && r['Order/Adjustment ID'])) {
        const id = String(r['Order/Adjustment ID']).trim()
        const m = merged.get(id) || { settlement: 0, fees: 0, cwt: 0, settledDate: '', rowCount: 0 }
        m.settlement += numAt(r, 'Total settlement amount')
        m.fees += numAt(r, 'Total Fees')
        m.cwt += cwtKey ? Math.abs(numAt(r, cwtKey)) : 0
        m.settledDate = m.settledDate || toYmd(r['Order settled time'])
        m.rowCount++
        merged.set(id, m)
      }
      const payload = [...merged.entries()].map(([orderId, m]) => ({
        orderId,
        settlement: +m.settlement.toFixed(2),
        totalFees: +(-m.fees).toFixed(2),
        cwt: +m.cwt.toFixed(2),
        settledDate: m.settledDate,
      }))
      const splitCount = [...merged.values()].filter(m => m.rowCount > 1).length
      // TikTok posts creditable withholding tax as its own "Withholding tax" adjustment rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cwtPayload = rows.filter((r: any) => isType(r, 'withholding tax') && r['Order/Adjustment ID']).map((r: any) => ({
        adjId: String(r['Order/Adjustment ID']).trim(),
        amount: Math.abs(numAt(r, 'Adjustment amount') || numAt(r, 'Total settlement amount')),
        settledDate: toYmd(r['Order settled time'] || r['Order created time']),
      }))
      say(`Found ${payload.length} order settlement(s) and ${cwtPayload.length} withholding-tax adjustment(s).${splitCount ? ` Merged ${splitCount} split settlement(s) with multiple rows.` : ''}`)
      if (cwtPayload.length && !cwtAcct) { say('⚠ Withholding-tax rows found but no CWT account selected — pick one to record them.'); return }
      const res = await fetch('/api/pos/tiktok/settlement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload, cwtRows: cwtPayload, feesAccountId: feesAcct, cwtAccountId: cwtAcct || null, bankAccountId: bankAcct, clearingAccountId: clearing, branch: BRANCH }),
      })
      const d = await res.json()
      if (!res.ok) { say(`Error: ${d.error || 'failed'}`); return }
      say(`Booked ${d.created} settlement(s) + ${d.cwtBooked || 0} withholding-tax entr(y/ies), skipped ${d.skipped} already-recorded.`)
      if (d.errors?.length) d.errors.forEach((e: string) => say(e))
      onDone()
    } finally { setBusy(false) }
  }

  // Cancelled / Failed Delivery: orders that never became a sale. No GL impact — just
  // logs TikTok's own cancel reason for the Products Analysis "Top Cancellation
  // Reasons" card. sourceFile tells the server which export this is; the server
  // upserts by Order ID, so an order appearing in both files keeps whichever record
  // actually has a reason (Cancelled almost always does, Failed Delivery often doesn't
  // yet — TikTok hasn't auto-cancelled it at export time).
  async function onCancellationsFile(file: File, sourceFile: 'CANCELLED' | 'FAILED_DELIVERY') {
    setBusy(true); setLog([])
    try {
      const rows = await readSheet(file)
      const parsed = rows
        .filter((r: Record<string, unknown>) => r['Order ID'] && !String(r['Order ID']).startsWith('Platform'))
        .map((r: Record<string, unknown>) => ({
          orderId: String(r['Order ID']).trim(),
          status: String(r['Order Status'] || 'Unknown'),
          cancelType: r['Cancelation/Return Type'] ? String(r['Cancelation/Return Type']) : null,
          cancelBy: r['Cancel By'] ? String(r['Cancel By']) : null,
          cancelReason: r['Cancel Reason'] ? String(r['Cancel Reason']) : null,
          orderAmount: numAt(r, 'Order Amount') || null,
          cancelledTime: r['Cancelled Time'] ? new Date(String(r['Cancelled Time'])).toISOString() : null,
        }))
      say(`Found ${parsed.length} row(s) in the ${sourceFile === 'CANCELLED' ? 'Cancelled' : 'Failed Delivery'} export.`)
      const res = await fetch('/api/pos/tiktok/cancellations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: BRANCH, sourceFile, rows: parsed }),
      })
      const d = await res.json()
      if (!res.ok) { say(`Error: ${d.error || 'failed'}`); return }
      say(`Logged ${d.created} new order(s), updated ${d.updated} (reason arrived), skipped ${d.skipped} already up to date.`)
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
          Step 1: upload the <strong>Completed Orders</strong> export to record sales (matched by Seller SKU, platform = Tiktok — reduces stock, books revenue/COGS). Step 2 (a few days later): upload the <strong>Settlement / income</strong> export to book fees, CWT, and the net bank deposit. Optional: upload <strong>Cancelled</strong> / <strong>Failed Delivery</strong> exports to log TikTok&apos;s cancel reasons into Products Analysis — no GL impact, those orders were never sales. All uploads are safe to re-run — duplicates are skipped.
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
            <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>Marketplace Fees (expense or contra-revenue)</label><AcctSelect value={feesAcct} onChange={setFeesAcct} list={coa.filter(c => c.accountType === 'EXPENSE' || c.accountType === 'REVENUE')} placeholder="Select account…" /></div>
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
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onOrdersFile(f) }} />
          </label>
          <label className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer" style={{ borderColor: 'var(--deep-teal)' }}>
            <Upload size={18} className="mx-auto mb-1" style={{ color: 'var(--deep-teal)' }} />
            <span className="block text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>2. Settlement / Income</span>
            <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>Books fees, CWT, bank deposit</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importSettlement(f) }} />
          </label>
          <label className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer" style={{ borderColor: '#f59e0b' }}>
            <Upload size={18} className="mx-auto mb-1" style={{ color: '#f59e0b' }} />
            <span className="block text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>3. Cancelled</span>
            <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>Logs cancel reasons — optional</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCancellationsFile(f, 'CANCELLED') }} />
          </label>
          <label className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer" style={{ borderColor: '#f59e0b' }}>
            <Upload size={18} className="mx-auto mb-1" style={{ color: '#f59e0b' }} />
            <span className="block text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>3. Failed Delivery</span>
            <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>Logs cancel reasons — optional</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCancellationsFile(f, 'FAILED_DELIVERY') }} />
          </label>
        </div>

        {/* Unmatched-product resolver — import is blocked until every one is mapped */}
        {unmatched.length > 0 && (
          <div className="rounded-xl border p-3 mb-3" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: '#b91c1c' }}>{unmatched.length} product(s) not found in Inventory — for each, pick an inventory item or choose Skip to continue</p>
            <div className="space-y-2 max-h-60 overflow-auto">
              {unmatched.map(u => (
                <div key={u.key} className="grid grid-cols-2 gap-2 items-center">
                  <div className="text-xs" style={{ color: 'var(--charcoal)' }}>
                    <span className="font-mono">{u.sku || '(no SKU)'}</span>
                    <span className="block truncate" style={{ color: 'var(--mid-gray)' }} title={u.name}>{u.name || '(no name)'}</span>
                  </div>
                  <select value={manualMap[u.key] || ''} onChange={e => setManualMap(m => ({ ...m, [u.key]: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: manualMap[u.key] ? 'var(--teal)' : '#fca5a5' }}>
                    <option value="">— Select inventory item —</option>
                    <option value={SKIP}>— Skip (do not import this product) —</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button
              onClick={async () => { if (parsedOrders) await runOrdersImport(parsedOrders as [string, unknown[]][], manualMap) }}
              disabled={busy || unmatched.some(u => !manualMap[u.key])}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {busy ? <Loader2 size={15} className="inline animate-spin" /> : `Confirm & Import ${parsedOrders?.length || 0} order(s)`}
            </button>
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Tip: instead of mapping here every time, set each product&apos;s Seller SKU in TikTok (or match the Inventory item name) so future uploads auto-match.</p>
          </div>
        )}

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
