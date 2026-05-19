'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { lookupStudent, type EnrollmentLevel } from '@/lib/api'
import { getSession, setSession, setDraft, clearDraft, levelLabel } from '@/lib/session'

type Tab = 'returning' | 'new'

const LEVELS: { value: EnrollmentLevel; title: string; sub: string }[] = [
  { value: 'KINDER',  title: 'Kindergarten', sub: 'Ages 5–6' },
  { value: 'GRADE_1', title: 'Grade 1',      sub: 'Ages 6–7' },
  { value: 'GRADE_2', title: 'Grade 2',      sub: 'Ages 7–8' },
  { value: 'GRADE_3', title: 'Grade 3',      sub: 'Ages 8–9' },
]

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  )
}

function HomeInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const [tab, setTab] = useState<Tab>('returning')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<{ firstName: string; level: EnrollmentLevel } | null>(null)
  const [level, setLevel] = useState<EnrollmentLevel | null>(null)
  const expired = sp.get('expired') === '1'

  useEffect(() => {
    const s = getSession()
    if (s) setSignedIn({ firstName: s.firstName, level: s.level })
  }, [])

  async function handleReturning(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    try {
      const res = await lookupStudent(String(f.get('email')), String(f.get('lastName')))
      setSession(res); router.push('/enroll')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  function handleNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    if (!level) { setErr('Please choose an enrollment level.'); return }
    // Reset any previous draft, then seed with the chosen level so /enroll knows it.
    clearDraft()
    setDraft({ level })
    // Lightweight placeholder session — student details get filled on /enroll.
    setSession({
      studentId: 'draft_' + Math.random().toString(36).slice(2, 10),
      firstName: 'Student',
      token: 'local.' + Math.random().toString(36).slice(2, 18),
      level,
    })
    router.push('/enroll')
  }

  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start">
      {/* Hero */}
      <section className="md:col-span-2 animate-fade-up md:sticky md:top-24">
        <div className="hero-gradient rounded-3xl p-8 md:p-9 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--gold-light)] animate-pulse-ring"></span>
              Online enrollment
            </div>
            <h1 className="text-[40px] md:text-[44px] leading-[1.05] mb-4">
              Enroll your student<br/>in a few easy steps.
            </h1>
            <p className="text-white/80 text-[15px] leading-relaxed mb-7 max-w-sm">
              Pick an enrollment level, fill out the learner profile, then upload the required documents. The admissions team will confirm next steps.
            </p>
            <div className="flex flex-col gap-2.5 text-[13px] text-white/85" style={{ fontFamily: 'var(--font-display)' }}>
              <div className="flex items-center gap-2"><Check/> Kindergarten · Grade 1–3</div>
              <div className="flex items-center gap-2"><Check/> Graded class · DepEd-accredited</div>
              <div className="flex items-center gap-2"><Check/> Issued LRN for every student</div>
            </div>
            {signedIn && (
              <div className="mt-6 p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-white/60" style={{ fontFamily: 'var(--font-display)' }}>Signed in as</div>
                  <div className="font-semibold">{signedIn.firstName} · {levelLabel(signedIn.level)}</div>
                </div>
                <a href="/enroll" className="inline-flex items-center gap-1.5 bg-[color:var(--gold)] hover:bg-[color:var(--gold-light)] text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
                  Continue enrollment →
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Auth card */}
      <section className="md:col-span-3 animate-fade-up stagger-2">
        <div className="card-static">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Get started</h2>
              <p className="text-sm text-[color:var(--mid-gray)] mt-1">Returning or new? Choose below.</p>
            </div>
          </div>

          <div className="flex gap-2 mb-6 p-1 bg-[color:var(--pale-teal)] rounded-xl" style={{ fontFamily: 'var(--font-display)' }}>
            <button
              onClick={() => { setTab('returning'); setErr(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'returning' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
            >Returning student</button>
            <button
              onClick={() => { setTab('new'); setErr(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'new' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
            >New student</button>
          </div>

          {expired && !err && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 animate-fade-in">
              Your session expired. Please sign in again to continue your enrollment.
            </div>
          )}
          {err && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
              {err}
            </div>
          )}

          {tab === 'returning' ? (
            <form className="space-y-4" onSubmit={handleReturning} key="returning">
              <label className="block">
                <span className="label">Email</span>
                <input required name="email" type="email" className="input" placeholder="parent@example.com" />
              </label>
              <label className="block">
                <span className="label">Student last name</span>
                <input required name="lastName" className="input" placeholder="Dela Cruz" />
              </label>
              <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
                {busy ? 'Looking up…' : 'Continue'}
              </button>
              <p className="text-xs text-[color:var(--mid-gray)] text-center pt-1">
                Don&apos;t have a record yet?{' '}
                <button type="button" className="text-[color:var(--teal)] font-semibold hover:underline" onClick={() => setTab('new')}>
                  Register as a new student
                </button>
              </p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleNew} key="new">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
                Enrollment level
              </div>
              <p className="text-sm text-[color:var(--mid-gray)] -mt-2">
                Which level are you enrolling for?
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {LEVELS.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLevel(l.value)}
                    className={`level-tile ${level === l.value ? 'level-tile-active' : ''}`}
                  >
                    <span className="level-tile-title">{l.title}</span>
                    <span className="level-tile-sub">{l.sub}</span>
                  </button>
                ))}
              </div>

              <button type="submit" className="btn-primary w-full mt-2">
                Create profile &amp; continue
              </button>
              <p className="text-[11px] text-[color:var(--mid-gray)] text-center" style={{ fontFamily: 'var(--font-display)' }}>
                You&apos;ll fill in the learner profile on the next step.
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function Check() {
  return <span className="inline-flex w-4 h-4 rounded-full bg-white/20 items-center justify-center text-[10px]">✓</span>
}
