'use client'

import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type EnrollmentLevel } from '@/lib/api'
import {
  getSession, setSession, setDraft, clearDraft, levelLabel,
  getLevelStatus, hydrateLevelStatus,
  type Branch, branchLabel, type LevelStatus,
} from '@/lib/session'
import { AuroraBackground } from '@/components/ui/aurora-background'
import { RotatingWord } from '@/components/ui/rotating-word'
import {
  Banner, BTN_PRIMARY, CARD_STYLE, DANGER, DashCard, FOCUS, Icon, LABEL, LABEL_STYLE,
  PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, type IconName,
} from '@/components/hub/ui'

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
  { value: 'GRADE_11', title: 'Grade 11' },
  { value: 'GRADE_12', title: 'Grade 12' },
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
  // Display only: spinner on the submit button while /enroll loads.
  const [busy, setBusy] = useState(false)
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
    setBusy(true)
    router.push('/enroll')
  }


  function scrollToEnroll() {
    const el = document.getElementById('enroll')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {/* Full-bleed aurora background (owner's choice): the negative-margin
          trick breaks out of the parent <main>'s max-w-5xl + padding so the
          animation spans the whole viewport width. The top margin cancels
          <main>'s top padding (py-6 on phones, py-8 from sm). The background
          component itself is untouched; only the content on top is styled. */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen -mt-6 sm:-mt-8">
        <AuroraBackground>
          <div className="relative z-10 w-full max-w-5xl mx-auto px-3 sm:px-5 flex flex-col items-center text-center">
            {/* Scrim: a soft paper glow behind the text block only, so the
                headline and copy keep their contrast as the aurora drifts.
                The animation stays visible around and through it. */}
            <div
              aria-hidden
              className="absolute inset-x-0 -inset-y-12 -z-10 pointer-events-none"
              style={{ background: 'radial-gradient(closest-side, rgba(245,240,232,0.88) 0%, rgba(245,240,232,0.78) 50%, rgba(245,240,232,0.45) 80%, rgba(245,240,232,0) 100%)' }}
            />

            <div className="mb-6 sm:mb-7 animate-fade-in-down max-w-full">
              <div
                className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-2xl sm:rounded-full text-[10.5px] sm:text-[11.5px] font-semibold uppercase tracking-[0.1em] leading-snug text-balance max-w-full"
                style={{ ...DISPLAY, background: 'rgba(255,255,255,0.85)', border: '1px solid var(--light-gray)', color: 'var(--deep-teal)', boxShadow: '0 1px 2px rgba(30,56,50,0.06)' }}
              >
                <Icon name="student" size={14} style={{ color: 'var(--teal)' }} />
                Nursery · Kindergarten · Grade 1–12 · DepEd-accredited
              </div>
            </div>

            {/* One h1 for the page: both lines share one size. */}
            <h1
              className="font-bold tracking-tight leading-[1.08] text-[34px] sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ ...DISPLAY, color: 'var(--deep-teal)' }}
            >
              <span className="block animate-fade-in-up animation-delay-200">
                Enroll your child
              </span>
              <span className="mt-1 flex items-baseline justify-center gap-x-2.5 sm:gap-x-3 flex-wrap animate-fade-in-up animation-delay-400">
                <span className="text-[color:var(--moss)]">in a</span>
                <RotatingWord
                  words={['graded', 'special', 'caring']}
                  className="bg-gradient-to-r from-[color:var(--moss)] via-[color:var(--sage)] to-[color:var(--narra)] bg-clip-text text-transparent"
                />
                <span className="text-[color:var(--narra)]">class</span>
              </span>
            </h1>

            <p className="max-w-2xl mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed animate-fade-in-up animation-delay-600" style={{ color: 'rgba(26,26,26,0.82)' }}>
              Aura Academy for Learning offers Nursery and Kindergarten through Grade 12 in a small, attentive setting — with a DepEd-recognised graded class and a Learner Reference Number for every child.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 mt-8 sm:mt-9 w-full sm:w-auto animate-fade-in-up animation-delay-800">
              <button type="button" onClick={scrollToEnroll} className={`${BTN_HERO} text-white hover:opacity-90`} style={{ ...PRIMARY_STYLE, boxShadow: '0 8px 20px -10px rgba(30,56,50,0.6)' }}>
                Start enrollment
                <Icon name="chevronRight" size={16} />
              </button>
              <button type="button" onClick={() => router.push('/about')} className={`${BTN_HERO} hover:bg-[color:var(--paper)]`} style={SECONDARY_STYLE}>
                About SPED Class
              </button>
            </div>
          </div>
        </AuroraBackground>
      </section>

      {/* Step 1 of the enrollment wizard, in the header's column. Same step
          dots + eyebrow as /enroll (step 2) and /documents (step 3). */}
      <div id="enroll" className="mt-10 sm:mt-12 scroll-mt-24 space-y-5 min-w-0 animate-fade-up">
        <StepBar step={1} />

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ ...DISPLAY, color: 'var(--deep-teal)' }}>
              Enrollment · Step 1 of 4
            </p>
            <h2 className="text-[22px] sm:text-2xl font-bold leading-tight tracking-normal" style={{ ...DISPLAY, color: 'var(--charcoal)' }}>
              Enroll your child<br/>in a few easy steps.
            </h2>
            <p className="text-sm mt-1.5 leading-relaxed max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
              Pick an enrollment level, fill out the learner profile, then upload the required documents. The admissions team will confirm next steps.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
            style={{ ...DISPLAY, background: 'var(--moss-tint)', color: 'var(--deep-teal)', border: '1px solid var(--light-gray)' }}
          >
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[color:var(--gold-light)] animate-pulse-ring" />
            Online enrollment
          </span>
        </div>

        <div className="grid md:grid-cols-5 gap-5 items-start">
          <aside className="md:col-span-2 md:sticky md:top-24 space-y-3 min-w-0">
            <ul className="rounded-xl p-4 sm:p-5 space-y-3" style={CARD_STYLE}>
              <FactRow icon="student">Nursery · Kindergarten · Grade 1–12</FactRow>
              <FactRow icon="award">Graded class · DepEd-accredited</FactRow>
              <FactRow icon="tag">Issued LRN for every student</FactRow>
            </ul>

            {signedIn && (
              <div className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 min-w-0" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <div className="min-w-0">
                  <div className={`${LABEL} !mb-0`} style={LABEL_STYLE}>Signed in as</div>
                  <div className="text-sm font-semibold break-words" style={{ color: 'var(--charcoal)' }}>{signedIn.firstName} · {levelLabel(signedIn.level)}</div>
                </div>
                <a href="/enroll" className={`${BTN_PRIMARY} max-sm:h-11`} style={PRIMARY_STYLE}>
                  Continue enrollment →
                </a>
              </div>
            )}
          </aside>

          <div className="md:col-span-3 min-w-0">
            <DashCard
              title="Get started"
              description="Returning or new? Choose below."
              icon={<Icon name="userPlus" size={16} />}
            >
              <div role="tablist" aria-label="Get started" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl" style={{ ...DISPLAY, background: 'var(--pale-teal)' }}>
                <SegTab id="tab-new" panel="panel-new" active={tab === 'new'} onClick={() => { setTab('new'); setErr(null) }}>New student</SegTab>
                <SegTab id="tab-signin" panel="panel-signin" active={tab === 'signin'} onClick={() => { setTab('signin'); setErr(null) }}>Sign In (for existing student)</SegTab>
              </div>

              {expired && !err && (
                <div className="mb-5 animate-fade-in">
                  <Banner tone="warn">Your session expired. Please sign in again to continue your enrollment.</Banner>
                </div>
              )}

              {tab === 'signin' ? (
                <div className="space-y-4" key="signin" id="panel-signin" role="tabpanel" aria-labelledby="tab-signin">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--charcoal)' }}>
                    Already enrolled? Sign in with your parent email and password to continue your child&apos;s profile, upload documents, pay tuition, or view announcements.
                  </p>
                  <a href="/sign-in" className={`${BTN_PRIMARY} w-full max-sm:h-11`} style={PRIMARY_STYLE}>
                    Sign In
                  </a>
                  <p className="text-xs text-center pt-1" style={{ color: 'var(--mid-gray)' }}>
                    Don&apos;t have an account yet?{' '}
                    <button type="button" className={`font-semibold hover:underline rounded-sm ${FOCUS}`} style={{ color: 'var(--deep-teal)' }} onClick={() => setTab('new')}>
                      Register as a new student
                    </button>
                  </p>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={handleNew} key="new" id="panel-new" role="tabpanel" aria-labelledby="tab-new">
                  {/* Branch picker — required before level so we know which clinic to lodge the student under. */}
                  <fieldset className="min-w-0">
                    <legend className={LABEL} style={LABEL_STYLE}>
                      Clinic branch
                    </legend>
                    <p className="text-sm mb-2.5" style={{ color: 'var(--mid-gray)' }}>
                      Which clinic branch will your child attend?
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BRANCHES.map(b => (
                        <ChoiceTile
                          key={b.value}
                          active={branch === b.value}
                          onClick={() => setBranch(b.value)}
                          title={b.title}
                          sub={b.sub}
                        />
                      ))}
                    </div>
                  </fieldset>

                  {/* Level picker — disabled until a branch is chosen so parents do the steps in order. */}
                  <fieldset className={`min-w-0 transition-opacity ${branch ? '' : 'opacity-50 pointer-events-none'}`}>
                    <legend className={LABEL} style={LABEL_STYLE}>
                      Enrollment level
                    </legend>
                    <p className="text-sm mb-2.5" style={{ color: 'var(--mid-gray)' }}>
                      {branch ? `Which level are you enrolling for at ${branchLabel(branch)}?` : 'Pick a branch first.'}
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {LEVELS.map(l => {
                        const enabled = isEnabled(l.value)
                        return (
                          <ChoiceTile
                            key={l.value}
                            onClick={() => enabled && setLevel(l.value)}
                            disabled={!enabled}
                            tooltip={enabled ? '' : `${l.title} is closed for new enrollment`}
                            active={level === l.value && enabled}
                            title={l.title}
                            closed={!enabled && <>Closed</>}
                          />
                        )
                      })}
                    </div>
                  </fieldset>

                  {err && <Banner tone="error">{err}</Banner>}

                  <div className="space-y-2 pt-1">
                    <button type="submit" className={`${BTN_PRIMARY} w-full max-sm:h-11`} style={PRIMARY_STYLE} disabled={!branch || !level || busy} aria-busy={busy}>
                      {busy && <Spinner />}
                      Create profile &amp; continue
                      {!busy && <Icon name="chevronRight" size={14} />}
                    </button>
                    <p className="text-[11px] text-center" style={{ ...DISPLAY, color: 'var(--mid-gray)' }}>
                      You&apos;ll fill in the learner profile on the next step.
                    </p>
                  </div>
                </form>
              )}
            </DashCard>
          </div>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────── presentational bits ───────────────────────── */

const DISPLAY: CSSProperties = { fontFamily: 'var(--font-display)' }

/** Kit button, one size up for the hero (44px on phones, 48px from sm). */
const BTN_HERO = `inline-flex items-center justify-center gap-2 h-11 sm:h-12 px-6 rounded-lg text-[15px] font-semibold whitespace-nowrap transition-[opacity,background-color] ${FOCUS}`

/** One key-fact row: icon chip + short phrase (same look as the /about fact tiles). */
function FactRow({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 min-w-0">
      <span aria-hidden className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 text-sm font-semibold leading-snug" style={{ ...DISPLAY, color: 'var(--charcoal)' }}>{children}</span>
    </li>
  )
}

/** One half of the New / Sign-in switch (kit PillTabs look, full width, wraps on phones). */
function SegTab({ id, panel, active, onClick, children }: { id: string; panel: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panel}
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 px-2.5 py-2 rounded-lg text-[13px] font-semibold leading-tight text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--teal)] ${active ? '' : 'hover:bg-black/[0.04]'}`}
      style={active
        ? { background: '#fff', color: 'var(--deep-teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
        : { background: 'transparent', color: 'var(--mid-gray)' }}
    >
      {children}
    </button>
  )
}

/**
 * Selectable tile for branch and level. A button (same handlers as before)
 * with aria-pressed, plus a filled radio mark and a heavier border so the
 * choice never rests on colour alone. Closed levels get a dashed border and
 * a red "Closed" line instead of being faded out.
 */
function ChoiceTile({ active, disabled, onClick, title, sub, closed, tooltip }: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  sub?: string
  closed?: ReactNode
  tooltip?: string
}) {
  const style: CSSProperties = active
    ? { background: 'var(--moss-tint)', border: '1.5px solid var(--teal)' }
    : disabled
    ? { background: SUBTLE_BG, border: '1.5px dashed var(--light-gray)' }
    : { background: '#fff', border: '1.5px solid var(--light-gray)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-pressed={active}
      className={`flex items-start gap-2.5 w-full min-w-0 min-h-11 px-3.5 py-2.5 rounded-xl text-left transition-colors ${FOCUS} ${disabled ? 'cursor-not-allowed' : active ? '' : 'hover:bg-[color:var(--paper)]'}`}
      style={style}
    >
      <span aria-hidden className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ border: `1.5px solid ${active ? 'var(--deep-teal)' : 'var(--light-gray)'}`, background: '#fff' }}>
        {active && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--deep-teal)' }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug" style={{ ...DISPLAY, color: active ? 'var(--deep-teal)' : disabled ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
          {title}
        </span>
        {sub && <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{sub}</span>}
        {closed && <span className="block text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ ...DISPLAY, color: DANGER }}>{closed}</span>}
      </span>
    </button>
  )
}

function Spinner() {
  return <span aria-hidden className="w-3.5 h-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />
}

/** Wizard progress dots, same as /enroll and /documents. */
function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const dot = (n: 1 | 2 | 3 | 4) => {
    if (n < step) return 'step-dot step-dot-done'
    if (n === step) return 'step-dot step-dot-active'
    return 'step-dot'
  }
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden>
      <span className={dot(1)} />
      <span className={dot(2)} />
      <span className={dot(3)} />
      <span className={dot(4)} />
    </div>
  )
}
