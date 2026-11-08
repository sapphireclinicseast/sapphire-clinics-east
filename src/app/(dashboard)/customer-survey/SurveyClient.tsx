'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { branchLabel } from '@/lib/branch-label'
import Script from 'next/script'
import {
  ClipboardCheck, BarChart3, ListChecks, Star, Target, Clock,
  QrCode, Users, TrendingUp, Building2, X, ChevronUp, ChevronDown,
  ArrowUpDown, ExternalLink, Search, Baby, User, Trash2, FileText,
  Trophy, Award, MessageSquare, Calendar, ThumbsUp, AlertTriangle,
  Sparkles, Copy, Check, Settings, RefreshCw, Printer, Download, Loader2,
} from 'lucide-react'
import { generateSurveyResultPDF } from '@/lib/pdf-results'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, BarListSkeleton, EmptyState } from '../patients/dashboard/ui'

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalSurveys: number
  avgScore: number | null
  completionRate: number
  completedCount: number
  targetCount: number
  pending: number
  byBranch: { branch: string; avgScore: number; count: number }[]
  monthlyTrend: { month: string; avgScore: number; count: number }[]
}

interface StaffRow {
  id: string
  name: string
  department: string
  branch: string
  targetCount: number
  completed: number
  lastAssessed: string | null
}

interface PendingAssignment {
  id: string
  staffName: string
  staffDept: string
  patientName: string | null
  surveyType: string
  branch: string
  status: string
  createdAt: string
  expiresAt: string
}

interface PatientResult {
  id: string
  firstName: string
  lastName: string
  dob: string | null
  patientType: string | null
  branches: string[]
}

interface ResultRow {
  id: string
  staffName: string
  staffDept: string
  patientName: string | null
  surveyType: string
  branch: string
  status: string
  createdAt: string
  expiresAt: string
  hasResponse: boolean
  submittedAt: string | null
}

interface TopPerformer {
  id: string; name: string; department: string; branch: string
  avgRating: number; sessionsTotal: number; compositeScore: number; surveyCount: number
}

interface StaffResult {
  id: string; name: string; department: string; branch: string
  avgRating: number; sessionsTotal: number; sessionsRescheduled: number
  sessionsCancelled: number; sessionsMonth: number
  compositeScore: number; surveyCount: number
  monthlyRatings: { month: string; avgRating: number }[]
  feedback: { strengths: string[]; improvements: string[]; other: string[] }
}

interface SurveyWeights {
  weightConfirmed: number
  weightRescheduled: number
  weightCancelled: number
  weightSatisfaction: number
}

interface ResultsDashboard {
  top5Overall: TopPerformer[]
  top5ByDept: Record<string, TopPerformer[]>
  allStaff: StaffResult[]
  availableBranches: string[]
  staffOptions: { id: string; name: string; department: string; branch: string }[]
  departments: string[]
  isMainAdmin: boolean
  weights: SurveyWeights
}

interface Highlight {
  staffName: string; department: string; branch: string
  surveyType: string; feedback: string; submittedAt: string
  avgRating: number | null
}

type SortKey = 'name' | 'department' | 'branch' | 'progress'
type SortDir = 'asc' | 'desc'

function getAge(dob: string): number {
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

// ── Presentation helpers (display only — no scoring logic lives here) ────────

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }
const controlStyle = (active: boolean): CSSProperties => ({ ...CONTROL_STYLE, borderColor: active ? 'var(--teal)' : 'var(--light-gray)' })
const TOOLTIP_STYLE: CSSProperties = {
  background: '#fff', border: '1px solid var(--light-gray)', borderRadius: 8,
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)', color: 'var(--charcoal)',
}
const MODAL_BACKDROP: CSSProperties = { background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50'
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5'

/** Colour band for a 1–5 rating. Purely visual. */
function ratingBand(v: number | null | undefined) {
  if (v == null) return { fg: 'var(--mid-gray)', bg: '#F3F4F6', bar: '#CBD5E1', label: 'No ratings yet' }
  if (v >= 4.5) return { fg: '#15803D', bg: '#DCFCE7', bar: '#16A34A', label: 'Excellent' }
  if (v >= 4)   return { fg: '#0F766E', bg: '#CCFBF1', bar: '#14B8A6', label: 'Good' }
  if (v >= 3)   return { fg: '#B45309', bg: '#FEF3C7', bar: '#F59E0B', label: 'Fair' }
  return { fg: '#B91C1C', bg: '#FEE2E2', bar: '#EF4444', label: 'Needs attention' }
}

function RatingPill({ value, digits = 2, title }: { value: number | null | undefined; digits?: number; title?: string }) {
  const b = ratingBand(value)
  return (
    <span title={title ?? (value != null ? `${b.label} — average rating out of 5` : undefined)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold leading-none whitespace-nowrap"
      style={{ background: b.bg, color: b.fg, fontVariantNumeric: 'tabular-nums' }}>
      <Star size={10} fill="currentColor" strokeWidth={0} />
      {value != null ? value.toFixed(digits) : '—'}
    </span>
  )
}

function Chip({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'gray' }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold leading-tight whitespace-nowrap"
      style={tone === 'teal' ? { background: 'var(--pale-teal)', color: 'var(--teal)' } : { background: '#F3F4F6', color: 'var(--mid-gray)' }}>
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = status === 'COMPLETED'
    ? { bg: '#DCFCE7', fg: '#15803D' }
    : status === 'EXPIRED' ? { bg: '#FEE2E2', fg: '#B91C1C' } : { bg: '#FEF3C7', fg: '#B45309' }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

/** Hover / focus tooltip for an HTML bar row. Parent needs `group relative`. */
function RowTip({ children }: { children: ReactNode }) {
  return (
    <div role="tooltip"
      className="pointer-events-none absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 z-20 hidden group-hover:block group-focus-within:block whitespace-nowrap rounded-lg px-3 py-2 text-[11px]"
      style={TOOLTIP_STYLE}>
      {children}
    </div>
  )
}

function ErrorCard({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl px-6 py-10 text-center" style={{ background: '#fff', border: '1px solid #FECACA' }}>
      <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      {onRetry && (
        <button onClick={onRetry} className={`${BTN_SECONDARY} mt-4`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

/** Pill tab bar — used for both the page tabs and the Results sub-tabs. */
function PillTabs<T extends string>({ tabs, value, onChange, size = 'md', label }: {
  tabs: { id: T; label: string; icon: typeof ClipboardCheck }[]
  value: T; onChange: (id: T) => void; size?: 'md' | 'sm'; label: string
}) {
  return (
    <div role="tablist" aria-label={label}
      className="flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full"
      style={size === 'md' ? CARD_STYLE : { background: '#F3F6F5' }}>
      {tabs.map(({ id, label: l, icon: Icon }) => {
        const active = value === id
        return (
          <button key={id} role="tab" aria-selected={active} onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${size === 'md' ? 'px-3.5 py-2 text-sm' : 'px-3 py-1.5 text-xs'} ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? size === 'md'
                ? { background: 'var(--teal)', color: '#fff' }
                : { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            <Icon size={size === 'md' ? 15 : 13} />
            {l}
          </button>
        )
      })}
    </div>
  )
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const monthShort = (mm: string) => new Date(2025, parseInt(mm) - 1).toLocaleString('en', { month: 'short' })
const monthLong = (mm: string) => new Date(2025, parseInt(mm) - 1).toLocaleString('en', { month: 'long' })

// ── Main Component ───────────────────────────────────────────────────────────

export default function SurveyClient({ role }: { role: string }) {
  const [tab, setTab] = useState<'overview' | 'daily-target' | 'manage' | 'results'>('overview')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Filters
  const [filterDept, setFilterDept] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')

  // Manual assignment
  const [assignStaff, setAssignStaff] = useState('')
  const [assignPatientType, setAssignPatientType] = useState<'PEDIATRIC' | 'ADULT'>('PEDIATRIC')
  const [assignSession, setAssignSession] = useState('individual')
  const [qrUrl, setQrUrl] = useState('')
  const [qrType, setQrType] = useState('')
  const [showQr, setShowQr] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  // Patient search
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<PatientResult[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null)
  const [patientSearching, setPatientSearching] = useState(false)
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const patientSearchRef = useRef<HTMLDivElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pending assignments
  const [pendingList, setPendingList] = useState<PendingAssignment[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [showPending, setShowPending] = useState(false)

  // Results (admin only)
  const [results, setResults] = useState<ResultRow[]>([])
  const [resultsListLoading, setResultsListLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Results dashboard
  const [resultsDash, setResultsDash] = useState<ResultsDashboard | null>(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [resultsFailed, setResultsFailed] = useState(false)
  const [rdFilterBranch, setRdFilterBranch] = useState('')
  const [rdFilterStaff, setRdFilterStaff] = useState('')
  const [rdFilterMonth, setRdFilterMonth] = useState(0) // 0 = all
  const [rdFilterDept, setRdFilterDept] = useState('')
  // Answered-between. The month picker could only ask "any January", which
  // cannot answer "has anyone answered this week" — the question that actually
  // gets asked of this screen.
  const [rdFrom, setRdFrom] = useState('')
  const [rdTo, setRdTo] = useState('')
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)
  const [rdSubTab, setRdSubTab] = useState<'leaderboard' | 'details' | 'manage' | 'highlights' | 'settings'>('leaderboard')

  // Social Media Highlights
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [highlightsLoading, setHighlightsLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Results Settings
  const [settingsWeights, setSettingsWeights] = useState<SurveyWeights>({ weightConfirmed: 50, weightRescheduled: 0, weightCancelled: 0, weightSatisfaction: 50 })
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isFrontDesk = role === 'AHEA_FRONT_DESK' || role === 'AHGH_FRONT_DESK'
  const isAdmin = ['MARKETING_ADMIN', 'SUPERADMIN', 'ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN'].includes(role)
  const isMarketingAdmin = ['MARKETING_ADMIN', 'SUPERADMIN', 'ADMIN'].includes(role)

  // ── Load dashboard ───────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch('/api/customer-survey?view=dashboard')
      if (!res.ok) throw new Error('Failed to load')
      setDashboard(await res.json())
    } catch {
      setError('Could not connect to survey API')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // ── Load staff ───────────────────────────────────────────────────────────
  const loadStaff = useCallback(async () => {
    setStaffLoading(true)
    try {
      const res = await fetch('/api/customer-survey?view=staff')
      if (!res.ok) throw new Error('Failed to load')
      setStaff(await res.json())
    } catch { /* handled by error state */ } finally {
      setStaffLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'manage') loadStaff()
  }, [tab, loadStaff])

  // ── Load results (admin) ────────────────────────────────────────────────
  const loadResults = useCallback(async () => {
    setResultsListLoading(true)
    try {
      const res = await fetch('/api/customer-survey?view=results')
      if (!res.ok) return
      setResults(await res.json())
    } catch { /* silent */ } finally {
      setResultsListLoading(false)
    }
  }, [])

  const loadResultsDashboard = useCallback(async (branch?: string, staffId?: string, month?: number, from?: string, to?: string) => {
    setResultsLoading(true)
    setResultsFailed(false)
    try {
      const params = new URLSearchParams({ view: 'results-dashboard' })
      if (branch) params.set('branch', branch)
      if (staffId) params.set('staffId', staffId)
      if (month) params.set('month', String(month))
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/customer-survey?${params}`)
      if (!res.ok) { setResultsFailed(true); return }
      setResultsDash(await res.json())
    } catch { setResultsFailed(true) } finally {
      setResultsLoading(false)
    }
  }, [])

  const loadHighlights = useCallback(async () => {
    setHighlightsLoading(true)
    try {
      const res = await fetch('/api/customer-survey?view=highlights')
      if (!res.ok) return
      const data = await res.json()
      setHighlights(data.highlights ?? [])
    } catch { /* silent */ } finally {
      setHighlightsLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/customer-survey?view=settings')
      if (!res.ok) return
      const data = await res.json()
      setSettingsWeights({
        weightConfirmed: data.weightConfirmed ?? 50,
        weightRescheduled: data.weightRescheduled ?? 0,
        weightCancelled: data.weightCancelled ?? 0,
        weightSatisfaction: data.weightSatisfaction ?? 50,
      })
    } catch { /* silent */ } finally {
      setSettingsLoading(false)
    }
  }, [])

  // Unused while the weights are read-only (managed from the HR platform);
  // kept so re-enabling editing is a UI-only change.
  const saveSettings = async () => {
    const total = settingsWeights.weightConfirmed + settingsWeights.weightRescheduled + settingsWeights.weightCancelled + settingsWeights.weightSatisfaction
    if (total !== 100) {
      setSettingsMsg({ type: 'error', text: `Weights must total 100% (currently ${total}%)` })
      return
    }
    setSettingsSaving(true)
    setSettingsMsg(null)
    try {
      const res = await fetch('/api/customer-survey', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsWeights),
      })
      if (!res.ok) {
        const data = await res.json()
        setSettingsMsg({ type: 'error', text: data.error ?? 'Failed to save' })
        return
      }
      setSettingsMsg({ type: 'success', text: 'Settings saved! Leaderboard will update on next load.' })
      // Reload dashboard to reflect new weights
      loadResultsDashboard(rdFilterBranch, rdFilterStaff, rdFilterMonth, rdFrom, rdTo)
    } catch {
      setSettingsMsg({ type: 'error', text: 'Network error' })
    } finally {
      setSettingsSaving(false)
    }
  }

  useEffect(() => {
    if (tab === 'results' && isAdmin) {
      loadResultsDashboard(rdFilterBranch, rdFilterStaff, rdFilterMonth, rdFrom, rdTo)
      if (rdSubTab === 'manage') loadResults()
      if (rdSubTab === 'highlights' && isMarketingAdmin) loadHighlights()
      if (rdSubTab === 'settings' && isAdmin) loadSettings()
    }
  }, [tab, isAdmin, isMarketingAdmin, rdFilterBranch, rdFilterStaff, rdFilterMonth, rdFrom, rdTo, rdSubTab, loadResultsDashboard, loadResults, loadHighlights, loadSettings])

  const deleteResult = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to delete this survey result? This cannot be undone.')) return
    setDeletingId(assignmentId)
    try {
      const res = await fetch('/api/customer-survey', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Delete failed')
      }
      setResults(prev => prev.filter(r => r.id !== assignmentId))
      loadDashboard() // refresh counts
    } catch (err) {
      alert('Failed to delete: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setDeletingId(null)
    }
  }

  // ── Load pending assignments ─────────────────────────────────────────────
  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const res = await fetch('/api/customer-survey?view=pending')
      if (!res.ok) return
      setPendingList(await res.json())
    } catch { /* silent */ } finally {
      setPendingLoading(false)
    }
  }, [])

  // ── Patient search ─────────────────────────────────────────────────────
  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) {
      setPatientResults([])
      return
    }
    setPatientSearching(true)
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) return
      const results: PatientResult[] = await res.json()
      // Filter by patient type based on DOB
      const filtered = results.filter(p => {
        if (!p.dob) return true // show patients without DOB
        const age = getAge(p.dob)
        return assignPatientType === 'PEDIATRIC' ? age < 18 : age >= 18
      })
      setPatientResults(filtered)
    } catch { /* silent */ } finally {
      setPatientSearching(false)
    }
  }, [assignPatientType])

  const handlePatientQueryChange = (value: string) => {
    setPatientQuery(value)
    setSelectedPatient(null)
    setShowPatientDropdown(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchPatients(value), 300)
  }

  const selectPatient = (p: PatientResult) => {
    setSelectedPatient(p)
    setPatientQuery(`${p.firstName} ${p.lastName}`)
    setShowPatientDropdown(false)
  }

  // Close patient dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientSearchRef.current && !patientSearchRef.current.contains(e.target as Node)) {
        setShowPatientDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Escape closes whichever modal is open
  useEffect(() => {
    if (!showQr && !showPending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowQr(false); setShowPending(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showQr, showPending])

  // Re-search when patient type changes
  useEffect(() => {
    if (patientQuery.length >= 2) {
      searchPatients(patientQuery)
    }
  }, [assignPatientType, searchPatients, patientQuery])

  // ── Create assignment + QR ───────────────────────────────────────────────
  const createAssignment = async (staffId: string) => {
    if (!selectedPatient) return alert('Please select a patient from the search results')
    try {
      const patientAge = selectedPatient.dob ? getAge(selectedPatient.dob) : (assignPatientType === 'PEDIATRIC' ? 5 : 25)
      // Use the logged-in user's branch, not the staff's home branch.
      // Interbranch consultants have branch=SBEA but may be surveyed at SBGH.
      const userBranch = role.startsWith('SBGH_') ? 'SBGH' : role.startsWith('SBEA_') ? 'SBEA' : null
      const selectedStaff = staff.find(s => s.id === staffId)
      const res = await fetch('/api/customer-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId,
          patientId: selectedPatient.id,
          patientName: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
          patientAge,
          branch: userBranch ?? selectedStaff?.branch ?? 'SBEA',
          sessionType: assignSession,
        }),
      })
      if (!res.ok) throw new Error('Failed to create assignment')
      const result = await res.json()
      const surveyUrl = `https://survey.sapphireclinicseast.org?id=${result.assignmentId}`
      setQrUrl(surveyUrl)
      setQrType(result.surveyType)
      setShowQr(true)
      renderQr(surveyUrl)
      // Refresh dashboard
      loadDashboard()
    } catch {
      alert('Failed to create assignment. Please try again.')
    }
  }

  const renderQr = (url: string) => {
    setTimeout(() => {
      if (qrRef.current) {
        qrRef.current.innerHTML = ''
        // @ts-expect-error - QRCode loaded via CDN
        if (typeof window !== 'undefined' && window.QRCode) {
          // @ts-expect-error - QRCode loaded via CDN
          new window.QRCode(qrRef.current, { text: url, width: 200, height: 200, colorDark: '#0f766e', colorLight: '#ffffff' })
        } else {
          qrRef.current.innerHTML = `<p style="font-size:12px;word-break:break-all">${url}</p>`
        }
      }
    }, 100)
  }

  // ── Sorting logic ────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={11} style={{ color: '#cbd5e1' }} />
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ color: 'var(--teal)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--teal)' }} />
  }

  // ── Filter + sort staff ──────────────────────────────────────────────────
  const filteredStaff = staff
    .filter(s => !filterDept || s.department === filterDept)
    .filter(s => !filterBranch || s.branch === filterBranch)
    .sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'department': cmp = a.department.localeCompare(b.department); break
        case 'branch': cmp = a.branch.localeCompare(b.branch); break
        case 'progress': cmp = (a.completed / (a.targetCount || 1)) - (b.completed / (b.targetCount || 1)); break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  // Name search narrows the table only — the assignment dropdown below keeps
  // following the department / branch filters as before.
  const staffQ = staffSearch.trim().toLowerCase()
  const tableStaff = staffQ ? filteredStaff.filter(s => s.name.toLowerCase().includes(staffQ)) : filteredStaff
  const staffFiltersOn = !!(filterDept || filterBranch || staffQ)

  // ── Get unique departments for filter ────────────────────────────────────
  const departments = [...new Set(staff.map(s => s.department))].sort()
  const branches = [...new Set(staff.map(s => s.branch))].sort()

  // ── Results filters ──────────────────────────────────────────────────────
  const rdFiltersOn = !!(rdFilterBranch || rdFilterStaff || rdFilterMonth || rdFilterDept || rdFrom || rdTo)
  const clearRdFilters = () => {
    setRdFilterBranch(''); setRdFilterStaff(''); setRdFilterMonth(0)
    setRdFilterDept(''); setRdFrom(''); setRdTo('')
  }
  const detailStaff = (resultsDash?.allStaff ?? [])
    .filter(s => !rdFilterDept || s.department === rdFilterDept)
    .sort((a, b) => b.compositeScore - a.compositeScore)
  const deptBoards = Object.entries(resultsDash?.top5ByDept ?? {})
    .filter(([dept]) => !rdFilterDept || dept === rdFilterDept)

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'daily-target' as const, label: 'Daily Target', icon: Target },
    { id: 'manage' as const, label: 'Manage', icon: ListChecks },
    ...(isAdmin ? [{ id: 'results' as const, label: 'Results', icon: FileText }] : []),
  ]

  const year = new Date().getFullYear()
  const avgBand = ratingBand(dashboard?.avgScore)
  const overviewFailed = !!error && !dashboard && !loading
  const openPending = () => { setShowPending(true); loadPending() }

  return (
    <div className="max-w-6xl space-y-5">
      {/* ── Header: title left, primary action right ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Patient Experience
          </p>
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Customer Survey
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Patient satisfaction surveys — daily targets, QR assignments and staff results.
          </p>
        </div>
        <button onClick={() => setTab('manage')} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}
          title="Generate a survey QR code for a patient">
          <QrCode size={15} /> New survey QR
        </button>
      </div>

      {/* ── Page tabs ── */}
      <PillTabs label="Customer survey sections" tabs={tabs} value={tab} onChange={setTab} />

      {/* ═══════════════ Overview ═══════════════ */}
      {tab === 'overview' && (
        overviewFailed ? (
          <ErrorCard title="Couldn't load the survey overview" hint={error} onRetry={loadDashboard} />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {loading && !dashboard ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-16 mt-2" />
                    <Skeleton className="h-3 w-24 mt-2" />
                  </div>
                ))
              ) : (
                <>
                  <KpiCard label="Responses" icon={<ClipboardCheck size={16} />}
                    value={(dashboard?.totalSurveys ?? 0).toLocaleString()}
                    sub={`Submitted in ${year}`} />
                  <KpiCard label="Avg. rating" icon={<Star size={16} />} accent={avgBand.fg}
                    value={dashboard?.avgScore != null
                      ? <span>{dashboard.avgScore.toFixed(2)}<span className="text-sm font-semibold" style={{ color: 'var(--mid-gray)' }}> / 5</span></span>
                      : '—'}
                    sub={<span style={{ color: dashboard?.avgScore != null ? avgBand.fg : undefined, fontWeight: dashboard?.avgScore != null ? 600 : undefined }}>{avgBand.label}</span>} />
                  <KpiCard label="Completion" icon={<Target size={16} />} accent="var(--gold)"
                    value={dashboard ? `${dashboard.completionRate}%` : '—'}
                    sub="Of this year's assessment targets" />
                  <button type="button" onClick={openPending} title="View open surveys"
                    className="text-left rounded-xl px-4 py-3.5 min-w-0 transition-all hover:shadow-sm hover:border-[var(--teal)]"
                    style={CARD_STYLE}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--mid-gray)' }}>Pending</p>
                      <Clock size={16} style={{ color: '#D97706' }} />
                    </div>
                    <p className="text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                      {(dashboard?.pending ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--teal)' }}>View open surveys →</p>
                  </button>
                </>
              )}
            </div>

            {error && dashboard && (
              <div className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                <AlertTriangle size={13} /> {error}
                <button onClick={loadDashboard} className="ml-auto font-semibold underline">Retry</button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DashCard title="Satisfaction trend" icon={<TrendingUp size={15} />}
                description={`Average rating per month in ${year}, out of 5. Hover a bar for the response count.`}>
                {loading && !dashboard ? <BarListSkeleton rows={6} /> : (
                  <ScoreBars rows={(dashboard?.monthlyTrend ?? []).map(m => ({ key: m.month, label: monthShort(m.month), fullLabel: `${monthLong(m.month)} ${year}`, avg: m.avgScore, count: m.count }))}
                    empty="No ratings submitted this year yet" />
                )}
              </DashCard>
              <DashCard title="By branch" icon={<Building2 size={15} />}
                description={`Average rating per branch in ${year}, out of 5.`}>
                {loading && !dashboard ? <BarListSkeleton rows={2} /> : (
                  <ScoreBars rows={(dashboard?.byBranch ?? []).map(b => ({ key: b.branch, label: branchLabel(b.branch) || b.branch, fullLabel: branchLabel(b.branch) || b.branch, avg: b.avgScore, count: b.count }))}
                    empty="No branch ratings yet" />
                )}
              </DashCard>
            </div>

            <ScoreLegend />
          </div>
        )
      )}

      {/* ═══════════════ Daily Target ═══════════════ */}
      {tab === 'daily-target' && (
        <DailyTargetTab isAdmin={isAdmin} isFrontDesk={isFrontDesk} role={role} />
      )}

      {/* ═══════════════ Manage ═══════════════ */}
      {tab === 'manage' && (
        <div className="space-y-5">
          {/* Assessment Schedule */}
          <section className="rounded-xl min-w-0" style={CARD_STYLE}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <h2 className="flex items-center gap-2 text-[14px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <Users size={15} style={{ color: 'var(--teal)' }} /> Assessment schedule
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                Surveys completed against each staff member&apos;s yearly target. {isFrontDesk ? 'Showing front desk staff at your branch.' : 'Showing all staff.'}
              </p>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                <input type="text" value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
                  placeholder="Search staff…" aria-label="Search staff"
                  className={`${CONTROL} w-full pl-9 pr-8`} style={CONTROL_STYLE} />
                {staffSearch && (
                  <button onClick={() => setStaffSearch('')} title="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100">
                    <X size={13} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                )}
              </div>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)} aria-label="Department"
                className={CONTROL} style={controlStyle(!!filterDept)}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {!isFrontDesk && (
                <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} aria-label="Branch"
                  className={CONTROL} style={controlStyle(!!filterBranch)}>
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b} value={b}>{branchLabel(b) || b}</option>)}
                </select>
              )}
              {staffFiltersOn && (
                <button onClick={() => { setFilterDept(''); setFilterBranch(''); setStaffSearch('') }}
                  className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-semibold hover:bg-gray-50" style={{ color: 'var(--teal)' }}>
                  <X size={12} /> Clear filters
                </button>
              )}
              <span className="ml-auto text-xs whitespace-nowrap pl-2" style={{ color: 'var(--mid-gray)' }}>
                {staffLoading && staff.length === 0 ? 'Loading…' : (
                  <>
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{tableStaff.length}</span>
                    {tableStaff.length !== staff.length && <> of {staff.length}</>} staff
                  </>
                )}
              </span>
            </div>

            {staffLoading && staff.length === 0 ? (
              <div className="p-5 space-y-3" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3.5 w-14 hidden sm:block" />
                    <Skeleton className="h-2 flex-1" />
                    <Skeleton className="h-3.5 w-10" />
                  </div>
                ))}
              </div>
            ) : tableStaff.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--light-gray)', background: '#F8FAF9' }}>
                      {([
                        ['name', 'Staff'],
                        ['department', 'Role'],
                        ['branch', 'Branch'],
                        ['progress', 'Progress'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th key={key} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: sortKey === key ? 'var(--teal)' : 'var(--mid-gray)' }}
                          aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                          <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 select-none hover:opacity-80" title={`Sort by ${label.toLowerCase()}`}>
                            {label}
                            <SortIcon col={key} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableStaff.map(s => {
                      const pct = Math.min(100, (s.completed / (s.targetCount || 1)) * 100)
                      const done = s.completed >= s.targetCount
                      return (
                        <tr key={s.id} className="hover:bg-[#F8FAF9]" style={{ borderBottom: '1px solid #EEF2F1' }}>
                          <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{s.name}</td>
                          <td className="px-4 py-2.5"><Chip>{s.department}</Chip></td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                            {branchLabel(s.branch) || s.branch}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5" title={`${s.completed} of ${s.targetCount} surveys completed`}>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF2F1', minWidth: 80 }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? '#16A34A' : 'var(--teal)' }} />
                              </div>
                              <span className="text-xs font-semibold whitespace-nowrap text-right" style={{ color: done ? '#15803D' : 'var(--charcoal)', minWidth: 40, fontVariantNumeric: 'tabular-nums' }}>
                                {done && <Check size={11} className="inline -mt-0.5 mr-0.5" />}
                                {s.completed}/{s.targetCount}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={staff.length === 0 ? 'No staff to show' : 'No staff match these filters'}
                hint={staff.length === 0 ? 'Staff with assessment targets for this year will appear here.' : 'Try a different name, department or branch, or clear the filters.'}
              />
            )}
          </section>

          {/* Manual Assignment */}
          <DashCard title="Manual survey assignment" icon={<QrCode size={15} />}
            description="Generate a QR code a patient can scan to take the survey.">
            <div className="space-y-4">
              <div>
                <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Patient type</span>
                <div className="inline-flex p-1 rounded-lg gap-1" style={{ background: '#F3F6F5' }} role="group" aria-label="Patient type">
                  {([
                    { id: 'PEDIATRIC' as const, label: 'Pedia (Under 18)', icon: Baby },
                    { id: 'ADULT' as const, label: 'Adult (18+)', icon: User },
                  ]).map(({ id, label, icon: Icon }) => {
                    const active = assignPatientType === id
                    return (
                      <button key={id} aria-pressed={active}
                        onClick={() => { setAssignPatientType(id); setSelectedPatient(null); setPatientQuery('') }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                        style={active ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { color: 'var(--mid-gray)' }}>
                        <Icon size={14} /> {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="assign-staff" className={LABEL} style={{ color: 'var(--mid-gray)' }}>Staff member</label>
                  <select id="assign-staff" value={assignStaff} onChange={e => setAssignStaff(e.target.value)}
                    className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                    <option value="">Select staff...</option>
                    {filteredStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.department})</option>)}
                  </select>
                </div>
                <div ref={patientSearchRef} className="relative">
                  <label htmlFor="assign-patient" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    Patient name <span className="normal-case tracking-normal font-normal">(search from Patient CRM)</span>
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                    <input id="assign-patient" type="text" value={patientQuery}
                      onChange={e => handlePatientQueryChange(e.target.value)}
                      onFocus={() => { if (patientQuery.length >= 2) setShowPatientDropdown(true) }}
                      placeholder={`Search ${assignPatientType === 'PEDIATRIC' ? 'pedia' : 'adult'} patients...`}
                      className={`${CONTROL} w-full pl-9`} style={CONTROL_STYLE} />
                  </div>
                  {selectedPatient && (
                    <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                      <Check size={12} />
                      <span className="font-semibold">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                      {selectedPatient.dob && (
                        <span style={{ color: 'var(--mid-gray)' }}>
                          Age: {getAge(selectedPatient.dob)} &middot; DOB: {new Date(selectedPatient.dob).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      <button onClick={() => { setSelectedPatient(null); setPatientQuery('') }} className="ml-auto p-0.5 rounded hover:bg-white/60" title="Clear patient">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {showPatientDropdown && patientQuery.length >= 2 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl max-h-56 overflow-y-auto"
                      style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }}>
                      {patientSearching ? (
                        <div className="px-3 py-3 text-xs text-center flex items-center justify-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                          <Loader2 size={12} className="animate-spin" /> Searching...
                        </div>
                      ) : patientResults.length > 0 ? (
                        patientResults.map(p => (
                          <button key={p.id} onClick={() => selectPatient(p)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-[#F8FAF9] flex items-center justify-between gap-3"
                            style={{ borderBottom: '1px solid #EEF2F1' }}>
                            <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{p.firstName} {p.lastName}</span>
                            <span className="text-xs text-right" style={{ color: 'var(--mid-gray)' }}>
                              {p.dob ? `Age ${getAge(p.dob)}` : 'No DOB'}
                              {p.branches?.length > 0 && ` · ${p.branches.join(', ')}`}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
                          No {assignPatientType === 'PEDIATRIC' ? 'pedia' : 'adult'} patients found for &quot;{patientQuery}&quot;
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="assign-session" className={LABEL} style={{ color: 'var(--mid-gray)' }}>Session type</label>
                  <select id="assign-session" value={assignSession} onChange={e => setAssignSession(e.target.value)}
                    className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
                    <option value="individual">Individual Session</option>
                    <option value="group">Group Session</option>
                  </select>
                </div>
                {selectedPatient && selectedPatient.dob && (
                  <div>
                    <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Patient age (auto-calculated)</span>
                    <div className="h-9 px-3 rounded-lg text-sm font-medium flex items-center flex-wrap gap-x-2" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                      {getAge(selectedPatient.dob)} years old
                      <span className="font-normal text-xs" style={{ color: 'var(--mid-gray)' }}>
                        → Survey: {assignSession === 'group' ? 'HR16' : getAge(selectedPatient.dob) < 18 ? 'HR10 (Pedia)' : 'HR11 (Adult)'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <button
                  onClick={() => {
                    if (!assignStaff) return alert('Please select a staff member')
                    if (!selectedPatient) return alert('Please search and select a patient from the CRM')
                    createAssignment(assignStaff)
                  }}
                  className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
                  <QrCode size={15} /> Generate Survey QR Code
                </button>
              </div>
            </div>
          </DashCard>
        </div>
      )}

      {/* ═══════════════ Results (Admin / Branch Admin only) ═══════════════ */}
      {tab === 'results' && isAdmin && (
        <div className="space-y-5">
          <PillTabs label="Results sections" size="sm" value={rdSubTab} onChange={setRdSubTab} tabs={[
            { id: 'leaderboard' as const, label: 'Leaderboard', icon: Trophy },
            { id: 'details' as const, label: 'Staff Details', icon: Users },
            { id: 'manage' as const, label: 'Manage Results', icon: FileText },
            ...(isMarketingAdmin ? [{ id: 'highlights' as const, label: 'Social Media Highlights', icon: Sparkles }] : []),
            ...(isAdmin ? [{ id: 'settings' as const, label: 'Results Settings', icon: Settings }] : []),
          ]} />

          {/* Filters — they drive the Leaderboard and Staff Details views */}
          {(rdSubTab === 'leaderboard' || rdSubTab === 'details') && (
            <div className="rounded-xl px-3 py-3 flex flex-wrap items-center gap-2" style={CARD_STYLE}>
              {resultsDash?.isMainAdmin && (
                <select value={rdFilterBranch} onChange={e => setRdFilterBranch(e.target.value)} aria-label="Branch"
                  className={CONTROL} style={controlStyle(!!rdFilterBranch)}>
                  <option value="">All Branches</option>
                  {resultsDash?.availableBranches.map(b => (
                    <option key={b} value={b}>{branchLabel(b) || b}</option>
                  ))}
                </select>
              )}
              {(resultsDash?.departments.length ?? 0) > 1 && (
                <select value={rdFilterDept} onChange={e => setRdFilterDept(e.target.value)} aria-label="Department"
                  className={CONTROL} style={controlStyle(!!rdFilterDept)}>
                  <option value="">All Departments</option>
                  {resultsDash?.departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              <select value={rdFilterStaff} onChange={e => setRdFilterStaff(e.target.value)} aria-label="Staff"
                className={`${CONTROL} max-w-[14rem]`} style={controlStyle(!!rdFilterStaff)}>
                <option value="">All Staff</option>
                {(resultsDash?.staffOptions ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.department})</option>
                ))}
              </select>
              <select value={rdFilterMonth} onChange={e => setRdFilterMonth(Number(e.target.value))} aria-label="Month"
                className={CONTROL} style={controlStyle(!!rdFilterMonth)}>
                <option value={0}>All Months</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                  <option key={m} value={m}>{new Date(2025, m - 1).toLocaleString('en', { month: 'long' })}</option>
                ))}
              </select>

              {/* Answered between. Overrides the year the rest of this view runs
                  on, so it can answer "anything this week" rather than only
                  "any January". */}
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Answered</span>
                <input type="date" value={rdFrom} onChange={e => setRdFrom(e.target.value)}
                  title="Answered from" aria-label="Answered from"
                  className={`${CONTROL} px-2`} style={controlStyle(!!rdFrom)} />
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
                <input type="date" value={rdTo} onChange={e => setRdTo(e.target.value)}
                  title="Answered to" aria-label="Answered to"
                  className={`${CONTROL} px-2`} style={controlStyle(!!rdTo)} />
              </div>

              {rdFiltersOn && (
                <button onClick={clearRdFilters}
                  className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-semibold hover:bg-gray-50" style={{ color: 'var(--teal)' }}>
                  <X size={12} /> Clear filters
                </button>
              )}

              <span className="ml-auto text-xs whitespace-nowrap pl-2 flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
                {resultsLoading ? <><Loader2 size={12} className="animate-spin" /> Updating…</> : resultsDash ? (
                  <><span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{detailStaff.length}</span> staff with results</>
                ) : null}
              </span>
            </div>
          )}

          {resultsLoading && !resultsDash && (rdSubTab === 'leaderboard' || rdSubTab === 'details') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl p-5" style={CARD_STYLE}>
                  <Skeleton className="h-4 w-40 mb-4" />
                  <BarListSkeleton rows={5} />
                </div>
              ))}
            </div>
          )}

          {resultsFailed && !resultsLoading && !resultsDash && (rdSubTab === 'leaderboard' || rdSubTab === 'details') && (
            <ErrorCard title="Couldn't load survey results"
              hint="Check your connection and try again."
              onRetry={() => loadResultsDashboard(rdFilterBranch, rdFilterStaff, rdFilterMonth, rdFrom, rdTo)} />
          )}

          {/* ── Leaderboard ── */}
          {rdSubTab === 'leaderboard' && resultsDash && (
            <div className={`space-y-5 transition-opacity ${resultsLoading ? 'opacity-60' : ''}`}>
              <DashCard title="Top 5 — Overall" icon={<Trophy size={15} />}
                description="Ranked by composite score (see Results Settings for the weights). Ties share a rank.">
                {resultsDash.top5Overall.length > 0 ? (
                  <LeaderboardGroupList performers={resultsDash.top5Overall} />
                ) : (
                  <EmptyState title="No completed surveys yet" hint={rdFiltersOn ? 'Nothing matches these filters — try widening them.' : 'Scores appear once patients submit surveys.'} />
                )}
              </DashCard>

              {deptBoards.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {deptBoards.map(([dept, list]) => (
                    <DashCard key={dept} title={`Top 5 — ${dept}`} icon={<Award size={15} />}>
                      {list.length > 0 ? (
                        <LeaderboardGroupList performers={list} />
                      ) : (
                        <EmptyState title="No data" />
                      )}
                    </DashCard>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Staff Details ── */}
          {rdSubTab === 'details' && resultsDash && (
            <DashCard title="Staff details" icon={<Users size={15} />} flush
              description="Highest composite score first. Click a row for monthly ratings, patient feedback and a PDF."
              className={`transition-opacity ${resultsLoading ? 'opacity-60' : ''}`}>
              {detailStaff.length > 0 ? (
                <ul>
                  {detailStaff.map((s, idx) => {
                    const isExpanded = expandedStaff === s.id
                    return (
                      <li key={s.id} style={{ borderTop: idx === 0 ? undefined : '1px solid #EEF2F1' }}>
                        <button type="button" aria-expanded={isExpanded}
                          onClick={() => setExpandedStaff(isExpanded ? null : s.id)}
                          className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-[#F8FAF9] transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{s.name}</span>
                              <Chip>{s.department}</Chip>
                              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{branchLabel(s.branch) || s.branch}</span>
                            </div>
                            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
                              <RatingPill value={s.avgRating} />
                              <span className="flex items-center gap-1"><Calendar size={11} /> {s.sessionsTotal} sessions{rdFilterMonth ? ` (${s.sessionsMonth} this month)` : ''}</span>
                              <span className="flex items-center gap-1"><ClipboardCheck size={11} /> {s.surveyCount} surveys</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xl font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{s.compositeScore}</div>
                            <div className="text-[10px] uppercase font-semibold tracking-wider mt-1" style={{ color: 'var(--mid-gray)' }}>Score</div>
                          </div>
                          {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={16} style={{ color: 'var(--mid-gray)' }} />}
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-5 pt-1 space-y-4" style={{ background: '#FBFCFC' }}>
                            <div className="flex justify-end">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  generateSurveyResultPDF({
                                    staffName: s.name,
                                    department: s.department,
                                    branch: s.branch,
                                    avgRating: s.avgRating,
                                    sessionsTotal: s.sessionsTotal,
                                    sessionsRescheduled: s.sessionsRescheduled,
                                    sessionsCancelled: s.sessionsCancelled,
                                    compositeScore: s.compositeScore,
                                    surveyCount: s.surveyCount,
                                    monthlyRatings: s.monthlyRatings,
                                    feedback: s.feedback,
                                    filterMonthLabel: rdFilterMonth ? 'Month ' + rdFilterMonth : undefined,
                                  })
                                }}
                                className={BTN_SECONDARY} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}
                                title="Download results as PDF">
                                <Download size={12} /> Download PDF
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <MiniStat label="Avg rating" value={s.avgRating.toFixed(2)} sub={ratingBand(s.avgRating).label} accent={ratingBand(s.avgRating).fg} />
                              <MiniStat label={rdFilterMonth ? 'Sessions (month)' : 'Sessions (year)'} value={String(rdFilterMonth ? s.sessionsMonth : s.sessionsTotal)} />
                              <MiniStat label="Surveys completed" value={String(s.surveyCount)} />
                            </div>

                            {s.monthlyRatings.length > 0 && (
                              <div>
                                <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>
                                  <TrendingUp size={13} style={{ color: 'var(--teal)' }} /> Monthly rating trend
                                </p>
                                <div className="flex items-end gap-1.5 h-28 rounded-lg p-3 pt-6" style={{ background: '#fff', border: '1px solid #EEF2F1' }}>
                                  {s.monthlyRatings.map(mr => {
                                    const pct = (mr.avgRating / 5) * 100
                                    const b = ratingBand(mr.avgRating)
                                    return (
                                      <div key={mr.month} tabIndex={0} className="group relative flex-1 h-full flex flex-col items-center justify-end gap-1 outline-none min-w-0">
                                        <span className="text-[10px] font-semibold" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{mr.avgRating.toFixed(1)}</span>
                                        <div className="w-full max-w-[28px] rounded-t" style={{ height: `${pct}%`, background: b.bar, minHeight: 4 }} />
                                        <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{monthShort(mr.month)}</span>
                                        <RowTip>
                                          <div className="font-semibold">{monthLong(mr.month)}</div>
                                          <div>Average {mr.avgRating.toFixed(2)} / 5 · {b.label}</div>
                                        </RowTip>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {(s.feedback.strengths.length > 0 || s.feedback.improvements.length > 0 || s.feedback.other.length > 0) && (
                              <div>
                                <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>
                                  <MessageSquare size={13} style={{ color: 'var(--teal)' }} /> Patient feedback summary
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {s.feedback.strengths.length > 0 && (
                                    <FeedbackList title="Strengths" icon={<ThumbsUp size={12} />} fg="#15803D" bg="#F0FDF4" border="#BBF7D0" items={s.feedback.strengths} />
                                  )}
                                  {s.feedback.improvements.length > 0 && (
                                    <FeedbackList title="Areas for improvement" icon={<AlertTriangle size={12} />} fg="#B45309" bg="#FFFBEB" border="#FDE68A" items={s.feedback.improvements} />
                                  )}
                                  {s.feedback.other.length > 0 && (
                                    <FeedbackList title="Other comments" icon={<MessageSquare size={12} />} fg="var(--mid-gray)" bg="#F8FAF9" border="#E5E7EB" items={s.feedback.other} wide />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState title="No survey results yet" hint={rdFiltersOn ? 'Nothing matches these filters — try widening them.' : 'Results appear once patients submit surveys.'} />
              )}
            </DashCard>
          )}

          {/* ── Manage Results (delete entries) ── */}
          {rdSubTab === 'manage' && (
            <DashCard title="Manage survey entries" icon={<FileText size={15} />} flush
              description="The 100 most recent survey assignments and responses. Admin users can delete entries."
              action={!resultsListLoading && results.length > 0
                ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}><span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{results.length}</span> entries</span>
                : undefined}>
              {resultsListLoading && results.length === 0 ? (
                <div className="p-5 space-y-3" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3.5 w-28 hidden sm:block" />
                      <Skeleton className="h-3.5 w-12" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-3.5 flex-1" />
                    </div>
                  ))}
                </div>
              ) : results.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--light-gray)', background: '#F8FAF9' }}>
                        {['Staff', 'Patient', 'Type', 'Status', 'Date'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                        ))}
                        <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(r => (
                        <tr key={r.id} className="hover:bg-[#F8FAF9]" style={{ borderBottom: '1px solid #EEF2F1' }}>
                          <td className="px-4 py-2.5">
                            <span className="font-medium block" style={{ color: 'var(--charcoal)' }}>{r.staffName}</span>
                            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{r.staffDept}</span>
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--charcoal)' }}>{r.patientName || <span style={{ color: 'var(--mid-gray)' }}>—</span>}</td>
                          <td className="px-4 py-2.5"><Chip>{r.surveyType}</Chip></td>
                          <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                            {r.submittedAt ? fmtDate(r.submittedAt) : fmtDate(r.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => deleteResult(r.id)} disabled={deletingId === r.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors hover:bg-red-50 disabled:opacity-50"
                              style={{ color: '#DC2626' }}>
                              {deletingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                              {deletingId === r.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No survey results yet" hint="Survey assignments and responses will be listed here." />
              )}
            </DashCard>
          )}

          {/* ── Social Media Highlights (Marketing Admin only) ── */}
          {rdSubTab === 'highlights' && isMarketingAdmin && (
            <DashCard title="Social media highlights" icon={<Sparkles size={15} />}
              description="Positive patient feedback compiled from satisfaction surveys — ready to post. Use Copy for post on any quote."
              action={!highlightsLoading && highlights.length > 0
                ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}><span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{highlights.length}</span> quotes</span>
                : undefined}>
              {highlightsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-hidden>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #EEF2F1' }}>
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-4/5 mt-2" />
                      <Skeleton className="h-3 w-1/2 mt-4" />
                    </div>
                  ))}
                </div>
              ) : highlights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {highlights.map((h, i) => (
                    <figure key={i} className="rounded-xl p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm"
                      style={{ background: '#fff', border: '1px solid #E5ECEA' }}>
                      <blockquote className="text-sm leading-relaxed pl-3" style={{ color: 'var(--charcoal)', borderLeft: '3px solid var(--gold)' }}>
                        &ldquo;{h.feedback}&rdquo;
                      </blockquote>
                      <figcaption className="flex items-end justify-between gap-3 mt-auto">
                        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs" style={{ color: 'var(--mid-gray)' }}>
                          <span className="font-semibold" style={{ color: 'var(--teal)' }}>Re: {h.staffName}</span>
                          <Chip>{h.department}</Chip>
                          <span>{branchLabel(h.branch) || h.branch}</span>
                          {h.avgRating !== null && <RatingPill value={h.avgRating} digits={1} />}
                          <span>{new Date(h.submittedAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</span>
                        </div>
                        <button
                          onClick={() => {
                            const text = `"${h.feedback}"\n\n— Patient feedback for ${h.staffName} (${h.department}), Sapphire Clinics East`
                            navigator.clipboard.writeText(text)
                            setCopiedIdx(i)
                            setTimeout(() => setCopiedIdx(null), 2000)
                          }}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors"
                          style={copiedIdx === i
                            ? { background: '#DCFCE7', color: '#15803D' }
                            : { background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                          {copiedIdx === i ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy for post</>}
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <EmptyState title="No positive feedback collected yet"
                  hint="Highlights will appear here once patients submit surveys with strengths/accomplishments." />
              )}
            </DashCard>
          )}

          {/* ── Results Settings (read-only, managed from HR platform) ── */}
          {rdSubTab === 'settings' && isAdmin && (
            <DashCard title="Leaderboard scoring weights" icon={<Settings size={15} />}
              description="How each staff member's composite score is weighted.">
              <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                <Building2 size={14} className="flex-shrink-0" />
                These settings are managed by the HR Department at hr.sapphireclinicseast.org
              </div>

              {settingsLoading ? (
                <BarListSkeleton rows={4} />
              ) : (
                <div className="space-y-4">
                  {([
                    { key: 'weightConfirmed' as const, label: 'Confirmed Sessions', desc: 'Sessions with CONFIRMED status (positive effect)' },
                    { key: 'weightRescheduled' as const, label: 'Rescheduled Sessions', desc: 'Sessions with RESCHEDULED status (negative effect)' },
                    { key: 'weightCancelled' as const, label: 'Cancelled Sessions', desc: 'Fewer cancellations = higher score (negative effect)' },
                    { key: 'weightSatisfaction' as const, label: 'Avg Satisfaction Score', desc: 'Average patient satisfaction rating out of 5 (positive effect)' },
                  ]).map(({ key, label, desc }) => (
                    <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{label}</p>
                        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{desc}</p>
                      </div>
                      <div className="hidden sm:block h-2 rounded-full overflow-hidden" style={{ background: '#EEF2F1' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, settingsWeights[key])}%`, background: 'var(--teal)' }} />
                      </div>
                      <span className="text-sm font-bold text-right min-w-[3.5rem]" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                        {settingsWeights[key]}%
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Total</span>
                    <span className="text-lg font-bold" style={{ color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>
                      {settingsWeights.weightConfirmed + settingsWeights.weightRescheduled + settingsWeights.weightCancelled + settingsWeights.weightSatisfaction}%
                    </span>
                  </div>
                </div>
              )}
            </DashCard>
          )}
        </div>
      )}

      {/* ── QR Code Modal ── */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={MODAL_BACKDROP}
          onClick={e => { if (e.target === e.currentTarget) setShowQr(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="qr-title" className="rounded-2xl p-6 sm:p-8 w-full max-w-md text-center" style={{ background: '#fff' }}>
            <h3 id="qr-title" className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Scan to Take Survey</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--mid-gray)' }}>Ask the patient to scan this QR code with the clinic tablet.</p>
            {qrType && <p className="mb-4"><Chip>{qrType}</Chip></p>}
            <div ref={qrRef} className="w-[220px] h-[220px] mx-auto mb-4 p-2.5 rounded-xl flex items-center justify-center" style={{ border: '1px solid var(--light-gray)' }} />
            <p className="text-xs mb-5 break-all" style={{ color: 'var(--mid-gray)' }}>{qrUrl}</p>
            <button onClick={() => setShowQr(false)} className={`${BTN_PRIMARY} mx-auto`} style={{ background: 'var(--teal)' }}>
              <X size={15} /> Close
            </button>
          </div>
        </div>
      )}

      {/* QRCode CDN */}
      <Script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js" strategy="lazyOnload" />

      {/* ── Pending Surveys Modal ── */}
      {showPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={MODAL_BACKDROP}
          onClick={e => { if (e.target === e.currentTarget) setShowPending(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="pending-title" className="rounded-2xl w-full max-w-lg flex flex-col" style={{ background: '#fff', maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <h3 id="pending-title" className="text-base font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <Clock size={16} style={{ color: 'var(--teal)' }} />
                Pending Surveys
                {!pendingLoading && pendingList.length > 0 && <Chip tone="gray">{pendingList.length}</Chip>}
              </h3>
              <button onClick={() => setShowPending(false)} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
                <X size={18} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {pendingLoading && pendingList.length === 0 ? (
                <div className="space-y-2" aria-hidden>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ border: '1px solid #EEF2F1' }}>
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-56 mt-2" />
                    </div>
                  ))}
                </div>
              ) : pendingList.length > 0 ? (
                <div className="space-y-2">
                  {pendingList.map(p => (
                    <div key={p.id} className="rounded-lg p-3" style={{ border: '1px solid #E5ECEA' }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{p.staffName}</span>
                        <Chip>{p.surveyType}</Chip>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {p.staffDept} · {branchLabel(p.branch) || p.branch}
                        {p.patientName && ` · Patient: ${p.patientName}`}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                          Expires {new Date(p.expiresAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <a href={`https://survey.sapphireclinicseast.org?id=${p.id}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
                          Open Survey <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No pending surveys" hint="Every assigned survey has been answered or has expired." />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal bars for average rating (out of 5), coloured by band. */
function ScoreBars({ rows, empty }: {
  rows: { key: string; label: string; fullLabel: string; avg: number; count: number }[]
  empty: string
}) {
  if (rows.length === 0) return <EmptyState title={empty} hint="Bars appear once patients submit ratings." />
  return (
    <div className="space-y-2.5">
      {rows.map(r => {
        const b = ratingBand(r.avg)
        return (
          <div key={r.key} tabIndex={0}
            className="group relative grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--light-gray)]">
            <span className="col-span-2 sm:col-span-1 text-xs leading-snug break-words" style={{ color: 'var(--charcoal)' }}>{r.label}</span>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: '#EEF2F1' }}>
              <div className="h-full rounded-full" style={{ width: `${(r.avg / 5) * 100}%`, background: b.bar }} />
            </div>
            <span className="text-xs whitespace-nowrap text-right" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
              <strong className="font-semibold">{r.avg.toFixed(1)}</strong>
              <span style={{ color: 'var(--mid-gray)' }}> · {r.count}</span>
            </span>
            <RowTip>
              <div className="font-semibold mb-0.5">{r.fullLabel}</div>
              <div>Average <strong>{r.avg.toFixed(2)}</strong> / 5 · <span style={{ color: b.fg }}>{b.label}</span></div>
              <div style={{ color: 'var(--mid-gray)' }}>{r.count.toLocaleString()} {r.count === 1 ? 'response' : 'responses'}</div>
            </RowTip>
          </div>
        )
      })}
    </div>
  )
}

function ScoreLegend() {
  const bands = [
    { v: 4.5, range: '4.5 – 5' }, { v: 4, range: '4 – 4.49' }, { v: 3, range: '3 – 3.99' }, { v: 1, range: 'Below 3' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
      <span className="font-semibold uppercase tracking-wider">Rating bands</span>
      {bands.map(({ v, range }) => {
        const b = ratingBand(v)
        return (
          <span key={range} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.bar }} />
            <span style={{ color: 'var(--charcoal)' }}>{b.label}</span> {range}
          </span>
        )
      })}
      <span>· the number after each average is its response count</span>
    </div>
  )
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: '#fff', border: '1px solid #EEF2F1' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-lg font-bold leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p className="text-[11px] font-semibold" style={{ color: accent ?? 'var(--mid-gray)' }}>{sub}</p>}
    </div>
  )
}

function FeedbackList({ title, icon, fg, bg, border, items, wide }: {
  title: string; icon: ReactNode; fg: string; bg: string; border: string; items: string[]; wide?: boolean
}) {
  return (
    <div className={`rounded-lg p-3 ${wide ? 'md:col-span-2' : ''}`} style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: fg }}>
        {icon} {title} <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>· {items.length}</span>
      </p>
      <ul className="space-y-1 list-disc pl-4">
        {items.map((fb, i) => (
          <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--charcoal)' }}>{fb}</li>
        ))}
      </ul>
    </div>
  )
}

function LeaderStats({ p }: { p: TopPerformer }) {
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
      <Chip>{p.department}</Chip>
      <span>{branchLabel(p.branch) || p.branch}</span>
      <RatingPill value={p.avgRating} />
      <span className="flex items-center gap-1"><Calendar size={10} /> {p.sessionsTotal} sessions</span>
      <span className="flex items-center gap-1"><ClipboardCheck size={10} /> {p.surveyCount} surveys</span>
    </div>
  )
}

// Renders top-5 as distinct-score rank buckets. A bucket with >1 member shows
// a single collapsed row with comma-joined names; clicking expands it into
// individual rows for the tied people.
function LeaderboardGroupList({ performers }: { performers: TopPerformer[] }) {
  const [expandedRank, setExpandedRank] = useState<number | null>(null)
  // Group by distinct score, keeping the order (already sorted desc on the server)
  const groups: { rank: number; score: number; members: TopPerformer[] }[] = []
  const seenScores: number[] = []
  for (const p of performers) {
    if (seenScores.length === 0 || p.compositeScore !== seenScores[seenScores.length - 1]) {
      seenScores.push(p.compositeScore)
      groups.push({ rank: seenScores.length, score: p.compositeScore, members: [p] })
    } else {
      groups[groups.length - 1].members.push(p)
    }
  }

  const medalColors = ['#D99A1E', '#94A3B8', '#B87333'] // gold, silver, bronze

  return (
    <ol className="space-y-2">
      {groups.map(g => {
        const tied = g.members.length > 1
        const expanded = expandedRank === g.rank
        const medal = g.rank <= 3 ? medalColors[g.rank - 1] : undefined
        const names = g.members.map(m => m.name).join(', ')
        return (
          <li key={'g' + g.rank} className="rounded-lg overflow-hidden"
            style={{ background: g.rank === 1 ? '#FFFBEB' : '#F8FAF9', border: `1px solid ${g.rank === 1 ? '#FDE68A' : '#EEF2F1'}` }}>
            {(() => {
              const content = (
                <>
              <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-sm"
                style={medal ? { background: medal + '22', color: medal } : { background: '#EEF2F1', color: 'var(--mid-gray)' }}>
                {g.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{names}</span>
                  {tied && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                      Tied · {g.members.length} people
                    </span>
                  )}
                </div>
                {tied ? (
                  <div className="flex items-center gap-1 text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {expanded ? 'Hide details' : 'Tap to see individual stats'}
                  </div>
                ) : (
                  <LeaderStats p={g.members[0]} />
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xl font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{g.score}</div>
                <div className="text-[10px] uppercase font-semibold tracking-wider mt-1" style={{ color: 'var(--mid-gray)' }}>Score</div>
              </div>
                </>
              )
              return tied ? (
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedRank(expanded ? null : g.rank)}
                  className="w-full text-left flex items-center gap-3 p-3 hover:bg-black/[0.02]">
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3">{content}</div>
              )
            })()}

            {tied && expanded && (
              <div className="px-3 pb-3 space-y-2">
                {g.members.map(m => (
                  <div key={m.id} className="p-2.5 rounded-md bg-white" style={{ border: '1px solid #EEF2F1' }}>
                    <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{m.name}</span>
                    <LeaderStats p={m} />
                  </div>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}


// ─── Daily Target Tab ────────────────────────────────────────────────────────

interface DailyTarget {
  assignmentId: string
  staffId: string
  staffName: string
  department: string
  branch: string
  patientId: string
  patientName: string
  patientAge: number | null
  startTime: string
  endTime: string
  sessionType: string
  status: string
  surveyUrl: string
}

function DailyTargetTab({ isAdmin, isFrontDesk, role }: { isAdmin: boolean; isFrontDesk: boolean; role: string }) {
  const defaultBranch = role?.startsWith('SBGH_') ? 'SBGH' : 'SBEA'
  const [branch, setBranch] = useState<string>(defaultBranch)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [date, setDate] = useState('')
  const [targets, setTargets] = useState<DailyTarget[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch(`/api/customer-survey/daily-targets?branch=${branch}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setDate(data.date)
      setTargets(data.targets ?? [])
    } catch (e) {
      setErr((e as Error).message)
    } finally { setLoading(false) }
  }, [branch])

  useEffect(() => { load() }, [load])

  // Render QRs when targets change. Uses global QRCode from Script-loaded CDN.
  useEffect(() => {
    const QRCode = (window as unknown as { QRCode?: { new(el: Element, opts: Record<string, unknown>): unknown } }).QRCode
    if (!QRCode) return
    targets.forEach(t => {
      const el = qrRefs.current[t.assignmentId]
      if (!el) return
      el.innerHTML = ''
      new QRCode(el, { text: t.surveyUrl, width: 128, height: 128, colorDark: '#0f766e', colorLight: '#ffffff' })
    })
  }, [targets])

  function print() {
    window.print()
  }

  function copyLink(id: string, url: string) {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 2000)
  }

  const byStatus = {
    pending: targets.filter(t => t.status === 'PENDING').length,
    completed: targets.filter(t => t.status === 'COMPLETED').length,
  }
  const firstLoad = loading && targets.length === 0

  return (
    <div className="space-y-5">
      <Script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js" strategy="afterInteractive" />

      {/* Toolbar (a div, not <header>, so it still prints) */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3" style={CARD_STYLE}>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold flex items-center gap-2 flex-wrap" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Target size={15} style={{ color: 'var(--teal)' }} />
            Daily targets
            {date && <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>· {date}</span>}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            Today&apos;s randomized patients for the satisfaction survey. QR codes are ready — hand off to clinic aides or print for the day.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(isAdmin || (!isFrontDesk && !role?.startsWith('SBEA_') && !role?.startsWith('SBGH_'))) && (
            <select value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch"
              className={CONTROL} style={CONTROL_STYLE}>
              <option value="SBEA">East Branch</option>
              <option value="SBGH">Greenhills Branch</option>
            </select>
          )}
          <button onClick={load} disabled={loading} className={BTN_SECONDARY} style={CONTROL_STYLE}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={print} disabled={targets.length === 0} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            <Printer size={14} /> Print All
          </button>
        </div>
      </div>

      {err && (
        <ErrorCard title="Couldn't load today's targets" hint={err} onRetry={load} />
      )}

      {!err && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {firstLoad ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12 mt-2" />
              </div>
            ))
          ) : (
            <>
              <KpiCard label="Total targets" icon={<Target size={16} />} value={targets.length} sub="Scheduled today" />
              <KpiCard label="Pending" icon={<Clock size={16} />} accent="#D97706" value={byStatus.pending} sub="Not yet answered" />
              <KpiCard label="Completed" icon={<Check size={16} />} accent="#16A34A" value={byStatus.completed} sub="Survey submitted" />
              <KpiCard label="Completion rate" icon={<BarChart3 size={16} />}
                value={targets.length === 0 ? '0%' : `${Math.round((byStatus.completed / targets.length) * 100)}%`}
                sub="Of today's targets" />
            </>
          )}
        </div>
      )}

      {firstLoad && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden" style={CARD_STYLE}>
              <div className="px-4 py-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-4 w-36 mt-2" /></div>
              <Skeleton className="h-40 rounded-none" />
            </div>
          ))}
        </div>
      )}

      {!loading && targets.length === 0 && !err && (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState title="No survey targets today"
            hint="No confirmed appointments scheduled for today, or all staff have met their assessment targets for the year." />
        </div>
      )}

      {targets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 daily-target-grid">
          {targets.map(t => {
            const done = t.status === 'COMPLETED'
            return (
              <div key={t.assignmentId} className="rounded-xl bg-white overflow-hidden daily-target-card flex flex-col"
                style={{ border: `1px solid ${done ? '#BBF7D0' : 'var(--light-gray)'}` }}>
                <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ background: done ? '#F0FDF4' : '#F8FAF9', borderBottom: '1px solid #EEF2F1' }}>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                      {t.department} · {t.startTime}–{t.endTime}
                    </div>
                    <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--charcoal)' }}>{t.patientName}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>w/ {t.staffName}</div>
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{
                    background: done ? '#DCFCE7' : '#FEF3C7',
                    color: done ? '#15803D' : '#B45309',
                  }}>
                    {done ? '✓ Done' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-center p-4 flex-1">
                  <div ref={el => { qrRefs.current[t.assignmentId] = el }} />
                </div>
                <div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid #EEF2F1' }}>
                  <button onClick={() => copyLink(t.assignmentId, t.surveyUrl)}
                    className="flex-1 h-8 text-xs font-semibold rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1"
                    style={{ border: '1px solid var(--light-gray)', color: copiedId === t.assignmentId ? '#15803D' : 'var(--charcoal)' }}
                    title="Copy survey link">
                    {copiedId === t.assignmentId ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy link</>}
                  </button>
                  <a href={t.surveyUrl} target="_blank" rel="noreferrer"
                    className="h-8 px-2.5 text-xs rounded-lg hover:bg-gray-50 flex items-center gap-1"
                    style={{ border: '1px solid var(--light-gray)', color: 'var(--teal)' }}
                    title="Open survey" aria-label="Open survey">
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Print-specific styles */}
      <style jsx>{`
        @media print {
          .daily-target-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 12px; }
          .daily-target-card { break-inside: avoid; border: 1px solid #ddd !important; }
          nav, header, button { display: none !important; }
        }
      `}</style>
    </div>
  )
}
