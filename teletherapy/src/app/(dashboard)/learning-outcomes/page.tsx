'use client'

import { useEffect, useState } from 'react'
import { Target, Loader2, CheckCircle2, Check } from 'lucide-react'
import { LEARN_BEST_OPTIONS, FEEDBACK_OPTIONS, PREP_OPTIONS, EMPTY_LEARNING_PROFILE, type LearningProfileData } from '@/lib/learning-profile'

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border border-[var(--light-gray)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-colors">
      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${checked ? 'bg-[var(--teal)] border-[var(--teal)]' : 'border-[var(--mid-gray)]'}`}>
        {checked && <Check size={11} className="text-white" />}
      </span>
      <span className="text-[13px] text-[var(--charcoal)]">{label}</span>
    </button>
  )
}

export default function LearningOutcomesPage() {
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
    } catch {}
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" /></div>

  return (
    <div className="max-w-3xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <Target size={20} /> Learning Outcomes &amp; Preferences
        </h1>
        <p className="text-white/60 text-sm mt-1">Shared with your Clinical Instructors{updatedAt ? ` · last saved ${new Date(updatedAt).toLocaleDateString()}` : ''}</p>
      </div>

      {/* Learning Outcomes */}
      <div className="card-static mb-6">
        <h2 className="font-bold text-[var(--charcoal)] mb-4 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>Learning Outcomes</h2>
        <div className="space-y-5">
          {[
            ['expectations', '1. What are your expectations for the duration of your clinical rotation here at Aura Health Rehab?'],
            ['lookingForward', '2. What are you most looking forward to learning from your assigned Clinical Instructors?'],
            ['improve', '3. What would you like to improve on throughout your clinical rotation?'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2 leading-relaxed">{label}</label>
              <textarea rows={3} className="input resize-y !rounded-xl"
                value={p.outcomes[key as keyof typeof p.outcomes]}
                onChange={(e) => setP((prev) => ({ ...prev, outcomes: { ...prev.outcomes, [key]: e.target.value } }))} />
            </div>
          ))}
        </div>
      </div>

      {/* Learning Preferences */}
      <div className="card-static mb-6">
        <h2 className="font-bold text-[var(--charcoal)] mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>Learning Preferences</h2>
        <p className="text-[12.5px] text-[var(--mid-gray)] mb-5 leading-relaxed pb-4 border-b border-[var(--light-gray)]">
          Please complete this short form to reflect on your current learning strategies during your internship. Your responses help your Clinical Instructors support your learning more effectively.
        </p>

        <div className="space-y-6">
          <div>
            <p className="text-[13px] font-semibold text-[var(--charcoal)] mb-2">1. How do you learn best? <span className="font-normal text-[var(--mid-gray)]">(Check all that apply)</span></p>
            <div className="space-y-2">
              {LEARN_BEST_OPTIONS.map((o) => <CheckRow key={o} label={o} checked={p.learnBest.includes(o)} onToggle={() => toggle('learnBest', o)} />)}
            </div>
            <input className="input mt-2" placeholder="Others…" value={p.learnBestOther} onChange={(e) => setP((prev) => ({ ...prev, learnBestOther: e.target.value }))} />
          </div>

          <div>
            <p className="text-[13px] font-semibold text-[var(--charcoal)] mb-2">2. What kind of feedback helps you most?</p>
            <div className="space-y-2">
              {FEEDBACK_OPTIONS.map((o) => <CheckRow key={o} label={o} checked={p.feedback.includes(o)} onToggle={() => toggle('feedback', o)} />)}
            </div>
            <input className="input mt-2" placeholder="Others…" value={p.feedbackOther} onChange={(e) => setP((prev) => ({ ...prev, feedbackOther: e.target.value }))} />
          </div>

          <div>
            <p className="text-[13px] font-semibold text-[var(--charcoal)] mb-2">3. How do you prepare for each duty day? <span className="font-normal text-[var(--mid-gray)]">(Check all that apply)</span></p>
            <div className="space-y-2">
              {PREP_OPTIONS.map((o) => <CheckRow key={o} label={o} checked={p.prep.includes(o)} onToggle={() => toggle('prep', o)} />)}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2">4. What challenges do you face in learning?</label>
            <textarea rows={3} className="input resize-y !rounded-xl" value={p.challenges} onChange={(e) => setP((prev) => ({ ...prev, challenges: e.target.value }))} />
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary w-full py-3 rounded-xl !bg-gradient-to-r !from-green-600 !to-green-700 mb-8">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save
      </button>
    </div>
  )
}
