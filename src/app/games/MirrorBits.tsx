// Shared pieces for the live mirror views: the booth Mirror View page
// (/games/mirror, one player at a time) and the "Show Live Game" wall on
// /games (everyone at once).

export type MirrorSession = {
  sessionId: string
  name: string
  game: 'slp-quiz' | 'slp-flappy'
  status?: string
  updatedAt: number
}

export type MirrorQuiz = {
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

export type MirrorPayload = MirrorSession & {
  kind: 'image' | 'quiz'
  image?: string
  quiz?: MirrorQuiz
}

export const gameLabel = (g: string) => (g === 'slp-flappy' ? 'Flappy Phoneme' : 'SLP Speed Round')

export function QuizMirror({ quiz }: { quiz?: MirrorQuiz }) {
  if (!quiz) return <div className="qm" style={{ color: '#5d6f6a' }}>Loading…</div>
  const t = quiz.timeLeft ?? 0
  if (quiz.phase === 'result') {
    return (
      <div className="qm">
        <div className="qm-result">
          <div className="big">{quiz.correct ?? 0} correct</div>
          {quiz.tier ? <div style={{ color: '#5d6f6a', marginTop: 6 }}>Won {quiz.tier}% off</div> : null}
          {quiz.code ? <div className="qm-code">{quiz.code}</div> : null}
        </div>
      </div>
    )
  }
  return (
    <div className="qm">
      <div className="qm-hud">
        <div className={`qm-timer ${t <= 15 ? 'low' : ''}`}>
          <span className="qm-timer-label">Time</span> {Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}
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

// Styles for <QuizMirror/> — injected by whichever page renders it.
export const QM_CSS = `
  .qm { padding: 20px 18px 24px; }
  .qm-hud { display: flex; align-items: center; justify-content: space-between; }
  .qm-timer { font-family: var(--font-montserrat), sans-serif; font-weight: 800; font-size: 20px; color: var(--primary-dark); }
  .qm-timer-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
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
`
