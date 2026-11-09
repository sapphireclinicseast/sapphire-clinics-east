'use client'

/**
 * Payroll → Employees → Weekly Accomplishments.
 *
 * Shows, for the selected cutoff, whether each hybrid/WFH employee's weekly
 * reports are submitted and approved in the HR Platform. WFH for a week can be
 * counted or paid only once that week's report is approved. Timekeeping has no
 * WFH marker, so payroll staff use this list when crediting WFH; it does not
 * change any pay amount by itself.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

type WeekState = 'approved' | 'pending' | 'resubmit' | 'disapproved' | 'missed' | 'open' | 'upcoming'
type Clearance = 'cleared' | 'hold' | 'in-progress'
interface Week { week: string; state: WeekState; submittedAt: string | null }
interface Person { staffId: string; name: string; branches: string[]; weeks: Week[]; clearance: Clearance }
interface Payload { range: { from: string; to: string }; people: Person[] }

const HR_REVIEW_URL = 'https://hr.sapphireclinicseast.org/modules/weekly-accomplishment/index.html'
const BRANCH_LABELS: Record<string, string> = { SBEA: 'East Branch', SBGH: 'Greenhills Branch', VERDANA: 'Verdana Store' }

const WEEK_STYLE: Record<WeekState, { label: string; mark: string; bg: string; color: string; border?: string }> = {
  approved: { label: 'Approved', mark: '✓', bg: '#D1FAE5', color: '#065F46' },
  pending: { label: 'Waiting for approval', mark: '•', bg: '#FEF3C7', color: '#92400E' },
  resubmit: { label: 'Sent back for resubmission', mark: '↻', bg: '#FFEDD5', color: '#9A3412' },
  disapproved: { label: 'Disapproved', mark: '✕', bg: '#F3F4F6', color: '#6B7280' },
  missed: { label: 'Not submitted', mark: '!', bg: '#FFFFFF', color: '#B91C1C', border: '1px dashed #EF4444' },
  open: { label: 'This week, not yet due', mark: '…', bg: '#FFFFFF', color: '#6B7280', border: '1px solid var(--light-gray)' },
  upcoming: { label: 'Not started yet', mark: '…', bg: '#FFFFFF', color: '#9CA3AF', border: '1px solid var(--light-gray)' },
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (ymd: string) => { const [, m, d] = ymd.split('-').map(Number); return `${MON[m - 1]} ${d}` }
const longDate = (ymd: string) => `${shortDate(ymd)}, ${ymd.slice(0, 4)}`
function weekEnd(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

/** What is outstanding, in words, e.g. "1 not submitted, 2 waiting for approval". */
function holdReason(weeks: Week[]) {
  const count = (s: WeekState) => weeks.filter(w => w.state === s).length
  return [
    count('missed') && `${count('missed')} not submitted`,
    count('pending') && `${count('pending')} waiting for approval`,
    count('resubmit') && `${count('resubmit')} sent back`,
    count('disapproved') && `${count('disapproved')} disapproved`,
  ].filter(Boolean).join(', ')
}

function useWeeklyAccomplishments(cutoffPeriod: string, branch: string) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const q = new URLSearchParams({ cutoffPeriod })
      if (branch) q.set('branch', branch)
      const res = await fetch(`/api/payroll/weekly-accomplishments?${q}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load')
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [cutoffPeriod, branch])
  useEffect(() => { void load() }, [load])
  return { data, loading, error, load }
}

export default function WeeklyAccomplishmentsTab({ cutoffPeriod, branch }: { cutoffPeriod: string; branch: string }) {
  const { data, loading, error, load } = useWeeklyAccomplishments(cutoffPeriod, branch)
  const people = data?.people || []
  const held = people.filter(p => p.clearance === 'hold').length
  const cleared = people.filter(p => p.clearance === 'cleared').length

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
        <AlertCircle size={15} className="shrink-0 mt-0.5" />
        <p>
          <b>WFH can only be counted or paid once that week&apos;s accomplishment report is submitted and approved.</b>{' '}
          Employees submit in the HR Hub, and reports are approved there.
          Timekeeping doesn&apos;t mark WFH days, so check this list before crediting WFH on a payslip.
        </p>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Weekly Accomplishments</h2>
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {data ? `Cutoff ${longDate(data.range.from)} to ${longDate(data.range.to)}` : `Cutoff ${cutoffPeriod}`}
              {' · '}{branch ? (BRANCH_LABELS[branch] || branch) : 'All Branches'}
              {data && people.length > 0 && ` · ${cleared} of ${people.length} cleared, ${held} on hold`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} title="Refresh" aria-label="Refresh" className="p-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              <RefreshCw size={14} />
            </button>
            <a href={HR_REVIEW_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--deep-teal)' }}>
              Review in HR Hub <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-10" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="animate-spin" /></div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ background: '#fef2f2', color: '#dc2626' }}>
            <AlertCircle size={14} className="shrink-0" />
            Could not check weekly accomplishments: {error} Treat WFH as not cleared until this loads.
          </div>
        )}

        {data && people.length === 0 && (
          <p className="text-xs py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No hybrid or WFH employees need to report for this cutoff.</p>
        )}

        {people.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)' }} className="hr-th text-left">
                    <th className="py-2 pr-3 font-semibold">Employee</th>
                    <th className="py-2 pr-3 font-semibold">Branch</th>
                    <th className="py-2 pr-3 font-semibold">Weeks in this cutoff</th>
                    <th className="py-2 font-semibold">WFH status</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(p => (
                    <tr key={p.staffId} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="py-2.5 pr-3 font-medium whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{p.name}</td>
                      <td className="py-2.5 pr-3" style={{ color: 'var(--mid-gray)' }}>{p.branches.map(b => BRANCH_LABELS[b] || b).join(', ')}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {p.weeks.map(w => {
                            const s = WEEK_STYLE[w.state]
                            return (
                              <span key={w.week} title={`${shortDate(w.week)} to ${shortDate(weekEnd(w.week))}: ${s.label}`}
                                className="inline-block px-2 py-0.5 rounded-md font-semibold whitespace-nowrap"
                                style={{ background: s.bg, color: s.color, border: s.border || '1px solid transparent' }}>
                                {s.mark} {shortDate(w.week)}–{shortDate(weekEnd(w.week))}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="py-2.5">
                        {p.clearance === 'cleared' && (
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#065F46' }}><CheckCircle2 size={13} /> Cleared</span>
                        )}
                        {p.clearance === 'in-progress' && (
                          <span className="font-semibold" style={{ color: '#6B7280' }}>In progress</span>
                        )}
                        {p.clearance === 'hold' && (
                          <div>
                            <div className="font-semibold" style={{ color: '#B91C1C' }}>On hold</div>
                            <div style={{ color: 'var(--mid-gray)' }}>{holdReason(p.weeks)}</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>
              A week that crosses two cutoffs appears in both. Consultants don&apos;t submit these reports, so they aren&apos;t listed.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** One-line reminder on Payslip Generation, linking to the subsection above. */
export function WeeklyAccomplishmentsNotice({ cutoffPeriod, branch, onOpen }: { cutoffPeriod: string; branch: string; onOpen: () => void }) {
  const { data, error } = useWeeklyAccomplishments(cutoffPeriod, branch)
  const held = data?.people.filter(p => p.clearance === 'hold').length || 0
  if (!error && !held) return null
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg p-3 text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
      <AlertCircle size={14} className="shrink-0" />
      <span>
        {error
          ? 'Could not check weekly accomplishments for this cutoff, so treat WFH as not cleared.'
          : `${held} employee${held === 1 ? ' has' : 's have'} WFH on hold this cutoff: weekly accomplishments must be submitted and approved before WFH can be counted or paid.`}
      </span>
      <button onClick={onOpen} className="font-semibold underline">View Weekly Accomplishments</button>
    </div>
  )
}
