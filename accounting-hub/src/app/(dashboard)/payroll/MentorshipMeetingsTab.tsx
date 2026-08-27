'use client'

/**
 * Payroll → Consultants → Mentorship Meetings.
 *
 * Lists the staff portal's MENTORSHIP meetings whose date falls inside the
 * selected cutoff. Ticking one charges the mentee the configured fee and pays
 * it to the mentor — the pair lands on both payslips as adjustment lines the
 * next time previews load. A meeting already included anywhere shows where,
 * and once its payroll run is finalized it locks (and the portal badges it
 * "Paid"). Settings holds the per-meeting fee.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Settings, Lock, CheckCircle2, RefreshCw } from 'lucide-react'

interface Person { staffId: string; name: string; consultant: { id: string; name: string; branch: string } | null }
interface Charge {
  id: string; menteeName: string; mentorName: string; fee: number
  cutoffPeriod: string; branch: string; locked: boolean; paidNotified: boolean
}
interface Meeting {
  id: string; title: string | null; date: string; timeLabel: string
  createdByName: string; paidAt: string | null
  mentors: Person[]; mentees: Person[]; charges: Charge[]
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

export default function MentorshipMeetingsTab({
  cutoffPeriod, branch, canWrite, onChanged,
}: {
  cutoffPeriod: string
  branch: string
  canWrite: boolean
  onChanged: () => void
}) {
  const [data, setData] = useState<{ range: { from: string; to: string }; fee: number; meetings: Meeting[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [feeInput, setFeeInput] = useState('')
  const [savingFee, setSavingFee] = useState(false)

  const effBranch = branch || 'SBEA'

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/payroll/mentorship-meetings?cutoffPeriod=${cutoffPeriod}&branch=${effBranch}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load')
      setData(d)
      setFeeInput(String(d.fee || ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally { setLoading(false) }
  }, [cutoffPeriod, effBranch])

  useEffect(() => { load() }, [load])

  const act = async (meetingId: string, action: 'tick' | 'untick') => {
    setBusyId(meetingId); setError('')
    try {
      const res = await fetch('/api/payroll/mentorship-meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, meetingId, cutoffPeriod, branch: effBranch }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      await load()
      onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setBusyId('') }
  }

  const saveFee = async () => {
    setSavingFee(true); setError('')
    try {
      const res = await fetch('/api/payroll/mentorship-meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-fee', fee: Number(feeInput) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to save fee')
      setShowSettings(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save fee') }
    finally { setSavingFee(false) }
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Mentorship Meetings</h2>
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            From the staff portal, cutoff {data ? `${data.range.from} → ${data.range.to}` : cutoffPeriod} · {effBranch}.
            Ticking charges the mentee {data?.fee ? peso(data.fee) : 'the set fee'} and pays it to the mentor on this cutoff&apos;s payslips.
            Meetings lock when the payroll run is finalized, and the portal marks them Paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }} title="Refresh from the staff portal">
            <RefreshCw size={14} />
          </button>
          {canWrite && (
            <button onClick={() => setShowSettings(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--deep-teal)' }}>
              <Settings size={14} /> Settings · fee {data ? peso(data.fee) : '…'}
            </button>
          )}
        </div>
      </div>

      {showSettings && (
        <div className="rounded-xl border p-3 my-3 flex items-end gap-3 flex-wrap" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Mentorship meeting fee (₱ per meeting, per mentee)</label>
            <input type="number" min="0" step="0.01" value={feeInput} onChange={e => setFeeInput(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm w-44" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <button onClick={saveFee} disabled={savingFee}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {savingFee ? 'Saving…' : 'Save fee'}
          </button>
          <p className="text-[11px] flex-1 min-w-[220px]" style={{ color: 'var(--mid-gray)' }}>
            Applied at tick time — already-ticked meetings keep the fee they were ticked with.
          </p>
        </div>
      )}

      {error && <p className="text-xs px-3 py-2 rounded-lg my-2" style={{ background: '#fef2f2', color: '#dc2626' }}>{error}</p>}

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></div>
      ) : !data ? null : data.meetings.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No mentorship meetings in this cutoff.</p>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Include</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Title</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Mentor (+)</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Mentee (−)</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.meetings.map(m => {
                const included = m.charges.length > 0
                const inThisCutoff = included && m.charges[0].cutoffPeriod === cutoffPeriod && m.charges[0].branch === effBranch
                const locked = m.charges.some(c => c.locked)
                const noMentor = m.mentors.length === 0
                const unmatched = [...m.mentors, ...m.mentees].filter(p => !p.consultant)
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: included && !inThisCutoff ? 0.6 : 1 }}>
                    <td className="px-3 py-2">
                      <input type="checkbox"
                        checked={included}
                        disabled={!canWrite || locked || busyId === m.id || (included && !inThisCutoff) || (!included && noMentor)}
                        onChange={() => act(m.id, included ? 'untick' : 'tick')}
                        className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{m.date} · {m.timeLabel}</td>
                    <td className="px-3 py-2">{m.title || 'Mentorship meeting'}</td>
                    <td className="px-3 py-2">
                      {m.mentors.length ? m.mentors.map(p => p.name).join(', ')
                        : <span style={{ color: '#b45309' }}>no participant flagged as Clinical Mentor</span>}
                    </td>
                    <td className="px-3 py-2">{m.mentees.map(p => p.name).join(', ') || '—'}</td>
                    <td className="px-3 py-2">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 font-medium" style={{ color: '#047857' }}>
                          <Lock size={11} /> Locked · paid{m.paidAt ? '' : ' (portal pending)'}
                        </span>
                      ) : included && !inThisCutoff ? (
                        <span style={{ color: 'var(--mid-gray)' }}>included in {m.charges[0].cutoffPeriod} · {m.charges[0].branch}</span>
                      ) : included ? (
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--deep-teal)' }}>
                          <CheckCircle2 size={11} /> in this cutoff · {peso(m.charges.reduce((s, c) => s + c.fee, 0))}
                        </span>
                      ) : unmatched.length ? (
                        <span style={{ color: '#b45309' }}>no consultant record: {unmatched.map(p => p.name).join(', ')} — sync the clinician database</span>
                      ) : (
                        <span style={{ color: 'var(--mid-gray)' }}>not included</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
