'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers, addUser, updateUser, deleteUser,
  levelLabel, type StoredUser, type UserRole,
} from '@/lib/session'
import { listStaff, type StaffMember } from '@/lib/api'
import StudentListPanel from '@/components/StudentListPanel'
import CurriculumPanel from '@/components/CurriculumPanel'
import NotificationPanel from '@/components/NotificationPanel'
import PaymentsGrouped from '@/components/PaymentsGrouped'
import AssignmentsPanel from '@/components/AssignmentsPanel'
import ClassesPanel from '@/components/ClassesPanel'
import TemplatesPanel from '@/components/TemplatesPanel'

type AdminTab = 'USERS' | 'STUDENTS' | 'CLASSES' | 'CURRICULUM' | 'TEMPLATES' | 'NOTIFICATIONS' | 'PAYMENTS' | 'ASSIGNMENTS'

export default function AdminPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [adminEmail, setAdminEmail] = useState('main@sapphireclinicseast.org')
  const [tab, setTab] = useState<AdminTab>('USERS')

  useEffect(() => {
    const auth = getAuth()
    if (!auth || auth.role !== 'ADMIN') { router.replace('/sign-in'); return }
    setAdminEmail(auth.email)
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>SCEI main admin</div>
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">Admin dashboard</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">{adminEmail}</p>
      </div>

      <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl overflow-x-auto" style={{ fontFamily: 'var(--font-display)' }}>
        {([
          ['USERS', 'Users'],
          ['STUDENTS', 'Students'],
          ['CLASSES', 'Classes'],
          ['CURRICULUM', 'Curriculum'],
          ['TEMPLATES', 'Templates'],
          ['NOTIFICATIONS', 'Notifications'],
          ['PAYMENTS', 'Payments'],
          ['ASSIGNMENTS', 'Assignments'],
        ] as Array<[AdminTab, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${tab === k ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'USERS'         && <UsersPanel />}
      {tab === 'STUDENTS'      && <StudentListPanel viewer={{ role: 'ADMIN', email: adminEmail, name: 'Main admin' }} />}
      {tab === 'CLASSES'       && <ClassesPanel />}
      {tab === 'CURRICULUM'    && <CurriculumPanel viewer={{ role: 'ADMIN', email: adminEmail }} />}
      {tab === 'TEMPLATES'     && <TemplatesPanel viewer={{ role: 'ADMIN', email: adminEmail }} />}
      {tab === 'NOTIFICATIONS' && <NotificationPanel viewer={{ role: 'ADMIN', email: adminEmail, name: 'Main admin' }} />}
      {tab === 'PAYMENTS'      && <PaymentsGrouped canSendReminders senderEmail={adminEmail} senderName="Main admin" senderRole="ADMIN" />}
      {tab === 'ASSIGNMENTS'   && <AssignmentsPanel />}
    </div>
  )
}

/* ─────────────────────── USERS PANEL ─────────────────────── */

type Filter = 'ALL' | UserRole

function UsersPanel() {
  const [users, setUsers] = useState<StoredUser[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [showPasswords, setShowPasswords] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [editing, setEditing] = useState<StoredUser | null>(null)

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffErr, setStaffErr] = useState<string | null>(null)
  const [staffBranchFilter, setStaffBranchFilter] = useState<'' | 'SBEA' | 'SBGH'>('')
  const [staffSearch, setStaffSearch] = useState('')

  useEffect(() => {
    setUsers(getUsers())
    // Pull fresh user list from the API on mount so admin sees teachers/students
    // created from other devices.
    hydrateUsers().then(setUsers).catch(() => { /* fall back to cached */ })
    listStaff({ department: 'SPED' })
      .then(s => { setStaff(s); setStaffErr(null) })
      .catch(e => setStaffErr((e as Error).message))
      .finally(() => setStaffLoading(false))
  }, [])

  async function refresh() {
    try { setUsers(await hydrateUsers()) }
    catch { setUsers(getUsers()) }
  }

  const filtered = useMemo(() => filter === 'ALL' ? users : users.filter(u => u.role === filter), [users, filter])
  const teacherEmailSet = useMemo(() => new Set(users.filter(u => u.role === 'TEACHER').map(u => u.email.toLowerCase())), [users])

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase()
    return staff.filter(s => {
      if (staffBranchFilter && s.branch !== staffBranchFilter) return false
      if (!q) return true
      const hay = `${s.firstName} ${s.lastName} ${s.email} ${s.jobTitle}`.toLowerCase()
      return hay.includes(q)
    })
  }, [staff, staffSearch, staffBranchFilter])

  async function handleCreateFromStaff(member: StaffMember, password: string) {
    setErr(null); setInfo(null)
    if (!member.email) { setErr(`${member.firstName} ${member.lastName} has no email on file in the Staff Module.`); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    try {
      await addUser({
        role: 'TEACHER', email: member.email, password,
        firstName: member.firstName || undefined,
        lastName: member.lastName || undefined,
      })
      refresh()
      setInfo(`Teacher account created for ${member.firstName} ${member.lastName}.`)
    } catch (e) { setErr((e as Error).message) }
  }

  async function handleDelete(u: StoredUser) {
    if (!confirm(`Delete ${u.role.toLowerCase()} ${u.email}? This cannot be undone.`)) return
    try { await deleteUser(u.id); refresh() }
    catch (e) { setErr((e as Error).message) }
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setErr(null); setInfo(null)
    const f = new FormData(e.currentTarget)
    try {
      await updateUser(editing.id, {
        email: String(f.get('email') ?? '').trim(),
        password: String(f.get('password') ?? ''),
        firstName: String(f.get('firstName') ?? '').trim() || undefined,
        lastName: String(f.get('lastName') ?? '').trim() || undefined,
      })
      setEditing(null); refresh(); setInfo('User updated.')
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <div className="card-static">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[18px] leading-tight">Users</h2>
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
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filter === f ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}>
              {f === 'ALL' ? 'All' : f === 'STUDENT' ? 'Students' : 'Teachers'}
            </button>
          ))}
        </div>

        <div className="overflow-auto mt-4 rounded-xl border" style={{ maxHeight: 360, borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Password</th>
                <th className="py-2 px-3">Level</th>
                <th className="py-2 px-3">Created</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">No users in this view.</td></tr>}
              {filtered.map(u => (
                <tr key={u.id} className="border-b hover:bg-[color:var(--paper-2)]" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 px-3"><span className={`badge ${u.role === 'STUDENT' ? 'badge-approved' : 'badge-teletherapy'}`}>{u.role}</span></td>
                  <td className="py-2.5 px-3">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-2.5 px-3">{u.email}</td>
                  <td className="py-2.5 px-3 font-mono text-[12.5px]">{showPasswords ? u.password : '•'.repeat(Math.min(u.password.length, 10))}</td>
                  <td className="py-2.5 px-3">{u.level ? levelLabel(u.level) : '—'}</td>
                  <td className="py-2.5 px-3 text-[color:var(--mid-gray)] text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button className="text-xs px-2 py-1 rounded-md text-[color:var(--narra)] hover:bg-[color:var(--paper-2)]" onClick={() => { setEditing(u); setErr(null); setInfo(null) }}>Edit</button>
                    <button className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] ml-1" onClick={() => handleDelete(u)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-static mt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div>
            <h2 className="text-[18px] leading-tight">Add teacher from Staff Module</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              Showing <span className="font-semibold">SPED teachers only</span> from <span className="font-semibold">marketing.sapphireclinicseast.org</span>.
            </p>
          </div>
          {staffLoading && <span className="text-[12px] text-[color:var(--mid-gray)]">Loading staff…</span>}
        </div>

        {staffErr && <div className="mt-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">Couldn&apos;t load Staff Module: {staffErr}</div>}

        <div className="flex flex-wrap items-end gap-3 mt-4">
          <label className="block flex-1 min-w-[220px]">
            <span className="label">Search</span>
            <input className="input" placeholder="Name, job title, or email" value={staffSearch} onChange={e => setStaffSearch(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Branch</span>
            <select className="select" value={staffBranchFilter} onChange={e => setStaffBranchFilter(e.target.value as typeof staffBranchFilter)} style={{ minWidth: 220 }}>
              <option value="">All branches</option>
              <option value="SBEA">Sandbox East</option>
              <option value="SBGH">Sandbox Greenhills</option>
            </select>
          </label>
        </div>

        <div className="overflow-auto mt-4 rounded-xl border" style={{ maxHeight: 420, borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Job title</th>
                <th className="py-2 px-3">Branch</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {!staffLoading && filteredStaff.length === 0 && (
                <tr><td colSpan={5} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">
                  {staff.length === 0 ? 'No SPED teachers returned from the Staff Module.' : 'No SPED teachers match this search.'}
                </td></tr>
              )}
              {filteredStaff.map(m => {
                const has = teacherEmailSet.has(m.email.toLowerCase())
                return (
                  <tr key={m.id} className="border-b hover:bg-[color:var(--paper-2)]" style={{ borderColor: 'var(--paper-3)' }}>
                    <td className="py-2.5 px-3 whitespace-nowrap">{m.firstName} {m.lastName}</td>
                    <td className="py-2.5 px-3">{m.jobTitle || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{m.branch === 'SBEA' ? 'Sandbox East' : m.branch === 'SBGH' ? 'Sandbox Greenhills' : m.branch}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{m.email || <span className="text-[color:var(--mid-gray)]">no email on file</span>}</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {has ? <span className="badge badge-approved">Account exists</span> : <CreateTeacherInlineForm onCreate={pw => handleCreateFromStaff(m, pw)} disabled={!m.email} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditing(null)}>
          <div className="card-static w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-[20px] leading-tight mb-1">Edit {editing.role.toLowerCase()}</h2>
            <p className="text-sm text-[color:var(--mid-gray)] mb-5">{editing.email}</p>
            <form className="space-y-3" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="label">First name</span><input name="firstName" className="input" defaultValue={editing.firstName ?? ''} /></label>
                <label className="block"><span className="label">Last name</span><input name="lastName" className="input" defaultValue={editing.lastName ?? ''} /></label>
              </div>
              <label className="block"><span className="label">Email</span><input required name="email" type="email" className="input" defaultValue={editing.email} /></label>
              <label className="block"><span className="label">Password</span><input required name="password" className="input" minLength={6} defaultValue={editing.password} /></label>
              <div className="flex items-center gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function CreateTeacherInlineForm({ onCreate, disabled }: { onCreate: (pw: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  if (!open) return (
    <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="text-xs px-3 py-1.5 rounded-md text-[color:var(--narra)] hover:bg-[color:var(--paper-2)] border" style={{ borderColor: 'var(--paper-3)' }}>Create account</button>
  )
  return (
    <div className="inline-flex items-center gap-1.5">
      <input autoFocus type="text" placeholder="password (min 6)" className="input" value={pw} onChange={e => setPw(e.target.value)} style={{ width: 180, padding: '6px 10px', fontSize: 12 }} />
      <button type="button" onClick={() => { onCreate(pw); setOpen(false); setPw('') }} className="text-xs px-3 py-1.5 rounded-md bg-[color:var(--narra)] text-white">Save</button>
      <button type="button" onClick={() => { setOpen(false); setPw('') }} className="text-xs px-2 py-1.5 rounded-md text-[color:var(--mid-gray)] hover:text-[color:var(--narra)]">Cancel</button>
    </div>
  )
}
