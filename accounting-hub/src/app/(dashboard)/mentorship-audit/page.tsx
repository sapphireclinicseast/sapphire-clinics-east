'use client'

/**
 * Mentorship billing audit.
 *
 * The cashier prompt for the "Mentorship" service is advisory and never blocks
 * payment. That is the right call at the counter, but it means a miss leaves no
 * trace — payroll just never sees the session as mentorship. This page is the
 * catch-up: every session ticked "With Mentor", against what was actually
 * billed.
 */

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react'

interface AuditItem {
  id: string
  date: string
  time: string
  status: string
  sessionType: string
  branch: string | null
  patientName: string
  clinician: string
  department: string
  orderNumbers: string[]
  state: 'billed' | 'missing' | 'unconverted'
}
interface Summary { total: number; billed: number; missing: number; unconverted: number }

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East Branch', SBGH: 'Greenhills Branch' }

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today() { return new Date().toISOString().slice(0, 10) }

export default function MentorshipAuditPage() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [branch, setBranch] = useState('all')
  const [items, setItems] = useState<AuditItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/mentorship-audit?from=${from}&to=${to}&branch=${branch}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load'); setItems([]); setSummary(null); return }
      setItems(data.items || []); setSummary(data.summary || null)
    } catch {
      setError('Could not reach the audit service.')
    } finally { setLoading(false) }
  }, [from, to, branch])

  useEffect(() => { load() }, [load])

  const shown = onlyMissing ? items.filter(i => i.state === 'missing') : items

  const card = (label: string, value: number, color: string, bg: string, Icon: typeof CheckCircle2, note: string) => (
    <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="rounded-lg p-1.5" style={{ background: bg }}><Icon size={14} style={{ color }} /></span>
        <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{label}</span>
      </div>
      <div className="text-2xl font-extrabold" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{note}</div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>Mentorship Billing Audit</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Sessions booked <strong>With Mentor</strong> in the Clinic Schedule, checked against whether a
          “Mentorship” service was actually billed. Payroll can only pay the mentor when it was.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
          <select value={branch} onChange={e => setBranch(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
            <option value="all">Both branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2"
          style={{ background: 'var(--teal)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <label className="flex items-center gap-2 text-sm ml-auto" style={{ color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
          Show only unbilled
        </label>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{error}</div>
      )}

      {summary && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}>
          {card('Ticked With Mentor', summary.total, 'var(--charcoal)', 'var(--pale-teal, #E6F4F5)', Clock, 'sessions in range')}
          {card('Mentorship billed', summary.billed, '#15803D', '#DCFCE7', CheckCircle2, 'service on the order')}
          {card('Missing the service', summary.missing, '#B45309', '#FEF3C7', AlertTriangle, 'paid, but not tagged')}
          {card('Not yet converted', summary.unconverted, 'var(--mid-gray)', '#F3F4F6', Clock, 'no order yet — backlog, not a miss')}
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '52rem' }}>
            <thead>
              <tr style={{ background: 'var(--off-white, #FAFAF8)' }}>
                {['Date', 'Time', 'Patient', 'Clinician', 'Dept', 'Branch', 'Order', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold"
                    style={{ color: 'var(--mid-gray)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                  {onlyMissing
                    ? 'Nothing unbilled in this range — every mentorship session carries the service.'
                    : 'No sessions were booked With Mentor in this range.'}
                </td></tr>
              ) : shown.map(i => (
                <tr key={i.id} className="border-t" style={{
                  borderColor: 'var(--light-gray)',
                  background: i.state === 'missing' ? '#FEF9C3' : undefined,
                }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--charcoal)' }}>{i.date}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{i.time}</td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{i.patientName}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{i.clinician}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{i.department}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                    {i.branch ? (BRANCH_LABEL[i.branch] ?? i.branch) : '—'}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                    {i.orderNumbers.length ? i.orderNumbers.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.state === 'billed' && (
                      <span className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ background: '#DCFCE7', color: '#166534' }}>Billed</span>
                    )}
                    {i.state === 'missing' && (
                      <span className="px-2 py-1 rounded-lg text-xs font-bold" style={{ background: '#FDE047', color: '#854D0E' }}
                        title="Order exists but has no Mentorship service — add it so payroll can tag the session">
                        Missing service
                      </span>
                    )}
                    {i.state === 'unconverted' && (
                      <span className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ background: '#F3F4F6', color: '#6B7280' }}
                        title="No order created yet — a cashiering backlog rather than a billing miss">
                        Not converted
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
