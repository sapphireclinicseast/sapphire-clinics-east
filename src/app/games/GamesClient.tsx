'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SLP_QUESTIONS } from './slp-questions'

// ── Game constants ──────────────────────────────────────────────────────────
const ROUND_SECONDS = 60 // 1 minute
const TIER_5_MIN = 15 // 15..19 correct → 5% voucher
const TIER_8_MIN = 20 // 20+ correct    → 8% voucher
const FEEDBACK_MS = 750 // how long the green/red highlight lingers before advancing

const PROFESSIONS = ['OT', 'PT', 'SLP', 'SPED', 'Psychology', 'MD', 'Orthosis', 'Others'] as const

type Tab = 'PT' | 'OT' | 'SLP'
type Phase = 'intro' | 'register' | 'countdown' | 'playing' | 'result'

type RegForm = {
  firstName: string
  lastName: string
  mobile: string
  email: string
  profession: string
  professionOther: string
  birthdate: string
  yearsOfPractice: string
}

const EMPTY_REG: RegForm = {
  firstName: '',
  lastName: '',
  mobile: '',
  email: '',
  profession: 'SLP',
  professionOther: '',
  birthdate: '',
  yearsOfPractice: '',
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// A question with its choice order randomized so the correct answer's position
// carries no information (the source data is position-biased) and repeat plays
// feel fresh. `answer` is remapped to the shuffled index.
type PlayQuestion = { id: number; q: string; choices: string[]; answer: number; ref: string }

function buildDeck(): PlayQuestion[] {
  return shuffle(SLP_QUESTIONS).map((qq) => {
    const order = shuffle([0, 1, 2, 3])
    return {
      id: qq.id,
      q: qq.q,
      choices: order.map((i) => qq.choices[i]),
      answer: order.indexOf(qq.answer),
      ref: qq.ref,
    }
  })
}

// Fire-and-forget snapshot to the live Mirror View (booth backend). Never
// throws or blocks gameplay.
function postMirror(payload: Record<string, unknown>) {
  try {
    fetch('/api/public/games/mirror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

type PrizeKind = 'discount' | 'merch'
type PrizeResult = { code: string; tier: number; prize: PrizeKind; emailed: boolean; alreadyClaimed: boolean }

// Prize claiming is USER-TRIGGERED (a button press), not an effect — this both
// lets the player choose merch vs discount and avoids the self-cancelling-effect
// bug that hung "Minting your voucher…" under real network latency.
function usePrizeClaim(
  reg: RegForm,
  game: string,
  onClaimed: (info: ClaimInfo) => void,
) {
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<PrizeResult | null>(null)
  const [error, setError] = useState('')

  const claim = useCallback(
    async (prize: PrizeKind, tier: number, correct: number) => {
      setClaiming(true)
      setError('')
      try {
        const res = await fetch('/api/public/games/win', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: reg.firstName,
            lastName: reg.lastName,
            email: reg.email,
            tier,
            correct,
            game,
            prize,
          }),
        })
        const d = await res.json().catch(() => ({ ok: false }))
        if (d?.ok) {
          const r: PrizeResult = {
            code: d.code,
            tier: d.tier,
            prize: d.prize === 'merch' ? 'merch' : 'discount',
            emailed: !!d.emailed,
            alreadyClaimed: !!d.alreadyClaimed,
          }
          setResult(r)
          onClaimed({ code: r.code, tier: r.tier, prize: r.prize })
        } else {
          setError(d?.error || 'Could not lock in your prize — please show this screen to our booth staff.')
        }
      } catch {
        setError('Network hiccup — please show this screen to our booth staff.')
      } finally {
        setClaiming(false)
      }
    },
    [reg.firstName, reg.lastName, reg.email, game, onClaimed],
  )

  return { claiming, result, error, claim }
}

function PrizePicker({
  tier,
  claiming,
  error,
  onPick,
}: {
  tier: number
  claiming: boolean
  error: string
  onPick: (p: PrizeKind) => void
}) {
  return (
    <>
      <p className="lede">Pick your prize — you can only claim one:</p>
      <div className="prize-cards">
        <button className="prize-card" disabled={claiming} onClick={() => onPick('merch')}>
          <span className="pz-emoji" aria-hidden>🎁</span>
          <span className="pz-title">Aura merch</span>
          <span className="pz-desc">Grab a freebie from our booth.</span>
        </button>
        <button className="prize-card" disabled={claiming} onClick={() => onPick('discount')}>
          <span className="pz-emoji" aria-hidden>🎟️</span>
          <span className="pz-title">{tier}% seminar discount</span>
          <span className="pz-desc">Save on a future Verdana Trainings &amp; Seminars enrollment.</span>
        </button>
      </div>
      {claiming && <div className="lede sm">Locking in your prize…</div>}
      {error && <div className="err">{error}</div>}
    </>
  )
}

function PrizeReveal({ result, email }: { result: PrizeResult; email: string }) {
  const merch = result.prize === 'merch'
  return (
    <>
      {result.alreadyClaimed && (
        <p className="lede sm">You already claimed a prize earlier — here it is again:</p>
      )}
      <p className="lede">
        {merch ? (
          <>You bagged some <strong>Aura merch</strong>! 🎁</>
        ) : (
          <>That&apos;s a <strong>{result.tier}% discount</strong> on Verdana Trainings &amp; Seminars. 🦙</>
        )}
      </p>
      <div className="voucher">
        <div className="v-kicker">{merch ? 'Your merch claim code' : 'Your voucher code'}</div>
        <div className="v-code">{result.code}</div>
        <div className="v-note">
          {result.emailed ? `Also sent to ${email}. ` : 'Screenshot this now. '}
          {merch
            ? 'Show this at our booth to grab your merch.'
            : `Present it when you enroll to claim ${result.tier}% off.`}
        </div>
      </div>
    </>
  )
}

export default function GamesClient({ qrDataUrl, gameUrl }: { qrDataUrl: string; gameUrl: string }) {
  const [tab, setTab] = useState<Tab>('SLP')
  const [showQr, setShowQr] = useState(false)

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          Aura Health <span className="brand-sub">· Event Games</span>
        </div>
        <button className="qr-toggle" onClick={() => setShowQr(true)} aria-label="Show QR code">
          <span aria-hidden>▦</span> Show QR
        </button>
      </header>

      <nav className="tabs" role="tablist" aria-label="Choose your profession">
        {(['PT', 'OT', 'SLP'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="stage">
        {tab === 'SLP' ? <SlpZone /> : <ComingSoon profession={tab} />}
      </main>

      <footer className="footnote">
        Sapphire Clinics East, Inc. · Aura Health Rehab · Verdana Trainings &amp; Seminars
      </footer>

      {showQr && (
        <div className="qr-overlay" onClick={() => setShowQr(false)}>
          <div className="qr-card" onClick={(e) => e.stopPropagation()}>
            <button className="qr-close" onClick={() => setShowQr(false)} aria-label="Close">
              ×
            </button>
            <div className="qr-kicker">Scan to play</div>
            <h2 className="qr-title">Point your camera here 🦙</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code to open the game" className="qr-img" />
            <div className="qr-url">{gameUrl.replace(/^https?:\/\//, '')}</div>
          </div>
        </div>
      )}

      <StyleTag />
      <GameStyles />
    </div>
  )
}

// ── Coming soon (PT / OT) ────────────────────────────────────────────────────
function ComingSoon({ profession }: { profession: Tab }) {
  const label = profession === 'PT' ? 'Physical Therapy' : 'Occupational Therapy'
  return (
    <section className="panel center">
      <div className="soon-emoji" aria-hidden>
        🛠️
      </div>
      <h1 className="h1">{label} game is warming up.</h1>
      <p className="lede">
        We&apos;re building a {profession} round worth flexing for. For now, hop over to the{' '}
        <strong>SLP</strong> tab — there&apos;s a voucher on the line.
      </p>
      <span className="pill">Coming soon</span>
    </section>
  )
}

// ── SLP zone: game picker + shared one-time registration ─────────────────────
type SlpGameId = 'quiz' | 'flappy'

type ClaimInfo = { code: string; tier: number; prize: 'discount' | 'merch' }

function SlpZone() {
  const [reg, setReg] = useState<RegForm>(EMPTY_REG)
  const [registered, setRegistered] = useState(false)
  const [game, setGame] = useState<SlpGameId | null>(null)
  const [pending, setPending] = useState<SlpGameId | null>(null)
  const [settings, setSettings] = useState<{ quiz: boolean; flappy: boolean }>({ quiz: true, flappy: true })
  // One prize per person: once claimed, the games lock for this player.
  const [claim, setClaim] = useState<ClaimInfo | null>(null)

  // Poll the admin on/off switches so a game disabled mid-event disappears here.
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/public/games/settings')
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d?.ok && d.settings)
            setSettings({ quiz: d.settings.quiz !== false, flappy: d.settings.flappy !== false })
        })
        .catch(() => {})
    load()
    const iv = setInterval(load, 20_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  // Stable per-player id so the booth Mirror View can follow one phone.
  const [sessionId] = useState(() => 'g-' + Math.random().toString(36).slice(2, 10))
  const playerName = `${reg.firstName} ${reg.lastName}`.trim() || 'Player'

  const launch = (g: SlpGameId) => {
    if (!settings[g] || claim) return
    if (registered) setGame(g)
    else setPending(g)
  }

  // After registration, check whether this email already claimed a prize (so a
  // re-scan can't win twice). If so, lock straight to the claimed screen.
  const finishRegister = async () => {
    setRegistered(true)
    setPending(null)
    try {
      const res = await fetch(`/api/public/games/claim-status?email=${encodeURIComponent(reg.email.trim())}`)
      const d = await res.json().catch(() => null)
      if (d?.ok && d.claimed && d.voucher) {
        setClaim({ code: d.voucher.code, tier: d.voucher.tier, prize: d.voucher.prize || 'discount' })
        return
      }
    } catch {
      /* ignore — let them play */
    }
    setGame(pending)
  }

  if (pending && !registered) {
    return (
      <RegisterForm
        reg={reg}
        setReg={setReg}
        onCancel={() => setPending(null)}
        onDone={finishRegister}
      />
    )
  }
  const onClaimed = (info: ClaimInfo) => setClaim(info)
  if (game === 'quiz')
    return <QuizRound reg={reg} sessionId={sessionId} playerName={playerName} onClaimed={onClaimed} onExit={() => setGame(null)} />
  if (game === 'flappy')
    return <FlappyRound reg={reg} sessionId={sessionId} playerName={playerName} onClaimed={onClaimed} onExit={() => setGame(null)} />

  // Already claimed a prize → games are locked for this player.
  if (claim) {
    return (
      <section className="panel center">
        <div className="hero-emoji" aria-hidden>🎉</div>
        <div className="kicker">Prize claimed</div>
        <h1 className="h1">You&apos;re all set{reg.firstName ? `, ${reg.firstName}` : ''}!</h1>
        <p className="lede">
          {claim.prize === 'merch'
            ? 'You already claimed your Aura merch prize — show this to our booth staff.'
            : `You already claimed your ${claim.tier}% Verdana Trainings & Seminars discount.`}{' '}
          One prize per person, so the games are locked for you now. Thanks for playing! 🦙
        </p>
        <div className="voucher">
          <div className="v-kicker">{claim.prize === 'merch' ? 'Your merch claim code' : 'Your voucher code'}</div>
          <div className="v-code">{claim.code}</div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="kicker">SLP Games · pick your challenge</div>
      <h1 className="h1 sm">Two ways to win a Verdana voucher.</h1>
      <p className="lede sm">
        {registered
          ? "You're in — pick a game and go."
          : 'A quick sign-up unlocks both games (and sends your voucher if you win).'}
      </p>
      <div className="game-cards">
        <button
          className={`game-card ${settings.quiz ? '' : 'disabled'}`}
          onClick={() => launch('quiz')}
          disabled={!settings.quiz}
        >
          <span className="gc-emoji" aria-hidden>🗣️</span>
          <span className="gc-title">Say What?! Beat the Buzzer</span>
          <span className="gc-desc">
            1-minute SLP trivia sprint. 15+ correct = 5% off, 20+ = 8% off.
          </span>
          <span className="gc-cta">{settings.quiz ? 'Play trivia →' : 'Currently unavailable'}</span>
        </button>
        <button
          className={`game-card ${settings.flappy ? '' : 'disabled'}`}
          onClick={() => launch('flappy')}
          disabled={!settings.flappy}
        >
          <span className="gc-emoji" aria-hidden>🐤</span>
          <span className="gc-title">Flappy Phoneme: Chase the Cherub</span>
          <span className="gc-desc">
            Flap the clinic sky, dodge the flying SLP words, and catch the little angel → 5% off.
          </span>
          <span className="gc-cta">{settings.flappy ? 'Take flight →' : 'Currently unavailable'}</span>
        </button>
      </div>
      {!settings.quiz && !settings.flappy && (
        <p className="lede sm" style={{ marginTop: 14 }}>
          🎈 The games are taking a quick break — please check back with our booth staff.
        </p>
      )}
    </section>
  )
}

// ── Shared registration form (feeds HR Talent Pool + seminar list) ───────────
function RegisterForm({
  reg,
  setReg,
  onCancel,
  onDone,
}: {
  reg: RegForm
  setReg: (r: RegForm) => void
  onCancel: () => void
  onDone: () => void
}) {
  const [regError, setRegError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    if (!reg.firstName.trim() || !reg.lastName.trim() || !reg.mobile.trim() || !reg.email.trim()) {
      setRegError('Please fill in your name, mobile, and email.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reg.email.trim())) {
      setRegError('Please enter a valid email address.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/games/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reg,
          yearsOfPractice: reg.yearsOfPractice === '' ? null : Number(reg.yearsOfPractice),
        }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !data.ok) {
        setRegError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      onDone()
    } catch {
      setRegError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <section className="panel">
      <div className="kicker">Almost there</div>
      <h1 className="h1 sm">Drop your details to unlock the games.</h1>
      <p className="lede sm">
        This adds you to our talent pool &amp; seminar list — and it&apos;s where we send your
        voucher if you win. Not a working SLP yet? Pop <b>0</b> in years of practice.
      </p>
      <form className="form" onSubmit={submit}>
        <div className="grid2">
          <Field label="First Name" required>
            <input
              className="in"
              placeholder="Juan"
              value={reg.firstName}
              onChange={(e) => setReg({ ...reg, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last Name" required>
            <input
              className="in"
              placeholder="Dela Cruz"
              value={reg.lastName}
              onChange={(e) => setReg({ ...reg, lastName: e.target.value })}
            />
          </Field>
          <Field label="Mobile Number" required>
            <input
              className="in"
              inputMode="tel"
              placeholder="+63 9XX XXX XXXX"
              value={reg.mobile}
              onChange={(e) => setReg({ ...reg, mobile: e.target.value })}
            />
          </Field>
          <Field label="Email Address" required>
            <input
              className="in"
              inputMode="email"
              placeholder="you@example.com"
              value={reg.email}
              onChange={(e) => setReg({ ...reg, email: e.target.value })}
            />
          </Field>
          <Field label="Profession">
            <select
              className="in"
              value={reg.profession}
              onChange={(e) => setReg({ ...reg, profession: e.target.value })}
            >
              {PROFESSIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          {reg.profession === 'Others' ? (
            <Field label="Please specify">
              <input
                className="in"
                placeholder="Your profession"
                value={reg.professionOther}
                onChange={(e) => setReg({ ...reg, professionOther: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="Birthdate">
              <input
                className="in"
                type="date"
                value={reg.birthdate}
                onChange={(e) => setReg({ ...reg, birthdate: e.target.value })}
              />
            </Field>
          )}
          <Field label="Years of Practice (if applicable)">
            <input
              className="in"
              inputMode="numeric"
              placeholder="e.g., 5 (or 0)"
              value={reg.yearsOfPractice}
              onChange={(e) =>
                setReg({ ...reg, yearsOfPractice: e.target.value.replace(/[^\d]/g, '') })
              }
            />
          </Field>
          {reg.profession === 'Others' && (
            <Field label="Birthdate">
              <input
                className="in"
                type="date"
                value={reg.birthdate}
                onChange={(e) => setReg({ ...reg, birthdate: e.target.value })}
              />
            </Field>
          )}
        </div>
        {regError && <div className="err">{regError}</div>}
        <div className="form-actions">
          <button className="btn-ghost" type="button" onClick={onCancel}>
            Back
          </button>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Start playing →'}
          </button>
        </div>
      </form>
    </section>
  )
}

// ── Game 1: SLP trivia sprint ────────────────────────────────────────────────
function QuizRound({
  reg,
  onExit,
  onClaimed,
  sessionId,
  playerName,
}: {
  reg: RegForm
  onExit: () => void
  onClaimed: (info: ClaimInfo) => void
  sessionId: string
  playerName: string
}) {
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'result'>('countdown')

  // deck + play state
  const [deck, setDeck] = useState<PlayQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [countdown, setCountdown] = useState(3)

  const { claiming, result, error: claimError, claim } = usePrizeClaim(reg, 'slp-quiz', onClaimed)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tier = correct >= TIER_8_MIN ? 8 : correct >= TIER_5_MIN ? 5 : 0

  const startCountdown = useCallback(() => {
    setDeck(buildDeck())
    setIdx(0)
    setPicked(null)
    setLocked(false)
    setCorrect(0)
    setAnswered(0)
    setTimeLeft(ROUND_SECONDS)
    setCountdown(3)
    setPhase('countdown')
  }, [])

  // Registration already happened in the picker — kick the round off on mount.
  useEffect(() => {
    startCountdown()
  }, [startCountdown])

  // 3-2-1 countdown before play
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // main round timer
  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) {
      setPhase('result')
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft])

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  const current = deck[idx]

  // Broadcast state to the booth Mirror View (once per meaningful change).
  useEffect(() => {
    if (phase === 'countdown') return
    postMirror({
      sessionId,
      name: playerName,
      game: 'slp-quiz',
      kind: 'quiz',
      status: phase,
      quiz: {
        phase,
        question: current?.q ?? null,
        choices: current?.choices ?? [],
        picked,
        answer: current?.answer ?? null,
        correct,
        answered,
        timeLeft,
        tier,
        code: result?.code ?? null,
      },
    })
  }, [phase, idx, picked, correct, answered, timeLeft, tier, result, sessionId, playerName]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback(
    (choiceIdx: number) => {
      if (locked || !current || phase !== 'playing') return
      setLocked(true)
      setPicked(choiceIdx)
      setAnswered((a) => a + 1)
      if (choiceIdx === current.answer) setCorrect((c) => c + 1)
      advanceTimer.current = setTimeout(() => {
        setPicked(null)
        setLocked(false)
        setIdx((i) => {
          const next = i + 1
          if (next >= deck.length) {
            setPhase('result')
            return i
          }
          return next
        })
      }, FEEDBACK_MS)
    },
    [locked, current, phase, deck.length],
  )

  // ── Render per phase ──────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <section className="panel center count">
        <div className="count-num">{countdown > 0 ? countdown : 'Go!'}</div>
        <p className="lede sm">Fingers ready…</p>
      </section>
    )
  }

  if (phase === 'playing' && current) {
    const pct = (timeLeft / ROUND_SECONDS) * 100
    const low = timeLeft <= 15
    return (
      <section className="panel play">
        <div className="hud">
          <div className={`timer ${low ? 'low' : ''}`}>
            ⏱️ {String(Math.floor(timeLeft / 60))}:{String(timeLeft % 60).padStart(2, '0')}
          </div>
          <div className="score">
            <b>{correct}</b> correct
          </div>
        </div>
        <div className="bar">
          <div className={`bar-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="q-count">Question {answered + 1}</div>
        <h2 className="q-text">{current.q}</h2>

        <div className="choices">
          {current.choices.map((c, i) => {
            let cls = 'choice'
            if (picked !== null) {
              if (i === current.answer) cls += ' correct'
              else if (i === picked) cls += ' wrong'
              else cls += ' dim'
            }
            return (
              <button key={i} className={cls} onClick={() => choose(i)} disabled={locked}>
                <span className="letter">{String.fromCharCode(65 + i)}</span>
                <span className="ctext">{c}</span>
              </button>
            )
          })}
        </div>
        <div className="ref">{picked !== null ? current.ref : ' '}</div>
      </section>
    )
  }

  // result
  const win = tier > 0
  return (
    <section className="panel center">
      <div className="hero-emoji" aria-hidden>
        {win ? '🎉' : '👏'}
      </div>
      <div className="kicker">{win ? 'You did it!' : 'Round over'}</div>
      <h1 className="h1">
        {correct} correct{answered ? ` / ${answered} answered` : ''}
      </h1>

      {win ? (
        result ? (
          <PrizeReveal result={result} email={reg.email} />
        ) : (
          <PrizePicker tier={tier} claiming={claiming} error={claimError} onPick={(p) => claim(p, tier, correct)} />
        )
      ) : (
        <p className="lede">
          So close! You needed <b>{TIER_5_MIN}</b> for a prize. Catch your breath and run it back —
          the questions reshuffle every time.
        </p>
      )}

      <div className="result-actions">
        <button className="btn-ghost" onClick={onExit}>
          ← Back to games
        </button>
        {/* No replay once won — one prize per person. Retry only shows if they didn't win. */}
        {!win && (
          <button className="btn-primary big" onClick={startCountdown}>
            Try again 🔁
          </button>
        )}
      </div>
    </section>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="field">
      <span className="flabel">
        {label} {required && <span className="req">*</span>}
      </span>
      {children}
    </label>
  )
}

// ── Game 2: Flappy Phoneme — chase the cherub ────────────────────────────────
// A canvas side-scroller: the bird flaps through gaps in the clinic sky chasing
// a winged pedia patient (the cherub). Three lives; reach the finish alive → 5%.
const FL = {
  W: 360,
  H: 520,
  GROUND: 480,
  GOAL: 3000, // px of travel to the finish (~19s at SPEED)
  SPEED: 155, // px/s scroll
  GRAVITY: 1500,
  FLAP: -430,
  MAX_FALL: 560,
  BIRD_X: 72,
  BIRD_R: 15,
  COL_W: 56,
  GAP_H: 170,
  SPAWN_GAP: 300,
  INV_MS: 1300,
  WORD_VY: -140, // px/s upward launch speed of the SLP-word projectiles
}

// SLP terms fired up from the ground — the bird must dodge them.
const SLP_WORDS = [
  'phoneme', 'morpheme', 'dysphagia', 'aphasia', 'prosody', 'apraxia', 'fluency',
  'lisp', 'babbling', 'larynx', 'velum', 'bolus', 'stutter', 'semantics', 'syntax',
  'pragmatics', 'cluttering', 'dysarthria', 'glottal', 'resonance', 'articulation',
]

type FlappyWord = { x: number; y: number; vy: number; vx: number; text: string; w: number }

type FlappyState = {
  birdY: number
  birdV: number
  dist: number
  obstacles: { x: number; gapY: number; passed: boolean }[]
  words: FlappyWord[]
  nextWordT: number
  lives: number
  invUntil: number
  bob: number
}

function newFlappyState(): FlappyState {
  return {
    birdY: FL.H * 0.42,
    birdV: 0,
    dist: 0,
    obstacles: [],
    words: [],
    nextWordT: 0,
    lives: 3,
    invUntil: 0,
    bob: 0,
  }
}

function FlappyRound({
  reg,
  onExit,
  onClaimed,
  sessionId,
  playerName,
}: {
  reg: RegForm
  onExit: () => void
  onClaimed: (info: ClaimInfo) => void
  sessionId: string
  playerName: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const g = useRef<FlappyState>(newFlappyState())
  const raf = useRef<number>(0)
  const statusRef = useRef<'ready' | 'flying' | 'dead' | 'won'>('ready')

  const [status, setStatusState] = useState<'ready' | 'flying' | 'dead' | 'won'>('ready')
  const { claiming, result, error: claimError, claim } = usePrizeClaim(reg, 'slp-flappy', onClaimed)

  const setPhase = useCallback((p: 'ready' | 'flying' | 'dead' | 'won') => {
    statusRef.current = p
    setStatusState(p)
  }, [])

  const flap = useCallback(() => {
    if (statusRef.current === 'ready') {
      setPhase('flying')
      g.current.birdV = FL.FLAP
    } else if (statusRef.current === 'flying') {
      g.current.birdV = FL.FLAP
    }
  }, [setPhase])

  // Once a prize is won it can't be replayed (one prize per person), so restart
  // is only offered on the "dead" screen.
  const restart = useCallback(() => {
    g.current = newFlappyState()
    setPhase('ready')
  }, [setPhase])

  // Space bar flaps (and never scrolls the page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        flap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap])

  // Dev-only handle so the game loop can be exercised in automated tests.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __flappy?: unknown }).__flappy = g
  }, [])

  // Main render + physics loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = FL.W * dpr
    canvas.height = FL.H * dpr
    ctx.scale(dpr, dpr)

    // Downscaled offscreen canvas for the Mirror View frames (keeps them small).
    const mini = document.createElement('canvas')
    mini.width = 200
    mini.height = Math.round((200 * FL.H) / FL.W)
    const mctx = mini.getContext('2d')
    let lastMirror = 0

    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      if (statusRef.current === 'flying') stepFlappy(g.current, dt, now, setPhase)
      drawFlappy(ctx, g.current, now)
      if (mctx && now - lastMirror > 320) {
        lastMirror = now
        mctx.drawImage(canvas, 0, 0, mini.width, mini.height)
        postMirror({
          sessionId,
          name: playerName,
          game: 'slp-flappy',
          kind: 'image',
          status: statusRef.current,
          image: mini.toDataURL('image/jpeg', 0.5),
        })
      }
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [setPhase, sessionId, playerName])


  return (
    <section className="panel">
      <div className="kicker">Flappy Phoneme</div>
      <h1 className="h1 sm">Chase the Cherub 👼</h1>
      <div className="fl-stage" onPointerDown={flap} role="button" tabIndex={0} aria-label="Tap to flap">
        <canvas ref={canvasRef} className="fl-canvas" style={{ aspectRatio: `${FL.W} / ${FL.H}` }} />
        {status === 'ready' && (
          <div className="fl-overlay">
            <div className="fl-o-emoji" aria-hidden>🐤</div>
            <div className="fl-o-title">Tap to fly</div>
            <div className="fl-o-sub">
              Flap through the gaps, <b>dodge the flying SLP words</b>, and catch the little angel at
              the finish. You&apos;ve got <b>3 lives</b> — reach the end alive for <b>5% off</b>.
            </div>
            <div className="fl-o-hint">Tap · click · press Space</div>
          </div>
        )}
        {status === 'dead' && (
          <div className="fl-overlay">
            <div className="fl-o-emoji" aria-hidden>😵‍💫</div>
            <div className="fl-o-title">Out of lives!</div>
            <div className="fl-o-sub">The cherub fluttered off. Give it another flap?</div>
            <button className="btn-primary" onClick={restart}>
              Try again 🔁
            </button>
          </div>
        )}
        {status === 'won' && (
          <div className="fl-overlay win">
            <div className="fl-o-emoji" aria-hidden>🎉</div>
            <div className="fl-o-title">You caught the cherub!</div>
            {result ? (
              <PrizeReveal result={result} email={reg.email} />
            ) : (
              <PrizePicker tier={5} claiming={claiming} error={claimError} onPick={(p) => claim(p, 5, 0)} />
            )}
          </div>
        )}
      </div>
      <div className="result-actions">
        <button className="btn-ghost" onClick={onExit}>
          ← Back to games
        </button>
      </div>
    </section>
  )
}

function stepFlappy(
  G: FlappyState,
  dt: number,
  now: number,
  setPhase: (p: 'ready' | 'flying' | 'dead' | 'won') => void,
) {
  G.birdV = Math.min(FL.MAX_FALL, G.birdV + FL.GRAVITY * dt)
  G.birdY += G.birdV * dt
  G.dist += FL.SPEED * dt
  G.bob += dt

  for (const o of G.obstacles) o.x -= FL.SPEED * dt
  G.obstacles = G.obstacles.filter((o) => o.x > -FL.COL_W - 10)

  const rightmost = G.obstacles.length ? Math.max(...G.obstacles.map((o) => o.x)) : -Infinity
  if (rightmost < FL.W - FL.SPAWN_GAP && G.dist < FL.GOAL - 320) {
    const margin = 66
    const gapY = margin + Math.random() * (FL.GROUND - margin * 2 - FL.GAP_H)
    G.obstacles.push({ x: FL.W + 30, gapY, passed: false })
  }

  // SLP-word projectiles: launched up from the ground, drifting with the scroll.
  if (!G.nextWordT) G.nextWordT = now + 2500 // grace period before the first word
  for (const w of G.words) {
    w.y += w.vy * dt
    w.x += (w.vx - FL.SPEED) * dt
    w.vy += 220 * dt // slight gravity so they arc and fall back
  }
  G.words = G.words.filter((w) => w.y < FL.GROUND + 30 && w.x > -w.w - 20)
  if (now >= G.nextWordT && G.dist < FL.GOAL - 200) {
    const text = SLP_WORDS[Math.floor(Math.random() * SLP_WORDS.length)]
    const w = text.length * 7.2 + 16
    G.words.push({
      x: 90 + Math.random() * (FL.W - 130),
      y: FL.GROUND,
      vy: FL.WORD_VY - Math.random() * 90,
      vx: -30 + Math.random() * 60,
      text,
      w,
    })
    G.nextWordT = now + 1300 + Math.random() * 1100
  }

  const inv = now < G.invUntil
  if (!inv) {
    const bx = FL.BIRD_X
    const br = FL.BIRD_R
    let hit = G.birdY - br < 0 || G.birdY + br > FL.GROUND
    if (!hit) {
      for (const o of G.obstacles) {
        if (bx + br > o.x && bx - br < o.x + FL.COL_W) {
          if (G.birdY - br < o.gapY || G.birdY + br > o.gapY + FL.GAP_H) {
            hit = true
            break
          }
        }
      }
    }
    if (!hit) {
      for (const w of G.words) {
        if (Math.abs(bx - w.x) < w.w / 2 + br && Math.abs(G.birdY - w.y) < 12 + br) {
          hit = true
          break
        }
      }
    }
    if (hit) {
      G.lives -= 1
      if (G.lives <= 0) {
        G.lives = 0
        setPhase('dead')
        return
      }
      G.invUntil = now + FL.INV_MS
      G.birdY = FL.H * 0.42
      G.birdV = 0
    }
  }

  if (G.dist >= FL.GOAL) setPhase('won')
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawFlappy(ctx: CanvasRenderingContext2D, G: FlappyState, now: number) {
  const { W, H, GROUND, GOAL, COL_W, GAP_H, BIRD_X } = FL

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#dff1f6')
  sky.addColorStop(1, '#f7faf1')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Parallax clouds
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  for (let i = 0; i < 3; i++) {
    const span = W + 80
    const cx = (((i * 150 - G.dist * 0.25) % span) + span) % span - 40
    const cy = 70 + i * 34
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    ctx.arc(cx + 18, cy + 4, 20, 0, Math.PI * 2)
    ctx.arc(cx + 40, cy, 15, 0, Math.PI * 2)
    ctx.fill()
  }

  // Obstacles
  for (const o of G.obstacles) {
    ctx.fillStyle = '#8bb79a'
    ctx.fillRect(o.x, 0, COL_W, o.gapY)
    ctx.fillRect(o.x, o.gapY + GAP_H, COL_W, GROUND - (o.gapY + GAP_H))
    ctx.fillStyle = '#5c8f6f'
    ctx.fillRect(o.x - 3, o.gapY - 14, COL_W + 6, 14)
    ctx.fillRect(o.x - 3, o.gapY + GAP_H, COL_W + 6, 14)
  }

  // Ground
  ctx.fillStyle = '#d3e2c4'
  ctx.fillRect(0, GROUND, W, H - GROUND)
  ctx.fillStyle = '#b9d1a6'
  ctx.fillRect(0, GROUND, W, 4)

  // SLP-word projectiles (dodge these) — coral pills with the term inside.
  ctx.font = '600 13px Manrope, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const w of G.words) {
    ctx.fillStyle = '#e07a5f'
    roundRectPath(ctx, w.x - w.w / 2, w.y - 11, w.w, 22, 11)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(w.text, w.x, w.y + 1)
  }

  // Cherub (the goal pacer) fluttering near the finish edge
  const cherY = GROUND * 0.34 + Math.sin(G.bob * 2.2) * 16
  ctx.font = '30px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('👼', W - 40, cherY)

  // Bird — mirrored horizontally so it faces right, toward the cherub it's chasing.
  ctx.save()
  ctx.translate(BIRD_X, G.birdY)
  const ang = Math.max(-0.5, Math.min(0.9, G.birdV / 520))
  ctx.scale(-1, 1)
  ctx.rotate(-ang)
  if (now < G.invUntil) ctx.globalAlpha = 0.4 + 0.35 * Math.abs(Math.sin(now / 70))
  ctx.font = '30px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🐤', 0, 0)
  ctx.restore()
  ctx.globalAlpha = 1

  // HUD — hearts
  ctx.font = '15px serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let hearts = ''
  for (let i = 0; i < 3; i++) hearts += i < G.lives ? '❤️' : '🤍'
  ctx.fillText(hearts, 10, 10)

  // HUD — progress bar to the finish
  const bw = 150
  const bx = (W - bw) / 2
  const by = 16
  ctx.fillStyle = 'rgba(36,73,82,0.18)'
  roundRectPath(ctx, bx, by, bw, 8, 4)
  ctx.fill()
  ctx.fillStyle = '#4a8073'
  roundRectPath(ctx, bx, by, bw * Math.min(1, G.dist / GOAL), 8, 4)
  ctx.fill()
  ctx.font = '13px serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('🏁', bx + bw + 4, by + 5)
}

// ── Scoped styles ────────────────────────────────────────────────────────────
function StyleTag() {
  return (
    <style jsx global>{`
      :root {
        --primary: #4a8073;
        --primary-dark: #244952;
        --primary-darker: #18353c;
        --accent: #c69849;
        --accent-dark: #8a6a2f;
        --warm: #d68a3f;
        --text: #223841;
        --muted: #5d6f6a;
        --border: #dde6d4;
        --bg: #f7faf1;
        --bg-alt: #edf3d9;
        --card: #fff;
        --good: #16a34a;
        --bad: #dc2626;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-manrope), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI',
          sans-serif;
      }
      .wrap {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        background: var(--primary-dark);
        color: #fff;
      }
      .brand {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 800;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .brand-sub {
        font-weight: 500;
        opacity: 0.75;
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent), var(--warm));
        display: inline-block;
      }
      .qr-toggle {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .qr-toggle:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .tabs {
        display: flex;
        gap: 6px;
        padding: 12px 14px 0;
        max-width: 760px;
        margin: 0 auto;
        width: 100%;
      }
      .tab {
        flex: 1;
        padding: 11px 8px;
        border: 1px solid var(--border);
        border-bottom: none;
        background: #eef3e6;
        color: var(--muted);
        font-weight: 700;
        font-size: 15px;
        border-radius: 12px 12px 0 0;
        cursor: pointer;
        letter-spacing: 0.03em;
      }
      .tab.active {
        background: var(--card);
        color: var(--primary-dark);
        box-shadow: 0 -2px 0 var(--accent) inset;
      }
      .stage {
        flex: 1;
        padding: 0 14px 26px;
        max-width: 760px;
        margin: 0 auto;
        width: 100%;
      }
      .panel {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 0 0 18px 18px;
        padding: 26px 22px 30px;
        box-shadow: 0 6px 16px -4px rgba(0, 0, 0, 0.1);
      }
      .panel.center {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .kicker {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 12px;
        font-weight: 800;
        color: var(--warm);
        margin-bottom: 8px;
      }
      .h1 {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 800;
        color: var(--primary-dark);
        font-size: 28px;
        line-height: 1.15;
        margin: 0 0 12px;
      }
      .h1.sm {
        font-size: 23px;
      }
      .lede {
        color: var(--muted);
        font-size: 16px;
        line-height: 1.55;
        max-width: 540px;
        margin: 0 0 18px;
      }
      .lede.sm {
        font-size: 14px;
      }
      .hero-emoji {
        font-size: 54px;
        line-height: 1;
        margin-bottom: 8px;
      }
      .soon-emoji {
        font-size: 46px;
        margin-bottom: 10px;
      }
      .rules {
        list-style: none;
        padding: 0;
        margin: 4px 0 22px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        text-align: left;
        background: var(--bg-alt);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px 18px;
        font-size: 15px;
        color: var(--text);
      }
      .rules b {
        color: var(--primary-dark);
      }
      .pill {
        display: inline-block;
        font-size: 12px;
        font-weight: 700;
        color: var(--accent-dark);
        background: #f3e7cf;
        border: 1px solid #e6d3ac;
        padding: 4px 12px;
        border-radius: 999px;
      }
      .btn-primary {
        background: var(--warm);
        color: #fff;
        border: none;
        border-radius: 12px;
        padding: 13px 22px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 6px 14px -4px rgba(214, 138, 63, 0.6);
      }
      .btn-primary:hover {
        filter: brightness(1.05);
      }
      .btn-primary:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .btn-primary.big {
        padding: 15px 30px;
        font-size: 17px;
      }
      .btn-ghost {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--muted);
        border-radius: 12px;
        padding: 13px 20px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      /* form */
      .form {
        text-align: left;
      }
      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px 16px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .flabel {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .req {
        color: var(--warm);
      }
      .in {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 15px;
        font-family: inherit;
        color: var(--text);
        background: #fff;
        width: 100%;
      }
      .in:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(74, 128, 115, 0.15);
      }
      .form-actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 20px;
      }
      .err {
        color: var(--bad);
        font-size: 14px;
        font-weight: 600;
        margin-top: 14px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 10px;
        padding: 10px 12px;
      }
      /* countdown */
      .count-num {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 900;
        font-size: 96px;
        color: var(--primary-dark);
        line-height: 1;
        animation: pop 0.8s ease;
      }
      @keyframes pop {
        0% {
          transform: scale(0.4);
          opacity: 0;
        }
        60% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
      /* play */
      .hud {
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: sticky;
        top: 0;
      }
      .timer {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 800;
        font-size: 22px;
        color: var(--primary-dark);
      }
      .timer.low {
        color: var(--bad);
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.55;
        }
      }
      .score {
        font-size: 15px;
        color: var(--muted);
      }
      .score b {
        color: var(--primary);
        font-size: 20px;
      }
      .bar {
        height: 8px;
        background: var(--bg-alt);
        border-radius: 999px;
        overflow: hidden;
        margin: 10px 0 18px;
      }
      .bar-fill {
        height: 100%;
        background: var(--primary);
        transition: width 1s linear;
      }
      .bar-fill.low {
        background: var(--bad);
      }
      .q-count {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent-dark);
        margin-bottom: 6px;
      }
      .q-text {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 700;
        color: var(--primary-dark);
        font-size: 20px;
        line-height: 1.3;
        margin: 0 0 18px;
        min-height: 52px;
      }
      .choices {
        display: flex;
        flex-direction: column;
        gap: 11px;
      }
      .choice {
        display: flex;
        align-items: center;
        gap: 13px;
        text-align: left;
        border: 1.5px solid var(--border);
        background: #fff;
        border-radius: 14px;
        padding: 14px 15px;
        font-size: 16px;
        font-family: inherit;
        color: var(--text);
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .choice:hover:not(:disabled) {
        border-color: var(--primary);
        background: #f4f8f0;
      }
      .choice:disabled {
        cursor: default;
      }
      .letter {
        flex: none;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: var(--bg-alt);
        color: var(--primary-dark);
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .choice.correct {
        border-color: var(--good);
        background: #ecfdf3;
        color: #0f5132;
      }
      .choice.correct .letter {
        background: var(--good);
        color: #fff;
      }
      .choice.wrong {
        border-color: var(--bad);
        background: #fef2f2;
        color: #7f1d1d;
      }
      .choice.wrong .letter {
        background: var(--bad);
        color: #fff;
      }
      .choice.dim {
        opacity: 0.55;
      }
      .ref {
        margin-top: 14px;
        font-size: 12px;
        font-style: italic;
        color: var(--light, #9aa89f);
        min-height: 16px;
        text-align: center;
      }
      /* voucher */
      .voucher {
        border: 2px dashed var(--accent);
        background: #fbf7ec;
        border-radius: 16px;
        padding: 20px 22px;
        margin: 6px 0 20px;
        width: 100%;
        max-width: 420px;
      }
      .v-kicker {
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        font-weight: 800;
        color: var(--accent-dark);
      }
      .v-code {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 900;
        font-size: 30px;
        letter-spacing: 0.05em;
        color: var(--primary-dark);
        margin: 8px 0;
        word-break: break-all;
      }
      .v-note {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
      }
      .footnote {
        text-align: center;
        font-size: 11px;
        color: #9aa89f;
        padding: 14px;
      }
      /* qr overlay */
      .qr-overlay {
        position: fixed;
        inset: 0;
        background: rgba(24, 53, 60, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 50;
      }
      .qr-card {
        background: #fff;
        border-radius: 22px;
        padding: 30px 34px 34px;
        text-align: center;
        position: relative;
        max-width: 420px;
        width: 100%;
      }
      .qr-close {
        position: absolute;
        top: 12px;
        right: 16px;
        border: none;
        background: transparent;
        font-size: 28px;
        line-height: 1;
        color: var(--muted);
        cursor: pointer;
      }
      .qr-kicker {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 12px;
        font-weight: 800;
        color: var(--warm);
      }
      .qr-title {
        font-family: var(--font-montserrat), sans-serif;
        color: var(--primary-dark);
        font-size: 22px;
        margin: 6px 0 16px;
      }
      .qr-img {
        display: block;
        width: 100%;
        max-width: 300px;
        height: auto;
        margin: 0 auto;
        border-radius: 14px;
        border: 1px solid var(--border);
      }
      .qr-url {
        margin-top: 14px;
        font-weight: 700;
        color: var(--primary-dark);
        font-size: 15px;
        word-break: break-all;
      }
      @media (max-width: 560px) {
        .grid2 {
          grid-template-columns: 1fr;
        }
        .h1 {
          font-size: 24px;
        }
        .q-text {
          font-size: 18px;
        }
      }
    `}</style>
  )
}

// ── Styles for the game picker + Flappy round ────────────────────────────────
function GameStyles() {
  return (
    <style jsx global>{`
      .game-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-top: 8px;
      }
      .game-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        text-align: left;
        background: var(--bg-alt);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px 18px;
        cursor: pointer;
        font-family: inherit;
        transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
      }
      .game-card:hover:not(.disabled) {
        border-color: var(--primary);
        transform: translateY(-2px);
        box-shadow: 0 8px 18px -6px rgba(0, 0, 0, 0.16);
      }
      .game-card.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .game-card.disabled .gc-cta {
        color: var(--muted);
      }
      .gc-emoji {
        font-size: 34px;
        line-height: 1;
      }
      .gc-title {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 800;
        color: var(--primary-dark);
        font-size: 17px;
        line-height: 1.2;
      }
      .gc-desc {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
      }
      .gc-cta {
        margin-top: auto;
        color: var(--warm);
        font-weight: 700;
        font-size: 14px;
      }
      .result-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .prize-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        width: 100%;
        max-width: 440px;
        margin: 8px 0 4px;
      }
      .prize-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        text-align: center;
        background: var(--bg-alt);
        border: 1.5px solid var(--border);
        border-radius: 14px;
        padding: 16px 12px;
        cursor: pointer;
        font-family: inherit;
        transition: transform 0.12s ease, border-color 0.12s ease;
      }
      .prize-card:hover:not(:disabled) {
        border-color: var(--warm);
        transform: translateY(-2px);
      }
      .prize-card:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .fl-overlay .prize-card {
        background: #fff;
        color: var(--text);
      }
      .pz-emoji {
        font-size: 30px;
        line-height: 1;
      }
      .pz-title {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 800;
        color: var(--primary-dark);
        font-size: 15px;
      }
      .pz-desc {
        font-size: 12px;
        color: var(--muted);
        line-height: 1.4;
      }
      .fl-stage {
        position: relative;
        width: 100%;
        max-width: 360px;
        margin: 14px auto 16px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid var(--border);
        touch-action: manipulation;
        user-select: none;
        cursor: pointer;
      }
      .fl-canvas {
        display: block;
        width: 100%;
        height: auto;
      }
      .fl-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        text-align: center;
        padding: 24px;
        background: rgba(24, 53, 60, 0.55);
        color: #fff;
      }
      .fl-overlay.win {
        background: rgba(24, 53, 60, 0.74);
      }
      .fl-o-emoji {
        font-size: 44px;
        line-height: 1;
      }
      .fl-o-title {
        font-family: var(--font-montserrat), sans-serif;
        font-weight: 800;
        font-size: 22px;
      }
      .fl-o-sub {
        font-size: 14px;
        max-width: 300px;
        line-height: 1.5;
        opacity: 0.96;
      }
      .fl-o-hint {
        font-size: 12px;
        opacity: 0.8;
        letter-spacing: 0.04em;
        margin-top: 2px;
      }
      .fl-overlay .voucher {
        background: #fff;
        color: var(--text);
      }
      .fl-overlay .err {
        margin-top: 0;
      }
      .fl-overlay .btn-primary {
        margin-top: 6px;
      }
      @media (max-width: 560px) {
        .game-cards {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  )
}
