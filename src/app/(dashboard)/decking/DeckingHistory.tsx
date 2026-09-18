'use client'

// The decking board over time: two panels, filled above open, sharing one date
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
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

            {/* One panel per series, each on its own fitted scale. syncId ties
                the crosshairs together, so hovering a date reads both panels at
                once and the split costs nothing when comparing them.
                Animation off for the same reason as the Slot Utilization line —
                it stalled on the first frame there and drew nothing. */}
            {([
              // showDates marks the LOWER panel — the shared x-axis is printed
              // once, underneath both.
              { key: 'booked' as const, name: 'Filled', colour: '#166534', showDates: false },
              { key: 'open' as const, name: 'Open', colour: '#B8860B', showDates: true },
            ]).map(series => {
              const domain = fittedDomain(points.map(p => p[series.key]))
              return (
                <div key={series.key} style={{ marginBottom: series.showDates ? 0 : '0.5rem' }}>
                  {/* The panel heading IS the legend. One series per panel means
                      a legend box would only repeat what the title already says. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '0.5rem' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: series.colour, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--charcoal)' }}>{series.name}</span>
                    <span style={{ fontSize: '0.66rem', color: 'var(--mid-gray)' }}>
                      scale {domain[0]}–{domain[1]}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={points} syncId="decking-history" margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      {/* Dates only under the lower panel — the two share an x-axis,
                          and printing it twice wastes the height the zoom needs.
                          minTickGap drops labels rather than overprinting them: a
                          90-day range is the default, and every date will not fit. */}
                      <XAxis dataKey="label" tick={series.showDates ? { fontSize: 10 } : false}
                        height={series.showDates ? 22 : 4}
                        minTickGap={16} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={44} domain={domain} />
                      <Tooltip />
                      <Line type="monotone" dataKey={series.key} name={series.name}
                        stroke={series.colour} strokeWidth={2}
                        dot={{ r: 2.5, strokeWidth: 0, fill: series.colour }}
                        activeDot={{ r: 4.5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })}

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
