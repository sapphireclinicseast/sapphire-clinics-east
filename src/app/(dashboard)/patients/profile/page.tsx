'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, User, Phone, Mail, MapPin, Calendar, Heart,
  AlertTriangle, Users, Activity, CheckCircle, XCircle,
  Clock, RotateCcw, Loader2,
} from 'lucide-react'
import PatientPRSection from '@/components/patients/PatientPRSection'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatientInfo {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  dob?: string | null
  patientType: string
  sex?: string | null
  civilStatus?: string | null
  religion?: string | null
  nationality?: string | null
  address?: string | null
  city?: string | null
  diagnosis?: string | null
  notes?: string | null
  firstDayOfConsult?: string | null
  branches?: string[]
  branch?: string | null
}

interface SessionStats {
  total: number
  confirmed: number
  rescheduled: number
  pending: number
  cancelled: number
}

interface Clinician {
  id: string
  name: string
  department: string
}

interface SessionRow {
  date: string
  sessionType: string
  startTime: string
  endTime: string
  status: string
  clinician: string
  clinicianDept: string
  notes?: string | null
}

interface Complaint {
  date: string
  text: string
  status: string
  reference?: string
  concernType?: string
  staffInvolved?: string
  location?: string
}

interface SearchResult {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  dob?: string | null
  patientType: string
  branches?: string[]
}

interface ProfileData {
  patient: PatientInfo
  stats: SessionStats
  clinicians: Clinician[]
  sessionHistory: SessionRow[]
  complaints: Complaint[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function calcAge(dob: string): string {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return `${age} years old`
}

function branchLabel(b: string): string {
  const map: Record<string, string> = {
    SANDBOX_EAST: 'Sandbox East',
    SANDBOX_GREENHILLS: 'Sandbox Greenhills',
    VERDANA_STORE: 'Verdana Store',
  }
  return map[b] ?? b
}

function deptLabel(d: string): string {
  const map: Record<string, string> = {
    OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED', MD: 'MD',
    PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthotics & Prosthetics',
    FRONT_DESK: 'Front Desk', ADMINISTRATION: 'Admin',
  }
  return map[d] ?? d
}

function titleCase(s: string | null | undefined): string {
  if (!s) return '—'
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle }> = {
    CONFIRMED:   { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', icon: CheckCircle },
    RESCHEDULED: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', icon: RotateCcw },
    PENDING:     { bg: '#fefce8', text: '#854d0e', border: '#fef08a', icon: Clock },
    CANCELLED:   { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', icon: XCircle },
  }
  const c = cfg[status] ?? cfg.PENDING
  const Icon = c.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      <Icon size={11} />
      {titleCase(status)}
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PatientProfilePage() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data)
        setShowSuggestions(data.length > 0)
      }
    } catch { /* ignore */ }
  }, [])

  function handleSearchInput(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  async function loadProfile(patientId: string) {
    setLoading(true)
    setShowSuggestions(false)
    try {
      const res = await fetch(`/api/patients/${patientId}/profile`)
      if (res.ok) {
        const data: ProfileData = await res.json()
        setProfileData(data)
        setQuery(`${data.patient.firstName} ${data.patient.lastName}`)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  function handleSelectPatient(p: SearchResult) {
    setQuery(`${p.firstName} ${p.lastName}`)
    setShowSuggestions(false)
    loadProfile(p.id)
  }

  function handleSearchSubmit() {
    if (suggestions.length > 0) {
      handleSelectPatient(suggestions[0])
    }
  }

  const p = profileData?.patient
  const stats = profileData?.stats

  return (
    <div className="p-6 max-w-[1200px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <User size={22} className="text-[var(--teal)]" />
          Patient Profile
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Search for a patient by name to view their profile summary, session history, and complaint records.
        </p>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex gap-3 items-end">
          <div className="flex-1" ref={searchRef}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Search Patient
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:border-[var(--teal)] focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                placeholder="Type a patient's name..."
                value={query}
                onChange={e => handleSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit() }}
                style={{ fontFamily: 'var(--font-body)' }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {suggestions.map(s => (
                    <button
                      key={s.id}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-teal-50 transition-colors border-b border-gray-100 last:border-b-0"
                      onClick={() => handleSelectPatient(s)}
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {s.firstName} {s.lastName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {s.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult'}
                          {s.dob ? ` · DOB: ${formatDate(s.dob)}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-colors"
            style={{ background: 'var(--teal)' }}
            onClick={handleSearchSubmit}
          >
            <Search size={14} />
            Search
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-gray-400">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
          <p className="text-sm">Loading patient profile...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !profileData && (
        <div className="text-center py-16 text-gray-400">
          <User size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Search for a patient to view their profile</p>
          <p className="text-xs mt-1">Enter a patient's name in the search bar above</p>
        </div>
      )}

      {/* Profile content */}
      {!loading && profileData && p && stats && (
        <>
          {/* Info cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Personal Information */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500 mb-4">
                <User size={15} className="text-[var(--teal)]" />
                Personal Information
              </h3>
              <div className="space-y-2.5">
                <InfoRow label="Full Name" value={`${titleCase(p.firstName)} ${titleCase(p.lastName)}`} />
                <InfoRow label="Date of Birth" value={formatDate(p.dob)} />
                <InfoRow label="Age" value={p.dob ? calcAge(p.dob) : '—'} />
                <InfoRow label="Sex" value={titleCase(p.sex)} />
                <InfoRow label="Civil Status" value={titleCase(p.civilStatus)} />
                <InfoRow label="Patient Type" value={p.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult'} />
                <InfoRow label="Diagnosis" value={titleCase(p.diagnosis)} />
                <InfoRow label="1st Day of Consult" value={p.firstDayOfConsult ? formatDate(p.firstDayOfConsult) : 'Not set (uses 1st recorded session)'} />
                <InfoRow label="Branch" value={
                  p.branches && p.branches.length > 0
                    ? p.branches.map(branchLabel).join(', ')
                    : p.branch ? branchLabel(p.branch) : '—'
                } />
              </div>
            </div>

            {/* Contact Details */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500 mb-4">
                <Phone size={15} className="text-[var(--teal)]" />
                Contact Details
              </h3>
              <div className="space-y-2.5">
                <InfoRow label="Mobile Number" value={p.phone ?? '—'} />
                <InfoRow label="Email Address" value={p.email ?? '—'} />
                <InfoRow label="Address" value={titleCase(p.address)} />
                <InfoRow label="City" value={titleCase(p.city)} />
                <InfoRow label="Religion" value={titleCase(p.religion)} />
                <InfoRow label="Nationality" value={titleCase(p.nationality)} />
                {p.notes && <InfoRow label="Notes" value={p.notes} />}
              </div>
            </div>
          </div>

          {/* Progress Reports */}
          <PatientPRSection patientId={p.id} />

          {/* Session Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard value={stats.total} label="Total Sessions" color="var(--teal)" />
            <StatCard value={stats.confirmed} label="Confirmed" color="#16a34a" />
            <StatCard value={stats.rescheduled + stats.pending} label="Rescheduled / Pending" color="#f59e0b" />
            <StatCard value={stats.cancelled} label="Cancelled" color="#dc2626" />
          </div>

          {/* Clinicians */}
          <div className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
              <Users size={16} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                Clinicians Handling This Patient
              </h3>
            </div>
            <div className="px-5 py-4">
              {profileData.clinicians.length === 0 ? (
                <p className="text-sm text-gray-400">No clinicians on record.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profileData.clinicians.map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(26,123,138,0.08)', color: 'var(--teal)', border: '1px solid rgba(26,123,138,0.2)' }}
                    >
                      {titleCase(c.name)}
                      <span className="text-gray-400">({deptLabel(c.department)})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Patient Complaints */}
          <div className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
              <AlertTriangle size={16} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                Patient Complaints
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400 mb-3">
                Retrieved from hr.sapphireclinicseast.org — Patient Complaints module
              </p>
              {profileData.complaints.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No complaints on record for this patient.</p>
              ) : (
                <div className="space-y-3">
                  {profileData.complaints.map((c, i) => (
                    <div key={i} className="py-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">{formatDate(c.date)}</span>
                        {c.concernType && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            {c.concernType}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700 leading-relaxed">{c.text}</div>
                      {(c.staffInvolved || c.location) && (
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-400">
                          {c.staffInvolved && <span>Staff: <span className="text-gray-600">{c.staffInvolved}</span></span>}
                          {c.location && <span>Location: <span className="text-gray-600">{c.location}</span></span>}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            c.status === 'Resolved'
                              ? 'bg-green-50 text-green-800 border border-green-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {c.status}
                        </span>
                        {c.reference && <span className="text-xs text-gray-400">Ref: {c.reference}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Session History Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                Session History
              </h3>
              <span className="text-xs text-gray-400 ml-auto">{profileData.sessionHistory.length} session{profileData.sessionHistory.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Type of Session</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Clinician</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {profileData.sessionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-sm text-gray-400 py-8">
                        No sessions to display.
                      </td>
                    </tr>
                  ) : (
                    profileData.sessionHistory.map((s, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
                          {formatDate(s.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{titleCase(s.sessionType)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 font-medium">{titleCase(s.clinician)}</td>
                        <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline border-b border-gray-100 pb-1.5 last:border-b-0">
      <span className="w-36 text-xs text-gray-400 font-medium flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
      <div className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
