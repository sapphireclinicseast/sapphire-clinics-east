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
  department: Department
  branch: string
  jobTitle: string | null
  employmentType: string | null
  hrPlatformId: string | null
  createdAt: string
}

type SortCol = 'name' | 'department' | 'branch' | 'email' | 'phone' | 'jobTitle'
type SortDir = 'asc' | 'desc'

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SBEA'
  if (role.startsWith('SBGH_')) return 'SBGH'
  return null
}

function BranchChip({ branch }: { branch: string }) {
  const isSBEA = branch === 'SBEA'
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={
      isSBEA
        ? { background: 'var(--pale-teal)', color: 'var(--teal)' }
        : { background: '#FFF3CD', color: '#92400E' }
    }>
      {branch}
    </span>
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
  const [filters, setFilters] = useState({ name: '', department: '', branch: '', email: '', phone: '', jobTitle: '' })

  // Merge duplicates
  const [mergeGroup,  setMergeGroup]  = useState<StaffMember[] | null>(null)
  const [mergeKeepId, setMergeKeepId] = useState<string>('')
  const [merging,     setMerging]     = useState(false)

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
      if (res.ok) {
        const data = await res.json()
        setSyncResult(data)
        load()
      }
    } catch { /* ignore */ }
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
      return true
    })
    .sort((a, b) => {
      let va = '', vb = ''
      switch (sortCol) {
        case 'name':       va = `${a.lastName} ${a.firstName}`;  vb = `${b.lastName} ${b.firstName}`; break
        case 'department': va = a.department;                     vb = b.department;                   break
        case 'branch':     va = a.branch;                         vb = b.branch;                       break
        case 'email':      va = a.email ?? '';                    vb = b.email ?? '';                  break
        case 'phone':      va = a.phone ?? '';                    vb = b.phone ?? '';                  break
        case 'jobTitle':   va = a.jobTitle ?? '';                  vb = b.jobTitle ?? '';                break
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
        { label: 'SBEA',        value: totalSBEA,      icon: <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>SBEA</span> },
        { label: 'SBGH',        value: totalSBGH,      icon: <span className="text-xs font-bold" style={{ color: '#92400E' }}>SBGH</span> },
      ]

  const COLS: { col: SortCol; label: string }[] = [
    { col: 'name',       label: 'Name' },
    { col: 'department', label: 'Department' },
    { col: 'jobTitle',   label: 'Job Title' },
    { col: 'branch',     label: 'Branch' },
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
            Sync complete: {syncResult.created} created, {syncResult.updated} updated ({syncResult.total} staff from HR Platform)
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
                    <td colSpan={6} className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                      No staff match your filters. Try syncing from HR Platform.
                    </td>
                  </tr>
                ) : paginatedDisplayed.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--light-gray)' }}
                    className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                      {s.lastName}, {s.firstName}
                    </td>
                    <td className="px-4 py-3"><DeptBadge dept={s.department} /></td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--mid-gray)' }}>
                      {s.jobTitle ? s.jobTitle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'}
                    </td>
                    <td className="px-4 py-3"><BranchChip branch={s.branch} /></td>
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
