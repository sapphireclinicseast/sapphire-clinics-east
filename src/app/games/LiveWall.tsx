'use client'

import { useEffect, useState } from 'react'
import { GIcon } from './icons'
import { QuizMirror, QM_CSS, gameLabel, type MirrorPayload } from './MirrorBits'

// "Show Live Game" — a full-screen wall of EVERY phone currently playing, each
// tile labelled with the player's name. The grid re-proportions itself to the
// head-count (1 → full width, 2 → side by side, 3–4 → 2×2, 5–9 → 3×3, …), so a
// booth laptop/projector can follow the whole crowd at once. Reads the same
// ephemeral snapshots the booth Mirror View uses (/api/public/games/mirror).

const POLL_MS = 400
const STALE_MS = 4000

export default function LiveWall({ onClose }: { onClose: () => void }) {
  const [players, setPlayers] = useState<MirrorPayload[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/public/games/mirror?all=1', { cache: 'no-store' })
        const d = await r.json()
        if (cancelled || !d?.ok) return
        setPlayers(d.payloads || [])
        setNow(Date.now())
      } catch {
        /* keep the last frame */
      }
    }
    load()
    const iv = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const n = players.length
  const cols = n <= 1 ? 1 : Math.ceil(Math.sqrt(n))
  const rows = n <= 1 ? 1 : Math.ceil(n / cols)

  return (
    <div className="lw" role="dialog" aria-label="Live game">
      <header className="lw-bar">
        <div className="lw-title">
          <span className="lw-dot" />
          Live Game
          <span className="lw-count">
            {n === 0 ? 'no one playing yet' : `${n} playing now`}
          </span>
        </div>
        <button className="lw-close" onClick={onClose} aria-label="Close live game">
          Close ×
        </button>
      </header>

      {n === 0 ? (
        <div className="lw-empty">
          <GIcon name="monitor" size={46} />
          <div className="lw-empty-t">Waiting for players</div>
          <div className="lw-empty-s">Phones appear here the moment someone starts a game.</div>
        </div>
      ) : (
        <div
          className={`lw-grid ${rows >= 3 ? 'denser' : rows === 2 ? 'dense' : ''}`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
          {players.map((p) => {
            const stale = now - p.updatedAt > STALE_MS
            return (
              <section key={p.sessionId} className={`lw-tile ${n === 1 ? 'solo' : ''}`}>
                <div className="lw-head">
                  <span className="lw-name">{p.name}</span>
                  <span className={`lw-badge ${p.game}`}>{gameLabel(p.game)}</span>
                  {stale && <span className="lw-stale">paused</span>}
                </div>
                <div className="lw-phone">
                  {p.kind === 'image' && p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={`${p.name}'s game`} className="lw-frame" />
                  ) : (
                    <div className="lw-quiz">
                      <QuizMirror quiz={p.quiz} />
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <style>{`
        .lw { position: fixed; inset: 0; z-index: 60; background: #18353c; color: #fff; display: flex; flex-direction: column; }
        .lw-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: var(--primary-dark); border-bottom: 1px solid rgba(255,255,255,0.12); flex: none; }
        .lw-title { font-family: var(--font-montserrat), sans-serif; font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 9px; }
        .lw-dot { width: 10px; height: 10px; border-radius: 50%; background: #e07a5f; box-shadow: 0 0 0 0 rgba(224,122,95,0.7); animation: lw-pulse 1.6s infinite; }
        @keyframes lw-pulse { 0% { box-shadow: 0 0 0 0 rgba(224,122,95,0.6); } 70% { box-shadow: 0 0 0 8px rgba(224,122,95,0); } 100% { box-shadow: 0 0 0 0 rgba(224,122,95,0); } }
        .lw-count { font-weight: 500; font-size: 13px; opacity: 0.75; margin-left: 4px; }
        .lw-close { background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.28); border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .lw-close:hover { background: rgba(255,255,255,0.2); }
        .lw-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: rgba(255,255,255,0.8); padding: 24px; text-align: center; }
        .lw-empty-t { font-family: var(--font-montserrat), sans-serif; font-weight: 800; font-size: 20px; color: #fff; margin-top: 6px; }
        .lw-empty-s { font-size: 14px; opacity: 0.75; }
        .lw-grid { flex: 1; min-height: 0; display: grid; gap: 12px; padding: 12px; }
        .lw-tile { min-height: 0; min-width: 0; display: flex; flex-direction: column; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 10px; }
        .lw-head { display: flex; align-items: center; gap: 8px; flex: none; margin-bottom: 8px; min-width: 0; }
        .lw-name { font-family: var(--font-montserrat), sans-serif; font-weight: 800; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lw-tile.solo .lw-name { font-size: 20px; }
        .lw-badge { flex: none; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.14); color: #fff; }
        .lw-stale { flex: none; font-size: 10px; font-weight: 700; color: #f6b7a7; }
        .lw-phone { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
        .lw-frame { height: 100%; width: auto; max-width: 100%; object-fit: contain; border-radius: 14px; background: #fff; }
        .lw-quiz { width: min(100%, 440px); max-height: 100%; overflow: auto; background: #fff; color: #223841; border-radius: 14px; }
        /* Phones: one column, scrollable, each phone at a natural size. */
        @media (max-width: 600px) {
          .lw { overflow-y: auto; }
          .lw-bar { position: sticky; top: 0; z-index: 1; }
          .lw-grid { flex: none; grid-template-columns: 1fr !important; grid-template-rows: none !important; grid-auto-rows: auto; align-content: start; }
          .lw-tile { display: block; overflow: hidden; }
          .lw-phone { display: block; }
          .lw-frame { display: block; height: auto; width: auto; max-width: 100%; max-height: 60dvh; margin: 0 auto; }
          .lw-quiz { margin: 0 auto; }
          .lw-grid.dense .qm, .lw-grid.denser .qm { padding: 16px 14px 18px; }
          .lw-grid.dense .qm-q, .lw-grid.denser .qm-q { font-size: 15px; }
          .lw-grid.dense .qm-choice, .lw-grid.denser .qm-choice { padding: 9px 10px; font-size: 13px; }
        }
        ${QM_CSS}
        /* Compact quiz tiles when the wall has 2+ rows, so a round fits without scrolling. */
        .lw-grid.dense .qm { padding: 12px 14px 14px; }
        .lw-grid.dense .qm-q { font-size: 14px; min-height: 0; margin: 8px 0; }
        .lw-grid.dense .qm-choices { gap: 6px; }
        .lw-grid.dense .qm-choice { padding: 6px 10px; font-size: 12px; gap: 8px; }
        .lw-grid.dense .qm-choice .l { width: 20px; height: 20px; font-size: 11px; }
        .lw-grid.dense .qm-timer { font-size: 16px; }
        .lw-grid.dense .qm-score { font-size: 12px; }
        .lw-grid.dense .qm-score b { font-size: 15px; }
        .lw-grid.denser .qm { padding: 8px 10px 10px; }
        .lw-grid.denser .qm-q { font-size: 12px; min-height: 0; margin: 6px 0; }
        .lw-grid.denser .qm-choices { gap: 4px; }
        .lw-grid.denser .qm-choice { padding: 4px 8px; font-size: 11px; gap: 6px; border-radius: 8px; }
        .lw-grid.denser .qm-choice .l { width: 18px; height: 18px; font-size: 10px; }
        .lw-grid.denser .qm-timer { font-size: 14px; }
        .lw-grid.denser .qm-score { font-size: 11px; }
        .lw-grid.denser .qm-score b { font-size: 13px; }
        .lw-grid.denser .lw-name { font-size: 13px; }
        .lw-grid.denser .lw-head { margin-bottom: 4px; }
        .lw-grid.denser .lw-tile { padding: 6px; border-radius: 10px; }
      `}</style>
    </div>
  )
}
