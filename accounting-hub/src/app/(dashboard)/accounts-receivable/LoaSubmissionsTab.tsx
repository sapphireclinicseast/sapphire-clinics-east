'use client'

// Accounts Receivable → LOA Submission.
//
// Read-only on purpose. Letters are raised and chased in the Operations Hub by
// the branch front desk; this is the HMO officer's window onto what has been
// approved, so nothing here writes back. Data arrives via
// /api/accounts-receivable/loa, which proxies the ops hub across the database
// boundary.

import { useCallback, useEffect, useState } from 'react'

interface LoaRow {
  id: string
  patientName: string
  hmoName: string
  branch: string
  services: string[]
  department: string | null
  dateOfApproval: string | null
  status: 'AWAITING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  notes: string | null
  hasFile: boolean
  createdAt: string
}

const STATUS_STYLE: Record<LoaRow['status'], { bg: string; fg: string; label: string }> = {
  AWAITING:  { bg: '#FDEAD6', fg: '#93460B', label: 'Awaiting document' },
  SUBMITTED: { bg: '#E3EEFB', fg: '#14507F', label: 'Document received' },
  APPROVED:  { bg: '#DFF5E4', fg: '#166534', label: 'Approved' },
  REJECTED:  { bg: '#FDE4E4', fg: '#991B1B', label: 'Rejected' },
}

export default function LoaSubmissionsTab() {
  const [rows, setRows] = useState<LoaRow[]>([])
  const [hmos, setHmos] = useState<string[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [branchLocked, setBranchLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [fBranch, setFBranch] = useState('')
  const [fHmo, setFHmo] = useState('')
  const [fStatus, setFStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (fBranch) p.set('branch', fBranch)
    if (fHmo) p.set('hmo', fHmo)
    if (fStatus) p.set('status', fStatus)
    try {
      const r = await fetch(`/api/accounts-receivable/loa?${p}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not load LOA submissions'); setRows([]) }
      else {
        setRows(d.submissions ?? [])
        setHmos(d.hmos ?? [])
        setBranches(d.branches ?? [])
        setBranchLocked(!!d.branchLocked)
      }
    } catch {
      setError('Could not load LOA submissions.')
    } finally { setLoading(false) }
  }, [fBranch, fHmo, fStatus])

  useEffect(() => { load() }, [load])

  const sel = 'px-3 py-2 rounded-lg border text-sm'
  const selStyle = { borderColor: 'var(--light-gray)', background: '#fff' }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {branchLocked ? (
          <span className={sel} style={{ ...selStyle, background: '#F1F3F5', color: 'var(--mid-gray)' }}>
            Branch: <strong>{fBranch || branches[0] || '—'}</strong>
          </span>
        ) : (
          <select className={sel} style={selStyle} value={fBranch} onChange={e => setFBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <select className={sel} style={selStyle} value={fHmo} onChange={e => setFHmo(e.target.value)}>
          <option value="">All HMOs</option>
          {hmos.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select className={sel} style={selStyle} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Any status</option>
          {(Object.keys(STATUS_STYLE) as LoaRow['status'][]).map(s => (
            <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
          ))}
        </select>
        <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          {loading ? 'Loading…' : `${rows.length} letter${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
          {error}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#F7F9FA' }}>
              {['Patient', 'HMO', 'Branch', 'Services', 'Department', 'Approved', 'Document', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap"
                    style={{ color: 'var(--dark-gray)', borderBottom: '1px solid var(--light-gray)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                No LOA submissions found.
              </td></tr>
            )}
            {rows.map(r => {
              const st = STATUS_STYLE[r.status]
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #EEF1F3' }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--dark-gray)' }}>{r.patientName || '—'}</td>
                  <td className="px-4 py-3">{r.hmoName === 'UNSPECIFIED' ? <span style={{ color: '#B0B8BC' }}>Not set</span> : r.hmoName}</td>
                  <td className="px-4 py-3">{r.branch}</td>
                  <td className="px-4 py-3" style={{ maxWidth: 240 }}>
                    {r.services.length ? r.services.join(', ') : <span style={{ color: '#B0B8BC' }}>—</span>}
                  </td>
                  <td className="px-4 py-3">{r.department ?? <span style={{ color: '#B0B8BC' }}>—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.dateOfApproval
                      ? new Date(r.dateOfApproval).toLocaleDateString('en-CA')
                      : <span style={{ color: '#B0B8BC' }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {/* The file itself stays in the Operations Hub behind its own
                        branch check — this only reports whether one exists. */}
                    {r.hasFile
                      ? <span style={{ color: '#166534', fontWeight: 600 }}>On file</span>
                      : <span style={{ color: '#B0B8BC' }}>Not yet</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded text-xs font-bold whitespace-nowrap"
                          style={{ background: st.bg, color: st.fg }}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
