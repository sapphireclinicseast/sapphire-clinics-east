'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ClipboardCheck, BarChart3, ListChecks, FileText, Star, Target, Clock,
  QrCode, Filter, Users, TrendingUp, Building2, X,
} from 'lucide-react'

// ── API helpers ──────────────────────────────────────────────────────────────

const SURVEY_API = '/api/survey'
const SURVEY_API_KEY = 'SCEI_SURVEY_KEY_2025'

async function surveyFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${SURVEY_API}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SURVEY_API_KEY,
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalSurveys: number
  avgScore: number | null
  completionRate: number
  completedCount: number
  targetCount: number
  pending: number
  byBranch: { branch: string; avgScore: number; count: number }[]
  byDept: { role: string; avgScore: number; count: number }[]
  monthlyTrend: { month: string; avgScore: number; count: number }[]
}

interface StaffMember {
  id: number
  name: string
  role: string
  branch: string
  staff_type: string
  target_count: number
  completed: number
  last_assessed: string | null
}

interface SurveyResponse {
  id: string
  staff_name: string
  survey_type: string
  patient_name: string
  branch: string
  avg_score: number
  submitted_at: string
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SurveyClient({ role }: { role: string }) {
  const [tab, setTab] = useState<'overview' | 'manage' | 'responses'>('overview')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Manage tab filters
  const [staffBranch, setStaffBranch] = useState('')
  const [staffType, setStaffType] = useState('')

  // Manual assignment
  const [assignStaff, setAssignStaff] = useState('')
  const [assignBranch, setAssignBranch] = useState('east_pasig')
  const [assignPatient, setAssignPatient] = useState('')
  const [assignAge, setAssignAge] = useState('')
  const [assignSession, setAssignSession] = useState('individual')
  const [qrUrl, setQrUrl] = useState('')
  const [qrType, setQrType] = useState('')
  const [showQr, setShowQr] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  // Response filters
  const [resBranch, setResBranch] = useState('')
  const [resType, setResType] = useState('')

  // Auto-prompt state
  const [prompt, setPrompt] = useState<{
    staffId: number; staffName: string; staffType: string; surveyType: string; reason: string
  } | null>(null)
  const [promptPatient, setPromptPatient] = useState('')
  const [promptAge, setPromptAge] = useState('')

  const isFrontDesk = role === 'SBEA_FRONT_DESK' || role === 'SBGH_FRONT_DESK'
  const branch = role === 'SBGH_FRONT_DESK' ? 'greenhills' : 'east_pasig'

  // ── Load dashboard data ────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const data = await surveyFetch('/dashboard')
      setDashboard(data)
    } catch (e) {
      setError('Could not connect to survey API')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // ── Load staff ─────────────────────────────────────────────────────────────
  const loadStaff = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (staffBranch) params.set('branch', staffBranch)
      if (staffType) params.set('type', staffType)
      const data = await surveyFetch(`/staff?${params}`)
      setStaff(data)
    } catch { /* handled by error state */ }
  }, [staffBranch, staffType])

  useEffect(() => {
    if (tab === 'manage') loadStaff()
  }, [tab, loadStaff])

  // ── Load responses ─────────────────────────────────────────────────────────
  const loadResponses = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (resBranch) params.set('branch', resBranch)
      if (resType) params.set('type', resType)
      const data = await surveyFetch(`/responses?${params}`)
      setResponses(data.responses || [])
    } catch { /* handled by error state */ }
  }, [resBranch, resType])

  useEffect(() => {
    if (tab === 'responses') loadResponses()
  }, [tab, loadResponses])

  // ── Auto-prompt (front desk only) ──────────────────────────────────────────
  useEffect(() => {
    if (!isFrontDesk) return
    const check = async () => {
      try {
        const data = await surveyFetch(`/schedule/next?branch=${branch}`)
        if (data.shouldPrompt) {
          setPrompt({
            staffId: data.staffId,
            staffName: data.staffName,
            staffType: data.staffType,
            surveyType: data.suggestedSurveyType,
            reason: data.reason,
          })
        }
      } catch { /* silently fail */ }
    }
    const timeout = setTimeout(check, 5000)
    const interval = setInterval(check, 30 * 60 * 1000)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [isFrontDesk, branch])

  // ── Create assignment + QR ─────────────────────────────────────────────────
  const createAssignment = async (staffId: string | number, patientName: string, patientAge: string, sessionType: string, assignmentBranch: string) => {
    try {
      const result = await surveyFetch('/assign', {
        method: 'POST',
        body: JSON.stringify({
          staffId: Number(staffId),
          patientName,
          patientAge: Number(patientAge),
          branch: assignmentBranch,
          sessionType,
        }),
      })
      const surveyUrl = `https://survey.sapphireclinicseast.org?id=${result.assignmentId}`
      setQrUrl(surveyUrl)
      setQrType(result.surveyType)
      setShowQr(true)

      // Generate QR code
      setTimeout(() => {
        if (qrRef.current) {
          qrRef.current.innerHTML = ''
          // @ts-expect-error - QRCode loaded via CDN
          if (typeof window !== 'undefined' && window.QRCode) {
            // @ts-expect-error - QRCode loaded via CDN
            new window.QRCode(qrRef.current, {
              text: surveyUrl,
              width: 200,
              height: 200,
              colorDark: '#0f766e',
              colorLight: '#ffffff',
            })
          } else {
            // Fallback: show URL
            qrRef.current.innerHTML = `<p style="font-size:12px;word-break:break-all">${surveyUrl}</p>`
          }
        }
      }, 100)
    } catch (e) {
      alert('Failed to create assignment. Please try again.')
    }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'manage' as const, label: 'Manage', icon: ListChecks },
    { id: 'responses' as const, label: 'Responses', icon: FileText },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
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
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={ClipboardCheck} label="Total Surveys" value={dashboard?.totalSurveys ?? '—'} />
            <KpiCard icon={Star} label="Avg. Score /5" value={dashboard?.avgScore?.toFixed(2) ?? '—'} />
            <KpiCard icon={Target} label="Completion Rate" value={dashboard ? `${dashboard.completionRate}%` : '—'} />
            <KpiCard icon={Clock} label="Pending" value={dashboard?.pending ?? '—'} />
          </div>

          {/* Charts placeholder */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Satisfaction Trend" icon={TrendingUp} data={dashboard?.monthlyTrend} />
            <ChartCard title="By Branch" icon={Building2} data={dashboard?.byBranch} />
          </div>
        </div>
      )}

      {/* Manage Tab */}
      {tab === 'manage' && (
        <div className="space-y-6">
          {/* Assessment Schedule */}
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} style={{ color: '#0f766e' }} />
              <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>Assessment Schedule</h3>
            </div>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>Track staff assessment progress for the year.</p>

            <div className="flex gap-3 mb-4">
              <select value={staffBranch} onChange={e => setStaffBranch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="">All Branches</option>
                <option value="east_pasig">Sandbox East Pasig</option>
                <option value="greenhills">Sandbox Greenhills</option>
              </select>
              <select value={staffType} onChange={e => setStaffType(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="">All Types</option>
                <option value="clinical">Clinical Staff</option>
                <option value="admin">Front Desk Staff</option>
              </select>
            </div>

            {staff.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Staff</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Role</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Branch</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(s => (
                      <tr key={s.id} className="hover:bg-teal-50/50" style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td className="py-2.5 px-3 font-medium" style={{ color: '#1e293b' }}>{s.name}</td>
                        <td className="py-2.5 px-3" style={{ color: '#64748b' }}>{s.role}</td>
                        <td className="py-2.5 px-3" style={{ color: '#64748b' }}>{s.branch === 'east_pasig' ? 'East' : 'Greenhills'}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f1f5f9' }}>
                              <div className="h-full rounded-full" style={{
                                width: `${Math.min(100, (s.completed / s.target_count) * 100)}%`,
                                background: s.completed >= s.target_count ? '#10b981' : '#0f766e',
                              }} />
                            </div>
                            <span className="text-xs font-semibold" style={{ color: '#64748b', minWidth: 40, textAlign: 'right' }}>
                              {s.completed}/{s.target_count}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#94a3b8' }}>Loading staff data...</p>
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
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Branch</label>
                <select value={assignBranch} onChange={e => setAssignBranch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                  <option value="east_pasig">Sandbox East Pasig</option>
                  <option value="greenhills">Sandbox Greenhills</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Patient Name</label>
                <input type="text" value={assignPatient} onChange={e => setAssignPatient(e.target.value)}
                  placeholder="Enter patient name"
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Patient Age</label>
                <input type="number" value={assignAge} onChange={e => setAssignAge(e.target.value)}
                  placeholder="Age" min="0" max="120"
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }} />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Session Type</label>
              <select value={assignSession} onChange={e => setAssignSession(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="individual">Individual Session</option>
                <option value="group">Group Session</option>
              </select>
            </div>
            <button
              onClick={() => {
                if (!assignStaff || !assignPatient || !assignAge) return alert('Please fill in all fields')
                createAssignment(assignStaff, assignPatient, assignAge, assignSession, assignBranch)
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

      {/* Responses Tab */}
      {tab === 'responses' && (
        <div>
          <div className="rounded-xl p-5 mb-4" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center gap-2 mb-3">
              <Filter size={16} style={{ color: '#0f766e' }} />
              <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>Filter Responses</h3>
            </div>
            <div className="flex flex-wrap gap-3">
              <select value={resBranch} onChange={e => setResBranch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="">All Branches</option>
                <option value="east_pasig">East Pasig</option>
                <option value="greenhills">Greenhills</option>
              </select>
              <select value={resType} onChange={e => setResType(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }}>
                <option value="">All Survey Types</option>
                <option value="HR10">HR10 — Pedia</option>
                <option value="HR11">HR11 — Adult</option>
                <option value="HR12">HR12 — Admin</option>
                <option value="HR16">HR16 — Group</option>
              </select>
            </div>
          </div>

          {responses.length > 0 ? (
            <div className="space-y-3">
              {responses.map(r => (
                <div key={r.id} className="rounded-xl p-4 transition-all hover:shadow-md" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{r.staff_name}</span>
                    <span className="text-xs" style={{ color: '#94a3b8' }}>{new Date(r.submitted_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#64748b' }}>
                    <span>{r.survey_type}</span>
                    <span>·</span>
                    <span>{r.patient_name}</span>
                    <span>·</span>
                    <span>{r.branch === 'east_pasig' ? 'East' : 'Greenhills'}</span>
                    {r.avg_score && (
                      <>
                        <span>·</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                          {r.avg_score.toFixed(1)}/5
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: '#94a3b8' }}>No responses found.</p>
          )}
        </div>
      )}

      {/* Auto-prompt overlay (front desk only) */}
      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(4,47,46,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl p-8 max-w-lg w-[90%] text-center" style={{ background: '#fff' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#f0fdfa', color: '#0f766e' }}>
              <ClipboardCheck size={28} />
            </div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#1e293b' }}>Patient Satisfaction Survey</h3>
            <p className="text-sm mb-1" style={{ color: '#64748b' }}>Time to assess: <strong>{prompt.staffName}</strong></p>
            <p className="text-xs mb-5" style={{ color: '#94a3b8' }}>{prompt.reason}</p>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-left" style={{ color: '#64748b' }}>Patient Name</label>
              <input type="text" value={promptPatient} onChange={e => setPromptPatient(e.target.value)}
                placeholder="Enter patient name"
                className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }} />
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold mb-1 text-left" style={{ color: '#64748b' }}>Patient Age</label>
              <input type="number" value={promptAge} onChange={e => setPromptAge(e.target.value)}
                placeholder="Age" min="0" max="120"
                className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#e2e8f0' }} />
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  if (!promptPatient || !promptAge) return
                  createAssignment(prompt.staffId, promptPatient, promptAge, 'individual', branch)
                  setPrompt(null)
                  setPromptPatient('')
                  setPromptAge('')
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#0f766e' }}
              >
                <QrCode size={15} />
                Generate QR Code
              </button>
              <button
                onClick={() => { setPrompt(null); setPromptPatient(''); setPromptAge('') }}
                className="px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: '#f1f5f9', color: '#64748b' }}
              >
                Skip This Time
              </button>
            </div>
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

function ChartCard({ title, icon: Icon, data }: { title: string; icon: typeof TrendingUp; data?: unknown[] }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} style={{ color: '#0f766e' }} />
        <h3 className="font-semibold text-sm" style={{ color: '#0f766e' }}>{title}</h3>
      </div>
      {data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((item, i) => {
            const d = item as Record<string, unknown>
            const label = (d.month || d.branch || d.role || `Item ${i + 1}`) as string
            const score = (d.avgScore || d.avg_score || 0) as number
            const count = (d.count || 0) as number
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs w-24 truncate" style={{ color: '#64748b' }}>{label}</span>
                <div className="flex-1 h-2 rounded-full" style={{ background: '#f1f5f9' }}>
                  <div className="h-full rounded-full" style={{ width: `${(score / 5) * 100}%`, background: '#0f766e' }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: '#1e293b' }}>{score.toFixed(1)}</span>
                <span className="text-xs" style={{ color: '#94a3b8' }}>({count})</span>
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
