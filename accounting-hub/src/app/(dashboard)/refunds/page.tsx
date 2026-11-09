'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Undo2, Plus, Loader2, X, Trash2, CheckCircle2, Circle, FileText, BadgeDollarSign, Receipt, Paperclip, Search, Info } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import type { RfpMemoParts } from '@/lib/billing-voucher'
import { formatCurrency } from '@/lib/utils'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn, type StatTone } from '@/components/ui/hr-look'

// Verdana Store is intentionally excluded: it sells merchandise, and its returns are already
// captured by the POS/bulk-upload flow as sales returns (contra-revenue, 7160 Sales Returns).
// This section is only for refunds of PREPAID therapy balances (unearned revenue).
const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const PAYMENT_METHODS = ['Cash', 'Check', 'Bank Transfer', 'Telegraphic Transfer', 'GCash']

interface Refund {
  id: string; branch: string; date: string; patientId: string | null; patientName: string
  refundAmount: number; chargesDeducted: number; netAmount: number; reason: string | null
  proofUrls: string[] | null; audited: boolean; refundRfpId: string | null
  paidAt: string | null; rfpRefNumber: string | null; rfpStatus: string | null
}
interface Rfp { id: string; refNumber: string; grossTotal: number; payableTotal: number; status: string; payableTo: string | null; paidAt: string | null; paymentMethod: string | null; proofUrl: string | null; createdAt: string }
interface Bank { id: string; accountNumber: string; accountTitle: string }
interface Patient { id: string; name: string; email?: string; phone?: string }

const todayStr = () => new Date().toISOString().slice(0, 10)

// Where a refund is in its life. Every refund is in exactly one state, checked in
// this order (same as the old Status column: paid, then in an RFP, else pending).
type RefundState = 'toAudit' | 'ready' | 'inRfp' | 'paid'
const STATE_KEYS: RefundState[] = ['toAudit', 'ready', 'inRfp', 'paid']
const REFUND_STATES: Record<RefundState, { label: string; hint: string; line: string; pill: { bg: string; fg: string }; tone: StatTone; accent?: { line: string } }> = {
  toAudit: { label: 'To audit', hint: 'tick Audited first', line: '#d97706', pill: { bg: '#fef3c7', fg: '#92400e' }, tone: 'amber' },
  ready:   { label: 'Ready for RFP', hint: 'audited, not in an RFP', line: '#4A8073', pill: { bg: '#EDF3D9', fg: '#3C6A5F' }, tone: 'zero', accent: { line: '#4A8073' } },
  inRfp:   { label: 'In an RFP', hint: 'awaiting payment', line: '#2563eb', pill: { bg: '#eff6ff', fg: '#1d4ed8' }, tone: 'blue' },
  paid:    { label: 'Paid', hint: 'paid to the patient', line: '#059669', pill: { bg: '#dcfce7', fg: '#166534' }, tone: 'green' },
}
const refundState = (r: Refund): RefundState => r.paidAt ? 'paid' : r.refundRfpId ? 'inRfp' : r.audited ? 'ready' : 'toAudit'
const sumNet = (rows: Refund[]) => rows.reduce((s, r) => s + r.netAmount, 0)
const TH = 'text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap text-[var(--mid-gray)]'

export default function RefundsPage() {
  const { data: session } = useSession()
  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [tab, setTab] = useState<'refunds' | 'rfp'>('refunds')
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [rfps, setRfps] = useState<Rfp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banks, setBanks] = useState<Bank[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [stateFilter, setStateFilter] = useState<RefundState | ''>('')
  const [search, setSearch] = useState('')

  // New / edit refund modal
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [fDate, setFDate] = useState(todayStr())
  const [fPatient, setFPatient] = useState('')
  const [fPatientId, setFPatientId] = useState<string | null>(null)
  const [fAmount, setFAmount] = useState('')
  const [fCharges, setFCharges] = useState('')
  const [fReason, setFReason] = useState('')
  const [fProofs, setFProofs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const proofsRef = useRef<string[]>([])
  proofsRef.current = fProofs

  // Patient typeahead
  const [pMatches, setPMatches] = useState<Patient[]>([])
  const [pOpen, setPOpen] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // RFP generation modal
  const [rfpOpen, setRfpOpen] = useState(false)
  const [rfpSeq, setRfpSeq] = useState('')
  const [creatingRfp, setCreatingRfp] = useState(false)

  // Pay modal
  const [payTarget, setPayTarget] = useState<Rfp | null>(null)
  const [payDate, setPayDate] = useState(todayStr())
  const [payMethod, setPayMethod] = useState('Bank Transfer')
  const [payBankId, setPayBankId] = useState('')
  const [payCheck, setPayCheck] = useState('')
  const [payProof, setPayProof] = useState('')
  const [paying, setPaying] = useState(false)

  // Billing voucher
  const [bvTarget, setBvTarget] = useState<{ refNumber: string; date: string; lines: { account: string; description: string; gross: number; vat: number; netVat: number; netEwt: number; payee?: string; memo?: string }[]; branch: string; defaultBilledTo: string; defaultMemo: string ; payment?: RfpMemoParts } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rf, rp] = await Promise.all([
        fetch(`/api/refunds?branch=${branch}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/refunds/rfp?branch=${branch}`).then(r => r.ok ? r.json() : []),
      ])
      setRefunds(Array.isArray(rf) ? rf : [])
      setRfps(Array.isArray(rp) ? rp : [])
    } catch { setRefunds([]); setRfps([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(new Set()) }, [branch])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])

  const searchPatients = (q: string) => {
    setFPatient(q); setFPatientId(null); setPOpen(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.trim().length < 2) { setPMatches([]); return }
    searchTimer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(q.trim())}`); setPMatches(r.ok ? await r.json() : []) }
      catch { setPMatches([]) }
    }, 250)
  }

  const openNew = () => {
    setEditId(null); setFDate(todayStr()); setFPatient(''); setFPatientId(null)
    setFAmount(''); setFCharges(''); setFReason(''); setFProofs([]); setPMatches([]); setFormOpen(true)
  }
  const openEdit = (r: Refund) => {
    setEditId(r.id); setFDate(r.date.slice(0, 10)); setFPatient(r.patientName); setFPatientId(r.patientId)
    setFAmount(String(r.refundAmount)); setFCharges(String(r.chargesDeducted)); setFReason(r.reason || ''); setFProofs(r.proofUrls || [])
    setFormOpen(true)
  }

  const fGross = parseFloat(fAmount) || 0
  const fChg = parseFloat(fCharges) || 0
  const fNet = fGross - fChg
  const fChargesTooBig = fChg > fGross

  const saveRefund = async () => {
    if (!fPatient.trim()) { setError('Patient name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { branch, date: fDate, patientId: fPatientId, patientName: fPatient.trim(), refundAmount: parseFloat(fAmount) || 0, chargesDeducted: parseFloat(fCharges) || 0, reason: fReason, proofUrls: proofsRef.current }
      const res = editId
        ? await fetch('/api/refunds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...payload }) })
        : await fetch('/api/refunds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to save') }
      // If editing, also persist any newly added proofs (PATCH generic update doesn't touch proofs)
      if (editId) await fetch('/api/refunds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, action: 'set-proof', proofUrls: proofsRef.current }) })
      setFormOpen(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save') } finally { setSaving(false) }
  }

  const toggleAudit = async (r: Refund) => {
    setError('')
    const res = await fetch('/api/refunds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'audit', audited: !r.audited }) })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); setError(e.error || 'Failed') }
  }
  const deleteRefund = async (r: Refund) => {
    if (!confirm(`Delete refund for ${r.patientName} (${formatCurrency(r.netAmount)})?`)) return
    const res = await fetch(`/api/refunds?id=${r.id}`, { method: 'DELETE' })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to delete') }
  }

  const byState = useMemo(() => {
    const m: Record<RefundState, Refund[]> = { toAudit: [], ready: [], inRfp: [], paid: [] }
    for (const r of refunds) m[refundState(r)].push(r)
    return m
  }, [refunds])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return refunds.filter(r => (!stateFilter || refundState(r) === stateFilter)
      && (!q || r.patientName.toLowerCase().includes(q) || (r.reason || '').toLowerCase().includes(q)))
  }, [refunds, stateFilter, search])
  // Only audited refunds that are not in an RFP and not already paid can go into a new RFP.
  const shownEligible = shown.filter(r => r.audited && !r.refundRfpId && !r.paidAt)
  const selRows = refunds.filter(r => selected.has(r.id))
  const selTotal = selRows.reduce((s, r) => s + r.netAmount, 0)
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const createRfp = async () => {
    if (selRows.length === 0) return
    setCreatingRfp(true); setError('')
    try {
      const res = await fetch('/api/refunds/rfp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, refundIds: [...selected], manualSeq: rfpSeq.trim() || undefined }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create RFP') }
      setRfpOpen(false); setSelected(new Set()); setRfpSeq(''); await load()
      setTab('rfp')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create RFP') } finally { setCreatingRfp(false) }
  }

  const openBillingVoucher = async (rfp: Rfp) => {
    try {
      const r = await fetch(`/api/refunds/rfp?id=${rfp.id}&items=1`)
      const d = r.ok ? await r.json() : { lines: [] }
      const first = (d.lines || [])[0]
      setBvTarget({
        refNumber: rfp.refNumber, date: new Date(rfp.createdAt).toLocaleDateString('en-PH'), lines: d.lines || [], branch,
        defaultBilledTo: first?.payee || rfp.payableTo || '', defaultMemo: first?.memo || 'Patient refund',
        payment: {
          payee: first?.payee || rfp.payableTo || '',
          purpose: first?.memo || 'patient refund',
          paymentMode: rfp.paymentMethod || '',
        },
      })
    } catch { setError('Failed to build billing voucher') }
  }

  const openPay = (rfp: Rfp) => { setPayTarget(rfp); setPayDate(todayStr()); setPayMethod('Bank Transfer'); setPayBankId(''); setPayCheck(''); setPayProof('') }
  const recordPaid = async () => {
    if (!payTarget) return
    if (!payBankId) { setError('Select the cash/bank account'); return }
    setPaying(true); setError('')
    try {
      const res = await fetch('/api/refunds/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: payTarget.id, action: 'pay', datePaid: payDate, paymentMethod: payMethod, paymentBankAccountId: payBankId, checkNumber: payCheck || null, proofUrl: payProof || null }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to record payment') }
      setPayTarget(null); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to record payment') } finally { setPaying(false) }
  }
  const unpayRfp = async (rfp: Rfp) => {
    if (!confirm(`Reverse payment for ${rfp.refNumber}? The refund journal entry (DR Unearned Revenue / CR Cash) will be deleted.`)) return
    const res = await fetch('/api/refunds/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'unpay' }) })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed') }
  }
  const deleteRfp = async (rfp: Rfp) => {
    if (!confirm(`Delete RFP ${rfp.refNumber}? Its refunds are released back to the list${rfp.status === 'PAID' ? ' and the journal entry is reversed' : ''}.`)) return
    const res = await fetch(`/api/refunds/rfp?id=${rfp.id}`, { method: 'DELETE' })
    if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to delete') }
  }

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Undo2 size={22} style={{ color: 'var(--teal)' }} /> Refunds
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Patient refunds of prepaid therapy balances. Audit each refund, group them into an RFP, then record the payment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {BRANCHES.map(b => (
            <button key={b.value} onClick={() => setBranch(b.value)} aria-pressed={branch === b.value}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === b.value
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{b.label}</button>
          ))}
          <span className="w-px h-6 mx-1" style={{ background: 'var(--light-gray)' }} />
          <button onClick={() => { setTab('refunds'); openNew() }} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> New refund
          </button>
        </div>
      </div>

      <details className="rounded-lg border px-4 py-2.5 text-xs group" style={{ borderColor: 'var(--light-gray)', background: '#fcfdfa', color: 'var(--mid-gray)' }}>
        <summary className="cursor-pointer select-none font-semibold flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
          <Info size={13} style={{ color: 'var(--teal)' }} /> How refunds post
        </summary>
        <p className="mt-2">On RFP payment we post <strong>DR 4055 Refunds of Unearned Revenue / CR Cash</strong>. 4055 is a contra account to 4050 Unearned Revenue, so refunds reduce the liability on the balance sheet and never hit the income statement or the Expense Report.</p>
        <p className="mt-1.5">East, Greenhills and Aura Health Institute only. <strong>Verdana Store is not handled here</strong>: its merchandise returns already come through POS / bulk upload and appear in the Income Statement under <strong>7160 Sales Returns</strong>.</p>
      </details>

      {/* Status cards: every refund falls in exactly one */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATE_KEYS.map(k => {
          const s = REFUND_STATES[k]
          const rows = byState[k]
          return (
            <StatCard key={k} compact loading={loading} label={s.label} value={formatCurrency(sumNet(rows))}
              sub={`${rows.length} refund${rows.length === 1 ? '' : 's'} · ${s.hint}`}
              tone={rows.length ? s.tone : 'zero'} accent={rows.length && s.accent ? s.accent : undefined}
              active={tab === 'refunds' && stateFilter === k}
              onClick={() => { setTab('refunds'); setStateFilter(f => f === k ? '' : k) }} />
          )
        })}
      </div>

      {error && <div className="px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>}

      {/* Tabs */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist">
        {([['refunds', 'Refunds', refunds.length], ['rfp', 'RFP', rfps.length]] as const).map(([v, label, n]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[var(--teal)] flex items-center gap-1.5"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>
            {label}
            {!loading && <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: tab === v ? 'var(--pale-teal)' : '#f1f5f2', color: tab === v ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>{n}</span>}
          </button>
        ))}
      </div>
      </div>

      {/* ── REFUNDS ── */}
      {tab === 'refunds' && (
        <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or reason…"
                className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            {stateFilter && (
              <button onClick={() => setStateFilter('')} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold"
                style={{ background: REFUND_STATES[stateFilter].pill.bg, color: REFUND_STATES[stateFilter].pill.fg }}>
                {REFUND_STATES[stateFilter].label} <X size={12} />
              </button>
            )}
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} of {refunds.length}</span>
            <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {STATE_KEYS.map(k => <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: REFUND_STATES[k].line }} />{REFUND_STATES[k].label}</span>)}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
              <span className="text-xs" style={{ color: 'var(--charcoal)' }}>Selected <strong className="font-mono" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(selTotal)}</strong> · {selected.size} refund{selected.size === 1 ? '' : 's'}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(new Set())} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Clear</button>
                <button onClick={() => setRfpOpen(true)} className={hrBtn.primary} style={{ background: 'var(--teal)' }}><BadgeDollarSign size={14} /> Generate RFP</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  <th className="text-center px-2 py-2.5 w-10"><input type="checkbox" aria-label="Select all refunds ready for an RFP" disabled={shownEligible.length === 0} checked={shownEligible.length > 0 && shownEligible.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(shownEligible.map(r => r.id)) : new Set())} /></th>
                  <th className={TH}>Date</th>
                  <th className={TH}>Patient</th>
                  <th className={`${TH} text-right`}>Refund amount</th>
                  <th className={`${TH} text-right`}>Charges deducted</th>
                  <th className={`${TH} text-right`}>Net to patient</th>
                  <th className={`${TH} text-center`}>Proof</th>
                  <th className={`${TH} text-center`}>Audited</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [0, 1, 2, 3].map(i => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={10} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
                ) : shown.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                    {refunds.length === 0 ? <>No refunds for this branch yet. Click <strong>New refund</strong> to add one.</> : 'No refunds match this filter.'}
                  </td></tr>
                ) : shown.map(r => {
                  const locked = !!r.refundRfpId
                  const st = REFUND_STATES[refundState(r)]
                  const canTick = r.audited && !locked && !r.paidAt
                  return (
                    <tr key={r.id} className="border-t transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
                      <td className="text-center px-2 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${st.line}` }}>
                        <input type="checkbox" aria-label={`Select refund for ${r.patientName}`} disabled={!canTick} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{r.date.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{r.patientName}{r.reason ? <span className="block text-[11px] font-normal" style={{ color: 'var(--mid-gray)' }}>{r.reason}</span> : null}</td>
                      <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.refundAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap" style={{ color: r.chargesDeducted ? 'var(--charcoal)' : 'var(--hr-faint)' }}>{formatCurrency(r.chargesDeducted)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(r.netAmount)}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {(r.proofUrls || []).length ? (r.proofUrls || []).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="inline-flex mx-0.5 p-1 rounded hover:bg-[var(--pale-teal)]" title={`View proof ${i + 1}`}><Paperclip size={13} style={{ color: 'var(--teal)' }} /></a>) : <span style={{ color: 'var(--hr-faint)' }}>—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => !locked && toggleAudit(r)} disabled={locked} title={locked ? 'Locked while in an RFP' : r.audited ? 'Audited · click to undo' : 'Mark as audited'} className="disabled:cursor-default">
                          {r.audited ? <CheckCircle2 size={17} className="inline" style={{ color: '#059669' }} /> : <Circle size={17} className="inline" style={{ color: 'var(--hr-faint)' }} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: st.pill.bg, color: st.pill.fg }}>
                          {refundState(r) === 'inRfp' && r.rfpRefNumber ? `In RFP ${r.rfpRefNumber}` : st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {!locked && <button onClick={() => openEdit(r)} className="text-[11px] font-semibold mr-2 hover:underline" style={{ color: 'var(--teal)' }}>Edit</button>}
                        {!locked && <button onClick={() => deleteRefund(r)} title="Delete" aria-label={`Delete refund for ${r.patientName}`} className="p-1 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-500 inline" /></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {!loading && shown.length > 0 && (
                <tfoot>
                  <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                    <td />
                    <td colSpan={2} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Total · {shown.length} refund{shown.length === 1 ? '' : 's'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{formatCurrency(shown.reduce((s, r) => s + r.refundAmount, 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{formatCurrency(shown.reduce((s, r) => s + r.chargesDeducted, 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(sumNet(shown))}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── RFP LIST ── */}
      {tab === 'rfp' && (
        <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b text-xs" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <span><strong style={{ color: 'var(--charcoal)' }}>{rfps.length}</strong> refund RFP{rfps.length === 1 ? '' : 's'}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#d97706' }} />{rfps.filter(r => r.status !== 'PAID').length} awaiting payment</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#059669' }} />{rfps.filter(r => r.status === 'PAID').length} paid</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  <th className={TH}>RFP number</th>
                  <th className={TH}>Date</th>
                  <th className={TH}>Payable to</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [0, 1, 2].map(i => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={6} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
                ) : rfps.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>No refund RFPs yet. Tick audited refunds on the Refunds tab and click <strong>Generate RFP</strong>.</td></tr>
                ) : rfps.map(r => {
                  const paid = r.status === 'PAID'
                  return (
                    <tr key={r.id} className="border-t transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
                      <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${paid ? '#059669' : '#d97706'}` }}>{r.refNumber}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--charcoal)' }}>{r.payableTo || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(r.payableTotal)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={paid ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{paid ? 'Paid' : 'Awaiting payment'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button onClick={() => openBillingVoucher(r)} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} title="Billing Voucher"><FileText size={13} /> BV</button>
                          {!paid
                            ? <button onClick={() => openPay(r)} className={hrBtn.ghost} style={{ borderColor: 'var(--teal)', color: 'var(--deep-teal)' }}><Receipt size={13} /> Record as paid</button>
                            : <button onClick={() => unpayRfp(r)} className={hrBtn.ghost} style={{ borderColor: '#fcd34d', color: '#b45309' }}>Unpay</button>}
                          <button onClick={() => deleteRfp(r)} title="Delete" aria-label={`Delete ${r.refNumber}`} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-500" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New/Edit Refund modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{editId ? 'Edit Refund' : 'New Refund'}</h2><button onClick={() => setFormOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <div className="space-y-3 text-xs">
              <div className="relative">
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Patient (search CRM)</label>
                <input value={fPatient} onChange={e => searchPatients(e.target.value)} onFocus={() => setPOpen(true)} onBlur={() => setTimeout(() => setPOpen(false), 150)} placeholder="Type patient name…" className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
                {pOpen && pMatches.length > 0 && (
                  <div className="absolute z-[80] left-0 right-0 mt-0.5 rounded-lg border bg-white shadow-xl overflow-auto" style={{ maxHeight: 200, borderColor: 'var(--light-gray)' }}>
                    {pMatches.map(p => (
                      <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); setFPatient(p.name); setFPatientId(p.id); setPOpen(false) }} className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                        <div className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{p.name}</div>
                        {(p.email || p.phone) && <div className="text-[10px] truncate" style={{ color: 'var(--mid-gray)' }}>{[p.email, p.phone].filter(Boolean).join(' · ')}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Reason (optional)</label><input value={fReason} onChange={e => setFReason(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. cancelled package" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Refund Amount</label><input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="0.00" /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Charges Deducted</label><input type="number" value={fCharges} onChange={e => setFCharges(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} placeholder="0.00" /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Net to Patient</label><div className="w-full px-3 py-2.5 rounded-xl border font-mono font-semibold" style={{ borderColor: fChargesTooBig ? '#dc2626' : 'var(--light-gray)', background: 'var(--off-white)', color: fChargesTooBig ? '#dc2626' : 'var(--deep-teal)' }}>{formatCurrency(Math.max(0, fNet))}</div></div>
              </div>
              {fChargesTooBig && <p className="text-[11px] text-red-600">Charges deducted cannot exceed the refund amount.</p>}
              {fChg > 0 && !fChargesTooBig && (
                <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>On payment this posts <strong>DR 4055 Refunds of Unearned Revenue {formatCurrency(fGross)}</strong> / CR Cash {formatCurrency(fNet)} / CR 7220 Other Comprehensive Income {formatCurrency(fChg)} (charges retained).</p>
              )}
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Proof (file or QR phone upload)</label>
                <ScanUpload section="refund" prefix="refund" existingCount={fProofs.length} onUploaded={(url) => setFProofs(prev => [...prev, url])} />
                {fProofs.length > 0 && <div className="mt-1 flex flex-wrap gap-2">{fProofs.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: 'var(--teal)' }}>Proof {i + 1}</a>)}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={saveRefund} disabled={saving || !fPatient.trim() || fChargesTooBig} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{saving ? <Loader2 size={13} className="animate-spin" /> : 'Save Refund'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Generate RFP modal */}
      {rfpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate Refund RFP</h2><button onClick={() => setRfpOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{selRows.length} refund{selRows.length === 1 ? '' : 's'} · total <strong>{formatCurrency(selTotal)}</strong>. Creates an RFP under Refunds → RFP and locks these rows until paid (or the RFP is deleted).</p>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>RFP Number (optional)</label>
            <input value={rfpSeq} onChange={e => setRfpSeq(e.target.value)} placeholder="e.g. 000007" className="w-full px-3 py-2.5 rounded-xl border text-sm mb-4" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={createRfp} disabled={creatingRfp} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{creatingRfp ? <Loader2 size={15} className="inline animate-spin" /> : 'Generate RFP'}</button>
          </div>
        </div>
      )}

      {/* Record as Paid modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Record RFP as Paid — {payTarget.refNumber}</h2><button onClick={() => setPayTarget(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
            {(() => {
              const rows = refunds.filter(r => r.refundRfpId === payTarget.id)
              const gross = rows.reduce((s, r) => s + r.refundAmount, 0)
              const chg = rows.reduce((s, r) => s + r.chargesDeducted, 0)
              const net = rows.reduce((s, r) => s + r.netAmount, 0) || payTarget.payableTotal
              return (
                <div className="text-xs mb-3 rounded-lg border p-2.5" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  <div className="font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Journal entry on payment</div>
                  <div className="flex justify-between"><span>DR 4055 Refunds of Unearned Revenue <em>(contra to 4050)</em></span><span className="font-mono">{formatCurrency(gross || net)}</span></div>
                  <div className="flex justify-between"><span className="pl-3">CR {banks.find(b => b.id === payBankId)?.accountTitle || 'Cash / Bank'}</span><span className="font-mono">{formatCurrency(net)}</span></div>
                  {chg > 0 && <div className="flex justify-between"><span className="pl-3">CR 7220 Other Comprehensive Income <em>(charges retained)</em></span><span className="font-mono">{formatCurrency(chg)}</span></div>}
                  <div className="mt-1 text-[11px]">No revenue is reversed — the prepayment was never recognised as income, so 7160 Sales Returns (merchandise returns) is not touched.</div>
                </div>
              )
            })()}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Date Paid</label><input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Method</label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Cash / Bank Account (credited)</label><select value={payBankId} onChange={e => setPayBankId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}><option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} · {b.accountTitle}</option>)}</select></div>
              <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Check / Ref No. (optional)</label><input value={payCheck} onChange={e => setPayCheck(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Proof (optional)</label><ScanUpload section="refund-payment" prefix="refund-payment" onUploaded={(url) => setPayProof(url)} />{payProof && <a href={payProof} target="_blank" rel="noreferrer" className="text-[11px] underline mt-1 inline-block" style={{ color: 'var(--teal)' }}>View proof</a>}</div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setPayTarget(null)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={recordPaid} disabled={paying || !payBankId} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--deep-teal)' }}>{paying ? <Loader2 size={13} className="animate-spin" /> : <><Receipt size={13} /> Record Paid</>}</button>
            </div>
          </div>
        </div>
      )}

      {bvTarget && <BillingVoucherModal refNumber={bvTarget.refNumber} date={bvTarget.date} lines={bvTarget.lines} branch={bvTarget.branch} defaultBilledTo={bvTarget.defaultBilledTo} defaultMemo={bvTarget.defaultMemo} payment={bvTarget.payment} preparedBy={session?.user?.name || ''} onClose={() => setBvTarget(null)} />}
    </div>
  )
}
