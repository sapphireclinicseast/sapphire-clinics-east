'use client'

// Intern "Balik-Tanaw" weekly reflection form. Used both as the standalone
// /balik-tanaw page and as a tab inside the Internship section (pass
// showHero={false} to skip the page hero when embedded).

import { useEffect, useState } from 'react'
import { NotebookPen, Loader2, CheckCircle2, Clock, PenLine } from 'lucide-react'

interface Entry {
  id: string
  periodLabel: string
  answers: { question: string; answer: string }[]
  internSignedName: string
  internSignedAt: string
  supervisorSignedName: string | null
  supervisorSignedAt: string | null
  createdAt: string
}

function defaultWeekLabel() {
  const d = new Date()
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export default function BalikTanawForm({ showHero = true }: { showHero?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<string[]>([])
  const [department, setDepartment] = useState<string>('')
  const [entries, setEntries] = useState<Entry[]>([])

  const [periodLabel, setPeriodLabel] = useState(defaultWeekLabel())
  const [answers, setAnswers] = useState<string[]>([])
  const [signName, setSignName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 4000) }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/balik-tanaw')
      if (res.ok) {
        const data = await res.json()
        setQuestions(data.questions ?? [])
        setDepartment(data.department ?? '')
        setEntries(data.entries ?? [])
        setAnswers((data.questions ?? []).map(() => ''))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (!signName.trim()) { showToast('Please sign with your name.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/balik-tanaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodLabel,
          internSignedName: signName,
          answers: questions.map((q, i) => ({ question: q, answer: answers[i] ?? '' })),
        }),
      })
      if (res.ok) {
        showToast('Balik-Tanaw submitted')
        setAnswers(questions.map(() => ''))
        setSignName('')
        setPeriodLabel(defaultWeekLabel())
        load()
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error ?? 'Failed to submit')
      }
    } catch { showToast('Failed to submit') }
    setSubmitting(false)
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" /></div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {showHero && (
        <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
          <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Balik-Tanaw</h1>
          <p className="text-white/60 text-sm mt-1">Your weekly reflection{department ? ` · ${department}` : ''}</p>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="card-static text-center py-14">
          <NotebookPen size={28} className="text-[var(--mid-gray)] mx-auto mb-3" />
          <p className="font-semibold text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Reflection questions coming soon</p>
          <p className="text-[13px] text-[var(--mid-gray)]">The Balik-Tanaw questions for your department are being set up.</p>
        </div>
      ) : (
        <div className="card-static mb-8">
          <h2 className="font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-4 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <PenLine size={18} className="text-[var(--teal)]" /> New reflection
          </h2>

          <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Week</label>
          <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="input mb-5" placeholder="Week of…" />

          <div className="space-y-5">
            {questions.map((q, i) => (
              <div key={i}>
                <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2 leading-relaxed">{i + 1}. {q}</label>
                <textarea value={answers[i] ?? ''} onChange={(e) => setAnswers((prev) => { const n = [...prev]; n[i] = e.target.value; return n })}
                  rows={4} className="input resize-y !rounded-xl" placeholder="Your reflection…" />
              </div>
            ))}
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--light-gray)]">
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Intern&apos;s Signature <span className="text-red-500">*</span></label>
            <input value={signName} onChange={(e) => setSignName(e.target.value)} className="input mb-1" placeholder="Type your full name to sign" />
            <p className="text-[11px] text-[var(--mid-gray)] mb-4">Your Coordinating Teacher will sign after reading this in their portal.</p>
            <button onClick={submit} disabled={submitting}
              className="btn-primary w-full py-3 rounded-xl !bg-gradient-to-r !from-green-600 !to-green-700">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Submit Balik-Tanaw
            </button>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bold text-[var(--charcoal)] mb-3 text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>Past reflections ({entries.length})</h2>
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="card-static">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <span className="font-semibold text-[var(--charcoal)] text-[14px]">{e.periodLabel}</span>
                  {e.supervisorSignedName ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={12} /> Signed by {e.supervisorSignedName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <Clock size={12} /> Awaiting supervisor&apos;s signature
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {e.answers.map((a, i) => (
                    <div key={i}>
                      <p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-1">{i + 1}. {a.question}</p>
                      <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{a.answer || <span className="italic text-[var(--mid-gray)]">—</span>}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--mid-gray)] mt-3 pt-3 border-t border-[var(--light-gray)]">Intern&apos;s signature: <span className="font-semibold text-[var(--charcoal)]">{e.internSignedName}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
