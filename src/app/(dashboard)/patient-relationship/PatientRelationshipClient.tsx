'use client'

import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  HeartHandshake, Phone, Mail, Clock, AlertTriangle, CheckCircle, MessageSquare, Check,
  Calendar, Filter, Users, XCircle, ChevronDown, ChevronRight,
  Upload, Eye, Trash2, FileText, QrCode, Loader2, X, Search, RotateCcw, Plus,
  UserCheck, UserX, Inbox, Info, Ban, Send, Building2, RefreshCw,
} from 'lucide-react'
import { branchLabel as sharedBranchLabel } from '@/lib/branch-label'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

type Tab = 'waitlist' | 'followup' | 'noshow' | 'cancellation'

// Only East/Greenhills \u2014 this tab's data (waitlist/follow-up/no-show/
// cancellation) is clinic-only, deliberately excludes Verdana.
const BRANCHES = [
  { value: 'SANDBOX_EAST', label: sharedBranchLabel('SANDBOX_EAST') },
  { value: 'SANDBOX_GREENHILLS', label: sharedBranchLabel('SANDBOX_GREENHILLS') },
]

// Age of a log in words. Months once past ~8 weeks, because "247 days ago" makes
// the reader do the division to answer the only question that matters here:
// how far outside the 6-month window this is.
function formatAge(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return '1 day'
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.floor(days / 7)} weeks`
  const months = Math.floor(days / 30)
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`
  return `${Math.floor(months / 12)} years`
}

function branchLabel(b?: string | null) {
  return BRANCHES.find(x => x.value === b)?.label ?? b ?? '\u2014'
}

// ── Presentation helpers (display only — no data or filter logic lives here) ──
// Same control vocabulary as the Patient CRM / Customer Survey / Clinic
// Utilization pages: white field, light-gray rule, teal accent on focus.

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_SM = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
import type { OutreachState } from '@/lib/waitlist-outreach'

const ICON_BTN = 'inline-flex items-center justify-center w-7 h-7 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50'
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5'
const SUBTLE_BG = '#F8FAF9'
const ROW_RULE = '1px solid #EEF2F1'
const POPOVER_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }
const MODAL_BACKDROP: CSSProperties = { background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }
const fmtDay = (d: string | number | Date) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Soft rounded badge — every chip on the page goes through this so they share a height. */
function Badge({ children, bg, fg, title, strong = false, caps = false }: {
  children: ReactNode; bg: string; fg: string; title?: string; strong?: boolean
  /** Small-caps warning style (e.g. SUBJECT TO SLOT REMOVAL). */
  caps?: boolean
}) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full leading-[1.35] whitespace-nowrap align-middle ${caps ? 'text-[10px] uppercase tracking-wide' : 'text-[11px]'} ${strong ? 'font-bold' : 'font-semibold'}`}
      style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

/** Tinted info strip for the per-tab rules and warnings. */
function Callout({ tone, icon, children }: {
  tone: 'info' | 'warn' | 'danger' | 'neutral'; icon?: ReactNode; children: ReactNode
}) {
  const t = {
    info:    { bg: '#EFF6FF', border: '#DBEAFE', fg: '#1E40AF', ic: '#2563EB' },
    warn:    { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E', ic: '#D97706' },
    danger:  { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B', ic: '#DC2626' },
    neutral: { bg: SUBTLE_BG, border: 'var(--light-gray)', fg: '#475569', ic: '#64748B' },
  }[tone]
  return (
    <div className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-xs leading-relaxed"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.fg }}>
      {icon && <span className="flex-shrink-0 mt-px" style={{ color: t.ic }}>{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Inline load failure, shown above the table instead of a convincing empty list. */
function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
      style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }} role="alert">
      <AlertTriangle size={14} className="flex-shrink-0" style={{ color: '#DC2626' }} />
      <span className="flex-1 min-w-0">{message}</span>
      {onRetry ? (
        <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline">
          <RefreshCw size={11} /> Try again
        </button>
      ) : (
        <span style={{ color: '#B91C1C' }}>Reload the page to try again.</span>
      )}
    </div>
  )
}

/** Segmented control used for the page tabs and each tab's sub-tabs. */
function Segmented<T extends string>({ items, value, onChange, label, size = 'sm', stretch = false, disabled = false }: {
  items: { key: T; label: string; icon?: any }[]
  value: T; onChange: (k: T) => void; label: string; size?: 'md' | 'sm'; stretch?: boolean
  disabled?: boolean
}) {
  return (
    <div role="tablist" aria-label={label}
      className={`flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full ${stretch ? 'w-full' : 'w-fit'}`}
      style={size === 'md' ? CARD_STYLE : { background: '#EEF3F1' }}>
      {items.map(({ key, label: l, icon: Icon }) => {
        const active = value === key
        return (
          <button key={key} role="tab" aria-selected={active} onClick={() => onChange(key)} disabled={disabled && !active}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-wait ${stretch ? 'flex-1' : ''} ${size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'} ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? size === 'md'
                ? { background: 'var(--teal)', color: '#fff' }
                : { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {Icon && <Icon size={size === 'md' ? 15 : 13} />}
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Name search box with a leading icon. */
function SearchBox({ value, onChange, placeholder = 'Search by name…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="relative flex-1 min-w-[220px] max-w-[380px]">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
      <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        aria-label="Search by name"
        className={`${CONTROL} w-full pl-9`} style={CONTROL_STYLE} />
    </div>
  )
}

/** "12 of 40 patients" read-out at the right of a toolbar. */
function ResultCount({ shown, total, noun, loading }: { shown: number; total: number; noun: string; loading?: boolean }) {
  return (
    <span className="ml-auto text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
      {loading ? 'Loading…' : (
        <>
          <span className="font-semibold" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{shown.toLocaleString()}</span>
          {shown !== total && <> of {total.toLocaleString()}</>} {noun}
        </>
      )}
    </span>
  )
}

/** Placeholder rows that keep the table's shape while a tab loads. */
function SkeletonRows({ cols, rows = 7 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`sk-${i}`} style={{ borderBottom: ROW_RULE }} aria-hidden>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <Skeleton className="h-3" style={{ width: j === 0 ? 14 : `${Math.max(40, 85 - ((i + j) % 4) * 12)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Card frame around a table: scrolls on its own (both axes) so the page never scrolls sideways. */
const TABLE_SCROLL: CSSProperties = { maxHeight: 'calc(100vh - 230px)' }

/** Modal frame shared by the remarks, delete and QR dialogs. */
function ModalShell({ title, subtitle, icon, tone = 'default', onBackdrop, onClose, zIndex, maxWidth = 440, children, footer }: {
  title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; tone?: 'default' | 'danger'
  onBackdrop?: () => void; onClose?: () => void; zIndex: number; maxWidth?: number
  children: ReactNode; footer?: ReactNode
}) {
  return (
    <div onClick={onBackdrop} className="fixed inset-0 flex items-center justify-center p-4"
      style={{ ...MODAL_BACKDROP, zIndex }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        className="w-full rounded-2xl flex flex-col overflow-hidden"
        style={{ background: '#fff', maxWidth, maxHeight: '90vh', boxShadow: '0 20px 60px rgba(15,23,42,0.25)' }}>
        <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <span className="flex-shrink-0 w-8 h-8 rounded-lg inline-flex items-center justify-center"
                style={tone === 'danger' ? { background: '#FEE2E2', color: '#B91C1C' } : { background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</h3>
              {subtitle && <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>}
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 flex-shrink-0"
              style={{ color: 'var(--mid-gray)', lineHeight: 0 }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

const PAGE_OPTIONS = [25, 50, 75, 100]

function Pagination({ total, page, perPage, onPage, onPerPage }: {
  total: number; page: number; perPage: number; onPage: (p: number) => void; onPerPage: (n: number) => void
}) {
  const pages = Math.ceil(total / perPage)
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)', borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
      <div className="flex items-center gap-2">
        <span>Rows</span>
        <select value={perPage} onChange={e => { onPerPage(Number(e.target.value)); onPage(1) }}
          aria-label="Rows per page" className="h-7 px-1.5 rounded-md text-xs outline-none" style={CONTROL_STYLE}>
          {PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
        </span>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => onPage(p)} aria-current={page === p ? 'page' : undefined}
              className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-semibold transition-colors ${page === p ? '' : 'hover:bg-white'}`}
              style={{
                background: page === p ? 'var(--teal)' : 'transparent', color: page === p ? '#fff' : 'var(--mid-gray)',
                fontVariantNumeric: 'tabular-nums',
              }}>{p}</button>
          ))}
          {pages > 10 && <span className="px-1">…</span>}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WAITLIST TAB
// ══════════════════════════════════════════════════════════════════════════════

// "All Forms" leads and is the default. Every registration route feeds the one
// waitlist, so an ALAGA or psych enquiry is chased from the same place as a
// plain registration rather than only being found by remembering to click its
// sub-tab. The single-form tabs stay for when someone wants just one intake.
const WAITLIST_FORMS = [
  { key: 'all', label: 'All Forms' },
  { key: 'registration', label: 'Registration' },
  { key: 'group-therapy', label: 'Group Therapy' },
  { key: 'sip', label: 'ALAGA' },
  { key: 'psych', label: 'Psych' },
]

// Per-row source identifier. Colours are only to tell the intakes apart at a
// glance down a mixed list — they carry no status meaning, so they stay clear
// of the green/red the Converted and Will-no-longer-avail chips use.
const FORM_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  registration:    { label: 'Registration', bg: '#E6F2F4', fg: '#12606C' },
  'group-therapy': { label: 'Group Therapy', bg: '#EDE9FE', fg: '#5B21B6' },
  sip:             { label: 'ALAGA',         bg: '#FEF3E2', fg: '#92400E' },
  psych:           { label: 'Psych',         bg: '#E0E7FF', fg: '#3730A3' },
}

// ── Service chips ────────────────────────────────────────────────────────────
// The intake forms spell the doctor options out in full — "Medical consultation
// - Development Pediatrician" is 47 characters, and three of those in one row
// would push every other column off screen. Only the "Medical consultation -"
// prefix is shortened, and only in the table: the distinguishing word is kept
// intact, the full label is on the cell's tooltip, and the filter list shows
// the labels exactly as the form words them. Abbreviating further would leave
// a chip that doesn't obviously correspond to anything you can tick.
function shortService(label: string): string {
  return label.replace(/^\s*medical consultation\s*-\s*/i, 'MD: ').trim()
}

// Coloured by service family so a glance down the column separates doctors from
// therapy from psychology. An unrecognised service — an "Other" write-in, or a
// line added to a form after this was written — gets neutral grey rather than
// being forced into a family it may not belong to.
function serviceChip(label: string): { bg: string; fg: string } {
  const l = label.toLowerCase()
  if (l.includes('medical consultation'))                   return { bg: '#FEE2E2', fg: '#B91C1C' }
  if (l.includes('speech'))                                 return { bg: '#FEF3C7', fg: '#92400E' }
  if (l.includes('occupational'))                           return { bg: '#CCFBF1', fg: '#115E59' }
  if (l.includes('physical therapy'))                       return { bg: '#CFFAFE', fg: '#155E75' }
  if (l.includes('sped') || l.includes('special education')) return { bg: '#EDE9FE', fg: '#5B21B6' }
  if (l.includes('psycholog'))                              return { bg: '#E0E7FF', fg: '#3730A3' }
  return { bg: '#F1F5F9', fg: '#475569' }
}

// ── Sorting ──────────────────────────────────────────────────────────────────
// All four tabs render the same table shell over different row shapes, so the
// sort lives here once and each tab supplies accessors for its own columns.
//
// A column with no accessor (row-expand chevrons, contact buttons) is rendered
// as a plain, unclickable header — sorting by a button is meaningless.

type SortDir = 'asc' | 'desc'
type SortCol = {
  key: string; label: string
  get?: (row: any) => string | number | null | undefined
  // Opt this column into the filter row — see useFilters below.
  filter?: FilterKind
  // 'multi' columns only: the cell's individual values. One row can hold
  // several (a patient asking for Speech Therapy *and* OT), which a single
  // `get` string cannot express without the filter having to re-split it.
  // `get` stays the joined string, so sorting and display are unaffected.
  values?: (row: any) => string[]
}

function useSort(cols: SortCol[], rows: any[]) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggle(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const col = cols.find(c => c.key === sortKey)
    if (!col?.get) return rows
    // Copy before sorting: rows is the caller's filtered array, and sorting it
    // in place mutates component state.
    return [...rows].sort((a, b) => {
      const av = col.get!(a), bv = col.get!(b)
      // Blanks sort last in BOTH directions — a patient with no first session
      // is missing data, not the earliest one, and flipping the arrow should
      // not parade empty rows to the top.
      const aEmpty = av === null || av === undefined || av === ''
      const bEmpty = bv === null || bv === undefined || bv === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [cols, rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggle }
}

function SortHeaders({ cols, sortKey, sortDir, onToggle }: {
  cols: SortCol[]; sortKey: string | null; sortDir: SortDir; onToggle: (key: string) => void
}) {
  return (
    <tr>
      {cols.map(c => {
        const active = sortKey === c.key
        const sortable = !!c.get
        return (
          // Background and rule sit on the cell, not the row: the header is
          // sticky, and a collapsed-border row rule scrolls away under it.
          <th key={c.key} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
            onClick={sortable ? () => onToggle(c.key) : undefined}
            title={sortable ? `Sort by ${c.label}` : undefined}
            aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
            style={{
              color: active ? 'var(--teal)' : 'var(--mid-gray)',
              background: SUBTLE_BG, boxShadow: 'inset 0 -1px 0 var(--light-gray)',
              cursor: sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
            }}>
            {c.label}
            {sortable && (
              // Reserve the arrow's width always, so turning sorting on does not
              // nudge the column headers sideways.
              <span style={{ display: 'inline-block', width: '0.9em', marginLeft: 2,
                             opacity: active ? 1 : 0.25 }}>
                {active ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
              </span>
            )}
          </th>
        )
      })}
    </tr>
  )
}

// ── Column filters ───────────────────────────────────────────────────────────
// Declared on the same COLS array that drives sorting, so a tab opts a column in
// by adding one field instead of wiring up a control by hand. Kinds:
//   'text'   substring match  (names, free text)
//   'select' exact match from a dropdown of the values actually present
//   'number' min/max range    (counts, day gaps)
//   'multi'  tick/untick several values; a row is kept if it has ANY ticked one
//
// A column with no accessor can't be filtered for the same reason it can't be
// sorted — there is no value behind it.

type FilterKind = 'text' | 'select' | 'number' | 'multi'
type FilterVal = { text?: string; min?: string; max?: string; set?: string[] }

function useFilters(cols: SortCol[], rows: any[], onChange?: () => void) {
  const [filters, setFilters] = useState<Record<string, FilterVal>>({})

  function setFilter(key: string, patch: FilterVal) {
    setFilters(f => {
      const next = { ...f, [key]: { ...f[key], ...patch } }
      // Drop emptied entries so the active count stays honest and Clear resets
      // to a genuinely empty state rather than a map of blank strings. An empty
      // tick list counts as emptied too — nothing ticked means no filter, not
      // a filter that matches nothing.
      const v = next[key]
      if (!v.text && !v.min && !v.max && !v.set?.length) delete next[key]
      return next
    })
    onChange?.()
  }
  function clearAll() { setFilters({}); onChange?.() }
  const activeCount = Object.keys(filters).length

  const filtered = useMemo(() => {
    if (activeCount === 0) return rows
    return rows.filter(row => cols.every(c => {
      const f = filters[c.key]
      if (!f || !c.get) return true
      const raw = c.get(row)
      if (c.filter === 'multi') {
        const want = f.set ?? []
        if (want.length === 0) return true
        // ANY, not ALL: ticking Speech Therapy and OT asks for the rows
        // involving either, which is how "include these services in the view"
        // reads. A row with none of them drops out — including a row with no
        // services recorded at all, which cannot satisfy a request for one.
        const have = c.values ? c.values(row) : String(raw ?? '').split(', ').filter(Boolean)
        return have.some(v => want.includes(v))
      }
      if (c.filter === 'number') {
        const n = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
        // A row with no number can't satisfy a range, so it drops out — same
        // reasoning as blanks sorting last rather than counting as zero.
        if (Number.isNaN(n)) return false
        if (f.min) { const lo = Number(f.min); if (!Number.isNaN(lo) && n < lo) return false }
        if (f.max) { const hi = Number(f.max); if (!Number.isNaN(hi) && n > hi) return false }
        return true
      }
      const q = (f.text ?? '').trim().toLowerCase()
      if (!q) return true
      const s = String(raw ?? '').toLowerCase()
      return c.filter === 'select' ? s === q : s.includes(q)
    }))
  }, [cols, rows, filters, activeCount])

  return { filtered, filters, setFilter, clearAll, activeCount }
}

const filterInputStyle: CSSProperties = {
  width: '100%', minWidth: 0, height: 28, padding: '0 8px', fontSize: '0.72rem',
  border: '1px solid var(--light-gray)', borderRadius: 7, background: '#fff',
  color: 'var(--charcoal)', fontFamily: 'inherit', outline: 'none',
}

// Tick/untick list for a 'multi' column. A dropdown rather than a row of
// checkboxes because the service list runs to a dozen entries and would
// otherwise set the height of the whole filter row.
//
// `size="md"` is the same control at toolbar height, for the Services filter
// that also sits above the Waitlist table (bound to the same filter state).
function MultiFilter({ label, options, selected, onChange, size = 'sm', icon }: {
  label: string; options: string[]; selected: string[]
  onChange: (next: string[]) => void
  size?: 'sm' | 'md'; icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  // The panel is positioned fixed, against the button's viewport rect, rather
  // than absolutely inside this cell. It lives in a table that scrolls
  // horizontally and sits in a rounded card, and an absolutely positioned panel
  // gets clipped by either of those — on a short result list the options simply
  // disappear below the card's edge. Re-placed on scroll and resize so it stays
  // on the button rather than drifting off it.
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null)
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 240)
    // Keep it on screen when the cell sits near the right edge.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setAt({ top: r.bottom + 4, left, width })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    // Capture phase: the scroll that matters is the table's, not the window's.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  // Close on an outside click or Escape. Without this the panel stays open
  // behind whatever the user clicks next, over the rows they are trying to read.
  //
  // The dismissing click is also swallowed, in the capture phase, because every
  // row behind this panel is itself clickable: without it, clicking away to put
  // the list down expands whichever submission happened to be underneath, which
  // reads as the table doing something you didn't ask for.
  useEffect(() => {
    if (!open) return
    const outside = (t: EventTarget | null) => !!box.current && !box.current.contains(t as Node)
    function onDown(e: MouseEvent) { if (outside(e.target)) setOpen(false) }
    function onClickCapture(e: MouseEvent) {
      if (outside(e.target)) { e.stopPropagation(); e.preventDefault() }
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary = selected.length === 0
    ? 'All'
    : selected.length === 1 ? selected[0] : `${selected.length} selected`
  const md = size === 'md'

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button ref={btn} type="button" onClick={() => setOpen(v => !v)}
        aria-haspopup="true" aria-expanded={open}
        aria-label={`Filter by ${label}`}
        title={selected.length ? selected.join(', ') : `Filter by ${label}`}
        className={md ? 'hover:bg-gray-50 transition-colors' : undefined}
        style={{
          ...filterInputStyle, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: md ? 6 : 4,
          ...(md ? { height: 36, padding: '0 10px', fontSize: '0.75rem', borderRadius: 8, minWidth: 170, maxWidth: 260 } : {}),
          borderColor: selected.length ? 'var(--teal)' : 'var(--light-gray)',
          background: selected.length ? 'var(--pale-teal)' : '#fff',
          color: selected.length ? 'var(--teal)' : 'var(--charcoal)',
          fontWeight: selected.length || md ? 600 : 400,
        }}>
        {icon && <span className="flex-shrink-0" style={{ color: selected.length ? 'var(--teal)' : 'var(--mid-gray)', lineHeight: 0 }}>{icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {md ? (selected.length ? `${label}: ${summary}` : `All ${label.toLowerCase()}`) : summary}
        </span>
        {selected.length > 1 && (
          <span className="px-1.5 rounded-full text-[10px] font-bold leading-[16px]"
            style={{ background: 'var(--teal)', color: '#fff' }}>{selected.length}</span>
        )}
        <ChevronDown size={md ? 13 : 11} style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
      </button>

      {open && at && (
        <div role="listbox" aria-multiselectable="true" aria-label={label} style={{
          position: 'fixed', top: at.top, left: at.left, zIndex: 60,
          minWidth: at.width, maxWidth: 340, maxHeight: 300, overflowY: 'auto',
          ...POPOVER_STYLE, borderRadius: 12, padding: 6,
          textTransform: 'none', letterSpacing: 'normal', textAlign: 'left',
        }}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2 mb-1"
            style={{ borderBottom: ROW_RULE }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              {label}{selected.length > 0 && <span style={{ color: 'var(--teal)' }}> · {selected.length} on</span>}
            </span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="text-[11px] font-semibold underline" style={{ color: 'var(--mid-gray)' }}>
                Clear
              </button>
            )}
          </div>
          {options.length === 0 ? (
            <p className="px-2 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
              Nothing to filter by yet.
            </p>
          ) : options.map(o => {
            const on = selected.includes(o)
            return (
              <label key={o} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors ${on ? '' : 'hover:bg-gray-50'}`}
                style={{ cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1.35,
                         background: on ? 'var(--pale-teal)' : undefined, fontWeight: on ? 600 : 400 }}>
                <input type="checkbox" checked={on}
                  onChange={() => onChange(on ? selected.filter(s => s !== o) : [...selected, o])}
                  style={{ marginTop: 2, accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ color: on ? 'var(--teal)' : 'var(--charcoal)' }}>{o}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterRow({ cols, rows, filters, setFilter }: {
  cols: SortCol[]; rows: any[]
  filters: Record<string, FilterVal>; setFilter: (k: string, p: FilterVal) => void
}) {
  // Same reason as SortHeaders: the fill and rule live on the cells so the
  // sticky header stays opaque over the rows scrolling beneath it.
  const cell: CSSProperties = { fontWeight: 400, background: '#fff', boxShadow: 'inset 0 -1px 0 var(--light-gray)' }
  return (
    <tr>
      {cols.map(c => {
        if (!c.get || !c.filter) return <th key={c.key} className="px-4 py-2" style={cell} />
        const f = filters[c.key] ?? {}
        return (
          <th key={c.key} className="px-4 py-2" style={cell}>
            {c.filter === 'multi' ? (
              <MultiFilter
                label={c.label}
                // Options come from the rows the tab passes in — post-search
                // but pre-column-filter — for the same reason as the select
                // above: ticking one service must not make the others vanish
                // from the list you are ticking them in.
                options={Array.from(new Set(
                  rows.flatMap(r => (c.values ? c.values(r) : [])),
                )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))}
                selected={f.set ?? []}
                onChange={next => setFilter(c.key, { set: next })}
              />
            ) : c.filter === 'number' ? (
              <div className="flex items-center gap-1">
                <input type="number" placeholder="min" value={f.min ?? ''} aria-label={`${c.label} minimum`}
                  onChange={e => setFilter(c.key, { min: e.target.value })} style={filterInputStyle} />
                <span style={{ color: 'var(--light-gray)', fontSize: '0.7rem' }}>&ndash;</span>
                <input type="number" placeholder="max" value={f.max ?? ''} aria-label={`${c.label} maximum`}
                  onChange={e => setFilter(c.key, { max: e.target.value })} style={filterInputStyle} />
              </div>
            ) : c.filter === 'select' ? (
              <select value={f.text ?? ''} aria-label={`Filter by ${c.label}`}
                onChange={e => setFilter(c.key, { text: e.target.value })} style={filterInputStyle}>
                {/* Options come from the rows the tab passes in — post-search but
                    pre-column-filter — so picking one value doesn't make every
                    other option vanish from the list. */}
                <option value="">All</option>
                {Array.from(new Set(rows.map(r => String(c.get!(r) ?? '')).filter(Boolean)))
                  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                  .map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type="text" placeholder="Filter&hellip;" value={f.text ?? ''} aria-label={`Filter by ${c.label}`}
                onChange={e => setFilter(c.key, { text: e.target.value })} style={filterInputStyle} />
            )}
          </th>
        )
      })}
    </tr>
  )
}

// Toggle + active count + reset, sat next to each tab's search box.
function FilterToggle({ open, onToggle, activeCount, onClear }: {
  open: boolean; onToggle: () => void; activeCount: number; onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggle} className={BTN_SECONDARY}
        title={open ? 'Hide column filters' : 'Filter by column'} aria-pressed={open}
        style={{
          ...CONTROL_STYLE,
          background: activeCount ? 'var(--teal)' : open ? 'var(--pale-teal)' : '#fff',
          color: activeCount ? '#fff' : open ? 'var(--teal)' : 'var(--charcoal)',
          borderColor: activeCount || open ? 'var(--teal)' : 'var(--light-gray)',
        }}>
        <Filter size={13} />
        Filters
        {activeCount > 0 && (
          <span className="px-1.5 rounded-full text-[10px] font-bold leading-[16px]" style={{ background: 'rgba(255,255,255,0.25)' }}>
            {activeCount}
          </span>
        )}
        <ChevronDown size={12} style={{ opacity: 0.7, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
      </button>
      {activeCount > 0 && (
        <button onClick={onClear} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          title="Clear every column filter" style={{ color: 'var(--mid-gray)' }}>
          <RotateCcw size={11} /> Reset
        </button>
      )}
    </div>
  )
}

/** Wrapper for the table itself: card frame, own scroll, sticky header. */
function TableCard({ children, footer, dim = false }: { children: ReactNode; footer?: ReactNode; dim?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden flex flex-col min-w-0" style={CARD_STYLE}>
      {/* The inner box scrolls (overflow-auto); the outer one only rounds the
          corners. These tables are wider than a phone, and an overflow-hidden
          scroller clipped Branch and Date out of reach instead of letting them
          be scrolled to. The Services filter panel is positioned fixed so this
          scroll container cannot clip it either. */}
      {/* While a reload is in flight the old rows stay (dimmed) but take no
          clicks — the old full-tab spinner made them unclickable too. */}
      <div className={`overflow-auto transition-opacity ${dim ? 'opacity-60' : ''}`} style={TABLE_SCROLL} aria-busy={dim || undefined}>
        <div className={dim ? 'pointer-events-none' : undefined}>{children}</div>
      </div>
      {footer}
    </div>
  )
}

/** Sticky table head — both the sort row and the (optional) filter row stay put while rows scroll. */
const THEAD_STYLE: CSSProperties = { position: 'sticky', top: 0, zIndex: 2 }

function WaitlistTab({ branch }: { branch: string }) {
  const [formKey, setFormKey] = useState('all')
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  // Filter row starts hidden: most visits to this tab are a quick look, and a
  // row of empty inputs above every table would be permanent clutter.
  const [showFilters, setShowFilters] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [converting, setConverting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [patientNames, setPatientNames] = useState<Set<string>>(new Set())
  // Remarks prompt for the "Will no longer avail" tag. One modal serves both
  // the first tagging and later edits — it opens pre-filled with whatever is
  // already there, so correcting a note is the same gesture as writing one.
  const [tagging, setTagging] = useState<any | null>(null)
  const [tagRemarks, setTagRemarks] = useState('')
  const [tagSaving, setTagSaving] = useState(false)
  const [tagError, setTagError] = useState('')
  // Display only: why the list is empty when it came back empty for a reason
  // (the API's _warning when HR is unreachable, or a failed request), so an
  // outage doesn't read as a convincing "no responses".
  const [loadError, setLoadError] = useState('')

  // Fetch existing patients to check if already converted
  useEffect(() => {
    fetch('/api/patients?limit=10000').then(r => r.json()).then(d => {
      const names = new Set<string>()
      for (const p of (d.patients || [])) {
        const n = `${p.firstName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim().toLowerCase()
        if (n) names.add(n)
      }
      setPatientNames(names)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true); setExpanded(null); setPage(1); setLoadError('')
    const params = new URLSearchParams({ tab: 'waitlist', formKey })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setResponses(d.responses || []); setLoadError(d?._warning || d?.error || ''); setLoading(false) })
      .catch(() => { setLoadError('Could not load the waitlist.'); setLoading(false) })
  }, [branch, formKey])

  function isConverted(item: any): boolean {
    const name = getName(item).toLowerCase().trim()
    return name !== 'unknown' && patientNames.has(name)
  }

  async function deleteResponse(item: any) {
    if (!confirm('Are you sure you want to remove this waitlist entry?')) return
    setDeleting(item.landing_id)
    try {
      const res = await fetch(`/api/patient-relationship?tab=waitlist-delete&formId=${item._formId}&submissionId=${item.landing_id}`, { method: 'DELETE' })
      if (res.ok) {
        setResponses(prev => prev.filter(r => r.landing_id !== item.landing_id))
      } else {
        alert('Failed to delete')
      }
    } catch { alert('Failed to delete') }
    finally { setDeleting(null) }
  }

  function openTagModal(item: any) {
    setTagging(item)
    setTagRemarks(item._followUp?.remarks || '')
    setTagError('')
  }

  async function saveTag() {
    if (!tagging) return
    const remarks = tagRemarks.trim()
    // Checked here as well as server-side so the front desk gets the message
    // without a round trip.
    if (!remarks) { setTagError('Please add a remark explaining why.'); return }
    setTagSaving(true); setTagError('')
    try {
      const res = await fetch('/api/patient-relationship?tab=waitlist-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: tagging._formId,
          submissionId: tagging.landing_id,
          status: 'WILL_NOT_AVAIL',
          remarks,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setTagError(d?.error || 'Could not save that.'); return }
      setResponses(prev => prev.map(r =>
        r.landing_id === tagging.landing_id ? { ...r, _followUp: d.followUp } : r))
      setTagging(null)
    } catch {
      setTagError('Could not save that.')
    } finally {
      setTagSaving(false)
    }
  }

  // Lifting the tag, for when someone who said they would not avail enrols
  // after all. The entry goes back to reading as untouched.
  async function clearTag(item: any) {
    if (!confirm('Remove the "Will no longer avail" tag from this entry?')) return
    const qs = `formId=${encodeURIComponent(item._formId)}&submissionId=${encodeURIComponent(item.landing_id)}`
    try {
      const res = await fetch(`/api/patient-relationship?tab=waitlist-followup&${qs}`, { method: 'DELETE' })
      if (!res.ok) { alert('Could not remove the tag.'); return }
      setResponses(prev => prev.map(r =>
        r.landing_id === item.landing_id ? { ...r, _followUp: undefined } : r))
    } catch { alert('Could not remove the tag.') }
  }

  // Extract name from response answers
  // HR forms store answers with field as object {id, ref, type} and contact info as {contact: {first_name, last_name}}
  function getFieldTitle(item: any, answer: any): string {
    const fields = item.fields || []
    const match = fields.find((f: any) => f.id === answer?.field?.id)
    return match?.title || ''
  }
  function getFieldTitleLower(item: any, answer: any): string {
    return getFieldTitle(item, answer).toLowerCase()
  }

  function getName(item: any) {
    if (!item.answers) return 'Unknown'
    // Try to find the patient name contact field
    for (const a of item.answers) {
      const title = getFieldTitleLower(item, a)
      if ((title.includes('name') && title.includes('patient')) || title.includes('name of')) {
        if (a.contact) return `${a.contact.first_name || ''} ${a.contact.last_name || ''}`.replace(/\s+/g, ' ').trim()
        if (a.text) return a.text
      }
    }
    // Fallback: first contact_info field
    const contactAnswer = item.answers.find((a: any) => a.field?.type === 'contact_info' || a.contact)
    if (contactAnswer?.contact) return `${contactAnswer.contact.first_name || ''} ${contactAnswer.contact.last_name || ''}`.replace(/\s+/g, ' ').trim()
    if (contactAnswer?.text) return contactAnswer.text
    return 'Unknown'
  }

  // Services the patient ticked on their intake form. The API resolves the
  // service question per form and stamps the labels on, so there is nothing to
  // parse here — but an older API, or a form with no service question, sends
  // nothing, and the column has to read as "none recorded" rather than break.
  function getServices(item: any): string[] {
    return Array.isArray(item?._services) ? item._services : []
  }

  const filtered = search
    ? responses.filter(r => getName(r).toLowerCase().includes(search.toLowerCase()))
    : responses

  const COLS: SortCol[] = [
    { key: 'expand', label: '' },                                   // chevron
    { key: 'name',   label: 'Name', get: r => getName(r), filter: 'text' },
    { key: 'form',   label: 'Form', get: r => r._formTitle ?? '', filter: 'select' },
    // What the patient actually asked for. Stamped per response by the API
    // (see _services there) because the service question has a different field
    // id on every form and the answers carry ids, not titles.
    //
    // Sorts on the joined string so a row asking for one service still orders
    // sensibly; filters on the list, because a row with two services belongs
    // under both.
    { key: 'services', label: 'Services', filter: 'multi',
      get:    r => getServices(r).join(', '),
      values: r => getServices(r) },
    // Which branch's form this came in on. The API already stamps every
    // response with _branch from the HR form it was pulled from, so this is
    // the submission's own origin, not the branch filter currently applied —
    // it stays correct when the filter is set to all branches.
    //
    // Sorted and filtered on the LABEL rather than the code so the select reads
    // "East Branch", and so ordering matches what is on screen.
    { key: 'branch', label: 'Branch', get: r => sharedBranchLabel(r._branch) || r._branch || '', filter: 'select' },
    // Raw ISO timestamp, not the formatted cell — "Mar" vs "Apr" would sort alphabetically.
    { key: 'date',   label: 'Date', get: r => r.submitted_at ?? '', filter: 'text' },
  ]
  const { filtered: colFiltered, filters, setFilter, clearAll, activeCount } = useFilters(COLS, filtered, () => setPage(1))
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, colFiltered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  async function convertToPatient(item: any) {
    setConverting(item.landing_id)
    try {
      const answers = item.answers || []
      const findByTitle = (keywords: string[]) => {
        for (const a of answers) {
          const title = getFieldTitleLower(item, a)
          if (keywords.some(k => title.includes(k))) return a
        }
        return null
      }

      // Name extraction: prefer a structured contact_info answer; fall back to
      // splitting the same display name that getName() already extracts correctly.
      let firstName = '', lastName = '', email = '', phone = ''
      const contactField = answers.find((a: any) => a.contact?.first_name || a.contact?.last_name)
      if (contactField?.contact) {
        firstName = contactField.contact.first_name  || ''
        lastName  = contactField.contact.last_name   || ''
        email     = contactField.contact.email        || ''
        phone     = contactField.contact.phone_number || ''
      } else {
        // Text-type name field — reuse getName() which already handles all form layouts.
        const fullName = getName(item)
        if (fullName && fullName !== 'Unknown') {
          const parts = fullName.trim().split(/\s+/).filter(Boolean)
          firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '')
          lastName  = parts.length > 1 ? parts[parts.length - 1] : ''
        }
        // Look for email and phone in separate text answers
        for (const a of answers) {
          const t = getFieldTitleLower(item, a)
          if (!email && (a.email || t.includes('email'))) email = a.email || a.text || ''
          if (!phone && (a.phone_number || t.includes('phone') || t.includes('mobile'))) phone = a.phone_number || a.text || ''
        }
      }

      // Try birthday field
      const dobAnswer = findByTitle(['birthday', 'birth', 'dob'])
      const dob = dobAnswer?.text || ''

      // Try diagnosis
      const diagAnswer = findByTitle(['diagnosis'])
      const diagnosis = diagAnswer?.text || ''

      const patientData: any = {
        firstName, lastName, email, phone,
        patientType: 'PEDIATRIC',
        branches: branch ? [branch] : (item._branch === 'SBEA' ? ['SANDBOX_EAST'] : item._branch === 'SBGH' ? ['SANDBOX_GREENHILLS'] : []),
      }
      if (dob) patientData.dob = dob
      if (diagnosis) patientData.diagnosis = diagnosis

      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData),
      })
      if (res.ok) {
        // Delete the HR form response so it won't reappear on next reload
        fetch(`/api/patient-relationship?tab=waitlist-delete&formId=${item._formId}&submissionId=${item.landing_id}`, { method: 'DELETE' }).catch(() => {})
        // Mark as converted in local state: add name to patientNames so isConverted()
        // returns true and the row turns green — do NOT remove from responses list.
        const convertedName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim().toLowerCase()
        if (convertedName) setPatientNames(prev => new Set([...prev, convertedName]))
        alert('Patient converted successfully! They are now in the Patient CRM.')
      } else {
        const d = await res.json()
        alert(d.error || 'Failed to convert')
      }
    } catch (e) {
      alert('Failed to convert patient')
    } finally {
      setConverting(null)
    }
  }

  // KPI strip — counted off the list already loaded for the chosen form and
  // branch; nothing extra is fetched for it.
  const declinedCount = responses.filter(r => !!r._followUp).length
  const convertedCount = responses.filter(r => isConverted(r)).length
  const openCount = responses.filter(r => !r._followUp && !isConverted(r)).length
  const servicesOptions = Array.from(new Set(filtered.flatMap(r => getServices(r))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  // This list only reloads when the form or branch changes, so a load always
  // means the rows on screen are for the old selection — skeleton, not dim.
  const firstLoad = loading

  return (
    <div className="space-y-4">
      {/* Sub-tabs for form types. Held while a form is loading — the old
          full-tab spinner hid them, which is what stopped a second click from
          racing the first request. */}
      <Segmented label="Intake form" items={WAITLIST_FORMS} value={formKey} onChange={setFormKey} disabled={loading} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="On the waitlist" value={firstLoad ? '—' : responses.length.toLocaleString()}
          sub={formKey === 'all' ? 'All intake forms' : WAITLIST_FORMS.find(f => f.key === formKey)?.label} icon={<Inbox size={15} />} />
        <KpiCard label="Not yet actioned" value={firstLoad ? '—' : openCount.toLocaleString()}
          sub="Not converted or tagged" accent="#D97706" icon={<Clock size={15} />} />
        <KpiCard label="Converted" value={firstLoad ? '—' : convertedCount.toLocaleString()}
          sub="Already in the Patient CRM" accent="#15803D" icon={<UserCheck size={15} />} />
        <KpiCard label="Will no longer avail" value={firstLoad ? '—' : declinedCount.toLocaleString()}
          sub="Tagged with a remark" accent="#B91C1C" icon={<UserX size={15} />} />
      </div>

      {loadError && <LoadError message={loadError} />}

      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(1) }} />
        {/* Same filter as the Services column's — one state, two handles —
            so it can be set without opening the column filter row. */}
        <MultiFilter size="md" icon={<Filter size={13} />} label="Services" options={servicesOptions}
          selected={filters.services?.set ?? []} onChange={next => setFilter('services', { set: next })} />
        <FilterToggle open={showFilters} onToggle={() => setShowFilters(v => !v)} activeCount={activeCount} onClear={clearAll} />
        <ResultCount shown={sorted.length} total={responses.length} noun={responses.length === 1 ? 'response' : 'responses'} loading={loading} />
      </div>

      <TableCard
        footer={<Pagination total={sorted.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />}>
        <table className="w-full text-left min-w-[860px]" style={{ fontSize: '0.82rem' }}>
          <thead style={THEAD_STYLE}>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            {showFilters && <FilterRow cols={COLS} rows={filtered} filters={filters} setFilter={setFilter} />}
          </thead>
          <tbody>
            {/* colSpan is COLS.length rather than a literal below — the count has
                to follow the column list, and a stale one leaves the empty-state
                cell short and the table visibly ragged. */}
            {firstLoad ? <SkeletonRows cols={COLS.length} /> : paginated.length === 0 ? (
              <tr><td colSpan={COLS.length}>
                {activeCount > 0
                  ? <EmptyState title="No responses match these filters." hint="Loosen a column filter, or reset them all." />
                  : <EmptyState title="No responses found." hint={search ? 'Nothing on this list matches that name.' : 'New intake form submissions will appear here.'} />}
              </td></tr>
            ) : paginated.map((item: any) => {
              const converted = isConverted(item)
              const declined = !!item._followUp
              const isOpen = expanded === item.landing_id
              return (
              <Fragment key={item.landing_id}>
                {/* Declined wins the row colour over converted: if both are
                    somehow true the contradiction is the thing worth seeing. */}
                <tr className={`align-middle transition-colors ${declined || converted ? '' : 'hover:bg-[#F8FAF9]'}`}
                  style={{ borderBottom: ROW_RULE, cursor: 'pointer', background: declined ? '#FEF6F6' : converted ? '#F3FBF5' : isOpen ? SUBTLE_BG : undefined,
                           boxShadow: declined ? 'inset 3px 0 0 #F87171' : converted ? 'inset 3px 0 0 #4ADE80' : undefined }}
                  onClick={() => setExpanded(expanded === item.landing_id ? null : item.landing_id)}
                  aria-expanded={isOpen}>
                  <td className="pl-4 pr-1 py-3" style={{ width: 32, color: 'var(--mid-gray)' }}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td className="px-4 py-3" style={{ minWidth: 200 }}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold" style={{ color: declined ? '#B91C1C' : converted ? '#15803D' : 'var(--charcoal)' }}>
                        {getName(item)}
                      </span>
                      {converted && <Badge bg="#DCFCE7" fg="#15803D"><Check size={10} />Converted</Badge>}
                      {/* The remark rides in the tooltip so the list stays
                          scannable while the reason is still one hover away. */}
                      {declined && (
                        <Badge bg="#FEE2E2" fg="#B91C1C"
                          title={`${item._followUp.remarks}${item._followUp.setByName ? ` — ${item._followUp.setByName}` : ''}`}>
                          <Ban size={10} />Will no longer avail
                        </Badge>
                      )}
                    </div>
                    {/* …and a one-line preview of it under the name, clipped
                        so the row height stays put. */}
                    {declined && item._followUp.remarks && (
                      <p className="text-[11px] mt-0.5 truncate max-w-[320px]" style={{ color: '#9F1239' }}
                        title={item._followUp.remarks}>
                        “{item._followUp.remarks}”
                      </p>
                    )}
                  </td>
                  {/* Which intake this came in through. A chip rather than
                      plain text because in the merged list this is the column
                      that tells two otherwise identical rows apart. */}
                  <td className="px-4 py-3">
                    {(() => {
                      const chip = FORM_CHIP[item._formKey as string]
                      if (!chip) return <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{item._formTitle}</span>
                      return <Badge bg={chip.bg} fg={chip.fg} title={item._formTitle}>{chip.label}</Badge>
                    })()}
                  </td>
                  {/* What they asked for. Chips rather than a sentence so the
                      two-and-three-service rows stay as scannable as the rest. */}
                  <td className="px-4 py-3">
                    {(() => {
                      const svcs = getServices(item)
                      if (svcs.length === 0) return <span style={{ color: '#9CA3AF' }}>&mdash;</span>
                      // Two fit the column; beyond that the count carries it and
                      // the full list is on the row's title. Showing all of them
                      // would set the row height off the longest submission.
                      const shown = svcs.slice(0, 2)
                      const rest  = svcs.length - shown.length
                      return (
                        <span className="flex flex-wrap items-center gap-1" title={svcs.join('\n')}>
                          {shown.map(s => {
                            const c = serviceChip(s)
                            return <Badge key={s} bg={c.bg} fg={c.fg}>{shortService(s)}</Badge>
                          })}
                          {rest > 0 && <Badge bg="#F1F5F9" fg="#64748B">+{rest}</Badge>}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {item._branch ? (
                      <Badge bg={item._branch === 'SBEA' ? '#E6F2F4' : '#FEF3E2'} fg={item._branch === 'SBEA' ? '#12606C' : '#92400E'}>
                        {sharedBranchLabel(item._branch) || item._branch}
                      </Badge>
                    ) : <span style={{ color: '#9CA3AF' }}>&mdash;</span>}
                  </td>
                  {/* Flex lives on an inner div: display:flex on the <td>
                      itself takes it out of the table layout and the cell stops
                      matching its row's height. */}
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDay(item.submitted_at)}</span>
                      <OutreachBtns item={item}
                        onSent={(channel, state) => setResponses(prev => prev.map(r =>
                          r.landing_id === item.landing_id
                            ? { ...r, _outreach: { ...(r._outreach ?? { EMAIL: null, SMS: null }), [channel]: state } }
                            : r))} />
                      <button onClick={(e) => { e.stopPropagation(); deleteResponse(item) }} disabled={deleting === item.landing_id}
                        className={`ml-auto ${ICON_BTN}`} title="Remove from waitlist" aria-label="Remove from waitlist"
                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                        {deleting === item.landing_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded === item.landing_id && (
                  <tr key={item.landing_id + '-detail'}>
                    <td colSpan={COLS.length} className="px-5 sm:pl-12 py-4" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                      <div className="space-y-3 max-w-4xl">
                        <OutreachHistory item={item} />
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>Form Responses</p>
                        <dl className="rounded-xl divide-y" style={{ ...CARD_STYLE, borderColor: 'var(--light-gray)' }}>
                        {(item.answers || []).map((a: any, i: number) => {
                          const title = getFieldTitle(item, a) || `Question ${i + 1}`
                          let value = a.text || ''
                          if (a.contact) value = `${a.contact.first_name || ''} ${a.contact.last_name || ''} ${a.contact.phone_number ? '| ' + a.contact.phone_number : ''} ${a.contact.email ? '| ' + a.contact.email : ''}`.trim()
                          // Drop empty entries before joining: a choice with no
                          // label came through as the literal string
                          // "undefined" on screen (Question 1 on several
                          // registration submissions), which reads like a real
                          // answer rather than a missing one. Filtering leaves
                          // value empty, so the em-dash below shows instead.
                          if (a.choices?.labels) value = a.choices.labels.filter(Boolean).join(', ')
                          if (a.choice?.label) value = a.choice.label
                          return (
                            <div key={i} className="grid sm:grid-cols-[220px_1fr] gap-x-4 gap-y-0.5 px-3.5 py-2 text-xs" style={{ borderColor: '#EEF2F1' }}>
                              <dt style={{ color: 'var(--mid-gray)', fontWeight: 600 }}>{title}</dt>
                              <dd className="break-words" style={{ color: value ? 'var(--charcoal)' : '#9CA3AF' }}>{value || '\u2014'}</dd>
                            </div>
                          )
                        })}
                        </dl>
                        {/* What front desk actually needs off this panel: has
                            anyone chased this entry, what came of it, and who
                            to ask about it. */}
                        {declined && (
                          <div className="p-3.5 rounded-xl flex items-start gap-2.5" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                            <Ban size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#B91C1C' }}>
                                Will no longer avail
                              </p>
                              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: '#7F1D1D', whiteSpace: 'pre-wrap' }}>
                                {item._followUp.remarks}
                              </p>
                              <p className="text-[11px] mt-1.5" style={{ color: '#9F6B6B' }}>
                                {item._followUp.setByName ? `Tagged by ${item._followUp.setByName}` : 'Tagged'}
                                {item._followUp.updatedAt
                                  ? ` · ${new Date(item._followUp.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="pt-1 flex gap-2 flex-wrap items-center">
                          {!converted && (
                            <button onClick={() => convertToPatient(item)} disabled={converting === item.landing_id}
                              className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
                              {converting === item.landing_id ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                              Convert to Patient
                            </button>
                          )}
                          {!declined && (
                            <button onClick={() => openTagModal(item)}
                              className={BTN_SECONDARY} style={{ ...CONTROL_STYLE, color: '#B91C1C', borderColor: '#FECACA' }}>
                              <XCircle size={13} />
                              Will no longer avail
                            </button>
                          )}
                          {declined && (
                            <>
                              <button onClick={() => openTagModal(item)}
                                className={BTN_SECONDARY} style={{ ...CONTROL_STYLE, color: '#B91C1C', borderColor: '#FECACA' }}>
                                <MessageSquare size={13} />
                                Edit remarks
                              </button>
                              <button onClick={() => clearTag(item)}
                                className={BTN_SECONDARY} style={CONTROL_STYLE}>
                                <Check size={13} />
                                Remove tag
                              </button>
                            </>
                          )}
                          <button onClick={() => deleteResponse(item)} disabled={deleting === item.landing_id}
                            className={`${BTN_SECONDARY} sm:ml-auto`} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                            {deleting === item.landing_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            Remove from Waitlist
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableCard>

      {/* Remarks prompt. A textarea rather than window.prompt(): these notes
          run to a sentence or two about what the family said, and a native
          prompt gives a single unreadable line with no room to correct it. */}
      {tagging && (
        <ModalShell
          zIndex={50}
          tone="danger"
          icon={<UserX size={16} />}
          title="Will no longer avail"
          subtitle={<>Marking <strong style={{ color: 'var(--charcoal)' }}>{getName(tagging)}</strong>. Add what they said, so whoever
            picks this up next knows it has been followed up.</>}
          onBackdrop={() => !tagSaving && setTagging(null)}
          onClose={() => !tagSaving && setTagging(null)}
          footer={<>
            <button onClick={() => setTagging(null)} disabled={tagSaving}
              className={BTN_SECONDARY} style={CONTROL_STYLE}>
              Cancel
            </button>
            <button onClick={saveTag} disabled={tagSaving}
              className={BTN_PRIMARY} style={{ background: '#B91C1C' }}>
              {tagSaving ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              Save
            </button>
          </>}>
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="wl-tag-remarks">Remarks</label>
          <textarea
            id="wl-tag-remarks"
            value={tagRemarks}
            onChange={e => { setTagRemarks(e.target.value); if (tagError) setTagError('') }}
            rows={4}
            autoFocus
            placeholder="e.g. Called 10/30 — enrolled closer to home, not pushing through."
            className="focus:border-[var(--teal)]"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              border: `1px solid ${tagError ? '#DC2626' : 'var(--light-gray)'}`,
              color: 'var(--charcoal)', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          {tagError && (
            <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: '#B91C1C' }} role="alert">
              <AlertTriangle size={12} /> {tagError}
            </p>
          )}
        </ModalShell>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FOLLOW UP TAB
// ══════════════════════════════════════════════════════════════════════════════

const DEPT_TABS = [
  { key: 'PT', label: 'PT' },
  { key: 'OT', label: 'OT' },
  { key: 'SLP', label: 'SLP' },
  { key: 'SPED', label: 'SPED' },
  { key: 'PSYCHOLOGY', label: 'Psych' },
  { key: 'MD', label: 'MD' },
]

const DEPT_NOTES: Record<string, string> = {
  PSYCHOLOGY: 'Psychology: 3 months of no consult',
  PT: 'PT: Should consult with MD after 2 months',
  OT: 'OT: Reconsult with Developmental Pediatrician after 6 months',
  SLP: 'SLP: Reconsult with Developmental Pediatrician after 6 months',
  SPED: 'SPED: Reconsult with Developmental Pediatrician after 6 months',
  MD: 'MD: Follow up as needed',
}

const statusConfig: Record<string, { bg: string; color: string; border: string; label: string; icon: any }> = {
  due:     { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Due Now',  icon: AlertTriangle },
  overdue: { bg: '#FEF2F2', color: '#991B1B', border: '#FCA5A5', label: 'Overdue',  icon: AlertTriangle },
  upcoming:{ bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Upcoming', icon: Clock },
  ok:      { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'On Track', icon: CheckCircle },
}

function FollowUpTab({ branch }: { branch: string }) {
  const [dept, setDept] = useState('PT')
  const [patients, setPatients] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  // Filter row starts hidden: most visits to this tab are a quick look, and a
  // row of empty inputs above every table would be permanent clutter.
  const [showFilters, setShowFilters] = useState(false)
  // Display only — see WaitlistTab.
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    setLoading(true); setPage(1); setLoadError('')
    const params = new URLSearchParams({ tab: 'followup', dept })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setPatients(d.patients || []); setSummary(d.summary); setLoadError(d?.error || ''); setLoading(false) })
      .catch(() => { setLoadError('Could not load follow-ups.'); setLoading(false) })
  }, [branch, dept])

  const filtered = search
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : patients

  const COLS: SortCol[] = [
    { key: 'patient',   label: 'Patient',       get: p => `${p.lastName} ${p.firstName}`, filter: 'text' },
    { key: 'clinician', label: 'Clinician',     get: p => p.clinicianName ?? '', filter: 'select' },
    // Sort the raw date, not the "Mar 3, 2026" the cell prints — the formatted
    // string would sort alphabetically by month name.
    { key: 'first',     label: 'First Session', get: p => p.firstSessionDate ?? '', filter: 'text' },
    { key: 'reference', label: 'Reference',     get: p => p.referenceSource ?? '', filter: 'select' },
    // Numeric so 9 sorts before 10 rather than after it.
    { key: 'days',      label: 'Days',          get: p => (p.daysSince ?? null) === null ? null : Number(p.daysSince), filter: 'number' },
    // Sort by the label shown in the pill, so the order matches what is on screen.
    { key: 'status',    label: 'Status',        get: p => (statusConfig[p.status] || statusConfig.ok).label, filter: 'select' },
    { key: 'contact',   label: 'Contact' },                          // buttons
  ]
  const { filtered: colFiltered, filters, setFilter, clearAll, activeCount } = useFilters(COLS, filtered, () => setPage(1))
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, colFiltered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  // Already counted by the API (summary) and already on the rows (reminderSentAt).
  const sentCount = patients.filter((p: any) => !!p.reminderSentAt).length

  return (
    <div className="space-y-4">
      {/* Dept sub-tabs */}
      <Segmented label="Department" items={DEPT_TABS} value={dept} onChange={setDept} />

      {/* Reminder note */}
      <Callout tone="info" icon={<Calendar size={14} />}>
        <span className="font-medium">{DEPT_NOTES[dept] || ''}</span>
      </Callout>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Due', value: summary?.due, color: '#DC2626', icon: <AlertTriangle size={15} />, sub: 'Due now' },
          { label: 'Overdue', value: summary?.overdue, color: '#991B1B', icon: <AlertTriangle size={15} />, sub: 'Past the interval' },
          { label: 'Upcoming', value: summary?.upcoming, color: '#D97706', icon: <Clock size={15} />, sub: 'Coming up' },
          { label: 'On Track', value: summary?.ok, color: '#15803D', icon: <CheckCircle size={15} />, sub: 'Nothing needed yet' },
        ].map(c => (
          <KpiCard key={c.label} label={c.label} accent={c.color} icon={c.icon} sub={c.sub}
            value={loading || !summary ? '—' : <span style={{ color: c.value ? c.color : 'var(--charcoal)' }}>{Number(c.value ?? 0).toLocaleString()}</span>} />
        ))}
        <KpiCard label="SMS sent" accent="var(--teal)" icon={<Send size={15} />} sub={`of ${patients.length.toLocaleString()} in ${DEPT_TABS.find(d => d.key === dept)?.label ?? dept}`}
          value={loading ? '—' : sentCount.toLocaleString()} />
      </div>

      {loadError && <LoadError message={loadError} />}

      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(1) }} />
        <FilterToggle open={showFilters} onToggle={() => setShowFilters(v => !v)} activeCount={activeCount} onClear={clearAll} />
        <ResultCount shown={sorted.length} total={patients.length} noun={patients.length === 1 ? 'patient' : 'patients'} loading={loading} />
      </div>

      <TableCard
        footer={<Pagination total={sorted.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />}>
        <table className="w-full text-left min-w-[820px]" style={{ fontSize: '0.82rem' }}>
          <thead style={THEAD_STYLE}>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            {showFilters && <FilterRow cols={COLS} rows={filtered} filters={filters} setFilter={setFilter} />}
          </thead>
          <tbody>
            {loading ? <SkeletonRows cols={COLS.length} /> : paginated.length === 0 ? (
              <tr><td colSpan={COLS.length}>
                {activeCount > 0
                  ? <EmptyState title="No patients match these filters." hint="Loosen a column filter, or reset them all." />
                  : <EmptyState title="No patients in this department." hint={search ? 'Nothing here matches that name.' : 'Patients appear here once they are due a follow-up check.'} />}
              </td></tr>
            ) : paginated.map((p: any) => {
              const sc = statusConfig[p.status] || statusConfig.ok
              const Icon = sc.icon
              return (
                <tr key={p.id} className="align-middle hover:bg-[#F8FAF9] transition-colors" style={{ borderBottom: ROW_RULE }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{p.lastName}, {p.firstName}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{p.clinicianName || <span style={{ color: '#9CA3AF' }}>&mdash;</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{fmtDay(p.firstSessionDate)}</td>
                  <td className="px-4 py-3">
                    <Badge bg={p.referenceSource === 'consult' ? '#EFF6FF' : '#F0FDF4'} fg={p.referenceSource === 'consult' ? '#1D4ED8' : '#15803D'}>
                      {p.referenceSource === 'consult' ? 'Dr. Consult' : '1st Session'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.daysSince}<span className="text-[11px] font-normal ml-0.5" style={{ color: 'var(--mid-gray)' }}>d</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge bg={sc.bg} fg={sc.color}><Icon size={11} />{sc.label}</Badge>
                  </td>
                  <td className="px-4 py-3"><FollowUpContactBtns patient={p} department={dept} onSent={(sentAt) => setPatients(prev => prev.map(x => x.id === p.id ? { ...x, reminderSentAt: sentAt } : x))} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// NO SHOW TAB
// ══════════════════════════════════════════════════════════════════════════════

const MAX_NOSHOWS = 3

function NoShowTab({ branch }: { branch: string }) {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  // Filter row starts hidden: most visits to this tab are a quick look, and a
  // row of empty inputs above every table would be permanent clutter.
  const [showFilters, setShowFilters] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logForm, setLogForm] = useState<{ patientId: string; remarks: string } | null>(null)
  const [logSaving, setLogSaving] = useState(false)
  const [deleting, setDeleting] = useState<{ logId: string; reason: string } | null>(null)
  // Display only — see WaitlistTab.
  const [loadError, setLoadError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true); setLoadError('')
    const params = new URLSearchParams({ tab: 'noshow' })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setPatients(d.patients || []); setLoadError(d?.error || ''); setLoading(false) })
      .catch(() => { setLoadError('Could not load no-shows.'); setLoading(false) })
  }, [branch])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = search
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : patients

  const COLS: SortCol[] = [
    { key: 'expand',  label: '' },                                  // chevron
    { key: 'patient', label: 'Patient',   get: p => `${p.lastName} ${p.firstName}`, filter: 'text' },
    { key: 'branch',  label: 'Branch',    get: p => branchLabel(p.branch) ?? '', filter: 'select' },
    // The whole reason to sort this tab: who is closest to the no-show limit.
    { key: 'count',   label: 'No-Shows',  get: p => Number(p.noShowCount ?? 0), filter: 'number' },
  ]
  const { filtered: colFiltered, filters, setFilter, clearAll, activeCount } = useFilters(COLS, filtered, () => setPage(1))
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, colFiltered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  async function saveLog() {
    if (!logForm) return
    setLogSaving(true)
    try {
      const res = await fetch('/api/patient-relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: 'noshow', patientId: logForm.patientId, remarks: logForm.remarks, branch: branch || patients.find((p: any) => p.id === logForm.patientId)?.branch || '' }),
      })
      if (res.ok) { setLogForm(null); fetchData() }
      else alert('Failed to save')
    } catch { alert('Failed to save') }
    finally { setLogSaving(false) }
  }

  async function deleteLog() {
    if (!deleting) return
    const params = new URLSearchParams({ tab: 'noshow-delete', logId: deleting.logId, reason: deleting.reason })
    const res = await fetch(`/api/patient-relationship?${params}`, { method: 'DELETE' })
    if (res.ok) { setDeleting(null); fetchData() }
    else alert('Failed to delete')
  }

  // KPI strip — off the rows already loaded.
  const atLimitCount = patients.filter((p: any) => p.noShowCount >= MAX_NOSHOWS).length
  const nearingCount = patients.filter((p: any) => p.noShowCount === MAX_NOSHOWS - 1).length
  const totalNoShows = patients.reduce((n: number, p: any) => n + Number(p.noShowCount ?? 0), 0)
  // The list reloads after every log/delete; keep the rows (dimmed) rather than
  // blanking the table, so the open patient stays open in place.
  const firstLoad = loading && patients.length === 0

  return (
    <div className="space-y-4">
      <Callout tone="danger" icon={<AlertTriangle size={14} />}>
        Patients are allowed a maximum of <strong>{MAX_NOSHOWS} no-shows</strong>. Upon reaching {MAX_NOSHOWS}/{MAX_NOSHOWS}, the patient is <strong>subject to slot removal</strong>.
      </Callout>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Patients with no-shows" value={firstLoad ? '—' : patients.length.toLocaleString()} icon={<Users size={15} />} />
        <KpiCard label="No-shows logged" value={firstLoad ? '—' : totalNoShows.toLocaleString()} sub="Across these patients" accent="#64748B" icon={<FileText size={15} />} />
        <KpiCard label={`Nearing (${MAX_NOSHOWS - 1}/${MAX_NOSHOWS})`} value={firstLoad ? '—' : <span style={{ color: nearingCount ? '#D97706' : undefined }}>{nearingCount.toLocaleString()}</span>}
          sub="One more and the slot is at risk" accent="#D97706" icon={<Clock size={15} />} />
        <KpiCard label="Subject to slot removal" value={firstLoad ? '—' : <span style={{ color: atLimitCount ? '#DC2626' : undefined }}>{atLimitCount.toLocaleString()}</span>}
          sub={`At ${MAX_NOSHOWS}/${MAX_NOSHOWS}`} accent="#DC2626" icon={<AlertTriangle size={15} />} />
      </div>

      {loadError && <LoadError message={loadError} onRetry={fetchData} />}

      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(1) }} />
        <FilterToggle open={showFilters} onToggle={() => setShowFilters(v => !v)} activeCount={activeCount} onClear={clearAll} />
        <ResultCount shown={sorted.length} total={patients.length} noun={patients.length === 1 ? 'patient' : 'patients'} loading={loading} />
      </div>

      <TableCard dim={loading && !firstLoad}
        footer={<Pagination total={sorted.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />}>
        <table className="w-full text-left min-w-[560px]" style={{ fontSize: '0.82rem' }}>
          <thead style={THEAD_STYLE}>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            {showFilters && <FilterRow cols={COLS} rows={filtered} filters={filters} setFilter={setFilter} />}
          </thead>
          <tbody>
            {firstLoad ? <SkeletonRows cols={COLS.length} /> : paginated.length === 0 ? (
              <tr><td colSpan={4}>
                {activeCount > 0
                  ? <EmptyState title="No patients match these filters." hint="Loosen a column filter, or reset them all." />
                  : <EmptyState title="No patients found." hint={search ? 'Nothing here matches that name.' : 'Patients appear here once a no-show is logged.'} />}
              </td></tr>
            ) : paginated.map((p: any) => {
              const isExpanded = expandedId === p.id
              const atLimit = p.noShowCount >= MAX_NOSHOWS
              const nearing = p.noShowCount === MAX_NOSHOWS - 1
              const rowColor = atLimit ? '#FEF6F6' : nearing ? '#FFFCF0' : isExpanded ? SUBTLE_BG : undefined
              const textColor = atLimit ? '#DC2626' : nearing ? '#D97706' : 'var(--charcoal)'
              return (
                <Fragment key={p.id}>
                  <tr className={`align-middle transition-colors ${rowColor ? '' : 'hover:bg-[#F8FAF9]'}`}
                    style={{ borderBottom: ROW_RULE, cursor: 'pointer', background: rowColor,
                             boxShadow: atLimit ? 'inset 3px 0 0 #F87171' : nearing ? 'inset 3px 0 0 #FBBF24' : undefined }}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)} aria-expanded={isExpanded}>
                    <td className="pl-4 pr-1 py-3" style={{ width: 32, color: 'var(--mid-gray)' }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold" style={{ color: textColor }}>{p.lastName}, {p.firstName}</span>
                        {atLimit && <Badge bg="#FEE2E2" fg="#DC2626" strong caps>Subject to slot removal</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><BranchBadge branch={p.branch} /></td>
                    <td className="px-4 py-3">
                      <CountMeter used={Number(p.noShowCount ?? 0)} max={MAX_NOSHOWS} color={textColor} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={p.id + '-detail'}>
                      <td colSpan={4} className="px-5 sm:pl-12 py-4" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                        <div className="space-y-3 max-w-3xl">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>No-Show Logs</p>
                            <button onClick={() => setLogForm({ patientId: p.id, remarks: '' })}
                              className={BTN_SM} style={{ background: 'var(--teal)', color: '#fff' }}>
                              <Plus size={13} /> Log No-Show
                            </button>
                          </div>

                          {logForm?.patientId === p.id && (
                            <div className="rounded-xl p-3.5 space-y-3" style={CARD_STYLE}>
                              <div>
                                <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor={`ns-remarks-${p.id}`}>Remarks</label>
                                <input id={`ns-remarks-${p.id}`} type="text" placeholder="Remarks (optional)" value={logForm!.remarks}
                                  onChange={e => setLogForm({ ...logForm!, remarks: e.target.value })}
                                  className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setLogForm(null)} className={BTN_SM} style={CONTROL_STYLE}>Cancel</button>
                                <button onClick={saveLog} disabled={logSaving} className={BTN_SM} style={{ background: 'var(--teal)', color: '#fff' }}>
                                  {logSaving && <Loader2 size={12} className="animate-spin" />}
                                  {logSaving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}

                          {p.logs.length === 0 ? (
                            <p className="text-xs rounded-xl px-3.5 py-3" style={{ ...CARD_STYLE, color: 'var(--mid-gray)' }}>No no-show logs yet.</p>
                          ) : (
                            <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
                              {p.logs.map((log: any, i: number) => (
                                <div key={log.id} className="px-3.5 py-2.5 flex items-start gap-3 text-xs"
                                  style={{
                                    borderTop: i === 0 ? undefined : ROW_RULE,
                                    background: log.deletedAt ? '#F9FAFB' : '#fff',
                                    opacity: log.deletedAt ? 0.6 : 1,
                                  }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <Badge bg="#FEF2F2" fg="#DC2626">No-Show</Badge>
                                      <span style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>{fmtDay(log.createdAt)}</span>
                                      {log.deletedAt && (
                                        <span style={{ color: '#DC2626', fontWeight: 600 }}>
                                          DELETED by {log.deletedBy} ({log.deleteReason || 'no reason'})
                                        </span>
                                      )}
                                    </div>
                                    {log.remarks && (
                                      <p className="mt-1 leading-relaxed break-words" style={{ color: 'var(--charcoal)' }}>{log.remarks}</p>
                                    )}
                                  </div>
                                  {!log.deletedAt && (
                                    <button onClick={(e) => { e.stopPropagation(); setDeleting({ logId: log.id, reason: '' }) }}
                                      className={ICON_BTN} title="Delete log" aria-label="Delete log"
                                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableCard>

      {/* Delete confirmation modal */}
      {deleting && (
        <DeleteLogModal title="Delete No-Show Log" reason={deleting.reason}
          onReason={reason => setDeleting({ ...deleting, reason })}
          onCancel={() => setDeleting(null)} onDelete={deleteLog} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CANCELLATION TAB
// ══════════════════════════════════════════════════════════════════════════════

const CANCELLATION_TYPES = [
  'Cancellation >24 hrs (VALID)',
  'Cancellation >24 hrs (INVALID)',
  'Late Cancellation <24 hrs (VALID)',
  'Late Cancellation <24 hrs (INVALID)',
  'Retainer (VALID)',
  'Retainer (INVALID)',
]

function CancellationTab({ branch }: { branch: string }) {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  // Filter row starts hidden: most visits to this tab are a quick look, and a
  // row of empty inputs above every table would be permanent clutter.
  const [showFilters, setShowFilters] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logForm, setLogForm] = useState<{ patientId: string; type: string; remarks: string } | null>(null)
  const [logSaving, setLogSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{ logId: string; reason: string } | null>(null)
  const [qrModal, setQrModal] = useState<{ logId: string; url: string } | null>(null)
  const [qrUploaded, setQrUploaded] = useState(false)
  // Whether the POS fee check ran, and what it matched on. Drives the difference
  // between "fee unpaid" and "we couldn't check".
  const [feeLookup, setFeeLookup] = useState<{ ok: boolean; patterns?: string[]; matched?: number } | null>(null)
  // Display only — see WaitlistTab.
  const [loadError, setLoadError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true); setLoadError('')
    const params = new URLSearchParams({ tab: 'cancellation' })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setPatients(d.patients || []); setFeeLookup(d.feeLookup ?? null); setLoadError(d?.error || ''); setLoading(false) })
      .catch(() => { setLoadError('Could not load cancellations.'); setLoading(false) })
  }, [branch])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = search
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : patients

  const COLS: SortCol[] = [
    { key: 'expand',  label: '' },                                  // chevron
    { key: 'patient', label: 'Patient',        get: p => `${p.lastName} ${p.firstName}`, filter: 'text' },
    { key: 'branch',  label: 'Branch',         get: p => branchLabel(p.branch) ?? '', filter: 'select' },
    // Named for the window it actually measures — the trailing 6 months — so the
    // 0/2 can't be misread as a lifetime figure. Filtering min=2 lists exactly
    // the patients a cancellation fee now applies to.
    { key: 'free',    label: 'Free Allowance (last 6 mo)', get: p => Number(p.windowUsed ?? 0), filter: 'number' },
    // Sorting/filtering by this surfaces who is at the 12-cancellation line.
    { key: 'slot',    label: 'Slot Removal',   get: p => Number(p.cancellationsUsed ?? 0), filter: 'number' },
  ]
  const { filtered: colFiltered, filters, setFilter, clearAll, activeCount } = useFilters(COLS, filtered, () => setPage(1))
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, colFiltered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  async function saveLog() {
    if (!logForm) return
    setLogSaving(true)
    try {
      const res = await fetch('/api/patient-relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...logForm, branch: branch || patients.find((p: any) => p.id === logForm.patientId)?.branch || '' }),
      })
      if (res.ok) { setLogForm(null); fetchData() }
      else alert('Failed to save')
    } catch { alert('Failed to save') }
    finally { setLogSaving(false) }
  }

  async function uploadProof(logId: string, file: File) {
    setUploading(logId)
    const form = new FormData()
    form.append('logId', logId)
    form.append('file', file)
    try {
      const res = await fetch('/api/patient-relationship', { method: 'POST', body: form })
      if (res.ok) fetchData()
      else alert('Upload failed')
    } catch { alert('Upload failed') }
    finally { setUploading(null) }
  }

  async function deleteLog() {
    if (!deleting) return
    const params = new URLSearchParams({ logId: deleting.logId, reason: deleting.reason })
    const res = await fetch(`/api/patient-relationship?${params}`, { method: 'DELETE' })
    if (res.ok) { setDeleting(null); fetchData() }
    else alert('Failed to delete')
  }

  function openQrUpload(logId: string) {
    const uploadUrl = `${window.location.origin}/upload-proof/${logId}`
    setQrUploaded(false)
    setQrModal({ logId, url: uploadUrl })
  }

  // Poll for proof upload while QR modal is open
  useEffect(() => {
    if (!qrModal || qrUploaded) return
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({ tab: 'cancellation' })
        if (branch) params.set('branch', branch)
        const res = await fetch(`/api/patient-relationship?${params}`)
        const data = await res.json()
        const allLogs = (data.patients || []).flatMap((p: any) => p.logs || [])
        const log = allLogs.find((l: any) => l.id === qrModal.logId)
        if (log?.proofUrl) {
          setQrUploaded(true)
          fetchData()
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [qrModal, qrUploaded, branch, fetchData])

  // KPI strip — off the rows already loaded (fee status is already on each log).
  const feeAppliesCount = patients.filter((p: any) => (p.windowUsed ?? 0) >= 2).length
  const nearingSlotCount = patients.filter((p: any) => p.cancellationsUsed >= 10 && p.cancellationsUsed < 12).length
  const atSlotCount = patients.filter((p: any) => p.cancellationsUsed >= 12).length
  const unpaidFeeCount = patients.reduce((n: number, p: any) =>
    n + (p.logs || []).filter((l: any) => !l.deletedAt && l.feeBearing && !l.feePaid).length, 0)
  // Reloads after every log, upload and delete; keep the rows (dimmed) rather
  // than blanking the table, so the open patient stays open in place.
  const firstLoad = loading && patients.length === 0

  return (
    <div className="space-y-4">
      <Callout tone="warn" icon={<Info size={14} />}>
        <ul className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          <li><strong>Free Allowance:</strong> Each patient gets <strong>2 free cancellations</strong> in any <strong>rolling 6-month period</strong> &mdash; counted over the last 180 days, so older logs age out. After that, a cancellation fee applies.</li>
          <li><strong>Not counted:</strong> reschedules, and any cancellation front desk waived when logging it (the reason is shown on the log).</li>
          <li><strong>Fees:</strong> owed from the <strong>3rd cancellation onward</strong> in the window; paid/unpaid is read from POS orders in the Accounting Hub.</li>
          <li><strong>Slot Removal:</strong> Upon reaching <strong>12 total cancellations</strong>, the patient is subject to slot removal.</li>
        </ul>
      </Callout>

      {/* If the lookup ran but matched NOTHING, every fee-bearing row would read
          "unpaid" — which looks like a fact and isn't. Far more likely the POS
          line is named something this doesn't recognise. Say so loudly rather
          than letting front desk chase patients who already paid. */}
      {feeLookup?.ok && feeLookup.matched === 0 && (
        <Callout tone="warn" icon={<AlertTriangle size={14} />}>
          <strong>No cancellation-fee lines found in POS.</strong> Fee status below may be wrong &mdash;
          treat &quot;unpaid&quot; as unverified until this is sorted. Looked for order lines named{' '}
          {(feeLookup.patterns ?? []).map(x => `"${x}"`).join(', ') || '(none configured)'}. If your POS calls it
          something else, set <code>FEE_NAME_PATTERN</code> on the Accounting Hub to match.
        </Callout>
      )}
      {feeLookup?.ok === false && (
        <Callout tone="neutral" icon={<Info size={14} />}>
          Could not reach the Accounting Hub, so fee payments were not checked. Rows show
          &quot;not checked&quot; rather than unpaid.
        </Callout>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Patients with logs" value={firstLoad ? '—' : patients.length.toLocaleString()} icon={<Users size={15} />} />
        <KpiCard label="Fee applies" value={firstLoad ? '—' : <span style={{ color: feeAppliesCount ? '#DC2626' : undefined }}>{feeAppliesCount.toLocaleString()}</span>}
          sub="Free allowance used up (2/2)" accent="#DC2626" icon={<AlertTriangle size={15} />} />
        <KpiCard label="Fees unpaid" value={firstLoad ? '—' : feeLookup?.ok === false ? <span style={{ color: 'var(--mid-gray)' }}>—</span> : unpaidFeeCount.toLocaleString()}
          sub={feeLookup?.ok === false ? 'Not checked — Accounting Hub unreachable' : 'Fee-bearing logs with no POS payment'} accent="#B45309" icon={<FileText size={15} />} />
        <KpiCard label="Slot removal" value={firstLoad ? '—' : <span style={{ color: atSlotCount ? '#DC2626' : undefined }}>{atSlotCount.toLocaleString()}</span>}
          sub={`${nearingSlotCount.toLocaleString()} nearing (10–11 of 12)`} accent="#D97706" icon={<XCircle size={15} />} />
      </div>

      {loadError && <LoadError message={loadError} onRetry={fetchData} />}

      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(1) }} />
        <FilterToggle open={showFilters} onToggle={() => setShowFilters(v => !v)} activeCount={activeCount} onClear={clearAll} />
        <ResultCount shown={sorted.length} total={patients.length} noun={patients.length === 1 ? 'patient' : 'patients'} loading={loading} />
      </div>

      <TableCard dim={loading && !firstLoad}
        footer={<Pagination total={sorted.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />}>
        <table className="w-full text-left min-w-[680px]" style={{ fontSize: '0.82rem' }}>
          <thead style={THEAD_STYLE}>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            {showFilters && <FilterRow cols={COLS} rows={filtered} filters={filters} setFilter={setFilter} />}
          </thead>
          <tbody>
            {firstLoad ? <SkeletonRows cols={COLS.length} /> : paginated.length === 0 ? (
              <tr><td colSpan={5}>
                {activeCount > 0
                  ? <EmptyState title="No patients match these filters." hint="Loosen a column filter, or reset them all." />
                  : <EmptyState title="No patients found." hint={search ? 'Nothing here matches that name.' : 'Patients appear here once a cancellation is logged.'} />}
              </td></tr>
            ) : paginated.map((p: any) => {
              const isExpanded = expandedId === p.id
              const atSlotLimit = p.cancellationsUsed >= 12
              const nearingSlot = p.cancellationsUsed >= 10 && p.cancellationsUsed < 12
              const freeUsed = p.windowUsed ?? 0
              const freeGone = freeUsed >= 2
              const rowColor = atSlotLimit ? '#FEF6F6' : nearingSlot ? '#FFFCF0' : isExpanded ? SUBTLE_BG : undefined
              const slotColor = atSlotLimit ? '#DC2626' : nearingSlot ? '#D97706' : 'var(--charcoal)'
              const freeColor = freeGone ? '#DC2626' : freeUsed === 1 ? '#D97706' : '#16a34a'
              return (
                <Fragment key={p.id}>
                  <tr className={`align-middle transition-colors ${rowColor ? '' : 'hover:bg-[#F8FAF9]'}`}
                    style={{ borderBottom: ROW_RULE, cursor: 'pointer', background: rowColor,
                             boxShadow: atSlotLimit ? 'inset 3px 0 0 #F87171' : nearingSlot ? 'inset 3px 0 0 #FBBF24' : undefined }}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)} aria-expanded={isExpanded}>
                    <td className="pl-4 pr-1 py-3" style={{ width: 32, color: 'var(--mid-gray)' }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold" style={{ color: slotColor }}>{p.lastName}, {p.firstName}</span>
                        {atSlotLimit && <Badge bg="#FEE2E2" fg="#DC2626" strong caps>Subject to slot removal</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><BranchBadge branch={p.branch} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CountMeter used={freeUsed} max={2} color={freeColor} />
                        {freeGone && <Badge bg="#FEF2F2" fg="#DC2626">Fee applies</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CountMeter used={Number(p.cancellationsUsed ?? 0)} max={12} color={slotColor} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={p.id + '-detail'}>
                      <td colSpan={5} className="px-5 sm:pl-12 py-4" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                        <div className="space-y-3 max-w-4xl">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>Cancellation Logs</p>
                            <button onClick={() => setLogForm({ patientId: p.id, type: CANCELLATION_TYPES[0], remarks: '' })}
                              className={BTN_SM} style={{ background: 'var(--teal)', color: '#fff' }}>
                              <Plus size={13} /> Log Cancellation
                            </button>
                          </div>

                          {/* The allowance counts only the trailing 6 months, so a patient
                              with a long history can sit at 0/2. Say why, or the zero next
                              to a lifetime total reads as a missing or wiped log. */}
                          {p.windowLapsed && (
                            <Callout tone="neutral" icon={<Clock size={13} />}>
                              <span style={{ fontWeight: 700 }}>6-month window lapsed.</span>{' '}
                              No cancellations or reschedules in the last 6 months
                              {typeof p.daysSinceLastLog === 'number' && (
                                <> — the most recent was <span style={{ fontWeight: 600 }}>{formatAge(p.daysSinceLastLog)} ago</span></>
                              )}.
                              {' '}The {p.cancellationsUsed} log{p.cancellationsUsed === 1 ? '' : 's'} below still count toward slot removal, but no longer toward the free allowance.
                            </Callout>
                          )}

                          {/* New log form */}
                          {logForm?.patientId === p.id && (
                            <div className="rounded-xl p-3.5 space-y-3" style={CARD_STYLE}>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr]">
                                <div>
                                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor={`cx-type-${p.id}`}>Type</label>
                                  <select id={`cx-type-${p.id}`} value={logForm!.type} onChange={e => setLogForm({ ...logForm!, type: e.target.value })}
                                    className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                                    {CANCELLATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor={`cx-remarks-${p.id}`}>Remarks</label>
                                  <input id={`cx-remarks-${p.id}`} type="text" placeholder="Remarks (optional)" value={logForm!.remarks}
                                    onChange={e => setLogForm({ ...logForm!, remarks: e.target.value })}
                                    className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setLogForm(null)} className={BTN_SM} style={CONTROL_STYLE}>Cancel</button>
                                <button onClick={saveLog} disabled={logSaving} className={BTN_SM} style={{ background: 'var(--teal)', color: '#fff' }}>
                                  {logSaving && <Loader2 size={12} className="animate-spin" />}
                                  {logSaving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Existing logs */}
                          {p.logs.length === 0 ? (
                            <p className="text-xs rounded-xl px-3.5 py-3" style={{ ...CARD_STYLE, color: 'var(--mid-gray)' }}>No cancellation logs yet.</p>
                          ) : (
                            <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
                              {p.logs.map((log: any, i: number) => (
                                <div key={log.id} className="px-3.5 py-2.5 flex items-start gap-3 text-xs"
                                  style={{
                                    borderTop: i === 0 ? undefined : ROW_RULE,
                                    background: log.deletedAt ? '#F9FAFB' : '#fff',
                                    opacity: log.deletedAt ? 0.6 : 1,
                                  }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <Badge bg={log.isValid ? '#F0FDF4' : '#FEF2F2'} fg={log.isValid ? '#15803D' : '#DC2626'}>{log.type}</Badge>
                                      <span style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>{fmtDay(log.createdAt)}</span>
                                      {/* Why a row isn't in the 0/2. Reschedules and waived
                                          cancellations never count at all, so they're labelled
                                          regardless of the window — otherwise the list looks
                                          like it disagrees with the number above it. */}
                                      {!log.deletedAt && log.sourceStatus === 'RESCHEDULED' && (
                                        <Badge bg="#EFF6FF" fg="#1D4ED8">reschedule &middot; not counted</Badge>
                                      )}
                                      {!log.deletedAt && log.countsToward === false && (
                                        <Badge bg="#F1F5F9" fg="#475569" title={log.excludeReason || undefined}>
                                          not counted{log.excludeReason ? ` — ${log.excludeReason}` : ''}
                                        </Badge>
                                      )}
                                      {/* Only tagged when some other log DOES count — on a fully
                                          lapsed patient the banner above already says it, and
                                          tagging every row would just be noise. */}
                                      {!log.deletedAt && log.sourceStatus !== 'RESCHEDULED' && log.countsToward !== false
                                        && !log.inWindow && p.windowUsed > 0 && (
                                        <Badge bg="#F1F5F9" fg="#64748B">outside 6-mo window</Badge>
                                      )}
                                      {/* Fee status, only on rows a fee is actually owed on (3rd
                                          onward in the window). "Not checked" is a distinct state
                                          from "unpaid": if the Accounting Hub can't be reached,
                                          showing unpaid would send front desk to collect money the
                                          patient may already have handed over. */}
                                      {!log.deletedAt && log.feeBearing && (
                                        log.feePaid ? (
                                          <Badge bg="#F0FDF4" fg="#15803D" strong
                                            title={`${log.feePaid.lineName} — ₱${Number(log.feePaid.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}>
                                            fee paid &middot; POS #{log.feePaid.orderNumber} &middot;{' '}
                                            {new Date(log.feePaid.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </Badge>
                                        ) : feeLookup?.ok === false ? (
                                          <Badge bg="#F1F5F9" fg="#475569" title="Could not reach the Accounting Hub to check.">
                                            fee owed &middot; not checked
                                          </Badge>
                                        ) : (
                                          <Badge bg="#FEF2F2" fg="#DC2626" strong>fee unpaid</Badge>
                                        )
                                      )}
                                      {log.deletedAt && (
                                        <span style={{ color: '#DC2626', fontWeight: 600 }}>
                                          DELETED by {log.deletedBy} ({log.deleteReason || 'no reason'})
                                        </span>
                                      )}
                                    </div>
                                    {log.remarks && (
                                      <p className="mt-1 leading-relaxed break-words" style={{ color: 'var(--charcoal)' }}>{log.remarks}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-1.5 items-center flex-shrink-0">
                                    {/* View proof */}
                                    {log.proofUrl && (
                                      <a href={log.proofUrl} target="_blank" rel="noreferrer" title="View proof" aria-label="View proof"
                                        className={ICON_BTN}
                                        style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                        <Eye size={13} />
                                      </a>
                                    )}
                                    {/* Upload proof (only for valid, no proof yet, not deleted) */}
                                    {log.isValid && !log.proofUrl && !log.deletedAt && (
                                      <>
                                        <label className={`${ICON_BTN} cursor-pointer`} title="Upload proof"
                                          style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                                          {uploading === log.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                          <input type="file" accept="image/*,application/pdf" className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadProof(log.id, f) }} />
                                        </label>
                                        <button onClick={() => openQrUpload(log.id)} title="Take photo with camera" aria-label="Take photo with camera"
                                          className={ICON_BTN}
                                          style={{ background: '#FFF', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                                          <QrCode size={13} />
                                        </button>
                                      </>
                                    )}
                                    {/* Delete (soft) */}
                                    {!log.deletedAt && (
                                      <button onClick={(e) => { e.stopPropagation(); setDeleting({ logId: log.id, reason: '' }) }}
                                        className={ICON_BTN} title="Delete log" aria-label="Delete log"
                                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableCard>

      {/* QR code modal */}
      {qrModal && (
        <ModalShell
          zIndex={1000}
          maxWidth={380}
          icon={qrUploaded ? <CheckCircle size={16} /> : <QrCode size={16} />}
          title={qrUploaded ? 'Proof Uploaded!' : 'Scan to Upload Proof'}
          subtitle={qrUploaded ? undefined : 'Scan this QR code with a tablet or phone to upload proof.'}
          onBackdrop={() => setQrModal(null)}
          onClose={qrUploaded ? undefined : () => setQrModal(null)}
          footer={qrUploaded ? (
            <button onClick={() => setQrModal(null)} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
              Done
            </button>
          ) : undefined}>
          {qrUploaded ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#F0FDF4' }}>
                <CheckCircle size={30} style={{ color: '#15803D' }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>The proof document has been successfully received from the scanned device.</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="inline-flex p-3 rounded-2xl" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModal.url)}`}
                  alt="QR Code"
                  width={200} height={200}
                  style={{ borderRadius: 8, background: '#fff' }}
                />
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-4">
                <Loader2 size={13} className="animate-spin" style={{ color: 'var(--teal)' }} />
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Waiting for upload...</p>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <DeleteLogModal title="Delete Cancellation Log" reason={deleting.reason}
          onReason={reason => setDeleting({ ...deleting, reason })}
          onCancel={() => setDeleting(null)} onDelete={deleteLog} />
      )}
    </div>
  )
}

// ── Shared Components ────────────────────────────────────────────────────────

/** Branch as a soft chip, same colours as the Waitlist's Branch column. */
function BranchBadge({ branch }: { branch?: string | null }) {
  if (!branch) return <span style={{ color: '#9CA3AF' }}>&mdash;</span>
  const east = branch === 'SANDBOX_EAST'
  const gh = branch === 'SANDBOX_GREENHILLS'
  return (
    <Badge bg={east ? '#E6F2F4' : gh ? '#FEF3E2' : '#F1F5F9'} fg={east ? '#12606C' : gh ? '#92400E' : '#475569'}>
      {branchLabel(branch)}
    </Badge>
  )
}

/** "2 / 3" with a thin track underneath, for the allowance and limit columns. */
function CountMeter({ used, max, color }: { used: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (used / max) * 100))
  return (
    <div className="inline-flex flex-col gap-1 min-w-[56px]" title={`${used} of ${max}`}>
      <span className="whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="text-sm font-bold" style={{ color }}>{used}</span>
        <span className="text-xs ml-1" style={{ color: '#9ca3af' }}>/ {max}</span>
      </span>
      <span className="block h-1 rounded-full overflow-hidden" style={{ background: '#E9EFED', width: 56 }} aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color === 'var(--charcoal)' ? 'var(--teal)' : color }} />
      </span>
    </div>
  )
}

/** Reason-required soft delete, shared by the No-Show and Cancellation logs. No
 *  backdrop dismiss, as before — the reason box shouldn't vanish on a stray click. */
function DeleteLogModal({ title, reason, onReason, onCancel, onDelete }: {
  title: string; reason: string; onReason: (r: string) => void; onCancel: () => void; onDelete: () => void
}) {
  const ready = !!reason.trim()
  return (
    <ModalShell zIndex={1000} maxWidth={420} tone="danger" icon={<Trash2 size={15} />}
      title={title} subtitle="Please provide a reason for deletion. This will be tracked."
      footer={<>
        <button onClick={onCancel} className={BTN_SECONDARY} style={CONTROL_STYLE}>Cancel</button>
        <button onClick={onDelete} disabled={!ready} className={BTN_PRIMARY}
          style={{ background: ready ? '#DC2626' : '#CBD5E1' }}>
          <Trash2 size={13} /> Delete
        </button>
      </>}>
      <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="delete-log-reason">Reason</label>
      <textarea id="delete-log-reason" value={reason} onChange={e => onReason(e.target.value)}
        placeholder="Reason for deletion..." rows={3}
        className="focus:border-[var(--teal)]"
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--light-gray)', fontSize: '0.83rem', lineHeight: 1.5, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', color: 'var(--charcoal)', resize: 'vertical' }} />
    </ModalShell>
  )
}

/**
 * "We have slots" — email and SMS, straight off the waitlist row.
 *
 * Each icon turns green the first time it sends and stays green, because the
 * question front desk are answering down a list of three hundred is "have I
 * already told this family". Hovering says when, and the expanded row lists
 * every send.
 *
 * A second send is allowed — slots open again — but never on one click: the
 * route answers 409 with the date of the last one, and that date goes into the
 * confirmation rather than a bare "are you sure".
 *
 * Nothing about the message is decided here. The browser sends three ids; the
 * server re-reads the submission from HR and writes the words. This component
 * cannot choose a recipient, and that is deliberate.
 */
function OutreachBtns({ item, onSent }: {
  item: any
  onSent: (channel: 'EMAIL' | 'SMS', state: OutreachState) => void
}) {
  const [busy, setBusy] = useState<'EMAIL' | 'SMS' | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const emailState: OutreachState | null = item._outreach?.EMAIL ?? null
  const smsState: OutreachState | null = item._outreach?.SMS ?? null

  const who = item._name || 'this family'

  /**
   * Fetch the preview. Nothing is sent by this — the route builds the message
   * and stops.
   *
   * A confirm() could only ever describe the message; this shows it. The thing
   * front desk approve is then the thing that goes out, which matters most on
   * the rows where it would NOT go out: no email on the form, a branch mailbox
   * that is not connected. Those surface here rather than after a click that
   * reads as "sent".
   */
  async function openPreview(channel: 'EMAIL' | 'SMS') {
    if (busy) return
    setBusy(channel)
    try {
      const r = await fetch('/api/patient-relationship/waitlist-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: item._formId, submissionId: item.landing_id, channel, dryRun: true,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setPreview({ channel, error: d.error || `Could not build the message (${r.status})` }); return }
      setPreview({ channel, ...d })
    } catch (e) {
      setPreview({ channel, error: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  /** Send for real. Only ever reached from the preview's own button. */
  async function confirmSend() {
    if (!preview || preview.error) return
    const channel = preview.channel
    setBusy(channel)
    try {
      const r = await fetch('/api/patient-relationship/waitlist-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: item._formId, submissionId: item.landing_id, channel,
          // The preview already showed when the last one went out, so the
          // 409 round trip would be asking a question already answered.
          confirmResend: true,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Send failed (${r.status})`)

      const prev = channel === 'EMAIL' ? emailState : smsState
      onSent(channel, {
        count: (prev?.count ?? 0) + 1,
        lastAt: d.sentAt,
        lastBy: null,
        history: [...(prev?.history ?? []), { sentAt: d.sentAt, sentTo: d.sentTo, sentByName: null }],
      })
      setPreview(null)
    } catch (e) {
      setPreview(p => p ? { ...p, error: (e as Error).message } : p)
    } finally {
      setBusy(null)
    }
  }

  function tip(channel: 'EMAIL' | 'SMS', state: OutreachState | null) {
    const label = channel === 'EMAIL' ? 'Email' : 'SMS'
    if (!state) return `Send the "we have slots" ${label.toLowerCase()}`
    const when = new Date(state.lastAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    return state.count > 1
      ? `${label} sent ${state.count}× — last ${when}. Click to send again.`
      : `${label} sent ${when}. Click to send again.`
  }

  const style = (sent: boolean) => sent
    ? { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }
    : { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }

  return (
    <>
      <button onClick={e => { e.stopPropagation(); openPreview('EMAIL') }} disabled={!!busy}
        className={ICON_BTN} style={style(!!emailState)}
        title={tip('EMAIL', emailState)}
        aria-label={emailState ? `Slots email already sent to ${who} — review and send again` : `Review the slots email for ${who}`}>
        {busy === 'EMAIL' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
      </button>
      <button onClick={e => { e.stopPropagation(); openPreview('SMS') }} disabled={!!busy}
        className={ICON_BTN} style={style(!!smsState)}
        title={tip('SMS', smsState)}
        aria-label={smsState ? `Slots SMS already sent to ${who} — review and send again` : `Review the slots SMS for ${who}`}>
        {busy === 'SMS' ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
      </button>
      {preview && (
        <OutreachPreview preview={preview} who={who} sending={!!busy}
          onCancel={() => setPreview(null)} onSend={confirmSend} />
      )}
    </>
  )
}

/** What the dry run came back with, or why it could not be built. */
interface Preview {
  channel: 'EMAIL' | 'SMS'
  error?: string
  sentTo?: string
  from?: string
  fromName?: string
  subject?: string | null
  message?: string
  services?: string[]
  previouslySentAt?: string | null
  previouslySentTo?: string | null
  segments?: number
  length?: number
  encoding?: 'GSM-7' | 'UCS-2'
  units?: number
}

/**
 * The message, before it goes.
 *
 * Shown in full rather than summarised: this is the only moment anyone sees
 * what a family will read, and the point of it is that approving the preview
 * and approving the message are the same act.
 *
 * It is also where the refusals land — no email on the form, a branch mailbox
 * that is not connected. Those used to arrive as an alert AFTER a click that
 * felt like sending.
 */
function OutreachPreview({ preview, who, sending, onCancel, onSend }: {
  preview: Preview; who: string; sending: boolean
  onCancel: () => void; onSend: () => void
}) {
  const isEmail = preview.channel === 'EMAIL'
  const label = isEmail ? 'email' : 'SMS'

  // Esc closes, as every other dialog on this page does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, sending])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { e.stopPropagation(); if (!sending) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="wo-title"
        className="bg-white rounded-xl w-full max-w-[640px] max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <p id="wo-title" className="font-bold" style={{ color: 'var(--charcoal)' }}>
            {preview.error ? `This ${label} cannot be sent` : `Send this ${label} to ${who}?`}
          </p>
          {!preview.error && (
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Nothing has been sent yet. This is exactly what will go out.
            </p>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          {preview.error ? (
            <div className="rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
              {preview.error}
            </div>
          ) : (
            <>
              <dl className="text-[12px] rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
                {[
                  ['To', preview.sentTo],
                  ['From', preview.fromName ? `${preview.fromName} <${preview.from}>` : preview.from],
                  ...(isEmail ? [['Subject', preview.subject ?? '']] : []),
                  ...(!isEmail && preview.length ? [['Length', `${preview.length} characters · ${preview.segments} SMS segment${preview.segments === 1 ? '' : 's'}${preview.encoding === 'UCS-2' ? ' (UCS-2 — a special character halved the budget)' : ''}`]] : []),
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex gap-3 px-3 py-2"
                    style={{ borderBottom: '1px solid var(--light-gray)' }}>
                    <dt className="font-semibold shrink-0" style={{ color: 'var(--mid-gray)', width: 108 }}>{k}</dt>
                    <dd style={{ color: 'var(--charcoal)', wordBreak: 'break-word' }}>{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-lg px-3 py-2.5 text-[13px]"
                style={{ background: SUBTLE_BG, color: 'var(--charcoal)', whiteSpace: 'pre-wrap' }}>
                {preview.message}
              </div>

              {preview.previouslySentAt && (
                <div className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                  Already sent on {new Date(preview.previouslySentAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  {preview.previouslySentTo ? ` to ${preview.previouslySentTo}` : ''}. Sending again is fine — this will be logged as a second message.
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <button onClick={onCancel} disabled={sending}
            className="px-3 h-9 rounded-lg text-[13px] font-semibold"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            {preview.error ? 'Close' : 'Cancel'}
          </button>
          {!preview.error && (
            <button onClick={onSend} disabled={sending}
              className="px-3 h-9 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5"
              style={{ background: '#166534', color: '#fff', border: '1px solid #166534', opacity: sending ? 0.6 : 1 }}>
              {sending ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send {label}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Every "we have slots" message this family has been sent.
 *
 * Fetched when the row is opened rather than carried in the list: the list
 * already ships three hundred submissions and only ever needs the counts and
 * the last date, which it has. This is the full log, including what was
 * actually said — templates change, and what this family was told does not.
 */
function OutreachHistory({ item }: { item: any }) {
  const [sends, setSends] = useState<{
    id: string; channel: string; sentTo: string; subject: string | null
    message: string; sentByName: string | null; sentAt: string
  }[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const anySent = !!(item._outreach?.EMAIL || item._outreach?.SMS)

  useEffect(() => {
    if (!anySent) return
    const ctl = new AbortController()
    const qs = `formId=${encodeURIComponent(item._formId)}&submissionId=${encodeURIComponent(item.landing_id)}`
    fetch(`/api/patient-relationship/waitlist-outreach?${qs}`, { signal: ctl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => setSends(d.sends ?? []))
      .catch(err => { if (err.name !== 'AbortError') setFailed(true) })
    return () => ctl.abort()
  }, [anySent, item._formId, item.landing_id])

  // Nothing has been sent — no empty panel, the icons already say so.
  if (!anySent) return null

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--teal)' }}>
        Slots messages sent
      </p>
      <div className="rounded-xl overflow-hidden" style={{ ...CARD_STYLE, borderColor: 'var(--light-gray)' }}>
        {failed ? (
          <p className="px-3 py-2.5 text-[12px]" style={{ color: '#9CA3AF' }}>
            Couldn&rsquo;t load the history just now — the messages were still sent.
          </p>
        ) : !sends ? (
          <p className="px-3 py-2.5 text-[12px]" style={{ color: '#9CA3AF' }}>Loading…</p>
        ) : sends.length === 0 ? (
          <p className="px-3 py-2.5 text-[12px]" style={{ color: '#9CA3AF' }}>No messages recorded.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
            {sends.map(s => (
              <li key={s.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                  <span className="inline-flex items-center gap-1 font-semibold"
                    style={{ color: s.channel === 'EMAIL' ? '#1D4ED8' : '#166534' }}>
                    {s.channel === 'EMAIL' ? <Mail size={11} /> : <MessageSquare size={11} />}
                    {s.channel === 'EMAIL' ? 'Email' : 'SMS'}
                  </span>
                  <span style={{ color: 'var(--charcoal)' }}>
                    {new Date(s.sentAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span style={{ color: '#9CA3AF' }}>→ {s.sentTo}</span>
                  {s.sentByName && <span style={{ color: '#9CA3AF' }}>· {s.sentByName}</span>}
                  <button onClick={() => setOpen(open === s.id ? null : s.id)}
                    className="ml-auto text-[11px] font-semibold underline underline-offset-2"
                    style={{ color: 'var(--teal)' }}>
                    {open === s.id ? 'Hide' : 'What was sent'}
                  </button>
                </div>
                {open === s.id && (
                  <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: SUBTLE_BG }}>
                    {s.subject && (
                      <p className="font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>{s.subject}</p>
                    )}
                    <p style={{ color: 'var(--charcoal)', whiteSpace: 'pre-wrap' }}>{s.message}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ContactBtns({ phone, email }: { phone?: string | null; email?: string | null }) {
  return (
    <div className="flex gap-1.5">
      {phone && (
        <a href={`tel:${phone}`} title={phone} className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}><Phone size={13} /></a>
      )}
      {email && (
        <a href={`mailto:${email}`} title={email} className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}><Mail size={13} /></a>
      )}
    </div>
  )
}

// ── Follow-Up Contact Buttons ────────────────────────────────────────────────
// Replaces the plain Call button with an SMS-send button that posts to
// /api/patient-relationship/followup-sms. Once the reminder is sent, the
// button switches to a permanent muted "Sent" chip.

function FollowUpContactBtns({
  patient,
  department,
  onSent,
}: {
  patient: { id: string; branch: string | null; phone: string | null; email: string | null; reminderSentAt: string | null }
  department: string
  onSent: (sentAt: string) => void
}) {
  const [sending, setSending] = useState(false)
  const sent = !!patient.reminderSentAt

  async function sendSms() {
    if (sent || sending) return
    if (!patient.phone) { alert('No phone on file'); return }
    if (!patient.branch) { alert('No branch on record'); return }
    if (!confirm('Send follow-up SMS reminder to ' + patient.phone + '?')) return
    setSending(true)
    try {
      const branchCode = patient.branch === 'SANDBOX_EAST' ? 'SBEA'
        : patient.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : patient.branch
      const r = await fetch('/api/patient-relationship/followup-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id, department, branch: branchCode }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Send failed')
      onSent(data.sentAt || new Date().toISOString())
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally { setSending(false) }
  }

  return (
    <div className="flex gap-1.5">
      {sent ? (
        <span
          title={'Sent ' + new Date(patient.reminderSentAt!).toLocaleDateString()}
          className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-full text-[11px] font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}
        >
          <Check size={11} /> Sent
        </span>
      ) : (
        <button
          onClick={sendSms}
          disabled={sending || !patient.phone}
          title={patient.phone ? 'Send follow-up SMS' : 'No phone on file'}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{
            background: patient.phone ? '#EFF6FF' : '#F1F5F9',
            color: patient.phone ? '#1D4ED8' : '#94A3B8',
            border: '1px solid ' + (patient.phone ? '#BFDBFE' : '#CBD5E1'),
            cursor: patient.phone && !sending ? 'pointer' : 'not-allowed',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
        </button>
      )}
      {patient.email && (
        <a href={'mailto:' + patient.email} title={patient.email} className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}><Mail size={13} /></a>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'waitlist',     label: 'Waitlist',      icon: Users },
  { key: 'followup',     label: 'Follow Up',     icon: Clock },
  { key: 'noshow',       label: 'No-Show',       icon: AlertTriangle },
  { key: 'cancellation', label: 'Cancellations', icon: XCircle },
]

export default function PatientRelationshipClient({
  role,
  initialTab = 'waitlist',
}: {
  role: string
  /** From ?tab= on the page, so the dashboard cards can link to a given tab. */
  initialTab?: Tab
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [filterBranch, setFilterBranch] = useState('')

  // Auto-set branch for branch-specific roles
  const isSBEA = role.startsWith('SBEA')
  const isSBGH = role.startsWith('SBGH')
  const effectiveBranch = isSBEA ? 'SANDBOX_EAST' : isSBGH ? 'SANDBOX_GREENHILLS' : filterBranch
  const isAdmin = !isSBEA && !isSBGH

  const TAB_HINT: Record<Tab, string> = {
    waitlist: 'Intake form submissions waiting to be converted into patients.',
    followup: 'Patients due a reconsult, by department, with an SMS reminder.',
    noshow: `No-show logs per patient — ${MAX_NOSHOWS} and the slot is subject to removal.`,
    cancellation: 'Cancellation logs, the 6-month free allowance, fees and slot removal.',
  }

  return (
    <div className="max-w-7xl min-w-0 space-y-5">
      {/* ── Header: title left, branch scope right ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <HeartHandshake size={24} style={{ color: 'var(--teal)' }} />
            Patient Relationship
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Waitlist, follow-ups, no-shows and cancellations for the East and Greenhills clinics.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider hidden sm:inline" style={{ color: 'var(--mid-gray)' }}>Branch</span>
            <Segmented label="Branch" value={filterBranch} onChange={setFilterBranch}
              items={[{ key: '', label: 'All Branches' }, ...BRANCHES.map(b => ({ key: b.value, label: b.label }))]} />
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
            title="Your account is scoped to this branch"
            style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
            <Building2 size={13} style={{ color: 'var(--teal)' }} />
            {branchLabel(effectiveBranch)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Segmented label="Patient relationship sections" size="md" stretch value={activeTab} onChange={setActiveTab}
          items={TABS.map(t => ({ key: t.key, label: t.label, icon: t.icon }))} />
        <p className="text-xs px-1" style={{ color: 'var(--mid-gray)' }}>{TAB_HINT[activeTab]}</p>
      </div>

      {activeTab === 'waitlist' && <WaitlistTab branch={effectiveBranch} />}
      {activeTab === 'followup' && <FollowUpTab branch={effectiveBranch} />}
      {activeTab === 'noshow' && <NoShowTab branch={effectiveBranch} />}
      {activeTab === 'cancellation' && <CancellationTab branch={effectiveBranch} />}
    </div>
  )
}
