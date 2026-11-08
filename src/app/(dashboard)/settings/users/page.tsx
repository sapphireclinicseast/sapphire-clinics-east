'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Users, Plus, Trash2, ShieldCheck, X, Pencil, Check, Building2, Eye, UserPlus, Info } from 'lucide-react'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../../patients/dashboard/ui'
import {
  SettingsHeader, Banner, InitialsAvatar,
  CONTROL, CONTROL_STYLE, LABEL, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, DANGER, SUBTLE_BG, TH, MODAL_BACKDROP,
  fmtDate, relTime,
} from '../ui'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MARKETING_ADMIN: 'Marketing Admin',
  AHEA_ADMIN: 'AHEA Admin',
  AHGH_ADMIN: 'AHGH Admin',
  VERDANA_ADMIN: 'Verdana Admin',
  AHEA_FRONT_DESK: 'AHEA Front Desk',
  AHGH_FRONT_DESK: 'AHGH Front Desk',
  INVESTOR: 'Investor (read-only)',
  MEDREP: 'Medical Representative',
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role
}

// Same options, values and wording as before — rendered once for both forms.
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ADMIN', label: 'Admin — all branches, all modules' },
  { value: 'MARKETING_ADMIN', label: 'Marketing Admin — all modules except Clinic Schedule' },
  { value: 'AHEA_ADMIN', label: 'AHEA Admin — East Branch social only' },
  { value: 'AHGH_ADMIN', label: 'AHGH Admin — Greenhills Branch social only' },
  { value: 'VERDANA_ADMIN', label: 'Verdana Admin — Verdana Store social only' },
  { value: 'AHEA_FRONT_DESK', label: 'AHEA Front Desk — clinic tools + East Branch patients' },
  { value: 'AHGH_FRONT_DESK', label: 'AHGH Front Desk — clinic tools + Greenhills Branch patients' },
  { value: 'INVESTOR', label: 'Investor — Patient Dashboard only, read-only' },
  { value: 'MEDREP', label: 'Medical Representative — registrations, relationships, partners' },
]

/** Badge colour per role family. Display only. */
const ROLE_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  ADMIN:           { bg: '#E6F4F2', fg: '#11606B', border: '#BFE3DE' },
  MARKETING_ADMIN: { bg: '#F1EBFB', fg: '#5B2A86', border: '#DDD0F3' },
  AHEA_ADMIN:      { bg: '#E8F0FE', fg: '#1E40AF', border: '#C7D7FB' },
  AHGH_ADMIN:      { bg: '#E8F0FE', fg: '#1E40AF', border: '#C7D7FB' },
  VERDANA_ADMIN:   { bg: '#ECFDF3', fg: '#166534', border: '#BBF7D0' },
  AHEA_FRONT_DESK: { bg: '#FFF7E6', fg: '#8A5A00', border: '#F3D9A5' },
  AHGH_FRONT_DESK: { bg: '#FFF7E6', fg: '#8A5A00', border: '#F3D9A5' },
  INVESTOR:        { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' },
  MEDREP:          { bg: '#FDF2F8', fg: '#9D174D', border: '#FBCFE8' },
}
const ROLE_TONE_DEFAULT = { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' }

const BRANCH_ROLES = new Set(['AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'])
const LIMITED_ROLES = new Set(['INVESTOR', 'MEDREP'])

function RoleBadge({ role }: { role: string }) {
  const t = ROLE_TONE[role] ?? ROLE_TONE_DEFAULT
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      {role === 'ADMIN' && <ShieldCheck size={11} />}
      {roleLabel(role)}
    </span>
  )
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
  // Server/network failure loading the list — distinct from "0 users exist".
  // Without this, a transient DB outage (e.g. postgres restarting mid-deploy)
  // rendered "No users found." and looked like the team members were deleted.
  const [loadError, setLoadError] = useState('')
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server error (HTTP ${res.status})`)
      setUsers(data.users || [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load users')
    } finally {
      setLoading(false)
      setHasLoaded(true)
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

  // Display only: Escape closes whichever dialog is open, same as its Cancel button.
  useEffect(() => {
    if (!showForm && !editingUser) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (editingUser) closeEdit()
      else { setShowForm(false); setError('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm, editingUser])

  const stats = useMemo(() => {
    const byRole = new Map<string, number>()
    for (const u of users) byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1)
    const monthAgo = Date.now() - 30 * 86400_000
    const recent = users.filter(u => new Date(u.createdAt).getTime() >= monthAgo).length
    const newest = users.reduce<AppUser | null>((n, u) => (!n || u.createdAt > n.createdAt ? u : n), null)
    return {
      total: users.length,
      admins: byRole.get('ADMIN') ?? 0,
      marketing: byRole.get('MARKETING_ADMIN') ?? 0,
      branch: users.filter(u => BRANCH_ROLES.has(u.role)).length,
      frontDesk: (byRole.get('AHEA_FRONT_DESK') ?? 0) + (byRole.get('AHGH_FRONT_DESK') ?? 0),
      limited: users.filter(u => LIMITED_ROLES.has(u.role)).length,
      recent,
      newest,
      byRole: [...byRole.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [users])

  const initialLoad = loading && !hasLoaded

  return (
    <div className="max-w-[1100px] mx-auto space-y-5 min-w-0">
      <SettingsHeader
        title="Team Members"
        subtitle="Add and manage users who can access the Sapphire Operations Hub."
        actions={
          <button
            onClick={() => { setShowForm(!showForm); setError('') }}
            className={BTN_PRIMARY}
            style={{ background: 'var(--teal)' }}
          >
            <Plus size={15} />
            Add Member
          </button>
        }
      />

      {/* ── KPIs ── */}
      {!loadError && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {initialLoad ? (
            Array.from({ length: 4 }).map((_, n) => (
              <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE} aria-hidden>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-14 mt-2" />
                <Skeleton className="h-3 w-24 mt-2" />
              </div>
            ))
          ) : (
            <>
              <KpiCard label="Members" icon={<Users size={16} />} value={stats.total}
                sub={stats.recent > 0 ? `${stats.recent} added in the last 30 days` : stats.newest ? `Newest: ${stats.newest.name || stats.newest.email}` : 'No members yet'} />
              <KpiCard label="Admins" icon={<ShieldCheck size={16} />} accent="#11606B" value={stats.admins}
                sub={stats.marketing > 0 ? `+ ${stats.marketing} marketing admin${stats.marketing === 1 ? '' : 's'}` : 'Full access, all branches'} />
              <KpiCard label="Branch roles" icon={<Building2 size={16} />} accent="#1E40AF" value={stats.branch}
                sub={stats.frontDesk > 0 ? `${stats.frontDesk} front desk` : 'Branch admins & front desk'} />
              <KpiCard label="Limited access" icon={<Eye size={16} />} accent="#475569" value={stats.limited}
                sub="Investors & medical reps" />
            </>
          )}
        </div>
      )}

      {/* ── Members ── */}
      {loadError ? (
        <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
          <p className="text-sm font-semibold" style={{ color: DANGER }}>Could not load team members: {loadError}</p>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
            Your accounts are safe — this is a connection problem, not deleted data.
          </p>
          <button onClick={fetchUsers} disabled={loading} className={`${BTN_PRIMARY} mt-4`} style={{ background: 'var(--teal)' }}>
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : (
        <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
          <header className="px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <h2 className="text-[14px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              <Users size={15} style={{ color: 'var(--teal)' }} />
              {initialLoad ? 'Members' : `${users.length} member${users.length !== 1 ? 's' : ''}`}
            </h2>
            {!initialLoad && stats.byRole.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-wider mr-0.5" style={{ color: 'var(--mid-gray)' }}>By role</span>
                {stats.byRole.map(([role, n]) => (
                  <span key={role} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4"
                    style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                    {roleLabel(role)} <span className="tabular-nums" style={{ color: (ROLE_TONE[role] ?? ROLE_TONE_DEFAULT).fg }}>{n}</span>
                  </span>
                ))}
              </div>
            )}
          </header>

          {initialLoad ? (
            <div aria-hidden>
              {Array.from({ length: 5 }).map((_, n) => (
                <div key={n} className="flex items-center gap-4 px-5 py-3.5" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-3.5" style={{ width: `${40 - n * 4}%` }} />
                    <Skeleton className="h-2.5" style={{ width: `${30 - n * 3}%` }} />
                  </div>
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center">
              <Users size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
              <EmptyState title="No users found." hint="Use Add Member to give someone access to the Operations Hub." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr style={{ background: SUBTLE_BG }}>
                    {['Member', 'Role', 'Added', ''].map((h, i) => (
                      <th key={`${h}-${i}`} className={`${TH} ${i === 3 ? 'text-right' : ''}`}
                        style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isEditing = editingUser?.id === user.id
                    return (
                      <tr key={user.id} className="transition-colors hover:bg-[#F8FAF9]"
                        style={{ borderTop: '1px solid var(--light-gray)', background: isEditing ? 'var(--pale-teal)' : undefined }}>
                        <td className="px-4 py-3 min-w-[240px]">
                          <div className="flex items-center gap-3 min-w-0">
                            <InitialsAvatar name={user.name || user.email} />
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                                {user.name || user.email}
                              </p>
                              <p className="text-xs truncate" style={{ color: 'var(--mid-gray)' }}>{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-[13px] tabular-nums" style={{ color: 'var(--charcoal)' }}>
                            {new Date(user.createdAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                          </p>
                          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }} title={fmtDate(user.createdAt)}>
                            {relTime(user.createdAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => editingUser?.id === user.id ? closeEdit() : openEdit(user)}
                              className={`${BTN_SM} hover:bg-gray-50`}
                              style={{ ...CONTROL_STYLE, color: isEditing ? 'var(--teal)' : 'var(--charcoal)' }}
                              title="Edit user"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              onClick={() => deleteUser(user.id, user.email)}
                              className="group inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-red-50"
                              style={{ color: 'var(--mid-gray)' }}
                              title="Remove user"
                              aria-label={`Remove ${user.email}`}
                            >
                              <Trash2 size={14} className="group-hover:text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="flex items-start gap-2 px-5 py-3 text-[11px] leading-relaxed"
            style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)', background: SUBTLE_BG }}>
            <Info size={13} className="flex-shrink-0 mt-px" />
            <span>
              Added users can log in at the platform login page with their email and password.
              Admins can manage all settings; Staff can create and schedule posts.
            </span>
          </footer>
        </section>
      )}

      {/* ── Add member dialog ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={MODAL_BACKDROP}>
          <div role="dialog" aria-modal="true" aria-labelledby="team-add-title"
            className="bg-white rounded-xl w-full max-w-xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
            <DialogHeader id="team-add-title" icon={<UserPlus size={18} style={{ color: 'var(--teal)' }} />}
              title="New Team Member" subtitle="They sign in with this email and the temporary password you set."
              onClose={() => { setShowForm(false); setError('') }} />
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="team-add-name" className={LABEL} style={{ color: 'var(--mid-gray)' }}>Name</label>
                  <input
                    id="team-add-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Maria Santos"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="team-add-role" className={LABEL} style={{ color: 'var(--mid-gray)' }}>Role</label>
                  <select
                    id="team-add-role"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="team-add-email" className={LABEL} style={{ color: 'var(--mid-gray)' }}>Email</label>
                  <input
                    id="team-add-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="team-add-password" className={LABEL} style={{ color: 'var(--mid-gray)' }}>Password</label>
                  <input
                    id="team-add-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Set a temporary password"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
              </div>
              {error && <Banner tone="error">{error}</Banner>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <button
                onClick={() => { setShowForm(false); setError('') }}
                className={BTN_SECONDARY}
                style={CONTROL_STYLE}
              >
                Cancel
              </button>
              <button
                onClick={createUser}
                disabled={saving || !form.email || !form.password}
                className={BTN_PRIMARY}
                style={{ background: 'var(--teal)' }}
              >
                {saving ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit member dialog ── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={MODAL_BACKDROP}>
          <div role="dialog" aria-modal="true" aria-labelledby="team-edit-title"
            className="bg-white rounded-xl w-full max-w-xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
            <DialogHeader id="team-edit-title"
              icon={<InitialsAvatar name={editingUser.name || editingUser.email} size={40} />}
              title={`Edit — ${editingUser.name || editingUser.email}`}
              subtitle={<span className="inline-flex items-center gap-2">Currently <RoleBadge role={editingUser.role} /></span>}
              onClose={closeEdit} />
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="team-edit-name" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    Display Name
                  </label>
                  <input
                    id="team-edit-name"
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="team-edit-role" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    Access Role
                  </label>
                  <select
                    id="team-edit-role"
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="team-edit-email" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    Email Address
                  </label>
                  <input
                    id="team-edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="team-edit-password" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    New Password <span className="normal-case tracking-normal" style={{ fontWeight: 400 }}>(leave blank to keep current)</span>
                  </label>
                  <input
                    id="team-edit-password"
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Enter new password to change"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
              </div>
              {editError && <Banner tone="error">{editError}</Banner>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <button
                onClick={closeEdit}
                className={BTN_SECONDARY}
                style={CONTROL_STYLE}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className={BTN_PRIMARY}
                style={{ background: 'var(--teal)' }}
              >
                <Check size={14} />
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DialogHeader({ id, icon, title, subtitle, onClose }: {
  id: string; icon: ReactNode; title: string; subtitle: ReactNode; onClose: () => void
}) {
  return (
    <div className="flex items-start gap-3 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--pale-teal)' }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p id={id} className="font-bold text-[15px] truncate" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
          {title}
        </p>
        <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>{subtitle}</div>
      </div>
      <button onClick={onClose} aria-label="Close"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/[0.05] flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
        <X size={16} />
      </button>
    </div>
  )
}
