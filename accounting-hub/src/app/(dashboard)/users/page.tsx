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
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import Pagination from '@/components/ui/Pagination'

interface User {
  id: string
  name: string
  email: string
  role: string
  branch: string | null
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
  { value: 'SBEA_ADMIN', label: 'AHEA Admin' },
  { value: 'SBGH_ADMIN', label: 'AHGH Admin' },
  { value: 'VERDANA_ADMIN', label: 'Verdana Admin' },
  { value: 'SBEA_FRONTDESK', label: 'AHEA Front Desk' },
  { value: 'SBGH_FRONTDESK', label: 'AHGH Front Desk' },
  { value: 'HMO_OFFICER', label: 'HMO Officer' },
  { value: 'MEDREP', label: 'Medical Representative (Reports — Gross Revenue only)' },
]

const BRANCH_OPTIONS = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
]

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  ACCOUNTANT: 'Accountant',
  BOOKKEEPER: 'Bookkeeper',
  PAYROLL_OFFICER: 'Payroll Officer',
  VIEWER: 'Viewer',
  SBEA_ADMIN: 'AHEA Admin',
  SBGH_ADMIN: 'AHGH Admin',
  VERDANA_ADMIN: 'Verdana Admin',
  SBEA_FRONTDESK: 'AHEA Front Desk',
  SBGH_FRONTDESK: 'AHGH Front Desk',
  HMO_OFFICER: 'HMO Officer',
  MEDREP: 'Medical Representative',
}

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}

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

  // Form fields
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('VIEWER')
  const [formBranch, setFormBranch] = useState('ALL')

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
    setFormBranch('ALL')
    setError('')
    setModalOpen(true)
  }

  function openEditModal(user: User) {
    setEditingUser(user)
    setFormName(user.name)
    setFormEmail(user.email)
    setFormPassword('')
    setFormRole(user.role)
    setFormBranch(user.branch || 'ALL')
    setError('')
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body: Record<string, string> = {
      name: formName,
      email: formEmail,
      role: formRole,
      branch: formBranch,
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
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )
  const paginatedUsers = filteredUsers.slice((usrPage - 1) * usrPageSize, usrPage * usrPageSize)

  if (status !== 'authenticated' && loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            Users
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage user accounts and role-based access
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--teal)' }}
        >
          <Plus size={18} />
          Add User
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setUsrPage(1) }}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)', background: 'white' }}
        />
      </div>

      {/* Error */}
      {error && !modalOpen && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Name</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Email</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Role</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Last Login</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                    <UsersIcon size={32} className="mx-auto mb-2 opacity-40" />
                    <p>No users found</p>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t hover:bg-gray-50/50 transition-colors"
                    style={{ borderColor: 'var(--light-gray)' }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>
                      {user.name}
                      {user.disabled && <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>Deactivated</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-1 rounded-md text-xs font-medium"
                        style={
                          user.role === 'ADMIN'
                            ? { background: '#fef3c7', color: '#92400e' }
                            : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
                        }
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>
                      {user.branch ? BRANCH_LABELS[user.branch] || user.branch : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} style={{ color: 'var(--teal)' }} />
                        </button>
                        {user.id !== session?.user?.id && (
                          user.disabled ? (
                            <button
                              onClick={() => handleReactivate(user.id)}
                              className="px-2 py-1 rounded-lg hover:bg-green-50 transition-colors text-xs font-semibold"
                              style={{ color: '#166534' }}
                              title="Reactivate"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(user.id)}
                              className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                              title="Deactivate"
                            >
                              <Trash2 size={15} className="text-red-500" />
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
        {filteredUsers.length > 0 && (
          <Pagination totalItems={filteredUsers.length} page={usrPage} pageSize={usrPageSize}
            onPageChange={setUsrPage} onPageSizeChange={setUsrPageSize} />
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>
              Deactivate User
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>
              This deactivates the account — the user can no longer log in, but their records and audit trail are preserved. You can reactivate them later.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: 'var(--light-gray)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600"
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
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
              >
                {editingUser ? 'Edit User' : 'Create User'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
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
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
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
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
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
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
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
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Branch
                </label>
                <select
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}
                >
                  {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
