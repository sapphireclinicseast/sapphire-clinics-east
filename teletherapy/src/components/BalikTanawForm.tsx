'use client'

// Intern "Balik-Tanaw" weekly reflection form. Used both as the standalone
// /balik-tanaw page and as a tab inside the Internship section (pass
// showHero={false} to skip the page header when embedded).

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, CheckCircle2, PenLine } from 'lucide-react'
import {
  BTN_PRIMARY, CARD_STYLE, CONTROL, CONTROL_STYLE, DANGER, DashCard, EmptyState, GroupLabel, LABEL, LABEL_STYLE,
  PAGE, PageHeader, PRIMARY_STYLE, RowsSkeleton, Skeleton, StatusPill, TEXTAREA,
} from '@/components/hub/ui'

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

  // Standalone page: kit page column + header. Embedded: just the content.
  const wrap = (body: ReactNode) => showHero ? (
    <div className={PAGE}>
      <PageHeader eyebrow="Internship" title="Balik-Tanaw" description={`Your weekly reflection${department ? ` · ${department}` : ''}`} />
      {body}
    </div>
  ) : <div className="space-y-5 min-w-0">{body}</div>

  if (loading) {
    return wrap(
      <section className="rounded-xl overflow-hidden" style={CARD_STYLE} aria-busy="true">
        <div className="px-4 sm:px-5 pt-4 pb-3"><Skeleton className="h-4 w-40" /></div>
        <RowsSkeleton rows={3} label="Loading Balik-Tanaw" />
      </section>
    )
  }

  return wrap(
    <>
      {toast && <div className="toast" role="status">{toast}</div>}

      {questions.length === 0 ? (
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState icon="book" title="Reflection questions coming soon" hint="The Balik-Tanaw questions for your department are being set up." />
        </section>
      ) : (
        <DashCard title="New reflection" icon={<PenLine size={16} aria-hidden />}>
          <label htmlFor="bt-week" className={LABEL} style={LABEL_STYLE}>Week</label>
          <input id="bt-week" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="Week of…" />

          <div className="space-y-5 mt-5">
            {questions.map((q, i) => (
              <div key={i}>
                <label htmlFor={`bt-q${i}`} className="block text-[13px] font-semibold mb-1.5 leading-relaxed" style={{ color: 'var(--charcoal)' }}>{i + 1}. {q}</label>
                <textarea id={`bt-q${i}`} value={answers[i] ?? ''} onChange={(e) => setAnswers((prev) => { const n = [...prev]; n[i] = e.target.value; return n })}
                  rows={4} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE} placeholder="Your reflection…" />
              </div>
            ))}
          </div>

          <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--light-gray)' }}>
            <label htmlFor="bt-sign" className={LABEL} style={LABEL_STYLE}>Intern&apos;s Signature <span aria-hidden style={{ color: DANGER }}>*</span></label>
            <input id="bt-sign" value={signName} onChange={(e) => setSignName(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="Type your full name to sign" aria-required="true" />
            <p className="text-[11px] mt-1 mb-4" style={{ color: 'var(--mid-gray)' }}>Your Coordinating Teacher will sign after reading this in their portal.</p>
            <button onClick={submit} disabled={submitting} className={`${BTN_PRIMARY} w-full h-10`} style={PRIMARY_STYLE}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Submit Balik-Tanaw
            </button>
          </div>
        </DashCard>
      )}

      {entries.length > 0 && (
        <div className="space-y-3">
          <GroupLabel>Past reflections ({entries.length})</GroupLabel>
          {entries.map((e) => (
            <section key={e.id} className="rounded-xl p-4 sm:p-5" style={CARD_STYLE}>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <span className="font-bold text-[14px]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{e.periodLabel}</span>
                {e.supervisorSignedName ? (
                  <StatusPill tone="success">Signed by {e.supervisorSignedName}</StatusPill>
                ) : (
                  <StatusPill tone="warn">Awaiting supervisor&apos;s signature</StatusPill>
                )}
              </div>
              <div className="space-y-3">
                {e.answers.map((a, i) => (
                  <div key={i}>
                    <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{i + 1}. {a.question}</p>
                    <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--charcoal)' }}>{a.answer || <span className="italic" style={{ color: 'var(--mid-gray)' }}>—</span>}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-3 pt-3" style={{ color: 'var(--mid-gray)', borderTop: '1px solid var(--light-gray)' }}>Intern&apos;s signature: <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{e.internSignedName}</span></p>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
