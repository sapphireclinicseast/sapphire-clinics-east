'use client'

import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, ShieldCheck, UserCircle, X, Pencil, Check } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MARKETING_ADMIN: 'Marketing Admin',
  SBEA_ADMIN: 'SBEA Admin',
  SBGH_ADMIN: 'SBGH Admin',
  VERDANA_ADMIN: 'Verdana Admin',
  SBEA_FRONT_DESK: 'SBEA Front Desk',
  SBGH_FRONT_DESK: 'SBGH Front Desk',
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role
}

interface AppUser {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MARKETING_ADMIN' })

  // Edit state
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '', password: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data.users || [])
    } finally {
      setLoading(false)
    }
  }

  function openEdit(user: AppUser) {
    setEditingUser(user)
    setEditForm({ name: user.name || '', email: user.email, role: user.role, password: '' })
    setEditError('')
  }

  function closeEdit() {
    setEditingUser(null)
    setEditError('')
  }

  async function createUser() {
    if (!form.email || !form.password) return setError('Email and password are required.')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create user')
      setForm({ name: '', email: '', password: '', role: 'USER' })
      setShowForm(false)
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit() {
    if (!editingUser) return
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingUser.id, ...editForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update user')
      closeEdit()
      fetchUsers()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Remove ${email} from this platform? They will no longer be able to log in.`)) return
    await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchUsers()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Settings
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Team Members
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Add and manage users who can access the Sapphire Marketing Hub.
        </p>
      </div>

      {/* Users list */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="flex items-center gap-2">
            <Users size={16} style={{ color: 'var(--teal)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
              {loading ? 'Loading…' : `${users.length} member${users.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setError('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: showForm ? 'var(--light-gray)' : 'var(--teal)', color: showForm ? 'var(--charcoal)' : '#fff' }}
          >
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? 'Cancel' : 'Add Member'}
          </button>
        </div>

        {/* Add user form */}
        {showForm && (
          <div className="p-5 space-y-4" style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--pale-teal)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
              New Team Member
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Maria Santos"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                >
                  <option value="ADMIN">Admin — all branches, all modules</option>
                  <option value="MARKETING_ADMIN">Marketing Admin — all modules except Clinic Schedule</option>
                  <option value="SBEA_ADMIN">SBEA Admin — East Branch social only</option>
                  <option value="SBGH_ADMIN">SBGH Admin — Greenhills Branch social only</option>
                  <option value="VERDANA_ADMIN">Verdana Admin — Verdana Store social only</option>
                  <option value="SBEA_FRONT_DESK">SBEA Front Desk — clinic tools + East Branch patients</option>
                  <option value="SBGH_FRONT_DESK">SBGH Front Desk — clinic tools + Greenhills Branch patients</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Set a temporary password"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                />
              </div>
            </div>
            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FEE2E2', color: '#DC2626' }}>{error}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowForm(false); setError('') }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--charcoal)' }}
              >
                Cancel
              </button>
              <button
                onClick={createUser}
                disabled={saving || !form.email || !form.password}
                className="px-5 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--teal)', color: '#fff' }}
              >
                {saving ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        )}

        {/* Users list */}
        {loading ? (
          <div className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Loading…</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>No users found.</div>
        ) : (
          <div>
            {users.map((user) => (
              <div key={user.id}>
                <div
                  className="flex items-center gap-4 px-5 py-4"
                  style={{ borderBottom: '1px solid var(--light-gray)' }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--pale-teal)' }}
                  >
                    {user.role === 'ADMIN'
                      ? <ShieldCheck size={16} style={{ color: 'var(--teal)' }} />
                      : <UserCircle size={16} style={{ color: 'var(--teal)' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {user.name || user.email}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {user.email} · Added {new Date(user.createdAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span
                    className="text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                    style={{
                      background: user.role === 'ADMIN' ? 'rgba(26,123,138,0.12)' : 'var(--light-gray)',
                      color: user.role === 'ADMIN' ? 'var(--teal)' : 'var(--mid-gray)',
                    }}
                  >
                    {roleLabel(user.role)}
                  </span>
                  {/* Edit button */}
                  <button
                    onClick={() => editingUser?.id === user.id ? closeEdit() : openEdit(user)}
                    className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                    style={{
                      background: editingUser?.id === user.id ? 'var(--pale-teal)' : 'transparent',
                      color: editingUser?.id === user.id ? 'var(--teal)' : 'var(--mid-gray)',
                    }}
                    title="Edit user"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteUser(user.id, user.email)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50 flex-shrink-0"
                    title="Remove user"
                  >
                    <Trash2 size={14} style={{ color: '#DC2626' }} />
                  </button>
                </div>

                {/* Inline edit form */}
                {editingUser?.id === user.id && (
                  <div className="px-5 py-4 space-y-4" style={{ background: 'var(--pale-teal)', borderBottom: '1px solid var(--light-gray)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--teal)' }}>
                      Edit — {user.name || user.email}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Full name"
                          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                          style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                          Access Role
                        </label>
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                          style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                        >
                          <option value="ADMIN">Admin — all branches, all modules</option>
                          <option value="MARKETING_ADMIN">Marketing Admin — all modules except Clinic Schedule</option>
                          <option value="SBEA_ADMIN">SBEA Admin — East Branch social only</option>
                          <option value="SBGH_ADMIN">SBGH Admin — Greenhills Branch social only</option>
                          <option value="VERDANA_ADMIN">Verdana Admin — Verdana Store social only</option>
                          <option value="SBEA_FRONT_DESK">SBEA Front Desk — clinic tools + East Branch patients</option>
                          <option value="SBGH_FRONT_DESK">SBGH Front Desk — clinic tools + Greenhills Branch patients</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                          style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                          New Password <span style={{ color: 'var(--mid-gray)', fontWeight: 400 }}>(leave blank to keep current)</span>
                        </label>
                        <input
                          type="password"
                          value={editForm.password}
                          onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="Enter new password to change"
                          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                          style={{ border: '1.5px solid rgba(26,123,138,0.3)', background: '#fff', color: 'var(--charcoal)' }}
                        />
                      </div>
                    </div>
                    {editError && (
                      <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FEE2E2', color: '#DC2626' }}>{editError}</p>
                    )}
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={closeEdit}
                        className="px-4 py-2 rounded-lg text-sm"
                        style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--charcoal)' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editSaving}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold"
                        style={{ background: 'var(--teal)', color: '#fff' }}
                      >
                        <Check size={14} />
                        {editSaving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs px-1" style={{ color: 'var(--mid-gray)' }}>
        Added users can log in at the platform login page with their email and password.
        Admins can manage all settings; Staff can create and schedule posts.
      </p>
    </div>
  )
}
