'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Users as UsersIcon,
  Search,
  Building2,
  RefreshCw,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import Pagination from '@/components/ui/Pagination'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

interface User {
  id: string
  name: string
  email: string
  role: string
  branch: string | null
  branches?: string[]
  disabled?: boolean
  lastLoginAt: string | null
  createdAt: string
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'ACCOUNTANT', label: 'Accountant (all modules except Analysis)' },
  { value: 'BOOKKEEPER', label: 'Bookkeeper (all modules except Analysis; no audit)' },
  { value: 'PAYROLL_OFFICER', label: 'Payroll Officer (Services, POS, Payroll)' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'AHEA_ADMIN', label: 'AHEA Admin' },
  { value: 'AHGH_ADMIN', label: 'AHGH Admin' },
  { value: 'VERDANA_ADMIN', label: 'Verdana Admin' },
  { value: 'AHEA_FRONTDESK', label: 'AHEA Front Desk' },
  { value: 'AHGH_FRONTDESK', label: 'AHGH Front Desk' },
  { value: 'HMO_OFFICER', label: 'HMO Officer' },
  { value: 'MEDREP', label: 'Medical Representative (Reports — Gross Revenue only)' },
  { value: 'INVESTOR', label: 'Investor (Financial Reports view-only — no drill-downs; BS/CF whole-company)' },
]

const BRANCH_OPTIONS = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  ACCOUNTANT: 'Accountant',
  BOOKKEEPER: 'Bookkeeper',
  PAYROLL_OFFICER: 'Payroll Officer',
  VIEWER: 'Viewer',
  AHEA_ADMIN: 'AHEA Admin',
  AHGH_ADMIN: 'AHGH Admin',
  VERDANA_ADMIN: 'Verdana Admin',
  AHEA_FRONTDESK: 'AHEA Front Desk',
  AHGH_FRONTDESK: 'AHGH Front Desk',
  HMO_OFFICER: 'HMO Officer',
  MEDREP: 'Medical Representative',
  INVESTOR: 'Investor',
}

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}

// Display-only grouping of roles for the summary cards (access rules live in the API / sidebar).
// Every user falls in exactly one group: deactivated first, then by role.
type UserGroup = 'finance' | 'branch' | 'reports' | 'off'
const GROUP_ROLES: Record<Exclude<UserGroup, 'off'>, string[]> = {
  finance: ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER'],
  branch: ['AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'PAYROLL_OFFICER', 'HMO_OFFICER'],
  reports: ['MEDREP', 'INVESTOR'],
}
const GROUP_META: Record<UserGroup, { label: string; sub: string; line: string }> = {
  finance: { label: 'Finance team', sub: 'Admin, accountant, bookkeeper, viewer', line: '#4A8073' },
  branch: { label: 'Branch staff & officers', sub: 'Branch admins, front desk, payroll, HMO', line: '#2563eb' },
  reports: { label: 'Reports only', sub: 'Medical reps and investors', line: '#8A9AA0' },
  off: { label: 'Deactivated', sub: 'Cannot sign in · records kept', line: '#dc2626' },
}
const userGroup = (u: { role: string; disabled?: boolean }): UserGroup =>
  u.disabled ? 'off'
  : GROUP_ROLES.finance.includes(u.role) ? 'finance'
  : GROUP_ROLES.reports.includes(u.role) ? 'reports'
  : 'branch'
const TH = 'text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap text-[var(--mid-gray)]'

export default function UsersPage() {
  const { data: session, status } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [usrPage, setUsrPage] = useState(1)
  const [usrPageSize, setUsrPageSize] = useState(25)
  const [saving, setSaving] = useState(false)
  const [groupFilter, setGroupFilter] = useState<UserGroup | ''>('')

  // Form fields
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('VIEWER')
  const [formBranches, setFormBranches] = useState<string[]>([])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users?pageSize=100')
      const data = await res.json()
      setUsers(data.data || [])
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    if (session?.user?.role !== 'ADMIN') {
      redirect('/dashboard')
    }
    fetchUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function openCreateModal() {
    setEditingUser(null)
    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormRole('VIEWER')
    setFormBranches([])
    setError('')
    setModalOpen(true)
  }

  function openEditModal(user: User) {
    setEditingUser(user)
    setFormName(user.name)
    setFormEmail(user.email)
    setFormPassword('')
    setFormRole(user.role)
    setFormBranches(user.branches?.length ? user.branches : (user.branch && user.branch !== 'ALL' ? [user.branch] : []))
    setError('')
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      name: formName,
      email: formEmail,
      role: formRole,
      branches: formBranches,
    }

    if (editingUser) {
      body.id = editingUser.id
      if (formPassword) body.password = formPassword
    } else {
      body.password = formPassword
    }

    try {
      const res = await fetch('/api/users', {
        method: editingUser ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setSaving(false)
        return
      }

      setModalOpen(false)
      fetchUsers()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete')
        return
      }
      setDeleteConfirm(null)
      fetchUsers()
    } catch {
      setError('Network error')
    }
  }

  async function handleReactivate(id: string) {
    try {
      const res = await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, disabled: false }) })
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to reactivate'); return }
      fetchUsers()
    } catch { setError('Network error') }
  }

  const filteredUsers = users.filter(
    (u) =>
      (!groupFilter || userGroup(u) === groupFilter) &&
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()))
  )
  const groupCount = (g: UserGroup) => users.filter(u => userGroup(u) === g).length
  const pickGroup = (g: UserGroup) => { setGroupFilter(f => (f === g ? '' : g)); setUsrPage(1) }
  const paginatedUsers = filteredUsers.slice((usrPage - 1) * usrPageSize, usrPage * usrPageSize)

  if (status !== 'authenticated' && loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <UsersIcon size={22} style={{ color: 'var(--teal)' }} /> Users
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Hub sign-ins and the role that decides what each person can open. Deactivating keeps a user&apos;s records and audit trail.
          </p>
        </div>
        <button onClick={openCreateModal} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
          <Plus size={15} /> Add user
        </button>
      </div>

      {/* Summary cards — each user is in exactly one; click to show only that group */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['finance', 'branch', 'reports', 'off'] as UserGroup[]).map(g => {
          const n = groupCount(g)
          const m = GROUP_META[g]
          return (
            <StatCard key={g} loading={loading} label={m.label} value={String(n)} sub={m.sub}
              tone={n === 0 ? 'zero' : g === 'off' ? 'red' : 'zero'} accent={n && g !== 'off' ? { line: m.line } : undefined}
              active={groupFilter === g} onClick={() => pickGroup(g)} />
          )
        })}
      </div>

      {/* Error */}
      {error && !modalOpen && (
        <div className="px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
            <input
              type="text"
              aria-label="Search users"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setUsrPage(1) }}
              className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white outline-none focus:border-[var(--teal)]"
              style={{ borderColor: 'var(--light-gray)' }}
            />
          </div>
          {groupFilter && (
            <button onClick={() => { setGroupFilter(''); setUsrPage(1) }} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
              {GROUP_META[groupFilter].label} <X size={12} />
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{loading ? 'Loading…' : `${filteredUsers.length} of ${users.length}`}</span>
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            {(['finance', 'branch', 'reports', 'off'] as UserGroup[]).map(g => (
              <span key={g} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GROUP_META[g].line }} />{GROUP_META[g].label}</span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--hr-head)' }}>
                <th className={TH}>Name</th>
                <th className={TH}>Email</th>
                <th className={TH}>Role</th>
                <th className={TH}>Branch</th>
                <th className={TH}>Last login</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3, 4].map(i => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={6} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                    <UsersIcon size={28} className="mx-auto mb-2 opacity-40" />
                    <p>{users.length === 0 ? 'No users yet.' : 'No users match this filter.'}</p>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t transition-colors hover:bg-[#fafcf6]"
                    style={{ borderColor: 'var(--hr-line)' }}
                  >
                    <td className="px-4 py-2.5 font-semibold" style={{ color: user.disabled ? 'var(--mid-gray)' : 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${GROUP_META[userGroup(user)].line}` }}>
                      {user.name}
                      {user.disabled && <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle" style={{ background: '#fee2e2', color: '#991b1b' }}>Deactivated</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {user.email}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={
                          user.role === 'ADMIN'
                            ? { background: '#fef3c7', color: '#92400e' }
                            : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
                        }
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {(() => {
                        const bs = user.branches?.length ? user.branches : (user.branch && user.branch !== 'ALL' ? [user.branch] : [])
                        if (bs.length === 0) return 'All branches'
                        return (
                          <span className="flex flex-wrap gap-1">
                            {bs.map(b => <span key={b} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f1f5f2', color: 'var(--mid-gray)' }}>{BRANCH_LABELS[b] || b}</span>)}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap font-mono" style={{ color: user.lastLoginAt ? 'var(--mid-gray)' : 'var(--hr-faint)' }}>
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1.5 rounded-md hover:bg-[var(--pale-teal)] transition-colors"
                          title="Edit"
                          aria-label={`Edit ${user.name}`}
                        >
                          <Pencil size={14} style={{ color: 'var(--teal)' }} />
                        </button>
                        {user.id !== session?.user?.id && (
                          user.disabled ? (
                            <button
                              onClick={() => handleReactivate(user.id)}
                              className={hrBtn.ghost}
                              style={{ borderColor: '#bbf7d0', color: '#166534' }}
                              title="Reactivate"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(user.id)}
                              className="p-1.5 rounded-md hover:bg-red-50 transition-colors"
                              title="Deactivate"
                              aria-label={`Deactivate ${user.name}`}
                            >
                              <Trash2 size={14} className="text-red-500" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filteredUsers.length > 0 && (
          <div className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
            <Pagination totalItems={filteredUsers.length} page={usrPage} pageSize={usrPageSize}
              onPageChange={setUsrPage} onPageSizeChange={setUsrPageSize} />
          </div>
        )}
      </div>

      {/* HR Branches Registry sync */}
      <HrBranchesCard />

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-[17px] font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Deactivate user
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>
              This deactivates the account — the user can no longer log in, but their records and audit trail are preserved. You can reactivate them later.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={hrBtn.outline}
                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="inline-flex items-center h-9 px-4 rounded-lg text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-[17px] font-bold"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
              >
                {editingUser ? 'Edit user' : 'Add user'}
              </h3>
              <button onClick={() => setModalOpen(false)} aria-label="Close" className="p-1 hover:bg-[var(--pale-teal)] rounded-md">
                <X size={20} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Password {editingUser && <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required={!editingUser}
                  minLength={8}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                  placeholder={editingUser ? 'Leave blank to keep current' : 'Minimum 8 characters'}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Branch access <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(tick one or more; none = all branches)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BRANCH_OPTIONS.filter(b => b.value !== 'ALL').map((b) => {
                    const on = formBranches.includes(b.value)
                    return (
                      <label key={b.value} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer select-none" style={{ borderColor: on ? 'var(--teal)' : 'var(--light-gray)', background: on ? 'var(--pale-teal)' : 'white' }}>
                        <input type="checkbox" checked={on} onChange={() => setFormBranches(prev => prev.includes(b.value) ? prev.filter(x => x !== b.value) : [...prev, b.value])} className="w-4 h-4 accent-teal-600" />
                        {b.label}
                      </label>
                    )
                  })}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                  {formBranches.length === 0 ? 'All branches' : formBranches.length === 1 ? 'Locked to this one branch' : `${formBranches.length} branches`}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-lg border bg-white text-sm font-semibold transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors hover:bg-[var(--deep-teal)] disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}
                >
                  {saving ? 'Saving…' : editingUser ? 'Update user' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── HR Branches Registry sync ───────────────────────────────────────────────
// HR Platform is the source of truth for branch identity/contact config
// (name, TIN, address, emails). This pulls a local read-only cache via
// POST /api/branches/sync — same admin-triggered, full-replace pattern
// as the Employees sync (see /api/payroll/employees?sync=true).

interface HrBranchRow {
  id: string
  shortCode: string
  name: string
  brandName: string | null
  tin: string | null
  emailMain: string | null
  active: boolean
  syncedAt: string
}

function HrBranchesCard() {
  const [branches, setBranches] = useState<HrBranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/branches')
      if (res.ok) {
        const data = await res.json()
        setBranches(data.branches || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/branches/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncMsg(`Synced ${data.synced} of ${data.total} (${data.created} new, ${data.updated} updated, ${data.deleted} removed)`)
        load()
      } else {
        setSyncMsg('Sync failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e) {
      setSyncMsg('Sync failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--hr-line)' }}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Building2 size={15} style={{ color: 'var(--teal)' }} /> Branches registry
            {!loading && <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: '#f1f5f2', color: 'var(--mid-gray)' }}>{branches.length}</span>}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Synced from the HR Platform — edit branch details there, not here.</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync branches'}
        </button>
      </div>
      <div className="px-4 py-3">
        {syncMsg && <p className="text-xs mb-2" style={{ color: syncMsg.startsWith('Sync failed') ? '#b91c1c' : 'var(--mid-gray)' }}>{syncMsg}</p>}
        {loading ? (
          <div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map(i => <span key={i} className="h-7 w-40 rounded-full hr-shimmer" />)}</div>
        ) : branches.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No branches synced yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {branches.map(b => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
                style={b.active
                  ? { background: 'var(--pale-teal)', borderColor: '#d6e4c0', color: 'var(--charcoal)' }
                  : { background: '#f5f6f3', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
                title={b.active ? 'Active' : 'Inactive'}
              >
                <strong className="font-bold">{b.shortCode}</strong> {b.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
