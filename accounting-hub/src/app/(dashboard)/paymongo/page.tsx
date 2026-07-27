'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { CreditCard, Loader2, ExternalLink, RefreshCw, Ticket, Plus, Trash2, X, CheckCircle2, Copy, AlertTriangle, Landmark, Search } from 'lucide-react'
import { PosLinksPanel } from './PosLinksPanel'

const ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'PAYROLL_OFFICER']
const VOUCHER_WRITE = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

const ACCOUNTS = [
  { code: 'AHEA', label: 'AHEA' },
  { code: 'AHGH', label: 'AHGH' },
  { code: 'VERDANA', label: 'Verdana' },
  { code: 'AHI', label: 'Aura Health Institute' },
] as const
type Tab = typeof ACCOUNTS[number]['code'] | 'VOUCHERS' | 'POS'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayStr = () => new Date().toISOString().slice(0, 10)

interface Txn {
  id: string; checkoutId: string; referenceCode: string | null; itemName: string | null; description: string | null
  customerName: string; customerEmail: string | null; customerPhone: string | null
  voucherCode: string | null; grossAmount: number | null; discountAmount: number | null
  amount: number; status: string; checkoutUrl: string | null; fee: number | null; netAmount: number | null
  paidAt: string | null; payoutId: string | null; livemode: boolean; createdAt: string
}
interface Payout { payoutId: string; net: number; fee: number; status: string; settled: boolean; paidAt: string | null }
interface Item { id: string; name: string; price: number; sku?: string; stock?: number; department?: string }
interface Voucher {
  id: string; name: string; code: string; discountType: string; discountValue: number
  isLifetime: boolean; startDate: string | null; endDate: string | null; branches: string[]
  usageLimitType: string; maxUses: number | null; accountId: string | null; accountLabel: string | null
  isActive: boolean; uses: number
}
interface Coa { id: string; accountNumber: string; accountTitle: string }

function Badge({ s }: { s: string }) {
  const map: Record<string, { bg: string; c: string }> = {
    PAID: { bg: '#dcfce7', c: '#166534' }, PENDING: { bg: '#fef9c3', c: '#854d0e' },
    FAILED: { bg: '#fee2e2', c: '#b91c1c' }, EXPIRED: { bg: '#f1f5f9', c: '#64748b' },
  }
  const st = map[s] || map.PENDING
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: st.bg, color: st.c }}>{s}</span>
}

/* ══════════════════ One branch account ══════════════════ */
function BranchPanel({ account, label }: { account: string; label: string }) {
  const [items, setItems] = useState<{ services: Item[]; products: Item[] }>({ services: [], products: [] })
  const [txns, setTxns] = useState<Txn[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const [kind, setKind] = useState<'SERVICE' | 'PRODUCT'>('SERVICE')
  const [itemId, setItemId] = useState('')
  // Type-to-search picker: the catalogue is long, so filtering beats scrolling a dropdown.
  const [itemQuery, setItemQuery] = useState('')
  const [itemOpen, setItemOpen] = useState(false)
  const [qty, setQty] = useState('1')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<{ ok: boolean; reason?: string; discount?: number; netAmount?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastUrl, setLastUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const list = kind === 'SERVICE' ? items.services : items.products
  const chosen = list.find(i => i.id === itemId)
  const gross = useMemo(() => (chosen ? chosen.price * (parseInt(qty, 10) || 1) : 0), [chosen, qty])

  // Match on name or SKU, so "philbritish", "cryo" or an OT-TOY-… code all work.
  const matches = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    if (!q) return list.slice(0, 60)
    const terms = q.split(/\s+/)
    return list.filter(i => {
      const hay = `${i.name} ${i.sku || ''}`.toLowerCase()
      return terms.every(t => hay.includes(t))
    }).slice(0, 60)
  }, [list, itemQuery])

  const pickItem = (i: Item) => { setItemId(i.id); setItemQuery(i.name); setItemOpen(false); setPreview(null) }

  const load = useCallback(async (sync = false) => {
    setLoading(true); setError('')
    try {
      const [t, p] = await Promise.all([
        fetch(`/api/paymongo/transactions?account=${account}${sync ? '&sync=1' : ''}`).then(r => r.json()),
        fetch(`/api/paymongo/payouts?account=${account}`).then(r => r.json()),
      ])
      setTxns(t.transactions || []); setConfigured(t.configured !== false)
      if (t.syncError) setError(t.syncError)
      // Sales that couldn't be booked to the GL (e.g. an item with no revenue account).
      if (Array.isArray(t.postWarnings) && t.postWarnings.length) {
        setError(prev => prev || `Paid, but not booked to the ledger: ${t.postWarnings.join('; ')}`)
      }
      setPayouts(p.payouts || [])
      if (p.error) setError(prev => prev || p.error)
    } catch { setError('Failed to load') } finally { setLoading(false) }
  }, [account])

  useEffect(() => { load(false) }, [load])
  useEffect(() => {
    fetch(`/api/paymongo/items?account=${account}`).then(r => r.json())
      .then(d => setItems({ services: d.services || [], products: d.products || [] }))
      .catch(() => setItems({ services: [], products: [] }))
  }, [account])
  useEffect(() => { setItemId(''); setItemQuery(''); setItemOpen(false); setPreview(null) }, [kind])

  const checkCode = async () => {
    if (!code.trim() || gross <= 0) { setPreview(null); return }
    const r = await fetch('/api/paymongo/vouchers/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, account, amountPhp: gross }),
    })
    setPreview(await r.json())
  }

  const generate = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/paymongo/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, kind, itemId, quantity: parseInt(qty, 10) || 1, voucherCode: code.trim() || undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to create link')
      setLastUrl(j.checkoutUrl); setCopied(false)
      setCode(''); setPreview(null); setItemId(''); setItemQuery('')
      await load(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  const del = async (t: Txn) => {
    if (!confirm(`Delete this unpaid payment link${t.referenceCode ? ` (${t.referenceCode})` : ''}?`)) return
    const r = await fetch(`/api/paymongo/checkout?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Failed'); return }
    load(false)
  }

  // Only the item matters now — the payer fills in their own details on PayMongo's page.
  const canSubmit = !!itemId && gross > 0 && !(preview && !preview.ok)

  return (
    <div className="space-y-4">
      {!configured && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: '#fffbeb', color: '#92400e' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>No key configured for this account yet. Set <code className="font-mono">PAYMONGO_SECRET_KEY_{account}</code> in the server environment and restart the app.</span>
        </div>
      )}
      {error && <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>}

      {/* ── Generate a payment link ── */}
      <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Generate Payment Link — {label}</p>
        <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>The payer enters their own name, contact number and email on the PayMongo checkout page — those details then appear in Transactions Received below. Each link is valid for a single payment, so generate one per patient.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Pay for</label>
            <select value={kind} onChange={e => setKind(e.target.value as 'SERVICE' | 'PRODUCT')} className="w-full px-3 py-2 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="SERVICE">Service</option>
              <option value="PRODUCT">Product</option>
            </select>
          </div>
          <div className="md:col-span-2 relative">
            <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>{kind === 'SERVICE' ? 'Service' : 'Product'}</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5" style={{ color: 'var(--mid-gray)' }} />
              <input
                value={itemQuery}
                onChange={e => { setItemQuery(e.target.value); setItemId(''); setItemOpen(true); setPreview(null) }}
                onFocus={() => setItemOpen(true)}
                onBlur={() => window.setTimeout(() => setItemOpen(false), 150)}
                onKeyDown={e => {
                  // Enter picks the only/first match; Escape closes without choosing.
                  if (e.key === 'Enter' && matches.length > 0) { e.preventDefault(); pickItem(matches[0]) }
                  else if (e.key === 'Escape') setItemOpen(false)
                }}
                placeholder={`Type to search ${kind === 'SERVICE' ? 'services' : 'products'}…`}
                className="w-full pl-8 pr-16 py-2 rounded-xl border" style={{ borderColor: itemId ? 'var(--teal)' : 'var(--light-gray)' }} />
              {itemId && chosen && (
                <span className="absolute right-2 top-2 text-[11px] font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(chosen.price)}</span>
              )}
              {itemQuery && !itemId && (
                <button type="button" onClick={() => { setItemQuery(''); setItemOpen(false) }} className="absolute right-2 top-2" title="Clear">
                  <X size={13} style={{ color: 'var(--mid-gray)' }} />
                </button>
              )}
            </div>
            {itemOpen && (
              <div className="absolute z-[70] left-0 right-0 mt-1 rounded-xl border bg-white shadow-xl overflow-auto"
                style={{ maxHeight: 260, borderColor: 'var(--light-gray)' }}>
                {list.length === 0 ? (
                  <div className="px-3 py-2.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>No {kind === 'SERVICE' ? 'services' : 'products'} available for this branch.</div>
                ) : matches.length === 0 ? (
                  <div className="px-3 py-2.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>No match for “{itemQuery}”.</div>
                ) : matches.map(i => (
                  <button key={i.id} type="button" onMouseDown={e => { e.preventDefault(); pickItem(i) }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{i.name}</span>
                      <span className="text-xs font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{peso(i.price)}</span>
                    </div>
                    {(i.sku || i.stock != null || i.department) && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {[i.sku, i.department, i.stock != null ? `stock ${i.stock}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Qty</label>
            <input type="number" min={1} value={qty} onChange={e => { setQty(e.target.value); setPreview(null) }} className="w-full px-3 py-2 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div className="md:col-span-2">
            <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Voucher code (optional)</label>
            <div className="flex gap-2">
              <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setPreview(null) }} onBlur={checkCode} className="flex-1 px-3 py-2 rounded-xl border font-mono" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. SUMMER10" />
              <button onClick={checkCode} disabled={!code.trim() || gross <= 0} className="px-3 py-2 rounded-xl text-xs font-medium border disabled:opacity-40" style={{ borderColor: 'var(--light-gray)' }}>Check</button>
            </div>
            {preview && (preview.ok
              ? <p className="mt-1 text-[11px]" style={{ color: '#166534' }}>✓ Discount {peso(preview.discount || 0)} → charge {peso(preview.netAmount || 0)}</p>
              : <p className="mt-1 text-[11px] text-red-600">{preview.reason}</p>)}
          </div>
          <div className="md:col-span-2 flex items-end">
            <div className="w-full rounded-xl border px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Amount to charge</span>
              <div className="font-mono font-bold text-base" style={{ color: 'var(--deep-teal)' }}>
                {peso(preview?.ok ? (preview.netAmount || 0) : gross)}
                {preview?.ok && (preview.discount || 0) > 0 && <span className="ml-2 text-[11px] font-normal line-through" style={{ color: 'var(--mid-gray)' }}>{peso(gross)}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button onClick={generate} disabled={busy || !canSubmit || !configured} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Generate Link
          </button>
          {lastUrl && (
            <div className="flex items-center gap-3 text-xs">
              <a href={lastUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium underline" style={{ color: 'var(--teal)' }}><ExternalLink size={12} /> Open link</a>
              <button onClick={() => { navigator.clipboard?.writeText(lastUrl); setCopied(true) }} className="flex items-center gap-1 font-medium" style={{ color: copied ? '#166534' : 'var(--mid-gray)' }}>
                {copied ? <><CheckCircle2 size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className="rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Transactions Received — {label}</span>
          <button onClick={async () => { setSyncing(true); await load(true); setSyncing(false) }} disabled={syncing || !configured}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync from PayMongo
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
              <th className="px-3 py-2 text-left font-semibold uppercase">Date</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Customer</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Item</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Voucher</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Gross</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Disc.</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Charged</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Fee</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Net</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Status</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></td></tr>
              ) : txns.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No transactions yet for this account.</td></tr>
              ) : txns.map(t => (
                <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(t.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                    {/* Populated from the payer's own entries on the PayMongo page once paid. */}
                    {t.customerName || <span style={{ color: 'var(--mid-gray)' }}>{t.status === 'PENDING' ? 'awaiting payer' : '—'}</span>}
                    {(t.customerEmail || t.customerPhone) && (
                      <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                        {[t.customerEmail, t.customerPhone].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{t.itemName || t.description || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'var(--mid-gray)' }}>{t.voucherCode || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{t.grossAmount != null ? peso(t.grossAmount) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: (t.discountAmount || 0) > 0 ? '#c44b00' : 'var(--light-gray)' }}>{(t.discountAmount || 0) > 0 ? peso(t.discountAmount!) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{peso(t.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{t.fee != null ? peso(t.fee) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--deep-teal)' }}>{t.netAmount != null ? peso(t.netAmount) : '—'}</td>
                  <td className="px-3 py-2"><Badge s={t.status} />{t.payoutId && <span className="block text-[10px] mt-0.5" style={{ color: '#166534' }}>settled</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {t.checkoutUrl && t.status === 'PENDING' && <a href={t.checkoutUrl} target="_blank" rel="noreferrer" className="mr-2" title="Open link"><ExternalLink size={13} style={{ color: 'var(--teal)' }} className="inline" /></a>}
                    {t.status !== 'PAID' && <button onClick={() => del(t)} title="Delete link"><Trash2 size={13} className="text-red-500 inline" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Payouts ── */}
      <div className="rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <Landmark size={15} style={{ color: 'var(--teal)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Payouts to Bank — {label}</span>
          <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>· for bank reconciliation</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
              <th className="px-3 py-2 text-left font-semibold uppercase">Payout ID</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Date</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Net to Bank</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Fee</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Settled?</th>
            </tr></thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>{configured ? 'No payouts reported by PayMongo for this account yet.' : 'Configure this account to see payouts.'}</td></tr>
              ) : payouts.map(p => (
                <tr key={p.payoutId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'var(--charcoal)' }}>{p.payoutId}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-PH') : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(p.net)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{peso(p.fee)}</td>
                  <td className="px-3 py-2">
                    {p.settled
                      ? <span className="flex items-center gap-1 font-medium" style={{ color: '#166534' }}><CheckCircle2 size={12} /> In bank</span>
                      : <span style={{ color: '#854d0e' }}>{p.status || 'pending'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════ Voucher Discounts ══════════════════ */
function VouchersPanel({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Voucher[]>([])
  const [coa, setCoa] = useState<Coa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [f, setF] = useState({
    name: '', code: '', discountType: 'PERCENTAGE', discountValue: '',
    isLifetime: false, startDate: todayStr(), endDate: todayStr(),
    branches: [] as string[], usageLimitType: 'UNLIMITED', maxUses: '', accountId: '', isActive: true,
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/paymongo/vouchers'); setRows(r.ok ? await r.json() : []) }
    catch { setRows([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=1000').then(r => r.ok ? r.json() : { data: [] })
      .then(d => setCoa(Array.isArray(d) ? d : (d.data || []))).catch(() => setCoa([]))
  }, [])

  const openNew = () => {
    setEditId(null)
    setF({ name: '', code: '', discountType: 'PERCENTAGE', discountValue: '', isLifetime: false, startDate: todayStr(), endDate: todayStr(), branches: [], usageLimitType: 'UNLIMITED', maxUses: '', accountId: '', isActive: true })
    setOpen(true); setError('')
  }
  const openEdit = (v: Voucher) => {
    setEditId(v.id)
    setF({
      name: v.name, code: v.code, discountType: v.discountType, discountValue: String(v.discountValue),
      isLifetime: v.isLifetime, startDate: v.startDate || todayStr(), endDate: v.endDate || todayStr(),
      branches: v.branches || [], usageLimitType: v.usageLimitType, maxUses: v.maxUses ? String(v.maxUses) : '',
      accountId: v.accountId || '', isActive: v.isActive,
    })
    setOpen(true); setError('')
  }
  const toggleBranch = (c: string) => setF(p => ({ ...p, branches: p.branches.includes(c) ? p.branches.filter(x => x !== c) : [...p.branches, c] }))

  const save = async () => {
    setSaving(true); setError('')
    try {
      const body = { ...f, id: editId || undefined, discountValue: parseFloat(f.discountValue) || 0, maxUses: f.maxUses ? parseInt(f.maxUses, 10) : null }
      const r = await fetch('/api/paymongo/vouchers', { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Failed to save')
      setOpen(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') } finally { setSaving(false) }
  }
  const del = async (v: Voucher) => {
    if (!confirm(`Delete voucher "${v.name}" (${v.code})?`)) return
    const r = await fetch(`/api/paymongo/vouchers?id=${v.id}`, { method: 'DELETE' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Failed'); return }
    load()
  }

  const LIMIT_LABEL: Record<string, string> = { UNLIMITED: 'Unlimited', ONCE_PER_CUSTOMER: 'Once per customer', MAX_USES: 'Max uses' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Promo codes customers can enter on a generated payment link. A voucher only works at the branches you tick.</p>
        {canWrite && <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> New Voucher</button>}
      </div>
      {error && !open && <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs">
          <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
            <th className="px-3 py-2 text-left font-semibold uppercase">Name</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Code</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">Discount</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Effectivity</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Branches</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Limit</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">Used</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Account</th>
            <th className="px-3 py-2 text-left font-semibold uppercase">Active</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">Actions</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No vouchers yet.</td></tr>
            ) : rows.map(v => (
              <tr key={v.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{v.name}</td>
                <td className="px-3 py-2 font-mono" style={{ color: 'var(--deep-teal)' }}>{v.code}</td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{v.discountType === 'FIXED' ? peso(v.discountValue) : `${v.discountValue}%`}</td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{v.isLifetime ? <span className="font-medium" style={{ color: 'var(--deep-teal)' }}>Lifetime</span> : `${v.startDate} → ${v.endDate}`}</td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{v.branches.length ? v.branches.join(', ') : 'All'}</td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{LIMIT_LABEL[v.usageLimitType] || v.usageLimitType}{v.usageLimitType === 'MAX_USES' && v.maxUses ? ` (${v.maxUses})` : ''}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{v.uses}</td>
                <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{v.accountLabel || '—'}</td>
                <td className="px-3 py-2">{v.isActive ? <span style={{ color: '#166534' }}>Active</span> : <span style={{ color: 'var(--mid-gray)' }}>Inactive</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {canWrite && <button onClick={() => openEdit(v)} className="text-[11px] font-medium mr-2" style={{ color: 'var(--teal)' }}>Edit</button>}
                  {canWrite && <button onClick={() => del(v)} title="Delete"><Trash2 size={13} className="text-red-500 inline" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{editId ? 'Edit Voucher' : 'New Voucher'}</h2>
              <button onClick={() => setOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            {error && <div className="mb-3 px-3 py-2 rounded-lg text-xs bg-red-50 text-red-700">{error}</div>}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Voucher name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. Summer Promo" /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Voucher code</label><input value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} className="w-full px-3 py-2.5 rounded-xl border font-mono" style={{ borderColor: 'var(--light-gray)' }} placeholder="SUMMER10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Discount type</label>
                  <select value={f.discountType} onChange={e => setF({ ...f, discountType: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed amount (₱)</option>
                  </select>
                </div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Value</label><input type="number" value={f.discountValue} onChange={e => setF({ ...f, discountValue: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder={f.discountType === 'FIXED' ? '200' : '10'} /></div>
              </div>

              <div>
                <label className="flex items-center gap-2 font-medium mb-1" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" checked={f.isLifetime} onChange={e => setF({ ...f, isLifetime: e.target.checked })} /> Lifetime (never expires)
                </label>
                {!f.isLifetime && (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div><label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Effective from</label><input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                    <div><label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Effective to</label><input type="date" value={f.endDate} onChange={e => setF({ ...f, endDate: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                  </div>
                )}
              </div>

              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Valid at branches (tick one or more)</label>
                <div className="flex flex-wrap gap-3">
                  {ACCOUNTS.map(a => (
                    <label key={a.code} className="flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
                      <input type="checkbox" checked={f.branches.includes(a.code)} onChange={() => toggleBranch(a.code)} /> {a.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Usage limit</label>
                  <select value={f.usageLimitType} onChange={e => setF({ ...f, usageLimitType: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="UNLIMITED">Unlimited</option>
                    <option value="ONCE_PER_CUSTOMER">Once per customer (by email)</option>
                    <option value="MAX_USES">Max number of uses</option>
                  </select>
                </div>
                {f.usageLimitType === 'MAX_USES' && (
                  <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Max uses</label><input type="number" min={1} value={f.maxUses} onChange={e => setF({ ...f, maxUses: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                )}
              </div>

              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Discount account (Chart of Accounts)</label>
                <select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">Select an account…</option>
                  {coa.map(a => <option key={a.id} value={a.id}>{a.accountNumber} · {a.accountTitle}</option>)}
                </select>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>Contra-revenue accounts (DEBIT balance, e.g. 7210 Other Discounts) show the promo as a deduction in the Income Statement.</p>
              </div>

              <label className="flex items-center gap-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={f.isActive} onChange={e => setF({ ...f, isActive: e.target.checked })} /> Active
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════ Page ══════════════════ */
export default function PaymongoPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [tab, setTab] = useState<Tab>('AHEA')

  if (status === 'loading') return <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="inline animate-spin" /></div>
  if (status === 'unauthenticated') redirect('/login')
  if (!ACCESS.includes(role as string)) {
    return <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>You do not have permission to view this page.</div>
  }

  const TABS: { key: Tab; label: string }[] = [
    ...ACCOUNTS.map(a => ({ key: a.code as Tab, label: a.label })),
    { key: 'VOUCHERS', label: 'Voucher Discounts' },
    { key: 'POS', label: 'POS Links' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}>
          <CreditCard size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>PayMongo</h1>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Each branch has its own PayMongo account — pick a section to generate a link and see that account&apos;s transactions and payouts.</p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors flex items-center gap-1.5"
            style={{ borderColor: tab === t.key ? 'var(--teal)' : 'transparent', color: tab === t.key ? 'var(--teal)' : 'var(--mid-gray)' }}>
            {t.key === 'VOUCHERS' && <Ticket size={14} />}{t.label}
          </button>
        ))}
      </div>

      {tab === 'VOUCHERS' ? <VouchersPanel canWrite={VOUCHER_WRITE.includes(role as string)} />
        : tab === 'POS' ? <PosLinksPanel />
        : <BranchPanel account={tab} label={ACCOUNTS.find(a => a.code === tab)!.label} />}
    </div>
  )
}
