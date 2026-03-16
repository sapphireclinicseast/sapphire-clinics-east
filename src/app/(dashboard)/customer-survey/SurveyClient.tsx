'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ClipboardCheck, BarChart3, ListChecks, Star, Target, Clock,
  QrCode, Users, TrendingUp, Building2, X, ChevronUp, ChevronDown,
  ArrowUpDown,
} from 'lucide-react'

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

type SortKey = 'name' | 'department' | 'branch' | 'progress'
type SortDir = 'asc' | 'desc'

// ── Main Component ───────────────────────────────────────────────────────────

export default function SurveyClient({ role }: { role: string }) {
  const [tab, setTab] = useState<'overview' | 'manage'>('overview')
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
  const [assignPatient, setAssignPatient] = useState('')
  const [assignAge, setAssignAge] = useState('')
  const [assignSession, setAssignSession] = useState('individual')
  const [qrUrl, setQrUrl] = useState('')
  const [qrType, setQrType] = useState('')
  const [showQr, setShowQr] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  const isFrontDesk = role === 'SBEA_FRONT_DESK' || role === 'SBGH_FRONT_DESK'

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

  // ── Create assignment + QR ───────────────────────────────────────────────
  const createAssignment = async (staffId: string, patientName: string, patientAge: string, sessionType: string) => {
    try {
      const selectedStaff = staff.find(s => s.id === staffId)
      const res = await fetch('/api/customer-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId,
          patientName,
          patientAge: Number(patientAge),
          branch: selectedStaff?.branch ?? 'SBEA',
          sessionType,
        }),
      })
      if (!res.ok) throw new Error('Failed to create assignment')
      const result = await res.json()
      const surveyUrl = `https://survey.sapphireclinicseast.org?id=${result.assignmentId}`
      setQrUrl(surveyUrl)
      setQrType(result.surveyType)
      setShowQr(true)
      renderQr(surveyUrl)
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
    { id: 'manage' as const, label: 'Manage', icon: ListChecks },
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
            <KpiCard icon={Clock} label="Pending" value={loading ? '—' : dashboard?.pending ?? 0} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Satisfaction Trend" icon={TrendingUp} data={dashboard?.monthlyTrend} />
            <ChartCard title="By Branch" icon={Building2} data={dashboard?.byBranch} />
          </div>
        </div>
      )}

      {/* Manage Tab */}
      {tab === 'manage' && (
        <div className="space-y-6">
          {/* Assessment Schedule — sortable/filterable table */}
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} style={{ color: '#0f766e' }} />
              <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>Assessment Schedule</h3>
            </div>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
              Track staff assessment progress. {isFrontDesk ? 'Showing therapists at your branch.' : 'Showing all staff.'}
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
                            {s.branch === 'SBEA' ? 'Sandbox East' : s.branch === 'SBGH' ? 'Greenhills' : s.branch}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Staff Member</label>
                <select value={assignStaff} onChange={e => setAssignStaff(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">Select staff...</option>
                  {filteredStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.department})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Patient Name</label>
                <input type="text" value={assignPatient} onChange={e => setAssignPatient(e.target.value)}
                  placeholder="Enter patient name"
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Patient Age</label>
                <input type="number" value={assignAge} onChange={e => setAssignAge(e.target.value)}
                  placeholder="Age" min="0" max="120"
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Session Type</label>
                <select value={assignSession} onChange={e => setAssignSession(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                  <option value="individual">Individual Session</option>
                  <option value="group">Group Session</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => {
                if (!assignStaff || !assignPatient || !assignAge) return alert('Please fill in all fields')
                createAssignment(assignStaff, assignPatient, assignAge, assignSession)
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
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value }: { icon: typeof ClipboardCheck; label: string; value: string | number }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
      <Icon size={20} className="mx-auto mb-2" style={{ color: '#0f766e' }} />
      <div className="text-2xl font-bold" style={{ color: '#1e293b' }}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: '#94a3b8' }}>{label}</div>
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
            const displayLabel = label === 'SBEA' ? 'Sandbox East' : label === 'SBGH' ? 'Greenhills' : label
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
