'use client'

/**
 * Wellness Check page — Therapist Wellness Survey.
 * 6 sections from the HR-supplied DOCX, faithfully ported:
 *   1  Identification (Anonymous / Named)
 *   2  Wellness Rating Scale (12 statements, 0–5)
 *   3  Grievances
 *   4  Recommendations
 *   5  Final Reflection (overall 0–5 + free text)
 *   6  Follow-Up Preference
 * Posts to /api/wellness-check which proxies to HR's
 * /internal/wellness-survey. Anonymous submissions never carry the
 * user's name/department to HR (the proxy strips them server-side
 * regardless of what this form sends).
 */

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  HeartPulse,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  UserRound,
  EyeOff,
} from 'lucide-react'

// Single source of truth for the 12 Section-2 statements. IDs match
// the HR backend (q1..q12). Order = the order rows render.
const STATEMENTS: { id: string; text: string }[] = [
  { id: 'q1',  text: 'I feel physically well and energized at work.' },
  { id: 'q2',  text: 'I feel mentally and emotionally supported in my role.' },
  { id: 'q3',  text: 'My workload is manageable and reasonable.' },
  { id: 'q4',  text: 'I have a healthy work-life balance.' },
  { id: 'q5',  text: 'I feel respected and valued by management.' },
  { id: 'q6',  text: 'I feel respected and supported by my co-therapists and peers.' },
  { id: 'q7',  text: 'I have access to the tools, materials, and resources I need.' },
  { id: 'q8',  text: 'I feel safe (physically and emotionally) in my workplace.' },
  { id: 'q9',  text: 'Communication from management is clear and timely.' },
  { id: 'q10', text: 'I feel I have opportunities for growth and learning.' },
  { id: 'q11', text: 'I feel comfortable raising concerns or grievances.' },
  { id: 'q12', text: 'Overall, I feel well taken care of by Sapphire Clinics East.' },
]

const SCALE_LABELS = [
  'Very Poor',
  'Poor',
  'Below Average',
  'Average',
  'Good',
  'Excellent',
]

export default function WellnessCheckPage() {
  const { data: session } = useSession()
  // Pre-fill name/department for the Named path, so the user only
  // has to confirm — but they can still edit either field manually
  // before submission.
  const sessionName = (session?.user?.name as string | undefined) ?? ''
  const sessionDept = (session?.user as { department?: string } | undefined)?.department ?? ''

  const [submitMode, setSubmitMode] = useState<'anonymous' | 'named'>('anonymous')
  const [name, setName] = useState(sessionName)
  const [department, setDepartment] = useState(sessionDept)

  // ratings: q1..q12 → 0..5 (or undefined when unanswered).
  const [ratings, setRatings] = useState<Record<string, number | undefined>>({})

  const [grievances, setGrievances] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [overallRating, setOverallRating] = useState<number | undefined>(undefined)
  const [additionalNotes, setAdditionalNotes] = useState('')

  const [followUp, setFollowUp] = useState<'yes' | 'no' | 'admin-discretion'>('no')
  const [followUpMode, setFollowUpMode] = useState<'in-person' | 'phone' | 'video' | 'email' | ''>('')
  const [bestTimeToReach, setBestTimeToReach] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answeredCount = Object.values(ratings).filter((v) => v !== undefined).length
  const canSubmit = answeredCount > 0 && !submitting

  function setRating(id: string, value: number) {
    setRatings((prev) => ({ ...prev, [id]: value }))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        submitMode,
        name: submitMode === 'named' ? name : '',
        department: submitMode === 'named' ? department : '',
        ratings,
        grievances,
        recommendations,
        overallRating: overallRating ?? null,
        additionalNotes,
        followUp,
        followUpMode: followUp === 'yes' ? followUpMode : '',
        bestTimeToReach,
      }
      const res = await fetch('/api/wellness-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Submission failed')
      } else {
        setSubmitted(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError('Submission failed — please try again')
    }
    setSubmitting(false)
  }

  // ── Success screen — replaces the form on send ──
  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto py-12 animate-fade-up">
        <div className="card-static text-center py-16 px-6">
          <div className="w-16 h-16 rounded-2xl bg-green-50 mx-auto mb-4 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-[22px] font-bold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Thank you for your honest feedback.
          </h1>
          <p className="text-[14px] text-[var(--mid-gray)] max-w-md mx-auto leading-relaxed">
            Your wellness matters to us. HR will review your response{submitMode === 'anonymous' ? ' anonymously' : ''}{followUp === 'yes' ? ' and reach out to coordinate your one-on-one' : ''}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-6 pb-16">
      {/* Header */}
      <div className="mb-6 animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--pale-teal)] flex items-center justify-center">
            <HeartPulse size={20} className="text-[var(--teal)]" />
          </div>
          <h1 className="text-[24px] font-bold text-[var(--charcoal)] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Wellness Check
          </h1>
        </div>
        <p className="text-[13px] text-[var(--mid-gray)] leading-relaxed">
          A periodic check-in on your well-being. Responses go to the HR Officer; you can submit anonymously or with your name. Optional sections may be left blank.
        </p>
      </div>

      {/* Section 1 — Identification */}
      <div className="card-static mb-5 animate-fade-up stagger-2">
        <h2 className="font-bold text-[15px] text-[var(--charcoal)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>Section 1 · Identification</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setSubmitMode('anonymous')}
            className={`p-3 rounded-xl border-2 text-left transition-colors ${submitMode === 'anonymous' ? 'border-[var(--teal)] bg-[var(--pale-teal)]/40' : 'border-[var(--light-gray)] hover:border-[var(--teal)]/50'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <EyeOff size={14} className={submitMode === 'anonymous' ? 'text-[var(--teal)]' : 'text-[var(--mid-gray)]'} />
              <span className="font-semibold text-[13px] text-[var(--charcoal)]">Anonymous</span>
            </div>
            <p className="text-[11px] text-[var(--mid-gray)] leading-snug">My identity will not be recorded or shared with HR.</p>
          </button>
          <button
            type="button"
            onClick={() => setSubmitMode('named')}
            className={`p-3 rounded-xl border-2 text-left transition-colors ${submitMode === 'named' ? 'border-[var(--teal)] bg-[var(--pale-teal)]/40' : 'border-[var(--light-gray)] hover:border-[var(--teal)]/50'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <UserRound size={14} className={submitMode === 'named' ? 'text-[var(--teal)]' : 'text-[var(--mid-gray)]'} />
              <span className="font-semibold text-[13px] text-[var(--charcoal)]">Named</span>
            </div>
            <p className="text-[11px] text-[var(--mid-gray)] leading-snug">I am comfortable being identified.</p>
          </button>
        </div>
        {submitMode === 'named' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Your full name" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Department / Branch</label>
              <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} className="input" placeholder="e.g. OT — Sandbox East" />
            </div>
          </div>
        )}
      </div>

      {/* Section 2 — Wellness Rating Scale */}
      <div className="card-static mb-5 animate-fade-up stagger-3">
        <h2 className="font-bold text-[15px] text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Section 2 · Wellness Rating Scale</h2>
        <p className="text-[12px] text-[var(--mid-gray)] mb-3">Rate each statement from 0 (Very Poor / Strongly Disagree) to 5 (Excellent / Strongly Agree).</p>
        <div className="space-y-2">
          {STATEMENTS.map((s, i) => (
            <div key={s.id} className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 items-center p-3 rounded-lg bg-[var(--off-white)] border border-[var(--light-gray)]">
              <span className="text-[11px] font-bold text-[var(--mid-gray)] uppercase tracking-wider min-w-[28px]">{i + 1}.</span>
              <p className="text-[13px] text-[var(--charcoal)] leading-snug">{s.text}</p>
              <div className="flex gap-1 justify-end">
                {[0, 1, 2, 3, 4, 5].map((v) => {
                  const selected = ratings[s.id] === v
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRating(s.id, v)}
                      title={SCALE_LABELS[v]}
                      className={`w-8 h-8 rounded-md text-[12px] font-semibold transition-colors ${selected ? 'bg-[var(--teal)] text-white shadow-sm' : 'bg-white border border-[var(--light-gray)] text-[var(--mid-gray)] hover:border-[var(--teal)] hover:text-[var(--teal)]'}`}
                    >
                      {v}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[var(--mid-gray)] mt-3">{answeredCount} of 12 answered</p>
      </div>

      {/* Section 3 — Grievances */}
      <div className="card-static mb-5 animate-fade-up stagger-4">
        <h2 className="font-bold text-[15px] text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Section 3 · Grievances <span className="text-[11px] text-[var(--mid-gray)] font-normal">(optional)</span></h2>
        <p className="text-[12px] text-[var(--mid-gray)] mb-3">Workload, scheduling, interpersonal conflict, safety, policy, etc.</p>
        <textarea
          value={grievances}
          onChange={(e) => setGrievances(e.target.value)}
          rows={4}
          className="input resize-y"
          placeholder="Share any concerns, conflicts, or issues you'd like HR to know about…"
        />
      </div>

      {/* Section 4 — Recommendations */}
      <div className="card-static mb-5 animate-fade-up stagger-5">
        <h2 className="font-bold text-[15px] text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Section 4 · Recommendations <span className="text-[11px] text-[var(--mid-gray)] font-normal">(optional)</span></h2>
        <textarea
          value={recommendations}
          onChange={(e) => setRecommendations(e.target.value)}
          rows={4}
          className="input resize-y"
          placeholder="Suggestions to improve our workplace, processes, or therapist well-being…"
        />
      </div>

      {/* Section 5 — Final Reflection */}
      <div className="card-static mb-5 animate-fade-up stagger-6">
        <h2 className="font-bold text-[15px] text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Section 5 · Final Reflection</h2>
        <p className="text-[12px] text-[var(--mid-gray)] mb-3">Overall, how would you rate your wellness this period?</p>
        <div className="flex gap-2 mb-4">
          {[0, 1, 2, 3, 4, 5].map((v) => {
            const selected = overallRating === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setOverallRating(v)}
                className={`flex-1 py-3 rounded-lg text-[14px] font-bold transition-colors ${selected ? 'bg-[var(--teal)] text-white shadow-sm' : 'bg-[var(--off-white)] border border-[var(--light-gray)] text-[var(--mid-gray)] hover:border-[var(--teal)] hover:text-[var(--teal)]'}`}
              >
                {v}
              </button>
            )
          })}
        </div>
        <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Anything else you'd like HR to know? <span className="text-[11px] text-[var(--mid-gray)] font-normal">(optional)</span></label>
        <textarea
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          rows={3}
          className="input resize-y"
        />
      </div>

      {/* Section 6 — Follow-Up Preference */}
      <div className="card-static mb-6 animate-fade-up stagger-7">
        <h2 className="font-bold text-[15px] text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Section 6 · Follow-Up Preference</h2>
        <p className="text-[12px] text-[var(--mid-gray)] mb-3">Do you want a one-on-one discussion with Admin so we can understand your concern better?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {[
            { value: 'yes' as const, label: 'Yes — I would appreciate a meeting' },
            { value: 'no' as const, label: 'No — no follow-up needed' },
            { value: 'admin-discretion' as const, label: 'Only if Admin feels it is necessary' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFollowUp(opt.value)}
              className={`p-3 rounded-lg border-2 text-left text-[12px] font-medium transition-colors ${followUp === opt.value ? 'border-[var(--teal)] bg-[var(--pale-teal)]/40 text-[var(--charcoal)]' : 'border-[var(--light-gray)] text-[var(--mid-gray)] hover:border-[var(--teal)]/50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {followUp === 'yes' && (
          <>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-2">Preferred mode of discussion</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { value: 'in-person' as const, label: 'In-person' },
                { value: 'phone' as const, label: 'Phone call' },
                { value: 'video' as const, label: 'Video call' },
                { value: 'email' as const, label: 'Written / Email' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFollowUpMode(opt.value)}
                  className={`px-4 py-2 rounded-lg border-2 text-[12px] font-semibold transition-colors ${followUpMode === opt.value ? 'border-[var(--teal)] bg-[var(--pale-teal)]/40 text-[var(--teal)]' : 'border-[var(--light-gray)] text-[var(--mid-gray)] hover:border-[var(--teal)]/50'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Best time to reach you <span className="text-[11px] text-[var(--mid-gray)] font-normal">(optional)</span></label>
            <input
              type="text"
              value={bestTimeToReach}
              onChange={(e) => setBestTimeToReach(e.target.value)}
              className="input"
              placeholder="e.g. weekdays after 5 PM"
            />
            {submitMode === 'anonymous' && (
              <p className="text-[11px] text-amber-700 italic mt-3 leading-snug">
                Heads-up: you selected Anonymous, but a one-on-one needs a way to reach you. Either share your contact above, or switch to Named in Section 1. Your responses still stay confidential within HR / Admin.
              </p>
            )}
          </>
        )}
      </div>

      {/* Error + submit */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center gap-2 animate-shake">
          <ShieldCheck size={16} className="shrink-0" />
          {error}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-up stagger-8">
        <p className="text-[11px] text-[var(--mid-gray)] leading-snug max-w-md">
          By submitting, you confirm the responses above reflect your honest input. Submitting as <strong>{submitMode === 'anonymous' ? 'Anonymous' : 'Named'}</strong>.
        </p>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary !py-3 !px-6 !text-[14px] !rounded-xl disabled:opacity-50 inline-flex items-center gap-2"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> Submitting…</>
          ) : (
            <><CheckCircle2 size={16} /> Submit Wellness Check</>
          )}
        </button>
      </div>
    </div>
  )
}
