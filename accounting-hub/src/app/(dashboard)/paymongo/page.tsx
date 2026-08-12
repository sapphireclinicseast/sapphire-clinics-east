'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { CreditCard, Loader2, ExternalLink, RefreshCw, Ticket, Plus, Trash2, X, CheckCircle2, Copy, AlertTriangle, Landmark, Search, Link as LinkIcon, AlertCircle
} from 'lucide-react'
import { PosLinksPanel } from './PosLinksPanel'
import { allowedPaymongoAccounts, canWritePaymongo } from '@/lib/paymongo-access'

const ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'PAYROLL_OFFICER']
const VOUCHER_WRITE = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

const ACCOUNTS = [
  { code: 'AHEA', label: 'AHEA' },
  { code: 'AHGH', label: 'AHGH' },
  { code: 'VERDANA', label: 'Verdana' },
  { code: 'AHI', label: 'Aura Health Institute' },
] as const
type Tab = typeof ACCOUNTS[number]['code'] | 'VOUCHERS' | 'POS'

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology', SPED: 'Special Education', PSY: 'Psychology',
  PSYCHOLOGY: 'Psychology', MD: 'Medical Doctor', CLI: 'Clinic', DIG: 'Digital & Tech',
  EDU: 'Training & Education', MER: 'Merchandise', OTHER: 'Other',
}

// Distinct colour per department so a long list is scannable at a glance.
const DEPT_COLORS: Record<string, { bg: string; fg: string }> = {
  PT:         { bg: '#dbeafe', fg: '#1e40af' },  // blue
  OT:         { bg: '#ede9fe', fg: '#6d28d9' },  // violet
  ST:         { bg: '#ccfbf1', fg: '#0f766e' },  // teal
  SLP:        { bg: '#ccfbf1', fg: '#0f766e' },  // teal (same discipline as ST)
  SPED:       { bg: '#fef3c7', fg: '#92400e' },  // amber
  PSY:        { bg: '#fce7f3', fg: '#9d174d' },  // pink
  PSYCHOLOGY: { bg: '#fce7f3', fg: '#9d174d' },
  MD:         { bg: '#fee2e2', fg: '#b91c1c' },  // red
  CLI:        { bg: '#e0f2fe', fg: '#075985' },  // sky
  DIG:        { bg: '#e0e7ff', fg: '#3730a3' },  // indigo
  EDU:        { bg: '#dcfce7', fg: '#166534' },  // green
  MER:        { bg: '#ffedd5', fg: '#9a3412' },  // orange
  OTHER:      { bg: '#f1f5f9', fg: '#475569' },  // slate
}

function DeptBadge({ dept }: { dept: string }) {
  const key = dept.toUpperCase()
  const c = DEPT_COLORS[key] || DEPT_COLORS.OTHER
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
      {DEPT_LABELS[key] || dept}
    </span>
  )
}

// How the payer actually paid, as reported by PayMongo on the settled payment.
const METHOD_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  QRPH:    { label: 'QRPh',        bg: '#e0f2fe', fg: '#075985' },
  GCASH:   { label: 'GCash',       bg: '#dbeafe', fg: '#1e40af' },
  PAYMAYA: { label: 'Maya',        bg: '#dcfce7', fg: '#166534' },
  CARD:    { label: 'Credit Card', bg: '#ede9fe', fg: '#6d28d9' },
}

function MethodBadge({ method, status }: { method: string | null; status: string }) {
  if (!method) {
    // PayMongo only reports the instrument once the payment settles.
    return <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{status === 'PAID' ? 'not reported' : '—'}</span>
  }
  const m = METHOD_STYLE[method.toUpperCase()] || { label: method, bg: '#f1f5f9', fg: '#475569' }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  )
}

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayStr = () => new Date().toISOString().slice(0, 10)

interface Txn {
  id: string; checkoutId: string; referenceCode: string | null; itemName: string | null; description: string | null
  customerName: string; customerEmail: string | null; customerPhone: string | null
  department: string | null; departmentLabel: string | null; kind: string | null
  voucherCode: string | null; grossAmount: number | null; discountAmount: number | null
  amount: number; status: string; checkoutUrl: string | null; fee: number | null; netAmount: number | null
  paymentMethodUsed: string | null
  paymentId: string | null   // set once PayMongo confirms — used to match against live payments
  external?: boolean         // a payment PayMongo holds that no link here created (storefront sale)
  belongsToAccount?: string | null // settled here but earned by another branch
  paidAt: string | null; payoutId: string | null; livemode: boolean; createdAt: string
}
interface PayLink {
  id: string; token: string; itemName: string; department: string | null; quantity: number
  unitPrice: number; gross: number; discount: number; charged: number; voucherCode: string | null
  allowVoucher: boolean; isActive: boolean; kind: string; paidCount: number; createdAt: string
}
interface Payout { payoutId: string; net: number; fee: number; status: string; settled: boolean; paidAt: string | null }
// A payment as PayMongo itself reports it, independent of anything recorded here.
interface LivePayment { paymentId: string; amount: number; fee: number; net: number; status: string; paidAt: string | null; description: string; payer: string; paymentMethod: string | null; belongsToAccount: string | null }
interface Item { id: string; name: string; price: number; sku?: string; stock?: number; department?: string }
interface Voucher {
  id: string; name: string; code: string; discountType: string; discountValue: number
  isLifetime: boolean; startDate: string | null; endDate: string | null; branches: string[]
  usageLimitType: string; maxUses: number | null; accountId: string | null; accountLabel: string | null
  requiresPwdId: boolean
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
function BranchPanel({ account, label, canWrite }: { account: string; label: string; canWrite: boolean }) {
  const [items, setItems] = useState<{ services: Item[]; products: Item[] }>({ services: [], products: [] })
  const [txns, setTxns] = useState<Txn[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  // Payments the account received that did NOT come from a link created here —
  // the storefront makes its own PayMongo checkouts, so its sales never appear
  // in the transactions table below. The API has always returned these; the
  // page simply dropped them, which is why website payments looked missing.
  const [livePayments, setLivePayments] = useState<LivePayment[]>([])

  const [kind, setKind] = useState<'SERVICE' | 'PRODUCT'>('SERVICE')
  const [itemId, setItemId] = useState('')
  // Type-to-search picker: the catalogue is long, so filtering beats scrolling a dropdown.
  const [itemQuery, setItemQuery] = useState('')
  const [itemOpen, setItemOpen] = useState(false)
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<PayLink[]>([])
  const [copiedToken, setCopiedToken] = useState('')
  const [allowVoucher, setAllowVoucher] = useState(true)
  const [linkCode, setLinkCode] = useState('')

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

  const pickItem = (i: Item) => { setItemId(i.id); setItemQuery(i.name); setItemOpen(false) }

  // Absolute URL for the payer page — resolved client-side so it works on any host.
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  // Storefront sales exist only as raw PayMongo payments — no checkout row is
  // ever created here — so fold them into the same table rather than stranding
  // them somewhere separate. Matched on paymentId so nothing appears twice.
  const rows = useMemo<Txn[]>(() => {
    const known = new Set(txns.map(t => t.paymentId).filter(Boolean))
    const external: Txn[] = livePayments
      .filter(lp => lp.paymentId && !known.has(lp.paymentId))
      .map(lp => ({
        id: `live-${lp.paymentId}`, checkoutId: '', referenceCode: null,
        itemName: lp.description || null, description: lp.description || null,
        customerName: lp.payer || '', customerEmail: null, customerPhone: null,
        department: null, departmentLabel: null, kind: null,
        voucherCode: null, grossAmount: null, discountAmount: null,
        amount: lp.amount, status: lp.status === 'paid' ? 'PAID' : lp.status.toUpperCase(),
        checkoutUrl: null, fee: lp.fee, netAmount: lp.net,
        paymentMethodUsed: lp.paymentMethod, paymentId: lp.paymentId,
        belongsToAccount: lp.belongsToAccount,
        paidAt: lp.paidAt, payoutId: null, livemode: true,
        createdAt: lp.paidAt || new Date().toISOString(),
        external: true,
      }))
    return [...txns, ...external].sort((a, b) =>
      new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime())
  }, [txns, livePayments])

  const load = useCallback(async (sync = false) => {
    setLoading(true); setError('')
    try {
      const [t, p, l] = await Promise.all([
        fetch(`/api/paymongo/transactions?account=${account}${sync ? '&sync=1' : '&live=1'}`).then(r => r.json()),
        fetch(`/api/paymongo/payouts?account=${account}`).then(r => r.json()),
        fetch(`/api/paymongo/links?account=${account}`).then(r => r.ok ? r.json() : []),
      ])
      setLinks(Array.isArray(l) ? l : [])
      setTxns(t.transactions || []); setConfigured(t.configured !== false)
      if (Array.isArray(t.livePayments)) setLivePayments(t.livePayments)
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
  useEffect(() => { setItemId(''); setItemQuery(''); setItemOpen(false) }, [kind])


  const generate = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/paymongo/links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, kind, itemId, quantity: parseInt(qty, 10) || 1, allowVoucher, voucherCode: linkCode.trim() || undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to create link')
      setItemId(''); setItemQuery(''); setLinkCode('')
      await load(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  const del = async (t: Txn) => {
    if (t.status === 'PAID') return                     // never removable; guarded server-side too
    const what = t.itemName || t.description || 'this payment link'
    if (!confirm(
      `Delete the ${t.status.toLowerCase()} payment for ${what}?\n\n`
      + 'The link is expired at PayMongo so it can no longer be paid, and the row is removed. '
      + 'This cannot be undone.',
    )) return
    const r = await fetch(`/api/paymongo/checkout?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      alert(j.error || 'Failed to delete')
      // Most likely cause: it was paid since this table was loaded. Re-sync to show the truth.
      load(true)
      return
    }
    load(false)
  }

  const toggleLink = async (l: PayLink) => {
    const r = await fetch('/api/paymongo/links', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, isActive: !l.isActive }) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Failed'); return }
    load(false)
  }
  const delLink = async (l: PayLink) => {
    if (!confirm(`Delete the payment link for ${l.itemName}?`)) return
    const r = await fetch(`/api/paymongo/links?id=${l.id}`, { method: 'DELETE' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Failed'); return }
    load(false)
  }

  // Only the item matters — the payer enters their own details on the payer page.
  const canSubmit = !!itemId && gross > 0

  return (
    <div className="space-y-4">
      {!configured && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: '#fffbeb', color: '#92400e' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>No key configured for this account yet. Set <code className="font-mono">PAYMONGO_SECRET_KEY_{account}</code> in the server environment and restart the app.</span>
        </div>
      )}
      {error && <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>}

      {/* ── Generate a payment link (writers only; front desk is view-only) ── */}
      {canWrite && (
      <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Generate Payment Link — {label}</p>
        <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Create one link per service or product and reuse it for every patient. Each payer opens the link, enters their own name, contact number and email, then pays — and those details appear in Transactions Received below.</p>
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
                onChange={e => { setItemQuery(e.target.value); setItemId(''); setItemOpen(true) }}
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
            <input type="number" min={1} value={qty} onChange={e => { setQty(e.target.value) }} className="w-full px-3 py-2 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div className="md:col-span-2 flex items-end">
            <div className="w-full rounded-xl border px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Amount the payer will be charged</span>
              <div className="font-mono font-bold text-base" style={{ color: 'var(--deep-teal)' }}>{peso(gross)}</div>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Apply a voucher to this link (optional)</label>
            <input value={linkCode} onChange={e => setLinkCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-xl border font-mono" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. SUMMER10" />
            <label className="flex items-center gap-2 text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
              <input type="checkbox" checked={allowVoucher} onChange={e => setAllowVoucher(e.target.checked)} disabled={!!linkCode.trim()} />
              {linkCode.trim() ? 'A voucher is applied to the link, so payers won\u2019t be asked for a code' : 'Otherwise, let each payer enter their own code'}
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button onClick={generate} disabled={busy || !canSubmit || !configured} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Create Payment Link
          </button>
        </div>
      </div>
      )}

      {/* ── Reusable payment links ── */}
      <div className="rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <LinkIcon size={15} style={{ color: 'var(--teal)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Created Payment Links — {label}</span>
          <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>· reuse each link for any number of patients</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
              <th className="px-3 py-2 text-left font-semibold uppercase">Date Created</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Item</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Voucher</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Gross</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Disc.</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Charged</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {links.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No payment links yet — create one above.</td></tr>
              ) : links.map(l => {
                const url = `${origin}/pay/${l.token}`
                return (
                  <tr key={l.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(l.createdAt).toLocaleDateString('en-PH')}</td>
                    <td className="px-3 py-2">
                      <span style={{ color: 'var(--charcoal)' }}>{l.itemName}{l.quantity > 1 ? ` \u00d7${l.quantity}` : ''}</span>
                      {(l.department || l.kind === 'PRODUCT' || !l.isActive) && (
                        <span className="block mt-0.5">
                          {l.department && <DeptBadge dept={l.department} />}
                          {l.kind === 'PRODUCT' && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>Product</span>}
                          {!l.isActive && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>Disabled</span>}
                          {l.paidCount > 0 && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{l.paidCount} paid</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {l.voucherCode || (l.allowVoucher ? <span className="font-sans">payer may enter</span> : '\u2014')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{peso(l.gross)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: l.discount > 0 ? '#c44b00' : 'var(--light-gray)' }}>{l.discount > 0 ? peso(l.discount) : '\u2014'}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(l.charged)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => { navigator.clipboard?.writeText(url); setCopiedToken(l.token) }}
                        className="text-[11px] font-medium mr-2" style={{ color: copiedToken === l.token ? '#166534' : 'var(--teal)' }}>
                        {copiedToken === l.token ? 'Copied' : 'Copy link'}
                      </button>
                      <a href={url} target="_blank" rel="noreferrer" className="mr-2" title="Open payer page"><ExternalLink size={13} style={{ color: 'var(--teal)' }} className="inline" /></a>
                      {/* Front desk can hand the link out, but not change or remove it. */}
                      {canWrite && <button onClick={() => toggleLink(l)} className="text-[11px] font-medium mr-2" style={{ color: 'var(--mid-gray)' }}>{l.isActive ? 'Disable' : 'Enable'}</button>}
                      {canWrite && l.paidCount === 0 && <button onClick={() => delLink(l)} title="Delete"><Trash2 size={13} className="text-red-500 inline" /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Money that landed in this account but was earned by another branch.
          Display only — it changes nothing in the ledger, it just stops the tab
          quietly implying the cash belongs here. */}
      {(() => {
        const strays = rows.filter(r => r.belongsToAccount)
        if (strays.length === 0) return null
        const total = strays.reduce((sum, r) => sum + r.amount, 0)
        const net = strays.reduce((sum, r) => sum + (r.netAmount ?? r.amount), 0)
        const owed = [...new Set(strays.map(r => r.belongsToAccount))].join(', ')
        return (
          <div className="mb-4 p-3 rounded-xl border flex items-start gap-2" style={{ background: '#fffbeb', borderColor: '#f59e0b', color: '#92400e' }}>
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {strays.length} payment{strays.length === 1 ? '' : 's'} here {strays.length === 1 ? 'was' : 'were'} earned by {owed} — {peso(total)} gross, {peso(net)} net settled into this account.
              </p>
              <p className="text-xs mt-1">
                Class-portal tuition taken before the portal sent the student&apos;s branch, so the cash settled here instead of {owed}. The revenue is already recognised under {owed} — these were booked as POS orders on the day they were paid — so nothing is missing from the income statement. Only the cash sits in the wrong account, and squaring that needs a bank transfer, not a change here.
              </p>
              <ul className="text-xs mt-1.5 space-y-0.5">
                {strays.map(r => (
                  <li key={r.id}>· {r.customerName || r.itemName || '—'} — {peso(r.amount)} gross, {peso(r.netAmount ?? r.amount)} net → belongs to {r.belongsToAccount}</li>
                ))}
              </ul>
            </div>
          </div>
        )
      })()}

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
              <th className="px-3 py-2 text-left font-semibold uppercase">Paid via</th>
              <th className="px-3 py-2 text-left font-semibold uppercase">Status</th>
              <th className="px-3 py-2 text-right font-semibold uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No transactions yet for this account.</td></tr>
              ) : rows.map(t => (
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
                  <td className="px-3 py-2">
                    <span style={{ color: 'var(--charcoal)' }}>{t.itemName || t.description || '—'}</span>
                    {/* Paid straight to the PayMongo account — a storefront sale or a
                        payment taken outside any link created here. */}
                    {t.external && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#ede9fe', color: '#5b21b6' }}>Website / direct</span>
                    )}
                    {t.belongsToAccount && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#fef3c7', color: '#92400e' }}
                        title={`Earned by ${t.belongsToAccount} but settled into this account`}>
                        ⚠ {t.belongsToAccount}&apos;s money
                      </span>
                    )}
                    {(t.departmentLabel || t.kind === 'PRODUCT') && (
                      <span className="block mt-0.5">
                        {t.department && <DeptBadge dept={t.department} />}
                        {t.kind === 'PRODUCT' && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>Product</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'var(--mid-gray)' }}>{t.voucherCode || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{t.grossAmount != null ? peso(t.grossAmount) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: (t.discountAmount || 0) > 0 ? '#c44b00' : 'var(--light-gray)' }}>{(t.discountAmount || 0) > 0 ? peso(t.discountAmount!) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{peso(t.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{t.fee != null ? peso(t.fee) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--deep-teal)' }}>{t.netAmount != null ? peso(t.netAmount) : '—'}</td>
                  <td className="px-3 py-2"><MethodBadge method={t.paymentMethodUsed} status={t.status} /></td>
                  <td className="px-3 py-2"><Badge s={t.status} />{t.payoutId && <span className="block text-[10px] mt-0.5" style={{ color: '#166534' }}>settled</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {t.checkoutUrl && t.status === 'PENDING' && <a href={t.checkoutUrl} target="_blank" rel="noreferrer" className="mr-2" title="Open link"><ExternalLink size={13} style={{ color: 'var(--teal)' }} className="inline" /></a>}
                    {/* A link the payer abandoned can sit PENDING forever, so it must be
                        removable. A settled payment never is — the money is real. */}
                    {canWrite && t.status !== 'PAID' && !t.external && (
                      <button onClick={() => del(t)} title="Expire this link at PayMongo and remove the row"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border"
                        style={{ borderColor: '#fecaca', color: '#b91c1c', background: '#fef2f2' }}>
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                    {t.status === 'PAID' && (
                      <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }} title="A settled payment cannot be deleted">paid — locked</span>
                    )}
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
    requiresPwdId: false,
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
    setF({ name: '', code: '', discountType: 'PERCENTAGE', discountValue: '', isLifetime: false, startDate: todayStr(), endDate: todayStr(), branches: [], usageLimitType: 'UNLIMITED', maxUses: '', accountId: '', isActive: true, requiresPwdId: false })
    setOpen(true); setError('')
  }
  const openEdit = (v: Voucher) => {
    setEditId(v.id)
    setF({
      name: v.name, code: v.code, discountType: v.discountType, discountValue: String(v.discountValue),
      isLifetime: v.isLifetime, startDate: v.startDate || todayStr(), endDate: v.endDate || todayStr(),
      branches: v.branches || [], usageLimitType: v.usageLimitType, maxUses: v.maxUses ? String(v.maxUses) : '',
      accountId: v.accountId || '', isActive: v.isActive, requiresPwdId: !!v.requiresPwdId,
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
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          {canWrite
            ? 'Promo codes customers can enter on a generated payment link. A voucher only works at the branches you tick.'
            : 'View-only: the promo codes a patient can enter on a payment link, and where each one is valid.'}
        </p>
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
            {canWrite && <th className="px-3 py-2 text-right font-semibold uppercase">Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canWrite ? 10 : 9} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={canWrite ? 10 : 9} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No vouchers yet.</td></tr>
            ) : rows.map(v => (
              <tr key={v.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{v.name}</td>
                <td className="px-3 py-2 font-mono" style={{ color: 'var(--deep-teal)' }}>
                  {v.code}
                  {v.requiresPwdId && (
                    <span className="block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-sans font-semibold w-fit"
                      style={{ background: '#e0f2fe', color: '#075985' }}
                      title="Only works for a payer with a PWD/Senior ID number AND ID photo in Patient CRM">
                      PWD / SENIOR ID REQUIRED
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{v.discountType === 'FIXED' ? peso(v.discountValue) : `${v.discountValue}%`}</td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{v.isLifetime ? <span className="font-medium" style={{ color: 'var(--deep-teal)' }}>Lifetime</span> : `${v.startDate} → ${v.endDate}`}</td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{v.branches.length ? v.branches.join(', ') : 'All'}</td>
                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{LIMIT_LABEL[v.usageLimitType] || v.usageLimitType}{v.usageLimitType === 'MAX_USES' && v.maxUses ? ` (${v.maxUses})` : ''}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{v.uses}</td>
                <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{v.accountLabel || '—'}</td>
                <td className="px-3 py-2">{v.isActive ? <span style={{ color: '#166534' }}>Active</span> : <span style={{ color: 'var(--mid-gray)' }}>Inactive</span>}</td>
                {canWrite && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(v)} className="text-[11px] font-medium mr-2" style={{ color: 'var(--teal)' }}>Edit</button>
                    <button onClick={() => del(v)} title="Delete"><Trash2 size={13} className="text-red-500 inline" /></button>
                  </td>
                )}
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

              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <label className="flex items-start gap-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" className="mt-0.5" checked={f.requiresPwdId} onChange={e => setF({ ...f, requiresPwdId: e.target.checked })} />
                  <span>Requires a registered PWD / Senior ID</span>
                </label>
                <p className="mt-1 text-[11px] pl-6" style={{ color: 'var(--mid-gray)' }}>
                  The code is refused unless Patient CRM (Operations Hub) holds <strong>both</strong> a PWD/Senior ID
                  number <strong>and</strong> an uploaded ID photo for the payer. Matched on the name, mobile number
                  or email they enter at checkout.
                </p>
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

  // Front desk is read-only and scoped to their own branch: one account tab, no voucher
  // setup and no POS-link tooling.
  const allowed = allowedPaymongoAccounts(role)
  const canWrite = canWritePaymongo(role)
  const visibleAccounts = allowed ? ACCOUNTS.filter(a => allowed.includes(a.code)) : [...ACCOUNTS]

  const TABS: { key: Tab; label: string }[] = [
    ...visibleAccounts.map(a => ({ key: a.code as Tab, label: a.label })),
    // Vouchers are readable by everyone — front desk needs to look a code up for a patient —
    // but only VOUCHER_WRITE roles get the New/Edit/Delete controls inside the panel.
    { key: 'VOUCHERS', label: 'Voucher Discounts' },
    ...(canWrite ? [{ key: 'POS' as Tab, label: 'POS Links' }] : []),
  ]

  // Land on a tab this role can actually open, whatever the default was.
  const activeTab: Tab = TABS.some(t => t.key === tab) ? tab : (TABS[0]?.key ?? 'AHEA')
  if (TABS.length === 0) {
    return <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No PayMongo account is assigned to your branch.</div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}>
          <CreditCard size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>PayMongo</h1>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {canWrite
              ? 'Each branch has its own PayMongo account — pick a section to generate a link and see that account’s transactions and payouts.'
              : 'View-only: your branch’s payment links, the payments received on them, and its bank payouts.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors flex items-center gap-1.5"
            style={{ borderColor: activeTab === t.key ? 'var(--teal)' : 'transparent', color: activeTab === t.key ? 'var(--teal)' : 'var(--mid-gray)' }}>
            {t.key === 'VOUCHERS' && <Ticket size={14} />}{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'VOUCHERS' ? <VouchersPanel canWrite={VOUCHER_WRITE.includes(role as string)} />
        : activeTab === 'POS' ? <PosLinksPanel />
        : <BranchPanel account={activeTab} label={ACCOUNTS.find(a => a.code === activeTab)!.label} canWrite={canWrite} />}
    </div>
  )
}
