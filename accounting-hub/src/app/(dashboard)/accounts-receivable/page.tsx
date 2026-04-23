'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import {
  FileCheck, Search, ChevronUp, ChevronDown, ArrowUpDown,
  X, AlertCircle, DollarSign, Calendar, Building2, Upload, Trash2, Pencil,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ARWallet {
  id: string
  patientName: string
  balance: number | string
  // Only returned for GL wallets — the approved amount on the Guarantee Letter.
  totalGlAmount?: number | string | null
  // Also returned: consumption-based outstanding (sum of unpaid orders), kept so
  // the UI can show both 'approved AR' and 'consumed so far' side by side if needed.
  consumedOutstanding?: number
  accountId?: string | null
  account?: { accountNumber: string; accountTitle: string } | null
}

interface AROrder {
  id: string
  orderNumber: number
  transactionDate: string
  patientName: string
  clinicianName: string
  branch: string
  netAmount: number | string
  arProofUrl?: string | null
  items: { name: string }[]
  payments: { amount: number | string; walletId?: string }[]
  arPaymentItems: { paymentId: string }[]
}

interface ARPaymentRecord {
  id: string
  walletId: string
  paymentDate: string
  amount: number | string
  discount: number | string
  proofUrl?: string | null
  notes?: string | null
  branch?: string | null
  cashAccountId?: string | null
  cashAccount?: { accountNumber: string; accountTitle: string } | null
  createdBy: { name: string }
  items: { orderId: string }[]
}

const BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'SBEA', label: 'Sandbox East' },
  { value: 'SBGH', label: 'Sandbox Greenhills' },
]

const toNum = (v: unknown) => Number(v) || 0

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Per-transaction proof upload cell. Accepts PDF or image. Stores to uploads
// via /api/upload, persists the URL via PATCH /api/accounts-receivable/proof.
function ProofCell({ orderId, currentUrl, onChange }: {
  orderId: string; currentUrl: string | null; onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const ud = await up.json()
      if (!up.ok || !ud.url) throw new Error(ud.error || 'Upload failed')
      const r = await fetch('/api/accounts-receivable/proof', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, arProofUrl: ud.url }),
      })
      if (!r.ok) throw new Error('Save failed')
      onChange(ud.url)
    } catch (e) {
      alert((e as Error).message || 'Failed to attach proof')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const clear = async () => {
    if (!confirm('Remove the attached proof?')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/accounts-receivable/proof?orderId=${orderId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Failed to clear')
      onChange(null)
    } catch (e) {
      alert((e as Error).message || 'Failed to clear proof')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      {currentUrl ? (
        <>
          <a href={currentUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs"
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
            <FileCheck size={12} /> View
          </a>
          <button onClick={clear} disabled={busy} className="p-1 rounded hover:bg-red-50 disabled:opacity-50" title="Remove proof">
            <X size={12} className="text-red-400" />
          </button>
        </>
      ) : (
        <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border cursor-pointer text-xs"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', opacity: busy ? 0.5 : 1 }}>
          <Upload size={12} />
          {busy ? 'Uploading…' : 'Upload'}
          <input ref={inputRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) await upload(f)
            }} />
        </label>
      )}
    </div>
  )
}

export default function AccountsReceivablePage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const initialType = searchParams.get('type') === 'GL' ? 'GL' : 'HMO'
  const initialWallet = searchParams.get('wallet') || ''

  const [tab, setTab] = useState<'HMO' | 'GL'>(initialType as 'HMO' | 'GL')
  const [branch, setBranch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [walletFilter, setWalletFilter] = useState(initialWallet)
  const [sortField, setSortField] = useState('transactionDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [wallets, setWallets] = useState<ARWallet[]>([])
  const [orders, setOrders] = useState<AROrder[]>([])
  const [arPayments, setArPayments] = useState<ARPaymentRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Aging dashboard state
  type AgingBucket = 'b0_30' | 'b31_60' | 'b61_90' | 'b90plus'
  interface AgingRow {
    walletId: string; walletName: string; ar: number; revenue: number; arDays: number;
    aging: { b0_30: number; b31_60: number; b61_90: number; b90plus: number };
    orderIdsByBucket: Record<AgingBucket, string[]>;
  }
  const [agingData, setAgingData] = useState<{
    periodDays: number; totalAR: number; totalRevenue: number; arDaysOverall: number; perWallet: AgingRow[];
  } | null>(null)
  const [agingPeriodDays, setAgingPeriodDays] = useState(90)
  // When user clicks a cell, filter the orders table to that bucket's ids
  const [bucketFilterIds, setBucketFilterIds] = useState<string[] | null>(null)
  const [bucketFilterLabel, setBucketFilterLabel] = useState('')

  // Record Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payWalletId, setPayWalletId] = useState('')
  const [payWalletIds, setPayWalletIds] = useState<string[]>([])
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payAmount, setPayAmount] = useState('')
  const [payDiscount, setPayDiscount] = useState('')
  const [payDiscountAccountId, setPayDiscountAccountId] = useState('')
  const [payDiscountSearch, setPayDiscountSearch] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payProofUrl, setPayProofUrl] = useState('')
  const [payProofUploading, setPayProofUploading] = useState(false)
  const [paySelectedOrders, setPaySelectedOrders] = useState<string[]>([])
  const [payError, setPayError] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [discountAccounts, setDiscountAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [cashAccounts, setCashAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [payCashAccountId, setPayCashAccountId] = useState('')
  const [payCashAccountSearch, setPayCashAccountSearch] = useState('')
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: tab, sortField, sortDir })
      if (branch) params.set('branch', branch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (walletFilter) params.set('walletId', walletFilter)
      const res = await fetch(`/api/accounts-receivable?${params}`)
      const data = await res.json()
      setWallets(data.wallets || [])
      setOrders(data.orders || [])
      setArPayments(data.arPayments || [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [tab, branch, dateFrom, dateTo, walletFilter, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch aging dashboard data whenever tab / branch / period changes
  useEffect(() => {
    const ctl = new AbortController()
    const load = async () => {
      try {
        const p = new URLSearchParams({ type: tab, periodDays: String(agingPeriodDays) })
        if (branch) p.set('branch', branch)
        const r = await fetch(`/api/accounts-receivable/aging?${p}`, { signal: ctl.signal })
        if (!r.ok) return
        const d = await r.json()
        setAgingData(d)
      } catch { /* ignore abort / network */ }
    }
    load()
    return () => ctl.abort()
  }, [tab, branch, agingPeriodDays])

  // Fetch discount COA accounts (REVENUE with DEBIT balance)
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500')
      .then(r => r.json())
      .then(d => setDiscountAccounts(
        (d.data || [])
          .filter((a: { normalBalance: string }) => a.normalBalance === 'DEBIT')
          .map((a: { id: string; accountNumber: string; accountTitle: string }) => ({
            id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle,
          }))
      ))
      .catch(() => {})
  }, [])

  // Fetch ASSET-type accounts for cash/bank account selection (Debit Account)
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=ASSET&pageSize=500')
      .then(r => r.json())
      .then(d => setCashAccounts(
        (d.data || [])
          .map((a: { id: string; accountNumber: string; accountTitle: string }) => ({
            id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle,
          }))
      ))
      .catch(() => {})
  }, [])

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const totalReceivable = wallets.reduce((s, w) => s + toNum(w.balance), 0)
  const unpaidOrders = orders.filter(o => o.arPaymentItems.length === 0)

  const openPaymentModal = () => {
    setEditingPaymentId(null)
    setPayWalletId(walletFilter || '')
    setPayWalletIds(walletFilter ? [walletFilter] : [])
    setPayDate(new Date().toISOString().split('T')[0])
    setPayAmount('')
    setPayDiscount('')
    setPayDiscountAccountId('')
    setPayDiscountSearch('')
    setPayCashAccountId('')
    setPayCashAccountSearch('')
    setPayNotes('')
    setPayProofUrl('')
    setPaySelectedOrders([])
    setPayError('')
    setShowPaymentModal(true)
  }

  const openEditPaymentModal = (p: ARPaymentRecord) => {
    setEditingPaymentId(p.id)
    setPayWalletId(p.walletId)
    setPayWalletIds([p.walletId])
    setPayDate(new Date(p.paymentDate).toISOString().split('T')[0])
    setPayAmount(String(toNum(p.amount)))
    setPayDiscount(toNum(p.discount) > 0 ? String(toNum(p.discount)) : '')
    setPayDiscountAccountId('')
    setPayDiscountSearch('')
    setPayCashAccountId(p.cashAccountId || '')
    setPayCashAccountSearch(p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '')
    setPayNotes(p.notes || '')
    setPayProofUrl(p.proofUrl || '')
    setPaySelectedOrders(p.items.map(i => i.orderId))
    setPayError('')
    setShowPaymentModal(true)
  }

  const savePayment = async () => {
    // For GL multi-select, use payWalletIds; for HMO use payWalletId
    const effectiveWalletIds = tab === 'GL' && !editingPaymentId ? payWalletIds : (payWalletId ? [payWalletId] : [])
    if (effectiveWalletIds.length === 0) { setPayError('Select an HMO/Agency'); return }
    if (!payAmount || toNum(payAmount) <= 0) { setPayError('Amount is required'); return }
    setPaySaving(true)
    setPayError('')
    try {
      const isEdit = !!editingPaymentId
      // For GL multi-select (new payment), create one payment per wallet splitting evenly, or single bulk
      const res = await fetch('/api/accounts-receivable/payments', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editingPaymentId } : {}),
          walletId: effectiveWalletIds[0],
          walletIds: effectiveWalletIds.length > 1 ? effectiveWalletIds : undefined,
          paymentDate: payDate,
          amount: toNum(payAmount),
          discount: toNum(payDiscount),
          discountAccountId: payDiscountAccountId || null,
          cashAccountId: payCashAccountId || null,
          orderIds: paySelectedOrders,
          proofUrl: payProofUrl || null,
          notes: payNotes || null,
          branch: branch || null,
        }),
      })
      if (res.ok) {
        setShowPaymentModal(false)
        fetchData()
      } else {
        const d = await res.json()
        setPayError(d.error || 'Failed to save')
      }
    } catch {
      setPayError('Network error')
    } finally {
      setPaySaving(false)
    }
  }

  const deletePayment = async (payment: ARPaymentRecord) => {
    const wallet = wallets.find(w => w.id === payment.walletId)
    const reason = window.prompt(
      `Delete payment of ${formatCurrency(toNum(payment.amount))} for "${wallet?.patientName || 'Unknown'}"?\n\nThis will restore the wallet balance.\n\nPlease enter a reason:`
    )
    if (!reason?.trim()) return
    try {
      const res = await fetch(`/api/accounts-receivable/payments?id=${payment.id}&reason=${encodeURIComponent(reason.trim())}`, { method: 'DELETE' })
      if (res.ok) {
        fetchData()
      } else {
        const d = await res.json()
        alert(d.error || 'Failed to delete payment')
      }
    } catch {
      alert('Network error')
    }
  }

  const toggleOrderSelect = (orderId: string) => {
    setPaySelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    )
  }

  if (!session?.user) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <FileCheck size={28} style={{ color: 'var(--teal)' }} /> Accounts Receivable
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>Monitor and record payments from HMO providers and Guarantee Letter agencies</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Total Receivable ({tab})</p>
            <p className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalReceivable)}</p>
          </div>
          <button onClick={openPaymentModal} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
            <DollarSign size={16} /> Record Payment
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['HMO', 'GL'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setWalletFilter(''); setBucketFilterIds(null); setBucketFilterLabel('') }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={tab === t
              ? { background: 'var(--teal)', color: 'white' }
              : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
            {t === 'HMO' ? 'HMO Providers' : 'Guarantee Letters (GL)'}
          </button>
        ))}
      </div>

      {/* ── Dashboard: AR Days + Aging Receivable Details ── */}
      <div className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>AR Dashboard — {tab}</h2>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              Days Sales Outstanding and aging buckets. AR Days = (average AR ÷ period revenue) × period days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Period:</label>
            <select value={agingPeriodDays} onChange={e => setAgingPeriodDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          </div>
        </div>

        {/* Overall AR Days card */}
        <div className="rounded-xl p-4 grid grid-cols-3 gap-4" style={{ background: 'white', border: '1px solid var(--light-gray)' }}>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>AR Days (Overall)</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--deep-teal)' }}>
              {agingData ? agingData.arDaysOverall.toFixed(1) : '—'}
              <span className="text-sm font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>days</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Total AR</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#dc2626' }}>
              {agingData ? formatCurrency(agingData.totalAR) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Period Revenue</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#166534' }}>
              {agingData ? formatCurrency(agingData.totalRevenue) : '—'}
            </p>
          </div>
        </div>

        {/* AR Days per wallet — compact strip */}
        {agingData && agingData.perWallet.filter(w => w.ar > 0 || w.revenue > 0).length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>AR Days per {tab === 'HMO' ? 'HMO' : 'Agency'}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {agingData.perWallet.filter(w => w.ar > 0 || w.revenue > 0).map(w => (
                <div key={w.walletId} className="rounded-lg px-3 py-2" style={{ background: 'white', border: '1px solid var(--light-gray)' }}>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{w.walletName}</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>{w.arDays.toFixed(1)} days</p>
                  <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>AR {formatCurrency(w.ar)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aging Receivable Details */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
              Aging Receivable Details — click an amount to see the transactions included
            </p>
            {bucketFilterIds && (
              <button onClick={() => { setBucketFilterIds(null); setBucketFilterLabel('') }}
                className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                Viewing: {bucketFilterLabel} · Clear
              </button>
            )}
          </div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--pale-teal)' }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{tab === 'HMO' ? 'HMO' : 'Agency'}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>0–30 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>31–60 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>61–90 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>&gt;90 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {!agingData ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>Loading aging…</td></tr>
                ) : agingData.perWallet.filter(w => w.ar > 0).length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No outstanding receivables.</td></tr>
                ) : (() => {
                  const rows = agingData.perWallet.filter(w => w.ar > 0)
                  const buckets: AgingBucket[] = ['b0_30', 'b31_60', 'b61_90', 'b90plus']
                  const bucketLabels: Record<AgingBucket, string> = { b0_30: '0–30 days', b31_60: '31–60 days', b61_90: '61–90 days', b90plus: '>90 days' }
                  const clickCell = (w: AgingRow, b: AgingBucket) => {
                    const ids = w.orderIdsByBucket[b]
                    if (!ids || ids.length === 0) return
                    setBucketFilterIds(ids)
                    setBucketFilterLabel(`${w.walletName} · ${bucketLabels[b]}`)
                    setWalletFilter(w.walletId)
                    // Nudge the user to the table below
                    setTimeout(() => {
                      const el = document.querySelector('[data-ar-transactions-table]')
                      if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 50)
                  }
                  const totals = buckets.reduce((acc, b) => ({ ...acc, [b]: rows.reduce((s, r) => s + r.aging[b], 0) }), {} as Record<AgingBucket, number>)
                  const grandTotal = rows.reduce((s, r) => s + r.ar, 0)
                  return (
                    <>
                      {rows.map(w => (
                        <tr key={w.walletId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{w.walletName}</td>
                          {buckets.map(b => (
                            <td key={b} className="px-3 py-2 text-right">
                              {w.aging[b] > 0 ? (
                                <button onClick={() => clickCell(w, b)}
                                  className="font-mono underline hover:opacity-80"
                                  style={{ color: b === 'b90plus' ? '#dc2626' : b === 'b61_90' ? '#c44b00' : 'var(--charcoal)' }}>
                                  {formatCurrency(w.aging[b])}
                                </button>
                              ) : <span className="font-mono" style={{ color: 'var(--light-gray)' }}>—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(w.ar)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--off-white)' }}>
                        <td className="px-3 py-2 font-bold text-xs" style={{ color: 'var(--charcoal)' }}>TOTAL</td>
                        {buckets.map(b => (
                          <td key={b} className="px-3 py-2 text-right font-mono font-bold text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(totals[b])}</td>
                        ))}
                        <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(grandTotal)}</td>
                      </tr>
                    </>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
          <select value={branch} onChange={e => setBranch(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{tab === 'HMO' ? 'HMO Provider' : 'Agency'}</label>
          <select value={walletFilter} onChange={e => setWalletFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName} ({formatCurrency(toNum(w.balance))})</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {wallets.map(w => (
          <div key={w.id} className="rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow"
            style={{ borderColor: walletFilter === w.id ? 'var(--teal)' : 'var(--light-gray)', background: walletFilter === w.id ? '#f0fdfa' : 'white' }}
            onClick={() => setWalletFilter(walletFilter === w.id ? '' : w.id)}>
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{w.patientName}</p>
            {w.account && <p className="text-xs" style={{ color: 'var(--teal)' }}>{w.account.accountNumber} {w.account.accountTitle}</p>}
            <p className="text-[10px] uppercase tracking-wide mt-1" style={{ color: 'var(--mid-gray)' }}>
              {tab === 'GL' ? 'Approved GL Amount' : 'Outstanding'}
            </p>
            <p className="text-lg font-bold" style={{ color: toNum(w.balance) > 0 ? '#dc2626' : '#166534' }}>
              {formatCurrency(toNum(w.balance))}
            </p>
            {tab === 'GL' && typeof w.consumedOutstanding === 'number' && (
              <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                Consumed (unpaid orders): {formatCurrency(w.consumedOutstanding)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Transactions table */}
      <div data-ar-transactions-table className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                onClick={() => toggleSort('transactionDate')}>
                <span className="flex items-center gap-1">Date <SortIcon field="transactionDate" /></span>
              </th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Service</th>
              <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                onClick={() => toggleSort('patientName')}>
                <span className="flex items-center gap-1">Patient <SortIcon field="patientName" /></span>
              </th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>
                {tab === 'HMO' ? 'HMO' : 'Agency'}
              </th>
              <th className="text-right px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                onClick={() => toggleSort('netAmount')}>
                <span className="flex items-center justify-end gap-1">Amount <SortIcon field="netAmount" /></span>
              </th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Proof</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
            ) : (bucketFilterIds ? orders.filter(o => bucketFilterIds.includes(o.id)) : orders).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No receivable transactions found</td></tr>
            ) : (bucketFilterIds ? orders.filter(o => bucketFilterIds.includes(o.id)) : orders).map(o => {
              // Sum all HMO/GL payments on this order (should normally be 1)
              const amt = o.payments.reduce((s, p) => s + toNum(p.amount), 0)
              const wallet = wallets.find(w => w.id === o.payments[0]?.walletId)
              const isPaid = o.arPaymentItems.length > 0
              return (
                <tr key={o.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{o.items.map(i => i.name).join(', ')}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{wallet?.patientName || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(amt)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold"
                      style={isPaid ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ProofCell orderId={o.id} currentUrl={o.arProofUrl || null}
                      onChange={(url) => setOrders(prev => prev.map(x => x.id === o.id ? { ...x, arProofUrl: url } : x))} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Payment History */}
      {arPayments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Payment History</h3>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  {['Date', 'Provider/Agency', 'Amount', 'Discount', 'Debit Account', 'Orders', 'Notes', 'Recorded By', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {arPayments.map(p => {
                  const wallet = wallets.find(w => w.id === p.walletId)
                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2">{wallet?.patientName || '—'}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: '#166534' }}>{formatCurrency(toNum(p.amount))}</td>
                      <td className="px-3 py-2">{toNum(p.discount) > 0 ? formatCurrency(toNum(p.discount)) : '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--teal)' }}>{p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '—'}</td>
                      <td className="px-3 py-2">{p.items.length} orders</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{p.notes || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{p.createdBy.name}</td>
                      <td className="px-3 py-2 flex items-center gap-1">
                        <button onClick={() => openEditPaymentModal(p)} className="p-1.5 rounded-lg hover:bg-blue-50" title="Edit payment">
                          <Pencil size={14} className="text-blue-400" />
                        </button>
                        <button onClick={() => deletePayment(p)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete payment">
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-lg mb-8 relative">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              <DollarSign size={20} className="inline" style={{ color: 'var(--teal)' }} /> {editingPaymentId ? 'Edit Payment' : 'Record Payment'}
            </h3>

            <div className="space-y-4">
              {/* Provider/Agency */}
              {tab === 'GL' && !editingPaymentId ? (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    Select GL Patients (tick all that apply)
                  </label>
                  <div className="rounded-xl border max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {wallets.map(w => (
                      <label key={w.id} className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 cursor-pointer border-b" style={{ borderColor: 'var(--light-gray)' }}>
                        <input type="checkbox" checked={payWalletIds.includes(w.id)}
                          onChange={() => {
                            setPayWalletIds(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])
                            if (!payWalletId) setPayWalletId(w.id)
                          }}
                          className="rounded" />
                        <span className="flex-1 font-medium" style={{ color: 'var(--charcoal)' }}>{w.patientName}</span>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Balance: {formatCurrency(toNum(w.balance))}</span>
                      </label>
                    ))}
                  </div>
                  {payWalletIds.length > 1 && (
                    <p className="text-xs mt-1 font-medium" style={{ color: 'var(--deep-teal)' }}>
                      {payWalletIds.length} selected &middot; Combined balance: {formatCurrency(wallets.filter(w => payWalletIds.includes(w.id)).reduce((s, w) => s + toNum(w.balance), 0))}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    {tab === 'HMO' ? 'HMO Provider' : 'Agency (GL)'}
                  </label>
                  <select value={payWalletId} onChange={e => setPayWalletId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">— Select —</option>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName} (Balance: {formatCurrency(toNum(w.balance))})</option>)}
                  </select>
                </div>
              )}

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Date</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Amount</label>
                  <input type="number" min={0} step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Discount Applied</label>
                  <input type="number" min={0} step="0.01" value={payDiscount} onChange={e => setPayDiscount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              </div>

              {/* Discount Account */}
              {toNum(payDiscount) > 0 && (
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Discount Account (COA)</label>
                  <input type="text" value={payDiscountSearch}
                    onChange={e => { setPayDiscountSearch(e.target.value); if (!e.target.value) setPayDiscountAccountId('') }}
                    placeholder="Search discount account..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: payDiscountAccountId ? 'var(--teal)' : 'var(--light-gray)', background: payDiscountAccountId ? '#f0fdfa' : 'white' }} />
                  {payDiscountAccountId && (
                    <button type="button" onClick={() => { setPayDiscountAccountId(''); setPayDiscountSearch('') }}
                      className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                  )}
                  {payDiscountSearch && !payDiscountAccountId && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {discountAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(payDiscountSearch.toLowerCase())).slice(0, 8).map(a => (
                        <button key={a.id} type="button" onClick={() => { setPayDiscountAccountId(a.id); setPayDiscountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                          <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Debit Account (Cash/Bank account) */}
              <div className="relative">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Debit Account (where payment was received)</label>
                <input type="text" value={payCashAccountSearch}
                  onChange={e => { setPayCashAccountSearch(e.target.value); if (!e.target.value) setPayCashAccountId('') }}
                  placeholder="Search account (e.g. Cash, BDO, BPI)..."
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: payCashAccountId ? 'var(--teal)' : 'var(--light-gray)', background: payCashAccountId ? '#f0fdfa' : 'white' }} />
                {payCashAccountId && (
                  <button type="button" onClick={() => { setPayCashAccountId(''); setPayCashAccountSearch('') }}
                    className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                )}
                {payCashAccountSearch && !payCashAccountId && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {cashAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(payCashAccountSearch.toLowerCase())).slice(0, 8).map(a => (
                      <button key={a.id} type="button" onClick={() => { setPayCashAccountId(a.id); setPayCashAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                        <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag transactions */}
              {(payWalletId || payWalletIds.length > 0) && (() => {
                // When editing, show all orders for this wallet (paid or unpaid); when creating, show only unpaid
                const selectedIds = tab === 'GL' && !editingPaymentId ? payWalletIds : (payWalletId ? [payWalletId] : [])
                const eligibleOrders = editingPaymentId
                  ? orders.filter(o => o.payments.some(p => selectedIds.includes(p.walletId || '')))
                  : unpaidOrders.filter(o => o.payments.some(p => selectedIds.includes(p.walletId || '')))
                return eligibleOrders.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Tag Transactions Included</label>
                  <div className="rounded-xl border max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {eligibleOrders.map(o => {
                      const amt = o.payments.find(p => selectedIds.includes(p.walletId || ''))
                      return (
                        <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer border-b" style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="checkbox" checked={paySelectedOrders.includes(o.id)}
                            onChange={() => toggleOrderSelect(o.id)}
                            className="rounded" />
                          <span style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</span>
                          <span className="flex-1" style={{ color: 'var(--charcoal)' }}>{o.patientName} — {o.items.map(i => i.name).join(', ')}</span>
                          <span className="font-medium">{formatCurrency(toNum(amt?.amount))}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                ) : null
              })()}

              {/* Proof of payment — file upload */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of Payment</label>
                {payProofUrl ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
                    <Upload size={14} style={{ color: 'var(--teal)' }} />
                    <a href={payProofUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate underline text-xs" style={{ color: 'var(--teal)' }}>
                      {payProofUrl.split('/').pop()}
                    </a>
                    <button type="button" onClick={() => setPayProofUrl('')} className="p-0.5 rounded hover:bg-gray-100">
                      <X size={14} style={{ color: 'var(--mid-gray)' }} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 border-dashed text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <Upload size={16} />
                    {payProofUploading ? 'Uploading...' : 'Upload file (JPG, PNG, PDF — max 10MB)'}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setPayProofUploading(true)
                      try {
                        const formData = new FormData()
                        formData.append('file', file)
                        const res = await fetch('/api/upload', { method: 'POST', body: formData })
                        const data = await res.json()
                        if (res.ok && data.url) setPayProofUrl(data.url)
                        else setPayError(data.error || 'Upload failed')
                      } catch { setPayError('Upload failed') }
                      finally { setPayProofUploading(false) }
                    }} />
                  </label>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes</label>
                <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {payError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{payError}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                <button onClick={savePayment} disabled={paySaving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}>
                  {paySaving ? 'Saving...' : editingPaymentId ? 'Update Payment' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
