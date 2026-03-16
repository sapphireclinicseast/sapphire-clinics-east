'use client'

import React, { useEffect, useState, useRef } from 'react'
import {
  UserCog, Plus, Pencil, Trash2, X, Users,
  ChevronUp, ChevronDown, ChevronsUpDown, Upload, CheckCircle2,
} from 'lucide-react'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS'] as const
type Department = typeof DEPARTMENTS[number]

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  department: Department
  branch: string
  createdAt: string
}

interface CsvRow {
  _id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  department: string
  branch: string
  _error: string
}

type SortCol = 'name' | 'department' | 'branch' | 'email' | 'phone'
type SortDir = 'asc' | 'desc'

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '',
  department: '' as Department | '', branch: 'SBEA',
}

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

const inputStyle = {
  border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff',
  color: 'var(--charcoal)', borderRadius: '0.5rem',
  padding: '0.45rem 0.7rem', fontSize: '0.85rem', width: '100%', outline: 'none',
}

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600,
  color: 'var(--mid-gray)', marginBottom: '0.25rem',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
}

const filterInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontSize: '11px', padding: '3px 6px', borderRadius: '5px',
  border: '1px solid var(--light-gray)', background: '#fff',
  color: 'var(--charcoal)', outline: 'none',
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_\-"]+/g, '')
  const headers = lines[0].split(',').map(h => norm(h))

  const find = (...names: string[]) =>
    names.reduce<number>((found, n) => found !== -1 ? found : headers.indexOf(n), -1)

  const iFirst  = find('firstname', 'first', 'givenname')
  const iLast   = find('lastname', 'last', 'surname', 'familyname')
  const iEmail  = find('email', 'emailaddress', 'mail')
  const iPhone  = find('phone', 'mobile', 'contact', 'mobilenumber')
  const iDept   = find('department', 'dept')
  const iBranch = find('branch')

  return lines.slice(1)
    .map((line, idx) => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const g = (i: number) => (i >= 0 ? cols[i] ?? '' : '').trim()
      const dept   = g(iDept).toUpperCase()
      const branch = g(iBranch).toUpperCase()
      const row: CsvRow = {
        _id: `csv-${idx}`,
        firstName: g(iFirst), lastName: g(iLast),
        email: g(iEmail), phone: g(iPhone),
        department: dept, branch,
        _error: '',
      }
      if (!row.firstName)        row._error = 'Missing first name'
      else if (!row.lastName)    row._error = 'Missing last name'
      else if (!row.department)  row._error = 'Missing department'
      else if (!(DEPARTMENTS as readonly string[]).includes(row.department))
        row._error = `Unknown dept: ${row.department}`
      else if (row.branch && !['SBEA', 'SBGH'].includes(row.branch))
        row._error = `Unknown branch: ${row.branch}`
      return row
    })
    .filter(r => r.firstName || r.lastName || r.department) // skip blank lines
}

// ── StaffForm (unchanged) ─────────────────────────────────────────────────────
function StaffForm({
  values, onChange, onSubmit, onCancel, error, submitting, submitLabel, needsBranchSelect,
}: {
  values: typeof EMPTY_FORM
  onChange: (v: typeof EMPTY_FORM) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  error: string
  submitting: boolean
  submitLabel: string
  needsBranchSelect: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#FEE2E2', color: '#DC2626' }}>
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>First Name</label>
          <input style={inputStyle} placeholder="JUAN" value={values.firstName}
            onChange={e => onChange({ ...values, firstName: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Last Name</label>
          <input style={inputStyle} placeholder="DELA CRUZ" value={values.lastName}
            onChange={e => onChange({ ...values, lastName: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" style={inputStyle} placeholder="optional" value={values.email}
            onChange={e => onChange({ ...values, email: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Mobile Number</label>
          <input style={inputStyle} placeholder="optional" value={values.phone}
            onChange={e => onChange({ ...values, phone: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Department</label>
          <select style={inputStyle} value={values.department}
            onChange={e => onChange({ ...values, department: e.target.value as Department })}>
            <option value="">Select department</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {needsBranchSelect && (
          <div>
            <label style={labelStyle}>Branch</label>
            <select style={inputStyle} value={values.branch}
              onChange={e => onChange({ ...values, branch: e.target.value })}>
              <option value="SBEA">SBEA — Sandbox East</option>
              <option value="SBGH">SBGH — Sandbox Greenhills</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="px-4 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--teal)', color: '#fff', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StaffClient({ role }: { role: string }) {
  const autoBranch       = branchFromRole(role)
  const needsBranchSelect = !autoBranch

  const [staff,        setStaff]        = useState<StaffMember[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showAdd,      setShowAdd]      = useState(false)
  const [form,         setForm]         = useState({ ...EMPTY_FORM })
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState('')
  const [editId,       setEditId]       = useState<string | null>(null)
  const [editForm,     setEditForm]     = useState({ ...EMPTY_FORM })
  const [editSaving,   setEditSaving]   = useState(false)
  const [editError,    setEditError]    = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  // Sort + filter
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState({ name: '', department: '', branch: '', email: '', phone: '' })

  // CSV import
  const fileRef        = useRef<HTMLInputElement>(null)
  const [csvRows,      setCsvRows]      = useState<CsvRow[]>([])
  const [csvSelected,  setCsvSelected]  = useState<Set<string>>(new Set())
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress,  setCsvProgress]  = useState({ done: 0, total: 0, errors: 0 })
  const [csvDone,      setCsvDone]      = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/staff')
    if (res.ok) setStaff(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.firstName.trim() || !form.lastName.trim() || !form.department) {
      setFormError('First name, last name, and department are required.')
      return
    }
    if (needsBranchSelect && !form.branch) { setFormError('Branch is required.'); return }
    setSaving(true)
    const res = await fetch('/api/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form }),
    })
    setSaving(false)
    if (res.ok) { setForm({ ...EMPTY_FORM }); setShowAdd(false); load() }
    else { const d = await res.json(); setFormError(d.error ?? 'Failed to create staff member.') }
  }

  function startEdit(s: StaffMember) {
    setEditId(s.id)
    setEditForm({ firstName: s.firstName, lastName: s.lastName, email: s.email ?? '', phone: s.phone ?? '', department: s.department, branch: s.branch })
    setEditError('')
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    setEditError('')
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.department) {
      setEditError('First name, last name, and department are required.')
      return
    }
    setEditSaving(true)
    const res = await fetch('/api/staff', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editForm }),
    })
    setEditSaving(false)
    if (res.ok) { setEditId(null); load() }
    else { const d = await res.json(); setEditError(d.error ?? 'Failed to update.') }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch('/api/staff', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteTarget.id }),
    })
    setDeleting(false)
    setDeleteTarget(null)
    load()
  }

  // ── CSV handlers ──────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCsv(ev.target?.result as string)
      setCsvRows(rows)
      setCsvSelected(new Set(rows.filter(r => !r._error).map(r => r._id)))
      setCsvDone(false)
      setCsvProgress({ done: 0, total: 0, errors: 0 })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleCsvImport() {
    const toImport = csvRows.filter(r => csvSelected.has(r._id) && !r._error)
    if (!toImport.length) return
    setCsvImporting(true)
    setCsvProgress({ done: 0, total: toImport.length, errors: 0 })
    let errors = 0
    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i]
      const branch = autoBranch ?? (row.branch || 'SBEA')
      const res = await fetch('/api/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: row.firstName, lastName: row.lastName,
          email: row.email || null, phone: row.phone || null,
          department: row.department, branch,
        }),
      })
      if (!res.ok) errors++
      setCsvProgress({ done: i + 1, total: toImport.length, errors })
    }
    setCsvImporting(false)
    setCsvDone(true)
    load()
  }

  const csvValidCount    = csvRows.filter(r => !r._error).length
  const csvSelectedValid = [...csvSelected].filter(id => !csvRows.find(r => r._id === id)?._error).length
  const allValidSelected = csvValidCount > 0 && csvRows.filter(r => !r._error).every(r => csvSelected.has(r._id))

  function toggleAllCsv() {
    const validIds = csvRows.filter(r => !r._error).map(r => r._id)
    setCsvSelected(prev => {
      const next = new Set(prev)
      if (allValidSelected) validIds.forEach(id => next.delete(id))
      else validIds.forEach(id => next.add(id))
      return next
    })
  }

  function toggleCsvRow(id: string) {
    setCsvSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
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
            Manage clinic staff records across branches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--off-white)', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}
          >
            <Upload size={14} /> Import CSV
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setFormError('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--teal)', color: '#fff' }}
          >
            {showAdd ? <X size={15} /> : <Plus size={15} />}
            {showAdd ? 'Cancel' : 'Add Staff'}
          </button>
        </div>
      </div>

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

      {/* Add Form */}
      {showAdd && (
        <div className="rounded-xl p-5" style={{ background: 'var(--pale-teal)', border: '1px solid rgba(26,123,138,0.2)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
            New Staff Member
          </p>
          <StaffForm
            values={form} onChange={setForm} onSubmit={handleAdd}
            onCancel={() => { setShowAdd(false); setForm({ ...EMPTY_FORM }); setFormError('') }}
            error={formError} submitting={saving} submitLabel="Add Staff" needsBranchSelect={needsBranchSelect}
          />
        </div>
      )}

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
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Click &quot;Add Staff&quot; to create the first record.</p>
          </div>
        ) : (
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
                  <th className="px-4 py-3" />
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                      No staff match your filters.
                    </td>
                  </tr>
                ) : displayed.map(s => (
                  <React.Fragment key={s.id}>
                    <tr style={{ borderBottom: editId === s.id ? 'none' : '1px solid var(--light-gray)' }}
                      className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                        {s.lastName}, {s.firstName}
                      </td>
                      <td className="px-4 py-3"><DeptBadge dept={s.department} /></td>
                      <td className="px-4 py-3"><BranchChip branch={s.branch} /></td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--mid-gray)' }}>{s.email ?? '—'}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--mid-gray)' }}>{s.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => editId === s.id ? setEditId(null) : startEdit(s)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-gray-100" title="Edit">
                            <Pencil size={14} style={{ color: 'var(--teal)' }} />
                          </button>
                          <button onClick={() => setDeleteTarget(s)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-red-50" title="Delete">
                            <Trash2 size={14} style={{ color: '#DC2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editId === s.id && (
                      <tr style={{ borderBottom: '1px solid var(--light-gray)' }}>
                        <td colSpan={6} className="px-4 py-4" style={{ background: 'var(--pale-teal)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>
                            Edit Staff Member
                          </p>
                          <StaffForm
                            values={editForm} onChange={setEditForm} onSubmit={handleEdit}
                            onCancel={() => { setEditId(null); setEditError('') }}
                            error={editError} submitting={editSaving}
                            submitLabel="Save Changes" needsBranchSelect={needsBranchSelect}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-xl" style={{ background: '#fff' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEE2E2' }}>
                <Trash2 size={18} style={{ color: '#DC2626' }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                  Delete Staff Member
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--charcoal)' }}>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget.lastName}, {deleteTarget.firstName}</span>?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#DC2626', color: '#fff', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {csvRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl shadow-2xl flex flex-col"
            style={{ background: '#fff', width: '100%', maxWidth: '800px', maxHeight: '85vh', overflow: 'hidden' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div>
                <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Import Staff from CSV
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  {csvRows.length} row{csvRows.length !== 1 ? 's' : ''} found —{' '}
                  {csvValidCount} valid, {csvRows.length - csvValidCount} with errors
                </p>
              </div>
              <button onClick={() => { setCsvRows([]); setCsvSelected(new Set()) }}
                className="p-2 rounded-lg hover:bg-gray-100">
                <X size={16} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {/* Progress bar */}
            {csvImporting && (
              <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--pale-teal)' }}>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--teal)' }}>
                  <span>Importing… {csvProgress.done} / {csvProgress.total}</span>
                  {csvProgress.errors > 0 && <span style={{ color: '#DC2626' }}>{csvProgress.errors} error(s)</span>}
                </div>
                <div style={{ height: '4px', background: 'rgba(26,123,138,0.15)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px', background: 'var(--teal)', transition: 'width 0.3s',
                    width: `${Math.round((csvProgress.done / csvProgress.total) * 100)}%`,
                  }} />
                </div>
              </div>
            )}

            {/* Done banner */}
            {csvDone && (
              <div className="px-6 py-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--light-gray)', background: '#ECFDF5' }}>
                <CheckCircle2 size={15} style={{ color: '#065F46' }} />
                <span className="text-xs font-semibold" style={{ color: '#065F46' }}>
                  Done! {csvProgress.done - csvProgress.errors} imported.
                  {csvProgress.errors > 0 && ` ${csvProgress.errors} failed.`}
                </span>
              </div>
            )}

            {/* Preview table */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                    <th className="px-4 py-2.5 text-center" style={{ width: '40px' }}>
                      <input type="checkbox"
                        checked={allValidSelected}
                        onChange={toggleAllCsv}
                        disabled={csvValidCount === 0}
                        style={{ cursor: csvValidCount === 0 ? 'not-allowed' : 'pointer', accentColor: 'var(--teal)' }}
                        title="Select all valid rows"
                      />
                    </th>
                    {['Last Name', 'First Name', 'Department', 'Branch', 'Email', 'Mobile', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--mid-gray)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map(row => {
                    const isSelected = csvSelected.has(row._id)
                    const hasError   = !!row._error
                    return (
                      <tr key={row._id} style={{
                        borderBottom: '1px solid var(--light-gray)',
                        background: hasError ? '#FFF9F9' : isSelected ? '#F0FBF9' : '#fff',
                        opacity: hasError ? 0.65 : 1,
                      }}>
                        <td className="px-4 py-2 text-center">
                          <input type="checkbox"
                            checked={isSelected && !hasError}
                            disabled={hasError}
                            onChange={() => !hasError && toggleCsvRow(row._id)}
                            style={{ cursor: hasError ? 'not-allowed' : 'pointer', accentColor: 'var(--teal)' }}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{row.lastName || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{row.firstName || '—'}</td>
                        <td className="px-3 py-2">
                          {row.department
                            ? <DeptBadge dept={row.department} />
                            : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {row.branch
                            ? <BranchChip branch={row.branch} />
                            : autoBranch
                              ? <BranchChip branch={autoBranch} />
                              : <span style={{ color: '#aaa', fontSize: '11px' }}>SBEA (default)</span>}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{row.email || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{row.phone || '—'}</td>
                        <td className="px-3 py-2">
                          {hasError
                            ? <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#FEE2E2', color: '#DC2626' }}>{row._error}</span>
                            : <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#ECFDF5', color: '#065F46' }}>Valid</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-3"
              style={{ borderTop: '1px solid var(--light-gray)' }}>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                {csvSelectedValid} of {csvValidCount} valid row{csvValidCount !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setCsvRows([]); setCsvSelected(new Set()); setCsvDone(false) }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  {csvDone ? 'Close' : 'Cancel'}
                </button>
                {!csvDone && (
                  <button
                    onClick={handleCsvImport}
                    disabled={csvImporting || csvSelectedValid === 0}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium"
                    style={{
                      background: 'var(--teal)', color: '#fff',
                      opacity: (csvImporting || csvSelectedValid === 0) ? 0.6 : 1,
                    }}>
                    {csvImporting ? 'Importing…' : `Import ${csvSelectedValid} Staff`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
