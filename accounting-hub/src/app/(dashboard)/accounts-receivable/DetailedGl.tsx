'use client'

import { useMemo, useState } from 'react'
import { Search, X, Pencil, ArrowUpDown, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { downloadXlsx, downloadReportPdf } from '@/lib/export'
import ExpandablePanel from './ExpandablePanel'

/** One GL letter, as the AR endpoint returns it. */
export interface GlCaseWallet {
  id: string
  patientName: string
  branch?: string | null
  totalGlAmount?: number | string | null
  paidTotal?: number
  lastPaymentDate?: string | null
  monthsToPay?: number | null
  soaStatus?: string | null
  /** Proof files uploaded against the letter in POS (JSON array of URLs). */
  attachmentUrls?: unknown
  attachmentUrl?: string | null
  glRequestedAmount?: number | string | null
  glDocsSubmittedAt?: string | null
  glReleasedAt?: string | null
  soaAmount?: number | string | null
  soaSubmittedAt?: string | null
  guardianName?: string | null
  soaCommissionRate?: number | string | null
  payoutBatch?: string | null
  qbEntry?: string | null
  /** True when any order has been billed against the letter. */
  hasOrders?: boolean
}

const num = (v: unknown) => Number(v ?? 0) || 0
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : ''
const dayKey = (v?: string | null) => (v ? String(v).slice(0, 10) : '')

/** POS stores GL proof as a JSON array, with a legacy single-URL field alongside. */
function fileUrls(w: GlCaseWallet): string[] {
  const out: string[] = []
  if (Array.isArray(w.attachmentUrls)) out.push(...w.attachmentUrls.filter((u): u is string => typeof u === 'string' && !!u))
  else if (typeof w.attachmentUrls === 'string' && w.attachmentUrls) {
    try { const p = JSON.parse(w.attachmentUrls); if (Array.isArray(p)) out.push(...p.filter((u: unknown): u is string => typeof u === 'string' && !!u)) }
    catch { out.push(w.attachmentUrls) }
  }
  if (w.attachmentUrl && !out.includes(w.attachmentUrl)) out.push(w.attachmentUrl)
  return out
}

/** Whole days between SOA submission and payment — the sheet's "AR running days". */
function arRunningDays(w: GlCaseWallet): number | null {
  if (!w.soaSubmittedAt || !w.lastPaymentDate) return null
  const ms = new Date(w.lastPaymentDate).getTime() - new Date(w.soaSubmittedAt).getTime()
  return Math.round(ms / 86_400_000)
}

/** Columns in the order the OPGL SUMMARY sheet uses, with Branch added. */
type ColKey =
  | 'name' | 'branch' | 'docsDate' | 'requested' | 'released' | 'approved' | 'soaAmount'
  | 'rendered' | 'soaSubmitted' | 'soaDate' | 'status' | 'paidDate' | 'arDays' | 'perMonths'
  | 'guardian' | 'drive' | 'commission' | 'threePct' | 'payout' | 'qb'

interface Col { key: ColKey; label: string; numeric?: boolean }

const COLS: Col[] = [
  { key: 'name', label: 'Name' },
  { key: 'branch', label: 'Branch' },
  { key: 'docsDate', label: 'Date submission of documents' },
  { key: 'requested', label: 'Requested GL', numeric: true },
  { key: 'released', label: 'Status/ GL release date' },
  { key: 'approved', label: 'Approved GL', numeric: true },
  { key: 'soaAmount', label: 'Amount in SOA', numeric: true },
  { key: 'rendered', label: 'Rendered service?' },
  { key: 'soaSubmitted', label: 'SOA submitted' },
  { key: 'soaDate', label: 'Date submission of SOA' },
  { key: 'status', label: 'Status' },
  { key: 'paidDate', label: 'Date of Payment (in check)' },
  { key: 'arDays', label: 'AR running days', numeric: true },
  { key: 'perMonths', label: 'Per months', numeric: true },
  { key: 'guardian', label: 'Guardian Name' },
  { key: 'drive', label: 'Files' },
  { key: 'commission', label: 'GL Processor Fee', numeric: true },
  { key: 'threePct', label: '3%', numeric: true },
  { key: 'payout', label: 'Payout' },
  { key: 'qb', label: 'QB entry' },
]

/** Value used for sorting: numbers sort numerically, blanks sort last. */
function sortValue(w: GlCaseWallet, k: ColKey): string | number {
  switch (k) {
    case 'name': return w.patientName || ''
    case 'branch': return branchLabel(w.branch) || ''
    case 'docsDate': return dayKey(w.glDocsSubmittedAt) || '￿'
    case 'requested': return num(w.glRequestedAmount)
    case 'released': return dayKey(w.glReleasedAt) || '￿'
    case 'approved': return num(w.totalGlAmount)
    case 'soaAmount': return num(w.soaAmount)
    case 'rendered': return w.hasOrders ? 'YES' : 'NO'
    case 'soaSubmitted': return w.soaSubmittedAt ? 'YES' : 'NO'
    case 'soaDate': return dayKey(w.soaSubmittedAt) || '￿'
    case 'status': return num(w.paidTotal) > 0 ? 'PAID' : 'UNPAID'
    case 'paidDate': return dayKey(w.lastPaymentDate) || '￿'
    case 'arDays': return arRunningDays(w) ?? Number.MAX_SAFE_INTEGER
    case 'perMonths': return typeof w.monthsToPay === 'number' ? w.monthsToPay : Number.MAX_SAFE_INTEGER
    case 'guardian': return w.guardianName || ''
    case 'drive': return fileUrls(w).length
    case 'commission': return commissionOf(w)
    case 'threePct': return num(w.soaAmount) * 0.03
    case 'payout': return w.payoutBatch || ''
    case 'qb': return w.qbEntry || ''
  }
}

/**
 * Fee paid to the GL processor: a percentage of the SOA amount.
 *
 * The rate is typed per letter rather than hardcoded — it is 25% now and was
 * 20% on older letters, so a single constant would silently restate history.
 * Blank until a rate is recorded; never assumed.
 */
function commissionOf(w: GlCaseWallet): number {
  const rate = num(w.soaCommissionRate)
  return rate > 0 ? num(w.soaAmount) * (rate / 100) : 0
}

/** Text shown in the cell — also what the search box and column filters match. */
function cellText(w: GlCaseWallet, k: ColKey): string {
  switch (k) {
    case 'name': return w.patientName || ''
    case 'branch': return branchLabel(w.branch) || '—'
    case 'docsDate': return fmtDate(w.glDocsSubmittedAt) || '—'
    case 'requested': return num(w.glRequestedAmount) ? formatCurrency(num(w.glRequestedAmount)) : '—'
    case 'released': return fmtDate(w.glReleasedAt) || '—'
    case 'approved': return formatCurrency(num(w.totalGlAmount))
    case 'soaAmount': return num(w.soaAmount) ? formatCurrency(num(w.soaAmount)) : '—'
    case 'rendered': return w.hasOrders ? 'YES' : 'NO'
    case 'soaSubmitted': return w.soaSubmittedAt ? 'YES' : 'NO'
    case 'soaDate': return fmtDate(w.soaSubmittedAt) || '—'
    case 'status': return num(w.paidTotal) > 0 ? 'PAID' : 'UNPAID'
    case 'paidDate': return fmtDate(w.lastPaymentDate) || 'unpaid'
    case 'arDays': { const d = arRunningDays(w); return d == null ? '—' : String(d) }
    case 'perMonths': return typeof w.monthsToPay === 'number' ? `${w.monthsToPay.toFixed(2)}` : '—'
    case 'guardian': return w.guardianName || '—'
    case 'drive': { const n = fileUrls(w).length; return n ? `${n} file${n === 1 ? '' : 's'}` : '—' }
    case 'commission': { const c = commissionOf(w); return c ? `${formatCurrency(c)} (${num(w.soaCommissionRate)}%)` : '—' }
    case 'threePct': return num(w.soaAmount) ? formatCurrency(num(w.soaAmount) * 0.03) : '—'
    case 'payout': return w.payoutBatch || '—'
    case 'qb': return w.qbEntry || '—'
  }
}

export default function DetailedGl({
  wallets, canWrite, onSaved,
}: {
  wallets: GlCaseWallet[]
  canWrite: boolean
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({})
  const [sortKey, setSortKey] = useState<ColKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<GlCaseWallet | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = wallets
    if (q) {
      // One box, every column — staff search by guardian or QB ref as often as by name.
      out = out.filter(w => COLS.some(c => cellText(w, c.key).toLowerCase().includes(q)))
    }
    for (const [k, v] of Object.entries(filters)) {
      const needle = (v || '').trim().toLowerCase()
      if (!needle) continue
      out = out.filter(w => cellText(w, k as ColKey).toLowerCase().includes(needle))
    }
    return [...out].sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [wallets, search, filters, sortKey, sortDir])

  const toggleSort = (k: ColKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const activeFilters = Object.values(filters).filter(v => (v || '').trim()).length
  const exportRows = () => rows.map(w => COLS.map(c => cellText(w, c.key)))

  const table = (
    <table className="w-full text-xs">
      <thead>
        <tr className="sticky top-0 z-10" style={{ background: 'var(--pale-teal)' }}>
          {canWrite && <th className="px-2 py-2 w-8" />}
          {COLS.map(c => (
            <th key={c.key} className="px-2 py-2 align-top whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>
              <button onClick={() => toggleSort(c.key)}
                className="flex items-center gap-1 font-semibold text-[11px] hover:opacity-70"
                style={{ marginLeft: c.numeric ? 'auto' : undefined }}>
                {c.label}
                {sortKey === c.key
                  ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                  : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
              </button>
              <input
                value={filters[c.key] || ''}
                onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))}
                placeholder="Filter…"
                className="mt-1 w-full min-w-[70px] px-1.5 py-0.5 rounded border text-[10px] outline-none font-normal"
                style={{ borderColor: 'var(--light-gray)' }} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={COLS.length + (canWrite ? 1 : 0)} className="text-center py-10 text-xs" style={{ color: 'var(--mid-gray)' }}>
            No Guarantee Letters match the current search and filters.
          </td></tr>
        )}
        {rows.map(w => (
          <tr key={w.id} className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
            {canWrite && (
              <td className="px-2 py-1.5">
                <button onClick={() => setEditing(w)} className="p-1 rounded hover:bg-teal-50" title="Edit case details">
                  <Pencil size={12} style={{ color: 'var(--teal)' }} />
                </button>
              </td>
            )}
            {COLS.map(c => (
              <td key={c.key}
                className={`px-2 py-1.5 whitespace-nowrap ${c.numeric ? 'text-right tabular-nums' : ''}`}
                style={{ color: cellText(w, c.key) === '—' ? 'var(--light-gray)' : 'var(--charcoal)' }}>
                {c.key === 'drive'
                  ? (fileUrls(w).length
                      ? fileUrls(w).map((u, i) => (
                          <a key={u + i} href={u} target="_blank" rel="noreferrer"
                            className="underline mr-1.5" style={{ color: 'var(--teal)' }}>
                            file {i + 1}
                          </a>
                        ))
                      : '—')
                  : cellText(w, c.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search every column — name, guardian, QB entry, payout…"
            className="w-full pl-9 pr-8 py-2 rounded-xl border text-sm outline-none"
            style={{ borderColor: 'var(--light-gray)' }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={14} style={{ color: 'var(--mid-gray)' }} />
            </button>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          {rows.length} of {wallets.length} letters
        </span>
        {activeFilters > 0 && (
          <button onClick={() => setFilters({})}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
          </button>
        )}
        <button
          onClick={() => downloadXlsx(`detailed-gl-${new Date().toISOString().slice(0, 10)}`,
            [{ name: 'Detailed GL', headers: COLS.map(c => c.label), rows: exportRows() }])}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
          <Download size={13} /> Excel
        </button>
        <button
          onClick={() => downloadReportPdf({
            title: 'Detailed GL', subtitle: `${rows.length} Guarantee Letters`, landscape: true,
            sections: [{ heading: 'Guarantee Letters', headers: COLS.map(c => c.label), rows: exportRows() }],
          })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--mid-gray)', color: 'var(--mid-gray)' }}>
          <Download size={13} /> PDF
        </button>
      </div>

      <ExpandablePanel title="Detailed GL" subtitle="Every Guarantee Letter, in the OPGL summary layout" maxHeight={520}>
        {table}
      </ExpandablePanel>

      {editing && (
        <GlCaseModal wallet={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved() }} />
      )}
    </div>
  )
}

/* ── Edit modal — only the case-tracking fields, never the amounts the ledger uses ── */
function GlCaseModal({ wallet, onClose, onSaved }: { wallet: GlCaseWallet; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    glDocsSubmittedAt: dayKey(wallet.glDocsSubmittedAt),
    glRequestedAmount: wallet.glRequestedAmount != null ? String(num(wallet.glRequestedAmount)) : '',
    glReleasedAt: dayKey(wallet.glReleasedAt),
    soaAmount: wallet.soaAmount != null ? String(num(wallet.soaAmount)) : '',
    soaSubmittedAt: dayKey(wallet.soaSubmittedAt),
    guardianName: wallet.guardianName || '',
    // 25% is the current rate; older letters were 20%, so it stays typed
    // per letter and only pre-fills when nothing has been recorded yet.
    soaCommissionRate: wallet.soaCommissionRate != null ? String(num(wallet.soaCommissionRate)) : '25',
    payoutBatch: wallet.payoutBatch || '',
    qbEntry: wallet.qbEntry || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/accounts-receivable/gl-case', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wallet.id, ...form }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Save failed (${res.status})`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  const field = (label: string, k: keyof typeof form, type: 'text' | 'date' | 'number' = 'text', hint?: string) => (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)}
        step={type === 'number' ? '0.01' : undefined}
        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
      {hint && <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl mt-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{wallet.patientName}</h2>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              GL case details · {branchLabel(wallet.branch) || 'no branch'} · approved {formatCurrency(num(wallet.totalGlAmount))}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {field('Date submission of documents', 'glDocsSubmittedAt', 'date')}
          {field('Requested GL (₱)', 'glRequestedAmount', 'number')}
          {field('GL release date', 'glReleasedAt', 'date')}
          {field('Amount in SOA (₱)', 'soaAmount', 'number')}
          {field('Date submission of SOA', 'soaSubmittedAt', 'date', 'AR running days and Per months count from here')}
          {field('GL processor fee rate (%)', 'soaCommissionRate', 'number', '25% currently; older letters were 20%. Applied to the SOA amount.')}
          {field('Guardian name', 'guardianName')}
          {field('Payout', 'payoutBatch', 'text', 'e.g. 3/26-4/10')}
          {field('QB entry', 'qbEntry', 'text', 'e.g. AR25-0027')}
        </div>

        {error && (
          <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          <button onClick={save} disabled={busy}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
