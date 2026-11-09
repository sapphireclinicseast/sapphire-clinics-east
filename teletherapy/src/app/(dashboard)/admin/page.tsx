'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus,
  Users,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Clock,
  Mail,
  Trash2,
  Search,
  X,
  RefreshCw,
  Building2,
} from 'lucide-react'
import {
  Avatar, DashCard, EmptyState, PageHeader, RowsSkeleton, Skeleton, StatusPill, Tag,
  BTN_DANGER_GHOST, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, DANGER, FOCUS,
  LABEL, LABEL_STYLE, PAGE, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, TR, TR_STYLE,
} from '@/components/hub/ui'

// Public-facing branch codes: SBEA/SANDBOX_EAST = Aura Health East (AHEA),
// SBGH/SANDBOX_GREENHILLS = Aura Health Greenhills (AHGH).
const BRANCH_LABEL: Record<string, string> = {
  SANDBOX_EAST: 'AHEA',
  SANDBOX_GREENHILLS: 'AHGH',
  VERDANA_STORE: 'Verdana',
  SBEA: 'AHEA',
  SBGH: 'AHGH',
}

interface StaffOption {
  id: string
  firstName: string
  lastName: string
  department: string
  branch: string
  email: string | null
  employmentType?: string | null
  jobTitle?: string | null
}

function isInternStaff(s: Pick<StaffOption, 'employmentType' | 'jobTitle'>): boolean {
  return s.employmentType === 'intern' || /intern/i.test(s.jobTitle ?? '')
}

interface TherapistAccountItem {
  id: string
  email: string
  role: string
  accountType?: string
  isActive: boolean
  lastLoginAt: string | null
  lastPlainPassword: string | null
  createdAt: string
  staffId: string
  staff: {
    firstName: string
    lastName: string
    department: string
    branch: string
  }
}

export default function AdminPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [accounts, setAccounts] = useState<TherapistAccountItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accountType, setAccountType] = useState<'CLINICIAN' | 'FRONT_DESK' | 'ADMIN_STAFF' | 'ADMIN' | 'INTERN'>('CLINICIAN')
  const [toast, setToast] = useState<string | null>(null)
  const [changingPasswordId, setChangingPasswordId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')

  // Branch CC emails (for IE email tracking)
  const [ccEmails, setCcEmails] = useState<{ branch: string; email: string; notes?: string | null }[]>([])
  const [knownBranches, setKnownBranches] = useState<string[]>([])
  const [ccBranch, setCcBranch] = useState('')
  const [ccEmail, setCcEmail] = useState('')
  const [ccNotes, setCcNotes] = useState('')
  const [savingCc, setSavingCc] = useState(false)

  useEffect(() => {
    if (session?.user?.role !== 'ADMIN') { router.push('/'); return }
    fetchData()
  }, [session])

  async function fetchData() {
    setLoading(true)
    // cache: 'no-store' on the accounts fetch so a stale browser/CDN
    // cache can't keep showing pre-change passwords after Save.
    const [staffRes, accountsRes, ccRes] = await Promise.all([
      fetch('/api/staff'),
      fetch('/api/therapist-accounts', { cache: 'no-store' }),
      fetch('/api/admin/branch-cc-emails'),
    ])
    if (staffRes.ok) setStaffList((await staffRes.json()).staff ?? [])
    if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? [])
    if (ccRes.ok) {
      const ccData = await ccRes.json()
      setCcEmails(ccData.ccEmails ?? [])
      setKnownBranches(ccData.knownBranches ?? [])
      if (!ccBranch && ccData.knownBranches?.length) setCcBranch(ccData.knownBranches[0])
    }
    setLoading(false)
  }

  async function handleSyncFromHr() {
    setSyncing(true)
    try {
      const res = await fetch('/api/staff/sync-hr', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast(data.error || 'Sync failed')
      } else {
        const { created = 0, updated = 0 } = data
        setToast(
          created || updated
            ? `Synced from HR — ${created} added, ${updated} updated`
            : 'Already up to date with HR',
        )
        await fetchData() // refresh the staff list so new interns appear below
      }
    } catch {
      setToast('Could not reach HR — try again')
    } finally {
      setSyncing(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  async function saveCcEmail() {
    if (!ccBranch || !ccEmail) {
      setToast('Branch and email required')
      setTimeout(() => setToast(null), 3000)
      return
    }
    setSavingCc(true)
    try {
      const res = await fetch('/api/admin/branch-cc-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: ccBranch, email: ccEmail, notes: ccNotes || undefined }),
      })
      if (!res.ok) {
        const e = await res.json()
        setToast(e.error ?? 'Failed to save')
      } else {
        setToast('Branch CC email saved')
        setCcEmail('')
        setCcNotes('')
        fetchData()
      }
    } catch {
      setToast('Failed to save')
    }
    setTimeout(() => setToast(null), 3000)
    setSavingCc(false)
  }

  async function removeCcEmail(branch: string) {
    if (!confirm(`Remove CC email for ${branch}?`)) return
    try {
      await fetch(`/api/admin/branch-cc-emails?branch=${encodeURIComponent(branch)}`, { method: 'DELETE' })
      fetchData()
    } catch {}
  }

  function onStaffSelect(staffId: string) {
    setSelectedStaffId(staffId)
    const staff = staffList.find((s) => s.id === staffId)
    if (staff?.email) setEmail(staff.email)
    // Interns default to the Intern account type; admin can still change it.
    if (staff && isInternStaff(staff)) setAccountType('INTERN')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStaffId || !email || !password) return
    setCreating(true)
    try {
      const res = await fetch('/api/therapist-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: selectedStaffId, email, password, accountType }),
      })
      if (res.ok) {
        showToast('Account created successfully')
        setSelectedStaffId(''); setEmail(''); setPassword(''); setAccountType('CLINICIAN')
        fetchData()
      } else {
        showToast((await res.json()).error ?? 'Failed')
      }
    } catch { showToast('Failed to create account') }
    setCreating(false)
  }

  async function toggleActive(accountId: string, currentlyActive: boolean) {
    try {
      const res = await fetch('/api/therapist-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, isActive: !currentlyActive }),
      })
      if (res.ok) { fetchData(); showToast(currentlyActive ? 'Account deactivated' : 'Account activated') }
    } catch { showToast('Failed to update') }
  }

  async function handleChangePassword(accountId: string) {
    if (!newPassword || newPassword.length < 8) { showToast('Password must be at least 8 characters'); return }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/therapist-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, newPassword }),
      })
      if (res.ok) {
        showToast('Password changed successfully')
        setChangingPasswordId(null)
        setNewPassword('')
        // Refresh the list so the new lastPlainPassword shows up
        // immediately under this row. Without this the UI keeps
        // displaying pre-change state (or nothing, for accounts
        // that previously had no recorded password) and the admin
        // thinks the change didn't take.
        fetchData()
      } else {
        showToast((await res.json()).error ?? 'Failed')
      }
    } catch { showToast('Failed to change password') }
    setSavingPassword(false)
  }

  async function handleChangeEmail(accountId: string) {
    if (!newEmail || !newEmail.includes('@')) { showToast('Please enter a valid email'); return }
    setSavingEmail(true)
    try {
      const res = await fetch('/api/therapist-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, newEmail }),
      })
      if (res.ok) {
        showToast('Email updated successfully')
        setEditingEmailId(null)
        setNewEmail('')
        fetchData()
      } else {
        showToast((await res.json()).error ?? 'Failed')
      }
    } catch { showToast('Failed to update email') }
    setSavingEmail(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  // A staff member is "already accounted" if their own Staff row has an
  // account (by staffId) OR if another Staff row with the SAME name AND
  // department already has one. The second check hides duplicate Staff rows:
  // interbranch consultants often end up with a stale legacy row that holds
  // the account plus a fresh HR-synced row (different hrPlatformId) that has
  // none — without this, the account-less duplicate kept showing here even
  // though the person already has a login. Keyed on name + department (not
  // name alone) so two genuinely different people who merely share a name
  // aren't wrongly hidden.
  const nameDeptKey = (firstName: string, lastName: string, department: string) =>
    `${firstName}|${lastName}|${department}`.toLowerCase().trim()
  const accountedStaffIds = new Set(accounts.map((a) => a.staffId))
  const accountedNameDept = new Set(
    accounts.map((a) => nameDeptKey(a.staff.firstName, a.staff.lastName, a.staff.department)),
  )
  const availableStaff = staffList.filter(
    (s) =>
      !accountedStaffIds.has(s.id) &&
      !accountedNameDept.has(nameDeptKey(s.firstName, s.lastName, s.department)),
  )

  if (loading) {
    return (
      <div className={PAGE}>
        <PageHeader eyebrow="Admin" title="Admin Panel" description="Manage therapist accounts and access" />
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          <RowsSkeleton rows={5} label="Loading admin panel" />
        </div>
      </div>
    )
  }

  return (
    <div className={PAGE}>
      {toast && <div className="toast" role="status">{toast}</div>}

      <PageHeader eyebrow="Admin" title="Admin Panel" description="Manage therapist accounts and access" />

      {/* Create Account Form */}
      <DashCard
        title="Create Account"
        icon={<UserPlus size={16} />}
        action={
          <button
            type="button"
            onClick={handleSyncFromHr}
            disabled={syncing}
            title="Pull the latest staff & interns from the HR Platform so new people appear in the list below"
            className={BTN_SECONDARY}
            style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from HR'}
          </button>
        }
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <label htmlFor="admin-staff" className={LABEL} style={LABEL_STYLE}>
                Staff Member <span style={{ color: DANGER }}>*</span>
              </label>
              <select id="admin-staff" value={selectedStaffId} onChange={(e) => onStaffSelect(e.target.value)} required className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                <option value="">Select staff member...</option>
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.department} – {BRANCH_LABEL[s.branch] ?? s.branch}){isInternStaff(s) ? ' · INTERN' : ''}</option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor="admin-email" className={LABEL} style={LABEL_STYLE}>
                Login Email <span style={{ color: DANGER }}>*</span>
              </label>
              <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="therapist@email.com" />
            </div>

            <div className="min-w-0">
              <label htmlFor="admin-password" className={LABEL} style={LABEL_STYLE}>
                Password <span style={{ color: DANGER }}>*</span>
              </label>
              <div className="relative">
                <input id="admin-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={6} className={`${CONTROL} w-full pr-10`} style={CONTROL_STYLE} placeholder="Min 6 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-[color:var(--paper)] ${FOCUS}`}
                  style={{ color: 'var(--mid-gray)' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <label htmlFor="admin-account-type" className={LABEL} style={LABEL_STYLE}>Account Type</label>
              <select id="admin-account-type" value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                <option value="CLINICIAN">Clinician — full clinical access</option>
                <option value="INTERN">Intern — clinical access, cannot send notes/reports</option>
                <option value="FRONT_DESK">Front Desk (Administration) — no patient pages, incl. Patients Love</option>
                <option value="ADMIN_STAFF">Administration staff — no patient pages, no Patients Love</option>
                <option value="ADMIN">Admin — full access + Admin Panel</option>
              </select>
              <p className="text-[11px] leading-snug mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                {accountType === 'CLINICIAN' && 'Sees all clinical pages plus Peers Love.'}
                {accountType === 'INTERN' && 'Same clinical pages as a clinician (writes session notes, uploads IE reports). Cannot send notes or IE reports to patients — only their supervisor sends, and the supervisor’s license appears on what is sent.'}
                {accountType === 'FRONT_DESK' && 'For front-desk staff. No Dashboard / Clinic Schedule / Patients / Settings. Sees: Patients Love (HR12 feedback), Peers Love, Seminars, Templates (all depts), Manuals, Directory, Wellness Check, Payroll.'}
                {accountType === 'ADMIN_STAFF' && 'For other Administration roles. No Dashboard / Clinic Schedule / Patients / Settings, and no Patients Love. Sees: Peers Love, Seminars, Templates (all depts), Manuals, Directory, Wellness Check, Payroll.'}
                {accountType === 'ADMIN' && 'Full access including the Admin Panel.'}
              </p>
            </div>
          </div>

          <button type="submit" disabled={creating || !selectedStaffId || !email || !password} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
            {creating ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            Create Account
          </button>
        </form>
      </DashCard>

      {/* Accounts list */}
      <DashCard
        title={<>Staff Accounts <span style={{ fontVariantNumeric: 'tabular-nums' }}><Tag tone="brand">{accounts.length}</Tag></span></>}
        icon={<Users size={16} />}
        flush
      >
        {accounts.length === 0 ? (
          <EmptyState icon="users" title="No clinician accounts created yet." />
        ) : (() => {
          const q = accountSearch.trim().toLowerCase()
          const filtered = q
            ? accounts.filter((a) => {
                const hay = `${a.staff.firstName} ${a.staff.lastName} ${a.email} ${a.staff.department} ${a.staff.branch} ${BRANCH_LABEL[a.staff.branch] ?? ''} ${a.role}`.toLowerCase()
                return hay.includes(q)
              })
            : accounts
          return (
          <>
            <div className="px-4 sm:px-5 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="relative sm:max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search by name, email, department, branch..."
                  aria-label="Search accounts"
                  className={`${CONTROL} w-full pl-9 pr-9`}
                  style={CONTROL_STYLE}
                />
                {accountSearch && (
                  <button
                    type="button"
                    onClick={() => setAccountSearch('')}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-md hover:bg-[color:var(--paper)] ${FOCUS}`}
                    style={{ color: 'var(--mid-gray)' }}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon="search" title={`No clinicians match "${accountSearch}".`} />
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                {filtered.map((acct, i) => (
              <div key={acct.id}
                className="px-4 sm:px-5 py-3.5"
                style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined, background: acct.isActive ? '#fff' : SUBTLE_BG }}>
                <div className="flex flex-wrap items-start sm:items-center justify-between gap-x-4 gap-y-2.5">
                <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto sm:flex-1">
                  <span className={acct.isActive ? '' : 'opacity-50'}>
                    <Avatar text={`${acct.staff.firstName[0]}${acct.staff.lastName[0]}`} size={36} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-semibold text-[14px]" style={{ color: 'var(--charcoal)' }}>{acct.staff.lastName}, {acct.staff.firstName}</p>
                      <Tag tone="brand">{acct.staff.department}</Tag>
                      {(() => {
                        const t = acct.accountType ?? (acct.role === 'ADMIN' ? 'ADMIN' : 'CLINICIAN')
                        const label: Record<string, string> = { CLINICIAN: 'Clinician', FRONT_DESK: 'Front Desk', ADMIN_STAFF: 'Admin Staff', ADMIN: 'Admin' }
                        const tone = t === 'ADMIN'
                          ? 'warn'
                          : t === 'CLINICIAN'
                            ? 'success'
                            : 'info'
                        return <Tag tone={tone}>{label[t] ?? t}</Tag>
                      })()}
                    </div>
                    <p className="text-[12px] break-all" style={{ color: 'var(--mid-gray)' }}>{acct.email}</p>
                    {acct.lastPlainPassword ? (
                      <p className="text-[11px] flex flex-wrap items-center gap-1 mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        <KeyRound size={10} />
                        Password: <span className="font-mono px-1.5 py-0.5 rounded text-[10px] select-all break-all" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>{acct.lastPlainPassword}</span>
                      </p>
                    ) : (
                      // Legacy accounts created before lastPlainPassword
                      // was tracked: bcrypt is one-way so we can't
                      // recover the original. Make this state explicit
                      // so the admin understands they need to issue a
                      // new password (the Change-password button on the
                      // right of this row) to make the value visible.
                      <p className="text-[11px] flex items-center gap-1 mt-0.5 italic" style={{ color: '#7A4E21' }}>
                        <KeyRound size={10} className="shrink-0" />
                        Password not recorded — click the key icon to set a new one.
                      </p>
                    )}
                    <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                      <Clock size={10} />
                      {acct.lastLoginAt ? `Last login: ${new Date(acct.lastLoginAt).toLocaleDateString()}` : 'Never logged in'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pl-12 sm:pl-0">
                  <button type="button" onClick={() => { setEditingEmailId(editingEmailId === acct.id ? null : acct.id); setNewEmail(acct.email); setChangingPasswordId(null) }}
                    className={`${BTN_SM} w-8 !px-0`}
                    style={editingEmailId === acct.id ? { ...SECONDARY_STYLE, background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { ...SECONDARY_STYLE, color: 'var(--mid-gray)' }}
                    aria-pressed={editingEmailId === acct.id}
                    aria-label="Edit email"
                    title="Edit email">
                    <Mail size={14} />
                  </button>
                  <button type="button" onClick={() => { setChangingPasswordId(changingPasswordId === acct.id ? null : acct.id); setNewPassword(''); setEditingEmailId(null) }}
                    className={`${BTN_SM} w-8 !px-0`}
                    style={changingPasswordId === acct.id ? { ...SECONDARY_STYLE, background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { ...SECONDARY_STYLE, color: 'var(--mid-gray)' }}
                    aria-pressed={changingPasswordId === acct.id}
                    aria-label="Change password"
                    title="Change password">
                    <KeyRound size={14} />
                  </button>
                  <button type="button" onClick={() => toggleActive(acct.id, acct.isActive)}
                    className={BTN_SM}
                    style={{ ...SECONDARY_STYLE, color: acct.isActive ? '#2F5A28' : DANGER }}
                    title={acct.isActive ? 'Click to deactivate' : 'Click to activate'}>
                    {acct.isActive ? (
                      <><ToggleRight size={18} style={{ color: 'var(--teal)' }} /> Active</>
                    ) : (
                      <><ToggleLeft size={18} style={{ color: DANGER }} /> Inactive</>
                    )}
                  </button>
                </div>
              </div> {/* end flex row */}

              {/* Edit email inline form */}
              {editingEmailId === acct.id && (
                <div className="mt-3 p-3 rounded-lg" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail size={15} className="shrink-0 hidden sm:block" style={{ color: 'var(--deep-teal)' }} />
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="New email address"
                      aria-label="New email address"
                      className={`${CONTROL} flex-1 min-w-[180px]`}
                      style={CONTROL_STYLE}
                      autoFocus
                    />
                    <button type="button" onClick={() => handleChangeEmail(acct.id)} disabled={savingEmail || !newEmail.includes('@')}
                      className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                      {savingEmail ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setEditingEmailId(null); setNewEmail('') }}
                      className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                      Cancel
                    </button>
                  </div>
                  <p className="text-[11px] leading-snug mt-2 sm:ml-[23px]" style={{ color: 'var(--mid-gray)' }}>
                    Updates the login email <strong>and</strong>{' '}the staff record&rsquo;s email (across all branches), so payroll and survey matching stay in sync.
                  </p>
                </div>
              )}

              {/* Change password inline form */}
              {changingPasswordId === acct.id && (
                <div className="mt-3 p-3 rounded-lg flex flex-wrap items-center gap-2" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                  <KeyRound size={15} className="shrink-0 hidden sm:block" style={{ color: 'var(--deep-teal)' }} />
                  <div className="relative flex-1 min-w-[180px]">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      aria-label="New password"
                      className={`${CONTROL} w-full pr-10`}
                      style={CONTROL_STYLE}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-[color:var(--paper)] ${FOCUS}`}
                      style={{ color: 'var(--mid-gray)' }}>
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button type="button" onClick={() => handleChangePassword(acct.id)} disabled={savingPassword || newPassword.length < 8}
                    className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                    {savingPassword ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setChangingPasswordId(null); setNewPassword('') }}
                    className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                    Cancel
                  </button>
                </div>
              )}
              </div>
                ))}
              </div>
            )}
          </>
          )
        })()}
      </DashCard>

      {/* ─── HR Branches Registry sync ─────────────────────────────────────────── */}
      <HrBranchesCard />

      {/* ─── Branch CC Emails for IE tracking ─────────────────────────────────── */}
      <DashCard
        title="Branch CC Emails (Initial Evaluation tracking)"
        icon={<Mail size={16} />}
        description={<>When a clinician sends an Initial Evaluation report to a patient, the email is also CC&rsquo;d to the address you set here for that patient&rsquo;s branch. Use this to track which IE reports have been sent.</>}
      >
        {/* Add / update form */}
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_auto] gap-3 mb-5 items-end">
          <div className="min-w-0">
            <label htmlFor="cc-branch" className={LABEL} style={LABEL_STYLE}>Branch</label>
            <select id="cc-branch" value={ccBranch} onChange={(e) => setCcBranch(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
              {knownBranches.map((b) => <option key={b} value={b}>{BRANCH_LABEL[b] ?? b}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="cc-email" className={LABEL} style={LABEL_STYLE}>CC Email</label>
            <input id="cc-email" type="email" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)}
              placeholder="frontdesk-east@sapphireclinicseast.org" className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
          </div>
          <div className="min-w-0">
            <label htmlFor="cc-notes" className={LABEL} style={LABEL_STYLE}>Notes (optional)</label>
            <input id="cc-notes" value={ccNotes} onChange={(e) => setCcNotes(e.target.value)}
              placeholder="e.g. Front desk team" className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
          </div>
          <button type="button" onClick={saveCcEmail} disabled={savingCc || !ccEmail}
            className={`${BTN_PRIMARY} shrink-0`} style={PRIMARY_STYLE}>
            {savingCc ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>

        {/* Existing entries */}
        {ccEmails.length === 0 ? (
          <div className="rounded-lg" style={{ border: '1px dashed var(--light-gray)' }}>
            <EmptyState icon="info" title="No branch CC emails configured yet." hint="Add one above." />
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
            {ccEmails.map((cc, i) => (
              <div key={cc.branch} className={`flex items-center gap-3 px-3 py-2.5 ${TR}`} style={i ? TR_STYLE : undefined}>
                <Tag tone="brand">{BRANCH_LABEL[cc.branch] ?? cc.branch}</Tag>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--charcoal)' }}>{cc.email}</p>
                  {cc.notes && <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{cc.notes}</p>}
                </div>
                <button type="button" onClick={() => removeCcEmail(cc.branch)}
                  className={`${BTN_DANGER_GHOST} shrink-0`} style={{ color: DANGER }} title="Remove" aria-label={`Remove CC email for ${BRANCH_LABEL[cc.branch] ?? cc.branch}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </DashCard>
    </div>
  )
}

// ── HR Branches Registry sync ───────────────────────────────────────────────
// HR Platform is the source of truth for branch identity/contact config.
// This pulls a local cache via POST /api/branches/sync — same admin-
// triggered pattern as "Sync from HR" above for staff/interns.

interface HrBranchRow {
  id: string
  shortCode: string
  name: string
  brandName: string | null
  emailMain: string | null
  active: boolean
  syncedAt: string
}

function HrBranchesCard() {
  const [branches, setBranches] = useState<HrBranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/branches')
      if (r.ok) {
        const d = await r.json()
        setBranches(d.branches ?? [])
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/branches/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data.error || 'Sync failed')
      } else {
        setMsg(`Synced ${data.synced} of ${data.total} (${data.created} new, ${data.updated} updated, ${data.deleted} removed)`)
        await load()
      }
    } catch {
      setMsg('Could not reach HR — try again')
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }


  return (
    <DashCard
      title="Branches Registry"
      icon={<Building2 size={16} />}
      description="Synced from HR Platform — edit branch details there, not here."
      action={
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className={BTN_SECONDARY}
          style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Branches'}
        </button>
      }
    >
      {msg && <p role="status" className="text-[12px] mb-3 px-3 py-2 rounded-lg" style={{ color: 'var(--charcoal)', background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>{msg}</p>}

      {loading ? (
        <div className="flex flex-wrap gap-2" role="status" aria-label="Loading branches">
          {[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-8 w-40 rounded-lg" />)}
        </div>
      ) : branches.length === 0 ? (
        <div className="rounded-lg" style={{ border: '1px dashed var(--light-gray)' }}>
          <EmptyState icon="building" title="No branches synced yet." hint={<>Click &ldquo;Sync Branches&rdquo;.</>} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <span
              key={b.id}
              className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] max-w-full"
              style={{ background: b.active ? '#fff' : SUBTLE_BG, border: '1px solid var(--light-gray)', color: b.active ? 'var(--charcoal)' : 'var(--mid-gray)' }}
            >
              <strong style={{ color: b.active ? 'var(--deep-teal)' : 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{b.shortCode}</strong> {b.name}
              {!b.active && <StatusPill tone="neutral">Inactive</StatusPill>}
            </span>
          ))}
        </div>
      )}
    </DashCard>
  )
}
