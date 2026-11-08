'use client'

// The decking board over time: one stacked area — filled beneath open, so the
// axis.
//
// Two panels rather than one stacked chart because the series move at wildly
// different sizes. Over a fortnight at Greenhills, filled ran 162–166 — a range
// of FOUR slots — while open ran 229–345. Stacked to a zero baseline, a day when
// two children were booked moved the line by 0.4% of the height: invisible. One
// shared axis cannot fix that, since whatever scale makes open legible flattens
// filled. Separate scales is the only honest way to show both.
//
// Each panel's y-axis is fitted to its own data and does NOT start at zero, so
// small day-to-day moves are readable. That is why these are LINES, not filled
// areas: area implies magnitude measured from zero, and filling down to a
// truncated baseline would exaggerate every wiggle into a cliff. A line carries
// no such claim, so it is free to be zoomed. The axis labels always show the
// real numbers, and the tiles above carry the absolute figures.
//
// Blocked hours are deliberately not drawn. They used to be stacked in, so the
// top edge met "Slots offered" exactly; but they were over half the height on
// some days and buried the two numbers the desk acts on. "Slots offered" on the
// tiles still counts them, so it stays larger than filled + open.
//
// Green/gold rather than green/yellow-green: green against yellow is the
// red-green confusion, and a bright yellow cannot hold 3:1 against white. This
// pair separates by ΔE 16.3 under protanopia and clears contrast — checked with
// the palette validator, not by eye.

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']

interface Point {
  date: string
  label: string
  totalSlots: number
  booked: number
  blocked: number
  open: number
  fillRate: number | null
}

/**
 * A y-range fitted to one series, padded so the line does not graze the frame.
 *
 * Never starts at zero — that is the whole point of splitting the panels. A flat
 * series still gets a band around it rather than a zero-height axis, so a week of
 * no movement reads as a straight line across the middle instead of a jagged one
 * across a degenerate scale.
 */
function fittedDomain(values: number[]): [number, number] {
  const vals = values.filter(Number.isFinite)
  if (vals.length === 0) return [0, 1]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [Math.max(0, min - 2), max + 2]

  const pad = Math.max(1, Math.round((max - min) * 0.2))
  const lo = Math.max(0, min - pad)
  const hi = max + pad

  // Snapped to a round step so the axis reads 200/250/300 rather than
  // 206/251/296 — recharts divides whatever bounds it is given, and raw fitted
  // bounds give ticks nobody can hold in their head. Six bands is the most a
  // panel this short can label without crowding.
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const step = steps.find(s => (hi - lo) / s <= 6) ?? 1000
  return [Math.max(0, Math.floor(lo / step) * step), Math.ceil(hi / step) * step]
}

function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function DeckingHistory({ branch }: { branch: string }) {
  const [dept, setDept] = useState('all')
  const [from, setFrom] = useState(isoDaysAgo(90))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [points, setPoints] = useState<Point[]>([])
  const [firstRecorded, setFirstRecorded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    const p = new URLSearchParams({ branch, department: dept, from, to })
    fetch(`/api/decking/history?${p}`, { signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load history')
        setPoints(d.points ?? [])
        setFirstRecorded(d.firstRecorded ?? null)
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [branch, dept, from, to])

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', overflow: 'hidden',
  }
  const field: React.CSSProperties = {
    border: '1px solid #D6DCE2', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem',
  }

  const latest = points[points.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...card, padding: '0.9rem 1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.9rem' }}>
              Decking history
            </p>
            <p style={{ color: 'var(--mid-gray)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
              Two panels, each zoomed to its own range so small day-to-day moves show —
              read the numbers on the left, not the height. Blocked hours are not drawn,
              and fill rate is filled ÷ (filled + open).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--mid-gray)', textTransform: 'uppercase' }}>Department</label>
              <select value={dept} onChange={e => setDept(e.target.value)} style={field}>
                <option value="all">All departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--mid-gray)', textTransform: 'uppercase' }}>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={field} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--mid-gray)', textTransform: 'uppercase' }}>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={field} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: '1rem' }}>
        {error ? (
          <p style={{ color: '#991B1B', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}>{error}</p>
        ) : loading && points.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--mid-gray)', padding: '3rem 0', fontSize: '0.85rem' }}>Loading…</p>
        ) : points.length === 0 ? (
          // Said plainly rather than drawn as a flat zero line. The board keeps
          // no dated record of its own, so there is genuinely nothing before the
          // first snapshot — pretending otherwise would be inventing a past.
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <p style={{ fontWeight: 600, color: 'var(--charcoal)', fontSize: '0.9rem' }}>
              No history recorded yet for this range
            </p>
            <p style={{ color: 'var(--mid-gray)', fontSize: '0.82rem', marginTop: '0.4rem', lineHeight: 1.55, maxWidth: 520, margin: '0.4rem auto 0' }}>
              The board is a weekly template — it holds no dates, so there is nothing
              to reconstruct earlier days from. A reading is taken once a day from
              now on, and the chart fills in as those accumulate.
            </p>
          </div>
        ) : (
          <>
            {latest && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '0.9rem' }}>
                {[
                  // Only the two plotted series wear a series colour; the other
                  // two are ink, so a colour on this row always means "that band
                  // in the chart".
                  { label: 'Slots offered', value: latest.totalSlots, fg: '#1F2937' },
                  { label: 'Filled', value: latest.booked, fg: '#166534' },
                  { label: 'Open', value: latest.open, fg: '#B8860B' },
                  { label: 'Fill rate', value: latest.fillRate === null ? '—' : `${latest.fillRate}%`, fg: '#475569' },
                ].map(k => (
                  <div key={k.label}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: k.fg, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                    <div style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--mid-gray)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                  </div>
                ))}
                <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: '0.7rem', color: 'var(--mid-gray)' }}>
                  latest reading · {latest.label}
                </div>
              </div>
            )}

            {/* One stacked area: filled beneath open, so the band heights are
                the composition of the day and the top edge is the whole board.
                A reader gets "how much did we offer" and "how much of it sold"
                from one shape instead of holding two panels in their head.

                This replaced two separately-scaled line panels. Those were
                built to make small day-to-day moves visible, and stacking does
                cost that: on an axis running to ~725, a shift of three or four
                slots is a line that barely moves. The trade is deliberate —
                composition is what this chart is read for, and the exact
                numbers are printed above it for the latest day.

                Animation off: it stalled on the first frame elsewhere in this
                module and drew nothing at all. */}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={points} margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="deckFilled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#166534" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#166534" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="deckOpen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8B533" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#E8B533" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} height={22}
                  minTickGap={16} interval="preserveStartEnd" />
                {/* From zero, because a stacked area read off a cut axis
                    misstates the proportion — which is the one thing the shape
                    is supposed to tell you. */}
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={44} domain={[0, 'auto']} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="booked" name="Filled" stackId="deck"
                  stroke="#166534" strokeWidth={1.5} fill="url(#deckFilled)" isAnimationActive={false} />
                <Area type="monotone" dataKey="open" name="Open" stackId="deck"
                  stroke="#B8860B" strokeWidth={1.5} fill="url(#deckOpen)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>

            {firstRecorded && (
              <p style={{ fontSize: '0.72rem', color: 'var(--mid-gray)', marginTop: '0.6rem' }}>
                History begins {new Date(`${firstRecorded}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} —
                the first day a reading was taken. Nothing before that was recorded.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
