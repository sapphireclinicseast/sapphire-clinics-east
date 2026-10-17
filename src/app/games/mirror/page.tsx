'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { QuizMirror, QM_CSS, gameLabel, type MirrorPayload, type MirrorSession } from '../MirrorBits'

// Booth backend: live-mirror a player's phone game onto a laptop/projector.
// Lists everyone currently playing and mirrors whichever player you pick.

type Session = MirrorSession
type Payload = MirrorPayload

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
        ${QM_CSS}
        @media (max-width: 720px) {
          .body { flex-direction: column; }
          .list { width: 100%; flex-direction: row; overflow-x: auto; }
          .player { min-width: 180px; }
        }
      `}</style>
    </div>
  )
}
