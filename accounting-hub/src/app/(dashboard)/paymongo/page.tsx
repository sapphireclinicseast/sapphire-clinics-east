'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { CreditCard, Loader2, ExternalLink, RefreshCw, Landmark, CheckCircle2 } from 'lucide-react'

const ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'PAYROLL_OFFICER']
const RECON_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'AHEA' },
  { value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { value: 'VERDANA_STORE', label: 'Verdana' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Txn { id: string; referenceCode: string | null; description: string | null; branch: string | null; amount: number; status: string; checkoutUrl: string | null; fee: number | null; netAmount: number | null; paidAt: string | null; payoutId: string | null; livemode: boolean; createdAt: string }
interface ServiceOpt { id: string; name: string; price: number | null; branchPrices: { branch: string; price: number | null }[] }
interface BankOpt { id: string; accountNumber: string; accountTitle: string }
interface Unsettled { id: string; referenceCode: string | null; description: string | null; branch: string | null; amount: number; fee: number | null; netAmount: number | null; paidAt: string | null; livemode: boolean }
interface SettledRow { id: string; payoutId: string | null; referenceCode: string | null; amount: number; fee: number | null; netAmount: number | null; paidAt: string | null }

export default function PaymongoPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const canReconcile = RECON_ROLES.includes(role as string)
  const [cfg, setCfg] = useState<{ configured: boolean; livemode: boolean } | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastUrl, setLastUrl] = useState('')
  const [syncing, setSyncing] = useState(false)
  const didSync = useRef(false)

  // Phase 2: record the paid link as a POS sale
  const [recordAsOrder, setRecordAsOrder] = useState(true)
  const [purpose, setPurpose] = useState<'DOWNPAYMENT' | 'TUITION'>('TUITION')
  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [patientName, setPatientName] = useState('')
  const [services, setServices] = useState<ServiceOpt[]>([])
  const [lines, setLines] = useState<{ serviceId: string; name: string; amount: string }[]>([])
  const [addServiceId, setAddServiceId] = useState('')
  const [discKind, setDiscKind] = useState<'FIXED' | 'PERCENT'>('FIXED')
  const [discValue, setDiscValue] = useState('')
  const [voucherLabel, setVoucherLabel] = useState('')

  // Phase 2: payout reconciliation
  const [unsettled, setUnsettled] = useState<Unsettled[]>([])
  const [settled, setSettled] = useState<SettledRow[]>([])
  const [netTotal, setNetTotal] = useState(0)
  const [banks, setBanks] = useState<BankOpt[]>([])
  const [bankId, setBankId] = useState('')
  const [payoutBusy, setPayoutBusy] = useState(false)
  const [autoReconcile, setAutoReconcile] = useState(true)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/pos/paymongo/checkout'); const j = r.ok ? await r.json() : null; if (j) { setCfg({ configured: j.configured, livemode: j.livemode }); setTxns(j.recent || []) } }
    catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  const loadPayouts = useCallback(async () => {
    if (!canReconcile) return
    try {
      const r = await fetch('/api/pos/paymongo/payouts')
      if (r.ok) {
        const j = await r.json()
        setUnsettled(j.unsettled || []); setSettled(j.settled || []); setNetTotal(j.netTotal || 0)
        if (j.settings) {
          setAutoReconcile(j.settings.autoReconcile !== false)
          setLastSyncAt(j.settings.lastSyncAt || null)
          if (j.settings.bankAccountId) setBankId(j.settings.bankAccountId)
        }
      }
    } catch { /* ignore */ }
  }, [canReconcile])

  // Ask PayMongo whether any PENDING links were paid and settle them. Safety net for
  // a missed/unregistered webhook. Runs once on load, plus a manual button.
  const syncPayments = useCallback(async (silent: boolean) => {
    setSyncing(true)
    try {
      const r = await fetch('/api/pos/paymongo/sync', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (r.ok && (j.settled || 0) > 0) { load(); loadPayouts(); if (!silent) alert(`${j.settled} payment(s) confirmed and marked paid.`) }
      else if (!silent && r.ok) alert('No newly-paid links found.')
      else if (!silent) alert(j.error || 'Sync failed')
    } finally { setSyncing(false) }
  }, [load, loadPayouts])

  useEffect(() => { load(); loadPayouts() }, [load, loadPayouts])

  // One automatic sync once config confirms PayMongo is set up.
  useEffect(() => {
    if (cfg?.configured && !didSync.current) { didSync.current = true; syncPayments(true) }
  }, [cfg, syncPayments])

  // Load services for the chosen branch when recording as a POS order.
  useEffect(() => {
    if (!recordAsOrder) return
    fetch(`/api/services?branch=${encodeURIComponent(branch)}&pageSize=1000`)
      .then(r => r.json())
      // /api/services returns a paginated shape: { data, total, page, ... }
      .then(d => {
        const arr = Array.isArray(d) ? d : (d.data || d.services || [])
        setServices(arr.map((s: { id: string; name: string; price: number | string | null; branchPrices?: { branch: string; price: number | string | null }[] }) => ({
          id: s.id, name: s.name,
          price: s.price != null ? Number(s.price) : null,
          branchPrices: (s.branchPrices || []).map(bp => ({ branch: bp.branch, price: bp.price != null ? Number(bp.price) : null })),
        })))
      })
      .catch(() => setServices([]))
  }, [recordAsOrder, branch])

  // Load bank accounts for reconciliation.
  useEffect(() => {
    if (!canReconcile) return
    fetch('/api/bank-accounts').then(r => r.json()).then(d => { const a = Array.isArray(d) ? d : []; setBanks(a); if (a[0] && !bankId) setBankId(a[0].id) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReconcile])

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && !ACCESS.includes(role as string)) {
    return <div className="p-8 text-center text-gray-500">PayMongo is restricted to admin, accountant, bookkeeper, branch admin, and front desk.</div>
  }

  const today = () => new Date().toISOString().slice(0, 10)

  // Resolve a service's price for the selected branch: use the per-branch override
  // when one exists (e.g. tuition priced differently East vs GH), else the default.
  const priceForBranch = (s: ServiceOpt): number | null => {
    const bp = s.branchPrices.find(b => b.branch === branch && b.price != null)
    return bp ? bp.price : s.price
  }

  const lineTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  // Staff-entered voucher/discount (fixed ₱ or % of the subtotal), clamped to the subtotal.
  const discountAmt = Math.min(
    Math.max(discKind === 'PERCENT' ? lineTotal * (Number(discValue) || 0) / 100 : (Number(discValue) || 0), 0),
    lineTotal,
  )
  const netAfterDiscount = Math.round((lineTotal - discountAmt) * 100) / 100

  const createLink = async () => {
    // With "Record as a POS sale" on, the charged amount is the service subtotal less
    // any voucher/discount; otherwise it's the free-form amount field.
    const amt = recordAsOrder ? netAfterDiscount : Number(amount)
    if (!(amt > 0)) {
      alert(recordAsOrder
        ? (lineTotal > 0 ? 'The discount leaves nothing to charge — lower it.' : 'Add at least one service with an amount.')
        : 'Enter a positive amount.')
      return
    }
    const purposeLabel = purpose === 'DOWNPAYMENT' ? 'Downpayment' : 'Tuition'
    setBusy(true); setLastUrl('')
    try {
      let orderId: string | undefined
      // Phase 2: create the POS order first (unpaid); the webhook settles it net-of-fee when paid.
      // Downpayments are booked as UNEARNED (deposit liability); tuition as EARNED revenue.
      if (recordAsOrder) {
        const or = await fetch('/api/pos/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderType: 'SERVICE', branch, unpaid: true, payments: [],
            revenueType: purpose === 'DOWNPAYMENT' ? 'UNEARNED' : 'EARNED',
            patientName: patientName || null, transactionDate: today(),
            notes: purposeLabel + ' via PayMongo',
            ...(discountAmt > 0 ? { discountType: 'CUSTOM', discountAmount: discountAmt, discountLabel: voucherLabel || 'Voucher' } : {}),
            items: lines.filter(l => (Number(l.amount) || 0) > 0).map(l => ({ serviceId: l.serviceId, name: l.name, quantity: 1, unitPrice: Number(l.amount) || 0, lineTotal: Number(l.amount) || 0 })),
          }),
        })
        const oj = await or.json()
        if (!or.ok) { alert(oj.error || 'Failed to create the POS order'); setBusy(false); return }
        orderId = oj.id
      }
      const desc = recordAsOrder
        ? `${purposeLabel}${patientName ? ' — ' + patientName : ''}${description ? ' · ' + description : ''}`
        : (description || undefined)
      const r = await fetch('/api/pos/paymongo/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPhp: amt, description: desc, branch: recordAsOrder ? branch : undefined, orderId }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error || 'Failed to create link'); return }
      setLastUrl(j.checkoutUrl); setAmount(''); setDescription(''); setPatientName(''); setLines([]); setAddServiceId(''); setDiscValue(''); setVoucherLabel(''); load()
    } finally { setBusy(false) }
  }

  const saveSettings = async (nextAuto?: boolean, nextBank?: string) => {
    setSavingCfg(true)
    try {
      const r = await fetch('/api/pos/paymongo/payouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settings', bankAccountId: (nextBank ?? bankId) || null, autoReconcile: nextAuto ?? autoReconcile }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error || 'Failed to save settings'); return }
      loadPayouts()
    } finally { setSavingCfg(false) }
  }

  const syncNow = async () => {
    setPayoutBusy(true)
    try {
      const r = await fetch('/api/pos/paymongo/payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
      const j = await r.json()
      if (!r.ok) { alert(j.error || 'Sync failed'); return }
      if (j.recorded) alert(`Booked ${j.recorded} payout(s) — ${peso(j.net)} settled to bank.`)
      else alert(j.skipped ? `No new payouts booked (${j.skipped}).` : 'No new settled payouts from PayMongo yet.')
      loadPayouts()
    } finally { setPayoutBusy(false) }
  }

  const deleteLink = async (t: Txn) => {
    if (t.status === 'PAID') { alert('This link is already paid — void the POS order instead.'); return }
    if (!confirm(`Delete this ${t.status.toLowerCase()} payment link${t.description ? ` — ${t.description}` : ''}? The link is expired so it can no longer be paid, and its unpaid order is voided.`)) return
    const r = await fetch(`/api/pos/paymongo/checkout?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert(j.error || 'Failed to delete'); return }
    load(); loadPayouts()
  }

  const settlePayout = async () => {
    if (!bankId) { alert('Select the bank account the payout landed in.'); return }
    if (!unsettled.length) { alert('Nothing to reconcile.'); return }
    if (!confirm(`Record a PayMongo payout of ${peso(netTotal)} into the selected bank? This posts DR Bank / CR PayMongo Clearing and marks ${unsettled.length} transaction(s) settled.`)) return
    setPayoutBusy(true)
    try {
      const r = await fetch('/api/pos/paymongo/payouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId: bankId, payoutDate: today() }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error || 'Failed to reconcile'); return }
      alert(`Reconciled ${j.count} transaction(s) — ${peso(j.net)} posted to bank.`)
      loadPayouts()
    } finally { setPayoutBusy(false) }
  }

  // A PAID link either still sits in PayMongo's clearing balance or has already been
  // remitted to our bank (payoutId gets tagged by the Payouts-API auto-reconcile).
  const displayStatus = (t: Txn) => {
    if (t.status !== 'PAID') return t.status
    return t.payoutId ? 'Remitted to Bank' : 'For Clearing'
  }
  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; c: string }> = {
      'Remitted to Bank': { bg: '#dcfce7', c: '#166534' },
      'For Clearing': { bg: '#dbeafe', c: '#1e40af' },
      PAID: { bg: '#dcfce7', c: '#166534' },
      PENDING: { bg: '#fef9c3', c: '#854d0e' },
      FAILED: { bg: '#fee2e2', c: '#b91c1c' },
      EXPIRED: { bg: '#f1f5f9', c: '#64748b' },
    }
    const st = map[s] || map.PENDING
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: st.bg, color: st.c }}>{s}</span>
  }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <CreditCard size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">PayMongo</h1>
        <button onClick={() => syncPayments(false)} disabled={syncing} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }} title="Ask PayMongo whether pending links were paid and mark them paid">{syncing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Check for payments</button>
        <button onClick={() => { load(); loadPayouts() }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><RefreshCw size={13} /> Refresh</button>
      </div>

      {cfg && !cfg.configured && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: '#fed7aa', background: '#fff7ed', color: '#9a3412' }}>
          PayMongo isn&apos;t configured yet. Set <code>PAYMONGO_SECRET_KEY</code> and <code>PAYMONGO_WEBHOOK_SECRET</code> on the server, then register the webhook <code>/api/pos/paymongo/webhook</code> in the PayMongo dashboard.
        </div>
      )}
      {cfg?.configured && (
        <div className="rounded-xl border p-3 text-sm flex items-center gap-2" style={{ borderColor: cfg.livemode ? '#fecaca' : 'var(--light-gray)', background: cfg.livemode ? '#fef2f2' : 'var(--off-white)' }}>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: cfg.livemode ? '#b91c1c' : '#0d9488', color: '#fff' }}>{cfg.livemode ? 'LIVE MODE' : 'TEST MODE'}</span>
          <span style={{ color: 'var(--mid-gray)' }}>When the customer pays, the link flips to <strong>Paid</strong> automatically (webhook). With <strong>Record as a POS sale</strong> on, it also posts a POS Order net of the PayMongo fee (revenue, fee, and clearing all booked).</span>
        </div>
      )}

      {/* Create payment link */}
      <div className="rounded-2xl border p-4 bg-white space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
        <p className="text-sm font-semibold text-gray-700">Create a payment link</p>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 select-none cursor-pointer">
          <input type="checkbox" checked={recordAsOrder} onChange={e => setRecordAsOrder(e.target.checked)} />
          Record as a POS sale (appears in POS → Orders when paid)
        </label>

        {!recordAsOrder && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Amount (PHP)</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={inp + ' font-mono'} style={bc} /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Description</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. PT session — Juan Dela Cruz" className={inp} style={bc} /></div>
          </div>
        )}

        {recordAsOrder && (
          <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment type</label>
                <select value={purpose} onChange={e => setPurpose(e.target.value as 'DOWNPAYMENT' | 'TUITION')} className={inp} style={bc}>
                  <option value="TUITION">Tuition fee (earned revenue)</option>
                  <option value="DOWNPAYMENT">Downpayment (unearned deposit)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
                <select value={branch} onChange={e => { setBranch(e.target.value); setLines([]); setAddServiceId('') }} className={inp} style={bc}>
                  {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient / payer (optional)</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Name on the order" className={inp} style={bc} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Services on this link</label>
              <select
                value={addServiceId}
                onChange={e => {
                  const s = services.find(x => x.id === e.target.value)
                  if (s && !lines.some(l => l.serviceId === s.id)) {
                    const p = priceForBranch(s)
                    setLines(prev => [...prev, { serviceId: s.id, name: s.name, amount: p != null ? String(p) : '' }])
                  }
                  setAddServiceId('')
                }}
                className={inp} style={bc}
              >
                <option value="">+ Add a service…</option>
                {services.filter(s => !lines.some(l => l.serviceId === s.id)).map(s => {
                  const p = priceForBranch(s)
                  return <option key={s.id} value={s.id}>{s.name}{p != null && p > 0 ? ` — ${peso(p)}` : ''}</option>
                })}
              </select>

              {lines.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {lines.map((l, i) => (
                    <div key={l.serviceId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate" title={l.name}>{l.name}</span>
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>₱</span>
                      <input
                        value={l.amount}
                        onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        inputMode="decimal" placeholder="0.00"
                        className="w-28 px-2 py-1.5 rounded-lg border text-sm font-mono text-right" style={bc}
                      />
                      <button onClick={() => setLines(prev => prev.filter((_, j) => j !== i))} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#b91c1c' }}>Remove</button>
                    </div>
                  ))}
                  {/* Voucher / discount */}
                  <div className="pt-2 mt-1 border-t space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
                    <label className="block text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Voucher / discount (optional)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={discKind} onChange={e => setDiscKind(e.target.value as 'FIXED' | 'PERCENT')} className="px-2 py-1.5 rounded-lg border text-sm" style={bc}>
                        <option value="FIXED">Fixed ₱</option>
                        <option value="PERCENT">Percent %</option>
                      </select>
                      <input value={discValue} onChange={e => setDiscValue(e.target.value)} inputMode="decimal" placeholder={discKind === 'PERCENT' ? '0 %' : '0.00'} className="w-24 px-2 py-1.5 rounded-lg border text-sm font-mono text-right" style={bc} />
                      <input value={voucherLabel} onChange={e => setVoucherLabel(e.target.value)} placeholder="Voucher / reason (e.g. Scholarship)" className="flex-1 min-w-[160px] px-2 py-1.5 rounded-lg border text-sm" style={bc} />
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="pt-1 space-y-0.5 text-sm">
                    <div className="flex items-center justify-end gap-2"><span style={{ color: 'var(--mid-gray)' }}>Subtotal</span><span className="font-mono w-28 text-right">{peso(lineTotal)}</span></div>
                    {discountAmt > 0 && <div className="flex items-center justify-end gap-2" style={{ color: '#b91c1c' }}><span>Discount{voucherLabel ? ` (${voucherLabel})` : ''}</span><span className="font-mono w-28 text-right">−{peso(discountAmt)}</span></div>}
                    <div className="flex items-center justify-end gap-2 font-semibold pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}><span style={{ color: 'var(--mid-gray)' }}>To charge</span><span className="font-mono w-28 text-right" style={{ color: 'var(--deep-teal)' }}>{peso(netAfterDiscount)}</span></div>
                  </div>

                  {purpose === 'DOWNPAYMENT' && (
                    <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Enter the downpayment amount per service (a partial amount is fine). It posts to Unearned Revenue until the service is delivered.</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Note on the link (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 1st installment, SY 2026–2027" className={inp} style={bc} />
            </div>
          </div>
        )}

        <button onClick={createLink} disabled={busy || !cfg?.configured} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Create payment link</button>
        {lastUrl && (
          <div className="rounded-xl border p-3 text-sm flex items-center justify-between gap-3" style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}>
            <span className="font-mono text-xs truncate" style={{ color: 'var(--deep-teal)' }}>{lastUrl}</span>
            <a href={lastUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><ExternalLink size={13} /> Open / show QR</a>
          </div>
        )}
      </div>

      {/* Payout reconciliation */}
      {canReconcile && (
        <div className="rounded-2xl border p-4 bg-white space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-teal-600" />
            <p className="text-sm font-semibold text-gray-700">Payout → bank reconciliation</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            Paid PayMongo money sits in <strong>PayMongo Clearing</strong> until PayMongo deposits it to your bank. With auto-reconcile on, settled payouts are pulled from PayMongo (checked when this page opens) and posted <strong>DR Bank / CR PayMongo Clearing</strong> automatically.
          </p>

          {/* Auto-reconcile configuration */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 select-none cursor-pointer">
              <input type="checkbox" checked={autoReconcile} onChange={e => { setAutoReconcile(e.target.checked); saveSettings(e.target.checked) }} />
              Auto-reconcile payouts
            </label>
            <div className="min-w-[240px]">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>PayMongo deposits to</label>
              <select value={bankId} onChange={e => { setBankId(e.target.value); saveSettings(undefined, e.target.value) }} className={inp} style={bc}>
                <option value="">— Select bank account —</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
              </select>
            </div>
            <button onClick={syncNow} disabled={payoutBusy || !bankId} className="mt-4 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{payoutBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now</button>
            <div className="mt-4 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {savingCfg ? 'Saving…' : lastSyncAt ? `Last checked ${new Date(lastSyncAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not yet synced'}
            </div>
          </div>

          {/* Awaiting payout + manual fallback */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Awaiting payout</div>
              <div className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>{peso(netTotal)}</div>
              <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{unsettled.length} transaction(s) in clearing, net of fees</div>
            </div>
            <button onClick={settlePayout} disabled={payoutBusy || !unsettled.length || !bankId} title="Post the full clearing balance to the selected bank now, without waiting for the PayMongo payout record" className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center gap-2 border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>{payoutBusy && <Loader2 size={14} className="animate-spin" />} Settle manually now</button>
          </div>
          {unsettled.length > 0 && (
            <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                {['Paid', 'Reference', 'Branch', 'Gross', 'Fee', 'Net'].map(h => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
              </tr></thead><tbody>
                {unsettled.map(u => (
                  <tr key={u.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{u.paidAt ? new Date(u.paidAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—'}</td>
                    <td className="px-3 py-1.5 font-mono">{u.referenceCode || '—'}</td>
                    <td className="px-3 py-1.5">{u.branch || '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{peso(u.amount)}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: '#d97706' }}>{u.fee != null ? peso(u.fee) : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{u.netAmount != null ? peso(u.netAmount) : '—'}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
          {settled.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--mid-gray)' }}>Settled batches ({settled.length})</summary>
              <div className="mt-2 rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-xs"><tbody>
                  {settled.map(s => (
                    <tr key={s.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-1.5 font-mono">{s.payoutId}</td>
                      <td className="px-3 py-1.5 font-mono">{s.referenceCode || '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{s.netAmount != null ? peso(s.netAmount) : '—'}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Totals — gross charged, PayMongo fees, net, and where the net sits */}
      {(() => {
        const paid = txns.filter(t => t.status === 'PAID')
        const gross = paid.reduce((s, t) => s + Number(t.amount || 0), 0)
        const fees = paid.reduce((s, t) => s + Number(t.fee || 0), 0)
        const net = paid.reduce((s, t) => s + Number(t.netAmount ?? (Number(t.amount) - Number(t.fee || 0))), 0)
        const clearing = paid.filter(t => !t.payoutId).reduce((s, t) => s + Number(t.netAmount ?? (Number(t.amount) - Number(t.fee || 0))), 0)
        const remitted = paid.filter(t => t.payoutId).reduce((s, t) => s + Number(t.netAmount ?? (Number(t.amount) - Number(t.fee || 0))), 0)
        const cards: { label: string; val: number; c: string }[] = [
          { label: 'Total charged', val: gross, c: 'var(--deep-teal)' },
          { label: 'PayMongo fees', val: fees, c: '#d97706' },
          { label: 'Net received', val: net, c: 'var(--deep-teal)' },
          { label: 'For Clearing', val: clearing, c: '#1e40af' },
          { label: 'Remitted to Bank', val: remitted, c: '#166534' },
        ]
        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {cards.map(c => (
              <div key={c.label} className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>{c.label}</div>
                <div className="text-lg font-semibold mt-0.5" style={{ color: c.c }}>{peso(c.val)}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Transactions */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          {['Date', 'Reference', 'Description', 'Amount', 'Fee', 'Net', 'Status', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={8} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
            : txns.map(t => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(t.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="px-3 py-2 font-mono">{t.referenceCode || '—'}</td>
                <td className="px-3 py-2">{t.description || '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(t.amount)}</td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: '#d97706' }}>{t.fee != null ? peso(t.fee) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{t.netAmount != null ? peso(t.netAmount) : '—'}</td>
                <td className="px-3 py-2">{statusBadge(displayStatus(t))}{t.livemode ? '' : <span className="ml-1 text-[9px]" style={{ color: 'var(--mid-gray)' }}>test</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {t.status === 'PENDING' && t.checkoutUrl && <a href={t.checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>Open →</a>}
                  {t.status !== 'PAID' && <button onClick={() => deleteLink(t)} className="ml-2 text-[11px] font-semibold" style={{ color: '#b91c1c' }}>Delete</button>}
                </td>
              </tr>
            ))}
          {!loading && txns.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No PayMongo transactions yet.</td></tr>}
        </tbody></table>
      </div>
    </div>
  )
}
