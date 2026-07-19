'use client'

// Force dynamic rendering — admin page state depends on the per-user JWT
// (role, branch). Without this Next.js serves a prerendered HTML shell
// from the build that references older chunks, which means deploys take
// up to a year (s-maxage=31536000) to actually reach signed-in admins.
// Same cause as the /documents SSG cache bug fixed in PR #137.
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers, addUser, updateUser, deleteUser,
  setUserDisabled,
  sendPasswordResetLink, startImpersonation,
  levelLabel, branchLabel, roleLabel, generatePassword,
  getFees, hydrateFees, saveFees, DEFAULT_FEE_VALUES,
  getVouchers, hydrateVouchers, saveVouchers,
  type StoredUser, type UserRole, type Branch, type FeeSchedule, type FeeExtraItem, type Voucher,
  type EnrollmentLevel,
} from '@/lib/session'

// All grade levels that can be assigned via the Users edit modal.
// Reuses the same enum the rest of the app draws from.
const ALL_GRADE_LEVELS: EnrollmentLevel[] = [
  'NURSERY', 'KINDER',
  'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6',
  'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12',
]
import { listStaff, type StaffMember } from '@/lib/api'
import StudentListPanel from '@/components/StudentListPanel'
import CurriculumPanel from '@/components/CurriculumPanel'
import NotificationPanel from '@/components/NotificationPanel'
import PaymentsGrouped from '@/components/PaymentsGrouped'
import FrontDeskPaymentConfirmations from '@/components/FrontDeskPaymentConfirmations'
import AssignmentsPanel from '@/components/AssignmentsPanel'
import ClassesPanel from '@/components/ClassesPanel'
import TemplatesPanel from '@/components/TemplatesPanel'
import { HANDBOOK_HTML } from '@/lib/handbook-html'

type AdminTab = 'USERS' | 'STUDENTS' | 'CLASSES' | 'CURRICULUM' | 'TEMPLATES' | 'NOTIFICATIONS' | 'PAYMENTS' | 'FEES' | 'ASSIGNMENTS' | 'HANDBOOK'

export default function AdminPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [adminEmail, setAdminEmail] = useState('main@sapphireclinicseast.org')
  const [adminRole, setAdminRole] = useState<'ADMIN' | 'BRANCH_ADMIN'>('ADMIN')
  const [adminBranch, setAdminBranch] = useState<Branch | undefined>(undefined)
  const [tab, setTab] = useState<AdminTab>('USERS')

  useEffect(() => {
    const auth = getAuth()
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN')) { router.replace('/sign-in'); return }
    setAdminEmail(auth.email)
    setAdminRole(auth.role)
    setAdminBranch(auth.branch)
    setReady(true)
  }, [router])

  if (!ready) return null

  const isMainAdmin = adminRole === 'ADMIN'
  const headerLabel = isMainAdmin
    ? 'SCEI main admin'
    : `Branch admin — ${branchLabel(adminBranch)}`

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>{headerLabel}</div>
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">{isMainAdmin ? 'Admin dashboard' : 'Branch dashboard'}</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">{adminEmail}</p>
      </div>

      <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl overflow-x-auto" style={{ fontFamily: 'var(--font-display)' }}>
        {([
          ['USERS', 'Users'],
          ['STUDENTS', 'Students'],
          ['CLASSES', 'Grade Levels'],
          ['CURRICULUM', 'Curriculum'],
          ['TEMPLATES', 'Templates'],
          ['NOTIFICATIONS', 'Notifications'],
          ['PAYMENTS', 'Payments'],
          ['FEES', 'Fees'],
          ['ASSIGNMENTS', 'Assignments'],
          // Handbook is a main-admin-only reference; branch admins never see it.
          ...(isMainAdmin ? [['HANDBOOK', 'Handbook'] as [AdminTab, string]] : []),
        ] as Array<[AdminTab, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${tab === k ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'USERS'         && <UsersPanel viewerRole={adminRole} viewerBranch={adminBranch} />}
      {tab === 'STUDENTS'      && <StudentListPanel viewer={{ role: 'ADMIN', email: adminEmail, name: isMainAdmin ? 'Main admin' : 'Branch admin' }} viewerBranch={isMainAdmin ? undefined : adminBranch} />}
      {tab === 'CLASSES'       && <ClassesPanel />}
      {tab === 'CURRICULUM'    && <CurriculumPanel viewer={{ role: 'ADMIN', email: adminEmail }} />}
      {tab === 'TEMPLATES'     && <TemplatesPanel viewer={{ role: 'ADMIN', email: adminEmail }} />}
      {tab === 'NOTIFICATIONS' && <NotificationPanel viewer={{ role: 'ADMIN', email: adminEmail, name: isMainAdmin ? 'Main admin' : 'Branch admin' }} />}
      {tab === 'PAYMENTS'      && (
        <div className="space-y-6">
          {/* canDelete restricted to the main admin (not branch admin)
              because the server endpoint also enforces role === 'ADMIN'.
              Used to clear test rows that were never real payments. */}
          <FrontDeskPaymentConfirmations canDelete={isMainAdmin} />
          <PaymentsGrouped canSendReminders canDelete={isMainAdmin} senderEmail={adminEmail} senderName={isMainAdmin ? 'Main admin' : 'Branch admin'} senderRole="ADMIN" />
        </div>
      )}
      {tab === 'FEES'          && (
        <div className="space-y-6">
          <FeesPanel viewerRole={adminRole} viewerBranch={adminBranch} />
          {isMainAdmin && <VouchersPanel adminEmail={adminEmail} />}
        </div>
      )}
      {tab === 'ASSIGNMENTS'   && <AssignmentsPanel viewerBranch={isMainAdmin ? undefined : adminBranch} />}
      {tab === 'HANDBOOK' && isMainAdmin && <HandbookPanel />}
    </div>
  )
}

/* ─────────────────────── HANDBOOK PANEL ───────────────────────
   Main-admin-only reference: the HR Portal Handbook, rendered inside an
   isolated iframe (srcDoc) so its document-level styles never leak into the
   class portal. The tab is only offered to role === 'ADMIN'. */
function HandbookPanel() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  return (
    <div className="card-static space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Main admin reference</div>
          <h2 className="text-[19px] leading-tight text-[color:var(--deep-teal)]">HR Portal Handbook</h2>
          <p className="text-sm text-[color:var(--mid-gray)]">How the HR portal works, module by module, for managers, HR officers, and staff.</p>
        </div>
        <button
          type="button"
          onClick={() => frameRef.current?.contentWindow?.print()}
          className="btn-secondary whitespace-nowrap"
          style={{ padding: '0 16px', height: '38px' }}
        >Print / Save PDF</button>
      </div>
      <iframe
        ref={frameRef}
        title="HR Portal Handbook"
        srcDoc={HANDBOOK_HTML}
        className="w-full rounded-xl border"
        style={{ height: '78vh', borderColor: 'var(--paper-3)', background: '#F3F6F4' }}
      />
    </div>
  )
}

/* ─────────────────────── USERS PANEL ─────────────────────── */

type Filter = 'ALL' | UserRole

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  STUDENT:      'badge-approved',
  TEACHER:      'badge-teletherapy',
  FRONTDESK:    'badge-pending',
  BRANCH_ADMIN: 'badge-pending',
}

function UsersPanel({ viewerRole, viewerBranch }: { viewerRole: 'ADMIN' | 'BRANCH_ADMIN'; viewerBranch?: Branch }) {
  const [users, setUsers] = useState<StoredUser[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [showPasswords, setShowPasswords] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [editing, setEditing] = useState<StoredUser | null>(null)
  const [resetting, setResetting] = useState<StoredUser | null>(null)

  // Create-staff form state
  const [newRole, setNewRole] = useState<Exclude<UserRole, 'STUDENT'>>('TEACHER')
  const [newEmail, setNewEmail] = useState('')
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newBranch, setNewBranch] = useState<Branch | ''>(viewerBranch ?? '')
  const [newPw, setNewPw] = useState(() => generatePassword())
  const [creating, setCreating] = useState(false)

  // Staff-Module-prefill panel state
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffErr, setStaffErr] = useState<string | null>(null)
  const [staffBranchFilter, setStaffBranchFilter] = useState<'' | 'SBEA' | 'SBGH'>('')
  const [staffSearch, setStaffSearch] = useState('')

  useEffect(() => {
    setUsers(getUsers())
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

  // Branch admin only sees users in their branch (students by enrollment branch,
  // staff by their assigned branch). Main admin sees everyone.
  const scoped = useMemo(() => {
    if (viewerRole !== 'BRANCH_ADMIN' || !viewerBranch) return users
    return users.filter(u => !u.branch || u.branch === viewerBranch)
  }, [users, viewerRole, viewerBranch])

  const filtered = useMemo(() => filter === 'ALL' ? scoped : scoped.filter(u => u.role === filter), [scoped, filter])
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

  // Roles a viewer is allowed to create. Branch admin can't mint another main
  // admin or another branch admin — only teachers + front-desk staff scoped to
  // their own branch.
  const creatableRoles = useMemo<Array<Exclude<UserRole, 'STUDENT'>>>(() => {
    if (viewerRole === 'ADMIN') return ['TEACHER', 'FRONTDESK', 'BRANCH_ADMIN']
    return ['TEACHER', 'FRONTDESK']
  }, [viewerRole])

  const needsBranch = newRole === 'FRONTDESK' || newRole === 'BRANCH_ADMIN'

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null); setInfo(null)
    if (!newEmail.trim()) { setErr('Email is required.'); return }
    if (newPw.length < 6) { setErr('Password must be at least 6 characters.'); return }
    if (needsBranch && !newBranch) { setErr('Pick a branch for this staff account.'); return }
    setCreating(true)
    try {
      const created = await addUser({
        role: newRole,
        email: newEmail.trim(),
        password: newPw,
        firstName: newFirst.trim() || undefined,
        lastName: newLast.trim() || undefined,
        branch: (needsBranch ? newBranch : undefined) as Branch | undefined,
      })
      refresh()
      setInfo(`Created ${roleLabel(newRole).toLowerCase()} ${created.email}. Password: ${newPw} (saved to this device — also copy it now).`)
      setNewEmail(''); setNewFirst(''); setNewLast('')
      setNewPw(generatePassword())
    } catch (e) { setErr((e as Error).message) }
    finally { setCreating(false) }
  }

  async function handleCreateFromStaff(member: StaffMember, password: string) {
    setErr(null); setInfo(null)
    if (!member.email) { setErr(`${member.firstName} ${member.lastName} has no email on file in the Staff Module.`); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    // Staff Module uses SBEA / SBGH; the class portal stores EAST / GREENHILLS.
    // Map across so the teacher's branch follows them into the user record
    // — otherwise the Users tab shows a blank branch even though the Staff
    // Module clearly knows which clinic they belong to.
    const branch: Branch | undefined = member.branch === 'SBEA' ? 'EAST'
      : member.branch === 'SBGH' ? 'GREENHILLS'
      : undefined
    try {
      const created = await addUser({
        role: 'TEACHER', email: member.email, password,
        firstName: member.firstName || undefined,
        lastName: member.lastName || undefined,
        branch,
      })
      refresh()
      setInfo(`Teacher account created for ${created.firstName ?? member.firstName} ${created.lastName ?? member.lastName} (${branchLabel(branch)}). Password: ${password}`)
    } catch (e) { setErr((e as Error).message) }
  }

  async function handleDelete(u: StoredUser) {
    if (!confirm(`Delete ${roleLabel(u.role).toLowerCase()} ${u.email}? This cannot be undone.\n\nTip: if the student is just leaving the school but you want to keep their history, use Disable instead.`)) return
    try { await deleteUser(u.id); refresh() }
    catch (e) { setErr((e as Error).message) }
  }

  async function handleToggleDisabled(u: StoredUser) {
    const disabling = !u.disabledAt
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
    const msg = disabling
      ? `Disable ${name}'s account?\n\nThey'll no longer be able to sign in and they'll be hidden from teacher and front-desk lists. The account itself is preserved (enrollment + payment history stay intact) and you can re-enable it later.`
      : `Re-enable ${name}'s account?\n\nThey'll be able to sign in again and they'll reappear in teacher and front-desk lists.`
    if (!confirm(msg)) return
    setErr(null); setInfo(null)
    try {
      await setUserDisabled(u.id, disabling)
      refresh()
      setInfo(disabling ? `${name} disabled.` : `${name} re-enabled.`)
    } catch (e) { setErr((e as Error).message) }
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setErr(null); setInfo(null)
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password') ?? '')
    try {
      // Empty-string `level` means "clear it" — pass undefined to skip the
      // update, or the explicit "" sentinel converted to null below.
      // The server's PATCH treats `level: ''` as a non-update.
      const rawLevel = String(f.get('level') ?? '').trim()
      const level: EnrollmentLevel | undefined = rawLevel
        ? (rawLevel as EnrollmentLevel)
        : undefined
      await updateUser(editing.id, {
        email: String(f.get('email') ?? '').trim(),
        password: password || undefined,
        firstName: String(f.get('firstName') ?? '').trim() || undefined,
        lastName: String(f.get('lastName') ?? '').trim() || undefined,
        branch: (String(f.get('branch') ?? '') || undefined) as Branch | undefined,
        level,
      })
      setEditing(null); refresh()
      setInfo(password ? `User updated. New password: ${password}` : 'User updated.')
    } catch (e) { setErr((e as Error).message) }
  }

  async function handleViewAs(u: StoredUser) {
    setErr(null); setInfo(null)
    if (u.role === 'BRANCH_ADMIN') {
      setErr('Branch admins cannot be impersonated.')
      return
    }
    if (!confirm(`Open ${u.email}'s portal as them?\n\nA red banner across the top will let you return to your admin session. This is logged for audit.`)) return
    try {
      await startImpersonation(u.id)
      // Hard navigate so every effect re-runs against the new token.
      window.location.assign(u.role === 'STUDENT' || u.role === 'TEACHER' ? '/profile' : '/frontdesk')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function handleSendResetLink(u: StoredUser) {
    setErr(null); setInfo(null)
    if (!confirm(`Email ${u.email} a one-shot password-reset link?\n\nThey'll set their own new password — you won't see it.`)) return
    try {
      const r = await sendPasswordResetLink(u.id)
      if (r.emailed) {
        setInfo(`Reset link emailed to ${u.email}. They have 24 hours to use it.`)
      } else if (r.manualLink) {
        setInfo(`${r.warning ?? 'Email send failed.'} Share this link with ${u.email} manually: ${r.manualLink}`)
      } else {
        setInfo('Reset link queued — but no manual link was returned. Check server logs.')
      }
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function handleConfirmReset(newPassword: string) {
    if (!resetting) return
    setErr(null); setInfo(null)
    if (newPassword.length < 6) { setErr('Password must be at least 6 characters.'); return }
    try {
      await updateUser(resetting.id, { password: newPassword })
      const target = resetting
      setResetting(null); refresh()
      setInfo(`New password for ${target.email}: ${newPassword} — copy it now, then share with the user.`)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <div className="card-static">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[18px] leading-tight">Users</h2>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1">
              {scoped.length} total · {scoped.filter(u => u.role === 'STUDENT').length} students · {scoped.filter(u => u.role === 'TEACHER').length} teachers · {scoped.filter(u => u.role === 'FRONTDESK').length} front desk · {scoped.filter(u => u.role === 'BRANCH_ADMIN').length} branch admins
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ink)]">
            <input type="checkbox" checked={showPasswords} onChange={e => setShowPasswords(e.target.checked)} />
            Show passwords
          </label>
        </div>

        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-2" style={{ fontFamily: 'var(--font-display)' }}>
          Passwords are one-way encrypted on the server and can&apos;t be retrieved — not by Claude, not by Anthropic, not by us. The list shows the plaintext only when it was set or reset on <span className="font-semibold">this device</span>; otherwise the row shows <span className="font-semibold">who last set it and when</span>. To give a parent or staff member access, click <span className="font-semibold">Reset</span> next to their row.
        </p>

        {err && <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        {info && <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800 break-words">{info}</div>}

        <div className="flex gap-2 mt-5 p-1 bg-[color:var(--pale-teal)] rounded-xl w-fit flex-wrap" style={{ fontFamily: 'var(--font-display)' }}>
          {(['ALL', 'STUDENT', 'TEACHER', 'FRONTDESK', 'BRANCH_ADMIN'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filter === f ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}>
              {f === 'ALL' ? 'All' : f === 'STUDENT' ? 'Students' : f === 'TEACHER' ? 'Teachers' : f === 'FRONTDESK' ? 'Front desk' : 'Branch admins'}
            </button>
          ))}
        </div>

        <div className="overflow-auto mt-4 rounded-xl border" style={{ maxHeight: 420, borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Branch</th>
                <th className="py-2 px-3">Password</th>
                <th className="py-2 px-3">Level</th>
                <th className="py-2 px-3">Created</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">No users in this view.</td></tr>}
              {filtered.map(u => (
                <tr
                  key={u.id}
                  className={`border-b hover:bg-[color:var(--paper-2)] ${u.disabledAt ? 'opacity-55' : ''}`}
                  style={{ borderColor: 'var(--paper-3)' }}
                  title={u.disabledAt ? `Disabled by ${u.disabledBy ?? 'unknown'} on ${new Date(u.disabledAt).toLocaleDateString()}` : undefined}
                >
                  <td className="py-2.5 px-3">
                    <span className={`badge ${ROLE_BADGE_CLASS[u.role] ?? 'badge-pending'}`}>{roleLabel(u.role)}</span>
                    {u.disabledAt && (
                      <span className="ml-1.5 inline-block text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 align-middle" title="Cannot sign in. Hidden from teacher and front-desk lists.">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-2.5 px-3">{u.email}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{branchLabel(u.branch)}</td>
                  <td className="py-2.5 px-3 font-mono text-[12.5px]">
                    {u.password ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{showPasswords ? u.password : '•'.repeat(Math.min(u.password.length, 10))}</span>
                        <button
                          type="button"
                          className="text-[10.5px] px-2 py-0.5 rounded-md text-white font-semibold"
                          style={{ background: 'var(--moss)' }}
                          onClick={() => { setResetting(u); setErr(null); setInfo(null) }}
                        >Reset</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[color:var(--mid-gray)] text-[11px] not-italic font-sans">
                          {u.passwordSetAt
                            ? <>Last set by <span className="font-semibold">{u.passwordSetBy ?? 'unknown'}</span> on {new Date(u.passwordSetAt).toLocaleDateString()}</>
                            : <span className="italic">not on device</span>}
                        </span>
                        <button
                          type="button"
                          className="text-[10.5px] px-2 py-0.5 rounded-md text-white font-semibold"
                          style={{ background: 'var(--moss)' }}
                          onClick={() => { setResetting(u); setErr(null); setInfo(null) }}
                        >Reset</button>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">{u.level ? levelLabel(u.level) : '—'}</td>
                  <td className="py-2.5 px-3 text-[color:var(--mid-gray)] text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button className="text-xs px-2 py-1 rounded-md text-[color:var(--narra)] hover:bg-[color:var(--paper-2)]" onClick={() => { setEditing(u); setErr(null); setInfo(null) }}>Edit</button>
                    {u.role !== 'BRANCH_ADMIN' && (
                      <button
                        className="text-xs px-2 py-1 rounded-md text-[color:var(--deep-teal)] hover:bg-[color:var(--paper-2)] ml-1"
                        title="Open this user's portal as them. A persistent banner lets you return to your admin session; the session is audit-logged."
                        onClick={() => handleViewAs(u)}
                      >View as</button>
                    )}
                    <button
                      className="text-xs px-2 py-1 rounded-md text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] ml-1"
                      title="Email a one-shot reset link — the user picks their own new password."
                      onClick={() => handleSendResetLink(u)}
                    >Email reset link</button>
                    {viewerRole === 'ADMIN' && (
                      <button
                        className={`text-xs px-2 py-1 rounded-md ml-1 ${u.disabledAt
                          ? 'text-[color:var(--moss)] hover:bg-[color:var(--sage-tint)]'
                          : 'text-[color:var(--mid-gray)] hover:bg-[color:var(--paper-2)]'}`}
                        title={u.disabledAt
                          ? 'Re-enable this account so the user can sign in again.'
                          : "Disable this account. The user can't sign in and is hidden from teacher / front-desk lists, but their enrollment and payment history are preserved. Reversible."}
                        onClick={() => handleToggleDisabled(u)}
                      >{u.disabledAt ? 'Enable' : 'Disable'}</button>
                    )}
                    {viewerRole === 'ADMIN' && (
                      <button className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] ml-1" onClick={() => handleDelete(u)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-static mt-6">
        <h2 className="text-[18px] leading-tight">Create staff account</h2>
        <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
          {viewerRole === 'ADMIN'
            ? 'Mint a teacher, front desk, or branch admin account directly. The password you set here is shown once below — copy it before navigating away.'
            : `You can create teacher and front-desk accounts scoped to ${branchLabel(viewerBranch)}.`}
        </p>

        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4" onSubmit={handleCreate}>
          <label className="block">
            <span className="label">Role</span>
            <select className="select" value={newRole} onChange={e => setNewRole(e.target.value as Exclude<UserRole, 'STUDENT'>)}>
              {creatableRoles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Branch {needsBranch ? '' : <span className="text-[color:var(--mid-gray)]">(not required for teachers)</span>}</span>
            <select className="select" value={newBranch} onChange={e => setNewBranch(e.target.value as Branch | '')} disabled={viewerRole === 'BRANCH_ADMIN'}>
              <option value="">—</option>
              <option value="EAST">East Branch</option>
              <option value="GREENHILLS">Greenhills Branch</option>
            </select>
          </label>
          <label className="block">
            <span className="label">First name</span>
            <input className="input" value={newFirst} onChange={e => setNewFirst(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Last name</span>
            <input className="input" value={newLast} onChange={e => setNewLast(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Email</span>
            <input required type="email" className="input" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="staff@sapphireclinicseast.org" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Password</span>
            <div className="flex gap-2">
              <input required minLength={6} className="input flex-1 font-mono" value={newPw} onChange={e => setNewPw(e.target.value)} />
              <button type="button" onClick={() => setNewPw(generatePassword())} className="btn-secondary whitespace-nowrap" style={{ padding: '0 14px' }}>Generate</button>
            </div>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={creating} className="btn-primary w-full sm:w-auto">{creating ? 'Creating…' : `Create ${roleLabel(newRole).toLowerCase()}`}</button>
          </div>
        </form>
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
              <option value="SBEA">East Branch</option>
              <option value="SBGH">Greenhills Branch</option>
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
                    <td className="py-2.5 px-3 text-[12.5px]">{m.branch === 'SBEA' ? 'East Branch' : m.branch === 'SBGH' ? 'Greenhills Branch' : m.branch}</td>
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
            <h2 className="text-[20px] leading-tight mb-1">Edit {roleLabel(editing.role).toLowerCase()}</h2>
            <p className="text-sm text-[color:var(--mid-gray)] mb-5">{editing.email}</p>
            <form className="space-y-3" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="label">First name</span><input name="firstName" className="input" defaultValue={editing.firstName ?? ''} /></label>
                <label className="block"><span className="label">Last name</span><input name="lastName" className="input" defaultValue={editing.lastName ?? ''} /></label>
              </div>
              <label className="block"><span className="label">Email</span><input required name="email" type="email" className="input" defaultValue={editing.email} /></label>
              <label className="block">
                <span className="label">Branch</span>
                <select name="branch" className="select" defaultValue={editing.branch ?? ''}>
                  <option value="">—</option>
                  <option value="EAST">East Branch</option>
                  <option value="GREENHILLS">Greenhills Branch</option>
                </select>
              </label>
              {/* Grade level is meaningful for STUDENT rows only — staff
                  accounts (teacher / front desk / branch admin) have no
                  level on the record. Hide the field for them so the
                  form doesn't accidentally try to set one. */}
              {editing.role === 'STUDENT' && (
                <label className="block">
                  <span className="label">Grade level</span>
                  <select name="level" className="select" defaultValue={editing.level ?? ''}>
                    <option value="">—</option>
                    {ALL_GRADE_LEVELS.map(l => (
                      <option key={l} value={l}>{levelLabel(l)}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="label">New password <span className="text-[color:var(--mid-gray)]">(leave blank to keep current)</span></span>
                <input name="password" className="input font-mono" minLength={6} placeholder="Leave blank to keep current" />
              </label>
              <div className="flex items-center gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onCancel={() => setResetting(null)}
          onConfirm={handleConfirmReset}
        />
      )}
    </>
  )
}

function ResetPasswordModal({ user, onCancel, onConfirm }: { user: StoredUser; onCancel: () => void; onConfirm: (pw: string) => void }) {
  const [pw, setPw] = useState(() => generatePassword())
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
      <div className="card-static w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-[20px] leading-tight mb-1">Reset password</h2>
        <p className="text-sm text-[color:var(--mid-gray)] mb-1">{user.email}</p>
        <p className="text-[12px] text-[color:var(--mid-gray)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          The current password can&apos;t be retrieved. Setting a new one will overwrite it. Copy the value before closing — it&apos;s only shown to you.
        </p>
        <label className="block mb-4">
          <span className="label">New password</span>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono" minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoFocus />
            <button type="button" onClick={() => setPw(generatePassword())} className="btn-secondary whitespace-nowrap" style={{ padding: '0 14px' }}>Generate</button>
          </div>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary flex-1" onClick={() => onConfirm(pw)}>Save new password</button>
        </div>
      </div>
    </div>
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

/* ─────────────────────── FEES PANEL ─────────────────────── */

const BRANCH_ORDER: Branch[] = ['EAST', 'GREENHILLS']

function pesoToCentavos(s: string): number {
  const n = Number(String(s).replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}
function centavosToPeso(c: number): string {
  return (c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function FeesPanel({ viewerRole, viewerBranch }: { viewerRole: 'ADMIN' | 'BRANCH_ADMIN'; viewerBranch?: Branch }) {
  const [fees, setFees] = useState<FeeSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    setFees(getFees())
    hydrateFees().then(rows => { setFees(rows); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Branch admin only sees + edits their own branch row.
  const visibleBranches = useMemo<Branch[]>(() => {
    if (viewerRole === 'BRANCH_ADMIN' && viewerBranch) return [viewerBranch]
    return BRANCH_ORDER
  }, [viewerRole, viewerBranch])

  function patch(branch: Branch, next: Partial<FeeSchedule>) {
    setFees(curr => curr.map(f => f.branch === branch ? { ...f, ...next } : f))
  }
  function patchExtra(branch: Branch, idx: number, next: Partial<FeeExtraItem>) {
    setFees(curr => curr.map(f => {
      if (f.branch !== branch) return f
      const extras = f.extraItems.slice()
      extras[idx] = { ...extras[idx], ...next }
      return { ...f, extraItems: extras }
    }))
  }
  function addExtra(branch: Branch) {
    setFees(curr => curr.map(f => f.branch === branch ? { ...f, extraItems: [...f.extraItems, { label: '', amountCentavos: 0 }] } : f))
  }
  function removeExtra(branch: Branch, idx: number) {
    setFees(curr => curr.map(f => f.branch === branch ? { ...f, extraItems: f.extraItems.filter((_, i) => i !== idx) } : f))
  }

  async function handleSave() {
    setErr(null); setInfo(null)
    try {
      const toSave = fees.filter(f => visibleBranches.includes(f.branch))
      const saved = await saveFees(toSave)
      setFees(saved)
      setInfo('Fees saved. Students will see the new prices on the pay portal.')
    } catch (e) { setErr((e as Error).message) }
  }

  if (loading && fees.length === 0) return <div className="card-static">Loading fees…</div>

  return (
    <div className="card-static space-y-6">
      <div>
        <h2 className="text-[18px] leading-tight">Tuition + fees</h2>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1">
          Set per-branch tuition (annual / bi-annual / monthly), miscellaneous fees, and any extra line items (uniforms, books, etc.). What you save here is what every student under that branch sees on the Pay portal.
        </p>
        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>
          Defaults when a branch has not been set: tuition ₱{centavosToPeso(DEFAULT_FEE_VALUES.tuitionAnnualCentavos)} annual · ₱{centavosToPeso(DEFAULT_FEE_VALUES.tuitionBiannualCentavos)} bi-annual · ₱{centavosToPeso(DEFAULT_FEE_VALUES.tuitionMonthlyCentavos)} monthly.
        </p>
      </div>

      {err  && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
      {info && <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">{info}</div>}

      {visibleBranches.map(b => {
        const f = fees.find(x => x.branch === b)
        if (!f) return null
        return (
          <div key={b} className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h3 className="text-[16px] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{branchLabel(b)}</h3>
              {f.updatedAt && (
                <span className="text-[11.5px] text-[color:var(--mid-gray)]">Last updated {new Date(f.updatedAt).toLocaleString()} {f.updatedBy ? `by ${f.updatedBy}` : ''}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PesoInput label="Tuition — Annual"    centavos={f.tuitionAnnualCentavos}    onChange={c => patch(b, { tuitionAnnualCentavos: c })} />
              <PesoInput label="Tuition — Bi-annual" centavos={f.tuitionBiannualCentavos}  onChange={c => patch(b, { tuitionBiannualCentavos: c })} />
              <PesoInput label="Tuition — Monthly"   centavos={f.tuitionMonthlyCentavos}   onChange={c => patch(b, { tuitionMonthlyCentavos: c })} />
              <div />
              <PesoInput label="Misc — Annual"       centavos={f.miscAnnualCentavos}       onChange={c => patch(b, { miscAnnualCentavos: c })} />
              <PesoInput label="Misc — Bi-annual"    centavos={f.miscBiannualCentavos}     onChange={c => patch(b, { miscBiannualCentavos: c })} />
              <PesoInput label="Misc — Monthly"      centavos={f.miscMonthlyCentavos}      onChange={c => patch(b, { miscMonthlyCentavos: c })} />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Other line items</h4>
                  <p className="text-[11.5px] text-[color:var(--mid-gray)]">Uniforms, books, supplies — anything else parents should see itemized on the Pay portal.</p>
                </div>
                <button type="button" onClick={() => addExtra(b)} className="text-xs px-3 py-1.5 rounded-md text-[color:var(--narra)] hover:bg-[color:var(--paper)] border" style={{ borderColor: 'var(--paper-3)' }}>+ Add item</button>
              </div>

              {f.extraItems.length === 0 && (
                <div className="text-[12.5px] text-[color:var(--mid-gray)] italic py-2">No extra items yet.</div>
              )}

              {f.extraItems.map((x, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto] gap-2 mb-2 items-end">
                  <label className="block">
                    <span className="label">Label</span>
                    <input className="input" placeholder="e.g. Uniform set" value={x.label} onChange={e => patchExtra(b, idx, { label: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Amount (₱)</span>
                    <input className="input text-right" inputMode="decimal" placeholder="0.00" value={centavosToPeso(x.amountCentavos)} onChange={e => patchExtra(b, idx, { amountCentavos: pesoToCentavos(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="label">Notes (optional)</span>
                    <input className="input" placeholder="e.g. payable at front desk" value={x.notes ?? ''} onChange={e => patchExtra(b, idx, { notes: e.target.value })} />
                  </label>
                  <button type="button" onClick={() => removeExtra(b, idx)} className="text-xs px-3 py-2 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={handleSave} className="btn-primary">Save fees</button>
      </div>
    </div>
  )
}

function PesoInput({ label, centavos, onChange }: { label: string; centavos: number; onChange: (c: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--mid-gray)] pointer-events-none">₱</span>
        <input
          className="input text-right pl-7"
          inputMode="decimal"
          value={centavosToPeso(centavos)}
          onChange={e => onChange(pesoToCentavos(e.target.value))}
        />
      </div>
    </label>
  )
}

/* ─────────────────────── VOUCHERS PANEL ─────────────────────── */

// Local rows hold validUntil as a YYYY-MM-DD string for the date input;
// the server returns/accepts ISO and applies end-of-day PH time.
type VoucherRow = { code: string; discountPercent: number; validUntil: string; enabled: boolean }

function toVoucherRow(v: Voucher): VoucherRow {
  return {
    code: v.code,
    discountPercent: v.discountPercent,
    validUntil: v.validUntil ? v.validUntil.slice(0, 10) : '',
    enabled: v.enabled,
  }
}

function VouchersPanel({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<VoucherRow[]>([])
  // Personal early-bird vouchers minted per-student via mint-personal.
  // Kept as their own list so the "Save vouchers" bulk-editor CANNOT
  // touch them (and so the admin sees who each code is for).
  const [personal, setPersonal] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function splitAndSet(v: Voucher[]) {
    const shared = v.filter(x => !x.dedicatedStudentId)
    const dedicated = v.filter(x => !!x.dedicatedStudentId)
    setRows(shared.map(toVoucherRow))
    setPersonal(dedicated)
  }

  useEffect(() => {
    splitAndSet(getVouchers())
    hydrateVouchers().then(v => { splitAndSet(v); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function patch(idx: number, next: Partial<VoucherRow>) {
    setRows(curr => curr.map((r, i) => i === idx ? { ...r, ...next } : r))
  }
  function addRow() {
    // Pre-fill the current promo (30% off, ends June 12 2026) so it's one
    // edit away — the admin just types the code.
    setRows(curr => [...curr, { code: '', discountPercent: 30, validUntil: '2026-06-12', enabled: true }])
  }
  function removeRow(idx: number) {
    setRows(curr => curr.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setErr(null); setInfo(null)
    const cleaned = rows.map(r => ({ ...r, code: r.code.trim().toUpperCase() }))
    for (const r of cleaned) {
      if (!r.code) { setErr('Every voucher needs a code.'); return }
      if (!r.validUntil) { setErr(`Voucher ${r.code} needs a "Valid until" date.`); return }
      if (r.discountPercent < 0 || r.discountPercent > 100) { setErr(`Voucher ${r.code}: discount must be between 0 and 100.`); return }
    }
    const codes = cleaned.map(r => r.code)
    if (new Set(codes).size !== codes.length) { setErr('Voucher codes must be unique.'); return }
    setSaving(true)
    try {
      const saved = await saveVouchers(cleaned.map(r => ({
        code: r.code,
        discountPercent: r.discountPercent,
        validUntil: r.validUntil,
        enabled: r.enabled,
      })))
      // saveVouchers returns EVERY voucher (shared + personal); the
      // server only clobbers shared rows, so re-split to keep the
      // personal section in sync (a fresh mint from elsewhere would
      // show up on the next save).
      splitAndSet(saved)
      setInfo('Voucher codes saved. Parents can use them on the Pay portal right away.')
    } catch (e) { setErr((e as Error).message) }
    finally { setSaving(false) }
  }

  function isExpired(validUntil: string): boolean {
    if (!validUntil) return false
    // End of that day in PH time (UTC+8) == 15:59:59.999Z.
    return Date.now() > new Date(`${validUntil}T15:59:59.999Z`).getTime()
  }

  return (
    <div className="card-static space-y-5">
      <div>
        <h2 className="text-[18px] leading-tight">Voucher codes</h2>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1">
          Create promo codes parents can type on the Pay portal to get a percentage off their tuition. The discount applies to the tuition portion (annual / bi-annual / monthly) up to and including the <span className="font-semibold">Valid until</span> date.
        </p>
        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>
          Codes are not case-sensitive and apply across both branches. Untick <span className="font-semibold">Active</span> to pause a code without deleting it.
        </p>
      </div>

      {err  && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
      {info && <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">{info}</div>}

      {loading && rows.length === 0 ? (
        <div className="text-[13px] text-[color:var(--mid-gray)]">Loading vouchers…</div>
      ) : rows.length === 0 ? (
        <div className="text-[12.5px] text-[color:var(--mid-gray)] italic py-2">No voucher codes yet. Add one below.</div>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_120px_160px_90px_auto] gap-2 px-1 text-[11px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <span>Code</span><span>Discount %</span><span>Valid until</span><span>Active</span><span />
          </div>
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_160px_90px_auto] gap-2 items-center rounded-xl border p-2 sm:p-1.5" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <input className="input uppercase tracking-wide" placeholder="e.g. PROMO30" value={r.code} onChange={e => patch(idx, { code: e.target.value })} />
              <div className="relative">
                <input className="input text-right pr-7" inputMode="numeric" value={String(r.discountPercent)} onChange={e => patch(idx, { discountPercent: Math.max(0, Math.min(100, Math.round(Number(e.target.value.replace(/[^\d]/g, '')) || 0))) })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--mid-gray)] pointer-events-none">%</span>
              </div>
              <div>
                <input type="date" className="input" value={r.validUntil} onChange={e => patch(idx, { validUntil: e.target.value })} />
                {r.validUntil && isExpired(r.validUntil) && <span className="text-[10.5px] text-[color:var(--clay)]">expired</span>}
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.enabled} onChange={e => patch(idx, { enabled: e.target.checked })} />
                <span className="sm:hidden text-[color:var(--mid-gray)]">Active</span>
              </label>
              <button type="button" onClick={() => removeRow(idx)} className="text-xs px-3 py-2 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] justify-self-start sm:justify-self-center">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={addRow} className="text-sm px-3 py-2 rounded-md text-[color:var(--narra)] hover:bg-[color:var(--paper-2)] border" style={{ borderColor: 'var(--paper-3)' }}>+ Add voucher</button>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save vouchers'}</button>
      </div>
      <p className="text-[11px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>Editing as {adminEmail}.</p>

      {/* ── Personal early-bird vouchers ── */}
      <div className="pt-6 mt-2 border-t" style={{ borderColor: 'var(--paper-3)' }}>
        <h3 className="text-[16px] leading-tight text-[color:var(--deep-teal)]">Personal early-bird vouchers</h3>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1">
          Codes issued to individual students who availed of the AURA30 early-bird promo before the deadline. Each code can only be redeemed by its assigned student, so parents on monthly / bi-annual plans keep the 30% discount for the rest of the school year. Issue new ones from the student&rsquo;s profile → <span className="font-semibold">Personal Vouchers</span> card.
        </p>
        {personal.length === 0 ? (
          <div className="text-[12.5px] text-[color:var(--mid-gray)] italic py-3">No personal vouchers issued yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ fontFamily: 'var(--font-display)', borderColor: 'var(--paper-3)' }}>
                  <th className="text-left py-2 pr-3">Student</th>
                  <th className="text-left py-2 pr-3">Branch</th>
                  <th className="text-left py-2 pr-3">Code</th>
                  <th className="text-right py-2 pr-3">Discount</th>
                  <th className="text-left py-2 pr-3">Valid until</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Issued by</th>
                </tr>
              </thead>
              <tbody>
                {personal.map(v => {
                  const expired = isExpired(v.validUntil.slice(0, 10))
                  const s = v.dedicatedStudent
                  const name = s ? [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email : '(unknown student)'
                  return (
                    <tr key={v.id ?? v.code} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-[color:var(--deep-teal)]">{name}</div>
                        {s && <div className="text-[11px] text-[color:var(--mid-gray)]">{s.email}</div>}
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--mid-gray)]">{s?.branch ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="font-mono text-[12.5px] px-2 py-1 rounded bg-[color:var(--paper-2)] hover:bg-[color:var(--sage-tint)] border"
                          style={{ borderColor: 'var(--paper-3)' }}
                          onClick={() => { try { navigator.clipboard?.writeText(v.code) } catch { /* no-op */ } }}
                          title="Click to copy"
                        >{v.code}</button>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">{v.discountPercent}%</td>
                      <td className="py-2 pr-3 text-[color:var(--mid-gray)]">{new Date(v.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="py-2 pr-3">
                        {!v.enabled ? <span className="badge badge-rejected">Disabled</span>
                          : expired ? <span className="badge badge-rejected">Expired</span>
                          : <span className="badge badge-paid">Active</span>}
                      </td>
                      <td className="py-2 pr-3 text-[11.5px] text-[color:var(--mid-gray)]">{v.updatedBy ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
