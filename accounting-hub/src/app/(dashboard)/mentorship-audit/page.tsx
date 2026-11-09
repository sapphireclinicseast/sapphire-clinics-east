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
import { RefreshCw, Users } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

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
const BRANCH_PILLS = [
  { value: 'all', label: 'Both branches' },
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
]
// Row edge + pill per audit state (same three states as before).
const STATE_LOOK: Record<AuditItem['state'], { label: string; line: string; bg: string; fg: string; title?: string }> = {
  billed:      { label: 'Billed', line: '#059669', bg: '#dcfce7', fg: '#166534' },
  missing:     { label: 'Missing service', line: '#d97706', bg: '#fef3c7', fg: '#92400e', title: 'Order exists but has no Mentorship service — add it so payroll can tag the session' },
  unconverted: { label: 'Not converted', line: '#DDE6CC', bg: '#f1f5f2', fg: '#55616A', title: 'No order created yet — a cashiering backlog rather than a billing miss' },
}
const TH = 'px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'

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

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Users size={22} style={{ color: 'var(--teal)' }} /> Mentorship Audit
        </h1>
        <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
          Sessions booked <strong>With Mentor</strong> in the Clinic Schedule, checked against whether a
          “Mentorship” service was actually billed. Payroll can only pay the mentor when it was.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg border" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          {BRANCH_PILLS.map(b => (
            <button key={b.value} onClick={() => setBranch(b.value)} aria-pressed={branch === b.value}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === b.value
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{b.label}</button>
          ))}
        </div>
        <span className="hidden sm:block w-px h-6 mx-1" style={{ background: 'var(--light-gray)' }} />
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>
          From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-8 px-2 rounded-lg border text-xs font-normal normal-case tracking-normal bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>
          To
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-8 px-2 rounded-lg border text-xs font-normal normal-case tracking-normal bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </label>
        <button onClick={load} disabled={loading} className={`${hrBtn.ghost} sm:ml-auto`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>
      )}

      {/* Status cards — the same four counts as before; Ticked and Missing double as the list switch. */}
      {(summary || loading) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard loading={loading && !summary} label="Ticked With Mentor" value={String(summary?.total ?? 0)} sub="Sessions in range · click to list all"
            tone="zero" accent={summary?.total ? { line: '#4A8073' } : undefined} active={!onlyMissing} activeSub="Listing every session below"
            onClick={() => setOnlyMissing(false)} />
          <StatCard loading={loading && !summary} label="Mentorship billed" value={String(summary?.billed ?? 0)} sub="Service on the order"
            tone={summary?.billed ? 'green' : 'zero'} />
          <StatCard loading={loading && !summary} label="Missing the service" value={String(summary?.missing ?? 0)} sub="Paid, but not tagged · click to list"
            tone={summary?.missing ? 'amber' : 'zero'} active={onlyMissing} activeSub="Listing only these below"
            onClick={() => setOnlyMissing(true)} />
          <StatCard loading={loading && !summary} label="Not yet converted" value={String(summary?.unconverted ?? 0)} sub="No order yet — backlog, not a miss"
            tone={summary?.unconverted ? 'blue' : 'zero'} />
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <div className="inline-flex rounded-lg border p-0.5 bg-white" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Which sessions">
            {([[true, 'Unbilled only'], [false, 'All sessions']] as const).map(([v, label]) => (
              <button key={label} onClick={() => setOnlyMissing(v)} aria-pressed={onlyMissing === v}
                className="h-7 px-3 rounded-md text-xs font-semibold transition-colors"
                style={onlyMissing === v ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}>{label}</button>
            ))}
          </div>
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} of {items.length} session{items.length === 1 ? '' : 's'}</span>
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            {(['missing', 'billed', 'unconverted'] as const).map(k => (
              <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATE_LOOK[k].line }} />{STATE_LOOK[k].label}</span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto relative">
          <table className="w-full text-sm" style={{ minWidth: '52rem' }}>
            <thead>
              <tr style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)' }}>
                {['Date', 'Time', 'Patient', 'Clinician', 'Dept', 'Branch', 'Order', 'Status'].map(h => (
                  <th key={h} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3].map(i => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={8} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                  {onlyMissing
                    ? 'Nothing unbilled in this range — every mentorship session carries the service.'
                    : 'No sessions were booked With Mentor in this range.'}
                </td></tr>
              ) : shown.map(i => {
                const look = STATE_LOOK[i.state]
                return (
                  <tr key={i.id} className="border-t transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs" style={{ color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${look.line}` }}>{i.date}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{i.time}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{i.patientName}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{i.clinician}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{i.department}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                      {i.branch ? (BRANCH_LABEL[i.branch] ?? i.branch) : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {i.orderNumbers.length ? i.orderNumbers.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: look.bg, color: look.fg }} title={look.title}>{look.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
