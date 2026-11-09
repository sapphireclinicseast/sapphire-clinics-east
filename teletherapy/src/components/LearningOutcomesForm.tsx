'use client'

// Intern "Learning Outcomes & Preferences" form. Used both as the standalone
// /learning-outcomes page and as a tab inside the Internship section (pass
// showHero={false} to skip the page header when embedded).

import { useEffect, useState, type ReactNode } from 'react'
import { Target, Loader2, CheckCircle2, Check } from 'lucide-react'
import { LEARN_BEST_OPTIONS, FEEDBACK_OPTIONS, PREP_OPTIONS, EMPTY_LEARNING_PROFILE, type LearningProfileData } from '@/lib/learning-profile'
import {
  BTN_PRIMARY, CARD_STYLE, CONTROL, CONTROL_STYLE, DashCard, FOCUS, PAGE, PageHeader, PRIMARY_STYLE,
  RowsSkeleton, Skeleton, TEXTAREA,
} from '@/components/hub/ui'

const QUESTION = 'block text-[13px] font-semibold mb-1.5 leading-relaxed'
const QUESTION_STYLE = { color: 'var(--charcoal)' } as const

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={checked}
      className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg transition-colors bg-white hover:bg-[#F8FAF2] ${FOCUS}`}
      style={{ background: checked ? 'var(--pale-teal)' : undefined, border: `1px solid ${checked ? 'var(--teal)' : 'var(--light-gray)'}` }}>
      <span aria-hidden className="w-4 h-4 rounded flex items-center justify-center shrink-0"
        style={checked ? { background: 'var(--teal)', border: '1px solid var(--teal)' } : { background: '#fff', border: '1px solid var(--mid-gray)' }}>
        {checked && <Check size={11} className="text-white" />}
      </span>
      <span className="text-[13px]" style={{ color: 'var(--charcoal)' }}>{label}</span>
    </button>
  )
}

export default function LearningOutcomesForm({ showHero = true }: { showHero?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [p, setP] = useState<LearningProfileData>(EMPTY_LEARNING_PROFILE)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 4000) }
  const toggle = (key: 'learnBest' | 'feedback' | 'prep', v: string) =>
    setP((prev) => ({ ...prev, [key]: prev[key].includes(v) ? prev[key].filter((x) => x !== v) : [...prev[key], v] }))

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/learning-profile')
      if (res.ok) {
        const data = await res.json()
        if (data.profile) setP({ ...EMPTY_LEARNING_PROFILE, ...data.profile, outcomes: { ...EMPTY_LEARNING_PROFILE.outcomes, ...(data.profile.outcomes ?? {}) } })
        setUpdatedAt(data.updatedAt ?? null)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/learning-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      if (res.ok) { const d = await res.json(); setUpdatedAt(d.updatedAt ?? null); showToast('Saved') }
      else { const d = await res.json().catch(() => ({})); showToast(d.error ?? 'Failed to save') }
    } catch { showToast('Failed to save') }
    setSaving(false)
  }

  // Standalone page: kit page column + header. Embedded: just the content.
  const wrap = (body: ReactNode) => showHero ? (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Internship"
        title={<span className="inline-flex items-center gap-2"><Target size={20} aria-hidden style={{ color: 'var(--teal)' }} /> Learning Outcomes &amp; Preferences</span>}
        description={`Shared with your Clinical Instructors${updatedAt ? ` · last saved ${new Date(updatedAt).toLocaleDateString()}` : ''}`}
      />
      {body}
    </div>
  ) : <div className="space-y-5 min-w-0">{body}</div>

  if (loading) {
    return wrap(
      <section className="rounded-xl overflow-hidden" style={CARD_STYLE} aria-busy="true">
        <div className="px-4 sm:px-5 pt-4 pb-3"><Skeleton className="h-4 w-48" /></div>
        <RowsSkeleton rows={3} label="Loading your learning profile" />
      </section>
    )
  }

  return wrap(
    <>
      {toast && <div className="toast" role="status">{toast}</div>}

      {!showHero && updatedAt && (
        <p className="text-[12px] px-0.5" style={{ color: 'var(--mid-gray)' }}>Shared with your Clinical Instructors · last saved {new Date(updatedAt).toLocaleDateString()}</p>
      )}

      {/* Learning Outcomes */}
      <DashCard title="Learning Outcomes">
        <div className="space-y-5">
          {[
            ['expectations', '1. What are your expectations for the duration of your clinical rotation here at Aura Health Rehab?'],
            ['lookingForward', '2. What are you most looking forward to learning from your assigned Clinical Instructors?'],
            ['improve', '3. What would you like to improve on throughout your clinical rotation?'],
          ].map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`lo-${key}`} className={QUESTION} style={QUESTION_STYLE}>{label}</label>
              <textarea id={`lo-${key}`} rows={3} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE}
                value={p.outcomes[key as keyof typeof p.outcomes]}
                onChange={(e) => setP((prev) => ({ ...prev, outcomes: { ...prev.outcomes, [key]: e.target.value } }))} />
            </div>
          ))}
        </div>
      </DashCard>

      {/* Learning Preferences */}
      <DashCard
        title="Learning Preferences"
        description="Please complete this short form to reflect on your current learning strategies during your internship. Your responses help your Clinical Instructors support your learning more effectively."
      >
        <div className="space-y-6">
          <fieldset>
            <legend className={QUESTION} style={QUESTION_STYLE}>1. How do you learn best? <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Check all that apply)</span></legend>
            <div className="space-y-2">
              {LEARN_BEST_OPTIONS.map((o) => <CheckRow key={o} label={o} checked={p.learnBest.includes(o)} onToggle={() => toggle('learnBest', o)} />)}
            </div>
            <input className={`${CONTROL} w-full mt-2`} style={CONTROL_STYLE} aria-label="Others (how you learn best)" placeholder="Others…" value={p.learnBestOther} onChange={(e) => setP((prev) => ({ ...prev, learnBestOther: e.target.value }))} />
          </fieldset>

          <fieldset>
            <legend className={QUESTION} style={QUESTION_STYLE}>2. What kind of feedback helps you most?</legend>
            <div className="space-y-2">
              {FEEDBACK_OPTIONS.map((o) => <CheckRow key={o} label={o} checked={p.feedback.includes(o)} onToggle={() => toggle('feedback', o)} />)}
            </div>
            <input className={`${CONTROL} w-full mt-2`} style={CONTROL_STYLE} aria-label="Others (feedback)" placeholder="Others…" value={p.feedbackOther} onChange={(e) => setP((prev) => ({ ...prev, feedbackOther: e.target.value }))} />
          </fieldset>

          <fieldset>
            <legend className={QUESTION} style={QUESTION_STYLE}>3. How do you prepare for each duty day? <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Check all that apply)</span></legend>
            <div className="space-y-2">
              {PREP_OPTIONS.map((o) => <CheckRow key={o} label={o} checked={p.prep.includes(o)} onToggle={() => toggle('prep', o)} />)}
            </div>
          </fieldset>

          <div>
            <label htmlFor="lo-challenges" className={QUESTION} style={QUESTION_STYLE}>4. What challenges do you face in learning?</label>
            <textarea id="lo-challenges" rows={3} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE} value={p.challenges} onChange={(e) => setP((prev) => ({ ...prev, challenges: e.target.value }))} />
          </div>
        </div>
      </DashCard>

      <button onClick={save} disabled={saving} className={`${BTN_PRIMARY} w-full h-10`} style={PRIMARY_STYLE}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save
      </button>
    </>
  )
}
