'use client'

import { useMemo, useState } from 'react'
import { Search, X, Pencil, ArrowUpDown, ChevronUp, ChevronDown, Download, Plus, Link2, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { downloadXlsx, downloadReportPdf } from '@/lib/export'
import ExpandablePanel from './ExpandablePanel'

/** One GL letter, as the AR endpoint returns it. */
export interface GlCaseWallet {
  id: string
  patientName: string
  branch?: string | null
  /**
   * NOT the POS balance for GL: the AR endpoint overwrites this with the approved
   * amount, because a GL receivable is approved-amount based. The real remaining
   * balance has to be rebuilt from consumedOutstanding — see posBalanceOf().
   */
  balance?: number | string | null
  /** Approved minus the remaining POS balance, computed server-side. */
  consumedOutstanding?: number
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
  dateObtained?: string | null
  createdAt?: string | null
}

/**
 * A Detailed GL entry accounting created itself, which may have no POS wallet
 * behind it yet. Tagging one to a wallet makes the live figures — balance drawn
 * down, payments — come from that wallet instead of being retyped here.
 */
export interface GlCaseRow {
  id: string
  walletId?: string | null
  patientName: string
  branch?: string | null
  glRequestedAmount?: number | string | null
  glDocsSubmittedAt?: string | null
  glReleasedAt?: string | null
  approvedAmount?: number | string | null
  soaAmount?: number | string | null
  soaSubmittedAt?: string | null
  guardianName?: string | null
  soaCommissionRate?: number | string | null
  payoutBatch?: string | null
  qbEntry?: string | null
  paidAt?: string | null
  notes?: string | null
}

const num = (v: unknown) => Number(v ?? 0) || 0
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : ''
const dayKey = (v?: string | null) => (v ? String(v).slice(0, 10) : '')

/** POS stores GL proof as a JSON array, with a legacy single-URL field alongside. */
/**
 * Identity tag for a wallet: opened date + approved amount. Two applications
 * for the same patient share a name; this pair is what tells them apart.
 */
function walletTag(w: GlCaseWallet): string {
  const opened = dayKey(w.dateObtained ?? w.createdAt ?? null)
  return `${opened ? `opened ${opened} · ` : ''}approved ${formatCurrency(num(w.totalGlAmount))}`
}

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

/**
 * One line of the sheet, from either source, with every field already resolved.
 * A tagged case takes its live figures from the wallet and its paper trail from
 * itself; an untagged one has only what was typed into it.
 */
interface Row {
  key: string
  /** Set when this line is a standalone entry — the only kind that can be deleted. */
  caseId: string | null
  /** The wallet backing this line, if any. Untagged entries have none. */
  wallet: GlCaseWallet | null
  source: GlCaseRow | null
  patientName: string
  branch?: string | null
  glRequestedAmount?: number | string | null
  glDocsSubmittedAt?: string | null
  glReleasedAt?: string | null
  approved: number
  soaAmount?: number | string | null
  soaSubmittedAt?: string | null
  guardianName?: string | null
  soaCommissionRate?: number | string | null
  payoutBatch?: string | null
  qbEntry?: string | null
  /** Remaining on the tagged wallet in POS; null when nothing is tagged. */
  posBalance: number | null
  /** Has the letter actually been drawn down — balance below the approved amount. */
  rendered: boolean
  paid: boolean
  lastPaymentDate?: string | null
  monthsToPay?: number | null
  files: string[]
}

/**
 * "Rendered service?" means the letter has actually been consumed, so it reads
 * the balance rather than the presence of an order: an order billed at zero, or
 * fully discounted, leaves the letter untouched and should still say NO. An
 * untagged entry has no wallet to draw down, so it is always NO.
 */
/**
 * What POS still has on the letter. The AR endpoint replaces `balance` with the
 * approved amount for GL wallets, so reading it directly reports the letter as
 * untouched however much has been consumed — ARKEEN MIGUEL TAG-AT showed
 * P49,280 left and "Rendered service? NO" while POS showed P10,840 remaining
 * against P38,440 consumed. consumedOutstanding survives that substitution.
 */
function posBalanceOf(w: GlCaseWallet | null): number | null {
  if (!w) return null
  const approved = num(w.totalGlAmount)
  // Per-session agencies have no approved amount to draw down; their `balance`
  // is the outstanding figure the endpoint computed, and is already correct.
  if (approved <= 0) return w.balance != null ? num(w.balance) : null
  return approved - num(w.consumedOutstanding)
}

function drawnDown(w: GlCaseWallet | null): boolean {
  if (!w) return false
  if (num(w.totalGlAmount) <= 0) return false
  return num(w.consumedOutstanding) > 0
}

function rowOf(c: GlCaseRow | null, w: GlCaseWallet | null): Row {
  // A case's own paper trail wins over the wallet's — it is the record staff
  // maintain — but the live figures below always come from the wallet.
  const pick = <T,>(a: T | null | undefined, b: T | null | undefined) => (a ?? b ?? null)
  return {
    key: c ? `case:${c.id}` : `wallet:${w!.id}`,
    caseId: c?.id ?? null,
    wallet: w,
    source: c,
    patientName: c?.patientName ?? w!.patientName,
    branch: pick(c?.branch, w?.branch),
    glRequestedAmount: pick(c?.glRequestedAmount, w?.glRequestedAmount),
    glDocsSubmittedAt: pick(c?.glDocsSubmittedAt, w?.glDocsSubmittedAt),
    glReleasedAt: pick(c?.glReleasedAt, w?.glReleasedAt),
    approved: w ? num(w.totalGlAmount) : num(c?.approvedAmount),
    soaAmount: pick(c?.soaAmount, w?.soaAmount),
    soaSubmittedAt: pick(c?.soaSubmittedAt, w?.soaSubmittedAt),
    guardianName: pick(c?.guardianName, w?.guardianName),
    soaCommissionRate: pick(c?.soaCommissionRate, w?.soaCommissionRate),
    payoutBatch: pick(c?.payoutBatch, w?.payoutBatch),
    qbEntry: pick(c?.qbEntry, w?.qbEntry),
    posBalance: posBalanceOf(w),
    rendered: drawnDown(w),
    paid: w ? num(w.paidTotal) > 0 : !!c?.paidAt,
    lastPaymentDate: w ? (w.lastPaymentDate ?? null) : (c?.paidAt ?? null),
    monthsToPay: w?.monthsToPay ?? null,
    files: w ? fileUrls(w) : [],
  }
}

/**
 * Every case, plus the wallets no case has claimed. Tagging a case to a wallet
 * therefore replaces that wallet's line rather than adding a second one.
 */
function buildRows(wallets: GlCaseWallet[], cases: GlCaseRow[]): Row[] {
  const byId = new Map(wallets.map(w => [w.id, w]))
  const claimed = new Set(cases.map(c => c.walletId).filter((v): v is string => !!v))
  return [
    ...cases.map(c => rowOf(c, c.walletId ? byId.get(c.walletId) ?? null : null)),
    ...wallets.filter(w => !claimed.has(w.id)).map(w => rowOf(null, w)),
  ]
}

/**
 * Row tint. Paid wins over SOA-submitted: a settled letter almost always has an
 * SOA behind it, and "has it been paid" is the question the sheet is read for.
 * Tints are deliberately pale — every cell still carries its own text colour,
 * and a saturated fill makes the greyed-out em-dashes unreadable.
 */
type RowTone = 'nowallet' | 'paid' | 'soa' | null
function rowTone(r: Row): RowTone {
  // Red outranks paid and SOA deliberately. Those describe how far the letter has
  // travelled; this says the row is not wired to POS at all, so none of its live
  // figures — balance, consumption, payments — can ever populate. It is the one
  // state that needs someone to go and do something, so it wins the row.
  if (r.caseId && !r.wallet) return 'nowallet'
  if (r.paid) return 'paid'
  if (r.soaSubmittedAt) return 'soa'
  return null
}
const TONE_BG: Record<'nowallet' | 'paid' | 'soa', string> = {
  nowallet: '#fef2f2',  // red-50
  paid: '#f0fdf4',      // green-50
  soa: '#fefce8',       // yellow-50
}

/** Whole days between SOA submission and payment — the sheet's "AR running days". */
function arRunningDays(r: Row): number | null {
  if (!r.soaSubmittedAt) return null
  // Paid letters stop at the payment date; unpaid ones keep running to today.
  const end = r.lastPaymentDate ? new Date(r.lastPaymentDate) : new Date()
  const ms = end.getTime() - new Date(r.soaSubmittedAt).getTime()
  return Math.round(ms / 86_400_000)
}

/** Effective processor-fee rate: the stored per-letter rate, else the current
 *  25% default — the modal shows 25 pre-filled, so unsaved rows must not read
 *  as "no fee". Older 20% letters keep their stored rate once saved. */
function commissionRateOf(r: Row): number {
  const stored = num(r.soaCommissionRate)
  return stored > 0 ? stored : 25
}
function commissionOf(r: Row): number {
  return num(r.soaAmount) * (commissionRateOf(r) / 100)
}

/** Columns in the order the OPGL SUMMARY sheet uses, with Branch added. */
type ColKey =
  | 'name' | 'branch' | 'docsDate' | 'requested' | 'released' | 'approved' | 'soaAmount'
  | 'posBalance'
  | 'rendered' | 'soaSubmitted' | 'soaDate' | 'status' | 'paidDate' | 'arDays' | 'perMonths'
  | 'guardian' | 'drive' | 'commission' | 'threePct' | 'payout' | 'qb' | 'linked'

interface Col { key: ColKey; label: string; numeric?: boolean }

const COLS: Col[] = [
  { key: 'name', label: 'Name' },
  { key: 'branch', label: 'Branch' },
  { key: 'linked', label: 'POS wallet' },
  { key: 'docsDate', label: 'Date submission of documents' },
  { key: 'requested', label: 'Requested GL', numeric: true },
  { key: 'released', label: 'Status/ GL release date' },
  { key: 'approved', label: 'Approved GL', numeric: true },
  { key: 'soaAmount', label: 'Amount in SOA', numeric: true },
  // What POS still has on the wallet, next to the approved figure it draws down from.
  { key: 'posBalance', label: 'Balance left (POS)', numeric: true },
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

function cellText(r: Row, k: ColKey): string {
  switch (k) {
    case 'name': return r.patientName || ''
    case 'branch': return branchLabel(r.branch) || '—'
    case 'linked': return r.wallet ? r.wallet.patientName : 'needs GL wallet in POS'
    case 'docsDate': return fmtDate(r.glDocsSubmittedAt) || '—'
    case 'requested': return num(r.glRequestedAmount) ? formatCurrency(num(r.glRequestedAmount)) : '—'
    case 'released': return fmtDate(r.glReleasedAt) || '—'
    case 'approved': return r.approved ? formatCurrency(r.approved) : '—'
    case 'soaAmount': return num(r.soaAmount) ? formatCurrency(num(r.soaAmount)) : '—'
    case 'posBalance': return r.posBalance == null ? '—' : formatCurrency(r.posBalance)
    case 'rendered': return r.rendered ? 'YES' : 'NO'
    case 'soaSubmitted': return r.soaSubmittedAt ? 'YES' : 'NO'
    case 'soaDate': return fmtDate(r.soaSubmittedAt) || '—'
    case 'status': return r.paid ? 'PAID' : 'UNPAID'
    case 'paidDate': return fmtDate(r.lastPaymentDate) || 'unpaid'
    case 'arDays': { const d = arRunningDays(r); return d == null ? '—' : String(d) }
    case 'perMonths': return typeof r.monthsToPay === 'number' ? `${r.monthsToPay.toFixed(2)}` : '—'
    case 'guardian': return r.guardianName || '—'
    case 'drive': { const n = r.files.length; return n ? `${n} file${n === 1 ? '' : 's'}` : '—' }
    case 'commission': { const c = commissionOf(r); return c ? `${formatCurrency(c)} (${commissionRateOf(r)}%)` : '—' }
    case 'threePct': return num(r.soaAmount) ? formatCurrency(num(r.soaAmount) * 0.03) : '—'
    case 'payout': return r.payoutBatch || '—'
    case 'qb': return r.qbEntry || '—'
  }
}

function sortValue(r: Row, k: ColKey): string | number {
  switch (k) {
    case 'name': return r.patientName || ''
    case 'branch': return branchLabel(r.branch) || ''
    case 'linked': return r.wallet ? 'tagged' : (r.caseId ? 'needs GL wallet in POS' : 'POS')
    case 'docsDate': return dayKey(r.glDocsSubmittedAt) || '￿'
    case 'requested': return num(r.glRequestedAmount)
    case 'released': return dayKey(r.glReleasedAt) || '￿'
    case 'approved': return r.approved
    case 'soaAmount': return num(r.soaAmount)
    case 'posBalance': return r.posBalance ?? Number.MAX_SAFE_INTEGER
    case 'rendered': return r.rendered ? 'YES' : 'NO'
    case 'soaSubmitted': return r.soaSubmittedAt ? 'YES' : 'NO'
    case 'soaDate': return dayKey(r.soaSubmittedAt) || '￿'
    case 'status': return r.paid ? 'PAID' : 'UNPAID'
    case 'paidDate': return dayKey(r.lastPaymentDate) || '￿'
    case 'arDays': return arRunningDays(r) ?? Number.MAX_SAFE_INTEGER
    case 'perMonths': return typeof r.monthsToPay === 'number' ? r.monthsToPay : Number.MAX_SAFE_INTEGER
    case 'guardian': return r.guardianName || ''
    case 'drive': return r.files.length
    case 'commission': return commissionOf(r)
    case 'threePct': return num(r.soaAmount) * 0.03
    case 'payout': return r.payoutBatch || ''
    case 'qb': return r.qbEntry || ''
  }
}

export default function DetailedGl({
  wallets, glCases = [], canWrite, onSaved,
}: {
  wallets: GlCaseWallet[]
  glCases?: GlCaseRow[]
  canWrite: boolean
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [noSoaOnly, setNoSoaOnly] = useState(false)
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({})
  const [sortKey, setSortKey] = useState<ColKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<GlCaseWallet | null>(null)
  const [editingCase, setEditingCase] = useState<GlCaseRow | 'new' | null>(null)

  const allRows = useMemo(() => buildRows(wallets, glCases), [wallets, glCases])

  // Branch tickboxes: tick a subset and both the table and the totals above it
  // cover only those branches.
  const branchOptions = useMemo(() => {
    const set = new Set(allRows.map(r => r.branch || ''))
    return Array.from(set).sort((a, b) => (a || 'zz').localeCompare(b || 'zz'))
  }, [allRows])
  const [branchTicked, setBranchTicked] = useState<string[] | null>(null)
  const ticked = branchTicked ?? branchOptions
  const toggleBranch = (b: string) => {
    const next = ticked.includes(b) ? ticked.filter(x => x !== b) : [...ticked, b]
    if (next.length === 0) return
    setBranchTicked(next)
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = allRows
    if (ticked.length !== branchOptions.length) out = out.filter(r => ticked.includes(r.branch || ''))
    if (q) {
      // One box, every column — staff search by guardian or QB ref as often as by name.
      out = out.filter(r => COLS.some(c => cellText(r, c.key).toLowerCase().includes(q)))
    }
    if (noSoaOnly) out = out.filter(r => !r.soaSubmittedAt)
    for (const [k, v] of Object.entries(filters)) {
      const needle = (v || '').trim().toLowerCase()
      if (!needle) continue
      out = out.filter(r => cellText(r, k as ColKey).toLowerCase().includes(needle))
    }
    return [...out].sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [allRows, search, filters, sortKey, sortDir, ticked, branchOptions, noSoaOnly])

  const toggleSort = (k: ColKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const activeFilters = Object.values(filters).filter(v => (v || '').trim()).length
  const exportRows = () => rows.map(r => COLS.map(c => cellText(r, c.key)))

  /** Wallets already spoken for. The picker excludes these, except the one the
   *  entry being edited is itself tagged to — otherwise editing a tagged entry
   *  would show its own wallet as missing and silently offer to untag it. */
  const claimedWalletIds = useMemo(
    () => new Set(glCases.map(c => c.walletId).filter((v): v is string => !!v)),
    [glCases],
  )

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
        {rows.map(r => {
          const tone = rowTone(r)
          return (
          <tr key={r.key}
            className={`border-t ${tone ? '' : 'hover:bg-gray-50'}`}
            style={{ borderColor: 'var(--light-gray)', background: tone ? TONE_BG[tone] : undefined }}>
            {canWrite && (
              <td className="px-2 py-1.5">
                <button
                  onClick={() => (r.source ? setEditingCase(r.source) : setEditing(r.wallet))}
                  className="p-1 rounded hover:bg-teal-50"
                  title={r.source ? 'Edit entry' : 'Edit case details'}>
                  <Pencil size={12} style={{ color: 'var(--teal)' }} />
                </button>
              </td>
            )}
            {COLS.map(c => (
              <td key={c.key}
                className={`px-2 py-1.5 whitespace-nowrap ${c.numeric ? 'text-right tabular-nums' : ''}`}
                style={{ color: cellText(r, c.key) === '—' ? 'var(--light-gray)' : 'var(--charcoal)' }}>
                {c.key === 'drive'
                  ? (r.files.length
                      ? r.files.map((u, i) => (
                          <a key={u + i} href={u} target="_blank" rel="noreferrer"
                            className="underline mr-1.5" style={{ color: 'var(--teal)' }}>
                            file {i + 1}
                          </a>
                        ))
                      : '—')
                  : c.key === 'linked'
                    ? (r.wallet
                        ? <span className="inline-flex items-center gap-1 whitespace-nowrap" title={`POS GL wallet: ${r.wallet.patientName} · ${walletTag(r.wallet)}`} style={{ color: 'var(--teal)' }}>
                            <Link2 size={11} /> {r.wallet.patientName.length > 26 ? `${r.wallet.patientName.slice(0, 24)}…` : r.wallet.patientName}
                          </span>
                        : <span className="font-semibold" style={{ color: '#dc2626' }}>needs GL wallet in POS</span>)
                    : cellText(r, c.key)}
              </td>
            ))}
          </tr>
          )
        })}
      </tbody>
    </table>
  )

  const totals = rows.reduce((a, r) => ({
    requested: a.requested + num(r.glRequestedAmount),
    approved: a.approved + num(r.approved),
    soa: a.soa + num(r.soaAmount),
  }), { requested: 0, approved: 0, soa: 0 })

  /**
   * Average days between two milestones, over the letters that have both. A
   * letter missing either end is left out rather than counted as zero — half the
   * sheet has no SOA date, and treating those as same-day would pull every
   * average toward nothing. Each card therefore shows its own denominator.
   */
  const avgSpan = (from: (r: Row) => string | null | undefined, to: (r: Row) => string | null | undefined) => {
    const days: number[] = []
    for (const r of rows) {
      const a = from(r), b = to(r)
      if (!a || !b) continue
      days.push((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
    }
    return days.length ? { avg: days.reduce((x, y) => x + y, 0) / days.length, n: days.length } : null
  }
  const docsToRelease = avgSpan(r => r.glDocsSubmittedAt, r => r.glReleasedAt)
  const releaseToSoa  = avgSpan(r => r.glReleasedAt, r => r.soaSubmittedAt)
  // Settled letters only: this is SOA submission to the cheque, so an unpaid
  // letter has no end point. It is the same span the AR running days column
  // measures once a letter is paid.
  const soaToPayment  = avgSpan(r => r.soaSubmittedAt, r => (r.paid ? r.lastPaymentDate : null))

  // Average AR running days over the letters where it is defined — an SOA has to
  // have been submitted for the clock to have started, so letters without one are
  // excluded rather than counted as zero, which would drag the average down.
  // Months are derived from the same average (30.44 days, the mean calendar month)
  // rather than averaging the Per months column, so the two figures always agree.
  // Entries with no POS wallet behind them: nothing can populate their live
  // figures until someone creates the wallet, so they are counted for the badge.
  const needsWallet = rows.filter(r => r.caseId && !r.wallet).length
  // Counted over everything the other filters allow, so the number on the box is
  // what ticking it would actually show.
  const noSoaCount = rows.filter(r => !r.soaSubmittedAt).length
  const arDaysValues = rows.map(arRunningDays).filter((d): d is number => d != null)
  const avgArDays = arDaysValues.length
    ? arDaysValues.reduce((a, b) => a + b, 0) / arDaysValues.length
    : null

  return (
    <div className="space-y-3">
      {/* Branch filter + headline totals for the ticked branches */}
      <div className="flex flex-wrap items-center gap-2">
        {branchOptions.map(b => (
          <label key={b || 'none'} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
            style={{ border: `1px solid ${ticked.includes(b) ? 'var(--deep-teal, #14532d)' : 'var(--light-gray)'}`, background: ticked.includes(b) ? '#f0f7f2' : 'white', color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={ticked.includes(b)} onChange={() => toggleBranch(b)} className="accent-current" />
            {b ? branchLabel(b) || b : 'No branch'}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {([['Requested GL', totals.requested], ['Approved GL', totals.approved], ['Amount in SOA', totals.soa]] as [string, number][]).map(([label, v]) => (
          <div key={label} className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--light-gray)', background: '#f8fafc' }}>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>{label}</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatCurrency(v)}</div>
          </div>
        ))}
        <div className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--light-gray)', background: '#f8fafc' }}>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>Avg AR running days</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>
            {avgArDays == null ? '—' : `${avgArDays.toFixed(1)} days`}
          </div>
          {/* The count matters: this averages only the letters whose SOA has been
              submitted, which is usually well short of the rows on screen. */}
          <div className="text-[10px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>
            {avgArDays == null
              ? 'no SOA submitted yet'
              : `${(avgArDays / 30.44).toFixed(2)} months · ${arDaysValues.length} of ${rows.length} letters`}
          </div>
        </div>
      </div>
      {/* Cycle times: how long each leg of the letter actually takes. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          ['Documents → GL release', docsToRelease],
          ['GL release → SOA submitted', releaseToSoa],
          ['SOA submitted → payment', soaToPayment],
        ] as [string, { avg: number; n: number } | null][]).map(([label, v]) => (
          <div key={label} className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--light-gray)', background: '#f8fafc' }}>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>{label}</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>
              {v ? `${v.avg.toFixed(1)} days` : '—'}
            </div>
            <div className="text-[10px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>
              {v ? `${(v.avg / 30.44).toFixed(2)} months · ${v.n} of ${rows.length} letters` : 'no letters with both dates'}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
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
          {rows.length} of {allRows.length} letters
        </span>
        {/* The letters still waiting on an SOA are the ones holding up the whole
            cycle, and they are invisible in a sheet sorted by name. */}
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
          style={{ border: `1px solid ${noSoaOnly ? '#c44b00' : 'var(--light-gray)'}`,
                   background: noSoaOnly ? '#fff7ed' : 'white', color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={noSoaOnly} onChange={() => setNoSoaOnly(v => !v)} className="accent-current" />
          SOA not yet submitted
          <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>({noSoaCount})</span>
        </label>
        {/* Without a key the tints are just decoration — say what they mean. */}
        <span className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border"
              style={{ background: TONE_BG.paid, borderColor: 'var(--light-gray)' }} />
            Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border"
              style={{ background: TONE_BG.soa, borderColor: 'var(--light-gray)' }} />
            SOA submitted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border"
              style={{ background: TONE_BG.nowallet, borderColor: 'var(--light-gray)' }} />
            Needs a GL wallet in POS
          </span>
        </span>
        {/* A count, not just a colour: these are the rows someone has to act on,
            and they are easy to miss scattered through a long sheet. */}
        {needsWallet > 0 && (
          <button
            onClick={() => setFilters(f => ({ ...f, linked: f.linked ? '' : 'needs' }))}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            style={{ background: filters.linked ? '#dc2626' : '#fef2f2', color: filters.linked ? 'white' : '#dc2626' }}>
            {needsWallet} need a GL wallet
          </button>
        )}
        {activeFilters > 0 && (
          <button onClick={() => setFilters({})}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
          </button>
        )}
        {canWrite && (
          <button onClick={() => setEditingCase('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: 'var(--teal)' }}>
            <Plus size={13} /> Add entry
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
        <GlCaseModal wallet={editing} cases={glCases} wallets={wallets} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved() }} />
      )}
      {editingCase && (
        <GlEntryModal
          entry={editingCase === 'new' ? null : editingCase}
          wallets={wallets}
          claimedWalletIds={claimedWalletIds}
          onClose={() => setEditingCase(null)}
          onSaved={() => { setEditingCase(null); onSaved() }}
        />
      )}
    </div>
  )
}

/* ── Add / edit a standalone entry, including which POS wallet it is tagged to ── */
function GlEntryModal({
  entry, wallets, claimedWalletIds, onClose, onSaved,
}: {
  entry: GlCaseRow | null
  wallets: GlCaseWallet[]
  claimedWalletIds: Set<string>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    patientName: entry?.patientName || '',
    branch: entry?.branch || 'SANDBOX_EAST',
    walletId: entry?.walletId || '',
    glDocsSubmittedAt: dayKey(entry?.glDocsSubmittedAt),
    glRequestedAmount: entry?.glRequestedAmount != null ? String(num(entry.glRequestedAmount)) : '',
    glReleasedAt: dayKey(entry?.glReleasedAt),
    approvedAmount: entry?.approvedAmount != null ? String(num(entry.approvedAmount)) : '',
    soaAmount: entry?.soaAmount != null ? String(num(entry.soaAmount)) : '',
    soaSubmittedAt: dayKey(entry?.soaSubmittedAt),
    soaCommissionRate: entry?.soaCommissionRate != null ? String(num(entry.soaCommissionRate)) : '25',
    guardianName: entry?.guardianName || '',
    payoutBatch: entry?.payoutBatch || '',
    qbEntry: entry?.qbEntry || '',
    paidAt: dayKey(entry?.paidAt),
    notes: entry?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [walletSearch, setWalletSearch] = useState('')

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Every wallet is offered, including ones another entry already holds. Those are
  // rendered disabled with the reason, because silently dropping them made the
  // picker look broken: the wallet you wanted simply was not in the list and
  // nothing said why. Re-tagging still requires untagging the other entry first —
  // that is the unique constraint, and it is now visible rather than implied.
  const claimedByOther = (w: GlCaseWallet) =>
    claimedWalletIds.has(w.id) && w.id !== entry?.walletId

  const options = useMemo(() => {
    const q = walletSearch.trim().toLowerCase()
    // Search covers the branch and the identifying tag too — two applications for
    // one patient share a name, so the name alone cannot separate them.
    const list = q
      ? wallets.filter(w =>
          w.patientName.toLowerCase().includes(q)
          || (branchLabel(w.branch) || '').toLowerCase().includes(q)
          || walletTag(w).toLowerCase().includes(q))
      : wallets
    // Free wallets first: the ones that can actually be picked should not be
    // buried under wallets that cannot.
    return [...list].sort((a, b) => Number(claimedByOther(a)) - Number(claimedByOther(b)))
  }, [wallets, walletSearch, claimedWalletIds, entry?.walletId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.patientName.trim()) { setError('Name is required'); return }
    setBusy(true); setError('')
    try {
      const body = { ...form, walletId: form.walletId || null }
      const res = await fetch('/api/accounts-receivable/gl-case', {
        method: entry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry ? { caseId: entry.id, ...body } : body),
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

  const remove = async () => {
    if (!entry) return
    if (!confirm(`Delete the Detailed GL entry for ${entry.patientName}? The POS wallet, if tagged, is not touched.`)) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/accounts-receivable/gl-case?caseId=${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Delete failed (${res.status})`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
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

  const tagged = wallets.find(w => w.id === form.walletId) || null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl mt-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
              {entry ? entry.patientName : 'New Detailed GL entry'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              For a letter POS has no wallet for yet — a second application, or one still awaiting approval.
              Tag it to a wallet whenever one exists.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {field('Name', 'patientName')}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
            <select value={form.branch} onChange={e => set('branch', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="SANDBOX_EAST">Aura Health East</option>
              <option value="SANDBOX_GREENHILLS">Aura Health Greenhills</option>
              <option value="ALL">All branches</option>
            </select>
          </div>
        </div>

        {/* ── Tagging ── */}
        <div className="mt-4 p-3 rounded-xl border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
            Tag to a POS GL wallet
          </label>
          <p className="text-[10px] mb-2" style={{ color: 'var(--mid-gray)' }}>
            Once tagged, “Rendered service?”, “Balance left (POS)”, “Approved GL” and the payment status all come
            from that wallet. Leave blank while the letter has no wallet yet.
          </p>
          <input
            value={walletSearch}
            onChange={e => setWalletSearch(e.target.value)}
            placeholder="Search wallets by patient name…"
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-2" style={{ borderColor: 'var(--light-gray)' }} />
          <select value={form.walletId} onChange={e => set('walletId', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">— not tagged —</option>
            {options.map(w => (
              <option key={w.id} value={w.id} disabled={claimedByOther(w)}>
                {w.patientName} · {branchLabel(w.branch) || 'no branch'} · {walletTag(w)} · {formatCurrency(posBalanceOf(w) ?? 0)} left
                {claimedByOther(w) ? ' — already tagged to another entry' : ''}
              </option>
            ))}
          </select>
          <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>
            {options.length} of {wallets.length} wallets shown. Greyed-out ones are held by another
            entry — untag it there first to move the wallet here.
          </p>
          {tagged && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--deep-teal)' }}>
              Approved {formatCurrency(num(tagged.totalGlAmount))} · {formatCurrency(posBalanceOf(tagged) ?? 0)} left ·
              {' '}{drawnDown(tagged) ? 'drawn down, so “Rendered service?” reads YES' : 'not drawn down yet, so “Rendered service?” reads NO'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {field('Date submission of documents', 'glDocsSubmittedAt', 'date')}
          {field('Requested GL (₱)', 'glRequestedAmount', 'number')}
          {field('GL release date', 'glReleasedAt', 'date')}
          {field('Approved GL (₱)', 'approvedAmount', 'number', 'Ignored once tagged — the wallet’s approved amount wins.')}
          {field('Amount in SOA (₱)', 'soaAmount', 'number')}
          {field('Date submission of SOA', 'soaSubmittedAt', 'date', 'AR running days and Per months count from here')}
          {field('GL processor fee rate (%)', 'soaCommissionRate', 'number', '25% currently; older letters were 20%.')}
          {field('Guardian name', 'guardianName')}
          {field('Date of payment', 'paidAt', 'date', 'Ignored once tagged — payments come from the wallet.')}
          {field('Payout', 'payoutBatch', 'text', 'e.g. 3/26-4/10')}
          {field('QB entry', 'qbEntry', 'text', 'e.g. AR25-0027')}
          {field('Notes', 'notes')}
        </div>

        {error && (
          <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>
        )}

        <div className="flex justify-between gap-2 mt-5">
          {entry ? (
            <button onClick={remove} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border disabled:opacity-50"
              style={{ borderColor: '#fecaca', color: '#dc2626' }}>
              <Trash2 size={14} /> Delete entry
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
            <button onClick={save} disabled={busy}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {busy ? 'Saving…' : entry ? 'Save' : 'Create entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Edit modal — only the case-tracking fields, never the amounts the ledger uses ── */
function GlCaseModal({ wallet, cases, wallets, onClose, onSaved }: { wallet: GlCaseWallet; cases: GlCaseRow[]; wallets: GlCaseWallet[]; onClose: () => void; onSaved: () => void }) {
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
  // A standalone recorded entry (from the OPGL sheet) can be tagged to this
  // wallet from here, merging the duplicate rows — the inverse of tagging a
  // wallet from the entry's own modal.
  const currentCase = cases.find(c => c.walletId === wallet.id) || null
  const [linkCaseId, setLinkCaseId] = useState(currentCase?.id || '')
  const linkable = cases.filter(c => !c.walletId || c.walletId === wallet.id)
  // Moving the paper trail to a different letter. A wallet-backed row cannot be
  // re-pointed — the row IS the wallet — so what moves is the case tracking, not
  // the wallet. Balances, payments and orders are untouched.
  const [moveTo, setMoveTo] = useState('')
  const [moveSearch, setMoveSearch] = useState('')
  const moveOptions = useMemo(() => {
    const q = moveSearch.trim().toLowerCase()
    const others = wallets.filter(w => w.id !== wallet.id)
    return q
      ? others.filter(w => w.patientName.toLowerCase().includes(q)
          || (branchLabel(w.branch) || '').toLowerCase().includes(q)
          || walletTag(w).toLowerCase().includes(q))
      : others
  }, [wallets, wallet.id, moveSearch])

  const moveDetails = async () => {
    if (!moveTo) return
    const dest = wallets.find(w => w.id === moveTo)
    if (!confirm(`Move the recorded details from ${wallet.patientName} to ${dest?.patientName || 'the selected letter'}?\n\n`
      + 'Only the paper trail moves — dates, amounts, guardian, payout and QB entry. '
      + 'Balances, payments and orders stay where they are.')) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/accounts-receivable/gl-case/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWalletId: wallet.id, toWalletId: moveTo }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Move failed (${res.status})`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move failed')
    } finally { setBusy(false) }
  }

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
      // Apply the entry link/unlink when it changed.
      if ((linkCaseId || '') !== (currentCase?.id || '')) {
        if (currentCase && !linkCaseId) {
          await fetch('/api/accounts-receivable/gl-case', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: currentCase.id, walletId: null }),
          })
        }
        if (linkCaseId) {
          const r2 = await fetch('/api/accounts-receivable/gl-case', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: linkCaseId, walletId: wallet.id }),
          })
          if (!r2.ok) {
            const d2 = await r2.json().catch(() => ({}))
            throw new Error(d2.error || 'Linking the entry failed')
          }
        }
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
          <div className="sm:col-span-2 rounded-xl px-3 py-2 text-xs" style={{ background: '#f8fafc', border: '1px solid var(--light-gray)' }}>
            <span className="font-semibold" style={{ color: '#334155' }}>POS GL wallet — this row IS the wallet &quot;{wallet.patientName}&quot; ({walletTag(wallet)}), already linked. Live figures (not edited here): </span>
            approved {formatCurrency(num(wallet.totalGlAmount))} · balance {posBalanceOf(wallet) != null ? formatCurrency(posBalanceOf(wallet) as number) : '—'} · {num(wallet.paidTotal) > 0 ? `paid — last payment ${wallet.lastPaymentDate ? dayKey(wallet.lastPaymentDate) : '—'}` : 'unpaid'}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Tagged recorded entry</label>
            <select value={linkCaseId} onChange={e => setLinkCaseId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--light-gray)' }}>
              <option value="">— none —</option>
              {linkable.map(c => (
                <option key={c.id} value={c.id}>{c.patientName}{c.guardianName ? ` · ${c.guardianName}` : ''}</option>
              ))}
            </select>
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Links a standalone recorded entry to this POS wallet so they show as one row.</p>
          </div>
          <div className="sm:col-span-2 rounded-xl p-3" style={{ border: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
              Recorded against the wrong letter?
            </label>
            <p className="text-[10px] mb-2" style={{ color: 'var(--mid-gray)' }}>
              Moves the details above — dates, amounts, guardian, payout, QB entry — to another
              Guarantee Letter. The wallets themselves are not touched: balances, payments and
              orders stay where they are. Refused if the destination already has any of these
              recorded, so nothing is overwritten.
            </p>
            <input
              value={moveSearch}
              onChange={e => setMoveSearch(e.target.value)}
              placeholder="Search letters by name, branch or approved amount…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" style={{ border: '1px solid var(--light-gray)' }} />
            <div className="flex gap-2">
              <select value={moveTo} onChange={e => setMoveTo(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-white" style={{ border: '1px solid var(--light-gray)' }}>
                <option value="">— pick the correct letter —</option>
                {moveOptions.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.patientName} · {branchLabel(w.branch) || 'no branch'} · {walletTag(w)}
                  </option>
                ))}
              </select>
              <button onClick={moveDetails} disabled={!moveTo || busy}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-40"
                style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                Move details
              </button>
            </div>
          </div>
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
