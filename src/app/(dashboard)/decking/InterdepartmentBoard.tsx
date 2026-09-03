'use client'

// Interdepartment — who on this branch's decking board already sees more than
// one department, and who does not yet.
//
// The second list is the point of the screen: it is the cross-sell list, and it
// leads, because the patients who are already interdepartment need nothing
// doing.

import { useEffect, useMemo, useState } from 'react'
import { Users, Search } from 'lucide-react'

interface Row {
  id: string
  name: string
  departments: string[]
  otherBranchDepartments: string[]
  departmentCount: number
  suggestions: string[]
}

interface Payload {
  interdepartment: Row[]
  singleDepartment: Row[]
  summary: { total: number; interdepartment: number; singleDepartment: number; withSuggestion: number }
  pairs: string[]
}

const DEPT_BG: Record<string, { bg: string; fg: string }> = {
  OT:         { bg: '#FDEAD6', fg: '#93460B' },
  PT:         { bg: '#E3EEFB', fg: '#14507F' },
  SLP:        { bg: '#EFE4FA', fg: '#5B2A86' },
  SPED:       { bg: '#DFF5E4', fg: '#166534' },
  MD:         { bg: '#FCE7F3', fg: '#9D174D' },
  PSYCHOLOGY: { bg: '#E0F2FE', fg: '#075985' },
  ORTHOSIS:   { bg: '#F3F4F6', fg: '#374151' },
}

function Chip({ dept, faded = false }: { dept: string; faded?: boolean }) {
  const c = DEPT_BG[dept] ?? { bg: '#F3F4F6', fg: '#374151' }
  return (
    <span style={{
      display: 'inline-block', padding: '0.12rem 0.5rem', borderRadius: 999,
      fontSize: '0.7rem', fontWeight: 700, background: c.bg, color: c.fg,
      opacity: faded ? 0.55 : 1,
      border: faded ? '1px dashed rgba(0,0,0,0.18)' : '1px solid transparent',
    }}>
      {dept}
    </span>
  )
}

export default function InterdepartmentBoard({ branch }: { branch: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/decking/interdepartment?branch=${encodeURIComponent(branch)}`, { signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load')
        setData(d)
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [branch])

  const filt = (rows: Row[]) =>
    q.trim() ? rows.filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase())) : rows

  const cross = useMemo(() => filt(data?.singleDepartment ?? []), [data, q])
  const multi = useMemo(() => filt(data?.interdepartment ?? []), [data, q])

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #E5E9EC', borderRadius: '0.875rem',
    overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
  }
  const th: React.CSSProperties = {
    padding: '0.5rem 0.75rem', fontSize: '0.66rem', fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left',
    borderBottom: '1px solid #E5E9EC', background: '#F7F9FA',
  }
  const td: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.82rem', borderBottom: '1px solid #F1F3F5' }

  if (loading) return <p style={{ padding: '2rem', textAlign: 'center', color: '#8A9499' }}>Loading…</p>
  if (error) return <p style={{ padding: '1rem', color: '#991B1B', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8 }}>{error}</p>
  if (!data) return null

  const s = data.summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Summary */}
      <div style={{ ...card, padding: '0.9rem 1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
          {[
            { label: 'Patients on this board', value: s.total, fg: '#1F2937' },
            { label: 'Already interdepartment', value: s.interdepartment, fg: '#166534' },
            { label: 'One department only', value: s.singleDepartment, fg: '#93460B' },
            { label: 'With a suggestion', value: s.withSuggestion, fg: '#14507F' },
          ].map(k => (
            <div key={k.label}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: k.fg, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: '#9ca3af' }} />
            <input
              value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name…"
              style={{ padding: '0.4rem 0.6rem 0.4rem 1.7rem', border: '1px solid #D6DCE2', borderRadius: 8, fontSize: '0.82rem', minWidth: 200 }}
            />
          </div>
        </div>
        <p style={{ fontSize: '0.72rem', color: '#8A9499', marginTop: '0.7rem', lineHeight: 1.5 }}>
          Suggestions come from the combinations this clinic actually sees — {data.pairs.join(', ')} — rather than
          every department a patient does not have. A patient already seeing a department at the other branch counts as
          interdepartment, so nothing is suggested that they are getting elsewhere.
        </p>
      </div>

      {/* Cross-sell list first: it is the one with work in it. */}
      <div style={card}>
        <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #E5E9EC', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={15} style={{ color: '#93460B' }} />
          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1C2B30' }}>
            One department only — cross-sell ({cross.length})
          </h3>
        </div>
        {cross.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center', color: '#8A9499', fontSize: '0.85rem' }}>
            {q ? 'No patients match that name.' : 'Every patient on this board already sees more than one department.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Patient</th>
                  <th style={th}>Currently seeing</th>
                  <th style={th}>Could be offered</th>
                </tr>
              </thead>
              <tbody>
                {cross.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600, color: '#1C2B30' }}>{r.name}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {r.departments.map(d => <Chip key={d} dept={d} />)}
                      </span>
                    </td>
                    <td style={td}>
                      {r.suggestions.length === 0 ? (
                        <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>—</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {r.suggestions.map(d => <Chip key={d} dept={d} faded />)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Already interdepartment */}
      <div style={card}>
        <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #E5E9EC', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={15} style={{ color: '#166534' }} />
          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1C2B30' }}>
            Already interdepartment ({multi.length})
          </h3>
        </div>
        {multi.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center', color: '#8A9499', fontSize: '0.85rem' }}>
            {q ? 'No patients match that name.' : 'No patient on this board sees more than one department yet.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Patient</th>
                  <th style={th}>Departments</th>
                  <th style={th}>Could still be offered</th>
                </tr>
              </thead>
              <tbody>
                {multi.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600, color: '#1C2B30' }}>{r.name}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {r.departments.map(d => <Chip key={d} dept={d} />)}
                        {/* Named explicitly rather than blended in: front desk
                            here cannot see the other branch's board, so an
                            unexplained department would look like an error. */}
                        {r.otherBranchDepartments.length > 0 && (
                          <>
                            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>· other branch:</span>
                            {r.otherBranchDepartments.map(d => <Chip key={d} dept={d} faded />)}
                          </>
                        )}
                      </span>
                    </td>
                    <td style={td}>
                      {r.suggestions.length === 0 ? (
                        <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>—</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {r.suggestions.map(d => <Chip key={d} dept={d} faded />)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
