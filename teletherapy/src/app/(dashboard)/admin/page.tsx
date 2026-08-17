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
  Shield,
  ToggleLeft,
  ToggleRight,
  Clock,
  Mail,
  Trash2,
  Search,
  X,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" />
        <p className="text-sm text-[var(--mid-gray)]">Loading admin panel...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8 animate-fade-up">
        <div className="relative z-10">
          <h1 className="text-xl font-bold text-white tracking-tight animate-slide-down" style={{ fontFamily: 'var(--font-display)' }}>
            Admin Panel
          </h1>
          <p className="text-white/60 text-sm mt-1 animate-slide-down stagger-1">
            Manage therapist accounts and access
          </p>
        </div>
      </div>

      {/* Create Account Form */}
      <div className="card-static mb-8 animate-fade-up stagger-1">
        <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-[var(--light-gray)]">
          <h2 className="font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <UserPlus size={18} className="text-[var(--teal)]" />
            Create Account
          </h2>
          <button
            type="button"
            onClick={handleSyncFromHr}
            disabled={syncing}
            title="Pull the latest staff & interns from the HR Platform so new people appear in the list below"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--teal)] border border-[var(--teal)]/30 hover:bg-[var(--teal)]/5 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from HR'}
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Staff Member <span className="text-red-500">*</span>
              </label>
              <select value={selectedStaffId} onChange={(e) => onStaffSelect(e.target.value)} required className="input bg-white">
                <option value="">Select staff member...</option>
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.department} – {BRANCH_LABEL[s.branch] ?? s.branch}){isInternStaff(s) ? ' · INTERN' : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Login Email <span className="text-red-500">*</span>
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" placeholder="therapist@email.com" />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={6} className="input pr-10" placeholder="Min 6 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)] transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Account Type</label>
              <select value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)} className="input bg-white">
                <option value="CLINICIAN">Clinician — full clinical access</option>
                <option value="INTERN">Intern — clinical access, cannot send notes/reports</option>
                <option value="FRONT_DESK">Front Desk (Administration) — no patient pages, incl. Patients Love</option>
                <option value="ADMIN_STAFF">Administration staff — no patient pages, no Patients Love</option>
                <option value="ADMIN">Admin — full access + Admin Panel</option>
              </select>
              <p className="text-[11px] text-[var(--mid-gray)] mt-1">
                {accountType === 'CLINICIAN' && 'Sees all clinical pages plus Peers Love.'}
                {accountType === 'INTERN' && 'Same clinical pages as a clinician (writes session notes, uploads IE reports). Cannot send notes or IE reports to patients — only their supervisor sends, and the supervisor’s license appears on what is sent.'}
                {accountType === 'FRONT_DESK' && 'For front-desk staff. No Dashboard / Clinic Schedule / Patients / Settings. Sees: Patients Love (HR12 feedback), Peers Love, Seminars, Templates (all depts), Manuals, Directory, Wellness Check, Payroll.'}
                {accountType === 'ADMIN_STAFF' && 'For other Administration roles. No Dashboard / Clinic Schedule / Patients / Settings, and no Patients Love. Sees: Peers Love, Seminars, Templates (all depts), Manuals, Directory, Wellness Check, Payroll.'}
                {accountType === 'ADMIN' && 'Full access including the Admin Panel.'}
              </p>
            </div>
          </div>

          <button type="submit" disabled={creating || !selectedStaffId || !email || !password} className="btn-primary rounded-xl">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Create Account
          </button>
        </form>
      </div>

      {/* Accounts list */}
      <div className="card-static animate-fade-up stagger-2 mb-8">
        <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <Users size={18} className="text-[var(--teal)]" />
          Staff Accounts
          <span className="badge badge-teal ml-1">{accounts.length}</span>
        </h2>

        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-3">
              <Users size={24} className="text-[var(--teal)]" />
            </div>
            <p className="text-[var(--mid-gray)] text-sm font-medium">No clinician accounts created yet.</p>
          </div>
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
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)]" />
              <input
                type="text"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search by name, email, department, branch..."
                className="input !pl-9 text-[13px]"
              />
              {accountSearch && (
                <button
                  type="button"
                  onClick={() => setAccountSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {filtered.length === 0 ? (
              <p className="text-[12px] text-[var(--mid-gray)] italic text-center py-6">
                No clinicians match "{accountSearch}".
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {filtered.map((acct, i) => (
              <div key={acct.id}
                className={cn(
                  'p-4 rounded-xl border transition-all animate-fade-up',
                  `stagger-${Math.min(i + 3, 10)}`,
                  acct.isActive ? 'border-[var(--light-gray)] bg-white hover:border-[var(--teal)]/20 hover:shadow-sm' : 'border-red-100 bg-red-50/30'
                )}>
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0',
                    acct.isActive
                      ? 'bg-gradient-to-br from-[#cf9d88] to-[#c69849] text-white'
                      : 'bg-gray-200 text-gray-500'
                  )}>
                    {acct.staff.firstName[0]}{acct.staff.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[14px] text-[var(--charcoal)]">{acct.staff.lastName}, {acct.staff.firstName}</p>
                      <span className="badge badge-teal !text-[9px] !py-0 !px-1.5">{acct.staff.department}</span>
                      {(() => {
                        const t = acct.accountType ?? (acct.role === 'ADMIN' ? 'ADMIN' : 'CLINICIAN')
                        const label: Record<string, string> = { CLINICIAN: 'Clinician', FRONT_DESK: 'Front Desk', ADMIN_STAFF: 'Admin Staff', ADMIN: 'Admin' }
                        const cls = t === 'ADMIN'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : t === 'CLINICIAN'
                            ? 'bg-[var(--pale-teal)] text-[var(--deep-teal)] border-[var(--light-gray)]'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        return <span className={`badge !text-[9px] !py-0 !px-1.5 border ${cls}`}>{label[t] ?? t}</span>
                      })()}
                    </div>
                    <p className="text-[12px] text-[var(--mid-gray)]">{acct.email}</p>
                    {acct.lastPlainPassword ? (
                      <p className="text-[11px] text-[var(--mid-gray)] flex items-center gap-1 mt-0.5">
                        <KeyRound size={10} />
                        Password: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] select-all">{acct.lastPlainPassword}</span>
                      </p>
                    ) : (
                      // Legacy accounts created before lastPlainPassword
                      // was tracked: bcrypt is one-way so we can't
                      // recover the original. Make this state explicit
                      // so the admin understands they need to issue a
                      // new password (the Change-password button on the
                      // right of this row) to make the value visible.
                      <p className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5 italic">
                        <KeyRound size={10} />
                        Password not recorded — click the key icon to set a new one.
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--mid-gray)] flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {acct.lastLoginAt ? `Last login: ${new Date(acct.lastLoginAt).toLocaleDateString()}` : 'Never logged in'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => { setEditingEmailId(editingEmailId === acct.id ? null : acct.id); setNewEmail(acct.email); setChangingPasswordId(null) }}
                    className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-2 rounded-xl text-[var(--sand-dark)] hover:bg-[var(--sand-light)] transition-all active:scale-95"
                    title="Edit email">
                    <Mail size={15} />
                  </button>
                  <button onClick={() => { setChangingPasswordId(changingPasswordId === acct.id ? null : acct.id); setNewPassword(''); setEditingEmailId(null) }}
                    className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-2 rounded-xl text-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all active:scale-95"
                    title="Change password">
                    <KeyRound size={15} />
                  </button>
                  <button onClick={() => toggleActive(acct.id, acct.isActive)}
                    className={cn('flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl transition-all active:scale-95',
                      acct.isActive ? 'text-green-700 hover:bg-green-50' : 'text-red-600 hover:bg-red-50')}>
                    {acct.isActive ? (
                      <><ToggleRight size={20} className="text-green-500" /> Active</>
                    ) : (
                      <><ToggleLeft size={20} className="text-red-400" /> Inactive</>
                    )}
                  </button>
                </div>
              </div> {/* end flex row */}

              {/* Change password inline form */}
              {/* Edit email inline form */}
              {editingEmailId === acct.id && (
                <div className="mt-3 p-3 bg-[var(--off-white)] rounded-xl border border-[var(--light-gray)]">
                  <div className="flex items-center gap-3">
                    <Mail size={16} className="text-[var(--sand-dark)] shrink-0" />
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="New email address"
                      className="input !rounded-lg !py-2 text-[13px] flex-1"
                      autoFocus
                    />
                    <button onClick={() => handleChangeEmail(acct.id)} disabled={savingEmail || !newEmail.includes('@')}
                      className="btn-primary !py-2 !px-4 !text-[12px] !rounded-lg">
                      {savingEmail ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                    </button>
                    <button onClick={() => { setEditingEmailId(null); setNewEmail('') }}
                      className="text-[var(--mid-gray)] hover:text-[var(--charcoal)] text-[12px] font-medium">
                      Cancel
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--mid-gray)] mt-2 ml-7">
                    Updates the login email <strong>and</strong> the staff record&rsquo;s email (across all branches), so payroll and survey matching stay in sync.
                  </p>
                </div>
              )}

              {/* Change password inline form */}
              {changingPasswordId === acct.id && (
                <div className="mt-3 p-3 bg-[var(--off-white)] rounded-xl border border-[var(--light-gray)] flex items-center gap-3">
                  <KeyRound size={16} className="text-[var(--teal)] shrink-0" />
                  <div className="relative flex-1">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      className="input !rounded-lg !py-2 !pr-10 text-[13px]"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]">
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button onClick={() => handleChangePassword(acct.id)} disabled={savingPassword || newPassword.length < 8}
                    className="btn-primary !py-2 !px-4 !text-[12px] !rounded-lg">
                    {savingPassword ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => { setChangingPasswordId(null); setNewPassword('') }}
                    className="text-[var(--mid-gray)] hover:text-[var(--charcoal)] text-[12px] font-medium">
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
      </div>

      {/* ─── Branch CC Emails for IE tracking ─────────────────────────────────── */}
      <div className="card-static">
        <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[var(--light-gray)]">
          <Mail size={20} className="text-[var(--teal)] mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-[var(--charcoal)] text-[16px]" style={{ fontFamily: 'var(--font-display)' }}>
              Branch CC Emails (Initial Evaluation tracking)
            </h2>
            <p className="text-[12px] text-[var(--mid-gray)] mt-1 leading-relaxed">
              When a clinician sends an Initial Evaluation report to a patient, the email is also CC'd
              to the address you set here for that patient's branch. Use this to track which IE reports
              have been sent.
            </p>
          </div>
        </div>

        {/* Add / update form */}
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_auto] gap-2 mb-5 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Branch</label>
            <select value={ccBranch} onChange={(e) => setCcBranch(e.target.value)} className="input text-[13px]">
              {knownBranches.map((b) => <option key={b} value={b}>{BRANCH_LABEL[b] ?? b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">CC Email</label>
            <input type="email" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)}
              placeholder="frontdesk-east@sapphireclinicseast.org" className="input text-[13px]" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Notes (optional)</label>
            <input value={ccNotes} onChange={(e) => setCcNotes(e.target.value)}
              placeholder="e.g. Front desk team" className="input text-[13px]" />
          </div>
          <button onClick={saveCcEmail} disabled={savingCc || !ccEmail}
            className="btn-primary !py-2 !px-4 !text-[12px] !rounded-lg shrink-0">
            {savingCc ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>

        {/* Existing entries */}
        {ccEmails.length === 0 ? (
          <p className="text-[12px] text-[var(--mid-gray)] italic text-center py-4">
            No branch CC emails configured yet. Add one above.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ccEmails.map((cc) => (
              <div key={cc.branch} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--off-white)] border border-[var(--light-gray)]">
                <span className="px-2 py-0.5 rounded-md bg-[var(--pale-teal)] text-[var(--deep-teal)] text-[11px] font-bold uppercase tracking-wider shrink-0">
                  {BRANCH_LABEL[cc.branch] ?? cc.branch}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--charcoal)] truncate">{cc.email}</p>
                  {cc.notes && <p className="text-[11px] text-[var(--mid-gray)] truncate">{cc.notes}</p>}
                </div>
                <button onClick={() => removeCcEmail(cc.branch)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
