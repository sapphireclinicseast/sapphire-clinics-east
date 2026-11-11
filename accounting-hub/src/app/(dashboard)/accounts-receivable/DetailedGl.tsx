'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Pencil, ArrowUpDown, ChevronUp, ChevronDown, Download, Plus, Link2, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { downloadXlsx, downloadReportPdf } from '@/lib/export'
import ExpandablePanel from './ExpandablePanel'
import { GL_STAGES } from '@/lib/gl-stage'
import { num, buildRows, arRunningDays, soaSubmittedOn, avgArRunningDays, posBalanceOf, drawnDown, type GlCaseWallet, type GlCaseRow, type GlLetterRow } from '@/lib/gl-letters'

export type { GlCaseWallet, GlCaseRow } from '@/lib/gl-letters'
type Row = GlLetterRow

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : ''
// Manila calendar day, as YYYY-MM-DD. Dates are STORED as Manila midnight
// (16:00Z of the previous day), so slicing the raw UTC ISO string gave the
// PREVIOUS day — the edit forms then re-saved that shifted value, and every
// open-and-save walked the dates one day earlier ("the dates keep changing").
const dayKey = (v?: string | null) =>
  (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '')

/**
 * Identity tag for a wallet: opened date + approved amount. Two applications
 * for the same patient share a name; this pair is what tells them apart.
 */
function walletTag(w: GlCaseWallet): string {
  const opened = dayKey(w.dateObtained ?? w.createdAt ?? null)
  return `${opened ? `opened ${opened} · ` : ''}approved ${formatCurrency(num(w.totalGlAmount))}`
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
  if (soaSubmitted(r)) return 'soa'
  return null
}
// Stage colours run red → green: each step is one closer to the cheque.
const STAGE_STYLE: Record<string, { bg: string; fg: string; bar: string }> = {
  'STAR OFFICE': { bg: '#fee2e2', fg: '#b91c1c', bar: '#ef4444' },
  BILLING: { bg: '#ffedd5', fg: '#c2410c', bar: '#f97316' },
  ACCOUNTING: { bg: '#ecfccb', fg: '#4d7c0f', bar: '#84cc16' },
  CASHIER: { bg: '#dcfce7', fg: '#15803d', bar: '#16a34a' },
  PAID: { bg: '#bbf7d0', fg: '#14532d', bar: '#15803d' },
}
const stageIndex = (s?: string | null) => (GL_STAGES as readonly string[]).indexOf(s || '')

/** One segment per step, filled up to the letter's stage, each in its own step colour. */
// Stage column filter: tick any number of stages (Hannah 2026-11-11 — "allow this to
// be a tickbox so i can have more than 1"). Empty = every stage. The list opens in a
// fixed-position popover so a short table cannot clip it.
const STAGE_FILTER_OPTIONS = [...GL_STAGES.map(s => ({ key: s as string, label: s as string })), { key: '—', label: 'Not set' }]
function StageTickFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!at) return
    const outside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setAt(null)
    }
    const close = () => setAt(null)
    document.addEventListener('mousedown', outside)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', outside)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [at])
  const label = !value.length ? 'All'
    : value.length === 1 ? (STAGE_FILTER_OPTIONS.find(o => o.key === value[0])?.label ?? value[0])
    : `${value.length} stages`
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter(x => x !== k) : [...value, k])
  return (
    <>
      <button ref={btnRef} type="button"
        onClick={e => {
          if (at) { setAt(null); return }
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ top: r.bottom + 4, left: r.left })
        }}
        className="mt-1 w-full min-w-[110px] flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border text-[10px] font-normal bg-white"
        style={{ borderColor: value.length ? 'var(--deep-teal, #14532d)' : 'var(--light-gray)', color: 'var(--charcoal)' }}
        title={value.length ? `Showing: ${value.map(k => STAGE_FILTER_OPTIONS.find(o => o.key === k)?.label ?? k).join(', ')}` : 'Filter by stage'}>
        <span className="truncate">{label}</span>
        <ChevronDown size={10} />
      </button>
      {at && (
        <div ref={boxRef} className="fixed z-50 w-44 rounded-xl border bg-white shadow-lg p-1.5 text-xs font-normal normal-case"
          style={{ top: at.top, left: at.left, borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={!value.length} onChange={() => onChange([])} className="accent-current" />
            All
          </label>
          <div className="my-1 border-t" style={{ borderColor: 'var(--light-gray)' }} />
          {STAGE_FILTER_OPTIONS.map(o => {
            const st = STAGE_STYLE[o.key]
            return (
              <label key={o.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={value.includes(o.key)} onChange={() => toggle(o.key)} className="accent-current" />
                <span className="font-semibold" style={{ color: st ? st.fg : 'var(--mid-gray)' }}>{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </>
  )
}

const CLEAR_STAGE = '__clear'

/** Tick-all box for the Detailed GL bulk stage; a dash while only some are ticked. */
function TickAll({ checked, some, disabled, onChange, title }: { checked: boolean; some: boolean; disabled: boolean; onChange: () => void; title: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !checked }, [some, checked])
  return (
    <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} title={title} aria-label="Tick every letter shown"
      className="w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" style={{ accentColor: 'var(--teal)' }} />
  )
}

function StageSteps({ stage }: { stage?: string | null }) {
  const at = stageIndex(stage)
  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle" title={at < 0 ? 'Stage not set' : `Step ${at + 1} of ${GL_STAGES.length}: ${stage}`}>
      {GL_STAGES.map((st, i) => (
        <span key={st} className="inline-block h-1.5 w-3 rounded-full" style={{ background: i <= at ? STAGE_STYLE[st].bar : 'var(--light-gray)' }} />
      ))}
    </span>
  )
}

const TONE_BG: Record<'nowallet' | 'paid' | 'soa', string> = {
  nowallet: '#fef2f2',  // red-50
  paid: '#f0fdf4',      // green-50
  soa: '#fefce8',       // yellow-50
}

/** The SOA resubmission date, but only once it has arrived — same rule. */
function soaResubmittedOn(r: Row): string | null {
  if (!r.soaResubmittedAt) return null
  return new Date(r.soaResubmittedAt).getTime() <= Date.now() ? r.soaResubmittedAt : null
}

/**
 * The resubmission clock. Some SOAs come back for errors and go in again;
 * this clock runs from that second filing, alongside — not instead of — the
 * first-submission clock, so the sheet shows both how long the agency has had
 * the letter overall and how long since the corrected SOA went back. Same
 * stop rule: a landed payment stops it, a post-dated cheque does not. Blank
 * until a resubmission date is recorded.
 */
function arRunningDaysResub(r: Row): number | null {
  const now = Date.now()
  const start = soaResubmittedOn(r)
  if (!start) return null
  const paidAt = r.lastPaymentDate ? new Date(r.lastPaymentDate).getTime() : null
  const end = paidAt != null && paidAt <= now ? paidAt : now
  return Math.floor((end - new Date(start).getTime()) / 86_400_000)
}

/**
 * Whether the SOA has been submitted at all. A letter cannot be paid without one
 * — the agency settles against the SOA — so a payment proves submission even
 * when nobody recorded the date. Four letters are in that state today; reporting
 * them as "SOA submitted NO" while showing a payment beside it was the
 * contradiction. The date column still shows blank, because the date genuinely
 * is not known and inventing one would be worse than admitting the gap.
 */
function soaSubmitted(r: Row): boolean {
  return !!soaSubmittedOn(r) || r.paid
}

/** A payment that has actually landed — a post-dated cheque has not. */
function settledOn(r: Row): string | null {
  if (!r.paid || !r.lastPaymentDate) return null
  return new Date(r.lastPaymentDate).getTime() <= Date.now() ? r.lastPaymentDate : null
}

/** Effective processor-fee rate: the stored per-letter rate, else the current
 *  25% default — the modal shows 25 pre-filled, so unsaved rows must not read
 *  as "no fee". Older 20% letters keep their stored rate once saved. */
/** The current rate, used when a letter has none recorded. */
const DEFAULT_COMMISSION_RATE = 25

/**
 * The processor fee rate, and whether it is the letter's own or an assumption.
 *
 * Defaulting is what makes the column useful — most letters have no rate saved,
 * and computing from the stored value alone left the fee blank everywhere. But
 * the rate genuinely varies: the East OPGL sheet carries 38 letters at 25%, 7 at
 * 20% and one at 12%, so an assumed 25% overstates a 20% letter's fee by a
 * quarter. The caller is told which it is so the screen and the exports can say
 * so, rather than presenting a guess in the same shape as a recorded figure.
 */
function commissionRateOf(r: Row): { rate: number; assumed: boolean } {
  const stored = num(r.soaCommissionRate)
  return stored > 0
    ? { rate: stored, assumed: false }
    : { rate: DEFAULT_COMMISSION_RATE, assumed: true }
}
function commissionOf(r: Row): number {
  return num(r.soaAmount) * (commissionRateOf(r).rate / 100)
}

/** Columns in the order the OPGL SUMMARY sheet uses, with Branch added. */
type ColKey =
  | 'stage' | 'name' | 'branch' | 'docsDate' | 'requested' | 'released' | 'approved' | 'soaAmount'
  | 'posBalance'
  | 'rendered' | 'soaSubmitted' | 'soaDate' | 'soaResubDate' | 'status' | 'paidDate' | 'arDays' | 'arDaysResub' | 'perMonths'
  | 'guardian' | 'drive' | 'commission' | 'payout' | 'qb' | 'linked' | 'glNo'

interface Col { key: ColKey; label: string; numeric?: boolean }

const COLS: Col[] = [
  // Hannah, 2026-11-03: which OP office the letter is at, so each stage can be chased.
  { key: 'stage', label: 'Stage' },
  { key: 'name', label: 'Name' },
  // Hannah 11/11: the number printed on the OP letter — OP payment lists name letters by it.
  { key: 'glNo', label: 'GL No.' },
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
  { key: 'soaResubDate', label: 'SOA Resubmission Date' },
  { key: 'status', label: 'Status' },
  { key: 'paidDate', label: 'Date of Payment (in check)' },
  { key: 'arDays', label: 'AR running days (1st SOA)', numeric: true },
  { key: 'arDaysResub', label: 'AR running days (resubmission)', numeric: true },
  { key: 'perMonths', label: 'Per months', numeric: true },
  { key: 'guardian', label: 'Guardian Name' },
  { key: 'drive', label: 'Files' },
  { key: 'commission', label: 'GL Processor Fee', numeric: true },
  { key: 'payout', label: 'Payout' },
  { key: 'qb', label: 'QB entry' },
]

function cellText(r: Row, k: ColKey): string {
  switch (k) {
    case 'stage': return r.glStage || '—'
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
    case 'soaSubmitted': return soaSubmitted(r) ? 'YES' : 'NO'
    // The recorded date still shows even when it is in the future — it is the
    // planned filing date, and hiding it would lose information the sheet holds.
    case 'soaDate': return fmtDate(r.soaSubmittedAt) || '—'
    case 'soaResubDate': return fmtDate(r.soaResubmittedAt) || '—'
    case 'status': return r.paid ? 'PAID' : 'UNPAID'
    case 'paidDate': return fmtDate(r.lastPaymentDate) || 'unpaid'
    case 'arDays': { const d = arRunningDays(r); return d == null ? '—' : String(d) }
    case 'arDaysResub': { const d = arRunningDaysResub(r); return d == null ? '—' : String(d) }
    case 'perMonths': return typeof r.monthsToPay === 'number' ? `${r.monthsToPay.toFixed(2)}` : '—'
    case 'guardian': return r.guardianName || '—'
    case 'drive': { const n = r.files.length; return n ? `${n} file${n === 1 ? '' : 's'}` : '—' }
    case 'commission': {
      const c = commissionOf(r)
      if (!c) return '—'
      const { rate, assumed } = commissionRateOf(r)
      // "assumed" travels into the Excel and PDF exports too, which is where an
      // unmarked guess would do the most damage.
      return `${formatCurrency(c)} (${rate}%${assumed ? ' assumed' : ''})`
    }
    case 'payout': return r.payoutBatch || '—'
    case 'qb': return r.qbEntry || '—'
    case 'glNo': return r.glLetterNo || '—'
  }
}

function sortValue(r: Row, k: ColKey): string | number {
  switch (k) {
    // Process order (STAR OFFICE first, PAID last), letters with no stage after them.
    case 'stage': { const i = (GL_STAGES as readonly string[]).indexOf(r.glStage || ''); return i < 0 ? GL_STAGES.length : i }
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
    case 'soaSubmitted': return soaSubmitted(r) ? 'YES' : 'NO'
    case 'soaDate': return dayKey(r.soaSubmittedAt) || '￿'
    case 'soaResubDate': return dayKey(r.soaResubmittedAt) || '￿'
    case 'status': return r.paid ? 'PAID' : 'UNPAID'
    case 'paidDate': return dayKey(r.lastPaymentDate) || '￿'
    case 'arDays': return arRunningDays(r) ?? Number.MAX_SAFE_INTEGER
    case 'arDaysResub': return arRunningDaysResub(r) ?? Number.MAX_SAFE_INTEGER
    case 'perMonths': return typeof r.monthsToPay === 'number' ? r.monthsToPay : Number.MAX_SAFE_INTEGER
    case 'guardian': return r.guardianName || ''
    case 'drive': return r.files.length
    case 'commission': return commissionOf(r)
    case 'payout': return r.payoutBatch || ''
    case 'qb': return r.qbEntry || ''
    case 'glNo': return r.glLetterNo || ''
  }
}

export default function DetailedGl({
  wallets, glCases = [], canWrite, onSaved, focusId = '',
}: {
  wallets: GlCaseWallet[]
  glCases?: GlCaseRow[]
  canWrite: boolean
  onSaved: () => void
  /** Row (wallet or case id) a global-search hit wants revealed. */
  focusId?: string
}) {
  const [search, setSearch] = useState('')
  const [noSoaOnly, setNoSoaOnly] = useState(false)
  // State tickboxes (Paid / SOA submitted / Needs a GL wallet) — multiple ticked = union
  const [toneTicks, setToneTicks] = useState<Exclude<RowTone, null>[]>([])
  const [writtenOffOnly, setWrittenOffOnly] = useState(false)
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({})
  // Stage filter: any number of stages at once ('—' = not set); none ticked = all (Hannah 2026-11-11).
  const [stageTicks, setStageTicks] = useState<string[]>([])
  const toggleStage = (k: string) => setStageTicks(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))
  const [sortKey, setSortKey] = useState<ColKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<GlCaseWallet | null>(null)
  const [editingCase, setEditingCase] = useState<GlCaseRow | 'new' | null>(null)

  // Stage picked in the table, shown at once while it saves.
  const [stageEdits, setStageEdits] = useState<Record<string, string | null>>({})
  const [stageError, setStageError] = useState('')
  const allRows = useMemo(
    () => buildRows(wallets, glCases).map(r => (r.key in stageEdits && !r.paid ? { ...r, glStage: stageEdits[r.key] } : r)),
    [wallets, glCases, stageEdits],
  )
  const saveStage = async (r: Row, value: string) => {
    const glStage = value || null
    setStageError('')
    setStageEdits(m => ({ ...m, [r.key]: glStage }))
    try {
      const res = r.caseId
        ? await fetch('/api/accounts-receivable/gl-case', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: r.caseId, glStage }) })
        : await fetch('/api/accounts-receivable/gl-case', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.wallet?.id, glStage }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the stage')
    } catch (e) {
      setStageEdits(m => { const n = { ...m }; delete n[r.key]; return n })
      setStageError(`${r.patientName}: ${e instanceof Error ? e.message : 'Could not save the stage'}`)
    }
  }

  // Bulk stage (Hannah 2026-11-11: "allow me to tick all and set the stage in
  // bulk"). Ticks are row keys; only ticked rows still on screen are changed, so
  // a filter that hides a ticked row also leaves it alone.
  const canSetStage = (r: Row) => canWrite && !!(r.caseId || r.wallet) && !r.paid
  const [picked, setPicked] = useState<string[]>([])
  const [bulkStage, setBulkStage] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const togglePick = (k: string) => setPicked(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k]))
  const saveStageBulk = async (targets: Row[], value: string) => {
    const glStage = value === CLEAR_STAGE ? null : value
    const label = glStage || 'no stage'
    if (!targets.length || !confirm(`Set ${targets.length} letter${targets.length === 1 ? '' : 's'} to ${label}?`)) return
    setStageError(''); setBulkBusy(true)
    const before = Object.fromEntries(targets.map(r => [r.key, r.key in stageEdits ? stageEdits[r.key] : undefined]))
    setStageEdits(m => ({ ...m, ...Object.fromEntries(targets.map(r => [r.key, glStage])) }))
    try {
      const res = await fetch('/api/accounts-receivable/gl-case/stage', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          glStage,
          caseIds: targets.filter(r => r.caseId).map(r => r.caseId),
          walletIds: targets.filter(r => !r.caseId && r.wallet).map(r => r.wallet!.id),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the stages')
      setPicked([]); setBulkStage('')
    } catch (e) {
      setStageEdits(m => {
        const n = { ...m }
        for (const [k, v] of Object.entries(before)) { if (v === undefined) delete n[k]; else n[k] = v }
        return n
      })
      setStageError(`Bulk stage: ${e instanceof Error ? e.message : 'Could not save the stages'}`)
    } finally { setBulkBusy(false) }
  }

  // A global-search hit lands here with ?focus=<wallet or case id>: scroll the
  // row into view and flash it once the data is in.
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!focusId || focusedOnce.current || !allRows.length) return
    const hit = allRows.find(r => r.key === `wallet:${focusId}` || r.key === `case:${focusId}` || r.caseId === focusId)
    if (!hit) return
    focusedOnce.current = true
    setTimeout(() => {
      const el = document.getElementById(`glrow-${hit.key}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid var(--teal)'
      setTimeout(() => { el.style.outline = '' }, 2500)
    }, 150)
  }, [focusId, allRows])

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

  // Every filter except the state tickboxes — their counts must come from this
  // base, or ticking one state would zero the other two counts.
  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = allRows
    if (ticked.length !== branchOptions.length) out = out.filter(r => ticked.includes(r.branch || ''))
    if (q) {
      // One box, every column — staff search by guardian or QB ref as often as by name.
      out = out.filter(r => COLS.some(c => cellText(r, c.key).toLowerCase().includes(q)))
    }
    if (noSoaOnly) out = out.filter(r => !soaSubmitted(r))
    for (const [k, v] of Object.entries(filters)) {
      const needle = (v || '').trim().toLowerCase()
      if (!needle) continue
      out = out.filter(r => cellText(r, k as ColKey).toLowerCase().includes(needle))
    }
    if (stageTicks.length) out = out.filter(r => stageTicks.includes(r.glStage || '—'))
    return out
  }, [allRows, search, filters, ticked, branchOptions, noSoaOnly, stageTicks])

  const baseRowsNoStage = useMemo(() => {
    if (!stageTicks.length) return baseRows
    const q = search.trim().toLowerCase()
    let out = allRows
    if (ticked.length !== branchOptions.length) out = out.filter(r => ticked.includes(r.branch || ''))
    if (q) out = out.filter(r => COLS.some(c => cellText(r, c.key).toLowerCase().includes(q)))
    if (noSoaOnly) out = out.filter(r => !soaSubmitted(r))
    for (const [k, v] of Object.entries(filters)) {
      const needle = (v || '').trim().toLowerCase()
      if (!needle || k === 'stage') continue
      out = out.filter(r => cellText(r, k as ColKey).toLowerCase().includes(needle))
    }
    return out
  }, [baseRows, allRows, search, filters, ticked, branchOptions, noSoaOnly, stageTicks])

  const rows = useMemo(() => {
    let out = baseRows
    if (toneTicks.length) out = out.filter(r => { const t = rowTone(r); return t !== null && toneTicks.includes(t) })
    if (writtenOffOnly) out = out.filter(r => r.writtenOff > 0)
    return [...out].sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [baseRows, toneTicks, writtenOffOnly, sortKey, sortDir])

  const pickable = useMemo(() => rows.filter(canSetStage), [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const pickedRows = useMemo(() => { const set = new Set(picked); return pickable.filter(r => set.has(r.key)) }, [pickable, picked])
  const allPicked = pickable.length > 0 && pickedRows.length === pickable.length
  const pickAll = () => setPicked(allPicked ? [] : pickable.map(r => r.key))

  const toggleSort = (k: ColKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const activeFilters = Object.values(filters).filter(v => (v || '').trim()).length + (stageTicks.length ? 1 : 0)
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
          {canWrite && (
            <th className="px-2 py-2 w-14 align-top">
              <TickAll checked={allPicked} some={pickedRows.length > 0} disabled={!pickable.length} onChange={pickAll}
                title={allPicked ? 'Untick every letter' : `Tick every letter shown whose stage can be set (${pickable.length})`} />
            </th>
          )}
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
              {c.key === 'stage' ? (
                <StageTickFilter value={stageTicks} onChange={setStageTicks} />
              ) : (
              <input
                value={filters[c.key] || ''}
                onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))}
                placeholder="Filter…"
                className="mt-1 w-full min-w-[70px] px-1.5 py-0.5 rounded border text-[10px] outline-none font-normal"
                style={{ borderColor: 'var(--light-gray)' }} />
              )}
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
          <tr key={r.key} id={`glrow-${r.key}`}
            className={`border-t ${tone ? '' : 'hover:bg-gray-50'}`}
            style={{ borderColor: 'var(--light-gray)', background: tone ? TONE_BG[tone] : undefined }}>
            {canWrite && (
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-1">
                  <input type="checkbox" checked={picked.includes(r.key)} disabled={!canSetStage(r)} onChange={() => togglePick(r.key)}
                    aria-label={`Tick ${r.patientName}`}
                    title={canSetStage(r) ? 'Tick to set the stage in bulk' : r.paid ? 'Paid — the stage is PAID' : 'No entry or wallet to save a stage on'}
                    className="w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" style={{ accentColor: 'var(--teal)' }} />
                  <button
                    onClick={() => (r.source ? setEditingCase(r.source) : setEditing(r.wallet))}
                    className="p-1 rounded hover:bg-teal-50"
                    title={r.source ? 'Edit entry' : 'Edit case details'}>
                    <Pencil size={12} style={{ color: 'var(--teal)' }} />
                  </button>
                </span>
              </td>
            )}
            {COLS.map(c => (
              <td key={c.key}
                className={`px-2 py-1.5 whitespace-nowrap ${c.numeric ? 'text-right tabular-nums' : ''}`}
                style={{ color: cellText(r, c.key) === '—' ? 'var(--light-gray)' : 'var(--charcoal)' }}>
                {c.key === 'stage'
                  ? (() => {
                      const st = r.glStage ? STAGE_STYLE[r.glStage] : null
                      return (
                        <span className="inline-flex items-center">
                          {canWrite && (r.caseId || r.wallet) && !r.paid
                            ? <select value={r.glStage || ''} onChange={e => saveStage(r, e.target.value)}
                                className="px-1.5 py-0.5 rounded border text-[11px] font-semibold outline-none"
                                style={st ? { background: st.bg, color: st.fg, borderColor: st.bar } : { background: 'white', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
                                <option value="">— set stage —</option>
                                {GL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            : <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold" title={r.paid ? 'A payment is recorded for this letter' : undefined} style={st ? { background: st.bg, color: st.fg } : { color: 'var(--light-gray)' }}>{r.glStage || '—'}</span>}
                          <StageSteps stage={r.glStage} />
                        </span>
                      )
                    })()
                  : c.key === 'drive'
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
  const releaseToSoa  = avgSpan(r => r.glReleasedAt, soaSubmittedOn)
  // Settled letters only: this is SOA submission to the cheque, so an unpaid
  // letter has no end point. It is the same span the AR running days column
  // measures once a letter is paid.
  const soaToPayment  = avgSpan(soaSubmittedOn, settledOn)

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
  const noSoaCount = baseRows.filter(r => !soaSubmitted(r)).length
  const toneCounts = useMemo(() => {
    const c = { paid: 0, soa: 0, nowallet: 0 }
    for (const r of baseRows) { const t = rowTone(r); if (t) c[t]++ }
    return c
  }, [baseRows])
  const toggleTone = (t: Exclude<RowTone, null>) =>
    setToneTicks(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  // Shared with the AR Dashboard's GL "AR Days (Overall)" (lib/gl-letters), so the two agree.
  const arDaysAvg = avgArRunningDays(rows)
  const avgArDays = arDaysAvg?.avg ?? null

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
              : `${(avgArDays / 30.44).toFixed(2)} months · ${arDaysAvg!.n} of ${rows.length} letters`}
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
        {/* The row tints double as filters: each state is a tickbox (multiple
            ticked = union), so the legend is also the control. */}
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
          style={{ border: `1px solid ${toneTicks.includes('paid') ? '#15803d' : '#86b78f'}`,
                   background: TONE_BG.paid, color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={toneTicks.includes('paid')} onChange={() => toggleTone('paid')} className="accent-current" />
          Paid
          <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>({toneCounts.paid})</span>
        </label>
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
          style={{ border: `1px solid ${toneTicks.includes('soa') ? '#a16207' : '#d4c34a'}`,
                   background: TONE_BG.soa, color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={toneTicks.includes('soa')} onChange={() => toggleTone('soa')} className="accent-current" />
          SOA submitted
          <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>({toneCounts.soa})</span>
        </label>
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
          style={{ border: `1px solid ${toneTicks.includes('nowallet') ? '#dc2626' : '#e08a8a'}`,
                   background: TONE_BG.nowallet, color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={toneTicks.includes('nowallet')} onChange={() => toggleTone('nowallet')} className="accent-current" />
          Needs a GL wallet in POS
          <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>({toneCounts.nowallet})</span>
        </label>
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
          <button onClick={() => { setFilters({}); setStageTicks([]) }}
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

      {(() => {
        // Counted over every filter except the stage filter itself, so clicking a stage keeps the others visible.
        const base = baseRowsNoStage
        const steps = [...GL_STAGES.map(st => ({ key: st as string, label: st as string, rows: base.filter(r => r.glStage === st) })),
          { key: '—', label: 'Not set', rows: base.filter(r => !r.glStage) }]
        const writtenOff = base.filter(r => r.writtenOff > 0)
        return (
          <div className="flex items-stretch gap-1 flex-wrap mb-2">
            {steps.map((x, i) => {
              const st = STAGE_STYLE[x.key]
              const on = stageTicks.includes(x.key)
              // PAID counts the cash that came in; the steps before it, what the SOA asks for.
              const amt = x.rows.reduce((t, r) => t + (x.key === 'PAID' ? r.received : num(r.soaAmount || r.approved)), 0)
              return (
                <div key={x.key} className="flex items-center gap-1">
                  <button onClick={() => toggleStage(x.key)}
                    className="px-3 py-1.5 rounded-xl border text-left"
                    style={{ background: st ? st.bg : 'white', borderColor: on ? (st ? st.bar : 'var(--charcoal)') : 'var(--light-gray)', borderWidth: on ? 2 : 1 }}
                    title={!stageTicks.length ? `Show only ${x.label}` : on ? `Stop showing ${x.label}` : `Also show ${x.label}`}>
                    <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: st ? st.fg : 'var(--mid-gray)' }}>
                      {st ? `${i + 1}. ` : ''}{x.label}
                    </span>
                    <span className="block text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
                      {x.rows.length} <span className="text-[11px] font-normal" style={{ color: 'var(--mid-gray)' }}>· {formatCurrency(amt)}</span>
                    </span>
                  </button>
                  {i < GL_STAGES.length - 1 && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>→</span>}
                  {x.key === 'PAID' && (
                    <button onClick={() => setWrittenOffOnly(v => !v)}
                      className="px-3 py-1.5 rounded-xl border text-left ml-0.5"
                      style={{ background: '#f5f5f4', borderColor: writtenOffOnly ? '#57534e' : 'var(--light-gray)', borderWidth: writtenOffOnly ? 2 : 1 }}
                      title={writtenOffOnly ? 'Show every letter' : 'Show only written-off letters'}>
                      <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: '#57534e' }}>Written off</span>
                      <span className="block text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
                        {writtenOff.length} <span className="text-[11px] font-normal" style={{ color: 'var(--mid-gray)' }}>· {formatCurrency(writtenOff.reduce((t, r) => t + r.writtenOff, 0))}</span>
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
      {stageError && <p className="text-xs text-red-600 mb-1">{stageError}</p>}
      {canWrite && pickedRows.length > 0 && (
        // Floats over the page (and over the full-screen view, which shows only the table).
        <div className="fixed bottom-4 inset-x-4 mx-auto w-fit z-[70] flex items-center gap-2 flex-wrap justify-center px-4 py-2.5 rounded-2xl border shadow-2xl max-w-[calc(100vw-2rem)]"
          style={{ background: 'var(--pale-teal)', borderColor: 'var(--teal)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
            {pickedRows.length} letter{pickedRows.length === 1 ? '' : 's'} ticked
          </span>
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Set stage to</span>
          <select value={bulkStage} onChange={e => setBulkStage(e.target.value)} disabled={bulkBusy}
            className="px-2 py-1 rounded-lg border text-xs font-semibold outline-none bg-white"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">— choose —</option>
            {GL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            <option value={CLEAR_STAGE}>Clear the stage (Not set)</option>
          </select>
          <button onClick={() => saveStageBulk(pickedRows, bulkStage)} disabled={!bulkStage || bulkBusy}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--teal)' }}>
            {bulkBusy ? 'Saving…' : 'Apply'}
          </button>
          <button onClick={() => setPicked([])} disabled={bulkBusy}
            className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>
            Untick all
          </button>
          {stageError && <span className="basis-full text-center text-xs text-red-600">{stageError}</span>}
        </div>
      )}
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
    soaResubmittedAt: dayKey(entry?.soaResubmittedAt),
    soaCommissionRate: entry?.soaCommissionRate != null ? String(num(entry.soaCommissionRate)) : '25',
    guardianName: entry?.guardianName || '',
    payoutBatch: entry?.payoutBatch || '',
    qbEntry: entry?.qbEntry || '',
    glLetterNo: entry?.glLetterNo || '',
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
          {field('GL No.', 'glLetterNo', 'text', 'Printed at the bottom of the OP guarantee letter, beside the QR code — e.g. PHD-170925112436-WA7')}
          {field('Approved GL (₱)', 'approvedAmount', 'number', 'Ignored once tagged — the wallet’s approved amount wins.')}
          {field('Amount in SOA (₱)', 'soaAmount', 'number')}
          {field('Date submission of SOA', 'soaSubmittedAt', 'date', 'AR running days and Per months count from here')}
          {field('SOA Resubmission Date', 'soaResubmittedAt', 'date', 'Only for SOAs returned for errors — starts the second AR-days clock')}
          {field('GL processor fee rate (%)', 'soaCommissionRate', 'number', '25% is the current rate and is pre-filled, but older letters were 20% and one is 12% — check the SOA before saving, because saving records this rate against the letter.')}
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
    soaResubmittedAt: dayKey(wallet.soaResubmittedAt),
    guardianName: wallet.guardianName || '',
    // 25% is the current rate; older letters were 20%, so it stays typed
    // per letter and only pre-fills when nothing has been recorded yet.
    soaCommissionRate: wallet.soaCommissionRate != null ? String(num(wallet.soaCommissionRate)) : '25',
    payoutBatch: wallet.payoutBatch || '',
    qbEntry: wallet.qbEntry || '',
    glLetterNo: wallet.glLetterNo || '',
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
          {field('GL No.', 'glLetterNo', 'text', 'Printed at the bottom of the OP guarantee letter, beside the QR code — e.g. PHD-170925112436-WA7')}
          {field('Amount in SOA (₱)', 'soaAmount', 'number')}
          {field('Date submission of SOA', 'soaSubmittedAt', 'date', 'AR running days and Per months count from here')}
          {field('SOA Resubmission Date', 'soaResubmittedAt', 'date', 'Only for SOAs returned for errors — starts the second AR-days clock')}
          {field('GL processor fee rate (%)', 'soaCommissionRate', 'number', '25% is the current rate and is pre-filled, but older letters were 20% and one is 12% — check the SOA before saving, because saving records this rate against the letter.')}
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
            {/* min-w-0 on the select: a flex child defaults to min-width:auto, which
                is its content width — and these options are long ("NAME · BRANCH ·
                opened ... · approved P49,912.50"), so the row grew past the modal
                instead of the select shrinking. */}
            <div className="flex gap-2 min-w-0">
              <select value={moveTo} onChange={e => setMoveTo(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-white truncate" style={{ border: '1px solid var(--light-gray)' }}>
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
