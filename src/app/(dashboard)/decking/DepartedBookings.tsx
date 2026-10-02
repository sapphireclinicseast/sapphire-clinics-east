'use client'

// Bookings left behind by consultants who have gone.
//
// Grouped by the departed consultant rather than listed flat, because the
// question is always "what happens to Lenz's children now" — one person's
// caseload is the unit somebody actually works through.
//
// Moving a child is one row at a time, with the replacement chosen explicitly.
// There is no bulk move and no clear-all: these are real children with a
// standing slot, and the fastest way to do the wrong thing to sixteen of them
// at once would be a button that did all sixteen.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

interface Row {
  slotId: string
  staffId: string
  staffName: string
  branch: string
  department: string
  dayOfWeek: string
  startTime: string
  patientId: string | null
  patientName: string
}
interface Replacement { id: string; name: string }

const DAY_LABEL: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}

function prettyTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function DepartedBookings() {
  const [rows, setRows] = useState<Row[]>([])
  const [replacements, setReplacements] = useState<Record<string, Replacement[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moved, setMoved] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch('/api/decking/departed')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load')
        setRows(d.rows ?? [])
        setReplacements(d.replacements ?? {})
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function move(row: Row) {
    const staffId = picked[row.slotId]
    if (!staffId) return
    setMovingId(row.slotId)
    try {
      const res = await fetch('/api/decking/slots', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.slotId, staffId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not move this booking')
      const to = (replacements[`${row.branch}||${row.department}`] ?? [])
        .find(r => r.id === staffId)
      // Marked done in place rather than vanishing: a row that disappears the
      // instant you press the button gives no chance to check it went where
      // you meant.
      setMoved(m => ({ ...m, [row.slotId]: to?.name ?? 'the new consultant' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move this booking')
    } finally {
      setMovingId(null)
    }
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem',
  }

  if (loading) {
    return <p style={{ textAlign: 'center', color: 'var(--mid-gray)', padding: '3rem 0', fontSize: '0.85rem' }}>Loading…</p>
  }

  const outstanding = rows.filter(r => !moved[r.slotId])

  if (rows.length === 0) {
    return (
      <div style={{ ...card, padding: '2.5rem 1rem', textAlign: 'center' }}>
        <Check size={24} style={{ color: '#166534' }} />
        <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.92rem', marginTop: '0.5rem' }}>
          Nothing left behind
        </p>
        <p style={{ color: 'var(--mid-gray)', fontSize: '0.83rem', marginTop: '0.35rem', maxWidth: 460, margin: '0.35rem auto 0', lineHeight: 1.6 }}>
          Every booking on the board belongs to a consultant who still works here.
        </p>
      </div>
    )
  }

  // Grouped in render order, which the API already sorted by name then day.
  const groups: { key: string; rows: Row[] }[] = []
  for (const r of rows) {
    const key = `${r.staffId}||${r.branch}||${r.department}`
    const g = groups.find(x => x.key === key)
    if (g) g.rows.push(r); else groups.push({ key, rows: [r] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...card, padding: '0.9rem 1.1rem', borderLeft: '4px solid #B45309' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={17} style={{ color: '#B45309', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.9rem' }}>
              {outstanding.length} booking{outstanding.length === 1 ? '' : 's'} under consultants who have left
            </p>
            <p style={{ color: 'var(--mid-gray)', fontSize: '0.8rem', marginTop: '0.2rem', lineHeight: 1.6, maxWidth: 640 }}>
              These children still hold a standing slot, but the consultant no longer appears on the board, so
              nobody at the desk can see them. Move each one to a consultant who works that department at that
              branch, or leave it and handle the family directly — this page does nothing on its own.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ color: '#991B1B', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}>{error}</p>
      )}

      {groups.map(g => {
        const head = g.rows[0]
        const options = replacements[`${head.branch}||${head.department}`] ?? []
        const left = g.rows.filter(r => !moved[r.slotId]).length
        return (
          <div key={g.key} style={card}>
            <div style={{ padding: '0.8rem 1.1rem', borderBottom: '1px solid var(--light-gray)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800, color: 'var(--charcoal)', fontSize: '0.9rem' }}>{head.staffName}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#B45309', background: '#FEF6E7', border: '1px solid #F3D9A4', borderRadius: 20, padding: '1px 9px' }}>
                no longer active
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--mid-gray)' }}>
                {branchLabel(head.branch) ?? head.branch} · {head.department}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: 'var(--mid-gray)' }}>
                {left} of {g.rows.length} still to move
              </span>
            </div>

            {options.length === 0 && left > 0 && (
              <p style={{ padding: '0.6rem 1.1rem', fontSize: '0.78rem', color: '#B45309', background: '#FEF6E7' }}>
                No active consultant works {head.department} at {branchLabel(head.branch) ?? head.branch}, so there is
                nobody to move these to from here. This needs a staffing decision first.
              </p>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    {['Patient', 'Day', 'Time', 'Move to'].map((h, i) => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.5rem 1.1rem', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mid-gray)', width: i === 3 ? '42%' : undefined }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(r => {
                    const done = moved[r.slotId]
                    return (
                      <tr key={r.slotId} style={{ borderTop: '1px solid var(--light-gray)', background: done ? '#F0FAF3' : undefined }}>
                        <td style={{ padding: '0.5rem 1.1rem', fontWeight: 600, color: 'var(--charcoal)' }}>{r.patientName}</td>
                        <td style={{ padding: '0.5rem 1.1rem', color: 'var(--mid-gray)' }}>{DAY_LABEL[r.dayOfWeek] ?? r.dayOfWeek}</td>
                        <td style={{ padding: '0.5rem 1.1rem', color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>{prettyTime(r.startTime)}</td>
                        <td style={{ padding: '0.5rem 1.1rem' }}>
                          {done ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#166534', fontWeight: 700, fontSize: '0.8rem' }}>
                              <Check size={14} /> Moved to {done}
                            </span>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <select
                                value={picked[r.slotId] ?? ''}
                                onChange={e => setPicked(p => ({ ...p, [r.slotId]: e.target.value }))}
                                disabled={options.length === 0}
                                style={{ border: '1px solid #D6DCE2', borderRadius: 7, padding: '0.3rem 0.5rem', fontSize: '0.8rem', minWidth: 180 }}
                              >
                                <option value="">Choose a consultant…</option>
                                {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                              </select>
                              <button
                                onClick={() => move(r)}
                                disabled={!picked[r.slotId] || movingId === r.slotId}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '0.32rem 0.7rem', borderRadius: 7, border: 'none',
                                  background: picked[r.slotId] ? 'var(--teal)' : '#E5E9EC',
                                  color: picked[r.slotId] ? '#fff' : 'var(--mid-gray)',
                                  fontSize: '0.78rem', fontWeight: 700,
                                  cursor: picked[r.slotId] ? 'pointer' : 'default',
                                }}
                              >
                                <ArrowRight size={13} />
                                {movingId === r.slotId ? 'Moving…' : 'Move'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
