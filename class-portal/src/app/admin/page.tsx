'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, addUser, updateUser, deleteUser,
  levelLabel, type StoredUser, type UserRole,
} from '@/lib/session'

type Filter = 'ALL' | UserRole

export default function AdminPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [users, setUsers] = useState<StoredUser[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [showPasswords, setShowPasswords] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [editing, setEditing] = useState<StoredUser | null>(null)

  useEffect(() => {
    const auth = getAuth()
    if (!auth || auth.role !== 'ADMIN') { router.replace('/sign-in'); return }
    setUsers(getUsers())
    setReady(true)
  }, [router])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return users
    return users.filter(u => u.role === filter)
  }, [users, filter])

  function refresh() { setUsers(getUsers()) }

  function handleAddTeacher(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null); setInfo(null)
    const f = new FormData(e.currentTarget)
    try {
      addUser({
        role: 'TEACHER',
        email: String(f.get('email') ?? '').trim(),
        password: String(f.get('password') ?? ''),
        firstName: String(f.get('firstName') ?? '').trim() || undefined,
        lastName: String(f.get('lastName') ?? '').trim() || undefined,
      })
      e.currentTarget.reset()
      refresh()
      setInfo('Teacher account created.')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  function handleDelete(u: StoredUser) {
    if (!confirm(`Delete ${u.role.toLowerCase()} ${u.email}? This cannot be undone.`)) return
    deleteUser(u.id); refresh()
  }

  function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setErr(null); setInfo(null)
    const f = new FormData(e.currentTarget)
    try {
      updateUser(editing.id, {
        email: String(f.get('email') ?? '').trim(),
        password: String(f.get('password') ?? ''),
        firstName: String(f.get('firstName') ?? '').trim() || undefined,
        lastName: String(f.get('lastName') ?? '').trim() || undefined,
      })
      setEditing(null)
      refresh()
      setInfo('User updated.')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (!ready) return null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              SCEI main admin
            </div>
            <h1 className="text-[28px] leading-tight text-[color:var(--deep-teal)]">Users</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1">{users.length} total · {users.filter(u => u.role === 'STUDENT').length} students · {users.filter(u => u.role === 'TEACHER').length} teachers</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ink)]">
            <input type="checkbox" checked={showPasswords} onChange={e => setShowPasswords(e.target.checked)} />
            Show passwords
          </label>
        </div>

        {err && <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        {info && <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">{info}</div>}

        <div className="flex gap-2 mt-5 p-1 bg-[color:var(--pale-teal)] rounded-xl w-fit" style={{ fontFamily: 'var(--font-display)' }}>
          {(['ALL', 'STUDENT', 'TEACHER'] as Filter[]).map(f => (
            <button key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filter === f ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}
            >{f === 'ALL' ? 'All' : f === 'STUDENT' ? 'Students' : 'Teachers'}</button>
          ))}
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Password</th>
                <th className="py-2 pr-3">Level</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-[color:var(--mid-gray)]">No users in this view.</td></tr>
              )}
              {filtered.map(u => (
                <tr key={u.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 pr-3">
                    <span className={`badge ${u.role === 'STUDENT' ? 'badge-approved' : 'badge-teletherapy'}`}>{u.role}</span>
                  </td>
                  <td className="py-2.5 pr-3">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-2.5 pr-3">{u.email}</td>
                  <td className="py-2.5 pr-3 font-mono text-[12.5px]">{showPasswords ? u.password : '•'.repeat(Math.min(u.password.length, 10))}</td>
                  <td className="py-2.5 pr-3">{u.level ? levelLabel(u.level) : '—'}</td>
                  <td className="py-2.5 pr-3 text-[color:var(--mid-gray)] text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    <button className="text-xs px-2 py-1 rounded-md text-[color:var(--narra)] hover:bg-[color:var(--paper-2)]" onClick={() => { setEditing(u); setErr(null); setInfo(null) }}>Edit</button>
                    <button className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] ml-1" onClick={() => handleDelete(u)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add teacher */}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-4">Add teacher</h2>
        <form className="grid sm:grid-cols-2 gap-3" onSubmit={handleAddTeacher}>
          <label className="block">
            <span className="label">First name</span>
            <input name="firstName" className="input" />
          </label>
          <label className="block">
            <span className="label">Last name</span>
            <input name="lastName" className="input" />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input required name="email" type="email" className="input" placeholder="teacher@example.com" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input required name="password" className="input" minLength={6} placeholder="min 6 characters" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Create teacher account</button>
          </div>
        </form>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditing(null)}>
          <div className="card-static w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-[20px] leading-tight mb-1">Edit {editing.role.toLowerCase()}</h2>
            <p className="text-sm text-[color:var(--mid-gray)] mb-5">{editing.email}</p>
            <form className="space-y-3" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">First name</span>
                  <input name="firstName" className="input" defaultValue={editing.firstName ?? ''} />
                </label>
                <label className="block">
                  <span className="label">Last name</span>
                  <input name="lastName" className="input" defaultValue={editing.lastName ?? ''} />
                </label>
              </div>
              <label className="block">
                <span className="label">Email</span>
                <input required name="email" type="email" className="input" defaultValue={editing.email} />
              </label>
              <label className="block">
                <span className="label">Password</span>
                <input required name="password" className="input" minLength={6} defaultValue={editing.password} />
              </label>
              <div className="flex items-center gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
