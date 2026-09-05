'use client'

import { useState, useEffect, useCallback } from 'react'
import { branchLabel } from '@/lib/branch-label'
import {
  UsersRound, ClipboardList, BarChart3, Zap, Trash2, CheckCircle2,
  ChevronDown, ChevronUp, RefreshCw, X, AlertCircle,
  Clock, CheckCircle, Ban, QrCode, Bell, Settings, Save, Users, ExternalLink, Download, Mail,
} from 'lucide-react'
import { generatePeerEvalResultPDF } from '@/lib/pdf-results'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeerEvalType = 'HR08_ADMIN' | 'HR08_PEER' | 'HR09' | 'HR09_CLINICAL' | 'HR09_ADMIN'
type PeerEvalStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED'

interface StaffMini {
  id: string
  firstName: string
  lastName: string
  department: string
}

interface AssignmentResponse {
  id: string
  scores: Record<string, number>
  strengths: string | null
  improvements: string | null
  submittedAt: string
}

interface Assignment {
  id: string
  formType: PeerEvalType
  assessorId: string
  assesseeId: string
  branch: string
  periodYear: number
  periodMonth: number
  status: PeerEvalStatus
  notes: string | null
  completedAt: string | null
  createdAt: string
  assessor: StaffMini
  assessee: StaffMini
  response: AssignmentResponse | null
}

interface EvalResponse {
  id: string
  assessorId: string
  assesseeId: string
  formType: PeerEvalType
  branch: string
  scores: Record<string, number>
  strengths: string | null
  improvements: string | null
  submittedAt: string
  assessor: StaffMini
  assessee: StaffMini
}

interface NotificationItem {
  staffId: string
  name: string
  department: string
  branch: string
  pendingCount: number
}

interface AdminConfig {
  id: string
  staffId: string
  workDays: string[]
  branch: string
  staff: {
    id: string
    firstName: string
    lastName: string
    department: string
    branch: string
    jobTitle: string | null
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────


const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Internal form page (no Typeform)
const FORM_PAGE_URL = '/peereval'

const FORM_LABELS: Record<PeerEvalType, string> = {
  HR08_ADMIN:    'HR08 — Admin evaluates clinical staff (annual)',
  HR08_PEER:     'HR08 — Peer evaluation among clinical staff (annual)',
  HR09:          'HR09 — Clinical staff evaluates admin staff (annual)',
  HR09_CLINICAL: 'HR09 — Clinical staff evaluates admin staff',
  HR09_ADMIN:    'HR09 — Admin peers evaluate admin staff',
}

const HR08_QUESTIONS: Record<string, string> = {
  q1:  'Addresses unique needs in sessions',
  q2:  'Quality of interventions',
  q3:  'Communication and rapport',
  q4:  'Professionalism and ethics',
  q5:  'Adaptability',
  q6:  'Client progress effectiveness',
  q7:  'Evidence-based practices',
  q8:  'Collaboration with professionals',
  q9:  'Friendly and approachable',
  q10: 'Positive working relationships',
}

const HR09_QUESTIONS: Record<string, string> = {
  q1: 'Warm and respectful interactions',
  q2: 'Carries out responsibilities with care',
  q3: 'Clear and professional communication',
  q4: 'Professionalism in behavior and appearance',
  q5: 'Responsive and adaptable',
}

function getQuestions(formType: PeerEvalType) {
  return (formType === 'HR09' || formType === 'HR09_CLINICAL' || formType === 'HR09_ADMIN')
    ? HR09_QUESTIONS
    : HR08_QUESTIONS
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(s: StaffMini) {
  return `${s.firstName} ${s.lastName}`
}

function statusBadge(status: PeerEvalStatus) {
  const styles: Record<PeerEvalStatus, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
    PENDING:   { bg: '#fef3c7', color: '#92400e', icon: <Clock size={11} />,         label: 'Pending' },
    COMPLETED: { bg: '#d1fae5', color: '#065f46', icon: <CheckCircle size={11} />,   label: 'Completed' },
    EXPIRED:   { bg: '#f3f4f6', color: '#6b7280', icon: <Ban size={11} />,            label: 'Expired' },
  }
  const s = styles[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 99, background: s.bg, color: s.color, fontSize: '0.7rem', fontWeight: 600,
    }}>
      {s.icon} {s.label}
    </span>
  )
}

function typeBadge(formType: PeerEvalType) {
  const map: Record<PeerEvalType, { bg: string; color: string; label: string }> = {
    HR08_ADMIN:    { bg: '#ede9fe', color: '#5b21b6', label: 'HR08 Admin' },
    HR08_PEER:     { bg: '#dbeafe', color: '#1e40af', label: 'HR08 Peer' },
    HR09:          { bg: '#fce7f3', color: '#9d174d', label: 'HR09' },
    HR09_CLINICAL: { bg: '#fce7f3', color: '#9d174d', label: 'HR09 Clinical' },
    HR09_ADMIN:    { bg: '#fdf2f8', color: '#831843', label: 'HR09 Admin' },
  }
  const t = map[formType] ?? { bg: '#f3f4f6', color: '#6b7280', label: formType }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      background: t.bg, color: t.color, fontSize: '0.7rem', fontWeight: 600,
    }}>
      {t.label}
    </span>
  )
}

function periodLabel(_formType: PeerEvalType, year: number, month: number) {
  if (month > 0) return `${MONTH_NAMES[month - 1]} ${year}`
  return `${year}`
}

function scoreColor(score: number) {
  if (score >= 4.5) return '#059669'
  if (score >= 3.5) return '#0284c7'
  if (score >= 2.5) return '#d97706'
  return '#dc2626'
}

// ─── QR Code Modal ────────────────────────────────────────────────────────────

function QrCodeModal({ onClose }: { onClose: () => void }) {
  const forms = [
    { branch: 'SBEA', label: 'East Branch', url: `${FORM_PAGE_URL}?branch=SBEA` },
    { branch: 'SBGH', label: 'Greenhills Branch', url: `${FORM_PAGE_URL}?branch=SBGH` },
  ]
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>QR Codes — Peer Evaluation Form</div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>Scan to open the form — no login required</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '24px', display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {forms.map(f => {
            const fullUrl = `${origin}${f.url}`
            return (
              <div key={f.branch} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(fullUrl)}`}
                  alt={`QR code for ${f.label}`}
                  width={180}
                  height={180}
                  style={{ borderRadius: 10, border: '1px solid #e5e7eb', display: 'block' }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111827' }}>{f.label}</div>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={11} /> Open form
                  </a>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '0 24px 20px', textAlign: 'center' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontSize: '0.83rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Notification Banner ──────────────────────────────────────────────────────

function NotificationBanner({ branch }: { branch: string }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const params = branch ? `?branch=${branch}` : ''
        const res = await fetch(`/api/peer-eval/notifications${params}`)
        if (res.ok) setItems(await res.json())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [branch])

  if (loading || dismissed || items.length === 0) return null

  return (
    <div style={{
      marginBottom: 16, padding: '12px 16px', borderRadius: 10,
      background: '#fffbeb', border: '1px solid #fbbf24',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bell size={15} style={{ color: '#d97706', flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: '0.83rem', color: '#92400e', fontWeight: 600 }}>
          {items.length} clinician{items.length !== 1 ? 's' : ''} in clinic today with pending peer evals
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px' }}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
        <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 23 }}>
          {items.map(item => (
            <div key={item.staffId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#78350f' }}>
              <span style={{ fontWeight: 600 }}>{item.name}</span>
              <span style={{ color: '#92400e' }}>·</span>
              <span>{item.department}</span>
              <span style={{
                padding: '1px 7px', borderRadius: 99, background: '#fef3c7', color: '#92400e',
                fontSize: '0.68rem', fontWeight: 700, border: '1px solid #fbbf24',
              }}>
                {item.pendingCount} pending
              </span>
            </div>
          ))}
          <div style={{ fontSize: '0.74rem', color: '#a16207', marginTop: 4, fontStyle: 'italic' }}>
            Remind them to complete their peer evaluation forms today.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Score Entry Modal ────────────────────────────────────────────────────────

function ScoreEntryModal({
  assignment,
  onClose,
  onSubmit,
}: {
  assignment: Assignment
  onClose: () => void
  onSubmit: (data: { scores: Record<string, number>; strengths: string; improvements: string }) => Promise<void>
}) {
  const questions = getQuestions(assignment.formType)
  const qKeys = Object.keys(questions)
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(qKeys.map(k => [k, assignment.response?.scores?.[k] ?? 3]))
  )
  const [strengths, setStrengths] = useState(assignment.response?.strengths ?? '')
  const [improvements, setImprovements] = useState(assignment.response?.improvements ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await onSubmit({ scores, strengths, improvements })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>
              {typeBadge(assignment.formType)}
              {' '}
              <span style={{ marginLeft: 6 }}>{periodLabel(assignment.formType, assignment.periodYear, assignment.periodMonth)}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>Score Entry</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
              <strong>{fullName(assignment.assessor)}</strong> evaluating <strong>{fullName(assignment.assessee)}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Scores (0 – 5)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {qKeys.map((key) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontSize: '0.82rem', color: '#374151', lineHeight: 1.4 }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.72rem', fontWeight: 600, marginRight: 6 }}>{key.toUpperCase()}</span>
                  {questions[key]}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <input
                    type="range" min={0} max={5} step={1}
                    value={scores[key] ?? 3}
                    onChange={e => setScores(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                    style={{ width: 100 }}
                  />
                  <span style={{ width: 28, textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', color: scoreColor(scores[key] ?? 3) }}>
                    {scores[key] ?? 3}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Strengths / Notable Contributions
              </label>
              <textarea
                value={strengths}
                onChange={e => setStrengths(e.target.value)}
                rows={3}
                placeholder="What does this person do well?"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.83rem', color: '#111827', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Areas for Improvement
              </label>
              <textarea
                value={improvements}
                onChange={e => setImprovements(e.target.value)}
                rows={3}
                placeholder="What could be improved?"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.83rem', color: '#111827', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e5e7eb' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.83rem' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: submitting ? '#6b7280' : '#1a7b8a', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.83rem', fontWeight: 600 }}
          >
            {submitting ? 'Saving…' : 'Save Response'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Front Desk Pending Evals View ────────────────────────────────────────────

function FrontDeskPendingView({ role }: { role: string }) {
  const branch = role === 'AHEA_FRONT_DESK' ? 'SBEA' : 'SBGH'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrStaff, setQrStaff] = useState<StaffMini | null>(null) // which staff's QR to show

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({ branch, status: 'PENDING', year: String(new Date().getFullYear()) })
        const res = await fetch(`/api/peer-eval/assignments?${params}`)
        if (!res.ok) throw new Error('Failed to load')
        setAssignments(await res.json())
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [branch])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  if (loading) return <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>Loading…</div>
  if (error) return <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem' }}>{error}</div>

  // Group pending by assessor
  const byAssessor = new Map<string, { assessor: StaffMini; evals: Assignment[] }>()
  for (const a of assignments) {
    if (!byAssessor.has(a.assessorId)) byAssessor.set(a.assessorId, { assessor: a.assessor, evals: [] })
    byAssessor.get(a.assessorId)!.evals.push(a)
  }
  const assessorGroups = Array.from(byAssessor.values()).sort((a, b) => a.assessor.lastName.localeCompare(b.assessor.lastName))

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, fontSize: '0.85rem', color: '#6b7280' }}>
          {assignments.length} pending evaluation{assignments.length !== 1 ? 's' : ''} for {branchLabel(branch)}
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        marginBottom: 16, padding: '12px 16px', borderRadius: 10,
        background: '#f0f9ff', border: '1px solid #bae6fd',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <AlertCircle size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: '0.8rem', color: '#0369a1', lineHeight: 1.5 }}>
          Each staff member has their own <strong>QR Code</strong> that links directly to their evaluations.
          Click the QR icon next to their name to show it, or use <strong>Open Survey</strong> to open their form.
        </div>
      </div>

      {assignments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <CheckCircle2 size={40} style={{ color: '#10b981', marginBottom: 12, margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700, color: '#059669', fontSize: '1rem' }}>All caught up!</div>
          <div style={{ color: '#6b7280', fontSize: '0.83rem', marginTop: 4 }}>No pending peer evaluations at this time.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assessorGroups.map(({ assessor, evals }) => {
            const staffUrl = `${origin}/peereval?branch=${branch}&staffId=${assessor.id}`
            return (
              <div key={assessor.id} style={{
                border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff',
              }}>
                {/* Assessor header */}
                <div style={{
                  padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#fef3c7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.82rem', color: '#92400e', flexShrink: 0,
                  }}>
                    {assessor.firstName[0]}{assessor.lastName[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>{fullName(assessor)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{assessor.department} · {evals.length} pending</div>
                  </div>
                  <button
                    onClick={() => setQrStaff(assessor)}
                    title="Show QR Code"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px',
                      borderRadius: 8, border: '1px solid #a7f3d0', background: '#f0fdf4',
                      color: '#065f46', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                    }}
                  >
                    <QrCode size={14} />
                  </button>
                  <a
                    href={staffUrl}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                      borderRadius: 8, background: '#1a7b8a', color: '#fff',
                      fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={13} /> Open Survey
                  </a>
                </div>

                {/* Eval items */}
                <div style={{ padding: '8px 12px' }}>
                  {evals.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
                      borderBottom: '1px solid #f3f4f6',
                      fontSize: '0.82rem',
                    }}>
                      <Clock size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, color: '#111827' }}>Evaluate: {fullName(a.assessee)}</span>
                        <span style={{ color: '#9ca3af', marginLeft: 8, fontSize: '0.72rem' }}>{a.assessee.department}</span>
                      </div>
                      {typeBadge(a.formType)}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Per-staff QR modal */}
      {qrStaff && (() => {
        const staffUrl = `${origin}/peereval?branch=${branch}&staffId=${qrStaff.id}`
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>Peer Evaluation — {fullName(qrStaff)}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>Scan to go directly to their evaluations</div>
                </div>
                <button onClick={() => setQrStaff(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(staffUrl)}&color=1A7B8A`}
                  alt={`QR code for ${fullName(qrStaff)}`}
                  width={220} height={220}
                  style={{ borderRadius: 10, border: '1px solid #e5e7eb', display: 'block' }}
                />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 2 }}>{fullName(qrStaff)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 6 }}>{qrStaff.department} · {branchLabel(branch)}</div>
                  <a href={staffUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ExternalLink size={11} /> Open form
                  </a>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
                  This QR code is unique to {qrStaff.firstName} and links directly to their pending evaluations.
                </div>
              </div>
              <div style={{ padding: '0 24px 20px', textAlign: 'center' }}>
                <button onClick={() => setQrStaff(null)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontSize: '0.83rem' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Assignments Tab ──────────────────────────────────────────────────────────

function AssignmentsTab({ role }: { role: string }) {
  const isFrontDesk = ['AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)
  const canManage   = !isFrontDesk
  const defaultBranch = role === 'AHEA_ADMIN' || role === 'AHEA_FRONT_DESK' ? 'SBEA'
                      : role === 'AHGH_ADMIN' || role === 'AHGH_FRONT_DESK' ? 'SBGH'
                      : ''

  const [filterFormType, setFilterFormType] = useState('')
  const [filterBranch, setFilterBranch]     = useState(defaultBranch)
  const [filterYear, setFilterYear]         = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth]       = useState(0)
  const [filterStatus, setFilterStatus]     = useState('')
  // Answered-between, applied to the response's submittedAt. The year/month
  // pickers describe the evaluation PERIOD, which is not the same question as
  // "has anyone actually answered recently".
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [assignments, setAssignments]           = useState<Assignment[]>([])
  const [loading, setLoading]                   = useState(false)
  const [error, setError]                       = useState('')
  const [expandedId, setExpandedId]             = useState<string | null>(null)
  const [scoreModalAssignment, setScoreModal]   = useState<Assignment | null>(null)
  const [actionLoading, setActionLoading]       = useState<string | null>(null)
  const [showQr, setShowQr]                     = useState(false)
  const [emailLogs, setEmailLogs]               = useState<Map<string, { sentAt: string; sentBy: string | null }>>(new Map())
  const [emailSending, setEmailSending]         = useState<Set<string>>(new Set())

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (filterFormType) params.set('formType', filterFormType)
      if (filterBranch) params.set('branch', filterBranch)
      if (filterYear) params.set('year', String(filterYear))
      if (filterMonth) params.set('month', String(filterMonth))
      if (filterStatus) params.set('status', filterStatus)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      const res = await fetch(`/api/peer-eval/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to load assignments')
      setAssignments(await res.json())

      // Fetch email-sent logs for the same branch/year/month context
      const logParams = new URLSearchParams()
      if (filterBranch) logParams.set('branch', filterBranch)
      if (filterYear) logParams.set('year', String(filterYear))
      if (filterMonth) logParams.set('month', String(filterMonth))
      const logsRes = await fetch(`/api/peer-eval/email-assessor?${logParams}`)
      if (logsRes.ok) {
        const logsData: { assessorId: string; sentAt: string; sentBy: string | null }[] = await logsRes.json()
        setEmailLogs(new Map(logsData.map(l => [l.assessorId, l])))
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterFormType, filterBranch, filterYear, filterMonth, filterStatus, filterFrom, filterTo])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  async function handleDelete(id: string) {
    if (!confirm('Delete this assignment?')) return
    setActionLoading(id)
    try {
      await fetch('/api/peer-eval/assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setAssignments(prev => prev.filter(a => a.id !== id))
    } finally { setActionLoading(null) }
  }

  async function handleMarkComplete(assignment: Assignment) {
    setActionLoading(assignment.id)
    try {
      const res = await fetch(`/api/peer-eval/${assignment.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) })
      const updated = await res.json()
      setAssignments(prev => prev.map(a => a.id === updated.id ? { ...a, status: updated.status, completedAt: updated.completedAt } : a))
    } finally { setActionLoading(null) }
  }

  async function handleScoreSubmit(assignment: Assignment, data: { scores: Record<string, number>; strengths: string; improvements: string }) {
    const res = await fetch('/api/peer-eval/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId: assignment.id, ...data }) })
    if (!res.ok) throw new Error('Failed to save response')
    setScoreModal(null)
    fetchAssignments()
  }

  async function handleEmailAssessor(assessorId: string, assessorName: string) {
    const existing = emailLogs.get(assessorId)
    if (existing) {
      const d = new Date(existing.sentAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      const resend = confirm(`A reminder email was already sent to ${assessorName} on ${d}.\n\nSend another one?`)
      if (!resend) return
    }
    setEmailSending(prev => new Set(prev).add(assessorId))
    try {
      const res = await fetch('/api/peer-eval/email-assessor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessorId, branch: filterBranch, periodYear: filterYear, periodMonth: filterMonth }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send email')
      setEmailLogs(prev => new Map(prev).set(assessorId, { sentAt: data.sentAt, sentBy: null }))
    } catch (e: any) {
      alert('Could not send email: ' + e.message)
    } finally {
      setEmailSending(prev => { const s = new Set(prev); s.delete(assessorId); return s })
    }
  }

  const total     = assignments.length
  const completed = assignments.filter(a => a.status === 'COMPLETED').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={filterFormType} onChange={e => setFilterFormType(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="HR08_ADMIN">HR08 Admin</option>
          <option value="HR08_PEER">HR08 Peer</option>
          <option value="HR09">HR09</option>
        </select>

        {!defaultBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={selectStyle}>
            <option value="">All Branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}

        <select value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} style={selectStyle}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Answered between — the response date, not the evaluation period. */}
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Answered</span>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
          aria-label="Answered from" title="Answered from" style={selectStyle} />
        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>to</span>
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
          aria-label="Answered to" title="Answered to" style={selectStyle} />
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
            style={{ ...selectStyle, cursor: 'pointer', color: '#64748b' }}>
            Clear dates
          </button>
        )}

        <select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))} style={selectStyle}>
          <option value={0}>All Months</option>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="EXPIRED">Expired</option>
        </select>

        <button onClick={() => setShowQr(true)} style={{ ...iconBtnStyle, gap: 6, paddingLeft: 12, paddingRight: 12, color: '#1a7b8a', border: '1px solid #a7f3d0' }} title="QR Codes">
          <QrCode size={15} /> <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>QR Codes</span>
        </button>

        <button onClick={fetchAssignments} style={{ ...iconBtnStyle, marginLeft: 'auto' }} title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Completion stats bar */}
      {!loading && total > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(['PENDING', 'COMPLETED', 'EXPIRED'] as PeerEvalStatus[]).map(s => {
                const count = assignments.filter(a => a.status === s).length
                return count > 0 ? (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#6b7280' }}>
                    {statusBadge(s)}
                    <span style={{ fontWeight: 600, color: '#374151' }}>{count}</span>
                  </div>
                ) : null
              })}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626' }}>
              {pct}% complete
            </div>
          </div>
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{completed} of {total} assignments completed</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem', marginBottom: 12, display: 'flex', gap: 8 }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>Loading…</div>
      ) : assignments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
          No assignments found. Use the Generate tab to create assignments.
        </div>
      ) : (() => {
        // Group by assessor for card-based view
        const byAssessorMap = new Map<string, { assessor: StaffMini; items: Assignment[] }>()
        for (const a of assignments) {
          if (!byAssessorMap.has(a.assessorId)) byAssessorMap.set(a.assessorId, { assessor: a.assessor, items: [] })
          byAssessorMap.get(a.assessorId)!.items.push(a)
        }
        const groups = Array.from(byAssessorMap.values()).sort((a, b) => a.assessor.firstName.localeCompare(b.assessor.firstName))

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(({ assessor, items }) => {
              const isExpanded = expandedId === assessor.id
              const pendingCount = items.filter(i => i.status === 'PENDING').length
              const completedCount = items.filter(i => i.status === 'COMPLETED').length
              return (
                <div key={assessor.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : assessor.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', background: '#f0f9ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.78rem', color: '#1a7b8a', flexShrink: 0,
                    }}>
                      {assessor.firstName[0]}{assessor.lastName[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827' }}>{assessor.firstName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{assessor.department}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {pendingCount > 0 && (
                        <span style={{ padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: '0.68rem', fontWeight: 600 }}>
                          {pendingCount} pending
                        </span>
                      )}
                      {completedCount > 0 && (
                        <span style={{ padding: '2px 8px', borderRadius: 99, background: '#d1fae5', color: '#065f46', fontSize: '0.68rem', fontWeight: 600 }}>
                          {completedCount} done
                        </span>
                      )}
                      {canManage && (() => {
                        const log = emailLogs.get(assessor.id)
                        const sending = emailSending.has(assessor.id)
                        return (
                          <div onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleEmailAssessor(assessor.id, `${assessor.firstName} ${assessor.lastName}`)}
                              disabled={sending}
                              title={log ? `Sent ${new Date(log.sentAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} — click to resend` : `Email reminder to ${assessor.firstName}`}
                              style={{
                                padding: '3px 10px', borderRadius: 99, border: 'none',
                                cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.6 : 1,
                                fontSize: '0.68rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4,
                                background: log ? '#d1fae5' : '#e0f2fe',
                                color: log ? '#065f46' : '#0369a1',
                              }}
                            >
                              <Mail size={11} />
                              {sending ? 'Sending…' : log ? 'Email sent!' : 'Email Assessor'}
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                    {isExpanded
                      ? <ChevronUp size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                    }
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 12px' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 6px 8px' }}>
                        Assessing:
                      </div>
                      {items.map(a => (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
                          borderBottom: '1px solid #f3f4f6', fontSize: '0.82rem',
                        }}>
                          {typeBadge(a.formType)}
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500, color: '#111827' }}>{fullName(a.assessee)}</span>
                            <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: '0.7rem' }}>{a.assessee.department}</span>
                          </div>
                          {/* When it was actually answered. The status badge
                              says "Completed" but not when, which is the whole
                              question when checking for recent activity. */}
                          {a.response?.submittedAt && (
                            <span style={{ fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap' }}
                              title={`Answered ${new Date(a.response.submittedAt).toLocaleString('en-PH')}`}>
                              {new Date(a.response.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {statusBadge(a.status)}
                          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                            {a.status !== 'COMPLETED' && canManage && (
                              <button onClick={() => setScoreModal(a)} title="Enter scores" style={{ ...smallBtnStyle, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                <ClipboardList size={13} /> Scores
                              </button>
                            )}
                            {a.status === 'COMPLETED' && a.response && canManage && (
                              <button onClick={() => setScoreModal(a)} title="View scores" style={{ ...smallBtnStyle, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                                <ClipboardList size={13} /> View
                              </button>
                            )}
                            {canManage && (
                              <button onClick={() => handleDelete(a.id)} disabled={actionLoading === a.id} title="Delete" style={{ ...smallBtnStyle, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                <Trash2 size={13} />
                              </button>
                            )}
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
      })()}

      {scoreModalAssignment && canManage && (
        <ScoreEntryModal
          assignment={scoreModalAssignment}
          onClose={() => setScoreModal(null)}
          onSubmit={(data) => handleScoreSubmit(scoreModalAssignment, data)}
        />
      )}

      {showQr && <QrCodeModal onClose={() => setShowQr(false)} />}
    </div>
  )
}

// ─── By-Assessee Tab ──────────────────────────────────────────────────────────

function ByAssesseeTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''

  const [filterFormType, setFilterFormType] = useState('')
  const [filterBranch, setFilterBranch]     = useState(defaultBranch)
  const [filterYear, setFilterYear]         = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth]       = useState(0)
  const [filterStatus, setFilterStatus]     = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (filterFormType) params.set('formType', filterFormType)
      if (filterBranch)   params.set('branch', filterBranch)
      if (filterYear)     params.set('year', String(filterYear))
      if (filterMonth)    params.set('month', String(filterMonth))
      if (filterStatus)   params.set('status', filterStatus)
      const res = await fetch(`/api/peer-eval/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to load assignments')
      setAssignments(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterFormType, filterBranch, filterYear, filterMonth, filterStatus])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const total     = assignments.length
  const completed = assignments.filter(a => a.status === 'COMPLETED').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  // Group by assessee
  const byAssesseeMap = new Map<string, { assessee: StaffMini; items: Assignment[] }>()
  for (const a of assignments) {
    if (!byAssesseeMap.has(a.assesseeId)) byAssesseeMap.set(a.assesseeId, { assessee: a.assessee, items: [] })
    byAssesseeMap.get(a.assesseeId)!.items.push(a)
  }
  const groups = Array.from(byAssesseeMap.values()).sort((a, b) =>
    a.assessee.firstName.localeCompare(b.assessee.firstName)
  )

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={filterFormType} onChange={e => setFilterFormType(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="HR08_ADMIN">HR08 Admin</option>
          <option value="HR08_PEER">HR08 Peer</option>
          <option value="HR09">HR09</option>
        </select>

        {!defaultBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={selectStyle}>
            <option value="">All Branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}

        <select value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} style={selectStyle}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))} style={selectStyle}>
          <option value={0}>All Months</option>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="EXPIRED">Expired</option>
        </select>

        <button onClick={fetchAssignments} style={{ ...iconBtnStyle, marginLeft: 'auto' }} title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Completion stats bar */}
      {!loading && total > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(['PENDING', 'COMPLETED', 'EXPIRED'] as PeerEvalStatus[]).map(s => {
                const count = assignments.filter(a => a.status === s).length
                return count > 0 ? (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#6b7280' }}>
                    {statusBadge(s)}
                    <span style={{ fontWeight: 600, color: '#374151' }}>{count}</span>
                  </div>
                ) : null
              })}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626' }}>
              {pct}% complete
            </div>
          </div>
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{completed} of {total} assignments completed</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem', marginBottom: 12, display: 'flex', gap: 8 }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
          No assignments found. Use the Generate tab to create assignments.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map(({ assessee, items }) => {
            const isExpanded    = expandedId === assessee.id
            const pendingCount  = items.filter(i => i.status === 'PENDING').length
            const completedCount = items.filter(i => i.status === 'COMPLETED').length
            return (
              <div key={assessee.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : assessee.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', background: '#f0fdf4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.78rem', color: '#4a8073', flexShrink: 0,
                  }}>
                    {assessee.firstName[0]}{assessee.lastName[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827' }}>{fullName(assessee)}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{assessee.department} · {items.length} evaluator{items.length !== 1 ? 's' : ''} assigned</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {pendingCount > 0 && (
                      <span style={{ padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: '0.68rem', fontWeight: 600 }}>
                        {pendingCount} pending
                      </span>
                    )}
                    {completedCount > 0 && (
                      <span style={{ padding: '2px 8px', borderRadius: 99, background: '#d1fae5', color: '#065f46', fontSize: '0.68rem', fontWeight: 600 }}>
                        {completedCount} done
                      </span>
                    )}
                  </div>
                  {isExpanded
                    ? <ChevronUp size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                    : <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                  }
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 6px 8px' }}>
                      Assessed by:
                    </div>
                    {items.map(a => (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
                        borderBottom: '1px solid #f3f4f6', fontSize: '0.82rem',
                      }}>
                        {typeBadge(a.formType)}
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 500, color: '#111827' }}>{fullName(a.assessor)}</span>
                          <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: '0.7rem' }}>{a.assessor.department}</span>
                        </div>
                        {statusBadge(a.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ExpandedRow({ assignment }: { assignment: Assignment }) {
  const questions = getQuestions(assignment.formType)

  return (
    <div style={{ fontSize: '0.78rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><span style={{ color: '#9ca3af' }}>Created:</span> {new Date(assignment.createdAt).toLocaleDateString()}</div>
        {assignment.completedAt && <div><span style={{ color: '#9ca3af' }}>Completed:</span> {new Date(assignment.completedAt).toLocaleDateString()}</div>}
        <div>
          <span style={{ color: '#9ca3af' }}>Form: </span>
          <span style={{ fontWeight: 600, color: '#374151' }}>{FORM_LABELS[assignment.formType]}</span>
        </div>
      </div>

      {assignment.response && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827', fontSize: '0.8rem' }}>Scores</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {Object.keys(questions).map(key => (
              <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>{key.toUpperCase()}</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: scoreColor(assignment.response!.scores[key] ?? 0) }}>
                  {assignment.response!.scores[key] ?? '—'}
                </span>
              </div>
            ))}
          </div>
          {assignment.response.strengths && (
            <div style={{ marginTop: 6 }}><span style={{ color: '#9ca3af' }}>Strengths: </span>{assignment.response.strengths}</div>
          )}
          {assignment.response.improvements && (
            <div style={{ marginTop: 4 }}><span style={{ color: '#9ca3af' }}>Improvements: </span>{assignment.response.improvements}</div>
          )}
        </div>
      )}

      {assignment.notes && (
        <div><span style={{ color: '#9ca3af' }}>Notes: </span>{assignment.notes}</div>
      )}
    </div>
  )
}

// ─── Results Tab ──────────────────────────────────────────────────────────────

function ResultsTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''

  const [filterBranch, setFilterBranch] = useState(defaultBranch)
  const [filterYear, setFilterYear]     = useState(new Date().getFullYear())
  const [filterFormType, setFilterFormType] = useState('')
  const [responses, setResponses]       = useState<EvalResponse[]>([])
  const [loading, setLoading]           = useState(false)
  const [expandedAssessee, setExpandedAssessee] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRank, setExpandedRank] = useState<string | null>(null) // 'overall-1', 'dept-OT-2', etc
  const [subTab, setSubTab] = useState<'overview' | 'by-department'>('overview')
  const [allStaff, setAllStaff] = useState<Array<{ id: string; firstName: string; lastName: string; department: string; branch: string }>>([])

  // Load full staff list (for "Per Department" view — so staff w/o evals still show)
  useEffect(() => {
    fetch('/api/staff').then(r => r.ok ? r.json() : []).then(setAllStaff).catch(() => undefined)
  }, [])

  const fetchResponses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterBranch) params.set('branch', filterBranch)
      if (filterYear) params.set('year', String(filterYear))
      if (filterFormType) params.set('formType', filterFormType)
      const res = await fetch(`/api/peer-eval/responses?${params}`)
      setResponses(await res.json())
    } finally { setLoading(false) }
  }, [filterBranch, filterYear, filterFormType])

  useEffect(() => { fetchResponses() }, [fetchResponses])

  const byAssessee = new Map<string, { assessee: StaffMini; responses: EvalResponse[] }>()
  for (const r of responses) {
    if (!byAssessee.has(r.assesseeId)) byAssessee.set(r.assesseeId, { assessee: r.assessee, responses: [] })
    byAssessee.get(r.assesseeId)!.responses.push(r)
  }
  const allAssesseeGroups = Array.from(byAssessee.values()).sort((a, b) => a.assessee.lastName.localeCompare(b.assessee.lastName))
  const assesseeGroups = searchQuery.trim()
    ? allAssesseeGroups.filter(g => {
        const q = searchQuery.toLowerCase().trim()
        const fn = g.assessee.firstName.toLowerCase()
        const ln = g.assessee.lastName.toLowerCase()
        return fn.includes(q) || ln.includes(q) || (ln + ' ' + fn).includes(q) || (fn + ' ' + ln).includes(q) || g.assessee.department.toLowerCase().includes(q)
      })
    : allAssesseeGroups

  function avgScores(resps: EvalResponse[]) {
    if (resps.length === 0) return {}
    const totals: Record<string, number> = {}
    const counts: Record<string, number> = {}
    for (const r of resps) {
      for (const [k, v] of Object.entries(r.scores)) {
        totals[k] = (totals[k] ?? 0) + v
        counts[k] = (counts[k] ?? 0) + 1
      }
    }
    return Object.fromEntries(Object.keys(totals).map(k => [k, totals[k] / counts[k]]))
  }

  function overallAvg(avgs: Record<string, number>) {
    const vals = Object.values(avgs)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  const formTypeForQuestions = (filterFormType || 'HR08_PEER') as PeerEvalType
  const questions = getQuestions(formTypeForQuestions)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <select value={filterFormType} onChange={e => setFilterFormType(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="HR08_ADMIN">HR08 Admin</option>
          <option value="HR08_PEER">HR08 Peer</option>
          <option value="HR09">HR09</option>
        </select>
        {!defaultBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={selectStyle}>
            <option value="">All Branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}
        <select value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} style={selectStyle}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={fetchResponses} style={{ ...iconBtnStyle, marginLeft: 'auto' }} title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Sub-tab switcher inside Results */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {([
          { id: 'overview' as const,      label: 'Overview' },
          { id: 'by-department' as const, label: 'Per Department Rankings' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600,
              color: subTab === t.id ? '#4a8073' : '#6b7280',
              borderBottom: subTab === t.id ? '2px solid #4a8073' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'by-department' && (
        <PerDepartmentRankings
          groups={allAssesseeGroups}
          allStaff={allStaff}
          filterBranch={filterBranch}
        />
      )}

      {subTab === 'overview' && (
        <>
      {/* Leaderboards first (hidden when user is searching) */}
      {!searchQuery && allAssesseeGroups.length > 0 && (
        <PeerEvalLeaderboards
          groups={allAssesseeGroups}
          expandedRank={expandedRank}
          onExpand={setExpandedRank}
        />
      )}

      {/* Search bar BELOW the Top 5 */}
      <div style={{ marginTop: 20, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or department..."
            style={{
              width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8,
              border: '1.5px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
              background: '#fff',
            }}
          />
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#9ca3af', fontSize: '0.9rem', pointerEvents: 'none',
          }}>🔍</span>
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
              background: '#fff', fontSize: '0.78rem', fontWeight: 600,
              color: '#6b7280', cursor: 'pointer',
            }}
          >Clear</button>
        )}
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {searchQuery ? `${assesseeGroups.length} of ${allAssesseeGroups.length}` : `${allAssesseeGroups.length} assessees`}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>Loading…</div>
      ) : assesseeGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: '0.85rem' }}>No results found for this period.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assesseeGroups.map(({ assessee, responses: resps }) => {
            const avgs = avgScores(resps)
            const overall = overallAvg(avgs)
            const isExpanded = expandedAssessee === assessee.id
            const qSet = resps.length > 0 ? getQuestions(resps[0].formType) : questions
            const strengths = resps.map(r => r.strengths).filter(Boolean) as string[]
            const improvements = resps.map(r => r.improvements).filter(Boolean) as string[]

            return (
              <div key={assessee.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <button
                  onClick={() => setExpandedAssessee(isExpanded ? null : assessee.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>{fullName(assessee)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{assessee.department} · {resps.length} evaluation{resps.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ padding: '4px 12px', borderRadius: 99, fontWeight: 700, fontSize: '0.9rem', background: '#f0fdf4', color: scoreColor(overall) }}>
                    {overall.toFixed(1)} / 5
                  </div>
                  <span
                    role="button"
                    title="Download PDF"
                    onClick={(e) => {
                      e.stopPropagation()
                      const formType = resps[0]?.formType ?? 'HR08_PEER'
                      const qSet = getQuestions(formType)
                      generatePeerEvalResultPDF({
                        assesseeName: fullName(assessee),
                        department: assessee.department,
                        branch: (assessee as unknown as { branch?: string }).branch,
                        overallAvg: overall,
                        questions: qSet,
                        averages: avgs,
                        responses: resps.map(r => ({
                          assessorName: fullName(r.assessor),
                          submittedAt: r.submittedAt,
                          overallAvg: overallAvg(r.scores),
                          scores: r.scores,
                          strengths: r.strengths,
                          improvements: r.improvements,
                        })),
                      })
                    }}
                    style={{ padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: '#4a8073', border: '1px solid #c8dcd8', background: '#fff', cursor: 'pointer' }}
                  >
                    <Download size={12} /> PDF
                  </span>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28 }}>
                    {Object.keys(qSet).map(k => {
                      const val = avgs[k] ?? 0
                      const h = Math.round((val / 5) * 24) + 4
                      return <div key={k} title={`${k.toUpperCase()}: ${val.toFixed(1)}`} style={{ width: 6, height: h, borderRadius: 2, background: scoreColor(val), opacity: 0.75 }} />
                    })}
                  </div>
                  {isExpanded ? <ChevronUp size={16} style={{ color: '#9ca3af', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />}
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
                      {Object.entries(qSet).map(([key, label]) => {
                        const avg = avgs[key] ?? 0
                        return (
                          <div key={key} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, marginBottom: 2 }}>{key.toUpperCase()}</div>
                            <div style={{ fontSize: '0.77rem', color: '#374151', lineHeight: 1.4, marginBottom: 6 }}>{label}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ width: `${(avg / 5) * 100}%`, height: '100%', background: scoreColor(avg), borderRadius: 99 }} />
                              </div>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: scoreColor(avg), minWidth: 28, textAlign: 'right' }}>{avg.toFixed(1)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {(strengths.length > 0 || improvements.length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {strengths.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strengths</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {strengths.map((s, i) => <div key={i} style={{ padding: '6px 10px', background: '#f0fdf4', borderRadius: 6, fontSize: '0.78rem', color: '#166534', borderLeft: '3px solid #4ade80' }}>{s}</div>)}
                            </div>
                          </div>
                        )}
                        {improvements.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Areas for Improvement</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {improvements.map((s, i) => <div key={i} style={{ padding: '6px 10px', background: '#fffbeb', borderRadius: 6, fontSize: '0.78rem', color: '#92400e', borderLeft: '3px solid #fbbf24' }}>{s}</div>)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 12, fontSize: '0.75rem', color: '#9ca3af' }}>
                      Evaluated by: {resps.map(r => fullName(r.assessor)).join(', ')}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────

function GenerateTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''
  const isAdmin = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN'].includes(role)

  const [formType, setFormType] = useState<PeerEvalType>('HR08_PEER')
  const [branch, setBranch]     = useState(defaultBranch || 'SBEA')
  const [year, setYear]         = useState(new Date().getFullYear())
  const [month, setMonth]       = useState(new Date().getMonth() + 1)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)
  const [genError, setGenError] = useState('')

  if (!isAdmin) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>You need Admin access to generate assignments.</div>
  }

  async function handleGenerate() {
    if (!confirm(`Generate ${formType} assignments for ${branchLabel(branch)} — ${year}?\n\nDuplicate assignments will be skipped automatically.`)) return
    setGenerating(true); setResult(null); setGenError('')
    try {
      const body: Record<string, any> = { formType, branch, year }
      const res = await fetch('/api/peer-eval/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) setGenError(data.error ?? 'Generation failed')
      else setResult(data)
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const descMap: Record<PeerEvalType, string> = {
    HR08_ADMIN: 'Administration staff will assess ALL clinical staff in the selected branch. Annual.',
    HR08_PEER:  'Clinical staff are paired with same-department, same-work-day peers. Each assessee receives 2–3 assessors. Annual.',
    HR09:       'Each admin staff member is assessed by at least 10 randomly selected clinical staff. Annual.',
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={cardLabelStyle}>Evaluation Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['HR08_ADMIN', 'HR08_PEER', 'HR09'] as PeerEvalType[]).map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${formType === t ? '#1a7b8a' : '#e5e7eb'}`, background: formType === t ? '#f0f9ff' : '#fff' }}>
                <input type="radio" name="formType" value={t} checked={formType === t} onChange={() => setFormType(t)} style={{ marginTop: 2, accentColor: '#1a7b8a' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#111827' }}>{t.replace('_', ' ')}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.4, marginTop: 2 }}>{descMap[t]}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!defaultBranch && (
            <div style={cardStyle}>
              <div style={cardLabelStyle}>Branch</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['SBEA', 'SBGH'].map(b => (
                  <button key={b} onClick={() => setBranch(b)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${branch === b ? '#1a7b8a' : '#e5e7eb'}`, background: branch === b ? '#f0f9ff' : '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', color: branch === b ? '#1a7b8a' : '#374151' }}>
                    {branchLabel(b)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={cardStyle}>
            <div style={cardLabelStyle}>Period</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ ...selectStyle, flex: 1 }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>All assignments are annual</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 8, border: 'none', background: generating ? '#9ca3af' : '#1a7b8a', color: '#fff', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
        >
          <Zap size={16} />
          {generating ? 'Generating…' : `Generate ${formType} Assignments`}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 16, padding: '14px 18px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
          <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 6, fontSize: '0.85rem' }}>Generation Complete</div>
          <div style={{ display: 'flex', gap: 20, fontSize: '0.82rem', color: '#374151' }}>
            <div><span style={{ fontWeight: 700, color: '#059669', fontSize: '1.1rem' }}>{result.created}</span> created</div>
            <div><span style={{ fontWeight: 700, color: '#9ca3af', fontSize: '1.1rem' }}>{result.skipped}</span> skipped (duplicates)</div>
          </div>
          {result.errors.length > 0 && <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#b91c1c' }}>Errors: {result.errors.join(', ')}</div>}
        </div>
      )}

      {genError && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem', display: 'flex', gap: 8 }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} /> {genError}
        </div>
      )}

      <div style={{ marginTop: 24, padding: '16px', background: '#fafafa', borderRadius: 10, border: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: 10 }}>Assignment Logic Reference</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.76rem', color: '#6b7280', lineHeight: 1.6 }}>
          <div><span style={{ fontWeight: 600, color: '#5b21b6' }}>HR08 Admin:</span> Each Administration staff → assesses all clinical staff in same branch. Annual.</div>
          <div><span style={{ fontWeight: 600, color: '#1e40af' }}>HR08 Peer:</span> Clinical staff → same-department peers sharing at least 1 work day. 2–3 assessors per assessee. Annual.</div>
          <div><span style={{ fontWeight: 600, color: '#9d174d' }}>HR09:</span> Each admin staff member is assessed by at least 10 randomly selected clinical staff in the branch. Annual.</div>
        </div>
        <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#9ca3af' }}>
          Staff fill out evaluations via the internal form at <strong>/peereval</strong> (accessible by QR code, no login required).
          Duplicate assignments are skipped automatically.
        </div>
      </div>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''

  const [filterBranch, setFilterBranch] = useState(defaultBranch || 'SBEA')
  const [configs, setConfigs]   = useState<AdminConfig[]>([])
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; created: number; updated: number; errors: string[] } | null>(null)
  const [error, setError]       = useState('')
  const [editDays, setEditDays] = useState<Record<string, string[]>>({})

  const fetchConfigs = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/peer-eval/admin-config?branch=${filterBranch}`)
      if (!res.ok) throw new Error('Failed to load configs')
      const data: AdminConfig[] = await res.json()
      setConfigs(data)
      const init: Record<string, string[]> = {}
      data.forEach(c => { init[c.staffId] = c.workDays })
      setEditDays(init)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [filterBranch])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  function toggleDay(staffId: string, day: string) {
    setEditDays(prev => {
      const current = prev[staffId] ?? []
      return { ...prev, [staffId]: current.includes(day) ? current.filter(d => d !== day) : [...current, day] }
    })
  }

  async function saveConfig(config: AdminConfig) {
    setSavingId(config.staffId)
    try {
      const res = await fetch('/api/peer-eval/admin-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: config.staffId, workDays: editDays[config.staffId] ?? [], branch: config.branch }),
      })
      if (!res.ok) throw new Error('Save failed')
      await fetchConfigs()
    } catch (e: any) {
      setError(e.message)
    } finally { setSavingId(null) }
  }

  async function handleSync() {
    if (!confirm('Sync admin staff from HR Platform? This will auto-create configs for any Administration staff not yet configured.')) return
    setSyncing(true); setSyncResult(null); setError('')
    try {
      const res = await fetch('/api/peer-eval/admin-config', { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResult(data)
      await fetchConfigs()
    } catch (e: any) {
      setError(e.message)
    } finally { setSyncing(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={16} style={{ color: '#1a7b8a' }} />
          Admin Staff Work Days
        </div>
        {!defaultBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={selectStyle}>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}
        <button onClick={fetchConfigs} style={{ ...iconBtnStyle }} title="Refresh"><RefreshCw size={15} /></button>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #a7f3d0', background: syncing ? '#f3f4f6' : '#f0fdf4', color: '#065f46', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
        >
          <RefreshCw size={14} />
          {syncing ? 'Syncing…' : 'Sync from HR Platform'}
        </button>
      </div>

      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', fontSize: '0.78rem', color: '#0369a1' }}>
        Admin staff (Administration department) are sourced from <strong>HR Platform → Staff Profiles</strong>.
        Use &quot;Sync from HR Platform&quot; to import or update the list.
        Configure which days each admin is in the clinic — used for scheduling context.
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem', display: 'flex', gap: 8 }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {syncResult && (
        <div style={{ marginBottom: 14, padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: '0.82rem' }}>
          <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 4 }}>Sync complete</div>
          <div style={{ color: '#374151' }}>{syncResult.created} created · {syncResult.updated} already configured</div>
          {syncResult.errors.length > 0 && <div style={{ marginTop: 6, color: '#b91c1c', fontSize: '0.75rem' }}>{syncResult.errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>Loading…</div>
      ) : configs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
          No admin staff configured. Use &quot;Sync from HR Platform&quot; to import.
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle}>Staff Member</th>
                <th style={thStyle}>Branch</th>
                <th style={{ ...thStyle, minWidth: 320 }}>Work Days in Clinic</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Save</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c, idx) => {
                const days = editDays[c.staffId] ?? c.workDays
                const saved = JSON.stringify(days.slice().sort()) === JSON.stringify((c.workDays as string[]).slice().sort())
                return (
                  <tr key={c.staffId} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{c.staff.firstName} {c.staff.lastName}</div>
                      {c.staff.jobTitle && <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{c.staff.jobTitle}</div>}
                    </td>
                    <td style={tdStyle}>{branchLabel(c.branch) ?? c.branch}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {DAYS_OF_WEEK.map(day => (
                          <button
                            key={day}
                            onClick={() => toggleDay(c.staffId, day)}
                            style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: days.includes(day) ? '1.5px solid #1a7b8a' : '1.5px solid #e5e7eb', background: days.includes(day) ? '#f0f9ff' : '#f9fafb', color: days.includes(day) ? '#1a7b8a' : '#9ca3af' }}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button
                        onClick={() => saveConfig(c)}
                        disabled={saved || savingId === c.staffId}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: 'none', fontSize: '0.75rem', fontWeight: 600, cursor: saved ? 'default' : 'pointer', background: saved ? '#f3f4f6' : '#1a7b8a', color: saved ? '#9ca3af' : '#fff' }}
                      >
                        <Save size={12} />
                        {savingId === c.staffId ? 'Saving…' : saved ? 'Saved' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', fontSize: '0.82rem', color: '#374151', cursor: 'pointer',
}

const iconBtnStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center',
}

const smallBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
  borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: '0.74rem',
  fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', verticalAlign: 'middle',
}

const cardStyle: React.CSSProperties = {
  padding: '14px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
}

const cardLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 10,
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'assignments' | 'by-assessee' | 'results' | 'generate' | 'settings'

export default function PeerEvalClient({ role }: { role: string }) {
  const isFrontDesk = ['AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)
  const isMainAdmin = ['ADMIN', 'MARKETING_ADMIN'].includes(role)

  const defaultBranch = role === 'AHEA_ADMIN' || role === 'AHEA_FRONT_DESK' ? 'SBEA'
                      : role === 'AHGH_ADMIN' || role === 'AHGH_FRONT_DESK' ? 'SBGH'
                      : ''

  const [activeTab, setActiveTab] = useState<Tab>('assignments')

  const allTabs: { id: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: 'assignments',  label: 'Assignments',  icon: <ClipboardList size={15} />, visible: true },
    { id: 'by-assessee',  label: 'By Assessee',  icon: <Users size={15} />,         visible: isMainAdmin },
    { id: 'results',      label: 'Results',      icon: <BarChart3 size={15} />,     visible: isMainAdmin },
    { id: 'generate',     label: 'Generate',     icon: <Zap size={15} />,           visible: !isFrontDesk },
    { id: 'settings',     label: 'Settings',     icon: <Settings size={15} />,      visible: isMainAdmin },
  ]
  const tabs = allTabs.filter(t => t.visible)

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <UsersRound size={22} style={{ color: '#1a7b8a' }} />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: 0 }}>Peer Evaluation</h1>
          <span style={{ padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em' }}>BETA</span>
        </div>
        <p style={{ fontSize: '0.83rem', color: '#6b7280', margin: 0 }}>
          Manage HR08 and HR09 peer evaluation assignments and responses.
        </p>
      </div>

      {defaultBranch && <NotificationBanner branch={defaultBranch} />}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: activeTab === t.id ? 700 : 500,
              fontSize: '0.85rem',
              color: activeTab === t.id ? '#1a7b8a' : '#6b7280',
              borderBottom: activeTab === t.id ? '2px solid #1a7b8a' : '2px solid transparent',
              marginBottom: -2,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px' }}>
        {activeTab === 'assignments'  && (isFrontDesk ? <FrontDeskPendingView role={role} /> : <AssignmentsTab role={role} />)}
        {activeTab === 'by-assessee' && isMainAdmin   && <ByAssesseeTab role={role} />}
        {activeTab === 'results'     && isMainAdmin   && <ResultsTab role={role} />}
        {activeTab === 'generate'    && !isFrontDesk  && <GenerateTab role={role} />}
        {activeTab === 'settings'    && isMainAdmin   && <SettingsTab role={role} />}
      </div>
    </div>
  )
}


// ─── Per-Department Rankings (all staff, high → low) ────────────────────────
// Shows every staff member in each department ranked by overall peer-eval
// score. Staff without any evaluations still appear at the bottom so gaps
// in coverage are visible at a glance.

function PerDepartmentRankings({
  groups,
  allStaff,
  filterBranch,
}: {
  groups: { assessee: StaffMini; responses: EvalResponse[] }[]
  allStaff: Array<{ id: string; firstName: string; lastName: string; department: string; branch: string }>
  filterBranch: string
}) {
  // Build lookup of peer-eval data per staffId
  const evalByStaff = new Map<string, { overall: number; responseCount: number }>()
  for (const g of groups) {
    const allScores = g.responses.flatMap(r => Object.values(r.scores))
    const overall = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0
    evalByStaff.set(g.assessee.id, { overall, responseCount: g.responses.length })
  }

  // Filter by branch if set
  const staffPool = filterBranch ? allStaff.filter(s => s.branch === filterBranch) : allStaff

  // Group by department
  const deptMap = new Map<string, Array<{
    id: string; name: string; department: string; branch: string;
    overall: number; responseCount: number; hasData: boolean
  }>>()
  for (const st of staffPool) {
    const ev = evalByStaff.get(st.id)
    const entry = {
      id: st.id,
      name: st.firstName + ' ' + st.lastName,
      department: st.department,
      branch: st.branch,
      overall: ev?.overall ?? 0,
      responseCount: ev?.responseCount ?? 0,
      hasData: !!ev,
    }
    if (!deptMap.has(st.department)) deptMap.set(st.department, [])
    deptMap.get(st.department)!.push(entry)
  }

  // Sort depts alphabetically, sort entries high→low (eval-less staff last)
  const depts = Array.from(deptMap.keys()).sort()
  const medalColors = ['#f59e0b', '#94a3b8', '#cd7f32']

  if (depts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
        No staff on record{filterBranch ? ' for this branch' : ''}.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
      {depts.map(dept => {
        const ranked = deptMap.get(dept)!.slice().sort((a, b) => {
          if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
          return b.overall - a.overall
        })
        // Compute rank positions (tied = same rank, next rank skips)
        let prevScore: number | null = null
        let currentRank = 0
        const ranks: number[] = []
        ranked.forEach((r, i) => {
          if (!r.hasData) {
            ranks.push(-1)
            return
          }
          if (prevScore === null || r.overall !== prevScore) {
            currentRank = i + 1
            prevScore = r.overall
          }
          ranks.push(currentRank)
        })

        const withData = ranked.filter(r => r.hasData).length

        return (
          <div key={dept} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px', background: '#FFF3E8', borderBottom: '1px solid #FDE4CC',
            }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Department{filterBranch ? ` · ${filterBranch}` : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#7c2d12' }}>{dept}</div>
                <div style={{ fontSize: '0.7rem', color: '#9a3412' }}>
                  {ranked.length} staff · {withData} with evals
                </div>
              </div>
            </div>

            <div>
              {ranked.map((r, i) => {
                const rank = ranks[i]
                const medal = rank > 0 && rank <= 3 ? medalColors[rank - 1] : undefined
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', borderTop: '1px solid #f3f4f6',
                    background: rank === 1 ? '#FFFBEB' : r.hasData ? '#fff' : '#fafafa',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: medal ? medal + '20' : r.hasData ? '#f1f5f9' : '#f3f4f6',
                      color: medal ?? '#94a3b8',
                      fontWeight: 800, fontSize: '0.78rem',
                    }}>
                      {r.hasData ? rank : '—'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.85rem', fontWeight: 600,
                        color: r.hasData ? '#111827' : '#9ca3af',
                        lineHeight: 1.3,
                      }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 1 }}>
                        {r.hasData
                          ? (r.responseCount + ' eval' + (r.responseCount !== 1 ? 's' : ''))
                          : 'No evaluations yet'}
                        {' · '}
                        <span style={{ color: '#9ca3af' }}>{branchLabel(r.branch) ?? r.branch}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {r.hasData ? (
                        <>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: rank === 1 ? '#f59e0b' : '#0f766e', lineHeight: 1 }}>
                            {r.overall.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            of 5
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.7rem', color: '#d1d5db', fontStyle: 'italic' }}>no data</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Peer Eval Leaderboards ──────────────────────────────────────────────────
// Top 5 by overall average score, across three groupings:
//   • Overall (all branches, all depts)
//   • Per branch (SBEA / SBGH)
//   • Per department (OT, PT, SLP, etc.)
// Tied ranks are collapsed into one row; click to reveal each member.

interface PeerEvalLeaderEntry {
  id: string
  name: string
  department: string
  branch?: string
  overall: number
  responseCount: number
}

interface PeerEvalRankGroup {
  rank: number
  score: number
  members: PeerEvalLeaderEntry[]
}

function groupByScoreDesc(entries: PeerEvalLeaderEntry[], n: number): PeerEvalRankGroup[] {
  const sorted = [...entries].sort((a, b) => b.overall - a.overall)
  const groups: PeerEvalRankGroup[] = []
  const seen: number[] = []
  for (const e of sorted) {
    // round to 2 decimals for grouping so 4.15 and 4.1500001 count the same
    const k = Math.round(e.overall * 100) / 100
    if (seen.length === 0 || k !== seen[seen.length - 1]) {
      if (seen.length >= n) break
      seen.push(k)
      groups.push({ rank: seen.length, score: k, members: [e] })
    } else {
      groups[groups.length - 1].members.push(e)
    }
  }
  return groups
}

function PeerEvalLeaderboards({
  groups,
  expandedRank,
  onExpand,
}: {
  groups: { assessee: StaffMini; responses: EvalResponse[] }[]
  expandedRank: string | null
  onExpand: (key: string | null) => void
}) {
  // Flatten to entries with each assessee's overall average
  const entries: PeerEvalLeaderEntry[] = groups.map(g => {
    const allScores = g.responses.flatMap(r => Object.values(r.scores))
    const overall = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0
    return {
      id:           g.assessee.id,
      name:         `${g.assessee.firstName} ${g.assessee.lastName}`,
      department:   g.assessee.department,
      branch:       (g.assessee as unknown as { branch?: string }).branch,
      overall,
      responseCount: g.responses.length,
    }
  })

  const overallTop = groupByScoreDesc(entries, 5)

  // Per branch
  const branches = [...new Set(entries.map(e => e.branch).filter(Boolean) as string[])].sort()
  const byBranch: Record<string, PeerEvalRankGroup[]> = {}
  for (const b of branches) {
    byBranch[b] = groupByScoreDesc(entries.filter(e => e.branch === b), 5)
  }

  // Per department
  const depts = [...new Set(entries.map(e => e.department))].sort()
  const byDept: Record<string, PeerEvalRankGroup[]> = {}
  for (const d of depts) {
    byDept[d] = groupByScoreDesc(entries.filter(e => e.department === d), 5)
  }

  return (
    <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LeaderboardSection title="Top 5 — Overall" groups={overallTop} keyPrefix="overall" expandedRank={expandedRank} onExpand={onExpand} />

      {branches.length > 0 && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Top 5 — Per Branch
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
            {branches.map(b => (
              <LeaderboardSection
                key={b}
                title={b === 'SBEA' ? 'East Branch' : b === 'SBGH' ? 'Greenhills Branch' : b}
                subtitle="Branch"
                groups={byBranch[b]}
                keyPrefix={'branch-' + b}
                expandedRank={expandedRank}
                onExpand={onExpand}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {depts.length > 0 && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Top 5 — Per Department
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {depts.map(d => (
              <LeaderboardSection
                key={d}
                title={d}
                subtitle="Department"
                groups={byDept[d]}
                keyPrefix={'dept-' + d}
                expandedRank={expandedRank}
                onExpand={onExpand}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LeaderboardSection({
  title,
  subtitle,
  groups,
  keyPrefix,
  expandedRank,
  onExpand,
  compact,
}: {
  title: string
  subtitle?: string
  groups: PeerEvalRankGroup[]
  keyPrefix: string
  expandedRank: string | null
  onExpand: (key: string | null) => void
  compact?: boolean
}) {
  const medalColors = ['#f59e0b', '#94a3b8', '#cd7f32']

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: compact ? '10px 12px' : '12px 16px',
        background: '#FFF3E8', borderBottom: '1px solid #FDE4CC',
      }}>
        {subtitle && (
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {subtitle}
          </div>
        )}
        <div style={{ fontSize: compact ? '0.88rem' : '1rem', fontWeight: 700, color: '#7c2d12' }}>
          {title}
        </div>
      </div>
      {groups.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem' }}>
          No data yet
        </div>
      ) : (
        <div>
          {groups.map(g => {
            const tied = g.members.length > 1
            const key = keyPrefix + '-' + g.rank
            const expanded = expandedRank === key
            const medal = g.rank <= 3 ? medalColors[g.rank - 1] : undefined
            const names = g.members.map(m => m.name).join(', ')
            return (
              <div key={key} style={{ borderTop: '1px solid #f3f4f6' }}>
                <div
                  onClick={() => tied && onExpand(expanded ? null : key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: compact ? '8px 12px' : '10px 16px',
                    background: g.rank === 1 ? '#FFFBEB' : '#fff',
                    cursor: tied ? 'pointer' : 'default',
                  }}
                >
                  <div style={{
                    width: compact ? 26 : 30, height: compact ? 26 : 30, borderRadius: '50%',
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: medal ? medal + '20' : '#f1f5f9',
                    color: medal ?? '#94a3b8',
                    fontWeight: 800, fontSize: '0.82rem',
                  }}>
                    {g.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: compact ? '0.78rem' : '0.85rem', fontWeight: 700, color: '#111827', lineHeight: 1.3, wordBreak: 'break-word' }}>
                      {names}
                    </div>
                    {tied ? (
                      <div style={{ fontSize: '0.68rem', color: '#c69849', fontWeight: 600, marginTop: 2 }}>
                        {expanded ? '▾ Hide' : '▸ Tap'} · {g.members.length} tied
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 2 }}>
                        {g.members[0].department}{g.members[0].branch ? ' · ' + (branchLabel(g.members[0].branch) ?? g.members[0].branch) : ''} · {g.members[0].responseCount} eval{g.members[0].responseCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: compact ? '0.95rem' : '1.1rem', fontWeight: 800, color: g.rank === 1 ? '#f59e0b' : '#0f766e', lineHeight: 1 }}>
                      {g.score.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.56rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      of 5
                    </div>
                  </div>
                </div>

                {tied && expanded && (
                  <div style={{ background: '#FFFBEB', padding: '4px 12px 10px 44px', borderTop: '1px dashed #FDE4CC' }}>
                    {g.members.map(m => (
                      <div key={m.id} style={{
                        padding: '6px 0', borderTop: '1px dashed #FDE4CC', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ color: '#1f2937', flex: 1, fontWeight: 600 }}>{m.name}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>{m.department}{m.branch ? ' · ' + (branchLabel(m.branch) ?? m.branch) : ''}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>{m.responseCount} eval{m.responseCount !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

