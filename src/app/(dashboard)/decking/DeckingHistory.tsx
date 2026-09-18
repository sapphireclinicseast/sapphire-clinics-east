'use client'

// The decking board over time: filled and open stacked to the slots that were
// actually sellable that day.
//
// Stacked rather than two separate lines, because the question is "of what we
// could sell, how much did we sell" — and a stack makes the total the top edge,
// so growth in capacity and growth in bookings are visibly different things
// rather than two lines that happen to move together.
//
// Blocked hours are deliberately NOT drawn. They used to be, so the top edge met
// "Slots offered" exactly; but they dominated the picture — well over half the
// height on some days — and buried the two numbers the desk actually acts on.
// The consequence to remember: the top edge is filled + open, which is LESS than
// the "Slots offered" figure above it whenever anything is blocked. The tiles
// carry that total, and the caption says so.
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
              Filled and open stack to the slots that were sellable that day. Blocked
              hours are not drawn, so the top of the chart sits below “slots offered”.
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

            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                {/* stackId ties the two areas into one column per day, so the top
                    edge is what was sellable — filled plus open. Animation off
                    for the same reason as the Slot Utilization line — it stalled
                    on the first frame there and drew nothing. */}
                <Area type="monotone" dataKey="booked" stackId="1" name="Filled"
                  stroke="#166534" fill="#B7E4C4" isAnimationActive={false} />
                <Area type="monotone" dataKey="open" stackId="1" name="Open"
                  stroke="#B8860B" fill="#FDE68A" isAnimationActive={false} />
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
