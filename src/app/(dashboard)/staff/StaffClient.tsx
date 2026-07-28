'use client'

import React, { useEffect, useState } from 'react'
import {
  UserCog, X, Users, RefreshCw,
  ChevronUp, ChevronDown, ChevronsUpDown, CheckCircle2, AlertTriangle, GitMerge,
} from 'lucide-react'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK'] as const
type Department = typeof DEPARTMENTS[number]

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  sex: string | null
  department: Department
  branch: string
  jobTitle: string | null
  employmentType: string | null
  employeeId: string | null
  dob: string | null
  // Government IDs + banking — synced one-way from HR Hub. Sensitive.
  tin: string | null
  sss: string | null
  pagibig: string | null
  philhealth: string | null
  bankName: string | null
  bankAccountNo: string | null
  hrPlatformId: string | null
  extraBranches: string[]
  employmentByBranch?: Record<string, string> | null
  branchEmployment: Record<string, { employmentType?: string | null }> | null
  createdAt: string
  updatedAt?: string | null
}

type SortCol = 'name' | 'department' | 'branch' | 'email' | 'phone' | 'jobTitle' | 'sex' | 'employmentType'
type SortDir = 'asc' | 'desc'

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SBEA'
  if (role.startsWith('SBGH_')) return 'SBGH'
  return null
}

const BRANCH_DISPLAY: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}

function BranchChip({ branch }: { branch: string }) {
  const isSBEA = branch === 'SBEA'
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={
      isSBEA
        ? { background: 'var(--pale-teal)', color: 'var(--teal)' }
        : { background: '#FFF3CD', color: '#92400E' }
    }>
      {BRANCH_DISPLAY[branch] ?? branch}
    </span>
  )
}

function SexSelect({ staffId, value, onChange }: { staffId: string; value: string | null; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  async function update(next: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staffId, sex: next || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      onChange(next || null)
    } catch (err) {
      alert('Failed to save sex: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <select
      disabled={busy}
      value={value ?? ''}
      onChange={(e) => update(e.target.value)}
      style={{
        fontSize: '11.5px',
        padding: '3px 6px',
        borderRadius: '6px',
        border: '1px solid var(--light-gray)',
        background: value === 'M' ? '#EBF5FB' : value === 'F' ? '#FCE4EC' : '#fff',
        color: value === 'M' ? '#0369a1' : value === 'F' ? '#be185d' : 'var(--mid-gray)',
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        outline: 'none',
      }}
    >
      <option value="">—</option>
      <option value="M">Male</option>
      <option value="F">Female</option>
    </select>
  )
}

function ExtraBranchToggle({
  staffId, primaryBranch, value, onChange,
}: {
  staffId: string
  primaryBranch: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const extra = ['SBEA', 'SBGH'].filter(b => b !== primaryBranch)

/**
 * Per-branch role. Someone can be a consultant at one branch and an employee at another —
 * HR only stores one employmentType, so this override lives here and drives which Payroll
 * tab they land in per branch over in the Accounting Hub.
 */
function EmploymentByBranchEditor({ staffId, branches, value, fallback, onChange }: {
  staffId: string
  branches: string[]
  value: Record<string, string> | null | undefined
  fallback: string | null | undefined
  onChange: (v: Record<string, string> | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const current = value ?? {}

  async function set(branch: string, type: string) {
    if (busy) return
    const next: Record<string, string> = { ...current }
    if (type) next[branch] = type; else delete next[branch]
    setBusy(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staffId, employmentByBranch: Object.keys(next).length ? next : null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      onChange(Object.keys(next).length ? next : null)
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-2">
      <div className="text-xs font-semibold mb-1" style={{ color: '#475569' }}>Role per branch</div>
      <div className="space-y-1.5">
        {branches.map(b => (
          <div key={b} className="flex items-center gap-2">
            <span className="text-xs w-16" style={{ color: '#334155' }}>{b}</span>
            <select
              value={current[b] ?? ''}
              disabled={busy}
              onChange={e => set(b, e.target.value)}
              className="text-xs px-2 py-1 rounded-lg border disabled:opacity-50"
              style={{ borderColor: '#CBD5E1' }}
            >
              <option value="">
                Same as profile{fallback ? ` (${fallback})` : ''}
              </option>
              <option value="employee">Employee</option>
              <option value="consultant">Consultant</option>
            </select>
          </div>
        ))}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: '#64748B' }}>
        Payroll in the Accounting Hub uses this: a branch set to Employee lists them under
        Employees for that branch, Consultant lists them under Consultants. Left as
        &ldquo;same as profile&rdquo; everywhere, nothing changes.
      </p>
    </div>
  )
}

  async function toggle(branch: string) {
    if (busy) return
    const next = value.includes(branch) ? value.filter(b => b !== branch) : [...value, branch]
    setBusy(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staffId, extraBranches: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      onChange(next)
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wider w-28 flex-shrink-0"
            style={{ color: 'var(--mid-gray)' }}>Also at Branch</span>
      <div className="flex gap-4">
        {extra.map(b => {
          const checked = value.includes(b)
          return (
            <label key={b} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => toggle(b)}
                style={{ accentColor: 'var(--teal)', cursor: busy ? 'wait' : 'pointer' }}
              />
              <span className="text-xs font-semibold"
                    style={{ color: checked ? 'var(--teal)' : 'var(--mid-gray)' }}>
                {BRANCH_DISPLAY[b] ?? b}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function DeptBadge({ dept }: { dept: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'var(--off-white)', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
      {dept}
    </span>
  )
}

const filterInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontSize: '11px', padding: '3px 6px', borderRadius: '5px',
  border: '1px solid var(--light-gray)', background: '#fff',
  color: 'var(--charcoal)', outline: 'none',
}

// ── Existing duplicate scanner ────────────────────────────────────────────────
// Groups staff by lastName + first word of firstName + department + branch.
// Returns only groups with 2+ members (likely the same person entered twice).
function findExistingDuplicates(staff: StaffMember[]): StaffMember[][] {
  const groups = new Map<string, StaffMember[]>()
  for (const s of staff) {
    const key = [
      s.lastName.toUpperCase(),
      s.firstName.toUpperCase().split(/\s+/)[0],
      s.department,
      s.branch,
    ].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  return [...groups.values()].filter(g => g.length > 1)
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StaffClient({ role }: { role: string }) {
  const autoBranch = branchFromRole(role)

  const [staff,   setStaff]   = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  // Sort + filter
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState({ name: '', department: '', branch: '', email: '', phone: '', jobTitle: '', sex: '', employmentType: '' })

  // Merge duplicates
  const [mergeGroup,  setMergeGroup]  = useState<StaffMember[] | null>(null)
  const [mergeKeepId, setMergeKeepId] = useState<string>('')
  const [merging,     setMerging]     = useState(false)

  // Staff details popup — opens when an admin clicks a staff name.
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  // Roles allowed to view the full HR profile (TIN, SSS, banking, etc.).
  // Excludes FRONT_DESK and MARKETING_ADMIN by design.
  const canViewStaffDetails = ['ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN'].includes(role)

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // HR Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; created: number; updated: number; total: number } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/staff/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
        load()
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error') + ' (HTTP ' + res.status + ')')
      }
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : String(err)))
    }
    setSyncing(false)
  }

  async function load() {
    setLoading(true)
    const res = await fetch('/api/staff')
    if (res.ok) setStaff(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setPage(1) }, [filters, sortCol, sortDir])

  // ── Filtered + sorted view ────────────────────────────────────────────────
  const displayed = staff
    .filter(s => {
      if (autoBranch && s.branch !== autoBranch) return false
      const name = `${s.lastName} ${s.firstName}`.toLowerCase()
      if (filters.name       && !name.includes(filters.name.toLowerCase()))                          return false
      if (filters.department && s.department !== filters.department)                                  return false
      if (filters.branch     && s.branch !== filters.branch)                                          return false
      if (filters.email      && !(s.email  ?? '').toLowerCase().includes(filters.email.toLowerCase())) return false
      if (filters.phone      && !(s.phone  ?? '').includes(filters.phone))                            return false
      if (filters.jobTitle   && !(s.jobTitle ?? '').toLowerCase().includes(filters.jobTitle.toLowerCase())) return false
      if (filters.sex        && (s.sex ?? '') !== filters.sex) return false
      if (filters.employmentType && (s.employmentType ?? '') !== filters.employmentType) return false
      return true
    })
    .sort((a, b) => {
      let va = '', vb = ''
      switch (sortCol) {
        case 'name':       va = `${a.lastName} ${a.firstName}`;  vb = `${b.lastName} ${b.firstName}`; break
        case 'department': va = a.department;                     vb = b.department;                   break
        case 'branch':     va = a.branch;                         vb = b.branch;                       break
        case 'sex':        va = a.sex ?? '';                      vb = b.sex ?? '';                    break
        case 'email':      va = a.email ?? '';                    vb = b.email ?? '';                  break
        case 'phone':      va = a.phone ?? '';                    vb = b.phone ?? '';                  break
        case 'jobTitle':   va = a.jobTitle ?? '';                  vb = b.jobTitle ?? '';                break
        case 'employmentType': va = a.employmentType ?? ''; vb = b.employmentType ?? ''; break
        default:
          return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      }
      const cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    })

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: SortCol }) =>
    sortCol !== col
      ? <ChevronsUpDown size={11} style={{ color: '#bbb' }} />
      : sortDir === 'asc'
        ? <ChevronUp   size={11} style={{ color: 'var(--teal)' }} />
        : <ChevronDown size={11} style={{ color: 'var(--teal)' }} />

  const totalSBEA = staff.filter(s => s.branch === 'SBEA').length
  const totalSBGH = staff.filter(s => s.branch === 'SBGH').length

  // ── Merge handler ─────────────────────────────────────────────────────────
  async function handleMerge() {
    if (!mergeGroup || !mergeKeepId) return
    const deleteIds = mergeGroup.filter(s => s.id !== mergeKeepId).map(s => s.id)
    setMerging(true)
    for (const deleteId of deleteIds) {
      await fetch('/api/staff/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: mergeKeepId, deleteId }),
      })
    }
    setMerging(false)
    setMergeGroup(null)
    setMergeKeepId('')
    load()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const existingDuplicates   = findExistingDuplicates(staff)
  const paginatedDisplayed   = displayed.slice((page - 1) * pageSize, page * pageSize)
  const totalPages           = Math.max(1, Math.ceil(displayed.length / pageSize))

  const statCards = autoBranch
    ? [
        { label: `${autoBranch} Staff`, value: staff.length, icon: <Users size={18} style={{ color: 'var(--teal)' }} /> },
      ]
    : [
        { label: 'Total Staff', value: staff.length,  icon: <Users size={18} style={{ color: 'var(--teal)' }} /> },
        { label: 'East Branch',        value: totalSBEA, icon: <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>AHEA</span> },
        { label: 'Greenhills Branch',  value: totalSBGH, icon: <span className="text-xs font-bold" style={{ color: '#92400E' }}>AHGH</span> },
      ]

  const COLS: { col: SortCol; label: string }[] = [
    { col: 'name',       label: 'Name' },
    { col: 'department', label: 'Department' },
    { col: 'jobTitle',   label: 'Job Title' },
    { col: 'employmentType', label: 'Employment' },
    { col: 'branch',     label: 'Branch' },
    { col: 'sex',        label: 'Sex' },
    { col: 'email',      label: 'Email' },
    { col: 'phone',      label: 'Mobile' },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Clinic Tools
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Staff Module
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Staff data synced from the HR Platform. Update staff profiles at{' '}
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>hr.sapphireclinicseast.org</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--teal)', color: '#fff', opacity: syncing ? 0.7 : 1 }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync from HR'}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="rounded-xl px-5 py-3 flex items-center gap-2"
          style={{ background: '#ECFDF5', border: '1px solid #BBF7D0' }}>
          <CheckCircle2 size={15} style={{ color: '#065F46' }} />
          <span className="text-xs font-semibold" style={{ color: '#065F46' }}>
            Sync complete: {syncResult.created} created, {syncResult.updated} updated{syncResult.deleted > 0 ? `, ${syncResult.deleted} removed` : ''} ({syncResult.total} staff from HR Platform)
          </span>
          <button onClick={() => setSyncResult(null)} className="ml-auto p-1 rounded hover:bg-green-100">
            <X size={13} style={{ color: '#065F46' }} />
          </button>
        </div>
      )}

      {/* Pending Duplicates */}
      {existingDuplicates.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid #F97316' }}>
          <div className="flex items-center justify-between px-5 py-3"
            style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} style={{ color: '#F97316' }} />
              <span className="font-semibold text-sm" style={{ color: '#92400E', fontFamily: 'var(--font-display)' }}>
                Pending Duplicates — {existingDuplicates.length} group{existingDuplicates.length !== 1 ? 's' : ''} found
              </span>
            </div>
            <span className="text-xs" style={{ color: '#B45309' }}>
              Merge to consolidate records and preserve all schedules
            </span>
          </div>
          <div style={{ background: '#FFFBEB' }}>
            {existingDuplicates.map((group, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-3 px-5 py-3"
                style={{ borderBottom: idx < existingDuplicates.length - 1 ? '1px solid #FED7AA' : 'none' }}>
                {group.map((s, si) => (
                  <div key={s.id} className="flex items-center gap-2">
                    {si > 0 && <span className="text-xs font-bold" style={{ color: '#F97316' }}>vs</span>}
                    <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {s.lastName}, {s.firstName}
                    </span>
                    <DeptBadge dept={s.department} />
                    <BranchChip branch={s.branch} />
                  </div>
                ))}
                <button
                  onClick={() => {
                    const defaultKeep = [...group].sort((a, b) => b.firstName.length - a.firstName.length)[0]
                    setMergeKeepId(defaultKeep.id)
                    setMergeGroup(group)
                  }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#F97316', color: '#fff' }}
                >
                  <GitMerge size={13} /> Merge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${statCards.length}, 1fr)` }}>
        {statCards.map(card => (
          <div key={card.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
              {card.icon}
            </div>
            <div>
              <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{card.value}</p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>
        ) : staff.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
              <UserCog size={22} style={{ color: 'var(--teal)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>No staff records yet</p>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Click &quot;Sync from HR&quot; to pull staff data from the HR Platform.</p>
          </div>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                {/* Sort header row */}
                <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                  {COLS.map(({ col, label }) => (
                    <th key={col}
                      onClick={() => toggleSort(col)}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none"
                      style={{ color: sortCol === col ? 'var(--teal)' : 'var(--mid-gray)', whiteSpace: 'nowrap' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {label} <SortIcon col={col} />
                      </span>
                    </th>
                  ))}
                </tr>
                {/* Filter row */}
                <tr style={{ borderBottom: '1px solid var(--light-gray)', background: '#fdfdfd' }}>
                  {/* Name */}
                  <th className="px-3 py-1.5">
                    <input type="text" placeholder="Filter…" value={filters.name}
                      onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
                      style={filterInputStyle} />
                  </th>
                  {/* Department */}
                  <th className="px-3 py-1.5">
                    <select value={filters.department}
                      onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}
                      style={filterInputStyle}>
                      <option value="">All</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </th>
                  {/* Job Title */}
                  <th className="px-3 py-1.5">
                    <input type="text" placeholder="Filter…" value={filters.jobTitle ?? ''}
                      onChange={e => setFilters(f => ({ ...f, jobTitle: e.target.value }))}
                      style={filterInputStyle} />
                  </th>
                  {/* Employment — synced from HR Platform Staff Profile */}
                  <th className="px-3 py-1.5">
                    <select value={filters.employmentType}
                      onChange={e => setFilters(f => ({ ...f, employmentType: e.target.value }))}
                      style={filterInputStyle}>
                      <option value="">All</option>
                      <option value="employee">Employee</option>
                      <option value="consultant">Consultant</option>
                    </select>
                  </th>
                  {/* Branch — dropdown for admin, static label for branch-locked roles */}
                  <th className="px-3 py-1.5">
                    {!autoBranch ? (
                      <select value={filters.branch}
                        onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))}
                        style={filterInputStyle}>
                        <option value="">All</option>
                        <option value="SBEA">SBEA</option>
                        <option value="SBGH">SBGH</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--mid-gray)', paddingLeft: '6px' }}>{autoBranch}</span>
                    )}
                  </th>
                  {/* Sex */}
                  <th className="px-3 py-1.5">
                    <select value={filters.sex}
                      onChange={e => setFilters(f => ({ ...f, sex: e.target.value }))}
                      style={filterInputStyle}>
                      <option value="">All</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </th>
                  {/* Email */}
                  <th className="px-3 py-1.5">
                    <input type="text" placeholder="Filter…" value={filters.email}
                      onChange={e => setFilters(f => ({ ...f, email: e.target.value }))}
                      style={filterInputStyle} />
                  </th>
                  {/* Phone */}
                  <th className="px-3 py-1.5">
                    <input type="text" placeholder="Filter…" value={filters.phone}
                      onChange={e => setFilters(f => ({ ...f, phone: e.target.value }))}
                      style={filterInputStyle} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                      No staff match your filters. Try syncing from HR Platform.
                    </td>
                  </tr>
                ) : paginatedDisplayed.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--light-gray)' }}
                    className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">
                      {canViewStaffDetails ? (
                        <button
                          onClick={() => setSelectedStaff(s)}
                          className="text-left transition-colors hover:underline"
                          style={{ color: 'var(--charcoal)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                          title="Click to view full HR profile">
                          {s.lastName}, {s.firstName}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--charcoal)' }}>
                          {s.lastName}, {s.firstName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><DeptBadge dept={s.department} /></td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--mid-gray)' }}>
                      {s.jobTitle ? s.jobTitle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const empMap = s.branchEmployment ?? {}
                        const entries = Object.entries(empMap).filter(([, v]) => v?.employmentType)
                        const types = new Set(entries.map(([, v]) => v.employmentType))
                        if (entries.length >= 2 && types.size >= 2) {
                          return (
                            <div className="flex flex-col gap-1">
                              {entries.map(([br, v]) => {
                                const type = v.employmentType!
                                const isEmp = type === 'employee'
                                const isSBEA = br === 'SBEA'
                                return (
                                  <div key={br} className="flex items-center gap-1">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                      style={isEmp ? { background: '#DBEAFE', color: '#1E40AF' } : { background: '#FEF3C7', color: '#92400E' }}>
                                      {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </span>
                                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>·</span>
                                    <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                                      style={isSBEA ? { background: 'var(--pale-teal)', color: 'var(--teal)' } : { background: '#FFF3CD', color: '#92400E' }}>
                                      {BRANCH_DISPLAY[br] ?? br}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }
                        return s.employmentType
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={s.employmentType === 'employee'
                                ? { background: '#DBEAFE', color: '#1E40AF' }
                                : { background: '#FEF3C7', color: '#92400E' }}>
                              {s.employmentType.charAt(0).toUpperCase() + s.employmentType.slice(1)}
                            </span>
                          : <span style={{ color: 'var(--mid-gray)', fontSize: '13px' }}>—</span>
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <BranchChip branch={s.branch} />
                        {(s.extraBranches ?? []).filter(b => b !== s.branch).map(b => (
                          <BranchChip key={b} branch={b} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SexSelect staffId={s.id} value={s.sex} onChange={(v) => setStaff(prev => prev.map(x => x.id === s.id ? { ...x, sex: v } : x))} />
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--mid-gray)' }}>{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--mid-gray)' }}>{s.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination bar */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderTop: '1px solid var(--light-gray)', background: '#fff' }}>
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
                {displayed.length === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, displayed.length)}`} of {displayed.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: page === 1 ? 'var(--off-white)' : 'var(--pale-teal)', color: page === 1 ? 'var(--mid-gray)' : 'var(--teal)', border: '1px solid var(--light-gray)' }}>
                  ‹ Prev
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: page >= totalPages ? 'var(--off-white)' : 'var(--pale-teal)', color: page >= totalPages ? 'var(--mid-gray)' : 'var(--teal)', border: '1px solid var(--light-gray)' }}>
                  Next ›
                </button>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Staff Details Modal — surfaces every field synced from HR Hub.
          Visible ONLY to ADMIN / SBEA_ADMIN / SBGH_ADMIN. Defense-in-depth:
          even if a non-admin somehow set selectedStaff, the modal won't render. */}
      {selectedStaff && canViewStaffDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.45)' }}
             onClick={() => setSelectedStaff(null)}>
          <div className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
               style={{ background: '#fff' }}
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b flex items-start justify-between"
                 style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: 'var(--paper)' }}>
                  <UserCog size={18} style={{ color: 'var(--narra)' }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
                    {selectedStaff.lastName}, {selectedStaff.firstName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <DeptBadge dept={selectedStaff.department} />
                    <BranchChip branch={selectedStaff.branch} />
                    {selectedStaff.employmentType && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={selectedStaff.employmentType === 'employee'
                          ? { background: '#DBEAFE', color: '#1E40AF' }
                          : { background: '#FEF3C7', color: '#92400E' }}>
                        {selectedStaff.employmentType.charAt(0).toUpperCase() + selectedStaff.employmentType.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedStaff(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100"
                      title="Close">
                <X size={18} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {/* Body — sections of fields */}
            <div className="px-6 py-5 space-y-6 text-sm">
              <DetailSection title="Role">
                <DetailRow label="Employee ID"     value={selectedStaff.employeeId} mono />
                <DetailRow label="Job Title"       value={selectedStaff.jobTitle ? selectedStaff.jobTitle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null} />
                <DetailRow label="Department"      value={selectedStaff.department.replace(/_/g, ' ')} />
                <DetailRow label="Primary Branch"  value={selectedStaff.branch} />
                {role === 'ADMIN'
                  ? <ExtraBranchToggle
                      staffId={selectedStaff.id}
                      primaryBranch={selectedStaff.branch}
                      value={selectedStaff.extraBranches ?? []}
                      onChange={(v) => {
                        setSelectedStaff(s => s ? { ...s, extraBranches: v } : s)
                        setStaff(prev => prev.map(x => x.id === selectedStaff.id ? { ...x, extraBranches: v } : x))
                      }}
                    />
                  : (selectedStaff.extraBranches ?? []).filter(b => b !== selectedStaff.branch).length > 0
                    ? <DetailRow label="Also at" value={(selectedStaff.extraBranches ?? []).filter(b => b !== selectedStaff.branch).join(', ')} />
                    : null
                }
                <DetailRow label="Employment"      value={selectedStaff.employmentType ? (selectedStaff.employmentType.charAt(0).toUpperCase() + selectedStaff.employmentType.slice(1)) : null} />
                {role === 'ADMIN' && (
                  <EmploymentByBranchEditor
                    staffId={selectedStaff.id}
                    branches={Array.from(new Set([selectedStaff.branch, ...(selectedStaff.extraBranches ?? [])])).filter(Boolean)}
                    value={selectedStaff.employmentByBranch}
                    fallback={selectedStaff.employmentType}
                    onChange={(v) => {
                      setSelectedStaff(s => s ? { ...s, employmentByBranch: v } : s)
                      setStaff(prev => prev.map(x => x.id === selectedStaff.id ? { ...x, employmentByBranch: v } : x))
                    }}
                  />
                )}
              </DetailSection>

              <DetailSection title="Contact">
                <DetailRow label="Email"     value={selectedStaff.email} />
                <DetailRow label="Phone"     value={selectedStaff.phone} mono />
                <DetailRow label="Birthday"  value={selectedStaff.dob ? new Date(selectedStaff.dob).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                <DetailRow label="Sex"       value={selectedStaff.sex} />
              </DetailSection>

              <DetailSection title="Government IDs"
                             note="Sensitive — synced one-way from HR Hub. Edit in HR Platform.">
                <DetailRow label="TIN"        value={selectedStaff.tin} mono />
                <DetailRow label="SSS"        value={selectedStaff.sss} mono />
                <DetailRow label="Pag-IBIG"   value={selectedStaff.pagibig} mono />
                <DetailRow label="PhilHealth" value={selectedStaff.philhealth} mono />
              </DetailSection>

              <DetailSection title="Banking"
                             note="Sensitive — synced one-way from HR Hub. Edit in HR Platform.">
                <DetailRow label="Bank Name"        value={selectedStaff.bankName} />
                <DetailRow label="Bank Account No." value={selectedStaff.bankAccountNo} mono />
              </DetailSection>

              <DetailSection title="System">
                <DetailRow label="HR Platform ID" value={selectedStaff.hrPlatformId} mono small />
                <DetailRow label="Created"        value={selectedStaff.createdAt ? new Date(selectedStaff.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null} small />
                {selectedStaff.updatedAt && (
                  <DetailRow label="Last Synced"  value={new Date(selectedStaff.updatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} small />
                )}
              </DetailSection>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t flex items-center justify-between"
                 style={{ borderColor: 'var(--light-gray)', background: 'var(--paper)' }}>
              <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                All fields except Sex and Extra Branches flow one-way from HR Hub. To edit, use the HR Platform Staff Profile.
              </p>
              <button onClick={() => setSelectedStaff(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--narra)', color: '#fff' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md shadow-xl" style={{ background: '#fff' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                <GitMerge size={18} style={{ color: '#F97316' }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                  Merge Duplicate Staff
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  Select which record to keep. All schedules will be transferred to it.
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {mergeGroup.map(s => (
                <label key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                  style={{
                    border: mergeKeepId === s.id ? '1.5px solid #F97316' : '1.5px solid var(--light-gray)',
                    background: mergeKeepId === s.id ? '#FFF7ED' : '#FAFAFA',
                  }}>
                  <input type="radio" name="mergeKeep" value={s.id}
                    checked={mergeKeepId === s.id}
                    onChange={() => setMergeKeepId(s.id)}
                    style={{ accentColor: '#F97316' }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {s.lastName}, {s.firstName}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <DeptBadge dept={s.department} />
                      <BranchChip branch={s.branch} />
                    </div>
                  </div>
                  {mergeKeepId === s.id && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#F97316', color: '#fff' }}>Keep</span>
                  )}
                </label>
              ))}
            </div>

            <p className="text-xs mb-5 px-1" style={{ color: 'var(--mid-gray)' }}>
              The other record will be permanently deleted after all schedules, surveys, and history are transferred to the kept record.
            </p>

            <div className="flex gap-2 justify-end">
              <button onClick={() => { setMergeGroup(null); setMergeKeepId('') }}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Cancel
              </button>
              <button onClick={handleMerge} disabled={!mergeKeepId || merging}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#F97316', color: '#fff', opacity: (!mergeKeepId || merging) ? 0.7 : 1 }}>
                <GitMerge size={14} />
                {merging ? 'Merging…' : 'Merge & Remove Duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Staff details modal helpers ──────────────────────────────────
function DetailSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
         style={{ color: 'var(--mid-gray)' }}>{title}</p>
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
          {children}
        </div>
      </div>
      {note && (
        <p className="text-[11px] mt-1.5 px-1 italic" style={{ color: 'var(--mid-gray)' }}>{note}</p>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono, small }: { label: string; value: string | null | undefined; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5" style={{ background: '#fff' }}>
      <span className="text-[11px] font-medium uppercase tracking-wider w-28 flex-shrink-0"
            style={{ color: 'var(--mid-gray)' }}>{label}</span>
      <span className={small ? 'text-[12px]' : 'text-[13px]'}
            style={{
              color: value ? 'var(--ink)' : 'var(--mid-gray)',
              fontFamily: mono && value ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
              wordBreak: 'break-all',
            }}>
        {value && value.toString().trim().length > 0 ? value : '—'}
      </span>
    </div>
  )
}
