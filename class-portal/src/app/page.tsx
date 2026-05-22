'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type EnrollmentLevel } from '@/lib/api'
import {
  getSession, setSession, setDraft, clearDraft, levelLabel,
  getLevelStatus, hydrateLevelStatus,
  type Branch, branchLabel, type LevelStatus,
} from '@/lib/session'
import { AuroraBackground } from '@/components/ui/aurora-background'
import { RotatingWord } from '@/components/ui/rotating-word'

type Tab = 'signin' | 'new'

const BRANCHES: Array<{ value: Branch; title: string; sub: string }> = [
  { value: 'EAST', title: 'East Branch', sub: 'Robinsons Metro East, Pasig' },
  { value: 'GREENHILLS', title: 'Greenhills Branch', sub: 'GH Tower Offices, San Juan' },
]

const LEVELS: { value: EnrollmentLevel; title: string }[] = [
  { value: 'NURSERY', title: 'Nursery' },
  { value: 'KINDER',  title: 'Kindergarten' },
  { value: 'GRADE_1', title: 'Grade 1' },
  { value: 'GRADE_2', title: 'Grade 2' },
  { value: 'GRADE_3', title: 'Grade 3' },
  { value: 'GRADE_4', title: 'Grade 4' },
  { value: 'GRADE_5', title: 'Grade 5' },
  { value: 'GRADE_6', title: 'Grade 6' },
  { value: 'GRADE_7', title: 'Grade 7' },
  { value: 'GRADE_8', title: 'Grade 8' },
  { value: 'GRADE_9', title: 'Grade 9' },
  { value: 'GRADE_10', title: 'Grade 10' },
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
  const [tab, setTab] = useState<Tab>('new')
  const [err, setErr] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<{ firstName: string; level: EnrollmentLevel } | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [level, setLevel] = useState<EnrollmentLevel | null>(null)
  const [levelStatus, setLevelStatus] = useState<LevelStatus[]>(getLevelStatus())
  const expired = sp.get('expired') === '1'

  useEffect(() => {
    const s = getSession()
    if (s) setSignedIn({ firstName: s.firstName, level: s.level })
    // Pull the latest enabled/disabled state in the background. Anonymous
    // visitors will fall back to the cached copy until they sign in once.
    hydrateLevelStatus().then(setLevelStatus).catch(() => { /* ignore */ })
  }, [])

  function isEnabled(l: EnrollmentLevel): boolean {
    const row = levelStatus.find(r => r.level === l)
    return !row || row.enabled
  }

  function handleNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    if (!branch) { setErr('Please choose a clinic branch.'); return }
    if (!level) { setErr('Please choose an enrollment level.'); return }
    if (!isEnabled(level)) { setErr(`${levelLabel(level)} is closed for new enrollment. Please pick another level.`); return }
    // Reset any previous draft, then seed with the chosen branch + level so /enroll knows them.
    clearDraft()
    setDraft({ level, branch })
    // Lightweight placeholder session — student details get filled on /enroll.
    setSession({
      studentId: 'draft_' + Math.random().toString(36).slice(2, 10),
      firstName: 'Student',
      token: 'local.' + Math.random().toString(36).slice(2, 18),
      level,
    })
    router.push('/enroll')
  }

  function scrollToEnroll() {
    const el = document.getElementById('enroll')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {/* Full-bleed aurora background. Negative-margin trick breaks out
          of the parent <main>'s max-w-5xl + px-5 + py-8 so it spans the
          entire viewport width. */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen -mt-8">
        <AuroraBackground>
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-5 max-w-5xl mx-auto">
            <div className="mb-7 animate-fade-in-down">
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/60 backdrop-blur-md border border-[color:var(--paper-3)] text-[11.5px] uppercase tracking-[0.12em] text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
                <span aria-hidden>✨</span>
                Kindergarten · Grade 1–10 · DepEd-accredited
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-[color:var(--narra)] animate-fade-in-up animation-delay-200 leading-[1.02]" style={{ fontFamily: 'var(--font-display)' }}>
              Enroll your child
            </h1>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold animate-fade-in-up animation-delay-400 mt-1 inline-flex items-baseline justify-center gap-2 flex-wrap" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="text-[color:var(--moss)]">in a</span>
              <RotatingWord
                words={['graded', 'special', 'caring']}
                className="bg-gradient-to-r from-[color:var(--moss)] via-[color:var(--sage)] to-[color:var(--narra)] bg-clip-text text-transparent"
              />
              <span className="text-[color:var(--narra)]">class</span>
            </h1>

            <p className="max-w-2xl mt-6 text-base md:text-lg lg:text-xl text-[color:var(--ink)]/80 leading-relaxed animate-fade-in-up animation-delay-600">
              Aura Academy for Learning offers Kindergarten through Grade 10 in a small, attentive setting — with a DepEd-recognised graded class and a Learner Reference Number for every child.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-9 animate-fade-in-up animation-delay-800">
              <button onClick={scrollToEnroll} className="btn-primary text-base px-7 py-3">
                Start enrollment
              </button>
              <button onClick={() => router.push('/about')} className="btn-secondary text-base px-7 py-3">
                About SPED Class
              </button>
            </div>
          </div>
        </AuroraBackground>
      </section>

      <div id="enroll" className="grid md:grid-cols-5 gap-8 md:gap-10 items-start mt-12 scroll-mt-24">
      {/* Hero */}
      <section className="md:col-span-2 animate-fade-up md:sticky md:top-24">
        <div className="hero-gradient rounded-3xl p-8 md:p-9 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--gold-light)] animate-pulse-ring"></span>
              Online enrollment
            </div>
            <h1 className="text-[40px] md:text-[44px] leading-[1.05] mb-4">
              Enroll your child<br/>in a few easy steps.
            </h1>
            <p className="text-white/80 text-[15px] leading-relaxed mb-7 max-w-sm">
              Pick an enrollment level, fill out the learner profile, then upload the required documents. The admissions team will confirm next steps.
            </p>
            <div className="flex flex-col gap-2.5 text-[13px] text-white/85" style={{ fontFamily: 'var(--font-display)' }}>
              <div className="flex items-center gap-2"><Check/> Kindergarten · Grade 1–10</div>
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
              onClick={() => { setTab('new'); setErr(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'new' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
            >New student</button>
            <button
              onClick={() => { setTab('signin'); setErr(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'signin' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
            >Sign In (for existing student)</button>
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

          {tab === 'signin' ? (
            <div className="space-y-4" key="signin">
              <p className="text-sm text-[color:var(--ink)] leading-relaxed">
                Already enrolled? Sign in with your parent email and password to continue your child&apos;s profile, upload documents, pay tuition, or view announcements.
              </p>
              <a href="/sign-in" className="btn-primary w-full text-center inline-block">
                Sign In
              </a>
              <p className="text-xs text-[color:var(--mid-gray)] text-center pt-1">
                Don&apos;t have an account yet?{' '}
                <button type="button" className="text-[color:var(--teal)] font-semibold hover:underline" onClick={() => setTab('new')}>
                  Register as a new student
                </button>
              </p>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleNew} key="new">
              {/* Branch picker — required before level so we know which clinic to lodge the student under. */}
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Clinic branch
                </div>
                <p className="text-sm text-[color:var(--mid-gray)] mt-0.5 mb-2.5">
                  Which clinic branch will your child attend?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BRANCHES.map(b => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => setBranch(b.value)}
                      className={`level-tile ${branch === b.value ? 'level-tile-active' : ''}`}
                    >
                      <span className="level-tile-title">{b.title}</span>
                      <span className="level-tile-sub">{b.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Level picker — disabled until a branch is chosen so parents do the steps in order. */}
              <div className={branch ? '' : 'opacity-50 pointer-events-none'}>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Enrollment level
                </div>
                <p className="text-sm text-[color:var(--mid-gray)] mt-0.5 mb-2.5">
                  {branch ? `Which level are you enrolling for at ${branchLabel(branch)}?` : 'Pick a branch first.'}
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {LEVELS.map(l => {
                    const enabled = isEnabled(l.value)
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => enabled && setLevel(l.value)}
                        disabled={!enabled}
                        title={enabled ? '' : `${l.title} is closed for new enrollment`}
                        className={`level-tile ${level === l.value && enabled ? 'level-tile-active' : ''} ${enabled ? '' : 'cursor-not-allowed'}`}
                        style={enabled ? undefined : { opacity: 0.5, filter: 'grayscale(0.5)' }}
                      >
                        <span className="level-tile-title">{l.title}</span>
                        {!enabled && <span className="level-tile-sub text-rose-700">Closed</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button type="submit" className="btn-primary w-full mt-2" disabled={!branch || !level}>
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
    </>
  )
}

function Check() {
  return <span className="inline-flex w-4 h-4 rounded-full bg-white/20 items-center justify-center text-[10px]">✓</span>
}
