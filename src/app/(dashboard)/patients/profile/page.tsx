'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import {
  Search, User, Phone, Calendar, AlertTriangle, Users, Activity, CheckCircle,
  XCircle, Clock, RotateCcw, Loader2, Stethoscope, FileText, ArrowLeft, Cake,
  Mail, ClipboardList, ExternalLink, Award, RefreshCw,
} from 'lucide-react'
import { CertificatesCard } from '@/components/patients/DischargeCertificates'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../dashboard/ui'

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
  referralUrl?: string | null
  pwdIdUrl?: string | null
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

// ─── Helpers (presentation only — stored values are never changed) ──────────

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
    SANDBOX_EAST: 'East Branch',
    SANDBOX_GREENHILLS: 'Greenhills Branch',
    VERDANA_STORE: 'Verdana Store',
  }
  return map[b] ?? b
}

// Short branch tag for the header; the full label stays in the tooltip.
const BRANCH_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana',
}
function branchShort(code: string): string {
  return BRANCH_SHORT[code] ?? branchLabel(code)
}

function deptLabel(d: string): string {
  const map: Record<string, string> = {
    OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED', MD: 'MD',
    PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthotics & Prosthetics',
    FRONT_DESK: 'Front Desk', ADMINISTRATION: 'Admin',
  }
  return map[d] ?? d
}

// Records are typed in ALL CAPS (the CRM form upper-cases as you type). Re-case
// for display only, and only when the value has no lower-case letters at all —
// anything typed in mixed case is left as typed. Same rules as the Patient CRM.
const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])
const SMALL_WORDS = new Set(['of', 'and', 'with', 'to', 'the', 'in', 'on', 'for', 'or', 'a', 'an', 'at', 'by'])
const DX_ACRONYMS = new Set([
  'adhd', 'add', 'asd', 'aud', 'id', 'idd', 'ld', 'sld', 'ocd', 'odd', 'cas', 'tbi', 'cva', 'als',
  'ds', 'pdd', 'nos', 'sli', 'dld', 'capd', 'apd', 'mdd', 'gad', 'bpd', 'hie', 'ot', 'pt', 'slp',
  'rom', 'acl', 'mcl', 'ckd', 'copd', 'mi', 'gerd', 'sci', 'icu', 'umn', 'lmn', 'cns', 'tmj',
  'bppv', 'mri', 'eeg', 'pwd', 'nicu', 'fas', 'fasd', 'aba', 'iep', 'sped', 'oa', 'ra', 'avm',
  'sah', 'ich', 'mca', 'aca', 'pca', 'uti', 'hiv', 'aids', 'sma', 'dmd',
])
function displayCase(raw: string | null | undefined, kind: 'name' | 'text' | 'dx' = 'text'): string {
  const s = (raw ?? '').trim()
  if (!s || /[a-z]/.test(s)) return s
  let first = true
  return s.toLowerCase().replace(/[a-z]+/g, (w: string, offset: number, whole: string) => {
    const isFirst = first
    first = false
    if (offset > 0 && /\d/.test(whole[offset - 1])) return w
    if ((kind === 'name' || kind === 'dx') && ROMAN_NUMERALS.has(w)) return w.toUpperCase()
    if (kind === 'dx' && (DX_ACRONYMS.has(w) || (w.length >= 2 && !/[aeiouy]/.test(w)))) return w.toUpperCase()
    if (kind !== 'name' && !isFirst && SMALL_WORDS.has(w)) return w
    return w[0].toUpperCase() + w.slice(1)
  })
}

function fullName(p: { firstName?: string | null; lastName?: string | null }): string {
  return displayCase(`${p.firstName ?? ''} ${p.lastName ?? ''}`, 'name')
}

function initials(p: { firstName?: string | null; lastName?: string | null }): string {
  const a = (p.firstName ?? '').trim()[0] ?? ''
  const b = (p.lastName ?? '').trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

function patientBranches(p: PatientInfo): string[] {
  return p.branches && p.branches.length > 0 ? p.branches : p.branch ? [p.branch] : []
}

const TYPE_PILL = {
  PEDIATRIC: { label: 'Pediatric', bg: 'var(--pale-teal)', color: 'var(--teal)' },
  ADULT:     { label: 'Adult', bg: '#FFF9EC', color: '#9A7432' },
}
function typePill(patientType: string) {
  return patientType === 'PEDIATRIC' ? TYPE_PILL.PEDIATRIC : TYPE_PILL.ADULT
}

const CONTROL_STYLE = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' } as const

// ─── Status pill ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle; label: string }> = {
  CONFIRMED:   { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0', icon: CheckCircle, label: 'Confirmed' },
  RESCHEDULED: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE', icon: RotateCcw, label: 'Rescheduled' },
  PENDING:     { bg: '#FEFCE8', text: '#854D0E', border: '#FEF08A', icon: Clock, label: 'Pending' },
  CANCELLED:   { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', icon: XCircle, label: 'Cancelled' },
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.PENDING
  const Icon = c.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      <Icon size={11} />
      {STATUS_CFG[status] ? c.label : displayCase(status)}
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PatientProfilePage() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [noMatches, setNoMatches] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
        setNoMatches(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); setNoMatches(false); return }
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data)
        setShowSuggestions(data.length > 0)
        setNoMatches(data.length === 0)
      }
    } catch { /* ignore */ }
  }, [])

  function handleSearchInput(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const loadProfile = useCallback(async (patientId: string) => {
    setLoading(true)
    setError(null)
    setShowSuggestions(false)
    setNoMatches(false)
    try {
      const res = await fetch(`/api/patients/${patientId}/profile`)
      if (res.ok) {
        const data: ProfileData = await res.json()
        setProfileData(data)
        setQuery(`${data.patient.firstName} ${data.patient.lastName}`)
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null
        setProfileData(null)
        setError({ id: patientId, message: body?.error || `The server answered ${res.status}.` })
      }
    } catch {
      setProfileData(null)
      setError({ id: patientId, message: 'Could not reach the server. Check your connection and try again.' })
    }
    setLoading(false)
  }, [])

  // The Patient CRM's "Open full profile →" links here as /patients/profile?id=…
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) return
    const t = setTimeout(() => { void loadProfile(id) }, 0)
    return () => clearTimeout(t)
  }, [loadProfile])

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
    <div className="max-w-6xl space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Patient Management
          </p>
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Patient Profile
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Look up a patient to see their details, documents, certificates, complaints and session history.
          </p>
        </div>
        <a href="/patients"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold hover:bg-gray-50"
          style={CONTROL_STYLE}>
          <ArrowLeft size={14} style={{ color: 'var(--teal)' }} />
          Patient CRM
        </a>
      </div>

      {/* ── Search ── */}
      <div className="rounded-xl p-3 sm:p-4" style={CARD_STYLE}>
        <div className="flex gap-2 items-stretch" ref={searchRef}>
          <div className="relative flex-1 min-w-0">
            <label htmlFor="patient-search" className="sr-only">Search patient</label>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              id="patient-search"
              type="text"
              autoComplete="off"
              className="w-full h-10 pl-9 pr-3 rounded-lg text-sm outline-none transition-all focus:border-[var(--teal)] focus:ring-2 focus:ring-teal-100"
              style={{ ...CONTROL_STYLE, fontFamily: 'var(--font-body)' }}
              placeholder="Search a patient by name…"
              value={query}
              onChange={e => handleSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSearchSubmit()
                if (e.key === 'Escape') { setShowSuggestions(false); setNoMatches(false) }
              }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1.5 rounded-xl max-h-72 overflow-y-auto py-1"
                style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }}>
                {suggestions.map(s => {
                  const t = typePill(s.patientType)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[#F3F8F7]"
                      onClick={() => handleSelectPatient(s)}
                    >
                      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                        style={{ background: t.bg, color: t.color }}>
                        {initials(s)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                          {fullName(s)}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {t.label}
                          {s.dob ? ` · DOB ${formatDate(s.dob)}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {noMatches && !showSuggestions && query.trim().length >= 2 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1.5 rounded-xl px-4 py-3 text-sm"
                style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 10px 30px rgba(15,23,42,0.12)', color: 'var(--mid-gray)' }}>
                No patient matches “{query.trim()}”.
              </div>
            )}
          </div>
          <button
            type="button"
            className="h-10 px-4 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 flex-shrink-0 transition-opacity hover:opacity-90"
            style={{ background: 'var(--teal)' }}
            onClick={handleSearchSubmit}
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && <ProfileSkeleton />}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="rounded-xl px-5 py-4 flex flex-wrap items-start gap-3"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }} role="alert">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#B91C1C' }} />
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>Couldn’t load this patient’s profile</p>
            <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>{error.message}</p>
          </div>
          <button type="button" onClick={() => loadProfile(error.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: '#fff', border: '1px solid #FECACA', color: '#991B1B' }}>
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      )}

      {/* ── Nothing selected yet ── */}
      {!loading && !error && !profileData && (
        <div className="rounded-xl" style={CARD_STYLE}>
          <div className="pt-10 flex justify-center">
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
              <User size={26} style={{ color: 'var(--teal)' }} />
            </span>
          </div>
          <EmptyState
            title="Search for a patient to view their profile"
            hint="Type at least two letters of the patient’s name above, then pick them from the list."
          />
        </div>
      )}

      {/* ── Profile ── */}
      {!loading && profileData && p && stats && (
        <>
          <ProfileHeader p={p} />

          {/* Session stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total sessions" value={stats.total} icon={<Calendar size={15} />} />
            <KpiCard label="Confirmed" value={stats.confirmed} accent="#16A34A" icon={<CheckCircle size={15} />} />
            <KpiCard label="Rescheduled / Pending" value={stats.rescheduled + stats.pending} accent="#D97706" icon={<RotateCcw size={15} />} />
            <KpiCard label="Cancelled" value={stats.cancelled} accent="#DC2626" icon={<XCircle size={15} />} />
          </div>

          <div id="details" className="grid grid-cols-1 lg:grid-cols-2 gap-5 scroll-mt-4">
            <DashCard title="Personal details" icon={<User size={15} />}>
              <InfoList>
                <InfoRow label="Full name" value={fullName(p)} />
                <InfoRow label="Date of birth" value={formatDate(p.dob)} />
                <InfoRow label="Age" value={p.dob ? calcAge(p.dob) : ''} />
                <InfoRow label="Sex" value={displayCase(p.sex)} />
                <InfoRow label="Civil status" value={displayCase(p.civilStatus)} />
                <InfoRow label="Religion" value={displayCase(p.religion)} />
                <InfoRow label="Nationality" value={displayCase(p.nationality)} />
              </InfoList>
            </DashCard>

            <DashCard title="Contact details" icon={<Phone size={15} />}>
              <InfoList>
                <InfoRow label="Mobile number" value={p.phone} mono />
                <InfoRow label="Email address" value={p.email} breakAll />
                <InfoRow label="Address" value={displayCase(p.address)} />
                <InfoRow label="City" value={displayCase(p.city)} />
              </InfoList>
            </DashCard>

            <DashCard title="Clinical" icon={<Stethoscope size={15} />}>
              <InfoList>
                <InfoRow label="Patient type" value={typePill(p.patientType).label} />
                <InfoRow label="Diagnosis" value={displayCase(p.diagnosis, 'dx')} />
                <InfoRow
                  label="1st day of consult"
                  value={p.firstDayOfConsult ? formatDate(p.firstDayOfConsult) : null}
                  emptyText="Not set (uses 1st recorded session)"
                />
                <InfoRow label="Branch" value={patientBranches(p).map(branchLabel).join(', ')} />
              </InfoList>

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                  <Users size={12} /> Clinicians handling this patient
                  <span className="font-normal normal-case tracking-normal">({profileData.clinicians.length})</span>
                </p>
                {profileData.clinicians.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No clinicians on record.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {profileData.clinicians.map(c => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ background: 'var(--pale-teal)', color: 'var(--charcoal)', border: '1px solid rgba(26,123,138,0.18)' }}
                      >
                        {displayCase(c.name, 'name')}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none"
                          style={{ background: 'rgba(26,123,138,0.12)', color: 'var(--teal)' }}>
                          {deptLabel(c.department)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                  Notes
                </p>
                {p.notes ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words rounded-lg px-3 py-2.5"
                    style={{ background: '#F8FAF9', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
                    {p.notes}
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: '#9CA3AF' }}>—</p>
                )}
              </div>
            </DashCard>

            <ComplaintsCard complaints={profileData.complaints} />

            <div id="documents" className="min-w-0 scroll-mt-4 flex flex-col">
              <DocumentsCard patientId={p.id} referralUrl={p.referralUrl ?? null} pwdIdUrl={p.pwdIdUrl ?? null} />
            </div>

            {/* Discharge certificates — beside Documents, since both are things
                the patient is given rather than things the clinic records. */}
            <div id="certificates" className="min-w-0 scroll-mt-4 flex flex-col [&>*]:flex-1">
              <CertificatesCard
                patientId={p.id}
                patientName={`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()}
              />
            </div>
          </div>

          <div id="sessions" className="scroll-mt-4">
            <SessionHistoryCard rows={profileData.sessionHistory} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Profile header ──────────────────────────────────────────────────────────

function ProfileHeader({ p }: { p: PatientInfo }) {
  const t = typePill(p.patientType)
  const branches = patientBranches(p)
  const jump = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const JUMPS: { id: string; label: string; icon: ReactNode }[] = [
    { id: 'details', label: 'Details', icon: <User size={13} /> },
    { id: 'documents', label: 'Documents', icon: <FileText size={13} /> },
    { id: 'certificates', label: 'Certificates', icon: <Award size={13} /> },
    { id: 'sessions', label: 'Sessions', icon: <Calendar size={13} /> },
  ]

  return (
    <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <div className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <span className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-bold"
            style={{ background: t.bg, color: t.color, fontFamily: 'var(--font-display)' }}
            aria-hidden>
            {initials(p)}
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight break-words"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {fullName(p) || '—'}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                style={{ background: t.bg, color: t.color }}>
                {t.label}
              </span>
              {p.dob && (
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{calcAge(p.dob)}</span>
              )}
              {branches.map(b => (
                <span key={b} title={branchLabel(b)}
                  className="text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                  style={{ background: '#EEF2F4', color: '#475569' }}>
                  {branchShort(b)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <nav aria-label="Jump to section" className="flex flex-wrap gap-1.5">
          {JUMPS.map(j => (
            <button key={j.id} type="button" onClick={jump(j.id)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50"
              style={CONTROL_STYLE}>
              <span style={{ color: 'var(--teal)' }}>{j.icon}</span>
              {j.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Key facts — the same values shown in the cards below, at a glance. */}
      <dl className="grid grid-cols-2 md:grid-cols-4"
        style={{ borderTop: '1px solid var(--light-gray)', background: '#FAFCFB' }}>
        <KeyFact icon={<Stethoscope size={13} />} label="Diagnosis" value={displayCase(p.diagnosis, 'dx')} />
        <KeyFact icon={<Cake size={13} />} label="Birthday" value={p.dob ? formatDate(p.dob) : ''} />
        <KeyFact icon={<Phone size={13} />} label="Mobile" value={p.phone} />
        <KeyFact icon={<Mail size={13} />} label="Email" value={p.email} />
      </dl>
    </section>
  )
}

function KeyFact({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="px-5 py-3 min-w-0" style={{ borderRight: '1px solid var(--light-gray)', borderBottom: '1px solid var(--light-gray)', marginRight: -1, marginBottom: -1 }}>
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>{label}
      </dt>
      <dd className="text-sm font-medium mt-0.5 truncate" title={value || undefined}
        style={{ color: value ? 'var(--charcoal)' : '#9CA3AF' }}>
        {value || '—'}
      </dd>
    </div>
  )
}

// ─── Label / value rows ──────────────────────────────────────────────────────

function InfoList({ children }: { children: ReactNode }) {
  return <dl className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>{children}</dl>
}

function InfoRow({
  label, value, emptyText = '—', mono, breakAll,
}: {
  label: string
  value?: string | null
  /** Shown (muted) when the value is empty. */
  emptyText?: string
  mono?: boolean
  breakAll?: boolean
}) {
  const v = (value ?? '').trim()
  const has = v !== '' && v !== '—'
  return (
    <div className="grid grid-cols-[minmax(96px,38%)_1fr] gap-3 py-2 first:pt-0 last:pb-0" style={{ borderColor: 'var(--light-gray)' }}>
      <dt className="text-xs font-medium pt-px" style={{ color: 'var(--mid-gray)' }}>{label}</dt>
      <dd className={`text-sm min-w-0 ${breakAll ? 'break-all' : 'break-words'} ${mono ? 'tabular-nums' : ''}`}
        style={{ color: has ? 'var(--charcoal)' : '#9CA3AF', fontWeight: has ? 500 : 400 }}>
        {has ? v : emptyText}
      </dd>
    </div>
  )
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading patient profile">
      <div className="rounded-xl px-5 py-4" style={CARD_STYLE}>
        <div className="flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-full" style={{ borderRadius: 9999 }} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl px-4 py-3.5 space-y-2" style={CARD_STYLE}>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl p-5 space-y-3" style={CARD_STYLE}>
            <Skeleton className="h-4 w-36" />
            {Array.from({ length: 5 }).map((__, j) => (
              <div key={j} className="flex gap-3">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${80 - j * 9}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
        <Loader2 size={13} className="animate-spin" /> Loading patient profile…
      </p>
    </div>
  )
}

// ─── Complaints ──────────────────────────────────────────────────────────────

function ComplaintsCard({ complaints }: { complaints: Complaint[] }) {
  return (
    <DashCard
      title="Patient complaints"
      icon={<AlertTriangle size={15} />}
      description="Retrieved from hr.sapphireclinicseast.org — Patient Complaints module"
      action={<CountPill n={complaints.length} />}
    >
      {complaints.length === 0 ? (
        <EmptyState title="No complaints on record" hint="Nothing has been filed for this patient." />
      ) : (
        <ul className="space-y-2.5">
          {complaints.map((c, i) => {
            const resolved = c.status === 'Resolved'
            return (
              <li key={i} className="rounded-lg px-3.5 py-3"
                style={{ border: '1px solid var(--light-gray)', borderLeft: `3px solid ${resolved ? '#22C55E' : '#F59E0B'}` }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={resolved
                      ? { background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
                      : { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}
                  >
                    {c.status}
                  </span>
                  {c.concernType && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                      {c.concernType}
                    </span>
                  )}
                  <span className="text-xs ml-auto whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{formatDate(c.date)}</span>
                </div>
                <p className="text-sm leading-relaxed mt-2 break-words" style={{ color: 'var(--charcoal)' }}>{c.text}</p>
                {(c.staffInvolved || c.location || c.reference) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {c.staffInvolved && <span>Staff: <span style={{ color: 'var(--charcoal)' }}>{c.staffInvolved}</span></span>}
                    {c.location && <span>Location: <span style={{ color: 'var(--charcoal)' }}>{c.location}</span></span>}
                    {c.reference && <span>Ref: <span className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{c.reference}</span></span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </DashCard>
  )
}

function CountPill({ n, label }: { n: number; label?: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: '#F1F5F9', color: '#475569' }}>
      {n.toLocaleString()}{label ? ` ${label}` : ''}
    </span>
  )
}

// ─── Session history ─────────────────────────────────────────────────────────

const SESSION_FILTERS = ['ALL', 'CONFIRMED', 'RESCHEDULED', 'PENDING', 'CANCELLED'] as const
type SessionFilter = typeof SESSION_FILTERS[number]
const SESSION_PAGE = 25

function SessionHistoryCard({ rows }: { rows: SessionRow[] }) {
  const [filter, setFilter] = useState<SessionFilter>('ALL')
  const [showAll, setShowAll] = useState(false)

  const counts = SESSION_FILTERS.reduce((acc, f) => {
    acc[f] = f === 'ALL' ? rows.length : rows.filter(r => r.status === f).length
    return acc
  }, {} as Record<SessionFilter, number>)
  const filtered = filter === 'ALL' ? rows : rows.filter(r => r.status === filter)
  const visible = showAll ? filtered : filtered.slice(0, SESSION_PAGE)

  return (
    <DashCard
      title="Session history"
      icon={<ClipboardList size={15} />}
      description="Every scheduled session for this patient, newest first."
      action={<CountPill n={rows.length} label={rows.length === 1 ? 'session' : 'sessions'} />}
      flush
    >
      {rows.length === 0 ? (
        <EmptyState title="No sessions to display" hint="Sessions appear here once the patient is booked on the clinic schedule." />
      ) : (
        <>
          {/* Status filter pills */}
          <div className="px-5 py-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter sessions by status"
            style={{ borderBottom: '1px solid var(--light-gray)' }}>
            {SESSION_FILTERS.filter(f => f === 'ALL' || counts[f] > 0).map(f => {
              const active = filter === f
              return (
                <button key={f} type="button" aria-pressed={active}
                  onClick={() => { setFilter(f); setShowAll(false) }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${active ? '' : 'hover:bg-gray-50'}`}
                  style={{
                    background: active ? 'var(--teal)' : '#fff',
                    color: active ? '#fff' : 'var(--charcoal)',
                    border: `1px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
                  }}>
                  {f === 'ALL' ? 'All' : STATUS_CFG[f].label}
                  <span className="tabular-nums" style={{ opacity: active ? 0.85 : 0.6 }}>{counts[f]}</span>
                </button>
              )
            })}
          </div>

          {/* Table (tablet and up) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#F8FAF9', borderBottom: '1px solid var(--light-gray)' }}>
                  {['Date', 'Type of session', 'Clinician', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: 'var(--mid-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((s, i) => (
                  <tr key={i} className="transition-colors hover:bg-[#F8FAF9]" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                    <td className="px-5 py-2.5 font-medium whitespace-nowrap tabular-nums" style={{ color: 'var(--charcoal)' }}>
                      {formatDate(s.date)}
                    </td>
                    <td className="px-5 py-2.5" style={{ color: 'var(--charcoal)' }}>{displayCase(s.sessionType) || '—'}</td>
                    <td className="px-5 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{displayCase(s.clinician, 'name') || '—'}</td>
                    <td className="px-5 py-2.5"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stacked list (phones) */}
          <ul className="sm:hidden">
            {visible.map((s, i) => (
              <li key={i} className="px-5 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatDate(s.date)}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                  {displayCase(s.sessionType) || '—'}
                  <span className="mx-1">·</span>
                  <span style={{ color: 'var(--charcoal)' }}>{displayCase(s.clinician, 'name') || '—'}</span>
                </p>
              </li>
            ))}
          </ul>

          {filtered.length > SESSION_PAGE && (
            <div className="px-5 py-3 flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
              <span>Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}</span>
              <button type="button" onClick={() => setShowAll(v => !v)}
                className="font-semibold" style={{ color: 'var(--teal)' }}>
                {showAll ? 'Show fewer' : `Show all ${filtered.length.toLocaleString()}`}
              </button>
            </div>
          )}
        </>
      )}
    </DashCard>
  )
}

// ── Documents & Files card for Patient Profile ──────────────────────────────
// Combines four sources:
//   • Doctor's Referral (Patient.referralUrl from Patient CRM)
//   • Progress Reports (teletherapy)
//   • Initial Evaluation / Re-evaluation (teletherapy)
//   • Other Documents / Reports (teletherapy)
interface DocRow {
  id: string
  fileName: string
  mimeType: string | null
  department: string
  createdAt: string
  informedFrontDeskAt: string | null
  paidForAt: string | null
  emailedToPatientAt: string | null
  description: string | null
}

interface DocsResponse {
  progressReports: DocRow[]
  initialEvaluations: DocRow[]
  otherDocuments: DocRow[]
}

function DocumentsCard({ patientId, referralUrl, pwdIdUrl }: { patientId: string | null; referralUrl: string | null; pwdIdUrl: string | null }) {
  const [data, setData] = useState<DocsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!patientId) { setData(null); return }
    setLoading(true)
    fetch(`/api/patients/${patientId}/documents`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [patientId])

  if (!patientId) return null

  // An error body ({ error }) has none of the lists — treat each as empty.
  const progressReports = data?.progressReports ?? []
  const initialEvaluations = data?.initialEvaluations ?? []
  const otherDocuments = data?.otherDocuments ?? []

  const totalCount =
    (referralUrl ? 1 : 0) +
    (pwdIdUrl ? 1 : 0) +
    progressReports.length +
    initialEvaluations.length +
    otherDocuments.length

  return (
    <DashCard
      title="Documents & files"
      icon={<FileText size={15} />}
      description="Referral and ID uploaded in the CRM, plus reports filed by clinicians."
      action={loading ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--mid-gray)' }} /> : <CountPill n={totalCount} />}
      className="flex-1"
    >
      {loading ? (
        <div className="space-y-4" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <DocSection
            title="Doctor&apos;s Referral"
            tint="blue"
            empty="No doctor&apos;s referral on file."
            rows={referralUrl ? [{
              id: 'referral',
              fileName: referralUrl.split('/').pop() ?? 'Referral document',
              mimeType: null,
              department: '',
              createdAt: '',
              informedFrontDeskAt: null,
              paidForAt: null,
              emailedToPatientAt: null,
              description: null,
            }] : []}
            buildHref={() => referralUrl ?? '#'}
            hideTimeline
          />

          <DocSection
            title="PWD / Senior ID"
            tint="green"
            empty="No PWD / Senior ID on file."
            rows={pwdIdUrl ? [{
              id: 'pwdid',
              fileName: pwdIdUrl.split('/').pop() ?? 'PWD / Senior ID',
              mimeType: null,
              department: '',
              createdAt: '',
              informedFrontDeskAt: null,
              paidForAt: null,
              emailedToPatientAt: null,
              description: null,
            }] : []}
            buildHref={() => pwdIdUrl ?? '#'}
            hideTimeline
          />

          <DocSection
            title="Progress Reports"
            tint="orange"
            empty="No progress reports on file."
            rows={progressReports}
            buildHref={(r) => `/api/progress-reports/${r.id}/file`}
          />

          <DocSection
            title="Initial Evaluation / Re-evaluation"
            tint="purple"
            empty="No initial evaluations on file."
            rows={initialEvaluations}
            buildHref={(r) => `/api/progress-reports/${r.id}/file`}
            hideTimeline
          />

          <DocSection
            title="Other Documents / Reports"
            tint="gray"
            empty="No other documents on file."
            rows={otherDocuments}
            buildHref={(r) => `/api/progress-reports/${r.id}/file`}
            hideTimeline
          />
        </div>
      )}
    </DashCard>
  )
}

const TINTS: Record<string, { icon: string; iconBg: string }> = {
  orange: { icon: '#C2410C', iconBg: '#FFF7ED' },
  blue:   { icon: '#1D4ED8', iconBg: '#EFF6FF' },
  purple: { icon: '#6D28D9', iconBg: '#F5F3FF' },
  gray:   { icon: '#475569', iconBg: '#F1F5F9' },
  green:  { icon: '#15803D', iconBg: '#F0FDF4' },
}

const TIMELINE = [
  { key: 'informedFrontDeskAt', label: 'Informed', bg: '#FFEDD5', color: '#9A3412', dot: '#F97316' },
  { key: 'paidForAt', label: 'Paid', bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  { key: 'emailedToPatientAt', label: 'Sent', bg: '#DCFCE7', color: '#14532D', dot: '#22C55E' },
] as const

function DocSection({
  title, tint, empty, rows, buildHref, hideTimeline,
}: {
  title: string
  tint: 'orange' | 'blue' | 'purple' | 'gray' | 'green'
  empty: string
  rows: DocRow[]
  buildHref: (r: DocRow) => string
  hideTimeline?: boolean
}) {
  const t = TINTS[tint]
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.icon }} />
        {title} <span className="font-normal tabular-nums">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs pl-3" style={{ color: '#9CA3AF' }}>{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[#F8FAF9]"
              style={{ border: '1px solid var(--light-gray)' }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: t.iconBg }}>
                <Activity size={14} style={{ color: t.icon }} />
              </span>
              <div className="flex-1 min-w-0">
                <a
                  href={buildHref(d)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold truncate block hover:underline"
                  style={{ color: 'var(--charcoal)' }}
                  title={d.fileName}
                >
                  {d.fileName}
                </a>
                {(d.department || d.createdAt || d.description) && (
                  <div className="flex items-center gap-x-2 gap-y-0.5 mt-0.5 flex-wrap text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                    {d.department && <span className="font-semibold" style={{ color: t.icon }}>{d.department}</span>}
                    {d.createdAt && <span>{new Date(d.createdAt).toLocaleDateString()}</span>}
                    {d.description && <span className="italic truncate max-w-full">{d.description}</span>}
                  </div>
                )}
                {!hideTimeline && (d.informedFrontDeskAt || d.paidForAt || d.emailedToPatientAt) && (
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {TIMELINE.map(s => {
                      const at = d[s.key]
                      if (!at) return null
                      return (
                        <span key={s.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: s.bg, color: s.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                          {s.label} · {new Date(at).toLocaleDateString()}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <a
                href={buildHref(d)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0 hover:bg-gray-50"
                style={CONTROL_STYLE}
                aria-label={`View ${d.fileName}`}
              >
                View <ExternalLink size={11} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
