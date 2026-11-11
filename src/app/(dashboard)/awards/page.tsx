'use client'

// Annual Awards.
//
// Eight categories, worked out from what is already recorded rather than
// compiled by hand in a spreadsheet the week before the party.
//
// The design problem here is not the winner — it is everyone else. An awards
// page that shows only a name invites "why not me", and the honest answer is
// usually "you were four surveys short", which nobody could see. So each card
// carries the arithmetic: how the figure was reached, who was close, and who
// did not qualify with the reason beside their name.
//
// Several categories genuinely cannot be decided yet. They say so plainly
// rather than showing an empty space or, worse, crowning the only person who
// happened to clear the bar.

import { useEffect, useState } from 'react'
import { Award, ChevronDown, ChevronRight, Loader2, Trophy, Users } from 'lucide-react'
import { CARD_STYLE, EmptyState, Skeleton } from '../patients/dashboard/ui'

interface Contender {
  staffId: string
  name: string
  branch: string
  department: string
  score: number
  responses: number
  qualified: boolean
  reason: string | null
}
interface AwardResult {
  key: string
  title: string
  basis: 'rating' | 'sessions'
  unit: string
  winners: Contender[]
  runnersUp: Contender[]
  excluded: Contender[]
  note: string | null
}

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }

/** Title Case from the ALL CAPS the staff table stores. */
function pretty(name: string) {
  return name.toLowerCase().replace(/(^|[\s,.'’\-/()])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())
}

const fmt = (c: Contender, basis: AwardResult['basis']) =>
  basis === 'rating' ? c.score.toFixed(2) : c.score.toLocaleString()

export default function AwardsPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<{ awards: AwardResult[]; minResponses: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/awards?year=${year}`, { signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load the awards')
        setData(d)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [year])

  const decided = data?.awards.filter(a => a.winners.length > 0).length ?? 0

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl px-5 py-4" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>
              Recognition
            </p>
            <h1 className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>Annual Awards</h1>
          </div>
          <label className="ml-auto flex items-center gap-2 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
            Year
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="rounded-lg px-2 h-9 text-[13px]"
              style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
              {[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[13px] mt-2" style={{ color: 'var(--mid-gray)' }}>
          Six awards are decided on a rating and need at least{' '}
          <strong style={{ color: 'var(--charcoal)' }}>{data?.minResponses ?? 5} responses</strong> to qualify.
          The two session awards are decided on confirmed sessions and have no response requirement.
          A rating is each response averaged on its own first, then those averaged — so one family is one
          voice, whether their form asked eight questions or twelve.
        </p>
        {data && (
          <p className="text-[12px] mt-1.5" style={{ color: decided === data.awards.length ? '#166534' : '#7A5C00' }}>
            {decided} of {data.awards.length} can be decided on {year}&rsquo;s figures.
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState title="Couldn't load the awards" hint={error} />
        </div>
      ) : loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl p-5" style={CARD_STYLE}>
              <Skeleton className="h-4 w-2/3" /><Skeleton className="h-10 w-1/2 mt-3" />
              <Skeleton className="h-3 w-3/4 mt-3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data?.awards.map(a => <AwardCard key={a.key} award={a} minResponses={data.minResponses} />)}
        </div>
      )}
    </div>
  )
}

function AwardCard({ award, minResponses }: { award: AwardResult; minResponses: number }) {
  const [openExcluded, setOpenExcluded] = useState(false)
  const undecided = award.winners.length === 0

  return (
    <section className="rounded-xl flex flex-col" style={CARD_STYLE}>
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5" style={{ color: undecided ? '#B9A06A' : '#B8860B' }}>
            {award.basis === 'sessions' ? <Users size={16} /> : <Trophy size={16} />}
          </span>
          <h2 className="text-[14px] font-bold leading-snug" style={{ color: 'var(--charcoal)' }}>
            {award.title}
          </h2>
        </div>
      </div>

      <div className="px-5 py-4 flex-1">
        {undecided ? (
          <div className="rounded-lg px-3 py-3 text-[13px]"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#7A5C00' }}>
            {award.note}
          </div>
        ) : (
          <>
            {/* Each winner carries their OWN response count. Printed once
                below the block it would be the first winner's number standing
                for everybody — and joint winners rarely have the same one. */}
            {award.winners.map(w => (
              <div key={w.staffId} className="mb-2 last:mb-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Award size={16} aria-hidden style={{ color: '#B8860B', flexShrink: 0 }} />
                  <span className="text-[17px] font-bold" style={{ color: 'var(--charcoal)' }}>
                    {pretty(w.name)}
                  </span>
                  <span className="text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                    {BRANCH_LABEL[w.branch] ?? w.branch} · {w.department}
                  </span>
                  <span className="ml-auto text-[15px] font-bold tabular-nums whitespace-nowrap" style={{ color: '#166534' }}>
                    {fmt(w, award.basis)}
                    <span className="text-[11px] font-semibold ml-1" style={{ color: 'var(--mid-gray)' }}>
                      {award.unit}
                    </span>
                  </span>
                </div>
                {award.basis === 'rating' && (
                  <p className="text-[12px] ml-6" style={{ color: 'var(--mid-gray)' }}>
                    from {w.responses} response{w.responses === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            ))}
            {award.note && (
              <p className="text-[12px] mt-2 font-semibold" style={{ color: '#7A5C00' }}>{award.note}</p>
            )}

            {award.runnersUp.length > 0 && (
              <ul className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--light-gray)' }}>
                {award.runnersUp.map((r, i) => (
                  <li key={r.staffId} className="flex items-baseline gap-2 text-[12px]">
                    <span className="tabular-nums" style={{ color: '#C8CDD3', width: 14 }}>{i + 2}</span>
                    <span style={{ color: 'var(--charcoal)' }}>{pretty(r.name)}</span>
                    <span style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[r.branch] ?? r.branch}</span>
                    <span className="ml-auto tabular-nums font-semibold" style={{ color: 'var(--mid-gray)' }}>
                      {fmt(r, award.basis)}
                      {award.basis === 'rating' && (
                        <span className="font-normal" style={{ color: '#C8CDD3' }}> · {r.responses}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {award.excluded.length > 0 && (
        <div className="px-5 pb-4">
          <button type="button" onClick={() => setOpenExcluded(v => !v)}
            className="flex items-center gap-1.5 text-[12px] font-semibold"
            style={{ color: 'var(--teal)' }}>
            {openExcluded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {award.excluded.length} not qualified
          </button>
          {openExcluded && (
            <ul className="mt-2 space-y-1">
              {award.excluded.map(e => (
                <li key={e.staffId} className="flex items-baseline gap-2 text-[12px]">
                  <span className="truncate" style={{ color: 'var(--charcoal)' }}>{pretty(e.name)}</span>
                  <span style={{ color: '#C8CDD3' }}>{BRANCH_LABEL[e.branch] ?? e.branch}</span>
                  <span className="ml-auto whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                    {e.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Said once per card rather than on every row: the bar is the same
              for everyone in it, and repeating it reads as an accusation. */}
          {award.basis === 'rating' && (
            <p className="text-[11px] mt-2" style={{ color: '#9AA0A6' }}>
              Needs {minResponses} responses to be in contention.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
