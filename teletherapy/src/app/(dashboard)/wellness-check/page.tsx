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
import type { ReactNode } from 'react'
import { CheckCircle2, Loader2, UserRound, EyeOff, Check } from 'lucide-react'
import {
  Banner, BTN_PRIMARY, CARD_STYLE, CONTROL, CONTROL_STYLE, DashCard, FOCUS, LABEL, LABEL_STYLE,
  PageHeader, PRIMARY_STYLE, SUBTLE_BG, Tag, TEXTAREA,
} from '@/components/hub/ui'

const FORM_PAGE = 'max-w-3xl mx-auto space-y-5 min-w-0 pb-10'

/** Numbered badge for a section card's title. */
function Step({ n }: { n: number }) {
  return (
    <span aria-hidden className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
      style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
      {n}
    </span>
  )
}

/** Big selectable option card (Anonymous / Named, follow-up choice). */
function OptionCard({ selected, onClick, icon, title, hint }: {
  selected: boolean; onClick: () => void; icon?: ReactNode; title: string; hint?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`relative p-3.5 rounded-xl text-left transition-[border-color,background-color,box-shadow] ${FOCUS} ${selected ? '' : 'hover:bg-[#F8FAF2]'}`}
      style={{
        border: `1px solid ${selected ? 'var(--teal)' : 'var(--light-gray)'}`,
        background: selected ? 'rgba(74,128,115,0.08)' : '#fff',
        boxShadow: selected ? '0 0 0 3px rgba(74,128,115,0.12)' : 'none',
      }}
    >
      <span className="flex items-center gap-2 pr-6">
        {icon && <span style={{ color: selected ? 'var(--teal)' : 'var(--mid-gray)' }}>{icon}</span>}
        <span className="font-semibold text-[13px]" style={{ color: 'var(--charcoal)' }}>{title}</span>
      </span>
      {hint && <span className="block text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{hint}</span>}
      {selected && (
        <span aria-hidden className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'var(--teal)' }}>
          <Check size={10} color="#fff" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

/** 0–5 segmented scale. */
function Scale({ value, onChange, label, size = 'sm' }: {
  value: number | undefined; onChange: (v: number) => void; label: string; size?: 'sm' | 'lg'
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex gap-1 ${size === 'lg' ? 'w-full' : ''}`}>
      {[0, 1, 2, 3, 4, 5].map((v) => {
        const selected = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${v} — ${SCALE_LABELS[v]}`}
            title={SCALE_LABELS[v]}
            onClick={() => onChange(v)}
            className={`${size === 'lg' ? 'flex-1 h-11 text-[15px]' : 'w-9 h-9 text-[13px]'} rounded-lg font-semibold transition-colors ${FOCUS} ${selected ? 'text-white' : 'hover:bg-[#F8FAF2]'}`}
            style={{
              fontVariantNumeric: 'tabular-nums',
              background: selected ? 'var(--deep-teal)' : '#fff',
              border: `1px solid ${selected ? 'var(--deep-teal)' : 'var(--light-gray)'}`,
              color: selected ? '#fff' : 'var(--charcoal)',
            }}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

const OPTIONAL = <span className="normal-case tracking-normal font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span>

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
      <div className={FORM_PAGE}>
        <PageHeader eyebrow="My account" title="Wellness Check" />
        <section role="status" className="rounded-xl text-center py-14 px-6 animate-fade-up" style={CARD_STYLE}>
          <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#EEF5E8', border: '1px solid #CFE0BF' }}>
            <CheckCircle2 size={28} style={{ color: '#2F5A28' }} />
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Thank you for your honest feedback.
          </h2>
          <p className="text-[14px] max-w-md mx-auto leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
            Your wellness matters to us. HR will review your response{submitMode === 'anonymous' ? ' anonymously' : ''}{followUp === 'yes' ? ' and reach out to coordinate your one-on-one' : ''}.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className={FORM_PAGE}>
      <PageHeader
        eyebrow="My account"
        title="Wellness Check"
        description="A periodic check-in on your well-being. Responses go to the HR Officer; you can submit anonymously or with your name. Optional sections may be left blank."
      />

      {/* Section 1 — Identification */}
      <DashCard title="Identification" icon={<Step n={1} />} description="Choose whether HR sees who sent this.">
        <div role="radiogroup" aria-label="Identification" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionCard selected={submitMode === 'anonymous'} onClick={() => setSubmitMode('anonymous')}
            icon={<EyeOff size={15} />} title="Anonymous" hint="My identity will not be recorded or shared with HR." />
          <OptionCard selected={submitMode === 'named'} onClick={() => setSubmitMode('named')}
            icon={<UserRound size={15} />} title="Named" hint="I am comfortable being identified." />
        </div>
        {submitMode === 'named' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div>
              <label htmlFor="wc-name" className={LABEL} style={LABEL_STYLE}>Full name</label>
              <input id="wc-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="Your full name" />
            </div>
            <div>
              <label htmlFor="wc-dept" className={LABEL} style={LABEL_STYLE}>Department / Branch</label>
              <input id="wc-dept" type="text" value={department} onChange={(e) => setDepartment(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="e.g. OT — Sandbox East" />
            </div>
          </div>
        )}
      </DashCard>

      {/* Section 2 — Wellness Rating Scale */}
      <DashCard
        title="Wellness Rating Scale"
        icon={<Step n={2} />}
        description="Rate each statement from 0 (Very Poor / Strongly Disagree) to 5 (Excellent / Strongly Agree)."
        action={<Tag tone={answeredCount === 12 ? 'success' : 'neutral'}>{answeredCount} of 12 answered</Tag>}
        flush
      >
        <ol>
          {STATEMENTS.map((s, i) => (
            <li key={s.id} className="px-4 sm:px-5 py-3 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4"
              style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
              <p className="flex-1 min-w-0 text-[13.5px] leading-snug flex gap-2.5" style={{ color: 'var(--charcoal)' }}>
                <span className="text-xs font-bold w-5 shrink-0 pt-px" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                <span>{s.text}</span>
              </p>
              <div className="pl-7 md:pl-0 shrink-0">
                <Scale value={ratings[s.id]} onChange={(v) => setRating(s.id, v)} label={s.text} />
              </div>
            </li>
          ))}
        </ol>
        <div className="px-4 sm:px-5 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
          {SCALE_LABELS.map((l, v) => <span key={l}><strong style={{ color: 'var(--charcoal)' }}>{v}</strong> {l}</span>)}
        </div>
      </DashCard>

      {/* Section 3 — Grievances */}
      <DashCard title={<>Grievances <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span></>} icon={<Step n={3} />}
        description="Workload, scheduling, interpersonal conflict, safety, policy, etc.">
        <textarea
          aria-label="Grievances"
          value={grievances}
          onChange={(e) => setGrievances(e.target.value)}
          rows={4}
          className={`${TEXTAREA} resize-y`}
          style={CONTROL_STYLE}
          placeholder="Share any concerns, conflicts, or issues you'd like HR to know about…"
        />
      </DashCard>

      {/* Section 4 — Recommendations */}
      <DashCard title={<>Recommendations <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span></>} icon={<Step n={4} />}>
        <textarea
          aria-label="Recommendations"
          value={recommendations}
          onChange={(e) => setRecommendations(e.target.value)}
          rows={4}
          className={`${TEXTAREA} resize-y`}
          style={CONTROL_STYLE}
          placeholder="Suggestions to improve our workplace, processes, or therapist well-being…"
        />
      </DashCard>

      {/* Section 5 — Final Reflection */}
      <DashCard title="Final Reflection" icon={<Step n={5} />} description="Overall, how would you rate your wellness this period?">
        <Scale value={overallRating} onChange={setOverallRating} label="Overall wellness this period" size="lg" />
        <div className="flex justify-between text-[11px] mt-1.5 mb-4" style={{ color: 'var(--mid-gray)' }}>
          <span>Very Poor</span><span>Excellent</span>
        </div>
        <label htmlFor="wc-notes" className={LABEL} style={LABEL_STYLE}>Anything else you&apos;d like HR to know? {OPTIONAL}</label>
        <textarea
          id="wc-notes"
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          rows={3}
          className={`${TEXTAREA} resize-y`}
          style={CONTROL_STYLE}
        />
      </DashCard>

      {/* Section 6 — Follow-Up Preference */}
      <DashCard title="Follow-Up Preference" icon={<Step n={6} />} description="Do you want a one-on-one discussion with Admin so we can understand your concern better?">
        <div role="radiogroup" aria-label="Follow-up preference" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { value: 'yes' as const, label: 'Yes — I would appreciate a meeting' },
            { value: 'no' as const, label: 'No — no follow-up needed' },
            { value: 'admin-discretion' as const, label: 'Only if Admin feels it is necessary' },
          ].map((opt) => (
            <OptionCard key={opt.value} selected={followUp === opt.value} onClick={() => setFollowUp(opt.value)} title={opt.label} />
          ))}
        </div>
        {followUp === 'yes' && (
          <div className="mt-5 space-y-4">
            <div>
              <p className={`${LABEL} !mb-2`} style={LABEL_STYLE} id="wc-mode-label">Preferred mode of discussion</p>
              <div role="radiogroup" aria-labelledby="wc-mode-label" className="flex flex-wrap gap-2">
                {[
                  { value: 'in-person' as const, label: 'In-person' },
                  { value: 'phone' as const, label: 'Phone call' },
                  { value: 'video' as const, label: 'Video call' },
                  { value: 'email' as const, label: 'Written / Email' },
                ].map((opt) => {
                  const on = followUpMode === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setFollowUpMode(opt.value)}
                      className={`h-9 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors ${FOCUS} ${on ? 'text-white' : 'hover:bg-[#F8FAF2]'}`}
                      style={{ background: on ? 'var(--deep-teal)' : '#fff', border: `1px solid ${on ? 'var(--deep-teal)' : 'var(--light-gray)'}`, color: on ? '#fff' : 'var(--charcoal)' }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label htmlFor="wc-time" className={LABEL} style={LABEL_STYLE}>Best time to reach you {OPTIONAL}</label>
              <input
                id="wc-time"
                type="text"
                value={bestTimeToReach}
                onChange={(e) => setBestTimeToReach(e.target.value)}
                className={`${CONTROL} w-full`}
                style={CONTROL_STYLE}
                placeholder="e.g. weekdays after 5 PM"
              />
            </div>
            {submitMode === 'anonymous' && (
              <Banner tone="warn">
                You selected Anonymous, but a one-on-one needs a way to reach you. Either share your contact above, or switch to Named in Section 1. Your responses still stay confidential within HR / Admin.
              </Banner>
            )}
          </div>
        )}
      </DashCard>

      {/* Error + submit */}
      {error && <Banner tone="error">{error}</Banner>}
      <div className="rounded-xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={CARD_STYLE}>
        <p className="text-xs leading-snug max-w-md" style={{ color: 'var(--mid-gray)' }}>
          By submitting, you confirm the responses above reflect your honest input. Submitting as <strong style={{ color: 'var(--charcoal)' }}>{submitMode === 'anonymous' ? 'Anonymous' : 'Named'}</strong>.
          {answeredCount === 0 && <> Rate at least one statement in Section 2 to submit.</>}
        </p>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`${BTN_PRIMARY} !h-10 !px-5`}
          style={PRIMARY_STYLE}
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
