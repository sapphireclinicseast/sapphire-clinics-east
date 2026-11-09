'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HandCoins, Plus, Loader2, X, Trash2, Eye } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { ScanUpload } from '@/components/ScanUpload'
import { DownloadBar } from '@/components/DownloadBar'
import { NameCombobox } from '@/components/NameCombobox'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import { downloadXlsx, downloadPdf, inDateRange, type ExportFormat } from '@/lib/export'

const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East', short: 'SBEA' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills', short: 'SBGH' },
  { value: 'VERDANA_STORE', label: 'Verdana', short: 'VERDANA' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute', short: 'AHI' },
]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0)

// Mirror the Expense-entry field vocabulary so liquidation captures the same info.
const DEPARTMENTS = ['ADMIN', 'PT', 'OT', 'SLP', 'SPED', 'PSYCH', 'MD', 'ORTHOSIS']
const VATABLE = ['VAT', 'Non-VAT']
const VALIDITY = ['Valid', 'Invalid', 'Cancelled']
const digitsOnly = (s: string) => (s || '').replace(/\D/g, '')
const formatTin = (raw: string) => {
  const d = digitsOnly(raw).slice(0, 14)
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean).join('-')
}

interface Supplier { id: string | null; registeredName: string; registeredAddress: string; tin: string }

// Payee/supplier typeahead — picks an existing supplier (autofills name/address/TIN) or free-types a new one.
function SupplierCombo({ value, suppliers, onCommit }: { value: string; suppliers: Supplier[]; onCommit: (val: string, sup: Supplier | null) => void }) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setDraft(value) }, [value])
  const q = draft.trim().toLowerCase()
  const matches = suppliers.filter(s => !q || s.registeredName.toLowerCase().includes(q)).slice(0, 40)
  const commit = (val: string) => onCommit(val, suppliers.find(s => s.registeredName.trim().toLowerCase() === val.trim().toLowerCase()) || null)
  return (
    <div className="relative">
      <input ref={ref} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} value={draft} placeholder="Payee / supplier…"
        onFocus={() => setOpen(true)}
        onChange={e => { setDraft(e.target.value); setOpen(true) }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 150); commit(draft) }}
        onKeyDown={e => { if (e.key === 'Enter') { setOpen(false); commit(draft); (e.target as HTMLInputElement).blur() } else if (e.key === 'Escape') setOpen(false) }} />
      {open && matches.length > 0 && (
        <div className="absolute z-[80] left-0 right-0 mt-0.5 rounded-lg border bg-white shadow-xl overflow-auto" style={{ maxHeight: 200, borderColor: 'var(--light-gray)' }}>
          {matches.map(s => (
            <button key={(s.id || '') + s.registeredName} type="button" onMouseDown={e => { e.preventDefault(); setDraft(s.registeredName); setOpen(false); onCommit(s.registeredName, s) }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{s.registeredName}</div>
              {(s.tin || s.registeredAddress) && <div className="text-[10px] truncate" style={{ color: 'var(--mid-gray)' }}>{[s.tin, s.registeredAddress].filter(Boolean).join(' · ')}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Advance {
  id: string; refNumber: string; branch: string; accountableName: string; purpose: string
  dateReleased: string; amount: number; status: string
  liquidated: number; returned: number; reimbursed: number; outstanding: number; createdAt: string
}
interface Bank { id: string; accountNumber: string; accountTitle: string }

export default function CashAdvancesPage() {
  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [rows, setRows] = useState<Advance[]>([])
  const [loading, setLoading] = useState(true)
  const [showRelease, setShowRelease] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [banks, setBanks] = useState<Bank[]>([])
  const [dlFrom, setDlFrom] = useState(''); const [dlTo, setDlTo] = useState('')
  const [tab, setTab] = useState<'advances' | 'flowchart'>('advances')

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'dateReleased', dir: 'desc' })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'refNumber', label: 'Reference' }, { key: 'dateReleased', label: 'Date' }, { key: 'accountableName', label: 'Accountable' },
    { key: 'purpose', label: 'Purpose' }, { key: 'amount', label: 'Released' }, { key: 'liquidated', label: 'Liquidated' },
    { key: 'returned', label: 'Returned' }, { key: 'outstanding', label: 'Outstanding' }, { key: 'status', label: 'Status' },
  ]
  const get = (a: Advance, k: string): string | number =>
    k === 'dateReleased' ? String(a.dateReleased).slice(0, 10)
      : ['amount', 'liquidated', 'returned', 'outstanding'].includes(k) ? (a[k as keyof Advance] as number)
      : ((a[k as keyof Advance] as string | number) ?? '')
  const shown = applySortFilter(rows, get, sort.key, sort.dir, filters)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/cash-advances?branch=${branch}`); setRows(r.ok ? await r.json() : []) }
    catch { setRows([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])

  const deleteAdvance = async (a: Advance) => {
    if (!confirm(`Delete cash advance ${a.refNumber}${a.accountableName ? ` (${a.accountableName})` : ''}? All its liquidation/return lines are removed and every related journal entry is reversed. This cannot be undone.`)) return
    const r = await fetch(`/api/cash-advances?id=${a.id}`, { method: 'DELETE' })
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Failed to delete'); return }
    await load()
  }
  const exportRows = (fmt: ExportFormat) => {
    const rs = shown.filter(a => inDateRange(a.dateReleased, dlFrom, dlTo))
    const headers = ['Reference', 'Date', 'Accountable', 'Purpose', 'Released', 'Liquidated', 'Returned', 'Outstanding', 'Status']
    const body = rs.map(a => [a.refNumber, String(a.dateReleased).slice(0, 10), a.accountableName, a.purpose, a.amount.toFixed(2), a.liquidated.toFixed(2), a.returned.toFixed(2), a.outstanding.toFixed(2), a.status])
    if (fmt === 'xlsx') downloadXlsx(`cash-advances-${branch}`, [{ name: 'Cash Advances', headers, rows: body }])
    else downloadPdf({ title: 'Cash Advances', subtitle: `${BRANCHES.find(b => b.value === branch)?.label} · ${dlFrom || 'start'} → ${dlTo || 'end'}`, headers, rows: body, landscape: true })
  }

  const sum = (k: 'amount' | 'liquidated' | 'returned' | 'reimbursed' | 'outstanding', list: Advance[] = rows) => list.reduce((s, a) => s + a[k], 0)
  const openRows = rows.filter(a => a.status !== 'CLOSED')
  const closedRows = rows.filter(a => a.status === 'CLOSED')
  const reimbursedAll = sum('reimbursed')
  const setStatusFilter = (v: '' | 'OPEN' | 'CLOSED') => setFilters(f => ({ ...f, status: v }))
  const statusFilter = (filters.status || '').toUpperCase()

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      {/* SortFilterHead is shared; give its header the HR look on this page only. */}
      <style>{`.ca-grid thead th{background:var(--hr-head)!important;border-color:var(--hr-line)!important}.ca-grid thead th>button{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--mid-gray)}.ca-grid thead th input{background:#fff;border-color:var(--light-gray)}`}</style>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <HandCoins size={22} style={{ color: 'var(--teal)' }} /> Cash Advances
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Cash released to staff up front (event floats). Liquidate the receipts and return the unspent balance. Releases and returns go to Bank Reconciliation; liquidations go to the Income Statement.
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
          <button onClick={() => { setTab('advances'); setShowRelease(true) }} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> Release advance
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist">
        {([['advances', 'Advances'], ['flowchart', 'How it works']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[var(--teal)]"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>
      </div>

      {tab === 'flowchart' ? <CashAdvanceFlowchart /> : (<>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard compact loading={loading} label="Outstanding" value={`₱${peso(sum('outstanding', openRows))}`}
          sub={`${openRows.length} open advance${openRows.length === 1 ? '' : 's'} · click to show`}
          tone={openRows.length ? 'amber' : 'zero'} active={statusFilter === 'OPEN'}
          onClick={() => setStatusFilter(statusFilter === 'OPEN' ? '' : 'OPEN')} />
        <StatCard compact loading={loading} label="Released" value={`₱${peso(sum('amount'))}`}
          sub={`${rows.length} advance${rows.length === 1 ? '' : 's'}${reimbursedAll > 0.005 ? ` · ₱${peso(reimbursedAll)} reimbursed` : ''}`}
          tone="zero" accent={rows.length ? { line: '#4A8073' } : undefined} />
        <StatCard compact loading={loading} label="Liquidated" value={`₱${peso(sum('liquidated'))}`}
          sub="Receipts booked as expenses" tone={sum('liquidated') > 0.005 ? 'blue' : 'zero'} />
        <StatCard compact loading={loading} label="Closed" value={String(closedRows.length)}
          sub={`₱${peso(sum('returned'))} unspent cash returned`} tone={closedRows.length ? 'green' : 'zero'}
          active={statusFilter === 'CLOSED'} onClick={() => setStatusFilter(statusFilter === 'CLOSED' ? '' : 'CLOSED')} />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <div className="inline-flex rounded-lg border p-0.5 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            {([['', 'All'], ['OPEN', 'Open'], ['CLOSED', 'Closed']] as const).map(([v, label]) => (
              <button key={label} onClick={() => setStatusFilter(v)} aria-pressed={statusFilter === v}
                className="h-7 px-3 rounded-md text-xs font-semibold transition-colors"
                style={statusFilter === v ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}>{label}</button>
            ))}
          </div>
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} of {rows.length} · click a row to liquidate, return or reimburse</span>
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#d97706' }} />Open</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#059669' }} />Closed</span>
          </div>
        </div>
        <div className="overflow-auto ca-grid">
          <table className="w-full text-sm">
            <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {loading ? (
                [0, 1, 2].map(i => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={10} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
              ) : shown.map(a => {
                const closed = a.status === 'CLOSED'
                return (
                  <tr key={a.id} className="border-t cursor-pointer transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }} onClick={() => setDetailId(a.id)}>
                    <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${closed ? '#059669' : '#d97706'}` }}>{a.refNumber}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{String(a.dateReleased).slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>{a.accountableName}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{a.purpose}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(a.amount)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap" style={{ color: a.liquidated ? 'var(--charcoal)' : 'var(--hr-faint)' }}>₱{peso(a.liquidated)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap" style={{ color: a.returned ? 'var(--charcoal)' : 'var(--hr-faint)' }}>₱{peso(a.returned)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: a.outstanding > 0.005 ? '#b45309' : a.outstanding < -0.005 ? '#dc2626' : '#047857' }}>₱{peso(a.outstanding)}</td>
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={closed ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{closed ? 'Closed' : 'Open'}</span></td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={e => { e.stopPropagation(); setDetailId(a.id) }} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--deep-teal)' }}>Manage</button>
                      <button onClick={e => { e.stopPropagation(); deleteAdvance(a) }} title="Delete advance" aria-label={`Delete ${a.refNumber}`} className="ml-1.5 p-1.5 rounded hover:bg-red-50 align-middle"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                  {rows.length === 0 ? <>No cash advances for this branch yet. Click <strong>Release advance</strong> to record one.</> : 'No advances match these filters.'}
                </td></tr>
              )}
            </tbody>
            {!loading && shown.length > 0 && (
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                  <td colSpan={4} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Total · {shown.length} advance{shown.length === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(sum('amount', shown))}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(sum('liquidated', shown))}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(sum('returned', shown))}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(sum('outstanding', shown))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="border-t px-4 py-2.5" style={{ borderColor: 'var(--light-gray)', background: '#fcfdfa' }}>
          <DownloadBar from={dlFrom} to={dlTo} onFrom={setDlFrom} onTo={setDlTo} onExport={exportRows} dateLabel="Release date" note={`${shown.filter(a => inDateRange(a.dateReleased, dlFrom, dlTo)).length} in range`} />
        </div>
      </div>
      </>)}

      {showRelease && <ReleaseModal branch={branch} banks={banks} onClose={() => setShowRelease(false)} onSaved={async () => { setShowRelease(false); await load() }} />}
      {detailId && <DetailModal id={detailId} banks={banks} branch={branch} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  )
}

function ReleaseModal({ branch, banks, onClose, onSaved }: { branch: string; banks: Bank[]; onClose: () => void; onSaved: () => void }) {
  const [accountableName, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dateReleased, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [sourceAccountId, setSource] = useState('')
  const [staff, setStaff] = useState<string[]>([])
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const sh = BRANCHES.find(b => b.value === branch)?.short || ''
    fetch(`/api/pos/staff${sh ? `?branch=${sh}` : ''}`).then(r => r.ok ? r.json() : [])
      .then((d: unknown) => {
        const list = (Array.isArray(d) ? d : ((d as { staff?: unknown[] })?.staff ?? [])) as { name?: string }[]
        setStaff([...new Set(list.map(s => s.name || '').filter(Boolean))])
      }).catch(() => setStaff([]))
  }, [branch])
  const save = async () => {
    if (!accountableName.trim() || !purpose.trim() || !(num(amount) > 0) || !sourceAccountId) { alert('Fill accountable staff, purpose, a valid amount, and the source bank.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/cash-advances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, accountableName, purpose, dateReleased, amount: num(amount), sourceAccountId, proofUrls }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Release Cash Advance</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Accountable staff</label>
        <div className="mb-3"><NameCombobox value={accountableName} onChange={setName} options={staff} placeholder="Type or pick a staff name…" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} /></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Purpose / Event</label>
        <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Team building — emergency fund" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date released</label><input type="date" value={dateReleased} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full px-3 py-2 rounded-xl border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} /></div>
        </div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Source bank account</label>
        <select value={sourceAccountId} onChange={e => setSource(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-4" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Proof <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(acknowledgement receipt, approval memo… — you can add more than one)</span></label>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {proofUrls.map((u, i) => (
            <span key={u} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> Proof {i + 1}</a>
              <button onClick={() => setProofUrls(p => p.filter(x => x !== u))}><X size={12} style={{ color: '#dc2626' }} /></button>
            </span>
          ))}
          <ScanUpload compact section="cash-advance" prefix={`CA-${dateReleased}-${accountableName || 'release'}`}
            existingCount={proofUrls.length} label="Add proof" onUploaded={url => setProofUrls(p => [...p, url])} />
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Release advance'}</button>
      </div>
    </div>
  )
}

interface Line { id: string; kind: string; date: string; accountTitle: string | null; description: string | null; vatable: string | null; amount: number; siNumber: string | null; registeredName: string | null; registeredAddress: string | null; tinNumber: string | null; requestor: string | null; department: string | null; validity: string | null; hasEwt: boolean; ewtRate: number | null; proofUrl: string | null; bankAccountId: string | null }
interface Detail { id: string; refNumber: string; accountableName: string; purpose: string; amount: number; status: string; liquidated: number; returned: number; reimbursed: number; outstanding: number; proofUrls: string[] | null; lines: Line[] }

function DetailModal({ id, banks, branch, onClose, onChanged }: { id: string; banks: Bank[]; branch: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [expAccts, setExpAccts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ kind: 'LIQUIDATION', date: new Date().toISOString().slice(0, 10), accountTitle: '', description: '', vatable: 'Non-VAT', amount: '', siNumber: '', requestor: '', department: '', validity: 'Valid', tinNumber: '', registeredName: '', registeredAddress: '', hasEwt: false, ewtRate: '', bankAccountId: '', proofUrl: '' })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [newSupplierPrompt, setNewSupplierPrompt] = useState<{ registeredName: string; registeredAddress: string; tin: string } | null>(null)

  const load = useCallback(async () => { const r = await fetch(`/api/cash-advances?id=${id}`); if (r.ok) setD(await r.json()) }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/chart-of-accounts?accountType=EXPENSE&pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(j => setExpAccts(((j.data || []) as { accountTitle: string }[]).map(a => a.accountTitle))).catch(() => {}) }, [])
  const loadSuppliers = useCallback(() => { fetch(`/api/expenses/suppliers?branch=${branch}&all=1`).then(r => r.ok ? r.json() : { suppliers: [] }).then(d => setSuppliers(d.suppliers || [])).catch(() => setSuppliers([])) }, [branch])
  useEffect(() => { loadSuppliers() }, [loadSuppliers])
  const confirmAddSupplier = async () => {
    if (!newSupplierPrompt) return
    try { const r = await fetch('/api/expenses/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, ...newSupplierPrompt }) }); if (r.ok) loadSuppliers() } catch { /* ignore */ }
    setNewSupplierPrompt(null)
  }

  const addLine = async () => {
    if (!(num(form.amount) > 0)) { alert('Enter a valid amount.'); return }
    if (form.kind === 'LIQUIDATION' && !form.accountTitle) { alert('Choose an expense account.'); return }
    if (form.kind !== 'LIQUIDATION' && !form.bankAccountId) { alert('Choose the bank account.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/cash-advances/lines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ advanceId: id, ...form, ewtRate: form.hasEwt ? Number(form.ewtRate) || null : null, amount: num(form.amount) }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      // Offer to save a brand-new supplier — same as an expense entry.
      const supName = form.registeredName.trim()
      if (form.kind === 'LIQUIDATION' && supName && !suppliers.some(s => s.registeredName.trim().toLowerCase() === supName.toLowerCase())) {
        setNewSupplierPrompt({ registeredName: supName, registeredAddress: form.registeredAddress.trim(), tin: form.tinNumber.trim() })
      }
      setForm(f => ({ ...f, amount: '', description: '', siNumber: '', requestor: '', tinNumber: '', registeredName: '', registeredAddress: '', hasEwt: false, ewtRate: '', proofUrl: '', accountTitle: '' }))
      await load(); onChanged()
    } finally { setBusy(false) }
  }
  const delLine = async (lid: string) => { if (!confirm('Remove this line? Its journal entry is reversed.')) return; await fetch(`/api/cash-advances/lines?id=${lid}`, { method: 'DELETE' }); await load(); onChanged() }
  const delAdvance = async () => {
    if (!confirm('Delete this entire cash advance, including all its liquidation/return lines? Every related journal entry is reversed. This cannot be undone.')) return
    const r = await fetch(`/api/cash-advances?id=${id}`, { method: 'DELETE' })
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Failed to delete'); return }
    onChanged(); onClose()
  }

  const isLiq = form.kind === 'LIQUIDATION'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        {!d ? <div className="py-10 text-center"><Loader2 size={18} className="inline animate-spin" /></div> : (<>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{d.refNumber} · {d.accountableName}</h2>
            <div className="flex items-center gap-2">
              <button onClick={delAdvance} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: '#fecaca', color: '#dc2626' }}><Trash2 size={13} /> Delete advance</button>
              <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>{d.purpose}</p>
          {Array.isArray(d.proofUrls) && d.proofUrls.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>Release proof:</span>
              {d.proofUrls.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><Eye size={12} /> Proof {i + 1}</a>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[['Released', d.amount], ['Liquidated', d.liquidated], ['Returned', d.returned], ['Outstanding', d.outstanding]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border p-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}><p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{k as string}</p><p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(v as number)}</p></div>
            ))}
          </div>

          <div className="rounded-xl border overflow-auto mb-4" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}><th className="px-2 py-1.5 text-left">Type</th><th className="px-2 py-1.5 text-left">Date</th><th className="px-2 py-1.5 text-left">Account / Bank</th><th className="px-2 py-1.5 text-left">Supplier</th><th className="px-2 py-1.5 text-left">TIN</th><th className="px-2 py-1.5 text-left">Description</th><th className="px-2 py-1.5 text-left">SI/OR</th><th className="px-2 py-1.5 text-right">Amount</th><th className="px-2 py-1.5"></th></tr></thead>
              <tbody>
                {d.lines.map(l => (
                  <tr key={l.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: l.kind === 'LIQUIDATION' ? '#fef3c7' : l.kind === 'RETURN' ? '#dcfce7' : '#fee2e2', color: l.kind === 'LIQUIDATION' ? '#92400e' : l.kind === 'RETURN' ? '#166534' : '#b91c1c' }}>{l.kind}</span></td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{String(l.date).slice(0, 10)}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--charcoal)' }}>{l.accountTitle || (banks.find(b => b.id === l.bankAccountId)?.accountTitle) || '—'}{l.vatable === 'VAT' ? ' · VAT' : ''}{l.hasEwt && l.ewtRate ? ` · EWT ${l.ewtRate}%` : ''}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{l.registeredName || '—'}</td>
                    <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--mid-gray)' }}>{l.tinNumber || ''}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{l.description || ''}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{l.siNumber || ''}</td>
                    <td className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(l.amount)}</td>
                    <td className="px-2 py-1.5 text-right">{l.proofUrl && <a href={l.proofUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex mr-1" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>}<button onClick={() => delLine(l.id)}><Trash2 size={12} style={{ color: '#dc2626' }} /></button></td>
                  </tr>
                ))}
                {d.lines.length === 0 && <tr><td colSpan={9} className="text-center py-4" style={{ color: 'var(--mid-gray)' }}>No liquidation/return lines yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <div className="flex items-center gap-2 mb-2">
              {(['LIQUIDATION', 'RETURN', 'REIMBURSE'] as const).map(k => (
                <button key={k} onClick={() => setForm(f => ({ ...f, kind: k }))} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={form.kind === k ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>{k === 'LIQUIDATION' ? 'Liquidate' : k === 'RETURN' ? 'Return' : 'Reimburse'}</button>
              ))}
            </div>
            <p className="text-[11px] mb-2 px-2 py-1.5 rounded-lg" style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
              {form.kind === 'LIQUIDATION'
                ? <><b style={{ color: 'var(--charcoal)' }}>Liquidate</b> — record what the staff actually spent (attach the receipt). This converts the advance into an expense.</>
                : form.kind === 'RETURN'
                  ? <><b style={{ color: 'var(--charcoal)' }}>Return</b> — the staff gives back the <b>unspent</b> portion of the float. Money comes <b>back into</b> the company bank. Use when they spent <b>less</b> than released.</>
                  : <><b style={{ color: 'var(--charcoal)' }}>Reimburse</b> — the company pays the staff back for spending their <b>own</b> money beyond the float. Money goes <b>out of</b> the company bank. Use when they spent <b>more</b> than released.</>}
            </p>
            {isLiq ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="col-span-2 sm:col-span-1"><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Payee / Supplier</label>
                  <SupplierCombo value={form.requestor} suppliers={suppliers} onCommit={(val, sup) => setForm(f => ({
                    ...f, requestor: val,
                    registeredName: sup ? sup.registeredName : (f.registeredName || val),
                    registeredAddress: sup?.registeredAddress ? sup.registeredAddress : f.registeredAddress,
                    tinNumber: sup?.tin && !f.tinNumber ? sup.tin : f.tinNumber,
                  }))} />
                </div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Department</label><select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}><option value=""></option>{DEPARTMENTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}</select></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Registered name</label><input value={form.registeredName} onChange={e => setForm(f => ({ ...f, registeredName: e.target.value }))} placeholder="BIR-registered name" className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div className="col-span-2 sm:col-span-1"><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Registered address</label><input value={form.registeredAddress} onChange={e => setForm(f => ({ ...f, registeredAddress: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>TIN</label><input value={form.tinNumber} onChange={e => setForm(f => ({ ...f, tinNumber: formatTin(e.target.value) }))} placeholder="XXX-XXX-XXX-XXXXX" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Validity</label><select value={form.validity} onChange={e => setForm(f => ({ ...f, validity: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>{VALIDITY.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>VAT</label><select value={form.vatable} onChange={e => setForm(f => ({ ...f, vatable: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>{VATABLE.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>SI / OR #</label><input value={form.siNumber} onChange={e => setForm(f => ({ ...f, siNumber: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Gross amount</label><input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} inputMode="decimal" placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div className="col-span-2 sm:col-span-1"><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Expense account</label><NameCombobox value={form.accountTitle} onChange={v => setForm(f => ({ ...f, accountTitle: v }))} options={expAccts} placeholder="Account title…" className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>EWT</label><select value={form.hasEwt ? 'Yes' : 'No'} onChange={e => { const yes = e.target.value === 'Yes'; setForm(f => ({ ...f, hasEwt: yes, ewtRate: yes ? (f.ewtRate || '5') : '' })) }} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}><option value="No">No</option><option value="Yes">Yes</option></select></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>EWT rate</label><select value={form.ewtRate} disabled={!form.hasEwt} onChange={e => setForm(f => ({ ...f, ewtRate: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs disabled:opacity-50" style={{ borderColor: 'var(--light-gray)' }}><option value=""></option><option value="5">5%</option><option value="10">10%</option></select></div>
                <div className="col-span-2 sm:col-span-3"><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>Amount</label><input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} inputMode="decimal" placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div className="col-span-2"><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>{form.kind === 'RETURN' ? 'Return to bank' : 'Reimburse from bank'}</label><select value={form.bankAccountId} onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}><option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <ScanUpload compact section="cash-advance" prefix={`${d.refNumber}-LIQ`} label={form.proofUrl ? 'Proof ✓' : 'Proof'}
                onUploaded={url => setForm(f => ({ ...f, proofUrl: url }))} />
              <button onClick={addLine} disabled={busy} className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? 'Saving…' : `Add ${form.kind === 'LIQUIDATION' ? 'liquidation' : form.kind === 'RETURN' ? 'return' : 'reimbursement'}`}</button>
            </div>
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>Branch: {BRANCHES.find(b => b.value === branch)?.label}. Liquidations post to the Income Statement; returns/reimbursements post to the bank for reconciliation.{isLiq && ' EWT is recorded for BIR reporting only — it does not change the amount charged against the float.'}</p>
        </>)}
      </div>

      {newSupplierPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setNewSupplierPrompt(null)}>
          <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Add to Suppliers?</h2>
            <p className="text-sm mb-1" style={{ color: 'var(--mid-gray)' }}>This supplier isn&apos;t in your Suppliers list yet:</p>
            <div className="rounded-xl border p-3 mb-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{newSupplierPrompt.registeredName}</div>
              {newSupplierPrompt.registeredAddress && <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{newSupplierPrompt.registeredAddress}</div>}
              {newSupplierPrompt.tin && <div className="text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>TIN {newSupplierPrompt.tin}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNewSupplierPrompt(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>No, skip</button>
              <button onClick={confirmAddSupplier} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Yes, add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Process flowchart for accounting staff.
function CashAdvanceFlowchart() {
  const steps = [
    { n: 1, title: 'Release the advance', who: 'Admin / Accountant / Bookkeeper', desc: 'Cash is handed to a staff member up front for an event (e.g. ₱10,000). Record it here with the accountable staff, purpose, amount and source bank.', je: 'DR 1160 Due from Employees  /  CR Bank', tag: 'Bank Reconciliation (money out)' },
    { n: 2, title: 'Staff spends within the float', who: 'Accountable staff', desc: 'During the event the staff spends against the advance and keeps the receipts (e.g. ₱9,800). No entry yet — the cash is still an advance owed by the staff.', je: null, tag: null },
    { n: 3, title: 'Liquidate the receipts', who: 'Accountant / Bookkeeper', desc: 'In the advance detail, add each receipt: expense account, VAT/Non-VAT, SI/OR number, supplier and proof. This converts the advance into actual expenses.', je: 'DR Expense (net) [+ DR 1040 Input VAT]  /  CR 1160 Due from Employees', tag: 'Income Statement + Expense Report (source: Cash Advance)' },
    { n: 4, title: 'Return the unspent cash', who: 'Accountable staff', desc: 'The remaining balance (e.g. ₱200) is deposited back to the company bank. Record it as a Return in the advance detail.', je: 'DR Bank  /  CR 1160 Due from Employees', tag: 'Bank Reconciliation (money in)' },
    { n: 5, title: 'If overspent — reimburse the staff', who: 'Accountant / Bookkeeper', desc: 'When the staff spends more than the float, the company pays back the excess. Record it as a Reimburse in the advance detail.', je: 'DR 1160 Due from Employees  /  CR Bank', tag: 'Bank Reconciliation (money out)' },
    { n: 6, title: 'Advance closes', who: '', desc: 'When Outstanding = Released + Reimbursed − Liquidated − Returned reaches ₱0, the advance is marked Closed. The Due from Employees balance nets to zero.', je: null, tag: null },
  ]
  return (
    <div className="rounded-lg border bg-white p-6" style={{ borderColor: 'var(--light-gray)' }}>
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Cash Advance Workflow</h2>
      <p className="text-xs mb-6" style={{ color: 'var(--mid-gray)' }}>For event floats — cash given up front, liquidated later, unspent balance returned. Every step posts a balanced journal entry so it flows to Bank Reconciliation and the Income Statement automatically.</p>
      <div className="flex flex-col items-center">
        {steps.map((s, i, arr) => (
          <div key={s.n} className="w-full max-w-2xl flex flex-col items-center">
            <div className="w-full rounded-lg border p-4 flex items-start gap-3" style={{ borderColor: 'var(--light-gray)', background: '#fcfdfa', borderLeft: '4px solid var(--teal)' }}>
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--teal)' }}>{s.n}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{s.title}{s.who && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{s.who}</span>}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.desc}</p>
                {s.je && <p className="text-[11px] mt-1.5 font-mono px-2 py-1 rounded" style={{ background: '#f1f5f9', color: '#334155' }}>{s.je}</p>}
                {s.tag && <p className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--deep-teal)' }}>→ {s.tag}</p>}
              </div>
            </div>
            {i < arr.length - 1 && <div className="text-xl leading-none my-1" style={{ color: 'var(--teal)' }}>↓</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
