'use client'

// Force dynamic rendering — admin page state depends on the per-user JWT
// (role, branch). Without this Next.js serves a prerendered HTML shell
// from the build that references older chunks, which means deploys take
// up to a year (s-maxage=31536000) to actually reach signed-in admins.
// Same cause as the /documents SSG cache bug fixed in PR #137.
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers, addUser, updateUser, deleteUser,
  setUserDisabled,
  sendPasswordResetLink, startImpersonation,
  levelLabel, branchLabel, roleLabel, generatePassword, ALL_BRANCHES,
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
import PaymentsGrouped from '@/components/PaymentsGrouped'
import FrontDeskPaymentConfirmations from '@/components/FrontDeskPaymentConfirmations'
import PromissoryNotesPanel from '@/components/PromissoryNotesPanel'
import AssignmentsPanel from '@/components/AssignmentsPanel'
import ClassesPanel from '@/components/ClassesPanel'
import {
  PAGE, PageHeader, PillTabs, DashCard, KpiCard, Banner, StatusPill, Tag, Dialog, EmptyState, RowsSkeleton, Skeleton, Icon,
  CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST,
  PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, TH, TH_STYLE, TD, TR, TR_STYLE, displayName,
} from '@/components/hub/ui'

type AdminTab = 'USERS' | 'STUDENTS' | 'CLASSES' | 'CURRICULUM' | 'PAYMENTS' | 'FEES' | 'ASSIGNMENTS'

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

  const TABS: Array<{ id: AdminTab; label: string }> = [
    { id: 'USERS', label: 'Users' },
    { id: 'STUDENTS', label: 'Students' },
    { id: 'CLASSES', label: 'Grade Levels' },
    { id: 'CURRICULUM', label: 'Curriculum' },
    { id: 'PAYMENTS', label: 'Payments' },
    { id: 'FEES', label: 'Fees' },
    { id: 'ASSIGNMENTS', label: 'Assignments' },
  ]

  return (
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        eyebrow={headerLabel}
        title={isMainAdmin ? 'Admin dashboard' : 'Branch dashboard'}
        description={<>Accounts, students, grade levels, payments and fees · signed in as <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{adminEmail}</span></>}
      />

      <PillTabs
        label="Admin dashboard sections"
        tabs={TABS}
        value={tab}
        onChange={id => setTab(id as AdminTab)}
      />

      {/* hub-frame gives the shared panels below Ops-Hub card framing
          (see globals.css); their insides are restyled in later phases. */}
      <div role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label} className="hub-frame space-y-5 min-w-0">
      {tab === 'USERS'         && <UsersPanel viewerRole={adminRole} viewerBranch={adminBranch} />}
      {tab === 'STUDENTS'      && <StudentListPanel viewer={{ role: 'ADMIN', email: adminEmail, name: isMainAdmin ? 'Main admin' : 'Branch admin' }} viewerBranch={isMainAdmin ? undefined : adminBranch} />}
      {tab === 'CLASSES'       && <ClassesPanel />}
      {tab === 'CURRICULUM'    && <CurriculumPanel viewer={{ role: 'ADMIN', email: adminEmail }} />}
      {tab === 'PAYMENTS'      && (
        <div className="space-y-5">
          {/* canDelete restricted to the main admin (not branch admin)
              because the server endpoint also enforces role === 'ADMIN'.
              Used to clear test rows that were never real payments. */}
          <FrontDeskPaymentConfirmations canDelete={isMainAdmin} />
          <PaymentsGrouped canSendReminders canDelete={isMainAdmin} senderEmail={adminEmail} senderName={isMainAdmin ? 'Main admin' : 'Branch admin'} senderRole="ADMIN" />
          {/* Promissory notes — finance-office artefact, hidden from
              teachers and students. Branch-scoped server-side; the
              viewerBranch prop here only affects the empty-state label. */}
          <PromissoryNotesPanel viewerBranch={isMainAdmin ? undefined : adminBranch} />
        </div>
      )}
      {tab === 'FEES'          && (
        <div className="space-y-5">
          <FeesPanel viewerRole={adminRole} viewerBranch={adminBranch} />
          {isMainAdmin && <VouchersPanel adminEmail={adminEmail} />}
        </div>
      )}
      {tab === 'ASSIGNMENTS'   && <AssignmentsPanel viewerBranch={isMainAdmin ? undefined : adminBranch} />}
      </div>
    </div>
  )
}

/* ─────────────────────── USERS PANEL ─────────────────────── */

type Filter = 'ALL' | UserRole

const ROLE_TAG_TONE: Record<UserRole, 'brand' | 'info' | 'warn' | 'neutral'> = {
  STUDENT:      'brand',
  TEACHER:      'info',
  FRONTDESK:    'neutral',
  BRANCH_ADMIN: 'neutral',
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
    // Interns keep the same TEACHER permissions but get flagged so the
    // intern-lifecycle cron can auto-disable them 15 days after their
    // contract-end month. linkedStaffId is the join key back to HR.
    const isIntern = (member.employmentType ?? '').toLowerCase() === 'intern'
    try {
      const created = await addUser({
        role: 'TEACHER', email: member.email, password,
        firstName: member.firstName || undefined,
        lastName: member.lastName || undefined,
        branch,
        isIntern,
        linkedStaffId: member.id,
      })
      refresh()
      const roleTag = isIntern ? 'Intern teacher' : 'Teacher'
      const lifecycleNote = isIntern && member.contractExpiry
        ? ` Auto-disables ${formatAutoDisableDate(member.contractExpiry)}.`
        : ''
      setInfo(`${roleTag} account created for ${created.firstName ?? member.firstName} ${created.lastName ?? member.lastName} (${branchLabel(branch)}).${lifecycleNote} Password: ${password}`)
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

  const counts = {
    students: scoped.filter(u => u.role === 'STUDENT').length,
    teachers: scoped.filter(u => u.role === 'TEACHER').length,
    interns: scoped.filter(u => u.role === 'TEACHER' && u.isIntern).length,
    frontdesk: scoped.filter(u => u.role === 'FRONTDESK').length,
    branchAdmins: scoped.filter(u => u.role === 'BRANCH_ADMIN').length,
    disabled: scoped.filter(u => !!u.disabledAt).length,
  }
  const FILTERS: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'ALL', label: 'All', count: scoped.length },
    { id: 'STUDENT', label: 'Students', count: counts.students },
    { id: 'TEACHER', label: 'Teachers', count: counts.teachers },
    { id: 'FRONTDESK', label: 'Front desk', count: counts.frontdesk },
    { id: 'BRANCH_ADMIN', label: 'Branch admins', count: counts.branchAdmins },
  ]
  const rowBtn = (color: string) => ({ ...CONTROL_STYLE, color })

  return (
    <>
      {/* ── At a glance ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Accounts" icon={<Icon name="users" />} value={scoped.length}
          sub={counts.disabled > 0 ? `${counts.disabled} disabled` : viewerRole === 'BRANCH_ADMIN' ? branchLabel(viewerBranch) : 'All branches'} />
        <KpiCard label="Students" icon={<Icon name="student" />} value={counts.students} sub="Parent / student logins" />
        <KpiCard label="Teachers" icon={<Icon name="teacher" />} accent="var(--slate)" value={counts.teachers}
          sub={counts.interns > 0 ? `${counts.interns} intern${counts.interns === 1 ? '' : 's'}` : 'Incl. interns'} />
        <KpiCard label="Office staff" icon={<Icon name="building" />} accent="var(--clay)" value={counts.frontdesk + counts.branchAdmins}
          sub={`${counts.frontdesk} front desk · ${counts.branchAdmins} branch admin${counts.branchAdmins === 1 ? '' : 's'}`} />
      </div>

      {err && <Banner tone="error">{err}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      <DashCard
        flush
        title="Users"
        icon={<Icon name="users" size={15} />}
        description={`${scoped.length} total · ${counts.students} students · ${counts.teachers} teachers · ${counts.frontdesk} front desk · ${counts.branchAdmins} branch admins`}
        action={
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" className="w-4 h-4 accent-[color:var(--deep-teal)]" checked={showPasswords} onChange={e => setShowPasswords(e.target.checked)} />
            Show passwords
          </label>
        }
        footer={<>
          Passwords are one-way encrypted on the server and can&apos;t be retrieved — not by Claude, not by Anthropic, not by us. The list shows the plaintext only when it was set or reset on <span className="font-semibold">this device</span>; otherwise the row shows <span className="font-semibold">who last set it and when</span>. To give a parent or staff member access, click <span className="font-semibold">Reset</span> next to their row.
        </>}
      >
        <div className="px-4 sm:px-5 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <PillTabs label="Filter users by role" size="sm" tabs={FILTERS} value={filter} onChange={id => setFilter(id as Filter)} />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="users" title="No users in this view." hint="Try another role filter, or create an account below." />
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 520 }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  {['Role', 'Name', 'Email', 'Branch', 'Password', 'Level', 'Created', ''].map((h, i) => (
                    <th key={`${h}-${i}`} className={`${TH} ${i === 7 ? 'text-right' : ''}`} style={TH_STYLE}>
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    className={TR}
                    style={{ ...TR_STYLE, ...(u.disabledAt ? { background: SUBTLE_BG } : {}) }}
                    title={u.disabledAt ? `Disabled by ${u.disabledBy ?? 'unknown'} on ${new Date(u.disabledAt).toLocaleDateString()}` : undefined}
                  >
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag tone={ROLE_TAG_TONE[u.role] ?? 'neutral'}>{roleLabel(u.role)}</Tag>
                        {u.isIntern && (
                          <Tag
                            tone="warn"
                            title={u.internContractExpiry
                              ? `Intern — auto-disables ${formatAutoDisableDate(u.internContractExpiry)} (15 days after the end of the contract month, ${formatShortDate(u.internContractExpiry)})`
                              : 'Intern — no contract end on file, will not auto-disable'}
                          >
                            Intern
                          </Tag>
                        )}
                        {u.disabledAt && (
                          <StatusPill tone="error" title="Cannot sign in. Hidden from teacher and front-desk lists.">Disabled</StatusPill>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} font-semibold ${u.disabledAt ? 'opacity-60' : ''}`} style={{ color: 'var(--charcoal)' }}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className={`${TD} text-[13px] break-all ${u.disabledAt ? 'opacity-60' : ''}`} style={{ color: 'var(--mid-gray)', minWidth: 180 }}>{u.email}</td>
                    <td className={`${TD} text-[12.5px] whitespace-nowrap`}>{branchLabel(u.branch)}</td>
                    <td className={`${TD} font-mono text-[12.5px]`} style={{ minWidth: 170 }}>
                      {u.password ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{showPasswords ? u.password : '•'.repeat(Math.min(u.password.length, 10))}</span>
                          <button
                            type="button"
                            className={`${BTN_SM} h-7 font-sans`}
                            style={rowBtn('var(--deep-teal)')}
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
                            className={`${BTN_SM} h-7 font-sans`}
                            style={rowBtn('var(--deep-teal)')}
                            onClick={() => { setResetting(u); setErr(null); setInfo(null) }}
                          >Reset</button>
                        </div>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{u.level ? levelLabel(u.level) : '—'}</td>
                    <td className={`${TD} text-[color:var(--mid-gray)] text-xs whitespace-nowrap tabular-nums`}>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-1.5 flex-wrap" style={{ minWidth: 220 }}>
                        <button type="button" className={BTN_SM} style={rowBtn('var(--charcoal)')} onClick={() => { setEditing(u); setErr(null); setInfo(null) }}>Edit</button>
                        {u.role !== 'BRANCH_ADMIN' && (
                          <button
                            type="button"
                            className={BTN_SM}
                            style={rowBtn('var(--deep-teal)')}
                            title="Open this user's portal as them. A persistent banner lets you return to your admin session; the session is audit-logged."
                            onClick={() => handleViewAs(u)}
                          >View as</button>
                        )}
                        <button
                          type="button"
                          className={BTN_SM}
                          style={rowBtn('var(--teal)')}
                          title="Email a one-shot reset link — the user picks their own new password."
                          onClick={() => handleSendResetLink(u)}
                        >Email reset link</button>
                        {viewerRole === 'ADMIN' && (
                          <button
                            type="button"
                            className={BTN_SM}
                            style={rowBtn(u.disabledAt ? 'var(--teal)' : 'var(--mid-gray)')}
                            title={u.disabledAt
                              ? 'Re-enable this account so the user can sign in again.'
                              : "Disable this account. The user can't sign in and is hidden from teacher / front-desk lists, but their enrollment and payment history are preserved. Reversible."}
                            onClick={() => handleToggleDisabled(u)}
                          >{u.disabledAt ? 'Enable' : 'Disable'}</button>
                        )}
                        {viewerRole === 'ADMIN' && (
                          <button type="button" className={BTN_DANGER_GHOST} style={{ color: '#B42318' }} onClick={() => handleDelete(u)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      <DashCard
        title="Create staff account"
        icon={<Icon name="userPlus" size={15} />}
        description={viewerRole === 'ADMIN'
          ? 'Mint a teacher, front desk, or branch admin account directly. The password you set here is shown once below — copy it before navigating away.'
          : `You can create teacher and front-desk accounts scoped to ${branchLabel(viewerBranch)}.`}
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4" onSubmit={handleCreate}>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Role</span>
            <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={newRole} onChange={e => setNewRole(e.target.value as Exclude<UserRole, 'STUDENT'>)}>
              {creatableRoles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Branch {needsBranch ? '' : <span className="normal-case tracking-normal font-normal">(not required for teachers)</span>}</span>
            <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={newBranch} onChange={e => setNewBranch(e.target.value as Branch | '')} disabled={viewerRole === 'BRANCH_ADMIN'}>
              <option value="">—</option>
              {ALL_BRANCHES.map(b => <option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>First name</span>
            <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={newFirst} onChange={e => setNewFirst(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Last name</span>
            <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={newLast} onChange={e => setNewLast(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL} style={LABEL_STYLE}>Email</span>
            <input required type="email" className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="staff@sapphireclinicseast.org" />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL} style={LABEL_STYLE}>Password</span>
            <div className="flex gap-2">
              <input required minLength={6} className={`${CONTROL} flex-1 min-w-0 font-mono`} style={CONTROL_STYLE} value={newPw} onChange={e => setNewPw(e.target.value)} />
              <button type="button" onClick={() => setNewPw(generatePassword())} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                <Icon name="refresh" size={14} /> Generate
              </button>
            </div>
          </label>
          <div className="sm:col-span-2 flex justify-end pt-1" style={{ borderTop: '1px solid var(--light-gray)', paddingTop: 16 }}>
            <button type="submit" disabled={creating} className={`${BTN_PRIMARY} w-full sm:w-auto`} style={PRIMARY_STYLE}>
              <Icon name="userPlus" size={15} />
              {creating ? 'Creating…' : `Create ${roleLabel(newRole).toLowerCase()}`}
            </button>
          </div>
        </form>
      </DashCard>

      <DashCard
        flush
        title="Add teacher from Staff Module"
        icon={<Icon name="teacher" size={15} />}
        description={<>Showing <span className="font-semibold">active SPED teachers + interns</span> from <span className="font-semibold">HR Hub</span>.</>}
        action={staffLoading ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Loading staff…</span> : undefined}
      >
        <div className="px-4 sm:px-5 pt-4 space-y-3">
          <Banner tone="info">
            <span className="font-semibold">Intern accounts auto-disable</span> 15 days after the end of their internship-end month
            (e.g. an August end date auto-disables on September 15). They keep the same upload / edit permissions as a regular
            SPED teacher while active. Re-enable manually from the Users list if HR extends their contract.
          </Banner>

          {staffErr && <Banner tone="error">Couldn&apos;t load Staff Module: {staffErr}</Banner>}

          <div className="flex flex-wrap items-end gap-3 pb-4">
            <label className="block flex-1 min-w-[200px]">
              <span className={LABEL} style={LABEL_STYLE}>Search</span>
              <span className="relative block">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                <input className={`${CONTROL} w-full pl-8`} style={CONTROL_STYLE} placeholder="Name, job title, or email" value={staffSearch} onChange={e => setStaffSearch(e.target.value)} />
              </span>
            </label>
            <label className="block w-full sm:w-auto">
              <span className={LABEL} style={LABEL_STYLE}>Branch</span>
              <select className={`${CONTROL} w-full sm:w-[220px]`} style={CONTROL_STYLE} value={staffBranchFilter} onChange={e => setStaffBranchFilter(e.target.value as typeof staffBranchFilter)}>
                <option value="">All branches</option>
                <option value="SBEA">East Branch</option>
                <option value="SBGH">Greenhills Branch</option>
              </select>
            </label>
          </div>
        </div>

        {staffLoading && filteredStaff.length === 0 ? (
          <div style={{ borderTop: '1px solid var(--light-gray)' }}><RowsSkeleton rows={4} label="Loading staff" /></div>
        ) : !staffLoading && filteredStaff.length === 0 ? (
          <div style={{ borderTop: '1px solid var(--light-gray)' }}>
            <EmptyState icon="teacher" title={staff.length === 0 ? 'No SPED teachers returned from the Staff Module.' : 'No SPED teachers match this search.'} />
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 460 }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 820 }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  {['Name', 'Role', 'Job title', 'Branch', 'Email', 'Contract end', ''].map((h, i) => (
                    <th key={`${h}-${i}`} className={`${TH} ${i === 6 ? 'text-right' : ''}`} style={TH_STYLE}>
                      {h || <span className="sr-only">Account</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(m => {
                  const has = teacherEmailSet.has(m.email.toLowerCase())
                  const isIntern = (m.employmentType ?? '').toLowerCase() === 'intern'
                  return (
                    <tr key={m.id} className={TR} style={TR_STYLE}>
                      <td className={`${TD} whitespace-nowrap font-semibold`} style={{ color: 'var(--charcoal)' }}>{displayName(`${m.firstName} ${m.lastName}`)}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {isIntern
                          ? <Tag tone="warn" title="Auto-disables 15 days after contract end month">Intern</Tag>
                          : <span className="text-[12.5px] text-[color:var(--mid-gray)]">Staff</span>}
                      </td>
                      <td className={TD}>{m.jobTitle || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                      <td className={`${TD} text-[12.5px] whitespace-nowrap`}>{m.branch === 'SBEA' ? 'East Branch' : m.branch === 'SBGH' ? 'Greenhills Branch' : m.branch}</td>
                      <td className={`${TD} text-[12.5px] break-all`} style={{ minWidth: 160 }}>{m.email || <span className="text-[color:var(--mid-gray)]">no email on file</span>}</td>
                      <td className={`${TD} text-[12.5px] whitespace-nowrap tabular-nums`}>
                        {m.contractExpiry
                          ? <span title={`Auto-disables ${formatAutoDisableDate(m.contractExpiry)}`}>{formatShortDate(m.contractExpiry)}</span>
                          : <span className="text-[color:var(--mid-gray)]">—</span>}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        {has ? <StatusPill tone="success">Account exists</StatusPill> : <CreateTeacherInlineForm onCreate={pw => handleCreateFromStaff(m, pw)} disabled={!m.email} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {editing && (
        <Dialog labelId="edit-user-title" title={`Edit ${roleLabel(editing.role).toLowerCase()}`} description={editing.email} onClose={() => setEditing(null)}>
            <form className="space-y-4" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block"><span className={LABEL} style={LABEL_STYLE}>First name</span><input name="firstName" className={`${CONTROL} w-full`} style={CONTROL_STYLE} defaultValue={editing.firstName ?? ''} /></label>
                <label className="block"><span className={LABEL} style={LABEL_STYLE}>Last name</span><input name="lastName" className={`${CONTROL} w-full`} style={CONTROL_STYLE} defaultValue={editing.lastName ?? ''} /></label>
              </div>
              <label className="block"><span className={LABEL} style={LABEL_STYLE}>Email</span><input required name="email" type="email" className={`${CONTROL} w-full`} style={CONTROL_STYLE} defaultValue={editing.email} /></label>
              <label className="block">
                <span className={LABEL} style={LABEL_STYLE}>Branch</span>
                <select name="branch" className={`${CONTROL} w-full`} style={CONTROL_STYLE} defaultValue={editing.branch ?? ''}>
                  <option value="">—</option>
                  {ALL_BRANCHES.map(b => <option key={b} value={b}>{branchLabel(b)}</option>)}
                </select>
              </label>
              {/* Grade level is meaningful for STUDENT rows only — staff
                  accounts (teacher / front desk / branch admin) have no
                  level on the record. Hide the field for them so the
                  form doesn't accidentally try to set one. */}
              {editing.role === 'STUDENT' && (
                <label className="block">
                  <span className={LABEL} style={LABEL_STYLE}>Grade level</span>
                  <select name="level" className={`${CONTROL} w-full`} style={CONTROL_STYLE} defaultValue={editing.level ?? ''}>
                    <option value="">—</option>
                    {ALL_GRADE_LEVELS.map(l => (
                      <option key={l} value={l}>{levelLabel(l)}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className={LABEL} style={LABEL_STYLE}>New password <span className="normal-case tracking-normal font-normal">(leave blank to keep current)</span></span>
                <input name="password" className={`${CONTROL} w-full font-mono`} style={CONTROL_STYLE} minLength={6} placeholder="Leave blank to keep current" />
              </label>
              <div className="flex items-center gap-2 pt-2">
                <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className={`${BTN_PRIMARY} flex-1`} style={PRIMARY_STYLE}>Save changes</button>
              </div>
            </form>
        </Dialog>
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
    <Dialog labelId="reset-password-title" title="Reset password" description={user.email} onClose={onCancel}>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          The current password can&apos;t be retrieved. Setting a new one will overwrite it. Copy the value before closing — it&apos;s only shown to you.
        </p>
        <label className="block mb-5">
          <span className={LABEL} style={LABEL_STYLE}>New password</span>
          <div className="flex gap-2">
            <input className={`${CONTROL} flex-1 min-w-0 font-mono`} style={CONTROL_STYLE} minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoFocus />
            <button type="button" onClick={() => setPw(generatePassword())} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
              <Icon name="refresh" size={14} /> Generate
            </button>
          </div>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onCancel}>Cancel</button>
          <button type="button" className={`${BTN_PRIMARY} flex-1`} style={PRIMARY_STYLE} onClick={() => onConfirm(pw)}>Save new password</button>
        </div>
    </Dialog>
  )
}

function CreateTeacherInlineForm({ onCreate, disabled }: { onCreate: (pw: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  if (!open) return (
    <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={BTN_SM} style={SECONDARY_STYLE}
      title={disabled ? 'No email on file in the Staff Module' : undefined}>
      <Icon name="plus" size={13} /> Create account
    </button>
  )
  return (
    <div className="inline-flex items-center gap-1.5">
      <input autoFocus type="text" aria-label="Password for the new account" placeholder="password (min 6)" className={`h-8 px-2.5 rounded-lg text-xs outline-none focus:border-[color:var(--teal)] font-mono`} value={pw} onChange={e => setPw(e.target.value)} style={{ ...CONTROL_STYLE, width: 170 }} />
      <button type="button" onClick={() => { onCreate(pw); setOpen(false); setPw('') }} className={`${BTN_SM} text-white hover:opacity-90`} style={PRIMARY_STYLE}>Save</button>
      <button type="button" onClick={() => { setOpen(false); setPw('') }} className={BTN_SM} style={{ color: 'var(--mid-gray)' }}>Cancel</button>
    </div>
  )
}

/* ─────────────────────── FEES PANEL ─────────────────────── */

/** Short human date — "Aug 25, 2026". Falls back to raw string on parse fail. */
function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Compute the intern auto-disable date: end of contract-end month + 15
 *  days. e.g. a contractExpiry anywhere in August 2026 disables on
 *  September 15, 2026. Returns a human string like "Sep 15, 2026". */
export function computeAutoDisableDate(contractExpiryIso: string): Date | null {
  const d = new Date(contractExpiryIso)
  if (isNaN(d.getTime())) return null
  // First day of the NEXT month, then + 15 days = 16th of the next month
  // (i.e. 15 days after the end of the intern's contract month).
  const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  nextMonth.setUTCDate(nextMonth.getUTCDate() + 15)
  return nextMonth
}

function formatAutoDisableDate(contractExpiryIso: string): string {
  const d = computeAutoDisableDate(contractExpiryIso)
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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
    return ALL_BRANCHES
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

  if (loading && fees.length === 0) return (
    <DashCard title="Tuition + fees" icon={<Icon name="wallet" size={15} />} description="Loading fees…">
      <div role="status" aria-label="Loading fees" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} aria-hidden>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full mt-2" />
          </div>
        ))}
      </div>
    </DashCard>
  )

  return (
    <DashCard
      title="Tuition + fees"
      icon={<Icon name="wallet" size={15} />}
      description="Set per-branch tuition (annual / bi-annual / monthly), miscellaneous fees, and any extra line items (uniforms, books, etc.). What you save here is what every student under that branch sees on the Pay portal."
      footer={<>Defaults when a branch has not been set: tuition ₱{centavosToPeso(DEFAULT_FEE_VALUES.tuitionAnnualCentavos)} annual · ₱{centavosToPeso(DEFAULT_FEE_VALUES.tuitionBiannualCentavos)} bi-annual · ₱{centavosToPeso(DEFAULT_FEE_VALUES.tuitionMonthlyCentavos)} monthly.</>}
    >
      <div className="space-y-5">
      {err  && <Banner tone="error">{err}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      {visibleBranches.map(b => {
        const f = fees.find(x => x.branch === b)
        if (!f) return null
        return (
          <div key={b} className="rounded-xl p-4 sm:p-5" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
            <div className="flex items-center justify-between mb-4 gap-x-3 gap-y-1 flex-wrap">
              <h3 className="text-[14px] font-bold leading-tight tracking-normal flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <Icon name="building" size={15} style={{ color: 'var(--teal)' }} />
                {branchLabel(b)}
              </h3>
              {f.updatedAt && (
                <span className="text-[11.5px] text-[color:var(--mid-gray)]">Last updated {new Date(f.updatedAt).toLocaleString()} {f.updatedBy ? `by ${f.updatedBy}` : ''}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-4">
              <PesoInput label="Tuition — Annual"    centavos={f.tuitionAnnualCentavos}    onChange={c => patch(b, { tuitionAnnualCentavos: c })} />
              <PesoInput label="Tuition — Bi-annual" centavos={f.tuitionBiannualCentavos}  onChange={c => patch(b, { tuitionBiannualCentavos: c })} />
              <PesoInput label="Tuition — Monthly"   centavos={f.tuitionMonthlyCentavos}   onChange={c => patch(b, { tuitionMonthlyCentavos: c })} />
              <PesoInput label="Misc — Annual"       centavos={f.miscAnnualCentavos}       onChange={c => patch(b, { miscAnnualCentavos: c })} />
              <PesoInput label="Misc — Bi-annual"    centavos={f.miscBiannualCentavos}     onChange={c => patch(b, { miscBiannualCentavos: c })} />
              <PesoInput label="Misc — Monthly"      centavos={f.miscMonthlyCentavos}      onChange={c => patch(b, { miscMonthlyCentavos: c })} />
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div className="min-w-0">
                  <h4 className="text-[13px] font-bold tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Other line items</h4>
                  <p className="text-[11.5px] text-[color:var(--mid-gray)]">Uniforms, books, supplies — anything else parents should see itemized on the Pay portal.</p>
                </div>
                <button type="button" onClick={() => addExtra(b)} className={BTN_SM} style={SECONDARY_STYLE}><Icon name="plus" size={13} /> Add item</button>
              </div>

              {f.extraItems.length === 0 && (
                <div className="text-[12.5px] text-[color:var(--mid-gray)] py-2">No extra items yet.</div>
              )}

              {f.extraItems.map((x, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto] gap-2 mb-3 sm:mb-2 items-end rounded-lg p-3 sm:p-0 bg-white sm:bg-transparent border sm:border-0 border-[color:var(--light-gray)]">
                  <label className="block">
                    <span className={LABEL} style={LABEL_STYLE}>Label</span>
                    <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="e.g. Uniform set" value={x.label} onChange={e => patchExtra(b, idx, { label: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className={LABEL} style={LABEL_STYLE}>Amount (₱)</span>
                    <input className={`${CONTROL} w-full text-right tabular-nums`} style={CONTROL_STYLE} inputMode="decimal" placeholder="0.00" value={centavosToPeso(x.amountCentavos)} onChange={e => patchExtra(b, idx, { amountCentavos: pesoToCentavos(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className={LABEL} style={LABEL_STYLE}>Notes (optional)</span>
                    <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="e.g. payable at front desk" value={x.notes ?? ''} onChange={e => patchExtra(b, idx, { notes: e.target.value })} />
                  </label>
                  <button type="button" onClick={() => removeExtra(b, idx)} className={`${BTN_DANGER_GHOST} h-9 justify-self-start`} style={{ color: '#B42318' }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={handleSave} className={`${BTN_PRIMARY} w-full sm:w-auto`} style={PRIMARY_STYLE}>Save fees</button>
      </div>
      </div>
    </DashCard>
  )
}

function PesoInput({ label, centavos, onChange }: { label: string; centavos: number; onChange: (c: number) => void }) {
  return (
    <label className="block">
      <span className={LABEL} style={LABEL_STYLE}>{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--mid-gray)] pointer-events-none">₱</span>
        <input
          className={`${CONTROL} w-full text-right pl-7 tabular-nums`}
          style={CONTROL_STYLE}
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
    <div className="space-y-5">
    <DashCard
      title="Voucher codes"
      icon={<Icon name="tag" size={15} />}
      description={<>Create promo codes parents can type on the Pay portal to get a percentage off their tuition. The discount applies to the tuition portion (annual / bi-annual / monthly) up to and including the <span className="font-semibold">Valid until</span> date.</>}
      footer={<>Codes are not case-sensitive and apply across both branches. Untick <span className="font-semibold">Active</span> to pause a code without deleting it. Editing as {adminEmail}.</>}
    >
      <div className="space-y-4">
      {err  && <Banner tone="error">{err}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      {loading && rows.length === 0 ? (
        <div role="status" aria-label="Loading vouchers" className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="tag" title="No voucher codes yet." hint="Add one below." />
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_120px_160px_90px_auto] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <span>Code</span><span>Discount %</span><span>Valid until</span><span>Active</span><span />
          </div>
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_160px_90px_auto] gap-2 items-center rounded-xl p-3 sm:p-2" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <input aria-label="Voucher code" className={`${CONTROL} w-full uppercase tracking-wide font-mono`} style={CONTROL_STYLE} placeholder="e.g. PROMO30" value={r.code} onChange={e => patch(idx, { code: e.target.value })} />
              <div className="relative">
                <input aria-label="Discount percent" className={`${CONTROL} w-full text-right pr-7 tabular-nums`} style={CONTROL_STYLE} inputMode="numeric" value={String(r.discountPercent)} onChange={e => patch(idx, { discountPercent: Math.max(0, Math.min(100, Math.round(Number(e.target.value.replace(/[^\d]/g, '')) || 0))) })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--mid-gray)] pointer-events-none">%</span>
              </div>
              <div>
                <input aria-label="Valid until" type="date" className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={r.validUntil} onChange={e => patch(idx, { validUntil: e.target.value })} />
                {r.validUntil && isExpired(r.validUntil) && <span className="mt-1 inline-block"><StatusPill tone="warn">Expired</StatusPill></span>}
              </div>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[color:var(--deep-teal)]" checked={r.enabled} onChange={e => patch(idx, { enabled: e.target.checked })} />
                <span className="sm:sr-only text-[color:var(--mid-gray)]">Active</span>
              </label>
              <button type="button" onClick={() => removeRow(idx)} className={`${BTN_DANGER_GHOST} justify-self-start sm:justify-self-center`} style={{ color: '#B42318' }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={addRow} className={BTN_SECONDARY} style={SECONDARY_STYLE}><Icon name="plus" size={14} /> Add voucher</button>
        <button type="button" onClick={handleSave} disabled={saving} className={BTN_PRIMARY} style={PRIMARY_STYLE}>{saving ? 'Saving…' : 'Save vouchers'}</button>
      </div>
      </div>
    </DashCard>

      {/* ── Personal early-bird vouchers ── */}
      <DashCard
        flush
        title="Personal early-bird vouchers"
        icon={<Icon name="student" size={15} />}
        description={<>Codes issued to individual students who availed of the AURA30 early-bird promo before the deadline. Each code can only be redeemed by its assigned student, so parents on monthly / bi-annual plans keep the 30% discount for the rest of the school year. Issue new ones from the student&rsquo;s profile → <span className="font-semibold">Personal Vouchers</span> card.</>}
      >
        {personal.length === 0 ? (
          <EmptyState icon="tag" title="No personal vouchers issued yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  {['Student', 'Branch', 'Code', 'Discount', 'Valid until', 'Status', 'Issued by'].map((h, i) => (
                    <th key={h} className={`${TH} ${i === 3 ? 'text-right' : ''}`} style={TH_STYLE}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {personal.map(v => {
                  const expired = isExpired(v.validUntil.slice(0, 10))
                  const s = v.dedicatedStudent
                  const name = s ? [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email : '(unknown student)'
                  return (
                    <tr key={v.id ?? v.code} className={TR} style={TR_STYLE}>
                      <td className={TD}>
                        <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{name}</div>
                        {s && <div className="text-[11px] text-[color:var(--mid-gray)] break-all">{s.email}</div>}
                      </td>
                      <td className={`${TD} text-[color:var(--mid-gray)]`}>{s?.branch ?? '—'}</td>
                      <td className={TD}>
                        <button
                          type="button"
                          className={`${BTN_SM} h-7 font-mono text-[12.5px]`}
                          style={{ ...CONTROL_STYLE, background: SUBTLE_BG }}
                          onClick={() => { try { navigator.clipboard?.writeText(v.code) } catch { /* no-op */ } }}
                          title="Click to copy"
                          aria-label={`Copy code ${v.code}`}
                        >{v.code}</button>
                      </td>
                      <td className={`${TD} text-right font-semibold tabular-nums`}>{v.discountPercent}%</td>
                      <td className={`${TD} text-[color:var(--mid-gray)] whitespace-nowrap`}>{new Date(v.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className={TD}>
                        {!v.enabled ? <StatusPill tone="neutral">Disabled</StatusPill>
                          : expired ? <StatusPill tone="warn">Expired</StatusPill>
                          : <StatusPill tone="success">Active</StatusPill>}
                      </td>
                      <td className={`${TD} text-[11.5px] text-[color:var(--mid-gray)]`}>{v.updatedBy ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
    </div>
  )
}
