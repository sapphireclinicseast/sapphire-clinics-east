'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Script from 'next/script'
import {
  ClipboardCheck, BarChart3, ListChecks, Star, Target, Clock,
  QrCode, Users, TrendingUp, Building2, X, ChevronUp, ChevronDown,
  ArrowUpDown, ExternalLink, Search, Baby, User, Trash2, FileText,
  Trophy, Award, MessageSquare, Calendar, Filter, ThumbsUp, AlertTriangle,
  Sparkles, Copy, Check, Settings, Save, RefreshCw, Printer, Download,
} from 'lucide-react'
import { generateSurveyResultPDF } from '@/lib/pdf-results'

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

// ── Main Component ───────────────────────────────────────────────────────────

export default function SurveyClient({ role }: { role: string }) {
  const [tab, setTab] = useState<'overview' | 'daily-target' | 'manage' | 'results'>('overview')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Filters
  const [filterDept, setFilterDept] = useState('')
  const [filterBranch, setFilterBranch] = useState('')

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
  const [showPending, setShowPending] = useState(false)

  // Results (admin only)
  const [results, setResults] = useState<ResultRow[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Results dashboard
  const [resultsDash, setResultsDash] = useState<ResultsDashboard | null>(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [rdFilterBranch, setRdFilterBranch] = useState('')
  const [rdFilterStaff, setRdFilterStaff] = useState('')
  const [rdFilterMonth, setRdFilterMonth] = useState(0) // 0 = all
  const [rdFilterDept, setRdFilterDept] = useState('')
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
    try {
      const res = await fetch('/api/customer-survey?view=staff')
      if (!res.ok) throw new Error('Failed to load')
      setStaff(await res.json())
    } catch { /* handled by error state */ }
  }, [])

  useEffect(() => {
    if (tab === 'manage') loadStaff()
  }, [tab, loadStaff])

  // ── Load results (admin) ────────────────────────────────────────────────
  const loadResults = useCallback(async () => {
    try {
      const res = await fetch('/api/customer-survey?view=results')
      if (!res.ok) return
      setResults(await res.json())
    } catch { /* silent */ }
  }, [])

  const loadResultsDashboard = useCallback(async (branch?: string, staffId?: string, month?: number) => {
    setResultsLoading(true)
    try {
      const params = new URLSearchParams({ view: 'results-dashboard' })
      if (branch) params.set('branch', branch)
      if (staffId) params.set('staffId', staffId)
      if (month) params.set('month', String(month))
      const res = await fetch(`/api/customer-survey?${params}`)
      if (!res.ok) return
      setResultsDash(await res.json())
    } catch { /* silent */ } finally {
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
      loadResultsDashboard(rdFilterBranch, rdFilterStaff, rdFilterMonth)
    } catch {
      setSettingsMsg({ type: 'error', text: 'Network error' })
    } finally {
      setSettingsSaving(false)
    }
  }

  useEffect(() => {
    if (tab === 'results' && isAdmin) {
      loadResultsDashboard(rdFilterBranch, rdFilterStaff, rdFilterMonth)
      if (rdSubTab === 'manage') loadResults()
      if (rdSubTab === 'highlights' && isMarketingAdmin) loadHighlights()
      if (rdSubTab === 'settings' && isAdmin) loadSettings()
    }
  }, [tab, isAdmin, isMarketingAdmin, rdFilterBranch, rdFilterStaff, rdFilterMonth, rdSubTab, loadResultsDashboard, loadResults, loadHighlights, loadSettings])

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
    try {
      const res = await fetch('/api/customer-survey?view=pending')
      if (!res.ok) return
      setPendingList(await res.json())
    } catch { /* silent */ }
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
      const selectedStaff = staff.find(s => s.id === staffId)
      const patientAge = selectedPatient.dob ? getAge(selectedPatient.dob) : (assignPatientType === 'PEDIATRIC' ? 5 : 25)
      const res = await fetch('/api/customer-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId,
          patientId: selectedPatient.id,
          patientName: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
          patientAge,
          branch: selectedStaff?.branch ?? 'SBEA',
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
    if (sortKey !== col) return <ArrowUpDown size={12} style={{ color: '#cbd5e1' }} />
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ color: '#0f766e' }} />
      : <ChevronDown size={12} style={{ color: '#0f766e' }} />
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

  // ── Get unique departments for filter ────────────────────────────────────
  const departments = [...new Set(staff.map(s => s.department))].sort()
  const branches = [...new Set(staff.map(s => s.branch))].sort()

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'daily-target' as const, label: 'Daily Target', icon: Target },
    { id: 'manage' as const, label: 'Manage', icon: ListChecks },
    ...(isAdmin ? [{ id: 'results' as const, label: 'Results', icon: FileText }] : []),
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal, #0f766e)', color: '#fff' }}>
          <ClipboardCheck size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--near-black, #1a1a2e)' }}>Customer Survey</h1>
          <p className="text-xs" style={{ color: '#94a3b8' }}>Patient satisfaction assessment management</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg mb-6" style={{ background: '#f1f5f9' }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all"
            style={tab === id
              ? { background: '#fff', color: '#0f766e', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontWeight: 600 }
              : { background: 'transparent', color: '#64748b' }
            }
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={ClipboardCheck} label="Total Surveys" value={loading ? '—' : dashboard?.totalSurveys ?? 0} />
            <KpiCard icon={Star} label="Avg. Score /5" value={loading ? '—' : dashboard?.avgScore?.toFixed(2) ?? '—'} />
            <KpiCard icon={Target} label="Completion Rate" value={loading ? '—' : dashboard ? `${dashboard.completionRate}%` : '—'} />
            <KpiCard
              icon={Clock}
              label="Pending"
              value={loading ? '—' : dashboard?.pending ?? 0}
              onClick={() => { setShowPending(true); loadPending() }}
              clickable
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Satisfaction Trend" icon={TrendingUp} data={dashboard?.monthlyTrend} />
            <ChartCard title="By Branch" icon={Building2} data={dashboard?.byBranch} />
          </div>
        </div>
      )}

      {/* Manage Tab */}
      {tab === 'daily-target' && (
        <DailyTargetTab isAdmin={isAdmin} isFrontDesk={isFrontDesk} role={role} />
      )}

      {tab === 'manage' && (
        <div className="space-y-6">
          {/* Assessment Schedule — sortable/filterable table */}
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} style={{ color: '#0f766e' }} />
              <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>Assessment Schedule</h3>
            </div>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
              Track staff assessment progress. {isFrontDesk ? 'Showing front desk staff at your branch.' : 'Showing all staff.'}
            </p>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {!isFrontDesk && (
                <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
            </div>

            {filteredStaff.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      {([
                        ['name', 'Staff'],
                        ['department', 'Role'],
                        ['branch', 'Branch'],
                        ['progress', 'Progress'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th key={key}
                          onClick={() => toggleSort(key)}
                          className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50"
                          style={{ color: sortKey === key ? '#0f766e' : '#94a3b8' }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            <SortIcon col={key} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map(s => {
                      const pct = Math.min(100, (s.completed / (s.targetCount || 1)) * 100)
                      return (
                        <tr key={s.id} className="hover:bg-teal-50/50" style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td className="py-2.5 px-3 font-medium" style={{ color: '#1e293b' }}>{s.name}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                              {s.department}
                            </span>
                          </td>
                          <td className="py-2.5 px-3" style={{ color: '#64748b' }}>
                            {s.branch === 'SBEA' ? 'East Branch' : s.branch === 'SBGH' ? 'Greenhills' : s.branch}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f1f5f9', minWidth: 80 }}>
                                <div className="h-full rounded-full transition-all" style={{
                                  width: `${pct}%`,
                                  background: s.completed >= s.targetCount ? '#10b981' : '#0f766e',
                                }} />
                              </div>
                              <span className="text-xs font-semibold whitespace-nowrap" style={{
                                color: s.completed >= s.targetCount ? '#10b981' : '#64748b',
                                minWidth: 40, textAlign: 'right',
                              }}>
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
              <p className="text-sm text-center py-6" style={{ color: '#94a3b8' }}>
                {staff.length === 0 ? 'Loading staff data...' : 'No staff match the current filters.'}
              </p>
            )}
          </div>

          {/* Manual Assignment */}
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={16} style={{ color: '#0f766e' }} />
              <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>Manual Survey Assignment</h3>
            </div>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>Generate a QR code for a patient to take a survey.</p>

            {/* Patient Type Toggle */}
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-2" style={{ color: '#64748b' }}>Patient Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setAssignPatientType('PEDIATRIC'); setSelectedPatient(null); setPatientQuery('') }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={assignPatientType === 'PEDIATRIC'
                    ? { background: '#0f766e', color: '#fff' }
                    : { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }
                  }
                >
                  <Baby size={15} />
                  Pedia (Under 18)
                </button>
                <button
                  onClick={() => { setAssignPatientType('ADULT'); setSelectedPatient(null); setPatientQuery('') }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={assignPatientType === 'ADULT'
                    ? { background: '#0f766e', color: '#fff' }
                    : { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }
                  }
                >
                  <User size={15} />
                  Adult (18+)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Staff Member</label>
                <select value={assignStaff} onChange={e => setAssignStaff(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">Select staff...</option>
                  {filteredStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.department})</option>)}
                </select>
              </div>
              <div ref={patientSearchRef} className="relative">
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>
                  Patient Name
                  <span className="font-normal ml-1" style={{ color: '#94a3b8' }}>(search from Patient CRM)</span>
                </label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={e => handlePatientQueryChange(e.target.value)}
                    onFocus={() => { if (patientQuery.length >= 2) setShowPatientDropdown(true) }}
                    placeholder={`Search ${assignPatientType === 'PEDIATRIC' ? 'pedia' : 'adult'} patients...`}
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}
                  />
                </div>
                {/* Selected patient badge */}
                {selectedPatient && (
                  <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs" style={{ background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e' }}>
                    <span className="font-semibold">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                    {selectedPatient.dob && (
                      <span style={{ color: '#64748b' }}>
                        Age: {getAge(selectedPatient.dob)} &middot; DOB: {new Date(selectedPatient.dob).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    <button onClick={() => { setSelectedPatient(null); setPatientQuery('') }} className="ml-auto">
                      <X size={12} />
                    </button>
                  </div>
                )}
                {/* Search results dropdown */}
                {showPatientDropdown && patientQuery.length >= 2 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                    {patientSearching ? (
                      <div className="px-3 py-3 text-xs text-center" style={{ color: '#94a3b8' }}>Searching...</div>
                    ) : patientResults.length > 0 ? (
                      patientResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectPatient(p)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50 flex items-center justify-between"
                          style={{ borderBottom: '1px solid #f1f5f9' }}
                        >
                          <span className="font-medium" style={{ color: '#1e293b' }}>{p.firstName} {p.lastName}</span>
                          <span className="text-xs" style={{ color: '#94a3b8' }}>
                            {p.dob ? `Age ${getAge(p.dob)}` : 'No DOB'}
                            {p.branches?.length > 0 && ` · ${p.branches.join(', ')}`}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-xs text-center" style={{ color: '#94a3b8' }}>
                        No {assignPatientType === 'PEDIATRIC' ? 'pedia' : 'adult'} patients found for &quot;{patientQuery}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Session Type</label>
                <select value={assignSession} onChange={e => setAssignSession(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                  <option value="individual">Individual Session</option>
                  <option value="group">Group Session</option>
                </select>
              </div>
              {selectedPatient && selectedPatient.dob && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Patient Age (auto-calculated)</label>
                  <div className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4' }}>
                    {getAge(selectedPatient.dob)} years old
                    <span className="ml-2 font-normal" style={{ color: '#64748b' }}>
                      → Survey: {assignSession === 'group' ? 'HR16' : getAge(selectedPatient.dob) < 18 ? 'HR10 (Pedia)' : 'HR11 (Adult)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (!assignStaff) return alert('Please select a staff member')
                if (!selectedPatient) return alert('Please search and select a patient from the CRM')
                createAssignment(assignStaff)
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: '#0f766e' }}
            >
              <QrCode size={15} />
              Generate Survey QR Code
            </button>
          </div>
        </div>
      )}

      {/* Results Tab (Admin / Branch Admin Only) */}
      {tab === 'results' && isAdmin && (
        <div className="space-y-5">
          {/* Filters Bar */}
          <div className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <Filter size={15} style={{ color: '#0f766e' }} />
            <span className="text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Filters</span>

            {resultsDash?.isMainAdmin && (
              <select value={rdFilterBranch} onChange={e => setRdFilterBranch(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="">All Branches</option>
                {resultsDash?.availableBranches.map(b => (
                  <option key={b} value={b}>{b === 'SBEA' ? 'East Branch' : b === 'SBGH' ? 'Greenhills' : b}</option>
                ))}
              </select>
            )}

            <select value={rdFilterStaff} onChange={e => setRdFilterStaff(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
              <option value="">All Staff</option>
              {(resultsDash?.staffOptions ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.department})</option>
              ))}
            </select>

            <select value={rdFilterMonth} onChange={e => setRdFilterMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
              <option value={0}>All Months</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{new Date(2025, m - 1).toLocaleString('en', { month: 'long' })}</option>
              ))}
            </select>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#f1f5f9' }}>
            {([
              { id: 'leaderboard' as const, label: 'Leaderboard', icon: Trophy },
              { id: 'details' as const, label: 'Staff Details', icon: Users },
              { id: 'manage' as const, label: 'Manage Results', icon: FileText },
              ...(isMarketingAdmin ? [{ id: 'highlights' as const, label: 'Social Media Highlights', icon: Sparkles }] : []),
              ...(isAdmin ? [{ id: 'settings' as const, label: 'Results Settings', icon: Settings }] : []),
            ]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setRdSubTab(id)}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
                style={rdSubTab === id
                  ? { background: '#fff', color: '#0f766e', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontWeight: 600 }
                  : { background: 'transparent', color: '#64748b' }
                }
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {resultsLoading && (
            <div className="text-center py-12">
              <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0f766e', borderTopColor: 'transparent' }} />
              <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>Loading results...</p>
            </div>
          )}

          {/* ── Leaderboard Sub-tab ── */}
          {rdSubTab === 'leaderboard' && !resultsLoading && resultsDash && (
            <div className="space-y-5">
              {/* Top 5 Overall */}
              <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy size={18} style={{ color: '#f59e0b' }} />
                  <h3 className="font-bold text-sm" style={{ color: '#1e293b' }}>Top 5 Scores — Overall</h3>
                </div>
                {resultsDash.top5Overall.length > 0 ? (
                  <LeaderboardGroupList performers={resultsDash.top5Overall} />
                ) : (
                  <p className="text-sm text-center py-6" style={{ color: '#94a3b8' }}>No completed surveys yet</p>
                )}
              </div>

              {/* Top 5 Per Department */}
              {Object.entries(resultsDash.top5ByDept)
                .filter(([dept]) => !rdFilterDept || dept === rdFilterDept)
                .map(([dept, list]) => (
                <div key={dept} className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Award size={16} style={{ color: '#0f766e' }} />
                    <h3 className="font-bold text-sm" style={{ color: "#1e293b" }}>Top 5 Scores — {dept}</h3>
                  </div>
                  {list.length > 0 ? (
                    <LeaderboardGroupList performers={list} />
                  ) : (
                    <p className="text-sm text-center py-4" style={{ color: '#94a3b8' }}>No data</p>
                  )}
                </div>
              ))}

              {/* Department filter for leaderboard */}
              {(resultsDash.departments.length > 1) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>Show department:</span>
                  <button onClick={() => setRdFilterDept('')}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={!rdFilterDept ? { background: '#0f766e', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                    All
                  </button>
                  {resultsDash.departments.map(d => (
                    <button key={d} onClick={() => setRdFilterDept(d)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={rdFilterDept === d ? { background: '#0f766e', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Staff Details Sub-tab ── */}
          {rdSubTab === 'details' && !resultsLoading && resultsDash && (
            <div className="space-y-3">
              {resultsDash.allStaff.length > 0 ? resultsDash.allStaff
                .filter(s => !rdFilterDept || s.department === rdFilterDept)
                .sort((a, b) => b.compositeScore - a.compositeScore)
                .map(s => {
                  const isExpanded = expandedStaff === s.id
                  return (
                    <div key={s.id} className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                      {/* Summary row */}
                      <div
                        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedStaff(isExpanded ? null : s.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm" style={{ color: '#1e293b' }}>{s.name}</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                              {s.department}
                            </span>
                            <span className="text-xs" style={{ color: '#94a3b8' }}>
                              {s.branch === 'SBEA' ? 'East' : s.branch === 'SBGH' ? 'GH' : s.branch}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs" style={{ color: '#64748b' }}>
                            <span className="flex items-center gap-1"><Star size={11} style={{ color: '#f59e0b' }} /> {s.avgRating.toFixed(2)} avg</span>
                            <span className="flex items-center gap-1"><Calendar size={11} /> {s.sessionsTotal} sessions{rdFilterMonth ? ` (${s.sessionsMonth} this month)` : ''}</span>
                            <span className="flex items-center gap-1"><ClipboardCheck size={11} /> {s.surveyCount} surveys</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold" style={{ color: '#0f766e' }}>{s.compositeScore}</div>
                          <div className="text-[10px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Score</div>
                        </div>
                        {isExpanded ? <ChevronUp size={16} style={{ color: '#94a3b8' }} /> : <ChevronDown size={16} style={{ color: '#94a3b8' }} />}
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                          {/* PDF download */}
                          <div className="flex justify-end pt-3">
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border"
                              style={{ borderColor: '#0f766e', color: '#0f766e', background: '#fff' }}
                              title="Download results as PDF"
                            >
                              <Download size={12} /> Download PDF
                            </button>
                          </div>
                          {/* Stats cards */}
                          <div className="grid grid-cols-3 gap-3 pt-3">
                            <div className="rounded-lg p-3 text-center" style={{ background: '#fffbeb' }}>
                              <Star size={16} className="mx-auto mb-1" style={{ color: '#f59e0b' }} />
                              <div className="text-lg font-bold" style={{ color: '#92400e' }}>{s.avgRating.toFixed(2)}</div>
                              <div className="text-[10px] font-semibold" style={{ color: '#b45309' }}>Avg Rating</div>
                            </div>
                            <div className="rounded-lg p-3 text-center" style={{ background: '#f0fdfa' }}>
                              <Calendar size={16} className="mx-auto mb-1" style={{ color: '#0f766e' }} />
                              <div className="text-lg font-bold" style={{ color: '#0f766e' }}>{rdFilterMonth ? s.sessionsMonth : s.sessionsTotal}</div>
                              <div className="text-[10px] font-semibold" style={{ color: '#0f766e' }}>{rdFilterMonth ? 'Sessions (Month)' : 'Sessions (Year)'}</div>
                            </div>
                            <div className="rounded-lg p-3 text-center" style={{ background: '#eff6ff' }}>
                              <ClipboardCheck size={16} className="mx-auto mb-1" style={{ color: '#2563eb' }} />
                              <div className="text-lg font-bold" style={{ color: '#1e40af' }}>{s.surveyCount}</div>
                              <div className="text-[10px] font-semibold" style={{ color: '#2563eb' }}>Surveys Completed</div>
                            </div>
                          </div>

                          {/* Monthly ratings chart (simple bar) */}
                          {s.monthlyRatings.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <TrendingUp size={13} style={{ color: '#0f766e' }} />
                                <span className="text-xs font-semibold" style={{ color: '#64748b' }}>Monthly Rating Trend</span>
                              </div>
                              <div className="flex items-end gap-1.5 h-16">
                                {s.monthlyRatings.map(mr => {
                                  const pct = (mr.avgRating / 5) * 100
                                  const monthName = new Date(2025, parseInt(mr.month) - 1).toLocaleString('en', { month: 'short' })
                                  return (
                                    <div key={mr.month} className="flex-1 flex flex-col items-center gap-0.5">
                                      <span className="text-[9px] font-semibold" style={{ color: '#64748b' }}>{mr.avgRating.toFixed(1)}</span>
                                      <div className="w-full rounded-t" style={{ height: `${pct}%`, background: '#0f766e', minHeight: 4 }} />
                                      <span className="text-[9px]" style={{ color: '#94a3b8' }}>{monthName}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Feedback summaries */}
                          {(s.feedback.strengths.length > 0 || s.feedback.improvements.length > 0 || s.feedback.other.length > 0) && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <MessageSquare size={13} style={{ color: '#0f766e' }} />
                                <span className="text-xs font-semibold" style={{ color: '#64748b' }}>Patient Feedback Summary</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {s.feedback.strengths.length > 0 && (
                                  <div className="rounded-lg p-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <ThumbsUp size={12} style={{ color: '#16a34a' }} />
                                      <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>Strengths</span>
                                    </div>
                                    <ul className="space-y-1">
                                      {s.feedback.strengths.map((fb, i) => (
                                        <li key={i} className="text-xs" style={{ color: '#374151' }}>&bull; {fb}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {s.feedback.improvements.length > 0 && (
                                  <div className="rounded-lg p-3" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <AlertTriangle size={12} style={{ color: '#d97706' }} />
                                      <span className="text-xs font-semibold" style={{ color: '#d97706' }}>Areas for Improvement</span>
                                    </div>
                                    <ul className="space-y-1">
                                      {s.feedback.improvements.map((fb, i) => (
                                        <li key={i} className="text-xs" style={{ color: '#374151' }}>&bull; {fb}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {s.feedback.other.length > 0 && (
                                  <div className="rounded-lg p-3 md:col-span-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <MessageSquare size={12} style={{ color: '#64748b' }} />
                                      <span className="text-xs font-semibold" style={{ color: '#64748b' }}>Other Comments</span>
                                    </div>
                                    <ul className="space-y-1">
                                      {s.feedback.other.map((fb, i) => (
                                        <li key={i} className="text-xs" style={{ color: '#374151' }}>&bull; {fb}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }) : (
                <p className="text-sm text-center py-12" style={{ color: '#94a3b8' }}>No survey results yet</p>
              )}

              {/* Department filter */}
              {resultsDash.departments.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>Filter department:</span>
                  <button onClick={() => setRdFilterDept('')}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={!rdFilterDept ? { background: '#0f766e', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                    All
                  </button>
                  {resultsDash.departments.map(d => (
                    <button key={d} onClick={() => setRdFilterDept(d)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={rdFilterDept === d ? { background: '#0f766e', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Manage Results Sub-tab (delete entries) ── */}
          {rdSubTab === 'manage' && !resultsLoading && (
            <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
              <div className="flex items-center gap-2 mb-1">
                <FileText size={16} style={{ color: '#0f766e' }} />
                <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>Manage Survey Entries</h3>
              </div>
              <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
                All survey assignments and responses. Admin users can delete entries.
              </p>

              {results.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Staff</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Patient</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Type</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Status</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Date</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50" style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td className="py-2.5 px-3">
                            <span className="font-medium" style={{ color: '#1e293b' }}>{r.staffName}</span>
                            <br />
                            <span className="text-xs" style={{ color: '#94a3b8' }}>{r.staffDept}</span>
                          </td>
                          <td className="py-2.5 px-3" style={{ color: '#64748b' }}>{r.patientName || '—'}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                              {r.surveyType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{
                              background: r.status === 'COMPLETED' ? '#f0fdf4' : r.status === 'EXPIRED' ? '#fef2f2' : '#fffbeb',
                              color: r.status === 'COMPLETED' ? '#16a34a' : r.status === 'EXPIRED' ? '#dc2626' : '#d97706',
                            }}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs" style={{ color: '#64748b' }}>
                            {r.submittedAt
                              ? new Date(r.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                              : new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                            }
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => deleteResult(r.id)}
                              disabled={deletingId === r.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all hover:bg-red-100"
                              style={{ color: '#dc2626', opacity: deletingId === r.id ? 0.5 : 1 }}
                            >
                              <Trash2 size={12} />
                              {deletingId === r.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-center py-6" style={{ color: '#94a3b8' }}>No survey results yet</p>
              )}
            </div>
          )}

          {/* ── Social Media Highlights Sub-tab (Marketing Admin only) ── */}
          {rdSubTab === 'highlights' && isMarketingAdmin && (
            <div className="space-y-4">
              <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #fffbeb 100%)', border: '1px solid #99f6e4' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={18} style={{ color: '#f59e0b' }} />
                  <h3 className="font-bold text-sm" style={{ color: '#1e293b' }}>Social Media Highlights</h3>
                </div>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Positive patient feedback compiled from satisfaction surveys — ready to post on social media. Click to copy.
                </p>
              </div>

              {highlightsLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
                  <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>Loading highlights...</p>
                </div>
              ) : highlights.length > 0 ? (
                <div className="space-y-3">
                  {highlights.map((h, i) => (
                    <div key={i} className="rounded-xl p-5 relative group transition-all hover:shadow-md"
                      style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                      {/* Quote */}
                      <div className="mb-3">
                        <span className="text-3xl leading-none font-serif" style={{ color: '#0f766e', opacity: 0.3 }}>&ldquo;</span>
                        <p className="text-sm leading-relaxed -mt-4 ml-6" style={{ color: '#1e293b' }}>
                          {h.feedback}
                        </p>
                      </div>

                      {/* Attribution */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#64748b' }}>
                          <span className="font-semibold" style={{ color: '#0f766e' }}>
                            Re: {h.staffName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                            {h.department}
                          </span>
                          <span>{h.branch === 'SBEA' ? 'East' : h.branch === 'SBGH' ? 'GH' : h.branch}</span>
                          {h.avgRating !== null && (
                            <span className="flex items-center gap-0.5">
                              <Star size={10} style={{ color: '#f59e0b' }} /> {h.avgRating.toFixed(1)}/5
                            </span>
                          )}
                          <span>{new Date(h.submittedAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</span>
                        </div>

                        {/* Copy button */}
                        <button
                          onClick={() => {
                            const text = `"${h.feedback}"\n\n— Patient feedback for ${h.staffName} (${h.department}), Sapphire Clinics East`
                            navigator.clipboard.writeText(text)
                            setCopiedIdx(i)
                            setTimeout(() => setCopiedIdx(null), 2000)
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all opacity-60 group-hover:opacity-100"
                          style={copiedIdx === i
                            ? { background: '#f0fdf4', color: '#16a34a' }
                            : { background: '#f1f5f9', color: '#64748b' }
                          }
                        >
                          {copiedIdx === i ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy for post</>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-center py-12" style={{ color: '#94a3b8' }}>
                  No positive feedback collected yet. Highlights will appear here once patients submit surveys with strengths/accomplishments.
                </p>
              )}
            </div>
          )}

          {/* ── Results Settings Sub-tab (Admin only — read-only, managed from HR platform) ── */}
          {rdSubTab === 'settings' && isAdmin && (
            <div className="space-y-4">
              <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Settings size={18} style={{ color: '#0f766e' }} />
                  <h3 className="font-bold text-sm" style={{ color: '#1e293b' }}>Leaderboard Scoring Weights</h3>
                </div>
                <div className="flex items-center gap-2 mb-5 p-3 rounded-lg text-xs font-medium"
                  style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  <Building2 size={14} />
                  These settings are managed by the HR Department at hr.sapphireclinicseast.org
                </div>

                {settingsLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0f766e', borderTopColor: 'transparent' }} />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {([
                      { key: 'weightConfirmed' as const, label: 'Confirmed Sessions', desc: 'Sessions with CONFIRMED status (positive effect)' },
                      { key: 'weightRescheduled' as const, label: 'Rescheduled Sessions', desc: 'Sessions with RESCHEDULED status (negative effect)' },
                      { key: 'weightCancelled' as const, label: 'Cancelled Sessions', desc: 'Fewer cancellations = higher score (negative effect)' },
                      { key: 'weightSatisfaction' as const, label: 'Avg Satisfaction Score', desc: 'Average patient satisfaction rating out of 5 (positive effect)' },
                    ]).map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-semibold" style={{ color: '#1e293b' }}>{label}</p>
                          <p className="text-xs" style={{ color: '#94a3b8' }}>{desc}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-20 px-3 py-2 rounded-lg text-sm text-center font-semibold"
                            style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                            {settingsWeights[key]}
                          </span>
                          <span className="text-sm font-semibold" style={{ color: '#64748b' }}>%</span>
                        </div>
                      </div>
                    ))}

                    {/* Total indicator */}
                    <div className="flex items-center pt-4 mt-2" style={{ borderTop: '2px solid #e2e8f0' }}>
                      <span className="text-sm font-bold" style={{ color: '#1e293b' }}>Total:</span>
                      <span className="text-lg font-bold ml-2" style={{ color: '#16a34a' }}>
                        {settingsWeights.weightConfirmed + settingsWeights.weightRescheduled + settingsWeights.weightCancelled + settingsWeights.weightSatisfaction}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* QR Code Modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-8 max-w-md w-[90%] text-center" style={{ background: '#fff' }}>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1e293b' }}>Scan to Take Survey</h3>
            <p className="text-sm mb-1" style={{ color: '#64748b' }}>Ask the patient to scan this QR code with the clinic tablet.</p>
            {qrType && <p className="text-sm font-semibold mb-4" style={{ color: '#0f766e' }}>{qrType}</p>}
            <div ref={qrRef} className="w-[220px] h-[220px] mx-auto mb-4 p-2.5 rounded-lg flex items-center justify-center" style={{ border: '2px solid #e2e8f0' }} />
            <p className="text-xs mb-4 break-all" style={{ color: '#94a3b8' }}>{qrUrl}</p>
            <button
              onClick={() => setShowQr(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white mx-auto"
              style={{ background: '#0f766e' }}
            >
              <X size={15} />
              Close
            </button>
          </div>
        </div>
      )}

      {/* QRCode CDN */}
      <Script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js" strategy="lazyOnload" />

      {/* Pending Surveys Modal */}
      {showPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-6 max-w-lg w-[90%]" style={{ background: '#fff', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#1e293b' }}>
                <Clock size={18} style={{ color: '#0f766e' }} />
                Pending Surveys
              </h3>
              <button onClick={() => setShowPending(false)} className="p-1 rounded hover:bg-slate-100">
                <X size={18} style={{ color: '#64748b' }} />
              </button>
            </div>
            {pendingList.length > 0 ? (
              <div className="space-y-2">
                {pendingList.map(p => (
                  <div key={p.id} className="rounded-lg p-3" style={{ border: '1px solid #e2e8f0' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{p.staffName}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                        {p.surveyType}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: '#64748b' }}>
                      {p.staffDept} · {p.branch === 'SBEA' ? 'East Branch' : p.branch === 'SBGH' ? 'Greenhills' : p.branch}
                      {p.patientName && ` · Patient: ${p.patientName}`}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs" style={{ color: '#94a3b8' }}>
                        Expires: {new Date(p.expiresAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <a
                        href={`https://survey.sapphireclinicseast.org?id=${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold"
                        style={{ color: '#0f766e' }}
                      >
                        Open Survey <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: '#94a3b8' }}>No pending surveys</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, onClick, clickable }: {
  icon: typeof ClipboardCheck; label: string; value: string | number; onClick?: () => void; clickable?: boolean
}) {
  return (
    <div
      className={`rounded-xl p-4 text-center ${clickable ? 'cursor-pointer hover:border-teal-300 transition-colors' : ''}`}
      style={{ background: '#fff', border: '1px solid #e2e8f0' }}
      onClick={onClick}
    >
      <Icon size={20} className="mx-auto mb-2" style={{ color: '#0f766e' }} />
      <div className="text-2xl font-bold" style={{ color: '#1e293b' }}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: '#94a3b8' }}>
        {label}
        {clickable && <span className="block text-teal-600 normal-case mt-0.5 text-[10px]">Click to view</span>}
      </div>
    </div>
  )
}

function ChartCard({ title, icon: Icon, data }: { title: string; icon: typeof TrendingUp; data?: { month?: string; branch?: string; avgScore: number; count: number }[] }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} style={{ color: '#0f766e' }} />
        <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>{title}</h3>
      </div>
      {data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((item, i) => {
            const label = item.month || item.branch || `Item ${i + 1}`
            const displayLabel = label === 'SBEA' ? 'East Branch' : label === 'SBGH' ? 'Greenhills' : label
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs w-24 truncate" style={{ color: '#64748b' }}>{displayLabel}</span>
                <div className="flex-1 h-2 rounded-full" style={{ background: '#f1f5f9' }}>
                  <div className="h-full rounded-full" style={{ width: `${(item.avgScore / 5) * 100}%`, background: '#0f766e' }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: '#1e293b' }}>{item.avgScore.toFixed(1)}</span>
                <span className="text-xs" style={{ color: '#94a3b8' }}>({item.count})</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-center py-6" style={{ color: '#94a3b8' }}>No data yet</p>
      )}
    </div>
  )
}


// Competition ranking: equal compositeScore shares the same rank number,
// and the next distinct score skips to reflect the tie count.
// e.g. [95, 95, 95, 90, 85] → [1, 1, 1, 4, 5]
function computeTiedRanks(arr: { compositeScore: number }[]): number[] {
  const ranks: number[] = []
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && arr[i].compositeScore === arr[i - 1].compositeScore) {
      ranks.push(ranks[i - 1])
    } else {
      ranks.push(i + 1)
    }
  }
  return ranks
}


// Renders top-5 as distinct-score rank buckets. A bucket with >1 member shows
// a single collapsed row with comma-joined names; clicking expands it into
// individual LeaderboardRows for the tied people.
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

  const medalColors = ['#f59e0b', '#94a3b8', '#cd7f32']

  return (
    <div className="space-y-2.5">
      {groups.map(g => {
        const tied = g.members.length > 1
        const expanded = expandedRank === g.rank
        const medal = g.rank <= 3 ? medalColors[g.rank - 1] : undefined
        const names = g.members.map(m => m.name).join(', ')
        return (
          <div key={'g' + g.rank} className="rounded-lg overflow-hidden"
            style={{ background: g.rank === 1 ? '#fffbeb' : '#f8fafc', border: '1px solid transparent' }}
          >
            <div
              onClick={() => tied && setExpandedRank(expanded ? null : g.rank)}
              className="flex items-center gap-3 p-3"
              style={{ cursor: tied ? 'pointer' : 'default' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                style={medal ? { background: medal + '20', color: medal } : { background: '#f1f5f9', color: '#94a3b8' }}
              >
                {g.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm" style={{ color: '#1e293b' }}>
                    {names}
                  </span>
                  {tied && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: '#fbbf24', color: '#78350f' }}
                    >
                      TIED · {g.members.length} people
                    </span>
                  )}
                </div>
                {tied ? (
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {expanded ? '▾ Hide details' : '▸ Tap to see individual stats'}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#64748b' }}>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: '#f0fdfa', color: '#0f766e' }}>
                      {g.members[0].department}
                    </span>
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                      {g.members[0].branch === 'SBEA' ? 'East' : g.members[0].branch === 'SBGH' ? 'GH' : g.members[0].branch}
                    </span>
                    <span className="flex items-center gap-1"><Star size={10} style={{ color: '#f59e0b' }} /> {g.members[0].avgRating.toFixed(2)}</span>
                    <span className="flex items-center gap-1"><Calendar size={10} /> {g.members[0].sessionsTotal} sessions</span>
                    <span className="flex items-center gap-1"><ClipboardCheck size={10} /> {g.members[0].surveyCount} surveys</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xl font-bold" style={{ color: g.rank === 1 ? '#f59e0b' : '#0f766e' }}>{g.score}</div>
                <div className="text-[9px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Score</div>
              </div>
            </div>

            {tied && expanded && (
              <div className="px-3 pb-3 pt-0 space-y-2" style={{ borderTop: '1px dashed #e2e8f0' }}>
                {g.members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-2 rounded-md bg-white">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{m.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: '#f0fdfa', color: '#0f766e' }}>
                          {m.department}
                        </span>
                        <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                          {m.branch === 'SBEA' ? 'East' : m.branch === 'SBGH' ? 'GH' : m.branch}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#64748b' }}>
                        <span className="flex items-center gap-1"><Star size={10} style={{ color: '#f59e0b' }} /> {m.avgRating.toFixed(2)}</span>
                        <span className="flex items-center gap-1"><Calendar size={10} /> {m.sessionsTotal} sessions</span>
                        <span className="flex items-center gap-1"><ClipboardCheck size={10} /> {m.surveyCount} surveys</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LeaderboardRow({ rank, performer: p, tied }: { rank: number; performer: TopPerformer; tied?: boolean }) {
  const medalColors = ['#f59e0b', '#94a3b8', '#cd7f32'] // gold, silver, bronze
  const medalColor = rank <= 3 ? medalColors[rank - 1] : undefined
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: rank === 1 ? '#fffbeb' : '#f8fafc' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm relative"
        style={medalColor
          ? { background: medalColor + '20', color: medalColor }
          : { background: '#f1f5f9', color: '#94a3b8' }
        }
        title={tied ? `Tied at rank ${rank}` : undefined}
      >
        {rank}
        {tied && (
          <span
            className="absolute -top-1 -right-1 text-[8px] font-bold px-1 rounded-full"
            style={{ background: '#fbbf24', color: '#78350f', lineHeight: 1.3 }}
          >T</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color: '#1e293b' }}>{p.name}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
            {p.department}
          </span>
          <span className="text-[10px]" style={{ color: '#94a3b8' }}>
            {p.branch === 'SBEA' ? 'East' : p.branch === 'SBGH' ? 'GH' : p.branch}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#64748b' }}>
          <span className="flex items-center gap-1"><Star size={10} style={{ color: '#f59e0b' }} /> {p.avgRating.toFixed(2)}</span>
          <span className="flex items-center gap-1"><Calendar size={10} /> {p.sessionsTotal} sessions</span>
          <span className="flex items-center gap-1"><ClipboardCheck size={10} /> {p.surveyCount} surveys</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xl font-bold" style={{ color: rank === 1 ? '#f59e0b' : '#0f766e' }}>{p.compositeScore}</div>
        <div className="text-[9px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Score</div>
      </div>
    </div>
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

  function copyLink(url: string) {
    navigator.clipboard.writeText(url)
  }

  const byStatus = {
    pending: targets.filter(t => t.status === 'PENDING').length,
    completed: targets.filter(t => t.status === 'COMPLETED').length,
  }

  return (
    <div>
      <Script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js" strategy="afterInteractive" />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: '#0f172a' }}>
            <Target size={16} style={{ color: '#ED6823' }} />
            Daily Targets {date && <span className="text-xs text-gray-400 font-normal">· {date}</span>}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Today's randomized patients for customer satisfaction survey. QR codes are ready — hand off to clinic aides or print for the day.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(isAdmin || (!isFrontDesk && !role?.startsWith('SBEA_') && !role?.startsWith('SBGH_'))) && (
            <select
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-xs"
            >
              <option value="SBEA">East Branch</option>
              <option value="SBGH">Greenhills Branch</option>
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={print}
            disabled={targets.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: '#ED6823' }}
          >
            <Printer size={12} /> Print All
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-3 p-2 rounded text-xs" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg p-3 bg-white border border-gray-200">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total Targets</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: '#ED6823' }}>{loading ? '…' : targets.length}</div>
        </div>
        <div className="rounded-lg p-3 bg-white border border-gray-200">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Pending</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: '#f59e0b' }}>{loading ? '…' : byStatus.pending}</div>
        </div>
        <div className="rounded-lg p-3 bg-white border border-gray-200">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Completed</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: '#10b981' }}>{loading ? '…' : byStatus.completed}</div>
        </div>
        <div className="rounded-lg p-3 bg-white border border-gray-200">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Completion Rate</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: '#0f766e' }}>
            {targets.length === 0 ? '0%' : `${Math.round((byStatus.completed / targets.length) * 100)}%`}
          </div>
        </div>
      </div>

      {!loading && targets.length === 0 && !err && (
        <div className="text-center py-12 text-sm text-gray-400">
          No confirmed appointments scheduled for today, or all staff have met their assessment targets for the year.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 daily-target-grid">
        {targets.map(t => (
          <div key={t.assignmentId} className="rounded-xl border bg-white overflow-hidden daily-target-card" style={{ borderColor: t.status === 'COMPLETED' ? '#bbf7d0' : '#FDE4CC' }}>
            <div className="px-4 py-3 flex items-start justify-between" style={{ background: t.status === 'COMPLETED' ? '#f0fdf4' : '#FFF3E8' }}>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.department} · {t.startTime}–{t.endTime}</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: '#0f172a' }}>{t.patientName}</div>
                <div className="text-xs text-gray-500 mt-0.5">w/ {t.staffName}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                background: t.status === 'COMPLETED' ? '#bbf7d0' : '#fef3c7',
                color:      t.status === 'COMPLETED' ? '#166534' : '#92400e',
              }}>
                {t.status === 'COMPLETED' ? '✓ DONE' : 'PENDING'}
              </span>
            </div>
            <div className="flex items-center justify-center p-4" style={{ background: '#fafafa' }}>
              <div ref={el => { qrRefs.current[t.assignmentId] = el }} />
            </div>
            <div className="px-3 py-2 flex items-center gap-2 border-t border-gray-100">
              <button
                onClick={() => copyLink(t.surveyUrl)}
                className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-1"
                title="Copy survey link"
              >
                <Copy size={11} /> Copy link
              </button>
              <a
                href={t.surveyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 flex items-center gap-1"
                title="Open survey"
              >
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        ))}
      </div>

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
