'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  UserPlus, Trash2, ChevronUp, ChevronDown, Upload, Tv2,
  X, Plus, ExternalLink, ImageIcon, Film, RefreshCw,
} from 'lucide-react'

// ─── Department colours (light theme) ────────────────────────────────────────
const DEPT_COLORS: Record<string, { bg: string; color: string }> = {
  OT:         { bg: '#CCFBF1', color: '#0F766E' },
  PT:         { bg: '#DBEAFE', color: '#1D4ED8' },
  SLP:        { bg: '#EDE9FE', color: '#7C3AED' },
  SPED:       { bg: '#FED7AA', color: '#EA580C' },
  MD:         { bg: '#FEE2E2', color: '#DC2626' },
  PSYCHOLOGY: { bg: '#CFFAFE', color: '#0891B2' },
  ORTHOSIS:   { bg: '#FEF9C3', color: '#CA8A04' },
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:     { bg: '#FFF9EC', color: '#92400E' },
  CONFIRMED:   { bg: '#CCFBF1', color: '#0F766E' },
  CANCELLED:   { bg: '#FEE2E2', color: '#DC2626' },
  RESCHEDULED: { bg: '#EDE9FE', color: '#5B21B6' },
}

const TIME_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00',
]
const SESSION_TYPES: Record<string, string[]> = {
  OT: [
    'IE (Cash)', 'IE (HMO)',
    'Basic Session (Cash)', 'Basic Session (HMO)',
    'Specialized Session (Cash)', 'Specialized Session (HMO)',
    'Group Session (Cash)', 'Group Session (HMO)',
    'PTC (Cash)', 'PTC (HMO)',
    'Aquatherapy (Cash)', 'Aquatherapy (HMO)',
  ],
  PT: [
    'IE (Cash)', 'IE (HMO)',
    'Basic Session (Cash)', 'Basic Session (HMO)',
    'Specialized Session (Cash)', 'Specialized Session (HMO)',
    'Group Session (Cash)', 'Group Session (HMO)',
    'PTC (Cash)', 'PTC (HMO)',
    'Aquatherapy (Cash)', 'Aquatherapy (HMO)',
  ],
  SLP: [
    'IE (Cash)', 'IE (HMO)',
    'Basic Session (Cash)', 'Basic Session (HMO)',
    'Specialized Session (Cash)', 'Specialized Session (HMO)',
    'Group Session (Cash)', 'Group Session (HMO)',
    'PTC (Cash)', 'PTC (HMO)',
    'Aquatherapy (Cash)', 'Aquatherapy (HMO)',
  ],
  SPED:       ['IE', 'Basic Session', 'PTC', 'Group Session'],
  MD:         ['Initial Consult', 'Follow Up'],
  PSYCHOLOGY: ['Individual', 'Couple', 'Family', 'Testing'],
  ORTHOSIS:   ['Initial Consult', 'Follow Up'],
}
const DURATION_MINUTES: Record<string, number> = { '1h': 60, '1.5h': 90, '2h': 120 }

function computeEndTime(start: string, duration: string): string {
  if (duration === 'custom') return ''
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + (DURATION_MINUTES[duration] ?? 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function formatTime(t: string): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function visibleBranches(role: string): string[] {
  if (role.startsWith('SBEA_')) return ['SBEA']
  if (role.startsWith('SBGH_')) return ['SBGH']
  return ['SBEA', 'SBGH']
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface QueueEntry {
  id: string; startTime: string; endTime: string; sessionType: string; status: string
  department: string; therapist: string; initials: string; patientName: string | null
  staffId: string
}
interface StaffMember { id: string; firstName: string; lastName: string; department: string; branch: string }
interface Patient { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
interface Ad { id: string; fileName: string; mimeType: string; order: number; branch: string }

// ─── Input style helper ───────────────────────────────────────────────────────
const inp = {
  border: '1.5px solid rgba(27,63,56,0.25)', background: '#fff',
  color: 'var(--charcoal)', borderRadius: '0.5rem',
  padding: '0.45rem 0.7rem', fontSize: '0.85rem', width: '100%',
}
const lbl = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600 as const,
  color: 'var(--mid-gray)', marginBottom: '0.25rem',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
}

// ─── Patient search typeahead ─────────────────────────────────────────────────
function PatientSearch({ value, label, onChange }: {
  value: string; label: string
  onChange: (id: string, label: string, patient?: Patient) => void
}) {
  const [query, setQuery] = useState(label)
  const [results, setResults] = useState<Patient[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setQuery(label) }, [label])

  function handleInput(val: string) {
    setQuery(val)
    if (val !== label) onChange('', val)
    if (timer.current) clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(val)}`)
      if (res.ok) { setResults(await res.json()); setOpen(true) }
    }, 250)
  }

  return (
    <div className="relative">
      <input style={inp} placeholder="Search existing patient…" value={query}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off" />
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          {results.map(p => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              style={{ color: 'var(--charcoal)', borderBottom: '1px solid var(--light-gray)' }}
              onMouseDown={() => {
                onChange(p.id, `${p.lastName}, ${p.firstName}`, p)
                setQuery(`${p.lastName}, ${p.firstName}`)
                setOpen(false)
              }}>
              <span className="font-medium">{p.lastName}, {p.firstName}</span>
              {p.phone && <span className="ml-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{p.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Walk-in modal ────────────────────────────────────────────────────────────
function WalkInModal({ staff, defaultBranch, defaultDate, onClose, onSaved }: {
  staff: StaffMember[]; defaultBranch: string; defaultDate: string
  onClose: () => void; onSaved: () => void
}) {
  const [patientId, setPatientId] = useState('')
  const [patientLabel, setPatientLabel] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Patient fields (new)
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [dob, setDob]               = useState('')
  const [sex, setSex]               = useState('')
  const [address, setAddress]       = useState('')
  const [diagnosis, setDiagnosis]   = useState('')

  // Schedule fields
  const branchStaff = staff.filter(s => s.branch === defaultBranch)
  const [staffId, setStaffId]       = useState('')
  const [startTime, setStartTime]   = useState('08:00')
  const [duration, setDuration]     = useState('1h')
  const [endTime, setEndTime]       = useState(computeEndTime('08:00', '1h'))
  const [sessionType, setSessionType] = useState('')
  const [status, setStatus]         = useState('PENDING')
  const [notes, setNotes]           = useState('')

  const selectedStaff = branchStaff.find(s => s.id === staffId)
  const deptTypes = selectedStaff ? (SESSION_TYPES[selectedStaff.department] ?? []) : []

  function handleDuration(dur: string) {
    setDuration(dur)
    setEndTime(dur === 'custom' ? endTime : computeEndTime(startTime, dur))
  }
  function handleStart(st: string) {
    setStartTime(st)
    setEndTime(duration === 'custom' ? endTime : computeEndTime(st, duration))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!staffId)      { setError('Please select a therapist.'); return }
    if (!sessionType)  { setError('Session type is required.'); return }
    if (isNew && (!firstName || !lastName)) { setError('Patient name is required.'); return }
    if (!isNew && !patientId) { setError('Please select or create a patient.'); return }

    setSaving(true)
    const body = {
      patientId: patientId || undefined,
      ...(isNew ? { firstName, lastName, phone, email, dob, sex, address, diagnosis } : {}),
      staffId, date: defaultDate, startTime, endTime, duration, sessionType, status, notes,
    }
    const res = await fetch('/api/queueing/walkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) { onSaved() }
    else { const d = await res.json(); setError(d.error ?? 'Failed to save.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6"
      style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="rounded-2xl shadow-xl w-full max-w-2xl mx-4" style={{ background: '#fff' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--light-gray)' }}>
          <p className="font-bold text-base" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Add Walk-in Patient
          </p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={16} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#FEE2E2', color: '#DC2626' }}>{error}</div>}

          {/* ── Patient section ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--teal)' }}>
              1. Patient
            </p>
            {!isNew ? (
              <div className="space-y-2">
                <label style={lbl}>Search Existing Patient</label>
                <PatientSearch value={patientId} label={patientLabel}
                  onChange={(id, lbl) => { setPatientId(id); setPatientLabel(lbl) }} />
                <button type="button" onClick={() => { setIsNew(true); setPatientId(''); setPatientLabel('') }}
                  className="text-xs font-semibold mt-1" style={{ color: 'var(--teal)' }}>
                  + New patient (not in CRM)
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>New Patient</span>
                  <button type="button" onClick={() => setIsNew(false)}
                    className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                    Search existing instead
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={lbl}>First Name *</label>
                    <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} required />
                  </div>
                  <div>
                    <label style={lbl}>Last Name *</label>
                    <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} required />
                  </div>
                  <div>
                    <label style={lbl}>Phone / Cellphone No.</label>
                    <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Email</label>
                    <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Date of Birth</label>
                    <input style={inp} type="date" value={dob} onChange={e => setDob(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Sex</label>
                    <select style={inp} value={sex} onChange={e => setSex(e.target.value)}>
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label style={lbl}>Address / Barangay</label>
                    <input style={inp} value={address} onChange={e => setAddress(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label style={lbl}>Diagnosis</label>
                    <input style={inp} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Schedule section ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--teal)' }}>
              2. Schedule
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label style={lbl}>Therapist *</label>
                <select style={inp} value={staffId} onChange={e => { setStaffId(e.target.value); setSessionType('') }}>
                  <option value="">Select therapist…</option>
                  {branchStaff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.lastName}, {s.firstName} ({s.department})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={defaultDate} readOnly
                  style={{ ...inp, background: 'var(--off-white)', color: 'var(--mid-gray)' }} />
              </div>
              <div>
                <label style={lbl}>Start Time</label>
                <select style={inp} value={startTime} onChange={e => handleStart(e.target.value)}>
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Duration</label>
                <select style={inp} value={duration} onChange={e => handleDuration(e.target.value)}>
                  <option value="1h">1 Hour</option>
                  <option value="1.5h">1.5 Hours</option>
                  <option value="2h">2 Hours</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label style={lbl}>End Time</label>
                {duration === 'custom' ? (
                  <input
                    type="time"
                    step="60"
                    style={inp}
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                  />
                ) : (
                  <input style={{ ...inp, background: 'var(--off-white)', color: 'var(--mid-gray)' }}
                    value={endTime ? formatTime(endTime) : '—'} readOnly />
                )}
              </div>
              <div>
                <label style={lbl}>Session Type *</label>
                <select style={inp} value={sessionType} onChange={e => setSessionType(e.target.value)}>
                  <option value="">Select type</option>
                  {deptTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                </select>
              </div>
              <div className="col-span-2">
                <label style={lbl}>Notes (optional)</label>
                <textarea style={{ ...inp, resize: 'vertical', minHeight: '60px' } as React.CSSProperties}
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{ background: 'var(--teal)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              <Plus size={14} />
              {saving ? 'Saving…' : 'Add to Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const BRANCH_OPTIONS = [
  { value: 'ALL',  label: 'All Branches',  color: '#6B7280' },
  { value: 'SBEA', label: 'SBEA Only',     color: '#0D9488' },
  { value: 'SBGH', label: 'SBGH Only',     color: '#2563EB' },
]
function branchBadge(branch: string) {
  const opt = BRANCH_OPTIONS.find(o => o.value === branch) ?? BRANCH_OPTIONS[0]
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem',
      borderRadius: '99px', background: `${opt.color}22`, color: opt.color,
      whiteSpace: 'nowrap', letterSpacing: '0.04em',
    }}>{opt.label}</span>
  )
}

// ─── Ads Manager ─────────────────────────────────────────────────────────────
function AdsManager({ role }: { role: string }) {
  const [ads, setAds]           = useState<Ad[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [togglingLb, setTogglingLb] = useState(false)
  const [showComplaintForm, setShowComplaintForm] = useState(false)
  const [togglingCf, setTogglingCf] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Branch-restricted accounts can only manage ads for their own branch
  const allowedBranches = role.startsWith('SBEA_')
    ? BRANCH_OPTIONS.filter(o => o.value === 'SBEA')
    : role.startsWith('SBGH_')
      ? BRANCH_OPTIONS.filter(o => o.value === 'SBGH')
      : BRANCH_OPTIONS
  const [uploadBranch, setUploadBranch] = useState(allowedBranches[0].value)

  const loadAds = useCallback(async () => {
    const res = await fetch('/api/queue-ads')
    if (res.ok) setAds(await res.json())
  }, [])

  // Load settings (leaderboard + complaint form)
  const loadLeaderboardSetting = useCallback(async () => {
    const res = await fetch('/api/queue-ads/settings')
    if (res.ok) {
      const data = await res.json()
      setShowLeaderboard(data.showLeaderboard ?? false)
      setShowComplaintForm(data.showComplaintForm ?? false)
    }
  }, [])

  useEffect(() => { loadAds(); loadLeaderboardSetting() }, [loadAds, loadLeaderboardSetting])

  async function handleToggleLeaderboard(checked: boolean) {
    setTogglingLb(true)
    setShowLeaderboard(checked)
    await fetch('/api/queue-ads/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showLeaderboard: checked }),
    })
    setTogglingLb(false)
  }

  async function handleToggleComplaintForm(checked: boolean) {
    setTogglingCf(true)
    setShowComplaintForm(checked)
    await fetch('/api/queue-ads/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showComplaintForm: checked }),
    })
    setTogglingCf(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr('')
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('branch', uploadBranch)
    const res = await fetch('/api/queue-ads', { method: 'POST', body: form })
    setUploading(false)
    if (res.ok) { loadAds(); if (fileRef.current) fileRef.current.value = '' }
    else { const d = await res.json(); setUploadErr(d.error ?? 'Upload failed') }
  }

  async function handleBranchChange(id: string, branch: string) {
    await fetch(`/api/queue-ads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    })
    loadAds()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/queue-ads/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    loadAds()
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    await fetch(`/api/queue-ads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    })
    loadAds()
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div className="rounded-xl p-5 flex flex-col items-center gap-3 text-center"
        style={{ border: '2px dashed rgba(27,63,56,0.25)', background: 'var(--pale-teal)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--teal)' }}>
          <Upload size={18} style={{ color: '#fff' }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Upload Ad</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
            Video (.mp4, .webm, .mov) or Image (.jpg, .png, .gif, .webp) — max 200 MB
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--teal)' }}>
            📐 Optimal for TV display: <strong>1152 × 975 px</strong> (matches 60% panel on 1080p TV) — or <strong>1080 × 920 px</strong> minimum. Avoid portrait 9:16 (heavy cropping).
          </p>
        </div>
        {/* Branch selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Show on:</span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {allowedBranches.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setUploadBranch(opt.value)}
                className="text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
                style={{
                  background: uploadBranch === opt.value ? opt.color : 'var(--light-gray)',
                  color: uploadBranch === opt.value ? '#fff' : 'var(--mid-gray)',
                  border: 'none', cursor: 'pointer',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <label className="cursor-pointer px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--teal)', color: '#fff', opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Uploading…' : 'Choose File'}
          <input ref={fileRef} type="file" className="hidden"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.mov,image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
            onChange={handleUpload} disabled={uploading} />
        </label>
        {uploadErr && <p className="text-xs" style={{ color: '#DC2626' }}>{uploadErr}</p>}
      </div>

      {/* Ads list */}
      {ads.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--mid-gray)' }}>No ads uploaded yet.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                {['Order', 'Type', 'File Name', 'Show On', 'Preview', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--mid-gray)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ads.map((ad, idx) => (
                <tr key={ad.id} className="hover:bg-gray-50 transition-colors"
                  style={{ borderBottom: '1px solid var(--light-gray)' }}>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--charcoal)' }}>{idx + 1}</td>
                  <td className="px-3 py-2">
                    {ad.mimeType.startsWith('video/') ? (
                      <Film size={14} style={{ color: 'var(--teal)' }} />
                    ) : (
                      <ImageIcon size={14} style={{ color: 'var(--teal)' }} />
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--charcoal)', maxWidth: '16rem' }}>
                    <span className="truncate block">{ad.fileName}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={ad.branch ?? 'ALL'}
                      onChange={e => handleBranchChange(ad.id, e.target.value)}
                      disabled={allowedBranches.length === 1}
                      className="text-xs rounded-lg px-2 py-1 font-semibold"
                      style={{
                        border: '1.5px solid rgba(27,63,56,0.2)',
                        background: '#fff', color: 'var(--charcoal)',
                        cursor: allowedBranches.length === 1 ? 'default' : 'pointer',
                        opacity: allowedBranches.length === 1 ? 0.7 : 1,
                      }}>
                      {allowedBranches.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <a href={`/api/queue-ads/stream/${ad.id}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'var(--teal)' }}>
                      <ExternalLink size={11} /> View
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => handleReorder(ad.id, 'up')} disabled={idx === 0}
                        className="p-1 rounded hover:bg-gray-100" title="Move up">
                        <ChevronUp size={13} style={{ color: idx === 0 ? 'var(--light-gray)' : 'var(--mid-gray)' }} />
                      </button>
                      <button onClick={() => handleReorder(ad.id, 'down')} disabled={idx === ads.length - 1}
                        className="p-1 rounded hover:bg-gray-100" title="Move down">
                        <ChevronDown size={13} style={{ color: idx === ads.length - 1 ? 'var(--light-gray)' : 'var(--mid-gray)' }} />
                      </button>
                      <button onClick={() => handleDelete(ad.id)} disabled={deletingId === ad.id}
                        className="p-1 rounded hover:bg-red-50" title="Delete">
                        <Trash2 size={13} style={{ color: deletingId === ad.id ? 'var(--mid-gray)' : '#DC2626' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leaderboard toggle */}
      <div className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--pale-teal)' }}>
            <span style={{ fontSize: '1rem' }}>🏆</span>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
              Show Leaderboard
            </p>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              Display clinician satisfaction leaderboard on the TV queue display, alternating with ads.
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showLeaderboard}
            onChange={e => handleToggleLeaderboard(e.target.checked)}
            disabled={togglingLb}
            className="sr-only peer"
          />
          <div style={{
            width: '2.75rem', height: '1.5rem', borderRadius: '99px',
            background: showLeaderboard ? 'var(--teal)' : 'var(--light-gray)',
            position: 'relative', transition: 'background 0.2s',
            opacity: togglingLb ? 0.6 : 1,
            cursor: togglingLb ? 'wait' : 'pointer',
          }}>
            <div style={{
              width: '1.15rem', height: '1.15rem', borderRadius: '50%',
              background: '#fff', position: 'absolute', top: '0.175rem',
              left: showLeaderboard ? '1.4rem' : '0.2rem',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </label>
      </div>

      {/* Patient Complaint Form toggle */}
      <div className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(168,92,61,0.12)' }}>
            <span style={{ fontSize: '1rem' }}>📋</span>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
              Show Patient Complaint Form
            </p>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              Display a QR code on the TV for patients to submit concerns or incidents.
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showComplaintForm}
            onChange={e => handleToggleComplaintForm(e.target.checked)}
            disabled={togglingCf}
            className="sr-only peer"
          />
          <div style={{
            width: '2.75rem', height: '1.5rem', borderRadius: '99px',
            background: showComplaintForm ? 'var(--teal)' : 'var(--light-gray)',
            position: 'relative', transition: 'background 0.2s',
            opacity: togglingCf ? 0.6 : 1,
            cursor: togglingCf ? 'wait' : 'pointer',
          }}>
            <div style={{
              width: '1.15rem', height: '1.15rem', borderRadius: '50%',
              background: '#fff', position: 'absolute', top: '0.175rem',
              left: showComplaintForm ? '1.4rem' : '0.2rem',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </label>
      </div>
    </div>
  )
}

// ─── Main QueueingClient ──────────────────────────────────────────────────────
const BRANCH_TV_LABELS: Record<string, string> = {
  SBEA: 'Sandbox Clinic — East',
  SBGH: 'Sandbox Clinic — Greenhills',
}
const BRANCH_TV_COLORS: Record<string, { bg: string; color: string }> = {
  SBEA: { bg: '#CCFBF1', color: '#0F766E' },
  SBGH: { bg: '#DBEAFE', color: '#1D4ED8' },
}

export default function QueueingClient({ role }: { role: string }) {
  const branches = visibleBranches(role)
  const [activeTab, setActiveTab]   = useState<'queue' | 'ads'>('queue')
  const [activeBranch, setActiveBranch] = useState(branches[0])
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [queue, setQueue]           = useState<QueueEntry[]>([])
  const [staff, setStaff]           = useState<StaffMember[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [showTvMenu, setShowTvMenu] = useState(false)
  const tvMenuRef = useRef<HTMLDivElement>(null)

  // Close TV dropdown on outside click
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (tvMenuRef.current && !tvMenuRef.current.contains(e.target as Node)) {
        setShowTvMenu(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])
  const [toast, setToast]           = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Load staff
  useEffect(() => {
    fetch('/api/staff').then(r => r.json()).then(setStaff)
  }, [])

  // Load queue for branch + date
  const loadQueue = useCallback(async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch(`/api/queue?branch=${activeBranch}&date=${selectedDate}`)
      if (res.ok) {
        const data = await res.json()
        // Enrich with full patient name from schedules API
        const sched = await fetch(`/api/clinic-schedule?date=${selectedDate}`)
        const allSched: Array<{
          id: string
          patient: { firstName: string; lastName: string } | null
          staff: { branch: string }
        }> = sched.ok ? await sched.json() : []

        const nameMap: Record<string, string> = {}
        for (const s of allSched) {
          if (s.patient) nameMap[s.id] = `${s.patient.lastName}, ${s.patient.firstName}`
        }

        setQueue((data.items ?? []).map((item: QueueEntry) => ({
          ...item,
          patientName: nameMap[item.id] ?? null,
        })))
      }
    } finally {
      setLoadingQueue(false)
    }
  }, [activeBranch, selectedDate])

  useEffect(() => { loadQueue() }, [loadQueue])

  const queueUrl = `https://queue.sapphireclinicseast.org/${activeBranch.toLowerCase()}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Clinic Tools
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Queueing
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage today's patient queue and upload clinic ads for the TV display.
          </p>
        </div>
        {/* TV Display — single branch: direct link; multi-branch: dropdown */}
        {branches.length === 1 ? (
          <a href={`https://queue.sapphireclinicseast.org/${branches[0].toLowerCase()}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--teal)', color: '#fff', textDecoration: 'none' }}>
            <Tv2 size={15} /> Open TV Display
          </a>
        ) : (
          <div ref={tvMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowTvMenu(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Tv2 size={15} />
              Open TV Display
              <ChevronDown size={13} style={{
                transition: 'transform 0.2s',
                transform: showTvMenu ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            </button>

            {showTvMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0,
                background: '#fff', borderRadius: '0.85rem',
                border: '1px solid var(--light-gray)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
                overflow: 'hidden', minWidth: '15rem', zIndex: 50,
              }}>
                {branches.map((b, i) => {
                  const col = BRANCH_TV_COLORS[b] ?? { bg: '#F3F4F6', color: '#374151' }
                  return (
                    <a key={b}
                      href={`https://queue.sapphireclinicseast.org/${b.toLowerCase()}`}
                      target="_blank" rel="noreferrer"
                      onClick={() => setShowTvMenu(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      style={{
                        textDecoration: 'none',
                        borderBottom: i < branches.length - 1 ? '1px solid var(--light-gray)' : 'none',
                      }}>
                      <div style={{
                        width: '2.1rem', height: '2.1rem', borderRadius: '0.5rem', flexShrink: 0,
                        background: col.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Tv2 size={13} style={{ color: col.color }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--charcoal)', lineHeight: 1.2 }}>
                          {BRANCH_TV_LABELS[b] ?? b}
                        </p>
                        <p style={{ fontSize: '0.68rem', color: 'var(--mid-gray)', marginTop: '0.15rem' }}>
                          queue.sapphireclinicseast.org/{b.toLowerCase()}
                        </p>
                      </div>
                      <ExternalLink size={11} style={{ color: 'var(--mid-gray)', flexShrink: 0 }} />
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {[
          { id: 'queue' as const, label: 'Patient Queue' },
          { id: 'ads'   as const, label: 'Ads Manager' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === t.id ? 'var(--teal)' : 'var(--mid-gray)',
              borderBottom: activeTab === t.id ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: '-1px',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          {toast}
        </div>
      )}

      {/* ── Queue tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {branches.length > 1 && (
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
                {branches.map(b => (
                  <button key={b} onClick={() => setActiveBranch(b)}
                    className="px-4 py-1.5 text-sm font-medium transition-colors"
                    style={activeBranch === b
                      ? { background: 'var(--teal)', color: '#fff' }
                      : { background: '#fff', color: 'var(--mid-gray)' }}>
                    {b}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Date</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm"
                style={{ border: '1.5px solid rgba(27,63,56,0.25)', background: '#fff', color: 'var(--charcoal)' }} />
            </div>
            <button onClick={loadQueue} className="p-2 rounded-lg hover:bg-gray-100" title="Refresh">
              <RefreshCw size={14} style={{ color: 'var(--teal)' }} />
            </button>
            <div className="ml-auto">
              <button onClick={() => setShowWalkIn(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--teal)', color: '#fff' }}>
                <UserPlus size={14} /> Add Walk-in Patient
              </button>
            </div>
          </div>

          {/* Queue table */}
          {loadingQueue ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Loading queue…</p>
          ) : queue.length === 0 ? (
            <div className="rounded-xl py-16 flex flex-col items-center gap-3"
              style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>No appointments for this day</p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                Add a walk-in patient or check the Clinic Schedule module.
              </p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                    {['#', 'Time', 'Patient', 'Initials', 'Dept', 'Therapist', 'Session Type', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--mid-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queue.map((entry, i) => {
                    const deptColor  = DEPT_COLORS[entry.department]  ?? { bg: '#f3f4f6', color: '#374151' }
                    const statColor  = STATUS_COLORS[entry.status]    ?? { bg: '#f3f4f6', color: '#374151' }
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors"
                        style={{ borderBottom: '1px solid var(--light-gray)' }}>
                        <td className="px-3 py-2 font-bold" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                          {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                          {entry.patientName ?? <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-sm px-2 py-0.5 rounded"
                            style={{ background: deptColor.bg, color: deptColor.color }}>
                            {entry.initials}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={deptColor}>{entry.department}</span>
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{entry.therapist}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{entry.sessionType}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={statColor}>
                            {entry.status.charAt(0) + entry.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--light-gray)', background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                {queue.length} appointment{queue.length !== 1 ? 's' : ''} · TV display:{' '}
                <a href={queueUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>{queueUrl}</a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ads tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'ads' && <AdsManager role={role} />}

      {/* Walk-in modal */}
      {showWalkIn && (
        <WalkInModal
          staff={staff}
          defaultBranch={activeBranch}
          defaultDate={selectedDate}
          onClose={() => setShowWalkIn(false)}
          onSaved={() => {
            setShowWalkIn(false)
            loadQueue()
            showToast('Walk-in patient added to queue!')
          }}
        />
      )}
    </div>
  )
}
