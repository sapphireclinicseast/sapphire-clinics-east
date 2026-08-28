'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ChevronLeft, CheckCircle2, AlertCircle, ClipboardList, Clock } from 'lucide-react'

// ─── Brand colors ──────────────────────────────────────────────────────────────
const B = {
  orange:     '#F47427',
  orangeLight:'#FFF4EE',
  orangeMid:  '#FDDCB5',
  teal:       '#2E5E5A',
  tealLight:  '#E8F0EE',
  charcoal:   '#1C2B30',
  gray:       '#6B7280',
  grayLight:  '#F3F4F6',
  border:     '#E5E7EB',
  white:      '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FormType = 'HR08_ADMIN' | 'HR08_PEER' | 'HR09'

interface StaffMini {
  id: string
  firstName: string
  lastName: string
  department: string
}

interface Assignment {
  id: string
  formType: FormType
  assessorId: string
  assesseeId: string
  branch: string
  periodYear: number
  periodMonth: number
  status: string
  assessor: StaffMini
  assessee: StaffMini
}

// ─── Questions ────────────────────────────────────────────────────────────────

const HR08_QUESTIONS: Record<string, string> = {
  q1:  'Addresses the unique needs of each client in their sessions',
  q2:  'Demonstrates quality in therapeutic interventions',
  q3:  'Communicates clearly and builds rapport with clients and families',
  q4:  'Upholds professionalism and ethical standards',
  q5:  'Adapts to changing client needs and situations',
  q6:  'Effectively supports client progress and outcomes',
  q7:  'Applies evidence-based practices in treatment',
  q8:  'Collaborates well with other professionals',
  q9:  'Is friendly, approachable, and easy to work with',
  q10: 'Fosters positive working relationships with the team',
}

const HR09_QUESTIONS: Record<string, string> = {
  q1: 'Interacts with staff and clients in a warm, respectful manner',
  q2: 'Carries out administrative responsibilities with care and accuracy',
  q3: 'Communicates clearly and professionally',
  q4: 'Maintains professionalism in behavior and appearance',
  q5: 'Responds well to requests and adapts to changing needs',
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function getQuestions(formType: FormType) {
  return formType === 'HR09' ? HR09_QUESTIONS : HR08_QUESTIONS
}

function getFormLabel(formType: FormType) {
  const map: Record<FormType, string> = {
    HR08_ADMIN: 'HR08 — Technical Staff Evaluation (Admin perspective)',
    HR08_PEER:  'HR08 — Technical Staff Peer Evaluation',
    HR09:       'HR09 — Admin Staff Evaluation',
  }
  return map[formType]
}

function getPeriodLabel(_formType: FormType, year: number, month: number) {
  if (month > 0) return `${MONTH_NAMES[month - 1]} ${year}`
  return `${year}`
}

function scoreColor(score: number) {
  if (score >= 4) return '#059669'
  if (score >= 3) return B.teal
  if (score >= 2) return B.orange
  return '#dc2626'
}

const SCORE_LABELS: Record<number, string> = {
  0: 'N/A', 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent',
}

// ─── Header ───────────────────────────────────────────────────────────────────

const BRANCH_NAMES: Record<string, string> = {
  SBEA: 'Sandbox Clinics East',
  SBGH: 'Sandbox Clinics Greenhills',
}

function Header({ branch }: { branch?: string }) {
  const label = branch ? (BRANCH_NAMES[branch] ?? 'Sandbox Clinics') : 'Sandbox Clinics'
  return (
    <div style={{
      background: B.charcoal,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      height: 60,
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    }}>
      <Image src="/sandbox-clinic-logo.png" alt="Sandbox Clinic" width={36} height={36} style={{ objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: B.white, letterSpacing: '0.01em' }}>
          {label}
        </div>
        <div style={{ fontSize: '0.68rem', color: B.orange, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Peer Evaluation Form
        </div>
      </div>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: B.orange }} />
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ active, done }: { active?: boolean; done?: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: done ? B.orange : active ? B.orange : B.border,
      opacity: done || active ? 1 : 0.5,
      transition: 'background 0.2s',
    }} />
  )
}

// ─── Branch Picker ────────────────────────────────────────────────────────────

function BranchPicker({ onSelect }: { onSelect: (branch: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '44px 24px 32px', gap: 28 }}>
      {/* Orange accent bar */}
      <div style={{ width: 40, height: 4, borderRadius: 2, background: B.orange }} />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: B.charcoal, marginBottom: 6, letterSpacing: '-0.02em' }}>
          Welcome
        </div>
        <div style={{ fontSize: '0.88rem', color: B.gray }}>
          Select your clinic branch to continue
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { id: 'SBEA', label: 'Sandbox East', sub: 'SBEA' },
          { id: 'SBGH', label: 'Sandbox Greenhills', sub: 'SBGH' },
        ].map(b => (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            style={{
              width: 190, padding: '28px 20px 22px', borderRadius: 16,
              border: `2px solid ${B.border}`,
              background: B.white, cursor: 'pointer', textAlign: 'center',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = B.orange
              e.currentTarget.style.boxShadow = `0 4px 20px rgba(244,116,39,0.18)`
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = B.border
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: B.orangeLight,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px', fontSize: '1.5rem',
            }}>🏥</div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: B.charcoal }}>{b.label}</div>
            <div style={{ fontSize: '0.72rem', color: B.orange, fontWeight: 600, marginTop: 4, letterSpacing: '0.06em' }}>{b.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Name Picker ──────────────────────────────────────────────────────────────

function NamePicker({
  branch, onSelect, onBack,
}: {
  branch: string
  onSelect: (staff: StaffMini) => void
  onBack: () => void
}) {
  const [staffList, setStaffList] = useState<StaffMini[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')

  useEffect(() => {
    fetch(`/api/peer-eval/public-form?branch=${branch}`)
      .then(r => r.json())
      .then(data => { setStaffList(data); setLoading(false) })
      .catch(() => { setError('Failed to load staff list'); setLoading(false) })
  }, [branch])

  const filtered = staffList.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '24px', maxWidth: 520, margin: '0 auto' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: B.orange, fontSize: '0.82rem', fontWeight: 600, marginBottom: 24, padding: 0 }}>
        <ChevronLeft size={16} /> Back
      </button>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: B.charcoal, marginBottom: 4, letterSpacing: '-0.01em' }}>
          Who are you?
        </div>
        <div style={{ fontSize: '0.83rem', color: B.gray }}>
          Select your name — only staff with pending evaluations are shown.
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 8,
          border: `1.5px solid ${B.border}`,
          fontSize: '0.88rem', color: B.charcoal, marginBottom: 12, boxSizing: 'border-box',
          outline: 'none', transition: 'border-color 0.15s',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = B.orange)}
        onBlur={e => (e.currentTarget.style.borderColor = B.border)}
        autoFocus
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: B.gray, fontSize: '0.85rem' }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem' }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: B.gray, fontSize: '0.85rem' }}>
          {staffList.length === 0 ? 'No pending evaluations for this branch.' : 'No staff matching your search.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderRadius: 10, border: `1.5px solid ${B.border}`, background: B.white,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = B.orange; e.currentTarget.style.background = B.orangeLight }}
              onMouseOut={e => { e.currentTarget.style.borderColor = B.border; e.currentTarget.style.background = B.white }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: B.orangeLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '0.88rem', color: B.orange, flexShrink: 0,
              }}>
                {s.firstName[0]}{s.lastName[0]}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: B.charcoal }}>{s.firstName} {s.lastName}</div>
                <div style={{ fontSize: '0.72rem', color: B.gray, marginTop: 1 }}>{s.department}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Assignments List ─────────────────────────────────────────────────────────

function AssignmentsList({
  assessor, branch, onSelect, onBack, completedIds,
}: {
  assessor: StaffMini
  branch: string
  onSelect: (a: Assignment) => void
  onBack: () => void
  completedIds: Set<string>
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    fetch(`/api/peer-eval/public-form?staffId=${assessor.id}`)
      .then(r => r.json())
      .then(data => { setAssignments(data); setLoading(false) })
      .catch(() => { setError('Failed to load assignments'); setLoading(false) })
  }, [assessor.id])

  const pending  = assignments.filter(a => !completedIds.has(a.id))
  const justDone = assignments.filter(a => completedIds.has(a.id))

  return (
    <div style={{ padding: '24px', maxWidth: 560, margin: '0 auto' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: B.orange, fontSize: '0.82rem', fontWeight: 600, marginBottom: 24, padding: 0 }}>
        <ChevronLeft size={16} /> Back
      </button>

      {/* Staff greeting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: B.orangeLight, borderRadius: 14, border: `1px solid ${B.orangeMid}`, marginBottom: 20 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: B.orange, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '1rem', color: B.white, flexShrink: 0,
        }}>
          {assessor.firstName[0]}{assessor.lastName[0]}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: B.charcoal }}>Hi, {assessor.firstName}!</div>
          <div style={{ fontSize: '0.78rem', color: B.gray, marginTop: 1 }}>Please complete all your pending evaluations below.</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: B.gray, fontSize: '0.85rem' }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem' }}>{error}</div>
      ) : assignments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <CheckCircle2 size={40} style={{ color: '#10b981', marginBottom: 12 }} />
          <div style={{ fontWeight: 700, color: '#059669', fontSize: '1rem' }}>All done!</div>
          <div style={{ color: B.gray, fontSize: '0.83rem', marginTop: 4 }}>You have no pending evaluations.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: B.orange, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Pending ({pending.length})
              </div>
              {pending.map(a => (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    borderRadius: 10, border: `1.5px solid ${B.border}`, background: B.white,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = B.orange; e.currentTarget.style.background = B.orangeLight }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = B.border; e.currentTarget.style.background = B.white }}
                >
                  <div style={{ flexShrink: 0, color: B.orange }}>
                    <Clock size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: B.charcoal }}>
                      Evaluate {a.assessee.firstName} {a.assessee.lastName}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: B.gray, marginTop: 2 }}>
                      {getFormLabel(a.formType)} · {getPeriodLabel(a.formType, a.periodYear, a.periodMonth)}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: B.orange, fontWeight: 700 }}>Start →</div>
                </button>
              ))}
            </>
          )}

          {justDone.length > 0 && (
            <>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 12, marginBottom: 4 }}>
                Completed this session ({justDone.length})
              </div>
              {justDone.map(a => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderRadius: 10, border: '1.5px solid #bbf7d0', background: '#f0fdf4',
                  }}
                >
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#065f46' }}>
                      {a.assessee.firstName} {a.assessee.lastName}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#059669' }}>Completed</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {pending.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle2 size={36} style={{ color: '#10b981', marginBottom: 8 }} />
              <div style={{ fontWeight: 700, color: '#059669' }}>All done! Thank you.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Eval Form ────────────────────────────────────────────────────────────────

function EvalForm({
  assignment, onBack, onSubmit,
}: {
  assignment: Assignment
  onBack: () => void
  onSubmit: (assignmentId: string) => void
}) {
  const questions = getQuestions(assignment.formType)
  const qKeys     = Object.keys(questions)
  const [scores, setScores]           = useState<Record<string, number>>(Object.fromEntries(qKeys.map(k => [k, 3])))
  const [strengths, setStrengths]     = useState('')
  const [improvements, setImprovements] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState('')

  async function handleSubmit() {
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/peer-eval/public-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: assignment.id, scores, strengths, improvements }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')
      setSubmitted(true)
      onSubmit(assignment.id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ padding: '56px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
        }}>
          <CheckCircle2 size={40} style={{ color: '#10b981' }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: B.charcoal, marginBottom: 8 }}>Evaluation Submitted!</div>
        <div style={{ color: B.gray, fontSize: '0.85rem', marginBottom: 28 }}>
          Your evaluation of <strong>{assignment.assessee.firstName} {assignment.assessee.lastName}</strong> has been recorded.
        </div>
        <button
          onClick={onBack}
          style={{
            padding: '12px 32px', borderRadius: 10, border: 'none',
            background: B.orange, color: B.white, cursor: 'pointer',
            fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.01em',
          }}
        >
          Back to My Evaluations
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: 600, margin: '0 auto', paddingBottom: 60 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: B.orange, fontSize: '0.82rem', fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Back
      </button>

      {/* Header card */}
      <div style={{
        padding: '16px 20px', background: B.orangeLight,
        borderRadius: 12, border: `1px solid ${B.orangeMid}`,
        borderLeft: `4px solid ${B.orange}`, marginBottom: 24,
      }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: B.orange, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          {getFormLabel(assignment.formType)}
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: B.charcoal }}>
          Evaluating: {assignment.assessee.firstName} {assignment.assessee.lastName}
        </div>
        <div style={{ fontSize: '0.78rem', color: B.gray, marginTop: 4 }}>
          {assignment.assessee.department} · {getPeriodLabel(assignment.formType, assignment.periodYear, assignment.periodMonth)}
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        marginBottom: 24, padding: '12px 16px',
        background: B.tealLight, borderRadius: 8,
        border: `1px solid ${B.teal}22`,
        fontSize: '0.8rem', color: B.teal,
      }}>
        Rate each item from <strong>1 (Poor)</strong> to <strong>5 (Excellent)</strong>. Select 0 if not applicable.
        Responses are confidential and used for professional development.
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
        {qKeys.map((key, idx) => (
          <div key={key} style={{ padding: '16px 18px', background: B.white, borderRadius: 10, border: `1.5px solid ${B.border}` }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: '0.7rem', color: B.orange, marginRight: 6 }}>{idx + 1}.</span>
              <span style={{ fontSize: '0.88rem', color: B.charcoal, fontWeight: 500 }}>{questions[key]}</span>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[0, 1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setScores(prev => ({ ...prev, [key]: v }))}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: '2px solid',
                    borderColor: scores[key] === v ? scoreColor(v) : B.border,
                    background: scores[key] === v ? scoreColor(v) : B.grayLight,
                    color: scores[key] === v ? B.white : '#374151',
                    cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                    transition: 'all 0.1s',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.72rem', color: B.gray, marginTop: 6 }}>
              Selected:{' '}
              <span style={{ fontWeight: 600, color: scoreColor(scores[key] ?? 3) }}>
                {SCORE_LABELS[scores[key] ?? 3]} ({scores[key] ?? 3})
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Text fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Strengths / Notable Contributions', value: strengths, onChange: setStrengths, placeholder: 'What does this person do particularly well?' },
          { label: 'Areas for Improvement', value: improvements, onChange: setImprovements, placeholder: 'What could this person improve on?' },
        ].map(({ label, value, onChange, placeholder }) => (
          <div key={label}>
            <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
              {label} <span style={{ fontWeight: 400, color: B.gray }}>(optional)</span>
            </label>
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              rows={3}
              placeholder={placeholder}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1.5px solid ${B.border}`,
                fontSize: '0.85rem', color: B.charcoal, resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = B.orange)}
              onBlur={e => (e.currentTarget.style.borderColor = B.border)}
            />
          </div>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.82rem', display: 'flex', gap: 8 }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: submitting ? '#9ca3af' : B.orange,
          color: B.white, cursor: submitting ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: submitting ? 'none' : '0 4px 14px rgba(244,116,39,0.35)',
          transition: 'all 0.15s',
        }}
      >
        <ClipboardList size={18} />
        {submitting ? 'Submitting…' : 'Submit Evaluation'}
      </button>

      <div style={{ marginTop: 12, textAlign: 'center', fontSize: '0.73rem', color: B.gray }}>
        Your response is confidential and will be reviewed by administrators only.
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Step = 'branch' | 'name' | 'list' | 'form'

export default function PeerEvalFormPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F8F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading…</div>}>
      <PeerEvalFormInner />
    </Suspense>
  )
}

function PeerEvalFormInner() {
  const searchParams = useSearchParams()
  const urlBranch  = searchParams.get('branch') ?? ''
  const urlStaffId = searchParams.get('staffId') ?? ''

  const [step, setStep]                         = useState<Step>(urlStaffId ? 'list' : urlBranch ? 'name' : 'branch')
  const [branch, setBranch]                     = useState(urlBranch)
  const [assessor, setAssessor]                 = useState<StaffMini | null>(null)
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null)
  const [completedIds, setCompletedIds]         = useState<Set<string>>(new Set())

  // If staffId is provided in URL, auto-load the staff member
  useEffect(() => {
    if (!urlStaffId) return
    fetch(`/api/peer-eval/public-form?staffId=${urlStaffId}`)
      .then(r => r.json())
      .then((data: Assignment[]) => {
        if (data.length > 0) {
          setAssessor(data[0].assessor)
          setBranch(data[0].branch)
        }
      })
      .catch(() => {})
  }, [urlStaffId])

  function handleBranchSelect(b: string) { setBranch(b); setStep('name') }
  function handleStaffSelect(s: StaffMini) { setAssessor(s); setStep('list') }
  function handleAssignmentSelect(a: Assignment) { setActiveAssignment(a); setStep('form') }
  function handleFormSubmit(id: string) {
    setCompletedIds(prev => new Set([...prev, id]))
    setTimeout(() => { setActiveAssignment(null); setStep('list') }, 2000)
  }

  const stepIndex = { branch: 0, name: 1, list: 2, form: 3 }[step]

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Header branch={branch} />

      {/* Step dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '14px 0 0' }}>
        {[0, 1, 2, 3].map(i => (
          <StepDot key={i} active={stepIndex === i} done={stepIndex > i} />
        ))}
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 4 }}>
        {step === 'branch' && <BranchPicker onSelect={handleBranchSelect} />}
        {step === 'name'   && <NamePicker branch={branch} onSelect={handleStaffSelect} onBack={() => setStep('branch')} />}
        {step === 'list'   && assessor && (
          <AssignmentsList assessor={assessor} branch={branch} onSelect={handleAssignmentSelect} onBack={() => { if (urlStaffId) { /* can't go back if deep-linked */ } else setStep('name') }} completedIds={completedIds} />
        )}
        {step === 'form'   && activeAssignment && (
          <EvalForm assignment={activeAssignment} onBack={() => setStep('list')} onSubmit={handleFormSubmit} />
        )}
      </div>
    </div>
  )
}
