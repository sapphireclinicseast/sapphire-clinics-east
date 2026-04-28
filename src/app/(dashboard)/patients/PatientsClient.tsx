'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Upload, Plus, Search, X, Cake, Download,
  AlertTriangle, CheckSquare, Square, Pencil, Trash2, Check,
  ChevronUp, ChevronDown, ArrowUpDown, CheckCircle, XCircle, ListFilter,
  QrCode, FileText, Camera, Loader2,
} from 'lucide-react'

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
  notes?: string
  referralUrl?: string | null
  firstDayOfConsult?: string | null
  pwdSeniorId?: string | null
}

const BRANCHES = [
  { value: 'SANDBOX_EAST',       label: 'Sandbox East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Sandbox Greenhills' },
  { value: 'VERDANA_STORE',      label: 'Verdana Store' },
]

interface DuplicateEntry {
  csvRow: Record<string, string>
  existing: { id: string; firstName: string; lastName: string; dob?: string }
}

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '', dob: '',
  patientType: 'ADULT', branches: [] as string[], sex: '',
  civilStatus: '', religion: '', nationality: '', address: '', city: '', diagnosis: '', notes: '',
  firstDayOfConsult: '', pwdSeniorId: '',
}

type SortCol = 'name' | 'type' | 'branch' | 'sex' | 'city' | 'barangay' | 'diagnosis' | 'email' | 'dob' | ''
type SortDir = 'asc' | 'desc'
type FilterableCol = 'type' | 'branch' | 'sex' | 'city' | 'barangay' | 'diagnosis'

// ── Helper: branch label ──────────────────────────────────────────────────────
function branchLabel(b?: string) {
  return BRANCHES.find((x) => x.value === b)?.label ?? b ?? '—'
}

function patientBranchDisplay(p: Patient) {
  const bs = p.branches?.length ? p.branches : (p.branch ? [p.branch] : [])
  return bs.map(branchLabel).join(', ') || '—'
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
  return (
    <div className="flex flex-wrap gap-2">
      {BRANCHES.map((b) => {
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
  SBEA_FRONT_DESK: 'SANDBOX_EAST',
  SBGH_FRONT_DESK: 'SANDBOX_GREENHILLS',
}

export default function PatientsPage({ role = '', userEmail = '' }: { role?: string; userEmail?: string }) {
  const isMainAdmin = userEmail.toLowerCase() === 'main@sapphireclinicseast.org'
  const isFrontDesk  = role === 'SBEA_FRONT_DESK' || role === 'SBGH_FRONT_DESK'
  const forcedBranch = ROLE_TO_BRANCH[role] ?? ''

  const [patients, setPatients]         = useState<Patient[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [branchFilter, setBranchFilter] = useState(forcedBranch)
  const [showAddForm, setShowAddForm]   = useState(false)
  const [csvFile, setCsvFile]           = useState<File | null>(null)
  const [importBranch, setImportBranch] = useState(forcedBranch || 'SANDBOX_EAST')
  const [importing, setImporting]       = useState(false)
  const [importMsg, setImportMsg]       = useState('')
  const [duplicates, setDuplicates]     = useState<DuplicateEntry[]>([])
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
  const [qrModal, setQrModal] = useState<{
    patientId: string; patientName: string;
    qrDataUrl: string; uploadUrl: string; expiresAt: string
  } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const referralInputRef = useRef<HTMLInputElement>(null)
  const [referralInputFor, setReferralInputFor] = useState<string | null>(null)

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ── Persist pending duplicates across page reloads ────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pending-duplicates')
      const savedBranch = localStorage.getItem('pending-duplicates-branch')
      if (saved) setDuplicates(JSON.parse(saved))
      if (savedBranch) setImportBranch(savedBranch)
    } catch {}
  }, [])

  useEffect(() => {
    if (duplicates.length > 0) {
      localStorage.setItem('pending-duplicates', JSON.stringify(duplicates))
      localStorage.setItem('pending-duplicates-branch', importBranch)
    } else {
      localStorage.removeItem('pending-duplicates')
      localStorage.removeItem('pending-duplicates-branch')
    }
  }, [duplicates, importBranch])

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
  }, [patients, sortCol, sortDir, colFilters])

  // Reset to page 1 whenever the filtered/sorted list changes
  useEffect(() => { setPage(1) }, [displayPatients])

  // ── Data fetching ─────────────────────────────────────────────────────────
  async function fetchPatients() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.set('search', search)
      if (typeFilter)   params.set('type', typeFilter)
      if (branchFilter) params.set('branch', branchFilter)
      const res  = await fetch(`/api/patients?${params}`)
      const data = await res.json()
      setPatients(data.patients || [])
    } catch {
      setPatients([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPatients() }, [search, typeFilter, branchFilter])

  // ── Add / Edit / Delete ───────────────────────────────────────────────────
  async function handleAddPatient(e: React.FormEvent) {
    e.preventDefault()
    // For front desk users, always enforce their branch regardless of form state
    const payload = forcedBranch
      ? { ...form, branches: [forcedBranch] }
      : form
    await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setShowAddForm(false)
    setForm({ ...EMPTY_FORM, branches: forcedBranch ? [forcedBranch] : [] })
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
    if (res.ok) setQrModal(d)
    else alert(d.error ?? 'Could not generate QR code')
  }, [])

  function openEdit(p: Patient) {
    setEditingId(p.id)
    // Sync referral URL from patient record
    setReferralUrls(s => ({ ...s, [p.id]: p.referralUrl ?? null }))
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
      notes:       p.notes       ?? '',
      firstDayOfConsult: p.firstDayOfConsult ? p.firstDayOfConsult.slice(0, 10) : '',
      pwdSeniorId: p.pwdSeniorId ?? '',
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
    fd.append('branch', importBranch)
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
    fd.append('branch', importBranch)
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
  const pediatricCount = patients.filter((p) => p.patientType === 'PEDIATRIC').length
  const adultCount     = patients.filter((p) => p.patientType === 'ADULT').length

  // ── Table column config ───────────────────────────────────────────────────
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

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Patient Management
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Patient CRM
          </h1>
        </div>
        <button
          onClick={() => setShowDuplicatesModal(true)}
          className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
          style={{
            background: duplicates.length > 0 ? '#FEF3C7' : '#fff',
            border: duplicates.length > 0 ? '1.5px solid #F59E0B' : '1.5px solid var(--light-gray)',
            color: duplicates.length > 0 ? '#B45309' : 'var(--mid-gray)',
          }}
        >
          <AlertTriangle size={15} />
          Check for Duplicates
          {duplicates.length > 0 && (
            <span
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
              style={{ background: '#F59E0B', color: '#fff' }}
            >
              {duplicates.length}
            </span>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Patients', value: patients.length,    color: 'var(--teal)' },
          { label: 'Pediatric',      value: pediatricCount,     color: 'var(--bright-teal)' },
          { label: 'Adult',          value: adultCount,         color: 'var(--gold)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4"
            style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
            <p className="text-2xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{value}</p>
            <p className="text-xs font-semibold mt-1" style={{ color }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
          style={{ background: '#fff', border: '1px solid var(--light-gray)', minWidth: 160 }}>
          <Search size={15} style={{ color: 'var(--mid-gray)' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 text-sm outline-none" style={{ color: 'var(--charcoal)' }} />
          {search && (
            <button onClick={() => setSearch('')}>
              <X size={13} style={{ color: 'var(--mid-gray)' }} />
            </button>
          )}
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
          <option value="">All Types</option>
          <option value="PEDIATRIC">Pediatric</option>
          <option value="ADULT">Adult</option>
        </select>

        {/* Branch filter — hidden for front desk (locked to their branch) */}
        {!isFrontDesk && (
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">All Branches</option>
            {BRANCHES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        )}

        {/* Clear column filters badge */}
        {hasColFilters && (
          <button
            onClick={() => setColFilters({})}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
            <X size={12} />
            Clear column filters
          </button>
        )}

        {/* CSV Import */}
        <div className="flex items-center gap-2">
          {!isFrontDesk && (
            <select value={importBranch} onChange={(e) => setImportBranch(e.target.value)}
              className="px-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--pale-teal)', border: '1px solid rgba(26,123,138,0.3)', color: 'var(--teal)' }}>
              {BRANCHES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
            <Upload size={15} />
            Import CSV
            <input type="file" accept=".csv" className="hidden"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        {csvFile && (
          <button onClick={handleCsvImport} disabled={importing}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--teal)', color: '#fff' }}>
            {importing ? 'Importing…' : `Import "${csvFile.name}"`}
          </button>
        )}

        {/* Export — restricted to the main admin account */}
        {isMainAdmin && (
        <div className="relative">
          <button onClick={() => setShowExportPanel(!showExportPanel)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
            <Download size={15} />
            Export CSV
          </button>
          {showExportPanel && (
            <div className="absolute right-0 top-full mt-1 z-10 rounded-xl p-4 space-y-3 w-52"
              style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                Download Branches
              </p>
              {BRANCHES.map((b) => (
                <label key={b.value} className="flex items-center gap-2 cursor-pointer">
                  <span onClick={() => setExportBranches((prev) => {
                    const next = new Set(prev)
                    next.has(b.value) ? next.delete(b.value) : next.add(b.value)
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
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--teal)', color: '#fff' }}>
                Download
              </button>
            </div>
          )}
        </div>
        )}

        <button onClick={() => setShowRegisterQr(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#fff', color: 'var(--teal)', border: '1.5px solid var(--teal)', fontFamily: 'var(--font-display)' }}
          title="Show QR code for patients to self-register">
          <QrCode size={15} />
          Patient QR
        </button>

        <button onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>
          <Plus size={15} />
          Add Patient
        </button>
      </div>

      {showRegisterQr && (
        <PatientRegisterQrModal
          forcedBranch={forcedBranch}
          onClose={() => setShowRegisterQr(false)}
        />
      )}

      {/* Import message */}
      {importMsg && (
        <p className="text-sm px-4 py-2 rounded-lg" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          {importMsg}
        </p>
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
              <Field label="Diagnosis / Condition" value={form.diagnosis}    onChange={(v) => setForm((f) => ({ ...f, diagnosis: v }))} />
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
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowAddForm(false)}
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

      {/* Column filter count */}
      {hasColFilters && (
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          Showing <span className="font-semibold" style={{ color: 'var(--teal)' }}>{displayPatients.length}</span> of {patients.length} patients (column filters active)
        </p>
      )}

      <div className="rounded-xl overflow-x-auto"
        style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
              {COLS.map(({ key, label, filterable }) => {
                const filterActive = filterable && (colFilters[filterable]?.size ?? 0) > 0
                return (
                  <th
                    key={key || '_actions'}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                    style={{
                      color:      sortCol === key && key ? 'var(--teal)' : 'var(--mid-gray)',
                      whiteSpace: 'nowrap',
                      position:   'relative',
                    }}>
                    <span className="flex items-center gap-1">
                      {/* Sort clickable label */}
                      {key ? (
                        <button
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-1 cursor-pointer select-none hover:opacity-80"
                        >
                          {label}
                          <SortIcon active={sortCol === key} dir={sortDir} />
                        </button>
                      ) : null}

                      {/* Filter button (only for filterable columns) */}
                      {filterable && (
                        <div className="relative" data-filter-root>
                          <button
                            ref={(el) => { filterBtnRefs.current[filterable] = el }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenFilterCol(openFilterCol === filterable ? null : filterable)
                            }}
                            title="Filter column"
                            className="ml-0.5 p-0.5 rounded transition-colors hover:bg-gray-100"
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
              <tr>
                <td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  Loading…
                </td>
              </tr>
            ) : displayPatients.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  No patients found
                </td>
              </tr>
            ) : displayPatients.slice((page - 1) * pageSize, page * pageSize).map((p) => (
              <>
                <tr key={p.id}
                  style={{ borderBottom: editingId === p.id ? 'none' : '1px solid var(--light-gray)' }}>
                  <td className="px-4 py-3">
                    <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {p.firstName} {p.lastName}
                    </p>
                    {p.phone && (
                      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{p.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{
                      background: p.patientType === 'PEDIATRIC' ? 'var(--pale-teal)' : '#FFF9EC',
                      color:      p.patientType === 'PEDIATRIC' ? 'var(--teal)'      : 'var(--gold)',
                    }}>
                      {p.patientType === 'PEDIATRIC' ? 'Pedia' : 'Adult'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)', maxWidth: 140 }}>
                    {patientBranchDisplay(p)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{p.sex || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{p.city || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)', maxWidth: 140 }}
                    title={p.diagnosis ?? ''}>
                    <span className="truncate block">{p.diagnosis || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>{p.email || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>
                    <div className="flex items-center gap-1">
                      {p.dob ? new Date(p.dob).toLocaleDateString('en-PH') : '—'}
                      {p.dob && new Date(p.dob).getMonth() === new Date().getMonth() && (
                        <span title="Birthday this month!">
                          <Cake size={12} style={{ color: 'var(--gold)' }} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => editingId === p.id ? closeEdit() : openEdit(p)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{
                          background: editingId === p.id ? 'var(--pale-teal)' : 'transparent',
                          color:      editingId === p.id ? 'var(--teal)'      : 'var(--mid-gray)',
                        }}
                        title="Edit patient">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => deletePatient(p.id, `${p.firstName} ${p.lastName}`)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remove patient">
                        <Trash2 size={13} style={{ color: '#DC2626' }} />
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
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
                          style={{ color: 'var(--mid-gray)' }}>Branch(es)</label>
                        <BranchCheckboxes
                          selected={editForm.branches}
                          onChange={(b) => setEditForm((f) => ({ ...f, branches: b }))}
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
              </>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination bar */}
      {!loading && displayPatients.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid var(--light-gray)', background: '#fff', borderRadius: '0 0 0.75rem 0.75rem' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)' }}
            >
              {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              {`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, displayPatients.length)}`} of {displayPatients.length}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: page === 1 ? 'var(--off-white)' : 'var(--pale-teal)', color: page === 1 ? 'var(--mid-gray)' : 'var(--teal)', border: '1px solid var(--light-gray)' }}>
                ‹ Prev
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * pageSize >= displayPatients.length}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: page * pageSize >= displayPatients.length ? 'var(--off-white)' : 'var(--pale-teal)', color: page * pageSize >= displayPatients.length ? 'var(--mid-gray)' : 'var(--teal)', border: '1px solid var(--light-gray)' }}>
                Next ›
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden referral file input ─────────────────────────────────────── */}
      <input
        ref={referralInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file && referralInputFor) {
            uploadReferral(referralInputFor, file)
          }
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
              Doctor&apos;s Referral
            </p>
            <h3 className="font-bold mb-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
              {qrModal.patientName}
            </h3>
            <p className="text-xs mb-4" style={{ color: '#888' }}>
              Scan this QR code with a phone or tablet to upload the referral document.
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
  const [branch, setBranch] = useState(forcedBranch || '')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const registerUrl = branch
    ? `${origin}/patient-register?branch=${encodeURIComponent(branch)}`
    : `${origin}/patient-register`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    import('qrcode').then(QR =>
      QR.toDataURL(registerUrl, { width: 360, margin: 2, color: { dark: '#ED6823', light: '#ffffff' } })
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
                {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
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
