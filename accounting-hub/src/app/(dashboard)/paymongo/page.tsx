'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { CreditCard, Loader2, ExternalLink, RefreshCw, Ticket, Plus, Trash2, X, CheckCircle2, Landmark, Search, Link as LinkIcon, AlertCircle, Receipt
} from 'lucide-react'
import { PosLinksPanel } from './PosLinksPanel'
import { allowedPaymongoAccounts, canWritePaymongo } from '@/lib/paymongo-access'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import { BORDER, Card, FIELD, LABEL, LINE, Notice, Pill, ShimmerRows, StatusPill, Th, seg, statusLook } from './ui'

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
    <span className="inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
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
    return <span className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>{status === 'PAID' ? 'not reported' : '—'}</span>
  }
  const m = METHOD_STYLE[method.toUpperCase()] || { label: method, bg: '#f1f5f9', fg: '#475569' }
  return <Pill bg={m.bg} fg={m.fg}>{m.label}</Pill>
}

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayStr = () => new Date().toISOString().slice(0, 10)

interface Txn {
  id: string; checkoutId: string; referenceCode: string | null; itemName: string | null; description: string | null
  cartItems?: CartItem[] | null; shippingFee?: number | null
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
interface CartItem { title: string; variant: string | null; quantity: number; price: number }
interface LivePayment { paymentId: string; amount: number; fee: number; net: number; status: string; paidAt: string | null; description: string; payer: string; paymentMethod: string | null; belongsToAccount: string | null; cartItems: CartItem[] | null; shippingFee: number | null; voucherCode: string | null }
interface Item { id: string; name: string; price: number; sku?: string; stock?: number; department?: string }
interface Voucher {
  id: string; name: string; code: string; discountType: string; discountValue: number
  isLifetime: boolean; startDate: string | null; endDate: string | null; branches: string[]; departments: string[]
  usageLimitType: string; maxUses: number | null; accountId: string | null; accountLabel: string | null
  requiresPwdId: boolean
  isActive: boolean; uses: number
}
interface Coa { id: string; accountNumber: string; accountTitle: string }

// Quick filter on the Transactions table (client-side, display only).
type TxnFilter = 'ALL' | 'PAID' | 'PENDING' | 'CLOSED'
const TXN_FILTERS: [TxnFilter, string][] = [['ALL', 'All'], ['PAID', 'Paid'], ['PENDING', 'Pending'], ['CLOSED', 'Expired & failed']]
const inFilter = (t: Txn, f: TxnFilter) =>
  f === 'ALL' ? true : f === 'CLOSED' ? (t.status !== 'PAID' && t.status !== 'PENDING') : t.status === f

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
  // Display-only filters on the Transactions table (the cards double as quick filters).
  const [txnFilter, setTxnFilter] = useState<TxnFilter>('ALL')
  const [txnSearch, setTxnSearch] = useState('')
  // Start each branch tab unfiltered (adjust state while rendering, React's pattern for a prop change).
  const [filterFor, setFilterFor] = useState(account)
  if (filterFor !== account) { setFilterFor(account); setTxnFilter('ALL'); setTxnSearch('') }

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
  const [itemsPopup, setItemsPopup] = useState<Txn | null>(null)
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
        cartItems: lp.cartItems ?? null, shippingFee: lp.shippingFee ?? null,
        customerName: lp.payer || '', customerEmail: null, customerPhone: null,
        department: null, departmentLabel: null, kind: null,
        voucherCode: lp.voucherCode ?? null, grossAmount: null, discountAmount: null,
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

  // Card figures — straight sums over the same rows the table lists.
  const stats = useMemo(() => {
    const paid = rows.filter(r => r.status === 'PAID')
    const pending = rows.filter(r => r.status === 'PENDING')
    const closed = rows.filter(r => r.status !== 'PAID' && r.status !== 'PENDING')
    const settled = payouts.filter(p => p.settled)
    return {
      paidN: paid.length,
      paidAmt: paid.reduce((s, r) => s + r.amount, 0),
      paidNet: paid.reduce((s, r) => s + (r.netAmount ?? r.amount), 0),
      pendingN: pending.length,
      pendingAmt: pending.reduce((s, r) => s + r.amount, 0),
      closedN: closed.length,
      failedN: closed.filter(r => r.status === 'FAILED').length,
      settledN: settled.length,
      settledNet: settled.reduce((s, p) => s + p.net, 0),
    }
  }, [rows, payouts])

  const shownRows = useMemo(() => {
    const q = txnSearch.trim().toLowerCase()
    return rows.filter(t => inFilter(t, txnFilter) && (!q || [
      t.customerName, t.customerEmail, t.customerPhone, t.itemName, t.description, t.voucherCode, t.referenceCode, t.paymentId,
    ].some(v => v && v.toLowerCase().includes(q))))
  }, [rows, txnFilter, txnSearch])
  const toggleFilter = (f: TxnFilter) => setTxnFilter(cur => (cur === f ? 'ALL' : f))

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
  const { ghost: ghostBtn, primary: primaryBtn } = hrBtn
  const strays = rows.filter(r => r.belongsToAccount)

  return (
    <div className="space-y-4">
      {!configured && (
        <Notice tone="amber">
          No key configured for this account yet. Set <code className="font-mono">PAYMONGO_SECRET_KEY_{account}</code> in the server environment and restart the app.
        </Notice>
      )}
      {error && <Notice tone="red" icon={<AlertCircle size={15} />}>{error}</Notice>}

      {/* Money that landed in this account but was earned by another branch.
          Display only — it changes nothing in the ledger, it just stops the tab
          quietly implying the cash belongs here. */}
      {strays.length > 0 && (() => {
        const total = strays.reduce((sum, r) => sum + r.amount, 0)
        const net = strays.reduce((sum, r) => sum + (r.netAmount ?? r.amount), 0)
        const owed = [...new Set(strays.map(r => r.belongsToAccount))].join(', ')
        return (
          <Notice tone="amber" icon={<AlertCircle size={15} />}>
            <p className="font-semibold">
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
          </Notice>
        )
      })()}

      {/* Cards (the first three double as quick filters on the table) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={loading} compact label="Received" value={peso(stats.paidAmt)}
          sub={stats.paidN ? `${stats.paidN} paid · ${peso(stats.paidNet)} net of fees` : 'No paid payments yet'}
          tone={stats.paidN ? 'green' : 'zero'} active={txnFilter === 'PAID'}
          onClick={() => toggleFilter('PAID')} title="Show only the paid payments" />
        <StatCard loading={loading} label="Awaiting payment" value={stats.pendingN.toLocaleString()}
          sub={stats.pendingN ? `${peso(stats.pendingAmt)} not yet paid` : 'Nothing pending'}
          tone={stats.pendingN ? 'amber' : 'zero'} active={txnFilter === 'PENDING'}
          onClick={() => toggleFilter('PENDING')} title="Show only the links still waiting for the payer" />
        <StatCard loading={loading} label="Expired / failed" value={stats.closedN.toLocaleString()}
          sub={stats.closedN ? `${stats.failedN} failed · ${stats.closedN - stats.failedN} expired` : 'None'}
          tone={stats.failedN ? 'red' : 'zero'} active={txnFilter === 'CLOSED'}
          onClick={() => toggleFilter('CLOSED')} title="Show only the expired or failed payments" />
        <StatCard loading={loading} compact label="Paid out to bank" value={peso(stats.settledNet)}
          sub={payouts.length ? `${stats.settledN} of ${payouts.length} payout${payouts.length === 1 ? '' : 's'} in the bank` : 'No payouts yet'}
          tone={stats.settledNet ? 'green' : 'zero'} />
      </div>

      {/* ── Transactions ── */}
      <Card icon={<Receipt size={16} />} title="Transactions received"
        count={loading ? '' : `${shownRows.length.toLocaleString()}${shownRows.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''}`}
        sub={`Payments into the ${label} PayMongo account — from links made here, plus website and direct payments.`}
        actions={
          <button onClick={async () => { setSyncing(true); await load(true); setSyncing(false) }} disabled={syncing || !configured}
            className={ghostBtn} style={{ ...BORDER, color: 'var(--teal)' }}>
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync from PayMongo
          </button>
        }>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-y" style={{ background: '#fcfdfa', ...BORDER }}>
          <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-72 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
            style={{ ...BORDER, color: 'var(--hr-faint)' }}>
            <Search size={15} className="flex-shrink-0" />
            <input value={txnSearch} onChange={e => setTxnSearch(e.target.value)} placeholder="Search payer, item, voucher…"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
            {txnSearch && <button onClick={() => setTxnSearch('')} title="Clear search"><X size={14} /></button>}
          </label>
          <div className="flex max-w-full overflow-x-auto rounded-lg border" style={BORDER} role="group" aria-label="Status">
            {TXN_FILTERS.map(([v, l]) => (
              <button key={v} onClick={() => setTxnFilter(v)} aria-pressed={txnFilter === v}
                className="h-9 px-3 text-xs font-semibold whitespace-nowrap flex-shrink-0" style={seg(txnFilter === v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? <ShimmerRows /> : (
          <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead><tr>
              <Th>Date</Th><Th>Customer</Th><Th>Item</Th><Th>Voucher</Th>
              <Th right>Gross</Th><Th right>Disc.</Th><Th right>Charged</Th><Th right>Fee</Th><Th right>Net</Th>
              <Th>Paid via</Th><Th>Status</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {shownRows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                  {rows.length === 0 ? 'No transactions yet for this account.' : (
                    <>No transactions match. <button onClick={() => { setTxnFilter('ALL'); setTxnSearch('') }} className="font-semibold hover:underline underline-offset-2" style={{ color: 'var(--teal)' }}>Clear filters</button></>
                  )}
                </td></tr>
              ) : shownRows.map(t => (
                <tr key={t.id} className="hover:bg-[#fafcf6]">
                  <td className="px-3 py-2 whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)', boxShadow: `inset 4px 0 0 ${statusLook(t.status).edge}` }}>{new Date(t.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-3 py-2 border-b" style={{ ...LINE, color: 'var(--charcoal)' }}>
                    {/* Populated from the payer's own entries on the PayMongo page once paid. */}
                    {t.customerName || <span style={{ color: 'var(--hr-faint)' }}>{t.status === 'PENDING' ? 'awaiting payer' : '—'}</span>}
                    {(t.customerEmail || t.customerPhone) && (
                      <span className="block text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>
                        {[t.customerEmail, t.customerPhone].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b" style={LINE}>
                    {t.cartItems?.length
                      ? <button onClick={() => setItemsPopup(t)} className="text-left font-semibold underline decoration-dotted underline-offset-2 cursor-pointer" style={{ color: 'var(--teal)' }} title="Show the items in this purchase">{t.itemName || t.description || '—'}</button>
                      : <span style={{ color: 'var(--charcoal)' }}>{t.itemName || t.description || '—'}</span>}
                    {/* Paid straight to the PayMongo account — a storefront sale or a
                        payment taken outside any link created here. */}
                    {t.external && <Pill bg="#ede9fe" fg="#5b21b6" className="ml-1">Website / direct</Pill>}
                    {t.belongsToAccount && (
                      <Pill bg="#fef3c7" fg="#92400e" className="ml-1" title={`Earned by ${t.belongsToAccount} but settled into this account`}>
                        ⚠ {t.belongsToAccount}&apos;s money
                      </Pill>
                    )}
                    {(t.departmentLabel || t.kind === 'PRODUCT') && (
                      <span className="flex flex-wrap gap-1 mt-1">
                        {t.department && <DeptBadge dept={t.department} />}
                        {t.kind === 'PRODUCT' && <Pill bg="var(--pale-teal)" fg="var(--deep-teal)">Product</Pill>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{t.voucherCode || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{t.grossAmount != null ? peso(t.grossAmount) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: (t.discountAmount || 0) > 0 ? '#c44b00' : 'var(--hr-faint)' }}>{(t.discountAmount || 0) > 0 ? peso(t.discountAmount!) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--charcoal)' }}>{peso(t.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{t.fee != null ? peso(t.fee) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--deep-teal)' }}>{t.netAmount != null ? peso(t.netAmount) : '—'}</td>
                  <td className="px-3 py-2 border-b" style={LINE}><MethodBadge method={t.paymentMethodUsed} status={t.status} /></td>
                  <td className="px-3 py-2 border-b" style={LINE}><StatusPill s={t.status} />{t.payoutId && <span className="block text-[10.5px] mt-0.5" style={{ color: '#166534' }}>settled</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap border-b" style={LINE}>
                    {t.checkoutUrl && t.status === 'PENDING' && <a href={t.checkoutUrl} target="_blank" rel="noreferrer" className="mr-2" title="Open link"><ExternalLink size={13} style={{ color: 'var(--teal)' }} className="inline" /></a>}
                    {/* A link the payer abandoned can sit PENDING forever, so it must be
                        removable. A settled payment never is — the money is real. */}
                    {canWrite && t.status !== 'PAID' && !t.external && (
                      <button onClick={() => del(t)} title="Expire this link at PayMongo and remove the row"
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border"
                        style={{ borderColor: '#fecaca', color: '#b91c1c', background: '#fef2f2' }}>
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                    {t.status === 'PAID' && (
                      <span className="text-[10.5px]" style={{ color: 'var(--hr-faint)' }} title="A settled payment cannot be deleted">paid — locked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </Card>

      {/* ── Payouts ── */}
      <Card icon={<Landmark size={16} />} title="Payouts to bank" count={payouts.length ? payouts.length.toLocaleString() : ''}
        sub={`What PayMongo sent from the ${label} account to the bank — for bank reconciliation.`}>
        <div className="overflow-x-auto border-t" style={BORDER}>
          <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead><tr>
              <Th>Payout ID</Th><Th>Date</Th><Th right>Net to bank</Th><Th right>Fee</Th><Th>Settled?</Th>
            </tr></thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-[13px]" style={{ color: 'var(--mid-gray)' }}>{configured ? 'No payouts reported by PayMongo for this account yet.' : 'Configure this account to see payouts.'}</td></tr>
              ) : payouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-[#fafcf6]">
                  <td className="px-3 py-2 font-mono text-[11px] border-b" style={{ ...LINE, color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${p.settled ? '#059669' : '#d97706'}` }}>{p.payoutId}</td>
                  <td className="px-3 py-2 whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-PH') : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--deep-teal)' }}>{peso(p.net)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{peso(p.fee)}</td>
                  <td className="px-3 py-2 border-b" style={LINE}>
                    {p.settled
                      ? <Pill bg="#dcfce7" fg="#166534"><CheckCircle2 size={11} className="inline -mt-px mr-1" />In bank</Pill>
                      : <Pill bg="#fef3c7" fg="#92400e">{p.status || 'pending'}</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Generate a payment link (writers only; front desk is view-only) ── */}
      {canWrite && (
      <Card icon={<CreditCard size={16} />} title="Generate a payment link"
        sub="One link per service or product, reused for every patient. Each payer opens it, enters their own name, number and email, then pays — and shows up in Transactions received.">
        <div className="px-4 pb-4 pt-3 border-t" style={BORDER}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Pay for</label>
            <select value={kind} onChange={e => setKind(e.target.value as 'SERVICE' | 'PRODUCT')} className={FIELD} style={BORDER}>
              <option value="SERVICE">Service</option>
              <option value="PRODUCT">Product</option>
            </select>
          </div>
          <div className="md:col-span-2 relative">
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>{kind === 'SERVICE' ? 'Service' : 'Product'}</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--hr-faint)' }} />
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
                className={`${FIELD} pl-8 pr-24`} style={{ borderColor: itemId ? 'var(--teal)' : 'var(--light-gray)' }} />
              {itemId && chosen && (
                <span className="absolute right-2.5 top-2.5 text-[11px] font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(chosen.price)}</span>
              )}
              {itemQuery && !itemId && (
                <button type="button" onClick={() => { setItemQuery(''); setItemOpen(false) }} className="absolute right-2.5 top-2.5" title="Clear">
                  <X size={14} style={{ color: 'var(--mid-gray)' }} />
                </button>
              )}
            </div>
            {itemOpen && (
              <div className="absolute z-[70] left-0 right-0 mt-1 rounded-lg border bg-white shadow-[0_8px_24px_rgba(35,48,56,0.12)] overflow-auto"
                style={{ maxHeight: 260, ...BORDER }}>
                {list.length === 0 ? (
                  <div className="px-3 py-2.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>No {kind === 'SERVICE' ? 'services' : 'products'} available for this branch.</div>
                ) : matches.length === 0 ? (
                  <div className="px-3 py-2.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>No match for “{itemQuery}”.</div>
                ) : matches.map(i => (
                  <button key={i.id} type="button" onMouseDown={e => { e.preventDefault(); pickItem(i) }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={LINE}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{i.name}</span>
                      <span className="text-xs font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{peso(i.price)}</span>
                    </div>
                    {(i.sku || i.stock != null || i.department) && (
                      <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {[i.sku, i.department, i.stock != null ? `stock ${i.stock}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Qty</label>
            <input type="number" min={1} value={qty} onChange={e => { setQty(e.target.value) }} className={FIELD} style={BORDER} />
          </div>
          <div className="md:col-span-2 flex items-end">
            <div className="w-full rounded-lg border px-3 py-2" style={{ ...BORDER, background: 'var(--pale-teal)', borderLeft: '4px solid var(--teal)' }}>
              <span className="text-[11px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Payer will be charged</span>
              <div className="font-mono font-bold text-lg leading-tight" style={{ color: 'var(--deep-teal)' }}>{peso(gross)}</div>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Apply a voucher to this link (optional)</label>
            <input value={linkCode} onChange={e => setLinkCode(e.target.value.toUpperCase())}
              className={`${FIELD} font-mono`} style={BORDER} placeholder="e.g. SUMMER10" />
            <label className="flex items-center gap-2 text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
              <input type="checkbox" checked={allowVoucher} onChange={e => setAllowVoucher(e.target.checked)} disabled={!!linkCode.trim()} style={{ accentColor: 'var(--teal)' }} />
              {linkCode.trim() ? 'A voucher is applied to the link, so payers won’t be asked for a code' : 'Otherwise, let each payer enter their own code'}
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button onClick={generate} disabled={busy || !canSubmit || !configured} className={primaryBtn} style={{ background: 'var(--teal)' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Create payment link
          </button>
        </div>
        </div>
      </Card>
      )}

      {/* ── Reusable payment links ── */}
      <Card icon={<LinkIcon size={16} />} title="Created payment links" count={links.length ? links.length.toLocaleString() : ''}
        sub="Reuse each link for any number of patients.">
        <div className="overflow-x-auto border-t" style={BORDER}>
          <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead><tr>
              <Th>Date created</Th><Th>Item</Th><Th>Voucher</Th><Th right>Gross</Th><Th right>Disc.</Th><Th right>Charged</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {links.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-[13px]" style={{ color: 'var(--mid-gray)' }}>{canWrite ? 'No payment links yet — create one above.' : 'No payment links yet.'}</td></tr>
              ) : links.map(l => {
                const url = `${origin}/pay/${l.token}`
                return (
                  <tr key={l.id} className="hover:bg-[#fafcf6]">
                    <td className="px-3 py-2 whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)', boxShadow: `inset 4px 0 0 ${l.isActive ? 'var(--teal)' : 'var(--light-gray)'}` }}>{new Date(l.createdAt).toLocaleDateString('en-PH')}</td>
                    <td className="px-3 py-2 border-b" style={LINE}>
                      <span style={{ color: l.isActive ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{l.itemName}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</span>
                      {(l.department || l.kind === 'PRODUCT' || !l.isActive || l.paidCount > 0) && (
                        <span className="flex flex-wrap items-center gap-1 mt-1">
                          {l.department && <DeptBadge dept={l.department} />}
                          {l.kind === 'PRODUCT' && <Pill bg="var(--pale-teal)" fg="var(--deep-teal)">Product</Pill>}
                          {!l.isActive && <Pill bg="#f1f5f2" fg="var(--mid-gray)">Disabled</Pill>}
                          {l.paidCount > 0 && <span className="text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>{l.paidCount} paid</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>
                      {l.voucherCode || (l.allowVoucher ? <span className="font-sans">payer may enter</span> : '—')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{peso(l.gross)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: l.discount > 0 ? '#c44b00' : 'var(--hr-faint)' }}>{l.discount > 0 ? peso(l.discount) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--deep-teal)' }}>{peso(l.charged)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-b" style={LINE}>
                      <button onClick={() => { navigator.clipboard?.writeText(url); setCopiedToken(l.token) }}
                        className="text-[11px] font-semibold mr-2 hover:underline underline-offset-2" style={{ color: copiedToken === l.token ? '#166534' : 'var(--teal)' }}>
                        {copiedToken === l.token ? 'Copied' : 'Copy link'}
                      </button>
                      <a href={url} target="_blank" rel="noreferrer" className="mr-2" title="Open payer page"><ExternalLink size={13} style={{ color: 'var(--teal)' }} className="inline" /></a>
                      {/* Front desk can hand the link out, but not change or remove it. */}
                      {canWrite && <button onClick={() => toggleLink(l)} className="text-[11px] font-semibold mr-2 hover:underline underline-offset-2" style={{ color: 'var(--mid-gray)' }}>{l.isActive ? 'Disable' : 'Enable'}</button>}
                      {canWrite && l.paidCount === 0 && <button onClick={() => delLink(l)} title="Delete"><Trash2 size={13} className="text-red-500 inline" /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Purchased-items popup (storefront cart detail) ── */}
      {itemsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(35,48,56,0.45)' }} onClick={() => setItemsPopup(null)}>
          <div className="rounded-xl border w-full max-w-lg max-h-[80vh] overflow-y-auto bg-white shadow-[0_12px_40px_rgba(35,48,56,0.18)]" style={BORDER} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b" style={BORDER}>
              <div className="min-w-0">
                <p className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{itemsPopup.itemName || 'Purchase'}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{itemsPopup.customerName || '—'}{itemsPopup.paymentId ? ` · ${itemsPopup.paymentId}` : ''}</p>
              </div>
              <button onClick={() => setItemsPopup(null)} className="p-1 rounded-md hover:bg-[var(--pale-teal)]" title="Close"><X size={16} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr><Th className="pl-5">Item</Th><Th right>Qty</Th><Th right>Price</Th><Th right className="pr-5">Total</Th></tr>
              </thead>
              <tbody>
                {(itemsPopup.cartItems || []).map((c, i) => (
                  <tr key={i}>
                    <td className="pl-5 pr-3 py-2 border-b" style={{ ...LINE, color: 'var(--charcoal)' }}>{c.title}{c.variant ? <span style={{ color: 'var(--mid-gray)' }}> — {c.variant}</span> : null}</td>
                    <td className="text-right px-3 py-2 tabular-nums border-b" style={LINE}>{c.quantity}</td>
                    <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap border-b" style={LINE}>{peso(c.price)}</td>
                    <td className="text-right pl-3 pr-5 py-2 tabular-nums whitespace-nowrap border-b" style={LINE}>{peso(c.price * c.quantity)}</td>
                  </tr>
                ))}
                {itemsPopup.shippingFee != null && itemsPopup.shippingFee > 0 && (
                  <tr>
                    <td className="pl-5 pr-3 py-2 border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>Delivery</td>
                    <td className="text-right px-3 py-2 border-b" style={LINE}>—</td>
                    <td className="text-right px-3 py-2 border-b" style={LINE}>—</td>
                    <td className="text-right pl-3 pr-5 py-2 tabular-nums whitespace-nowrap border-b" style={LINE}>{peso(itemsPopup.shippingFee)}</td>
                  </tr>
                )}
                {itemsPopup.voucherCode && (
                  <tr>
                    <td className="pl-5 pr-3 py-2 border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>Voucher</td>
                    <td className="text-right pl-3 pr-5 py-2 font-mono border-b" style={LINE} colSpan={3}>{itemsPopup.voucherCode}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--hr-head)' }}>
                  <td className="pl-5 pr-3 py-2.5 font-bold" style={{ color: 'var(--charcoal)' }}>Charged</td>
                  <td colSpan={3} className="text-right pl-3 pr-5 py-2.5 font-bold tabular-nums" style={{ color: 'var(--deep-teal)' }}>{peso(itemsPopup.amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════ Voucher Discounts ══════════════════ */
const VOUCHER_DEPTS = [
  { code: 'PT', label: 'PT' }, { code: 'MD', label: 'MD' }, { code: 'OT', label: 'OT' },
  { code: 'SLP', label: 'SLP' }, { code: 'SPED', label: 'SPED' }, { code: 'PSYCHOLOGY', label: 'Psychology' },
  { code: 'ORTHOSIS_PROSTHESIS', label: 'Orthosis & Prosthesis' },
]

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
    branches: [] as string[], departments: [] as string[], usageLimitType: 'UNLIMITED', maxUses: '', accountId: '', isActive: true,
    requiresPwdId: false,
  })
  const [saving, setSaving] = useState(false)
  // Display-only: the Active / Inactive cards filter the table.
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

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
    setF({ name: '', code: '', discountType: 'PERCENTAGE', discountValue: '', isLifetime: false, startDate: todayStr(), endDate: todayStr(), branches: [], departments: [], usageLimitType: 'UNLIMITED', maxUses: '', accountId: '', isActive: true, requiresPwdId: false })
    setOpen(true); setError('')
  }
  const openEdit = (v: Voucher) => {
    setEditId(v.id)
    setF({
      name: v.name, code: v.code, discountType: v.discountType, discountValue: String(v.discountValue),
      isLifetime: v.isLifetime, startDate: v.startDate || todayStr(), endDate: v.endDate || todayStr(),
      branches: v.branches || [], departments: v.departments || [], usageLimitType: v.usageLimitType, maxUses: v.maxUses ? String(v.maxUses) : '',
      accountId: v.accountId || '', isActive: v.isActive, requiresPwdId: !!v.requiresPwdId,
    })
    setOpen(true); setError('')
  }
  const toggleBranch = (c: string) => setF(p => ({ ...p, branches: p.branches.includes(c) ? p.branches.filter(x => x !== c) : [...p.branches, c] }))
  const toggleDept = (c: string) => setF(p => ({ ...p, departments: p.departments.includes(c) ? p.departments.filter(x => x !== c) : [...p.departments, c] }))

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
  const nActive = rows.filter(v => v.isActive).length
  const nInactive = rows.length - nActive
  const totalUses = rows.reduce((s, v) => s + (v.uses || 0), 0)
  const shown = rows.filter(v => activeFilter === 'all' || (activeFilter === 'active') === v.isActive)
  const { primary: primaryBtn, outline: outlineBtn } = hrBtn
  const chk = { accentColor: 'var(--teal)' }

  return (
    <div className="space-y-4">
      {error && !open && <Notice tone="red" icon={<AlertCircle size={15} />}>{error}</Notice>}

      {/* Cards (Active / Inactive double as quick filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard loading={loading} label="Active vouchers" value={nActive.toLocaleString()} sub={`of ${rows.length.toLocaleString()} voucher${rows.length === 1 ? '' : 's'}`}
          accent={{ line: 'var(--teal)' }} active={activeFilter === 'active'}
          onClick={() => setActiveFilter(f => (f === 'active' ? 'all' : 'active'))} title="Show only the active vouchers" />
        <StatCard loading={loading} label="Inactive" value={nInactive.toLocaleString()} sub="Switched off — payers can't use them"
          tone="zero" active={activeFilter === 'inactive'}
          onClick={() => setActiveFilter(f => (f === 'inactive' ? 'all' : 'inactive'))} title="Show only the inactive vouchers" />
        <StatCard loading={loading} label="Times used" value={totalUses.toLocaleString()} sub="Redemptions across all vouchers"
          tone={totalUses ? 'blue' : 'zero'} />
      </div>

      <Card icon={<Ticket size={16} />} title="Voucher discounts"
        count={loading ? '' : `${shown.length.toLocaleString()}${shown.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''}`}
        sub={canWrite
          ? 'Promo codes customers can enter on a generated payment link. A voucher only works at the branches you tick.'
          : 'View-only: the promo codes a patient can enter on a payment link, and where each one is valid.'}
        actions={canWrite && <button onClick={openNew} className={primaryBtn} style={{ background: 'var(--teal)' }}><Plus size={15} /> New voucher</button>}>
      <div className="overflow-x-auto border-t" style={BORDER}>
        {loading ? <ShimmerRows n={3} /> : (
        <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead><tr>
            <Th>Name</Th><Th>Code</Th><Th right>Discount</Th><Th>Effectivity</Th><Th>Branches</Th><Th>Limit</Th><Th right>Used</Th><Th>Account</Th><Th>Active</Th>
            {canWrite && <Th right>Actions</Th>}
          </tr></thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={canWrite ? 10 : 9} className="text-center py-10 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                {rows.length === 0 ? 'No vouchers yet.' : (
                  <>No vouchers match. <button onClick={() => setActiveFilter('all')} className="font-semibold hover:underline underline-offset-2" style={{ color: 'var(--teal)' }}>Show all</button></>
                )}
              </td></tr>
            ) : shown.map(v => (
              <tr key={v.id} className="hover:bg-[#fafcf6]">
                <td className="px-3 py-2 font-semibold border-b" style={{ ...LINE, color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${v.isActive ? 'var(--teal)' : 'var(--light-gray)'}` }}>{v.name}</td>
                <td className="px-3 py-2 font-mono border-b" style={{ ...LINE, color: 'var(--deep-teal)' }}>
                  {v.code}
                  {v.requiresPwdId && (
                    <span className="block mt-1 w-fit font-sans">
                      <Pill bg="#e0f2fe" fg="#075985" title="Only works for a payer with a PWD/Senior ID number AND ID photo in Patient CRM">PWD / Senior ID required</Pill>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--charcoal)' }}>{v.discountType === 'FIXED' ? peso(v.discountValue) : `${v.discountValue}%`}</td>
                <td className="px-3 py-2 whitespace-nowrap border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{v.isLifetime ? <Pill bg="var(--pale-teal)" fg="var(--deep-teal)">Lifetime</Pill> : `${v.startDate} → ${v.endDate}`}</td>
                <td className="px-3 py-2 border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{v.branches.length ? v.branches.join(', ') : 'All'}{v.departments.length > 0 && <span className="block text-[10.5px]" style={{ color: 'var(--teal)' }}>{v.departments.map(c => VOUCHER_DEPTS.find(d => d.code === c)?.label || c).join(', ')} only</span>}</td>
                <td className="px-3 py-2 border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{LIMIT_LABEL[v.usageLimitType] || v.usageLimitType}{v.usageLimitType === 'MAX_USES' && v.maxUses ? ` (${v.maxUses})` : ''}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold border-b" style={{ ...LINE, color: 'var(--charcoal)' }}>{v.uses}</td>
                <td className="px-3 py-2 text-[11px] border-b" style={{ ...LINE, color: 'var(--mid-gray)' }}>{v.accountLabel || '—'}</td>
                <td className="px-3 py-2 border-b" style={LINE}>{v.isActive ? <Pill bg="#dcfce7" fg="#166534">Active</Pill> : <Pill bg="#f1f5f2" fg="var(--mid-gray)">Inactive</Pill>}</td>
                {canWrite && (
                  <td className="px-3 py-2 text-right whitespace-nowrap border-b" style={LINE}>
                    <button onClick={() => openEdit(v)} className="text-[11px] font-semibold mr-2 hover:underline underline-offset-2" style={{ color: 'var(--teal)' }}>Edit</button>
                    <button onClick={() => del(v)} title="Delete"><Trash2 size={13} className="text-red-500 inline" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(35,48,56,0.45)' }}>
          <div className="bg-white rounded-xl border shadow-[0_12px_40px_rgba(35,48,56,0.18)] w-full max-w-lg max-h-[90vh] overflow-y-auto" style={BORDER}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b" style={BORDER}>
              <h2 className="text-[17px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{editId ? 'Edit voucher' : 'New voucher'}</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-[var(--pale-teal)]" title="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <div className="px-5 py-4">
            {error && <div className="mb-3"><Notice tone="red" icon={<AlertCircle size={15} />}>{error}</Notice></div>}
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Voucher name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={FIELD} style={BORDER} placeholder="e.g. Summer Promo" /></div>
                <div><label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Voucher code</label><input value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} className={`${FIELD} font-mono`} style={BORDER} placeholder="SUMMER10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Discount type</label>
                  <select value={f.discountType} onChange={e => setF({ ...f, discountType: e.target.value })} className={FIELD} style={BORDER}>
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed amount (₱)</option>
                  </select>
                </div>
                <div><label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Value</label><input type="number" value={f.discountValue} onChange={e => setF({ ...f, discountValue: e.target.value })} className={FIELD} style={BORDER} placeholder={f.discountType === 'FIXED' ? '200' : '10'} /></div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-[13px] font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" checked={f.isLifetime} onChange={e => setF({ ...f, isLifetime: e.target.checked })} style={chk} /> Lifetime (never expires)
                </label>
                {!f.isLifetime && (
                  <div className="grid grid-cols-2 gap-3 mt-1.5">
                    <div><label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Effective from</label><input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} className={FIELD} style={BORDER} /></div>
                    <div><label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Effective to</label><input type="date" value={f.endDate} onChange={e => setF({ ...f, endDate: e.target.value })} className={FIELD} style={BORDER} /></div>
                  </div>
                )}
              </div>

              <div>
                <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Valid at branches (tick one or more)</label>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                  {ACCOUNTS.map(a => (
                    <label key={a.code} className="flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
                      <input type="checkbox" checked={f.branches.includes(a.code)} onChange={() => toggleBranch(a.code)} style={chk} /> {a.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Applies to departments</label>
                <p className="text-[11px] -mt-0.5 mb-1.5" style={{ color: 'var(--mid-gray)' }}>None ticked = everything; ticked = only services under those departments are covered.</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                  {VOUCHER_DEPTS.map(d => (
                    <label key={d.code} className="flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
                      <input type="checkbox" checked={f.departments.includes(d.code)} onChange={() => toggleDept(d.code)} style={chk} /> {d.label}
                    </label>
                  ))}
                </div>
                {f.departments.length > 0 && <p className="text-[10.5px] mt-1" style={{ color: 'var(--mid-gray)' }}>Products and services outside {f.departments.map(c => VOUCHER_DEPTS.find(d => d.code === c)?.label || c).join(', ')} will be refused this voucher.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Usage limit</label>
                  <select value={f.usageLimitType} onChange={e => setF({ ...f, usageLimitType: e.target.value })} className={FIELD} style={BORDER}>
                    <option value="UNLIMITED">Unlimited</option>
                    <option value="ONCE_PER_CUSTOMER">Once per customer (by email)</option>
                    <option value="MAX_USES">Max number of uses</option>
                  </select>
                </div>
                {f.usageLimitType === 'MAX_USES' && (
                  <div><label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Max uses</label><input type="number" min={1} value={f.maxUses} onChange={e => setF({ ...f, maxUses: e.target.value })} className={FIELD} style={BORDER} /></div>
                )}
              </div>

              <div>
                <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Discount account (Chart of Accounts)</label>
                <select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })} className={FIELD} style={BORDER}>
                  <option value="">Select an account…</option>
                  {coa.map(a => <option key={a.id} value={a.id}>{a.accountNumber} · {a.accountTitle}</option>)}
                </select>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>Contra-revenue accounts (DEBIT balance, e.g. 7210 Other Discounts) show the promo as a deduction in the Income Statement.</p>
              </div>

              <div className="rounded-lg border p-3" style={{ ...BORDER, background: 'var(--pale-teal)', borderLeft: '4px solid var(--teal)' }}>
                <label className="flex items-start gap-2 text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" className="mt-0.5" checked={f.requiresPwdId} onChange={e => setF({ ...f, requiresPwdId: e.target.checked })} style={chk} />
                  <span>Requires a registered PWD / Senior ID</span>
                </label>
                <p className="mt-1 text-[11px] pl-6" style={{ color: 'var(--mid-gray)' }}>
                  The code is refused unless Patient CRM (Operations Hub) holds <strong>both</strong> a PWD/Senior ID
                  number <strong>and</strong> an uploaded ID photo for the payer. Matched on the name, mobile number
                  or email they enter at checkout.
                </p>
              </div>

              <label className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={f.isActive} onChange={e => setF({ ...f, isActive: e.target.checked })} style={chk} /> Active
              </label>
            </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ ...BORDER, background: '#fcfdfa' }}>
              <button onClick={() => setOpen(false)} className={outlineBtn} style={{ ...BORDER, color: 'var(--charcoal)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className={primaryBtn} style={{ background: 'var(--teal)' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save voucher'}
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
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <CreditCard size={22} style={{ color: 'var(--teal)' }} /> PayMongo
        </h1>
        <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
          {canWrite
            ? 'Each branch has its own PayMongo account — pick one to make payment links and see its payments and bank payouts.'
            : 'View-only: your branch’s payment links, the payments received on them, and its bank payouts.'}
        </p>
      </div>

      {/* Tabs: one row, swipes sideways on narrow screens */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-end -mb-[2px] max-w-full overflow-x-auto" role="tablist">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} role="tab" aria-selected={activeTab === t.key}
              className="px-3.5 py-2.5 border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors hover:text-[var(--teal)] flex items-center gap-1.5"
              style={{ fontFamily: 'var(--font-display)', borderColor: activeTab === t.key ? 'var(--teal)' : 'transparent', color: activeTab === t.key ? 'var(--teal)' : 'var(--mid-gray)' }}>
              {t.key === 'VOUCHERS' && <Ticket size={14} />}{t.key === 'POS' && <LinkIcon size={14} />}{t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'VOUCHERS' ? <VouchersPanel canWrite={VOUCHER_WRITE.includes(role as string)} />
        : activeTab === 'POS' ? <PosLinksPanel />
        : <BranchPanel account={activeTab} label={ACCOUNTS.find(a => a.code === activeTab)!.label} canWrite={canWrite} />}
    </div>
  )
}
