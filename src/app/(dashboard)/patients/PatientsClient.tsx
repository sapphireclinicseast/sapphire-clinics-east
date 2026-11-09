'use client'

import DiagnosisTagInput, { splitLegacyDiagnosis, joinDiagnosisTags } from '@/components/DiagnosisTagInput'
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import {
  Upload, Plus, Search, X, Cake, Download,
  AlertTriangle, CheckSquare, Square, Pencil, Trash2, Check,
  ChevronUp, ChevronDown, ArrowUpDown, CheckCircle, XCircle, ListFilter,
  QrCode, FileText, Camera, Loader2, Star, Settings, Users, SearchX,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { isLikelyChinoy } from '@/lib/chinoy-surnames'
import { branchLabel } from '@/lib/branch-label'
import { useSearchParams } from 'next/navigation'
import { flashRow } from '@/lib/highlight-row'
import { CertificateActionButton, CertificateSettingsButton } from '@/components/patients/DischargeCertificates'

interface Patient {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dob?: string
  patientType: 'PEDIATRIC' | 'ADULT'
  branch?: string
  branches?: string[]
  sex?: string
  civilStatus?: string
  religion?: string
  nationality?: string
  address?: string
  city?: string
  diagnosis?: string
  diagnoses?: string[]
  notes?: string
  referralUrl?: string | null
  pwdIdUrl?: string | null
  firstDayOfConsult?: string | null
  pwdSeniorId?: string | null
  unsubscribed?: boolean
  smsUnsubscribed?: boolean
}

// Seed list, shown for the moment before /api/branches/options answers so the
// pickers are never briefly empty. The fetched list replaces it — a branch
// created in HR Platform appears here without a code change, which is the
// whole point of Patient.branches being text rather than a Prisma enum.
const FALLBACK_BRANCHES: BranchOption[] = [
  { value: 'SANDBOX_EAST',       label: branchLabel('SANDBOX_EAST') },
  { value: 'SANDBOX_GREENHILLS', label: branchLabel('SANDBOX_GREENHILLS') },
  { value: 'VERDANA_STORE',      label: branchLabel('VERDANA_STORE') },
]

interface BranchOption { value: string; label: string; shortCode?: string }

/** Branch list from the HrBranch registry (hourly sync from HR Platform). */
function useBranchOptions(): BranchOption[] {
  const [opts, setOpts] = useState<BranchOption[]>(FALLBACK_BRANCHES)
  useEffect(() => {
    fetch('/api/branches/options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.branches?.length) setOpts(d.branches) })
      .catch(() => { /* keep the seed list — never leave the picker empty */ })
  }, [])
  return opts
}

interface DuplicateEntry {
  csvRow: Record<string, string>
  existing: { id: string; firstName: string; lastName: string; dob?: string }
}

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '', dob: '',
  patientType: 'ADULT', branches: [] as string[], sex: '',
  civilStatus: '', religion: '', nationality: '', address: '', city: '', diagnosis: '', diagnoses: [] as string[], notes: '',
  firstDayOfConsult: '', pwdSeniorId: '', unsubscribed: false, smsUnsubscribed: false,
}

type SortCol = 'name' | 'type' | 'branch' | 'sex' | 'city' | 'barangay' | 'diagnosis' | 'email' | 'dob' | ''
type SortDir = 'asc' | 'desc'
type FilterableCol = 'type' | 'branch' | 'sex' | 'city' | 'barangay' | 'diagnosis'


function patientBranchDisplay(p: Patient) {
  const bs = p.branches?.length ? p.branches : (p.branch ? [p.branch] : [])
  return bs.map(branchLabel).join(', ') || '—'
}

// ── Display helpers (presentation only — stored values are never changed) ─────

// Short branch tag for the table; the full label stays in the cell's tooltip.
const BRANCH_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana',
  SBEA: 'East', SBGH: 'Greenhills',
}
function branchShort(code: string): string {
  return BRANCH_SHORT[code] ?? branchLabel(code)
}

// Records are typed in ALL CAPS (the form upper-cases as you type), which made
// the table shout. Re-case for display only, and only when the value has no
// lower-case letters at all — anything typed in mixed case is left as typed.
const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])
const SMALL_WORDS = new Set(['of', 'and', 'with', 'to', 'the', 'in', 'on', 'for', 'or', 'a', 'an', 'at', 'by'])
// Diagnosis shorthand that must stay upper-case ("ADHD", not "Adhd"). Words
// with no vowel at all (GDD, CP, PTSD) are kept upper-case by rule as well.
const DX_ACRONYMS = new Set([
  'adhd', 'add', 'asd', 'aud', 'id', 'idd', 'ld', 'sld', 'ocd', 'odd', 'cas', 'tbi', 'cva', 'als',
  'ds', 'pdd', 'nos', 'sli', 'dld', 'capd', 'apd', 'mdd', 'gad', 'bpd', 'hie', 'ot', 'pt', 'slp',
  'rom', 'acl', 'mcl', 'ckd', 'copd', 'mi', 'gerd', 'sci', 'icu', 'umn', 'lmn', 'cns', 'tmj',
  'bppv', 'mri', 'eeg', 'pwd', 'nicu', 'fas', 'fasd', 'aba', 'iep', 'sped', 'oa', 'ra', 'avm',
  'sah', 'ich', 'mca', 'aca', 'pca', 'uti', 'hiv', 'aids', 'sma', 'dmd',
])
function displayCase(raw: string | null | undefined, kind: 'name' | 'text' | 'dx' = 'text'): string {
  const s = (raw ?? '').trim()
  // Unicode letter classes, not [a-z]: with [a-z] the ñ in RIÑOZA was not a
  // letter, so the name split at it and rendered as "RiñOza".
  if (!s || /\p{Ll}/u.test(s)) return s
  let first = true
  return s.toLowerCase().replace(/\p{L}+/gu, (w: string, offset: number, whole: string) => {
    const isFirst = first
    first = false
    if (offset > 0 && /\d/.test(whole[offset - 1])) return w                       // 2nd, 3rd
    if ((kind === 'name' || kind === 'dx') && ROMAN_NUMERALS.has(w)) return w.toUpperCase()
    if (kind === 'dx' && (DX_ACRONYMS.has(w) || (w.length >= 2 && !/[aeiouy]/.test(w)))) return w.toUpperCase()
    if (kind !== 'name' && !isFirst && SMALL_WORDS.has(w)) return w
    return w[0].toUpperCase() + w.slice(1)
  })
}

// ── Shared control styles (match the rest of the Hub: white, light-gray rule, teal accent) ──
const GROUP_BTN = 'inline-flex items-center gap-1.5 h-[34px] px-3 text-xs font-semibold whitespace-nowrap transition-colors hover:bg-gray-50'
const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: React.CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }
const PAGE_BTN = 'w-8 h-8 inline-flex items-center justify-center rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50'
const POPOVER_STYLE: React.CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }
const SKELETON = '#E9EFED'

/** Close a popover on an outside click or Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close.current() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref])
}

/** Compact stat tile that doubles as a filter toggle. */
function StatCard({
  label, value, sub, accent, active, danger, loading, title, onClick,
}: {
  label: string; value: number; sub: string; accent: string
  active: boolean; danger?: boolean; loading?: boolean; title: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
      className="text-left rounded-xl px-4 py-3 transition-all hover:shadow-sm"
      style={{
        background: active ? (danger ? '#FEF2F2' : 'var(--pale-teal)') : '#fff',
        border: `1px solid ${active ? accent : 'var(--light-gray)'}`,
        boxShadow: active ? `inset 0 0 0 1px ${accent}` : undefined,
      }}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--mid-gray)' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
        {label}
      </p>
      {loading ? (
        <div className="h-7 w-16 rounded animate-pulse mt-1.5" style={{ background: SKELETON }} />
      ) : (
        <p className="text-2xl font-bold mt-1 tabular-nums leading-tight"
          style={{ fontFamily: 'var(--font-display)', color: danger ? '#B91C1C' : 'var(--charcoal)' }}>
          {value.toLocaleString()}
        </p>
      )}
      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>{sub}</p>
    </button>
  )
}

// ── Display value per column (used for both filter matching and sort) ─────────
function colDisplayVal(p: Patient, col: SortCol | FilterableCol): string {
  switch (col) {
    case 'name':      return `${p.lastName}${p.firstName}`.toLowerCase()
    case 'type':      return p.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult'
    case 'branch':    return patientBranchDisplay(p)
    case 'sex':       return p.sex       || ''
    case 'city':      return p.city      || ''
    case 'barangay':  return p.address   || ''
    case 'diagnosis': return p.diagnosis || ''
    case 'email':     return p.email     || ''
    case 'dob':       return p.dob       || ''
    default:          return ''
  }
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} style={{ opacity: 0.35, flexShrink: 0 }} />
  return dir === 'asc'
    ? <ChevronUp   size={11} style={{ color: 'var(--teal)', flexShrink: 0 }} />
    : <ChevronDown size={11} style={{ color: 'var(--teal)', flexShrink: 0 }} />
}

// ── Filter dropdown (rendered in-place, positioned absolute) ──────────────────
function FilterDropdown({
  values, selected, onToggle, onClearAll,
}: {
  values: string[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClearAll: () => void
}) {
  return (
    <div
      className="absolute left-0 top-full mt-1 z-50 rounded-xl py-2 min-w-[160px] max-w-[220px]"
      style={{
        background: '#fff',
        border: '1px solid var(--light-gray)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-1.5 mb-1"
        style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
          Filter
        </span>
        <button
          onClick={onClearAll}
          className="text-xs font-semibold"
          style={{ color: '#DC2626' }}
        >
          Clear
        </button>
      </div>
      {/* Values list */}
      <div className="max-h-52 overflow-y-auto px-1">
        {values.length === 0 ? (
          <p className="px-2 py-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>No values</p>
        ) : values.map((v) => (
          <label
            key={v}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.has(v)}
              onChange={() => onToggle(v)}
              className="w-3.5 h-3.5 rounded"
              style={{ accentColor: 'var(--teal)' }}
            />
            <span className="text-xs truncate" style={{ color: 'var(--charcoal)' }}>{v || '(blank)'}</span>
          </label>
        ))}
      </div>

    </div>
  )
}

// ── Extracted sub-components ─────────────────────────────────────────────────

function BranchCheckboxes({
  selected, onChange, lockedTo,
}: { selected: string[]; onChange: (b: string[]) => void; lockedTo?: string }) {
  const branches = useBranchOptions()
  return (
    <div className="flex flex-wrap gap-2">
      {branches.map((b) => {
        const active   = selected.includes(b.value)
        const disabled = !!lockedTo && b.value !== lockedTo
        return (
          <button key={b.value} type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(active ? selected.filter((x) => x !== b.value) : [...selected, b.value])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              border:     `1.5px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
              background: active ? 'var(--pale-teal)' : 'transparent',
              color:      disabled ? 'var(--light-gray)' : active ? 'var(--teal)' : 'var(--mid-gray)',
              cursor:     disabled ? 'not-allowed' : 'pointer',
              opacity:    disabled ? 0.45 : 1,
            }}>
            {active ? <CheckSquare size={13} /> : <Square size={13} />}
            {b.label}
          </button>
        )
      })}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', uppercase = true }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; uppercase?: boolean
}) {
  // Auto-uppercase all text except email and date fields
  const shouldUC = uppercase && type !== 'email' && type !== 'date'
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--mid-gray)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(shouldUC ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={{
          border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)', background: '#fff',
          textTransform: shouldUC ? 'uppercase' : 'none',
        }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ROLE_TO_BRANCH: Record<string, string> = {
  AHEA_FRONT_DESK: 'SANDBOX_EAST',
  AHGH_FRONT_DESK: 'SANDBOX_GREENHILLS',
}

export default function PatientsPage({ role = '', userEmail = '' }: { role?: string; userEmail?: string }) {
  const branchOptions = useBranchOptions()
  const isMainAdmin = userEmail.toLowerCase() === 'main@sapphireclinicseast.org'
  const isFrontDesk  = role === 'AHEA_FRONT_DESK' || role === 'AHGH_FRONT_DESK'
  const forcedBranch = ROLE_TO_BRANCH[role] ?? ''

  const [patients, setPatients]         = useState<Patient[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  // Patients matching the search but registered at another branch. Shown read-only
  // beneath the empty result, so a front desk stops short of re-creating someone
  // who already exists.
  const [outOfBranch, setOutOfBranch]   = useState<Patient[]>([])
  const [addingBranchId, setAddingBranchId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter]     = useState('')
  // Front desk now reads the whole register, so the listing defaults to every
  // branch. `forcedBranch` still seeds the ADD form, since a new patient is
  // normally registered at the desk taking them in.
  const [branchFilter, setBranchFilter] = useState('')
  const [chinoyFilter, setChinoyFilter] = useState(false)
  const [showAddForm, setShowAddForm]   = useState(false)
  const [csvFile, setCsvFile]           = useState<File | null>(null)
  // CSV rows land at every branch ticked here. Single-select was one of the two
  // paths that made interbranch patients impossible to import, forcing a second
  // patient record instead of a second branch on the same one.
  const [importBranches, setImportBranches] = useState<string[]>([forcedBranch || 'SANDBOX_EAST'])
  const [importing, setImporting]       = useState(false)
  const [importMsg, setImportMsg]       = useState('')
  const [duplicates, setDuplicates]     = useState<DuplicateEntry[]>([])

  // Front desk works this list to fill the gaps, so a patient with nothing
  // recorded is flagged rather than left to be noticed. Tags first: a record
  // tagged in the new input has `diagnoses`, older ones only the free-text
  // field, and either counts as recorded.
  const missingDiagnosis = useCallback((p: Patient) =>
    !(p.diagnoses?.length) && !p.diagnosis?.trim(), [])
  const [onlyMissingDx, setOnlyMissingDx] = useState(false)
  const [sortCol, setSortCol]           = useState<SortCol>('')
  const [sortDir, setSortDir]           = useState<SortDir>('asc')

  // ── Column filters (Excel-style) ───────────────────────────────────────────
  const [colFilters, setColFilters]     = useState<Partial<Record<FilterableCol, Set<string>>>>({})
  const [openFilterCol, setOpenFilterCol] = useState<FilterableCol | null>(null)
  const filterBtnRefs = useRef<Partial<Record<FilterableCol, HTMLButtonElement | null>>>({})

  const [exportBranches, setExportBranches] = useState<Set<string>>(
    new Set(['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE'])
  )
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const exportPanelRef = useRef<HTMLDivElement>(null)
  const importPanelRef = useRef<HTMLDivElement>(null)
  useDismiss(showExportPanel, exportPanelRef, () => setShowExportPanel(false))
  useDismiss(showImportPanel, importPanelRef, () => setShowImportPanel(false))
  const [showRegisterQr, setShowRegisterQr] = useState(false)

  const [form, setForm]           = useState({ ...EMPTY_FORM, branches: forcedBranch ? [forcedBranch] : [] })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm]   = useState({ ...EMPTY_FORM })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError]   = useState('')
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)

  // Doctor's Referral state
  const [referralUrls, setReferralUrls] = useState<Record<string, string | null>>({})
  const [referralUploading, setReferralUploading] = useState<Record<string, boolean>>({})
  // PWD ID / Senior ID state
  const [pwdIdUrls, setPwdIdUrls] = useState<Record<string, string | null>>({})
  const [pwdIdUploading, setPwdIdUploading] = useState<Record<string, boolean>>({})
  const [pwdIdInputFor, setPwdIdInputFor] = useState<string | null>(null)
  const pwdIdInputRef = useRef<HTMLInputElement>(null)
  // QR modal (shared between referral and PWD ID)
  const [qrModal, setQrModal] = useState<{
    patientId: string; patientName: string;
    qrDataUrl: string; uploadUrl: string; expiresAt: string;
    docType: 'referral' | 'pwd-id'
  } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const referralInputRef = useRef<HTMLInputElement>(null)
  const [referralInputFor, setReferralInputFor] = useState<string | null>(null)
  // Staged files for the Add Patient form (uploaded after patient creation)
  const [addReferralFile, setAddReferralFile] = useState<File | null>(null)
  const [addPwdIdFile, setAddPwdIdFile] = useState<File | null>(null)
  // Same-name matches returned by the API (409) — shown before a duplicate is made.
  const [dupMatches, setDupMatches] = useState<Array<{
    id: string; firstName: string; lastName: string; dob: string | null
    phone: string | null; email: string | null; branches: string[]; branch: string | null
  }> | null>(null)
  const addReferralInputRef = useRef<HTMLInputElement>(null)
  const addPwdIdInputRef = useRef<HTMLInputElement>(null)

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ── Persist pending duplicates across page reloads ────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pending-duplicates')
      const savedBranch = localStorage.getItem('pending-duplicates-branch')
      if (saved) setDuplicates(JSON.parse(saved))
      if (savedBranch) setImportBranches(JSON.parse(savedBranch))
    } catch {}
  }, [])

  useEffect(() => {
    if (duplicates.length > 0) {
      localStorage.setItem('pending-duplicates', JSON.stringify(duplicates))
      localStorage.setItem('pending-duplicates-branch', JSON.stringify(importBranches))
    } else {
      localStorage.removeItem('pending-duplicates')
      localStorage.removeItem('pending-duplicates-branch')
    }
  }, [duplicates, importBranches])

  // ── Close filter dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!openFilterCol) return
    function onOutside(e: MouseEvent) {
      const btn = filterBtnRefs.current[openFilterCol!]
      if (btn && !btn.closest('[data-filter-root]')?.contains(e.target as Node)) {
        setOpenFilterCol(null)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [openFilterCol])

  // ── Sorting ───────────────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    if (!col) return
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // ── Unique values per filterable column ───────────────────────────────────
  const uniqueColValues = useMemo<Partial<Record<FilterableCol, string[]>>>(() => {
    const cols: FilterableCol[] = ['type', 'branch', 'sex', 'city', 'barangay', 'diagnosis']
    const result: Partial<Record<FilterableCol, string[]>> = {}
    for (const col of cols) {
      const vals = [...new Set(patients.map((p) => colDisplayVal(p, col)).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'en-PH', { sensitivity: 'base' })
      )
      result[col] = vals
    }
    return result
  }, [patients])

  // ── Toggle a value in a column filter ─────────────────────────────────────
  function toggleColFilter(col: FilterableCol, value: string) {
    setColFilters((prev) => {
      const current = new Set(prev[col] ?? [])
      current.has(value) ? current.delete(value) : current.add(value)
      return { ...prev, [col]: current }
    })
  }

  function clearColFilter(col: FilterableCol) {
    setColFilters((prev) => {
      const next = { ...prev }
      delete next[col]
      return next
    })
    setOpenFilterCol(null)
  }

  const hasColFilters = Object.values(colFilters).some((s) => s && s.size > 0)

  // ── Sorted + filtered patient list ────────────────────────────────────────
  const displayPatients = useMemo(() => {
    let result = patients

    // Apply column filters
    for (const [col, values] of Object.entries(colFilters) as [FilterableCol, Set<string>][]) {
      if (!values || values.size === 0) continue
      result = result.filter((p) => values.has(colDisplayVal(p, col)))
    }

    // Chinoy surname filter
    if (chinoyFilter) result = result.filter((p) => isLikelyChinoy(p.lastName))
    // Narrow to the gap rather than hunting red rows down a 3,000-row table —
    // two thirds of records have no diagnosis, so highlighting alone would not
    // be workable.
    if (onlyMissingDx) result = result.filter(missingDiagnosis)

    // Apply sort
    if (!sortCol) return result
    return [...result].sort((a, b) => {
      let va = '', vb = ''
      switch (sortCol) {
        case 'name':      va = `${a.lastName}${a.firstName}`;   vb = `${b.lastName}${b.firstName}`;   break
        case 'type':      va = a.patientType;                    vb = b.patientType;                    break
        case 'branch':    va = patientBranchDisplay(a);          vb = patientBranchDisplay(b);          break
        case 'sex':       va = a.sex       || '';               vb = b.sex       || '';                break
        case 'city':      va = a.city      || '';               vb = b.city      || '';                break
        case 'barangay':  va = a.address   || '';               vb = b.address   || '';                break
        case 'diagnosis': va = a.diagnosis || '';               vb = b.diagnosis || '';                break
        case 'email':     va = a.email     || '';               vb = b.email     || '';                break
        case 'dob':       va = a.dob       || '';               vb = b.dob       || '';                break
      }
      const c = va.localeCompare(vb, 'en-PH', { sensitivity: 'base' })
      return sortDir === 'asc' ? c : -c
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, sortCol, sortDir, colFilters, chinoyFilter, onlyMissingDx, missingDiagnosis])

  // Reset to page 1 whenever the filtered/sorted list changes
  useEffect(() => { setPage(1) }, [displayPatients])

  // Notification deep link: /patients?highlight=<id>. The list is paginated
  // client-side, so the row is usually not on page 1 — jumping to its page is
  // the difference between "took me to the patient" and "took me to a list".
  // Declared after the reset above so it wins on the same render.
  const searchParams = useSearchParams()
  const highlightedId = useRef<string | null>(null)
  useEffect(() => {
    const id = searchParams.get('highlight')
    if (!id || displayPatients.length === 0) return
    if (highlightedId.current === id) return
    const idx = displayPatients.findIndex((p: { id: string }) => p.id === id)
    // Not in the current view (filtered out, or on another branch) — say nothing
    // rather than jumping somewhere arbitrary.
    if (idx === -1) return
    highlightedId.current = id
    setPage(Math.floor(idx / pageSize) + 1)
    return flashRow(id)
  }, [searchParams, displayPatients, pageSize])

  // ── Data fetching ─────────────────────────────────────────────────────────
  // Every fetch takes a ticket, and only the newest may write to state.
  //
  // Searching is server-side and fired on each keystroke, so typing "aurora"
  // starts six overlapping requests. The early, broad ones match thousands of
  // patients and are far slower than the narrow one that follows, so "a"
  // routinely landed AFTER "aurora" and overwrote it — the screen then listed
  // names beginning with A and looked like the search was broken. It wasn't:
  // the right rows arrived and were replaced by stale ones.
  const fetchSeq = useRef(0)

  async function fetchPatients() {
    const seq = ++fetchSeq.current
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.set('search', search)
      if (typeFilter)   params.set('type', typeFilter)
      if (branchFilter) params.set('branch', branchFilter)
      const res  = await fetch(`/api/patients?${params}`)
      const data = await res.json()
      if (seq !== fetchSeq.current) return          // a later keystroke owns the list now
      setPatients(data.patients || [])
      // Only ever populated for a branch-locked user whose scoped search found
      // nothing — see the cross-branch note in /api/patients.
      setOutOfBranch(data.outOfBranch || [])
    } catch {
      if (seq !== fetchSeq.current) return
      setPatients([])
      setOutOfBranch([])
    } finally {
      // Only the newest request may clear the spinner, or an abandoned one
      // reports "done" while the current search is still in flight.
      if (seq === fetchSeq.current) setLoading(false)
    }
  }

  // Debounced while typing, immediate for the filter dropdowns: a search fires
  // once the typing stops rather than once per letter. The ticket above is what
  // makes it CORRECT; this is what stops six requests being made at all.
  useEffect(() => {
    const t = setTimeout(() => { fetchPatients() }, search ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, branchFilter])

  /** Attach this front desk's own branch to a patient already registered elsewhere. */
  async function addMyBranch(patientId: string) {
    if (!forcedBranch) return
    setAddingBranchId(patientId)
    try {
      const res = await fetch('/api/patients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: patientId, addBranch: forcedBranch }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Could not add this branch')
        return
      }
      // Re-running the search moves them out of outOfBranch and into the real list.
      await fetchPatients()
    } finally {
      setAddingBranchId(null)
    }
  }

  // ── Add / Edit / Delete ───────────────────────────────────────────────────
  async function handleAddPatient(e: React.FormEvent, confirmDuplicate = false) {
    e.preventDefault()
    const base = forcedBranch ? { ...form, branches: [forcedBranch] } : form
    const payload = confirmDuplicate ? { ...base, confirmDuplicate: true } : base
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    // Someone with this exact name already exists — show them before creating
    // a second record rather than after.
    if (res.status === 409) {
      const data = await res.json().catch(() => null)
      if (data?.duplicateWarning) { setDupMatches(data.matches ?? []); return }
    }
    setDupMatches(null)
    if (res.ok) {
      const { patient: created } = await res.json()
      if (created?.id) {
        // Upload staged referral if attached
        if (addReferralFile) {
          const fd = new FormData(); fd.append('file', addReferralFile)
          await fetch(`/api/patients/${created.id}/referral`, { method: 'POST', body: fd }).catch(() => {})
        }
        // Upload staged PWD ID / Senior ID if attached
        if (addPwdIdFile) {
          const fd = new FormData(); fd.append('file', addPwdIdFile)
          await fetch(`/api/patients/${created.id}/pwd-id`, { method: 'POST', body: fd }).catch(() => {})
        }
      }
    }
    setShowAddForm(false)
    setForm({ ...EMPTY_FORM, branches: forcedBranch ? [forcedBranch] : [] })
    setAddReferralFile(null)
    setAddPwdIdFile(null)
    fetchPatients()
  }

  // ── Referral helpers ──────────────────────────────────────────────────────
  const uploadReferral = useCallback(async (patientId: string, file: File) => {
    setReferralUploading(s => ({ ...s, [patientId]: true }))
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/patients/${patientId}/referral`, { method: 'POST', body: form })
    const d = await res.json()
    if (res.ok) setReferralUrls(s => ({ ...s, [patientId]: d.referralUrl }))
    else alert(d.error ?? 'Upload failed')
    setReferralUploading(s => ({ ...s, [patientId]: false }))
  }, [])

  const removeReferral = useCallback(async (patientId: string) => {
    if (!confirm('Remove this doctor\'s referral? This cannot be undone.')) return
    const res = await fetch(`/api/patients/${patientId}/referral`, { method: 'DELETE' })
    if (res.ok) setReferralUrls(s => ({ ...s, [patientId]: null }))
  }, [])

  const openQr = useCallback(async (patientId: string) => {
    setQrLoading(true)
    const res = await fetch(`/api/patients/${patientId}/referral/token`, { method: 'POST' })
    const d = await res.json()
    setQrLoading(false)
    if (res.ok) setQrModal({ ...d, docType: 'referral' })
    else alert(d.error ?? 'Could not generate QR code')
  }, [])

  // ── PWD ID / Senior ID helpers ────────────────────────────────────────────
  const uploadPwdId = useCallback(async (patientId: string, file: File) => {
    setPwdIdUploading(s => ({ ...s, [patientId]: true }))
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch(`/api/patients/${patientId}/pwd-id`, { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok) setPwdIdUrls(s => ({ ...s, [patientId]: d.pwdIdUrl }))
    else alert(d.error ?? 'Upload failed')
    setPwdIdUploading(s => ({ ...s, [patientId]: false }))
  }, [])

  const removePwdId = useCallback(async (patientId: string) => {
    if (!confirm('Remove this PWD ID / Senior ID photo? This cannot be undone.')) return
    const res = await fetch(`/api/patients/${patientId}/pwd-id`, { method: 'DELETE' })
    if (res.ok) setPwdIdUrls(s => ({ ...s, [patientId]: null }))
  }, [])

  const openPwdIdQr = useCallback(async (patientId: string) => {
    setQrLoading(true)
    const res = await fetch(`/api/patients/${patientId}/pwd-id/token`, { method: 'POST' })
    const d = await res.json()
    setQrLoading(false)
    if (res.ok) setQrModal({ ...d, docType: 'pwd-id' })
    else alert(d.error ?? 'Could not generate QR code')
  }, [])

  function openEdit(p: Patient) {
    setEditingId(p.id)
    // Sync referral and PWD ID URLs from patient record
    setReferralUrls(s => ({ ...s, [p.id]: p.referralUrl ?? null }))
    setPwdIdUrls(s => ({ ...s, [p.id]: p.pwdIdUrl ?? null }))
    setEditForm({
      firstName:   p.firstName   ?? '',
      lastName:    p.lastName    ?? '',
      email:       p.email       ?? '',
      phone:       p.phone       ?? '',
      dob:         p.dob         ? p.dob.slice(0, 10) : '',
      patientType: p.patientType,
      branches:    p.branches?.length ? p.branches : (p.branch ? [p.branch] : []),
      sex:         p.sex         ?? '',
      civilStatus: p.civilStatus ?? '',
      religion:    p.religion    ?? '',
      nationality: p.nationality ?? '',
      address:     p.address     ?? '',
      city:        p.city        ?? '',
      diagnosis:   p.diagnosis   ?? '',
      // Records saved before tagging have only the free-text field. Splitting
      // it gives the editor something to work with instead of one long tag.
      diagnoses:   p.diagnoses?.length ? p.diagnoses : splitLegacyDiagnosis(p.diagnosis),
      notes:       p.notes       ?? '',
      firstDayOfConsult: p.firstDayOfConsult ? p.firstDayOfConsult.slice(0, 10) : '',
      pwdSeniorId: p.pwdSeniorId ?? '',
      unsubscribed: !!p.unsubscribed,
      smsUnsubscribed: !!p.smsUnsubscribed,
    })
    setEditError('')
  }
  function closeEdit() { setEditingId(null); setEditError('') }

  async function saveEdit() {
    if (!editingId) return
    setEditSaving(true); setEditError('')
    try {
      const res  = await fetch('/api/patients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      closeEdit(); fetchPatients()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setEditSaving(false) }
  }

  async function deletePatient(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the database? This cannot be undone.`)) return
    await fetch(`/api/patients?id=${id}`, { method: 'DELETE' })
    fetchPatients()
  }

  // ── CSV Import ────────────────────────────────────────────────────────────
  async function handleCsvImport() {
    if (!csvFile) return
    setImporting(true)
    const fd = new FormData()
    fd.append('file', csvFile)
    fd.append('branches', JSON.stringify(importBranches))
    const res  = await fetch('/api/patients', { method: 'POST', body: fd })
    const data = await res.json()
    setImporting(false)
    if (data.duplicates?.length > 0) {
      setDuplicates((prev) => {
        const existingIds = new Set(prev.map((d) => d.existing.id))
        const newDups = (data.duplicates as DuplicateEntry[]).filter((d) => !existingIds.has(d.existing.id))
        return [...prev, ...newDups]
      })
      setShowDuplicatesModal(true)
      setImportMsg(`✓ Imported ${data.imported} patient(s). ${data.duplicates.length} possible duplicate(s) need review.`)
    } else {
      setImportMsg(`✓ Imported ${data.imported} patient(s)`)
      fetchPatients()
      setTimeout(() => setImportMsg(''), 5000)
    }
    setCsvFile(null)
  }

  async function acceptDuplicate(index: number) {
    const d = duplicates[index]
    const keys = Object.keys(d.csvRow)
    const csvContent = [
      keys.join(','),
      keys.map((k) => `"${String(d.csvRow[k] ?? '').replace(/"/g, '""')}"`).join(','),
    ].join('\n')
    const tempFile = new File([csvContent], 'accept.csv', { type: 'text/csv' })
    const fd = new FormData()
    fd.append('file', tempFile)
    fd.append('branches', JSON.stringify(importBranches))
    fd.append('force', 'true')
    setImporting(true)
    await fetch('/api/patients', { method: 'POST', body: fd })
    setImporting(false)
    setDuplicates((prev) => prev.filter((_, i) => i !== index))
    fetchPatients()
  }

  function rejectDuplicate(index: number) {
    setDuplicates((prev) => prev.filter((_, i) => i !== index))
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  function handleExport() {
    const branches = Array.from(exportBranches)
    const params   = new URLSearchParams({ export: 'csv' })
    if (branches.length > 0 && branches.length < 3) params.set('branches', branches.join(','))
    const a = document.createElement('a'); a.href = `/api/patients?${params}`; a.download = ''; a.click()
    setShowExportPanel(false)
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  // Counted over the whole roster, not the current filter — the badge is the
  // size of the backlog, and would otherwise drop to 0 the moment the filter
  // is on and read as "done".
  const missingDxCount = patients.filter(missingDiagnosis).length
  const pediatricCount = patients.filter((p) => p.patientType === 'PEDIATRIC').length
  const adultCount     = patients.filter((p) => p.patientType === 'ADULT').length

  // ── Table column config ───────────────────────────────────────────────────
  /* Certificate counts per patient, for the badge on the row action. A count
     map rather than the rows themselves, so opening the directory does not
     pull every certificate into the browser. */
  /* Row click opens a read-only summary. The pencil still opens the edit form —
     a row that silently became editable on a stray click is how a diagnosis gets
     overwritten by someone who only meant to look. */
  const [viewing, setViewing] = useState<Patient | null>(null)
  const [certCounts, setCertCounts] = useState<Record<string, number>>({})
  const loadCertCounts = useCallback(() => {
    fetch('/api/patients/certificates?counts=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.counts) setCertCounts(d.counts) })
      // A directory that still lists patients beats one that fails over a badge.
      .catch(() => {})
  }, [])
  useEffect(() => { loadCertCounts() }, [loadCertCounts])

  const COLS: { key: SortCol; label: string; filterable?: FilterableCol }[] = [
    { key: 'name',      label: 'Name'      },
    { key: 'type',      label: 'Type',      filterable: 'type'      },
    { key: 'branch',    label: 'Branch',    filterable: 'branch'    },
    { key: 'sex',       label: 'Sex',       filterable: 'sex'       },
    { key: 'city',      label: 'City',      filterable: 'city'      },
    { key: 'diagnosis', label: 'Diagnosis', filterable: 'diagnosis' },
    { key: 'email',     label: 'Email'      },
    { key: 'dob',       label: 'Birthday'   },
    { key: '',          label: ''           },
  ]

  // ── Toolbar / empty-state helpers ─────────────────────────────────────────
  const anyFilter = !!(search || typeFilter || branchFilter || chinoyFilter || onlyMissingDx || hasColFilters)
  function clearAllFilters() {
    setSearch(''); setTypeFilter(''); setBranchFilter('')
    setChinoyFilter(false); setOnlyMissingDx(false); setColFilters({})
    setOpenFilterCol(null)
  }
  const pct = (n: number) => (patients.length ? Math.round((n / patients.length) * 100) : 0)
  const branchFilterLabel = branchOptions.find((b) => b.value === branchFilter)?.label || branchLabel(branchFilter)
  const pageCount = Math.max(1, Math.ceil(displayPatients.length / pageSize))

  return (
    <div className="max-w-6xl space-y-5">
      {/* ── Header: title on the left, every page-level action in one cluster on the right ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Patient Management
          </p>
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Patient CRM
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Every registered patient across the branches. Click a row to view, or use the row icons to edit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Secondary actions, joined into one group. No overflow-hidden on the
              group: the Import / Export panels hang out of it. */}
          <div className="inline-flex items-stretch rounded-lg bg-white"
            style={{ border: '1px solid var(--light-gray)' }}>
            <button onClick={() => setShowRegisterQr(true)}
              className={`${GROUP_BTN} rounded-l-lg`}
              style={{ color: 'var(--charcoal)' }}
              title="Show QR code for patients to self-register">
              <QrCode size={14} style={{ color: 'var(--teal)' }} />
              <span className="hidden sm:inline">Patient QR</span>
            </button>

            <div className="relative" ref={importPanelRef}>
              <button onClick={() => { setShowImportPanel((v) => !v); setShowExportPanel(false) }}
                className={GROUP_BTN}
                style={{
                  color: 'var(--charcoal)', borderLeft: '1px solid var(--light-gray)',
                  background: showImportPanel ? 'var(--pale-teal)' : undefined,
                }}
                title="Import patients from a CSV file"
                aria-expanded={showImportPanel}>
                <Upload size={14} style={{ color: 'var(--teal)' }} />
                <span className="hidden sm:inline">Import CSV</span>
                {csvFile && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--teal)' }} title="A file is ready to import" />}
                <ChevronDown size={12} style={{ color: 'var(--mid-gray)' }} />
              </button>
              {showImportPanel && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-30 rounded-xl p-4 space-y-3"
                  style={{ ...POPOVER_STYLE, width: 'min(21rem, calc(100vw - 2rem))' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Import patients from CSV</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                      {isFrontDesk
                        ? `Rows are added to ${branchLabel(forcedBranch) || 'your branch'}.`
                        : 'Rows are added to every branch ticked below.'}
                    </p>
                  </div>
                  {!isFrontDesk && (
                    <BranchCheckboxes
                      selected={importBranches}
                      onChange={setImportBranches}
                      lockedTo={forcedBranch || undefined}
                    />
                  )}
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{ border: '1.5px dashed var(--light-gray)', color: csvFile ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                    <FileText size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                    <span className="truncate">{csvFile ? csvFile.name : 'Choose a .csv file…'}</span>
                    <input type="file" accept=".csv" className="hidden"
                      onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
                  </label>
                  <button onClick={async () => { await handleCsvImport(); setShowImportPanel(false) }}
                    disabled={!csvFile || importing}
                    className="w-full h-9 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {importing ? 'Importing…' : csvFile ? `Import "${csvFile.name}"` : 'Import'}
                  </button>
                </div>
              )}
            </div>

            {/* Export — restricted to the main admin account */}
            {isMainAdmin && (
              <div className="relative" ref={exportPanelRef}>
                <button onClick={() => { setShowExportPanel(!showExportPanel); setShowImportPanel(false) }}
                  className={GROUP_BTN}
                  style={{
                    color: 'var(--charcoal)', borderLeft: '1px solid var(--light-gray)',
                    background: showExportPanel ? 'var(--pale-teal)' : undefined,
                  }}
                  title="Download the patient list as CSV"
                  aria-expanded={showExportPanel}>
                  <Download size={14} style={{ color: 'var(--teal)' }} />
                  <span className="hidden sm:inline">Export CSV</span>
                  <ChevronDown size={12} style={{ color: 'var(--mid-gray)' }} />
                </button>
                {showExportPanel && (
                  <div className="absolute right-0 top-full mt-2 z-30 rounded-xl p-4 space-y-3 w-60"
                    style={POPOVER_STYLE}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                      Download Branches
                    </p>
                    {branchOptions.map((b) => (
                      <label key={b.value} className="flex items-center gap-2 cursor-pointer">
                        <span onClick={() => setExportBranches((prev) => {
                          const next = new Set(prev)
                          if (next.has(b.value)) next.delete(b.value)
                          else next.add(b.value)
                          return next
                        })}>
                          {exportBranches.has(b.value)
                            ? <CheckSquare size={16} style={{ color: 'var(--teal)' }} />
                            : <Square size={16} style={{ color: 'var(--mid-gray)' }} />}
                        </span>
                        <span className="text-sm" style={{ color: 'var(--charcoal)' }}>{b.label}</span>
                      </label>
                    ))}
                    <button onClick={handleExport} disabled={exportBranches.size === 0}
                      className="w-full h-9 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      Download
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowDuplicatesModal(true)}
              className={GROUP_BTN}
              title={duplicates.length > 0
                ? `${duplicates.length} possible duplicate${duplicates.length !== 1 ? 's' : ''} from a CSV import need review`
                : 'Check for Duplicates'}
              style={{
                borderLeft: '1px solid var(--light-gray)',
                background: duplicates.length > 0 ? '#FEF3C7' : undefined,
                color: duplicates.length > 0 ? '#B45309' : 'var(--charcoal)',
              }}>
              <AlertTriangle size={14} style={{ color: duplicates.length > 0 ? '#B45309' : 'var(--teal)' }} />
              <span className="hidden sm:inline">Duplicates</span>
              {duplicates.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                  style={{ background: '#F59E0B', color: '#fff' }}>
                  {duplicates.length}
                </span>
              )}
            </button>

            <CertificateSettingsButton
              className={`${GROUP_BTN} rounded-r-lg`}
              style={{ color: 'var(--charcoal)', borderLeft: '1px solid var(--light-gray)' }}>
              <Settings size={14} style={{ color: 'var(--teal)' }} />
              <span className="hidden sm:inline">Certificate Settings</span>
            </CertificateSettingsButton>
          </div>

          <button onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--teal)', fontFamily: 'var(--font-display)' }}>
            <Plus size={15} />
            Add Patient
          </button>
        </div>
      </div>

      {/* ── Stats — each card is also a filter ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total patients"
          value={patients.length}
          sub={[
            typeFilter ? (typeFilter === 'PEDIATRIC' ? 'Pediatric only' : 'Adult only') : 'All types',
            branchFilter ? branchFilterLabel : 'all branches',
          ].join(' · ')}
          accent="var(--teal)"
          active={!typeFilter && !onlyMissingDx}
          loading={loading && patients.length === 0}
          title="Show every patient"
          onClick={() => { setTypeFilter(''); setOnlyMissingDx(false) }}
        />
        <StatCard
          label="Pediatric"
          value={pediatricCount}
          sub={patients.length ? `${pct(pediatricCount)}% of patients` : '—'}
          accent="var(--bright-teal)"
          active={typeFilter === 'PEDIATRIC'}
          loading={loading && patients.length === 0}
          title="Show pediatric patients only"
          onClick={() => setTypeFilter((t) => (t === 'PEDIATRIC' ? '' : 'PEDIATRIC'))}
        />
        <StatCard
          label="Adult"
          value={adultCount}
          sub={patients.length ? `${pct(adultCount)}% of patients` : '—'}
          accent="var(--gold)"
          active={typeFilter === 'ADULT'}
          loading={loading && patients.length === 0}
          title="Show adult patients only"
          onClick={() => setTypeFilter((t) => (t === 'ADULT' ? '' : 'ADULT'))}
        />
        <StatCard
          label="Missing diagnosis"
          value={missingDxCount}
          sub={onlyMissingDx
            ? 'Showing these only — click to undo'
            : missingDxCount > 0 ? `${pct(missingDxCount)}% of records — click to review` : 'Every record has one'}
          accent="#DC2626"
          danger={missingDxCount > 0}
          active={onlyMissingDx}
          loading={loading && patients.length === 0}
          title="Show only patients with no diagnosis recorded"
          onClick={() => setOnlyMissingDx((v) => !v)}
        />
      </div>

      {showRegisterQr && (
        <PatientRegisterQrModal
          forcedBranch={forcedBranch}
          onClose={() => setShowRegisterQr(false)}
        />
      )}

      {/* Import message */}
      {importMsg && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl"
          style={{ background: 'var(--pale-teal)', color: 'var(--teal)', border: '1px solid var(--light-gray)' }}>
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span className="flex-1">{importMsg}</span>
          <button onClick={() => setImportMsg('')} className="p-0.5 rounded hover:bg-white/60" title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Duplicates modal ──────────────────────────────────────────────── */}
      {showDuplicatesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDuplicatesModal(false) }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
            style={{ background: '#fff', maxHeight: '85vh' }}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                    Check for Duplicates
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                    {duplicates.length > 0
                      ? `${duplicates.length} possible duplicate${duplicates.length !== 1 ? 's' : ''} pending review. Compare each entry and Accept or Decline.`
                      : 'No pending duplicates — all clear.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {duplicates.length > 0 && (
                  <button
                    onClick={() => setDuplicates([])}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                    Dismiss All
                  </button>
                )}
                <button
                  onClick={() => setShowDuplicatesModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100">
                  <X size={18} style={{ color: 'var(--mid-gray)' }} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {duplicates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--pale-teal)' }}>
                    <CheckCircle size={22} style={{ color: 'var(--teal)' }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--mid-gray)' }}>
                    No duplicates to review
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {duplicates.map((d, i) => {
                    const newFirst   = d.csvRow['First Name'] || d.csvRow['first name'] || d.csvRow['firstName'] || ''
                    const newLast    = d.csvRow['Last Name']  || d.csvRow['last name']  || d.csvRow['lastName']  || ''
                    const newName    = newFirst || newLast
                      ? `${newFirst} ${newLast}`.trim()
                      : d.csvRow['Name'] || d.csvRow['name'] || '—'
                    const newDob     = d.csvRow['Birthday'] || d.csvRow['birthday'] || d.csvRow['DOB'] || d.csvRow['dob'] || d.csvRow['Date of Birth'] || ''
                    const newDx      = d.csvRow['Diagnosis_Group'] || d.csvRow['Diagnosis Group'] || d.csvRow['Diagnosis'] || d.csvRow['diagnosis'] || ''
                    const newCity    = d.csvRow['City'] || d.csvRow['city'] || ''
                    const existingName = `${d.existing.firstName} ${d.existing.lastName}`.trim()
                    const existingDob  = d.existing.dob
                      ? new Date(d.existing.dob).toLocaleDateString('en-PH')
                      : '—'

                    return (
                      <div key={i} className="rounded-xl overflow-hidden"
                        style={{ border: '1px solid rgba(201,162,39,0.35)', background: '#fff' }}>
                        <div className="grid grid-cols-2 divide-x"
                          style={{ borderColor: 'rgba(201,162,39,0.25)' }}>
                          <div className="px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-widest mb-1.5"
                              style={{ color: '#B45309' }}>New (from CSV)</p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{newName}</p>
                            {newDob  && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>DOB: {newDob}</p>}
                            {newCity && <p className="text-xs"        style={{ color: 'var(--mid-gray)' }}>City: {newCity}</p>}
                            {newDx   && <p className="text-xs"        style={{ color: 'var(--mid-gray)' }}>Dx: {newDx}</p>}
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-widest mb-1.5"
                              style={{ color: 'var(--teal)' }}>Existing in DB</p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{existingName}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>DOB: {existingDob}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-4 py-2.5"
                          style={{ background: '#FAFAFA', borderTop: '1px solid rgba(201,162,39,0.2)' }}>
                          <button
                            onClick={() => rejectDuplicate(i)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: '#FEE2E2', color: '#DC2626' }}>
                            <XCircle size={13} />
                            Decline
                          </button>
                          <button
                            onClick={() => acceptDuplicate(i)}
                            disabled={importing}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                            <CheckCircle size={13} />
                            {importing ? 'Importing…' : 'Accept'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-3 border-t flex items-center justify-between"
              style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                Accept imports the entry as a new record. Decline skips it.
              </p>
              <button
                onClick={() => setShowDuplicatesModal(false)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add patient form ──────────────────────────────────────────────── */}
      {/* Same-name warning — shown instead of silently creating a duplicate.
          Deliberately blocks on the FIRST attempt only; genuine namesakes are
          created by confirming past it. */}
      {dupMatches && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
             onClick={() => setDupMatches(null)}>
          <div className="bg-white rounded-xl w-full max-w-[560px] shadow-2xl overflow-hidden"
               onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200" style={{ background: '#FEF3C7' }}>
              <h3 className="text-sm font-extrabold" style={{ color: '#92400E' }}>
                {dupMatches.length === 1 ? 'A patient with this name already exists' : 'Patients with this name already exist'}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: '#92400E' }}>
                Check whether this is the same person before adding a new record. Matches are searched across both branches.
              </p>
            </div>
            <div className="max-h-[45vh] overflow-y-auto">
              {dupMatches.map(m => (
                <div key={m.id} className="px-5 py-3 border-b border-gray-100 last:border-b-0">
                  <div className="text-sm font-semibold text-gray-900">{m.lastName}, {m.firstName}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {m.dob ? `DOB ${new Date(m.dob).toISOString().split('T')[0]}` : 'No DOB on file'}
                    {m.phone ? ` · ${m.phone}` : ''}
                    {m.email ? ` · ${m.email}` : ''}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {(m.branches?.length ? m.branches : (m.branch ? [m.branch] : [])).map(b => (
                      <span key={b} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: b === 'SANDBOX_GREENHILLS' ? '#ede9fe' : '#d1fae5',
                                 color: b === 'SANDBOX_GREENHILLS' ? '#5b21b6' : '#065f46' }}>
                        {branchLabel(b)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-2 justify-end border-t border-gray-200 bg-gray-50">
              <button type="button" onClick={() => setDupMatches(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 bg-white text-gray-700">
                Cancel — use the existing record
              </button>
              <button type="button"
                onClick={e => { setDupMatches(null); handleAddPatient(e as unknown as React.FormEvent, true) }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#B45309' }}>
                Different person — add anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl p-6" style={{ background: '#fff', border: '1px solid var(--teal)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-sm"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Add New Patient
            </h2>
            <button onClick={() => setShowAddForm(false)}>
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
          </div>
          <form onSubmit={handleAddPatient} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name"            value={form.firstName}    onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
              <Field label="Last Name"             value={form.lastName}     onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
              <Field label="Email" type="email"    value={form.email}        onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Field label="Cellphone No."         value={form.phone}        onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              <Field label="Date of Birth" type="date" value={form.dob}      onChange={(v) => setForm((f) => ({ ...f, dob: v }))} />
              <Field label="1st Day of Consult" type="date" value={form.firstDayOfConsult} onChange={(v) => setForm((f) => ({ ...f, firstDayOfConsult: v }))} placeholder="Leave blank to use 1st recorded session" />
              <Field label="Sex"                   value={form.sex}          onChange={(v) => setForm((f) => ({ ...f, sex: v }))} placeholder="Male / Female" />
              <Field label="Barangay / Address"    value={form.address}      onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
              <Field label="City"                  value={form.city}         onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
              <DiagnosisTagInput
                value={form.diagnoses}
                uppercase
                hint="One tag per condition — type to search, Enter to add. Anything not on the list is still accepted."
                onChange={(next) => setForm((f) => ({
                  ...f,
                  diagnoses: next,
                  // Kept in step so the table column, CSV export and every other
                  // reader of the single field stay correct without being touched.
                  diagnosis: joinDiagnosisTags(next),
                }))}
              />
              <Field label="Civil Status"          value={form.civilStatus}  onChange={(v) => setForm((f) => ({ ...f, civilStatus: v }))} />
              <Field label="Religion"              value={form.religion}     onChange={(v) => setForm((f) => ({ ...f, religion: v }))} />
              <Field label="Nationality"           value={form.nationality}  onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} />
              <Field label="PWD/Senior ID Number"  value={form.pwdSeniorId}  onChange={(v) => setForm((f) => ({ ...f, pwdSeniorId: v }))} placeholder="Optional — for discount eligibility" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--mid-gray)' }}>Branch(es)</label>
              <BranchCheckboxes
                selected={form.branches}
                onChange={(b) => setForm((f) => ({ ...f, branches: b }))}
                lockedTo={forcedBranch || undefined}
              />
            </div>

            {/* ── Doctor's Referral (add form) ── */}
            <div className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--teal)' }}>
                Doctor&apos;s Referral <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </p>
              {addReferralFile ? (
                <div className="flex items-center gap-2">
                  <FileText size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                  <span className="text-xs truncate flex-1" style={{ color: 'var(--charcoal)' }}>{addReferralFile.name}</span>
                  <button type="button" onClick={() => setAddReferralFile(null)}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                    Remove
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => addReferralInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <Upload size={13} /> Upload from Device
                </button>
              )}
            </div>

            {/* ── PWD ID / Senior ID (add form) ── */}
            <div className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--teal)' }}>
                PWD ID / Senior ID Photo <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </p>
              {addPwdIdFile ? (
                <div className="flex items-center gap-2">
                  <FileText size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                  <span className="text-xs truncate flex-1" style={{ color: 'var(--charcoal)' }}>{addPwdIdFile.name}</span>
                  <button type="button" onClick={() => setAddPwdIdFile(null)}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                    Remove
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => addPwdIdInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <Upload size={13} /> Upload from Device
                </button>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => { setShowAddForm(false); setAddReferralFile(null); setAddPwdIdFile(null) }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--teal)', color: '#fff' }}>
                Save Patient
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Patient table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        {/* Toolbar: every list filter on one row, the count on the right */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-3"
          style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--mid-gray)' }} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              aria-label="Search patients"
              className={`${CONTROL} w-full pl-9 pr-8`}
              style={CONTROL_STYLE} />
            {search && (
              <button onClick={() => setSearch('')} title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100">
                <X size={13} style={{ color: 'var(--mid-gray)' }} />
              </button>
            )}
          </div>

          {/* Type filter */}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Patient type" className={CONTROL}
            style={{ ...CONTROL_STYLE, borderColor: typeFilter ? 'var(--teal)' : 'var(--light-gray)' }}>
            <option value="">All Types</option>
            <option value="PEDIATRIC">Pediatric</option>
            <option value="ADULT">Adult</option>
          </select>

          {/* Branch filter — shown to everyone. Front desk reads across branches so
              they can find a patient registered at the other one instead of
              creating a duplicate. */}
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            aria-label="Branch" className={CONTROL}
            style={{ ...CONTROL_STYLE, borderColor: branchFilter ? 'var(--teal)' : 'var(--light-gray)' }}>
            <option value="">All Branches</option>
            {branchOptions.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>

          {/* Filipino-Chinese surname filter */}
          <button
            onClick={() => setChinoyFilter((v) => !v)}
            aria-pressed={chinoyFilter}
            title="Show only likely Filipino-Chinese surnames"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: chinoyFilter ? '#E8A020' : '#fff',
              color: chinoyFilter ? '#fff' : '#B7791F',
              border: `1px solid ${chinoyFilter ? '#E8A020' : 'var(--light-gray)'}`,
            }}
          >
            <Star size={13} style={{ color: chinoyFilter ? '#fff' : '#E8A020' }} />
            Filipino-Chinese
          </button>

          {onlyMissingDx && (
            <button onClick={() => setOnlyMissingDx(false)}
              title="Stop showing only patients with no diagnosis"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
              <AlertTriangle size={12} />
              No diagnosis only
              <X size={12} />
            </button>
          )}

          {anyFilter && (
            <button onClick={clearAllFilters}
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-semibold hover:bg-gray-50"
              style={{ color: 'var(--teal)' }}>
              <X size={12} />
              Clear filters
            </button>
          )}

          <span className="ml-auto text-xs whitespace-nowrap pl-2" style={{ color: 'var(--mid-gray)' }}>
            {loading ? 'Loading…' : (
              <>
                <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                  {displayPatients.length.toLocaleString()}
                </span>
                {displayPatients.length !== patients.length && <> of {patients.length.toLocaleString()}</>}
                {' '}{patients.length === 1 ? 'patient' : 'patients'}
                {hasColFilters && ' · column filters on'}
              </>
            )}
          </span>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--light-gray)', background: '#F8FAF9' }}>
              {COLS.map(({ key, label, filterable }) => {
                const filterActive = filterable && (colFilters[filterable]?.size ?? 0) > 0
                return (
                  <th
                    key={key || '_actions'}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      color:      sortCol === key && key ? 'var(--teal)' : 'var(--mid-gray)',
                      whiteSpace: 'nowrap',
                      position:   'relative',
                    }}>
                    <span className={`flex items-center gap-1 ${key ? '' : 'justify-end'}`}>
                      {/* Sort clickable label */}
                      {key ? (
                        <button
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-1 cursor-pointer select-none hover:opacity-80"
                          title={`Sort by ${label.toLowerCase()}`}
                        >
                          {label}
                          <SortIcon active={sortCol === key} dir={sortDir} />
                        </button>
                      ) : <span className="sr-only">Actions</span>}

                      {/* Filter button (only for filterable columns) */}
                      {filterable && (
                        <div className="relative" data-filter-root>
                          <button
                            ref={(el) => { filterBtnRefs.current[filterable] = el }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenFilterCol(openFilterCol === filterable ? null : filterable)
                            }}
                            title={filterActive ? `Filtering ${label.toLowerCase()} — click to change` : `Filter ${label.toLowerCase()}`}
                            className="ml-0.5 p-1 rounded transition-colors hover:bg-gray-100"
                            style={{
                              color: filterActive ? 'var(--teal)' : 'var(--mid-gray)',
                              background: filterActive ? 'var(--pale-teal)' : 'transparent',
                            }}
                          >
                            <ListFilter size={11} />
                          </button>

                          {/* Dropdown */}
                          {openFilterCol === filterable && (
                            <FilterDropdown
                              values={uniqueColValues[filterable] ?? []}
                              selected={colFilters[filterable] ?? new Set()}
                              onToggle={(v) => toggleColFilter(filterable, v)}
                              onClearAll={() => clearColFilter(filterable)}
                            />
                          )}
                        </div>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Skeleton rows, so the table keeps its shape while the list loads.
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} style={{ borderBottom: '1px solid var(--light-gray)' }} aria-hidden>
                  <td className="px-4 py-3">
                    <div className="h-3 w-36 rounded animate-pulse" style={{ background: SKELETON }} />
                    <div className="h-2.5 w-24 rounded animate-pulse mt-2" style={{ background: SKELETON }} />
                  </td>
                  {[44, 72, 40, 80, 120, 140, 70].map((w, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 rounded animate-pulse" style={{ background: SKELETON, width: w }} />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="h-6 w-20 rounded animate-pulse ml-auto" style={{ background: SKELETON }} />
                  </td>
                </tr>
              ))
            ) : displayPatients.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-14 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--pale-teal)' }}>
                      {anyFilter
                        ? <SearchX size={22} style={{ color: 'var(--teal)' }} />
                        : <Users size={22} style={{ color: 'var(--teal)' }} />}
                    </div>
                    <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {anyFilter ? 'No patients match these filters' : 'No patients yet'}
                    </p>
                    <p className="mt-1 text-xs max-w-sm">
                      {anyFilter
                        ? 'Try a different spelling or fewer filters — or clear them to see everyone.'
                        : 'Add a patient, import a CSV, or share the self-registration QR code.'}
                    </p>
                    {anyFilter ? (
                      <button onClick={clearAllFilters}
                        className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold"
                        style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
                        <X size={12} /> Clear filters
                      </button>
                    ) : (
                      <button onClick={() => setShowAddForm(true)}
                        className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-white"
                        style={{ background: 'var(--teal)' }}>
                        <Plus size={13} /> Add Patient
                      </button>
                    )}
                  </div>
                  {outOfBranch.length > 0 && (
                    <div className="mx-auto mt-6 max-w-2xl rounded-xl border p-4 text-left"
                      style={{ borderColor: 'var(--light-gray)', background: '#F8FAF9' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                        Already registered at another branch
                      </p>
                      <p className="text-[11px] mb-3">
                        {outOfBranch.length === 1 ? 'This patient exists' : 'These patients exist'} but
                        {' '}{outOfBranch.length === 1 ? 'is' : 'are'} not registered at your branch. Add your branch
                        instead of creating a new record — creating one makes a duplicate.
                      </p>
                      <ul className="space-y-2">
                        {outOfBranch.map(p => (
                          <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border"
                            style={{ borderColor: 'var(--light-gray)' }}>
                            <span>
                              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                                {displayCase(`${p.firstName} ${p.lastName}`, 'name')}
                              </span>
                              <span className="ml-2 text-[11px]">
                                registered at {patientBranchDisplay(p)}
                              </span>
                            </span>
                            {forcedBranch && (
                              <button
                                onClick={() => addMyBranch(p.id)}
                                disabled={addingBranchId === p.id}
                                className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                                style={{ background: 'var(--teal)' }}>
                                {addingBranchId === p.id ? 'Adding…' : `Add ${branchLabel(forcedBranch)}`}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
              </tr>
            ) : displayPatients.slice((page - 1) * pageSize, page * pageSize).map((p) => {
              const noDx = missingDiagnosis(p)
              const rowBranches = p.branches?.length ? p.branches : (p.branch ? [p.branch] : [])
              return (
              <Fragment key={p.id}>
                <tr data-row-id={p.id}
                  onClick={() => setViewing(p)}
                  title={noDx
                    ? 'No diagnosis recorded — click the pencil to add one'
                    : 'Click to view this patient'}
                  className="transition-colors hover:bg-[#F8FAF9]"
                  style={{
                    cursor: 'pointer',
                    borderBottom: editingId === p.id ? 'none' : '1px solid var(--light-gray)',
                    // A thin red edge plus the "No diagnosis" tag carry the flag;
                    // two thirds of records have none, so a full-row wash made the
                    // whole table read as an error.
                    borderLeft: noDx ? '3px solid #F87171' : '3px solid transparent',
                    background: editingId === p.id ? 'var(--pale-teal)' : undefined,
                  }}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>
                      {displayCase(`${p.firstName} ${p.lastName}`, 'name')}
                    </p>
                    {p.phone && (
                      <p className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>{p.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{
                      background: p.patientType === 'PEDIATRIC' ? 'var(--pale-teal)' : '#FFF9EC',
                      color:      p.patientType === 'PEDIATRIC' ? 'var(--teal)'      : '#9A7432',
                    }}>
                      {p.patientType === 'PEDIATRIC' ? 'Pedia' : 'Adult'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {rowBranches.length ? (
                      <div className="flex flex-wrap gap-1" title={patientBranchDisplay(p)}>
                        {rowBranches.map((b) => (
                          <span key={b} className="text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                            style={{ background: '#EEF2F4', color: '#475569' }}>
                            {branchShort(b)}
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>
                    {p.sex ? displayCase(p.sex) : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)', maxWidth: 150 }}>
                    {p.city
                      ? <span className="truncate block" title={p.city}>{displayCase(p.city)}</span>
                      : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)', maxWidth: 220 }}>
                    {noDx ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                        style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                        <AlertTriangle size={10} />
                        No diagnosis
                      </span>
                    ) : (
                      <span className="truncate block" title={p.diagnosis ?? ''}>
                        {displayCase(p.diagnosis, 'dx') || <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)', maxWidth: 200 }}>
                    {p.email
                      ? <span className="truncate block" title={p.email}>{p.email}</span>
                      : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                    <div className="flex items-center gap-1">
                      {p.dob ? new Date(p.dob).toLocaleDateString('en-PH') : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                      {p.dob && new Date(p.dob).getMonth() === new Date().getMonth() && (
                        <span title="Birthday this month!">
                          <Cake size={12} style={{ color: 'var(--gold)' }} />
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Actions swallow the click: pressing Edit or Delete must not
                      also throw the summary open on top of them. */}
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => editingId === p.id ? closeEdit() : openEdit(p)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
                        style={{
                          background: editingId === p.id ? 'var(--pale-teal)' : undefined,
                          color:      editingId === p.id ? 'var(--teal)'      : 'var(--mid-gray)',
                        }}
                        title={editingId === p.id ? 'Close the editor' : 'Edit patient'}
                        aria-label="Edit patient">
                        <Pencil size={15} />
                      </button>
                      <CertificateActionButton
                        patient={p}
                        count={certCounts[p.id] ?? 0}
                        onIssued={loadCertCounts}
                      />
                      <button
                        onClick={() => deletePatient(p.id, `${p.firstName} ${p.lastName}`)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors"
                        title="Remove patient"
                        aria-label="Remove patient">
                        <Trash2 size={15} style={{ color: '#DC2626' }} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Inline edit row */}
                {editingId === p.id && (
                  <tr key={`edit-${p.id}`}
                    style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--pale-teal)' }}>
                    <td colSpan={9} className="px-5 py-5">
                      <p className="text-xs font-bold uppercase tracking-widest mb-4"
                        style={{ color: 'var(--teal)' }}>
                        Editing — {p.firstName} {p.lastName}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="First Name"            value={editForm.firstName}   onChange={(v) => setEditForm((f) => ({ ...f, firstName: v }))} />
                        <Field label="Last Name"             value={editForm.lastName}    onChange={(v) => setEditForm((f) => ({ ...f, lastName: v }))} />
                        <Field label="Email" type="email"    value={editForm.email}       onChange={(v) => setEditForm((f) => ({ ...f, email: v }))} />
                        <Field label="Cellphone No."         value={editForm.phone}       onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
                        <Field label="Date of Birth" type="date" value={editForm.dob}     onChange={(v) => setEditForm((f) => ({ ...f, dob: v }))} />
                        <Field label="1st Day of Consult" type="date" value={editForm.firstDayOfConsult} onChange={(v) => setEditForm((f) => ({ ...f, firstDayOfConsult: v }))} placeholder="Leave blank to use 1st recorded session" />
                        <Field label="Sex"                   value={editForm.sex}         onChange={(v) => setEditForm((f) => ({ ...f, sex: v }))} placeholder="Male / Female" />
                        <Field label="Barangay / Address"    value={editForm.address}     onChange={(v) => setEditForm((f) => ({ ...f, address: v }))} />
                        <Field label="City"                  value={editForm.city}        onChange={(v) => setEditForm((f) => ({ ...f, city: v }))} />
                        <Field label="Diagnosis"             value={editForm.diagnosis}   onChange={(v) => setEditForm((f) => ({ ...f, diagnosis: v }))} />
                        <Field label="Civil Status"          value={editForm.civilStatus} onChange={(v) => setEditForm((f) => ({ ...f, civilStatus: v }))} />
                        <Field label="Religion"              value={editForm.religion}    onChange={(v) => setEditForm((f) => ({ ...f, religion: v }))} />
                        <Field label="Nationality"           value={editForm.nationality} onChange={(v) => setEditForm((f) => ({ ...f, nationality: v }))} />
                        <Field label="PWD/Senior ID Number"  value={editForm.pwdSeniorId} onChange={(v) => setEditForm((f) => ({ ...f, pwdSeniorId: v }))} placeholder="Optional — for discount eligibility" />
                        <UnsubscribeToggle value={!!editForm.unsubscribed} onChange={(v) => setEditForm((f) => ({ ...f, unsubscribed: v }))} />
                        <SmsUnsubscribeToggle value={!!editForm.smsUnsubscribed} onChange={(v) => setEditForm((f) => ({ ...f, smsUnsubscribed: v }))} />
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
                          style={{ color: 'var(--mid-gray)' }}>Branch(es)</label>
                        <BranchCheckboxes
                          selected={editForm.branches}
                          onChange={(b) => setEditForm((f) => ({ ...f, branches: b }))}
                          lockedTo={forcedBranch || undefined}
                        />
                      </div>
                      {/* ── Doctor's Referral (optional) ──────────────────── */}
                      <div className="mt-4 p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--teal)' }}>
                          Doctor&apos;s Referral <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </p>

                        {referralUrls[p.id] ? (
                          /* Existing referral */
                          <div className="flex items-center gap-3">
                            <a href={referralUrls[p.id]!} target="_blank" rel="noreferrer"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: '#EFF6FF', borderRadius: '0.5rem', border: '1px solid #BFDBFE', flexShrink: 0 }}>
                              <FileText size={22} style={{ color: '#3B82F6' }} />
                            </a>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: 'var(--charcoal)' }}>Referral on file</p>
                              <a href={referralUrls[p.id]!} target="_blank" rel="noreferrer"
                                className="text-xs" style={{ color: 'var(--teal)' }}>View document ↗</a>
                            </div>
                            <button onClick={() => removeReferral(p.id)}
                              className="text-xs px-2.5 py-1.5 rounded-lg"
                              style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                              Remove
                            </button>
                          </div>
                        ) : (
                          /* No referral yet */
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setReferralInputFor(p.id); referralInputRef.current?.click() }}
                              disabled={referralUploading[p.id]}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', opacity: referralUploading[p.id] ? 0.7 : 1 }}>
                              {referralUploading[p.id]
                                ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                                : <><Upload size={13} /> Upload from Device</>}
                            </button>
                            <button
                              onClick={() => openQr(p.id)}
                              disabled={qrLoading}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#fff', color: 'var(--charcoal)', border: '1px solid #CBD5E1', cursor: 'pointer' }}>
                              {qrLoading ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
                              Scan QR with Phone
                            </button>
                          </div>
                        )}
                        {/* Allow re-upload even if referral exists */}
                        {referralUrls[p.id] && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => { setReferralInputFor(p.id); referralInputRef.current?.click() }}
                              disabled={referralUploading[p.id]}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#fff', color: 'var(--teal)', border: '1px solid var(--teal)', cursor: 'pointer' }}>
                              {referralUploading[p.id]
                                ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                                : <><Upload size={13} /> Replace Document</>}
                            </button>
                            <button
                              onClick={() => openQr(p.id)}
                              disabled={qrLoading}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#fff', color: 'var(--charcoal)', border: '1px solid #CBD5E1', cursor: 'pointer' }}>
                              {qrLoading ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
                              Scan QR with Phone
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── PWD ID / Senior ID ──────────────────────────── */}
                      <div className="mt-4 p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--teal)' }}>
                          PWD ID / Senior ID Photo <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </p>

                        {pwdIdUrls[p.id] ? (
                          <div className="flex items-center gap-3">
                            <a href={pwdIdUrls[p.id]!} target="_blank" rel="noreferrer"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: '#EFF6FF', borderRadius: '0.5rem', border: '1px solid #BFDBFE', flexShrink: 0 }}>
                              <FileText size={22} style={{ color: '#3B82F6' }} />
                            </a>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: 'var(--charcoal)' }}>ID on file</p>
                              <a href={pwdIdUrls[p.id]!} target="_blank" rel="noreferrer"
                                className="text-xs" style={{ color: 'var(--teal)' }}>View document ↗</a>
                            </div>
                            <button onClick={() => removePwdId(p.id)}
                              className="text-xs px-2.5 py-1.5 rounded-lg"
                              style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setPwdIdInputFor(p.id); pwdIdInputRef.current?.click() }}
                              disabled={pwdIdUploading[p.id]}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', opacity: pwdIdUploading[p.id] ? 0.7 : 1 }}>
                              {pwdIdUploading[p.id]
                                ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                                : <><Upload size={13} /> Upload from Device</>}
                            </button>
                            <button
                              onClick={() => openPwdIdQr(p.id)}
                              disabled={qrLoading}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#fff', color: 'var(--charcoal)', border: '1px solid #CBD5E1', cursor: 'pointer' }}>
                              {qrLoading ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
                              Scan QR with Phone
                            </button>
                          </div>
                        )}
                        {pwdIdUrls[p.id] && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => { setPwdIdInputFor(p.id); pwdIdInputRef.current?.click() }}
                              disabled={pwdIdUploading[p.id]}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#fff', color: 'var(--teal)', border: '1px solid var(--teal)', cursor: 'pointer' }}>
                              {pwdIdUploading[p.id]
                                ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                                : <><Upload size={13} /> Replace Document</>}
                            </button>
                            <button
                              onClick={() => openPwdIdQr(p.id)}
                              disabled={qrLoading}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: '#fff', color: 'var(--charcoal)', border: '1px solid #CBD5E1', cursor: 'pointer' }}>
                              {qrLoading ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
                              Scan QR with Phone
                            </button>
                          </div>
                        )}
                      </div>

                      {editError && (
                        <p className="text-xs mt-3 px-3 py-2 rounded-lg"
                          style={{ background: '#FEE2E2', color: '#DC2626' }}>
                          {editError}
                        </p>
                      )}
                      <div className="flex justify-end gap-3 mt-4">
                        <button onClick={closeEdit} className="px-4 py-2 rounded-lg text-sm"
                          style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--charcoal)' }}>
                          Cancel
                        </button>
                        <button onClick={saveEdit} disabled={editSaving}
                          className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold"
                          style={{ background: 'var(--teal)', color: '#fff' }}>
                          <Check size={14} />
                          {editSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>

        {/* Pagination bar */}
        {!loading && displayPatients.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            style={{ borderTop: '1px solid var(--light-gray)' }}>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
              Rows per page
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="h-8 px-2 rounded-lg text-xs outline-none"
                style={CONTROL_STYLE}
              >
                {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                {`${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, displayPatients.length).toLocaleString()}`} of {displayPatients.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className={PAGE_BTN} style={CONTROL_STYLE} title="Previous page" aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs px-1.5 tabular-nums" style={{ color: 'var(--charcoal)' }}>
                  Page {page} of {pageCount}
                </span>
                <button onClick={() => setPage(p => p + 1)} disabled={page * pageSize >= displayPatients.length}
                  className={PAGE_BTN} style={CONTROL_STYLE} title="Next page" aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Hidden file inputs ──────────────────────────────────────────────── */}
      {/* Edit-view referral */}
      <input
        ref={referralInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file && referralInputFor) uploadReferral(referralInputFor, file)
          e.target.value = ''
        }}
      />
      {/* Add-form referral */}
      <input
        ref={addReferralInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) setAddReferralFile(file)
          e.target.value = ''
        }}
      />
      {/* Edit-view PWD ID / Senior ID */}
      <input
        ref={pwdIdInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file && pwdIdInputFor) uploadPwdId(pwdIdInputFor, file)
          e.target.value = ''
        }}
      />
      {/* Add-form PWD ID / Senior ID */}
      <input
        ref={addPwdIdInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) setAddPwdIdFile(file)
          e.target.value = ''
        }}
      />

      {/* ── QR Code Modal ─────────────────────────────────────────────────────── */}
      {qrModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setQrModal(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{
            background: '#fff',
            borderRadius: '1.25rem',
            padding: '2rem',
            maxWidth: 380,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
              {qrModal.docType === 'pwd-id' ? 'PWD ID / Senior ID' : 'Doctor\'s Referral'}
            </p>
            <h3 className="font-bold mb-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
              {qrModal.patientName}
            </h3>
            <p className="text-xs mb-4" style={{ color: '#888' }}>
              {qrModal.docType === 'pwd-id'
                ? 'Scan this QR code with a phone or tablet to upload the PWD ID / Senior ID photo.'
                : 'Scan this QR code with a phone or tablet to upload the referral document.'}
            </p>
            <img
              src={qrModal.qrDataUrl}
              alt="QR Code"
              style={{ width: 220, height: 220, margin: '0 auto', display: 'block', borderRadius: '0.5rem' }}
            />
            <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' }}>
              <Camera size={13} style={{ display: 'inline', marginRight: 4 }} />
              Scan → Take Photo or Upload from Gallery
            </div>
            <p className="text-xs mt-3" style={{ color: '#94A3B8' }}>
              Link expires at {new Date(qrModal.expiresAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}
              {' · '}
              <a href={qrModal.uploadUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                Open link directly ↗
              </a>
            </p>
            <button
              onClick={() => setQrModal(null)}
              className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold w-full"
              style={{ background: 'var(--charcoal)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
      {/* Read-only summary, opened by clicking a row. */}
      {viewing && (
        <div
          onClick={() => setViewing(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-2xl"
            style={{
              background: '#fff', width: '100%', maxWidth: 560, maxHeight: '86vh',
              overflowY: 'auto', boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
            }}>
            <div className="px-5 py-4 flex items-start justify-between gap-3"
              style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div>
                <p className="text-base font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  {viewing.firstName} {viewing.lastName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  {viewing.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult'}
                  {viewing.dob ? ` · ${ageFrom(viewing.dob)}` : ''}
                </p>
              </div>
              <button onClick={() => setViewing(null)} className="p-1 rounded-lg hover:bg-gray-100"
                style={{ lineHeight: 0 }} title="Close">
                <X size={16} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            <div className="px-5 py-4 grid grid-cols-2 gap-x-5 gap-y-3">
              <ViewField label="Email"      value={viewing.email} />
              <ViewField label="Cellphone"  value={viewing.phone} />
              <ViewField label="Sex"        value={viewing.sex} />
              <ViewField label="Birthday"   value={viewing.dob ? new Date(viewing.dob).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : ''} />
              <ViewField label="City"       value={viewing.city} />
              <ViewField label="Nationality" value={viewing.nationality} />
              <ViewField label="Address"    value={viewing.address} wide />
              <ViewField label="Diagnosis"
                value={(viewing.diagnoses?.length ? viewing.diagnoses.join(', ') : viewing.diagnosis) || ''} wide />
              <ViewField label="Branches"
                value={(viewing.branches ?? []).map(branchLabel).join(', ')} wide />
              {viewing.notes ? <ViewField label="Notes" value={viewing.notes} wide /> : null}
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-2"
              style={{ borderTop: '1px solid var(--light-gray)' }}>
              <a href={`/patients/profile?id=${viewing.id}`}
                className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                Open full profile →
              </a>
              <div className="flex gap-2">
                <button
                  onClick={() => { const p = viewing; setViewing(null); openEdit(p) }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                  Edit
                </button>
                <button onClick={() => setViewing(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--teal)', color: '#fff' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Patient Self-Registration QR Modal ──────────────────────────────────────
function PatientRegisterQrModal({
  forcedBranch,
  onClose,
}: {
  forcedBranch: string
  onClose: () => void
}) {
  const branchOptions = useBranchOptions()
  const [branch, setBranch] = useState(forcedBranch || '')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // Use friendly URL aliases so patients don't see "SANDBOX" in shared links
  const BRANCH_URL_ALIASES: Record<string, string> = {
    'SANDBOX_EAST': 'east',
    'SANDBOX_GREENHILLS': 'greenhills',
    'VERDANA_STORE': 'verdana',
  }
  const branchAlias = BRANCH_URL_ALIASES[branch] ?? branch
  const registerUrl = branchAlias
    ? `${origin}/patient-register?branch=${encodeURIComponent(branchAlias)}`
    : `${origin}/patient-register`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    import('qrcode').then(QR =>
      QR.toDataURL(registerUrl, { width: 360, margin: 2, color: { dark: '#244952', light: '#ffffff' } })
    ).then(url => {
      if (!cancelled) { setQrDataUrl(url); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [registerUrl])

  function handlePrint() {
    const win = window.open('', '_blank', 'width=600,height=700')
    if (!win) return
    win.document.write(`
      <html><head><title>Patient Registration QR</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 40px 20px; }
        h1 { color: #ED6823; margin-bottom: 6px; }
        p { color: #555; margin: 4px 0; font-size: 13px; }
        img { margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; }
        .url { font-size: 11px; color: #888; word-break: break-all; max-width: 420px; margin: 0 auto; }
      </style></head><body>
        <h1>SAPPHIRE Clinics</h1>
        <p>Patient Registration</p>
        <img src=\"${qrDataUrl}\" />
        <p>Scan this code to register as a patient</p>
        <p class=\"url\">${registerUrl}</p>
      </body></html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <QrCode size={18} style={{ color: 'var(--teal)' }} />
            <h3 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Patient Self-Registration</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Patients can scan this QR code with their phone to fill out their information.
            Submitted records appear immediately in the Patient CRM.
          </p>

          {!forcedBranch && (
            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Pre-fill Branch (optional)
              </label>
              <select
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">— Let patient choose —</option>
                {branchOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'center', padding: 16,
            background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb',
          }}>
            {loading ? (
              <div style={{ width: 280, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                <Loader2 size={32} className="animate-spin" />
              </div>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="Patient registration QR code" style={{ width: 280, height: 280 }} />
            ) : (
              <div style={{ width: 280, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 12 }}>
                Unable to generate QR
              </div>
            )}
          </div>

          <div className="mt-3 px-3 py-2 bg-gray-50 rounded-md text-[11px] text-gray-500 break-all text-center">
            {registerUrl}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              style={{ color: 'var(--charcoal)' }}
            >
              Print
            </button>
            <a
              href={registerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-center"
              style={{ background: 'var(--teal)', color: '#fff' }}
            >
              Open Form ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Unsubscribe Newsletter Toggle ───────────────────────────────────────────
function UnsubscribeToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--mid-gray)' }}>Email Newsletter</label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all"
        style={{
          border: `1.5px solid ${value ? '#fecaca' : 'var(--light-gray)'}`,
          background: value ? '#fef2f2' : '#fff',
          color: value ? '#b91c1c' : 'var(--charcoal)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {value ? (
            <XCircle size={15} style={{ color: '#dc2626' }} />
          ) : (
            <CheckCircle size={15} style={{ color: '#10b981' }} />
          )}
          {value ? 'Unsubscribed from Newsletter' : 'Subscribed to Newsletter'}
        </span>
        <span
          style={{
            width: 36, height: 20, borderRadius: 99,
            background: value ? '#dc2626' : '#d1d5db',
            position: 'relative', flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: value ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.15s',
          }} />
        </span>
      </button>
    </div>
  )
}
// ── Unsubscribe SMS Marketing Toggle ───────────────────────────────────────
// Mirrors UnsubscribeToggle but for the SMS campaign opt-out flag. Only
// affects bulk SMS marketing campaigns — patients toggled OFF here still
// receive schedule reminders, birthday greetings, and follow-up SMS.
function SmsUnsubscribeToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: value ? '#FEF2F2' : '#F0FDF4', border: '1px solid ' + (value ? '#FECACA' : '#BBF7D0') }}>
      <button type="button" onClick={() => onChange(!value)}
        aria-label={value ? 'Resubscribe to SMS marketing' : 'Unsubscribe from SMS marketing'}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: value ? '#DC2626' : '#16A34A',
          position: 'relative', cursor: 'pointer', border: 'none', flexShrink: 0,
        }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s',
        }} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: value ? '#991B1B' : '#166534' }}>
          {value ? 'Unsubscribed from SMS marketing' : 'Subscribed to SMS marketing'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--mid-gray)' }}>
          Schedule reminders, birthday greetings, and follow-up SMS are NOT affected.
        </span>
      </div>
    </div>
  )
}

/** One labelled value in the row-click summary; an empty one still shows, so a
 *  blank field reads as "not recorded" rather than silently vanishing. */
function ViewField({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-sm mt-0.5" style={{ color: value ? 'var(--charcoal)' : '#9CA3AF' }}>
        {value || '—'}
      </p>
    </div>
  )
}

function ageFrom(dob: string): string {
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 ? `${a} years old` : ''
}
