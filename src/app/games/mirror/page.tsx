'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Booth backend: live-mirror a player's phone game onto a laptop/projector.
// Lists everyone currently playing and mirrors whichever player you pick.

type Session = {
  sessionId: string
  name: string
  game: 'slp-quiz' | 'slp-flappy'
  status?: string
  updatedAt: number
}

type Payload = Session & {
  kind: 'image' | 'quiz'
  image?: string
  quiz?: {
    phase?: string
    question?: string | null
    choices?: string[]
    picked?: number | null
    answer?: number | null
    correct?: number
    answered?: number
    timeLeft?: number
    tier?: number
    code?: string | null
  }
}

export default function MirrorPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [payload, setPayload] = useState<Payload | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected

  // Poll the active-player list.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/public/games/mirror', { cache: 'no-store' })
        const d = await r.json()
        if (cancelled || !d?.ok) return
        const list: Session[] = d.sessions || []
        setSessions(list)
        // Auto-select the first player if nothing valid is selected.
        if (!selectedRef.current || !list.find((s) => s.sessionId === selectedRef.current)) {
          setSelected(list[0]?.sessionId ?? null)
        }
      } catch {
        /* ignore */
      }
    }
    load()
    const iv = setInterval(load, 1500)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  // Poll the selected player's live frame.
  useEffect(() => {
    if (!selected) {
      setPayload(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch(`/api/public/games/mirror?sessionId=${encodeURIComponent(selected)}`, {
          cache: 'no-store',
        })
        if (!r.ok) {
          if (!cancelled) setPayload(null)
          return
        }
        const d = await r.json()
        if (!cancelled && d?.ok) setPayload(d.payload)
      } catch {
        /* ignore */
      }
    }
    load()
    const iv = setInterval(load, 300)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [selected])

  const ago = useCallback((t: number) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000))
    return s < 2 ? 'live' : `${s}s ago`
  }, [])

  const gameLabel = (g: string) => (g === 'slp-flappy' ? 'Flappy Phoneme' : 'SLP Speed Round')
  const stale = payload ? Date.now() - payload.updatedAt > 4000 : false

  return (
    <div className="wrap">
      <header className="bar">
        <div className="brand">
          <span className="dot" />
          Aura Health <span className="sub">· Mirror View</span>
        </div>
        <div className="count">{sessions.length} playing now</div>
      </header>

      <div className="body">
        <aside className="list">
          <div className="list-head">Players</div>
          {sessions.length === 0 && <div className="empty">No one is playing right now.</div>}
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              className={`player ${selected === s.sessionId ? 'active' : ''}`}
              onClick={() => setSelected(s.sessionId)}
            >
              <div className="p-name">{s.name}</div>
              <div className="p-meta">
                <span className={`badge ${s.game}`}>{gameLabel(s.game)}</span>
                <span className="p-ago">{ago(s.updatedAt)}</span>
              </div>
              {selected === s.sessionId && <div className="p-cta">▶ Mirror View</div>}
            </button>
          ))}
        </aside>

        <main className="stage">
          {!selected && <div className="ph">Pick a player to mirror their screen.</div>}
          {selected && !payload && <div className="ph">Waiting for {sessions.find((s) => s.sessionId === selected)?.name ?? 'player'}…</div>}
          {payload && (
            <div className="screen">
              <div className="screen-head">
                <span className="screen-name">{payload.name}</span>
                <span className={`badge ${payload.game}`}>{gameLabel(payload.game)}</span>
                {stale && <span className="stale">paused / disconnected</span>}
              </div>
              <div className="phone">
                {payload.kind === 'image' && payload.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={payload.image} alt="Live game" className="frame" />
                )}
                {payload.kind === 'quiz' && <QuizMirror quiz={payload.quiz} />}
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="foot">
        Turn games on/off in the HR Hub → Seminars &amp; Trainings → Marketing Vouchers → Game Controls.
      </footer>

      <style jsx global>{`
        :root {
          --primary: #4a8073;
          --primary-dark: #244952;
          --accent: #c69849;
          --warm: #d68a3f;
          --muted: #5d6f6a;
          --border: #dde6d4;
          --bg: #f7faf1;
          --good: #16a34a;
          --bad: #dc2626;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: #223841; font-family: var(--font-manrope), Inter, system-ui, sans-serif; }
        .wrap { min-height: 100dvh; display: flex; flex-direction: column; }
        .bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; background: var(--primary-dark); color: #fff; }
        .brand { font-family: var(--font-montserrat), sans-serif; font-weight: 800; display: flex; align-items: center; gap: 9px; }
        .sub { font-weight: 500; opacity: 0.75; }
        .dot { width: 12px; height: 12px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--warm)); }
        .count { font-size: 13px; opacity: 0.85; }
        .body { flex: 1; display: flex; gap: 16px; padding: 16px; max-width: 1100px; margin: 0 auto; width: 100%; }
        .list { width: 260px; flex: none; display: flex; flex-direction: column; gap: 8px; }
        .list-head { font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); padding: 4px 2px; }
        .empty { font-size: 13px; color: var(--muted); padding: 16px; background: #fff; border: 1px solid var(--border); border-radius: 12px; }
        .player { text-align: left; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; cursor: pointer; font-family: inherit; }
        .player:hover { border-color: var(--primary); }
        .player.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(74, 128, 115, 0.2); }
        .p-name { font-weight: 700; color: var(--primary-dark); }
        .p-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
        .p-ago { font-size: 11px; color: var(--muted); }
        .p-cta { margin-top: 8px; font-size: 12px; font-weight: 700; color: var(--warm); }
        .badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
        .badge.slp-quiz { background: #eef2ff; color: #4338ca; }
        .badge.slp-flappy { background: #ecfdf3; color: #15803d; }
        .stage { flex: 1; display: flex; align-items: flex-start; justify-content: center; }
        .ph { color: var(--muted); font-size: 15px; padding: 60px 20px; text-align: center; }
        .screen { width: 100%; max-width: 420px; }
        .screen-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .screen-name { font-family: var(--font-montserrat), sans-serif; font-weight: 800; color: var(--primary-dark); font-size: 20px; }
        .stale { font-size: 11px; color: var(--bad); font-weight: 700; }
        .phone { background: #fff; border: 1px solid var(--border); border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.2); }
        .frame { display: block; width: 100%; height: auto; image-rendering: auto; }
        .foot { text-align: center; font-size: 12px; color: var(--muted); padding: 14px; }
        /* quiz mirror */
        .qm { padding: 20px 18px 24px; }
        .qm-hud { display: flex; align-items: center; justify-content: space-between; }
        .qm-timer { font-family: var(--font-montserrat), sans-serif; font-weight: 800; font-size: 20px; color: var(--primary-dark); }
        .qm-timer.low { color: var(--bad); }
        .qm-score { font-size: 14px; color: var(--muted); }
        .qm-score b { color: var(--primary); font-size: 18px; }
        .qm-q { font-family: var(--font-montserrat), sans-serif; font-weight: 700; color: var(--primary-dark); font-size: 17px; line-height: 1.3; margin: 14px 0 14px; min-height: 46px; }
        .qm-choices { display: flex; flex-direction: column; gap: 9px; }
        .qm-choice { display: flex; gap: 10px; align-items: center; border: 1.5px solid var(--border); border-radius: 12px; padding: 11px 12px; font-size: 14px; }
        .qm-choice .l { width: 24px; height: 24px; border-radius: 7px; background: #edf3d9; color: var(--primary-dark); font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 12px; flex: none; }
        .qm-choice.correct { border-color: var(--good); background: #ecfdf3; }
        .qm-choice.correct .l { background: var(--good); color: #fff; }
        .qm-choice.wrong { border-color: var(--bad); background: #fef2f2; }
        .qm-choice.wrong .l { background: var(--bad); color: #fff; }
        .qm-result { text-align: center; padding: 20px 0; }
        .qm-result .big { font-family: var(--font-montserrat), sans-serif; font-weight: 900; font-size: 28px; color: var(--primary-dark); }
        .qm-code { margin-top: 10px; font-family: var(--font-montserrat), sans-serif; font-weight: 800; font-size: 20px; letter-spacing: 0.05em; color: var(--warm); }
        @media (max-width: 720px) {
          .body { flex-direction: column; }
          .list { width: 100%; flex-direction: row; overflow-x: auto; }
          .player { min-width: 180px; }
        }
      `}</style>
    </div>
  )
}

function QuizMirror({ quiz }: { quiz?: Payload['quiz'] }) {
  if (!quiz) return <div className="qm" style={{ color: '#5d6f6a' }}>Loading…</div>
  const t = quiz.timeLeft ?? 0
  if (quiz.phase === 'result') {
    return (
      <div className="qm">
        <div className="qm-result">
          <div className="big">{quiz.correct ?? 0} correct</div>
          {quiz.tier ? <div style={{ color: '#5d6f6a', marginTop: 6 }}>Won {quiz.tier}% off 🎉</div> : null}
          {quiz.code ? <div className="qm-code">{quiz.code}</div> : null}
        </div>
      </div>
    )
  }
  return (
    <div className="qm">
      <div className="qm-hud">
        <div className={`qm-timer ${t <= 15 ? 'low' : ''}`}>
          ⏱️ {Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}
        </div>
        <div className="qm-score">
          <b>{quiz.correct ?? 0}</b> correct
        </div>
      </div>
      <div className="qm-q">{quiz.question ?? '…'}</div>
      <div className="qm-choices">
        {(quiz.choices ?? []).map((c, i) => {
          let cls = 'qm-choice'
          if (quiz.picked !== null && quiz.picked !== undefined) {
            if (i === quiz.answer) cls += ' correct'
            else if (i === quiz.picked) cls += ' wrong'
          }
          return (
            <div key={i} className={cls}>
              <span className="l">{String.fromCharCode(65 + i)}</span>
              <span>{c}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
