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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StaffOption {
  id: string
  firstName: string
  lastName: string
  department: string
  branch: string
  email: string | null
}

interface TherapistAccountItem {
  id: string
  email: string
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
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

  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<'THERAPIST' | 'ADMIN'>('THERAPIST')
  const [toast, setToast] = useState<string | null>(null)
  const [changingPasswordId, setChangingPasswordId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (session?.user?.role !== 'ADMIN') { router.push('/'); return }
    fetchData()
  }, [session])

  async function fetchData() {
    setLoading(true)
    const [staffRes, accountsRes] = await Promise.all([
      fetch('/api/staff'),
      fetch('/api/therapist-accounts'),
    ])
    if (staffRes.ok) setStaffList((await staffRes.json()).staff ?? [])
    if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? [])
    setLoading(false)
  }

  function onStaffSelect(staffId: string) {
    setSelectedStaffId(staffId)
    const staff = staffList.find((s) => s.id === staffId)
    if (staff?.email) setEmail(staff.email)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStaffId || !email || !password) return
    setCreating(true)
    try {
      const res = await fetch('/api/therapist-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: selectedStaffId, email, password, role }),
      })
      if (res.ok) {
        showToast('Account created successfully')
        setSelectedStaffId(''); setEmail(''); setPassword(''); setRole('THERAPIST')
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
    if (!newPassword || newPassword.length < 6) { showToast('Password must be at least 6 characters'); return }
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
      } else {
        showToast((await res.json()).error ?? 'Failed')
      }
    } catch { showToast('Failed to change password') }
    setSavingPassword(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const availableStaff = staffList.filter(
    (s) => !accounts.some((a) => a.staff.firstName === s.firstName && a.staff.lastName === s.lastName)
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
        <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <UserPlus size={18} className="text-[var(--teal)]" />
          Create Clinician Account
        </h2>

        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Staff Member <span className="text-red-500">*</span>
              </label>
              <select value={selectedStaffId} onChange={(e) => onStaffSelect(e.target.value)} required className="input bg-white">
                <option value="">Select staff member...</option>
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.department} – {s.branch})</option>
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
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'THERAPIST' | 'ADMIN')} className="input bg-white">
                <option value="THERAPIST">Clinician</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={creating || !selectedStaffId || !email || !password} className="btn-primary rounded-xl">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Create Account
          </button>
        </form>
      </div>

      {/* Accounts list */}
      <div className="card-static animate-fade-up stagger-2">
        <h2 className="font-bold text-[var(--charcoal)] mb-5 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <Users size={18} className="text-[var(--teal)]" />
          Clinician Accounts
          <span className="badge badge-teal ml-1">{accounts.length}</span>
        </h2>

        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-3">
              <Users size={24} className="text-[var(--teal)]" />
            </div>
            <p className="text-[var(--mid-gray)] text-sm font-medium">No clinician accounts created yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((acct, i) => (
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
                      ? 'bg-gradient-to-br from-[var(--teal)] to-[var(--bright-teal)] text-white'
                      : 'bg-gray-200 text-gray-500'
                  )}>
                    {acct.staff.firstName[0]}{acct.staff.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[14px] text-[var(--charcoal)]">{acct.staff.lastName}, {acct.staff.firstName}</p>
                      <span className="badge badge-teal !text-[9px] !py-0 !px-1.5">{acct.staff.department}</span>
                      {acct.role === 'ADMIN' && (
                        <span className="badge !text-[9px] !py-0 !px-1.5 bg-amber-50 text-amber-700 border border-amber-200">Admin</span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--mid-gray)]">{acct.email}</p>
                    <p className="text-[11px] text-[var(--mid-gray)] flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {acct.lastLoginAt ? `Last login: ${new Date(acct.lastLoginAt).toLocaleDateString()}` : 'Never logged in'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => { setChangingPasswordId(changingPasswordId === acct.id ? null : acct.id); setNewPassword('') }}
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
              {changingPasswordId === acct.id && (
                <div className="mt-3 p-3 bg-[var(--off-white)] rounded-xl border border-[var(--light-gray)] flex items-center gap-3">
                  <KeyRound size={16} className="text-[var(--teal)] shrink-0" />
                  <div className="relative flex-1">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      className="input !rounded-lg !py-2 !pr-10 text-[13px]"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]">
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button onClick={() => handleChangePassword(acct.id)} disabled={savingPassword || newPassword.length < 6}
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
      </div>
    </div>
  )
}
