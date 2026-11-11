'use client'

/**
 * Payroll → Employees → Weekly Accomplishments.
 *
 * Shows, for the selected cutoff, whether each hybrid/WFH employee's weekly
 * reports are submitted and approved in the HR Platform, and holds their
 * work-from-home days (Hannah 2026-11-11): WFH settings set how many WFH days
 * each employee has a week; per week the payroll officer picks which day(s)
 * and how many hours each is paid. The payslip generator pays them (hours ×
 * hourly rate) once HR approves that week's report — no timekeeping edits.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Home, Loader2, RefreshCw, Settings2 } from 'lucide-react'

type WeekState = 'approved' | 'pending' | 'resubmit' | 'disapproved' | 'missed' | 'open' | 'upcoming'
type Clearance = 'cleared' | 'hold' | 'in-progress'
interface Week { week: string; state: WeekState; submittedAt: string | null }
interface Person { staffId: string; name: string; branches: string[]; weeks: Week[]; clearance: Clearance }
interface Payload { range: { from: string; to: string }; people: Person[] }
interface WfhEmployee { employeeId: string; staffId: string; name: string; branch: string; wfhDaysPerWeek: number | null }
interface WfhDayRow { id: string; employeeId: string; date: string; weekStart: string; hours: number; payslipId: string | null; paidCutoff: string | null }
interface WfhPayload { standardHours: number; employees: WfhEmployee[]; days: WfhDayRow[] }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dowOf = (ymd: string) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()]
/** "2026-11-1" → "Nov 2026 · 1st". */
const cutoffLabel = (c: string) => { const [y, m, h] = c.split('-'); return `${MON[Number(m) - 1]} ${y} · ${h === '1' ? '1st' : '2nd'}` }
const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0+$/, '')}h`

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

function useWfh(cutoffPeriod: string) {
  const [wfh, setWfh] = useState<WfhPayload | null>(null)
  const [wfhError, setWfhError] = useState('')
  const loadWfh = useCallback(async () => {
    setWfhError('')
    try {
      const res = await fetch(`/api/payroll/wfh?${new URLSearchParams({ cutoffPeriod })}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load WFH days')
      setWfh(d)
    } catch (e) {
      setWfhError(e instanceof Error ? e.message : 'Failed to load WFH days')
    }
  }, [cutoffPeriod])
  useEffect(() => { void loadWfh() }, [loadWfh])
  return { wfh, wfhError, loadWfh }
}

export default function WeeklyAccomplishmentsTab({ cutoffPeriod, branch, canWrite = false }: { cutoffPeriod: string; branch: string; canWrite?: boolean }) {
  const { data, loading, error, load } = useWeeklyAccomplishments(cutoffPeriod, branch)
  const { wfh, wfhError, loadWfh } = useWfh(cutoffPeriod)
  const people = data?.people || []
  const held = people.filter(p => p.clearance === 'hold').length
  const cleared = people.filter(p => p.clearance === 'cleared').length

  const empByStaff = useMemo(() => new Map((wfh?.employees || []).map(e => [e.staffId, e])), [wfh])
  const daysBy = useMemo(() => {
    const m = new Map<string, WfhDayRow[]>()
    for (const d of wfh?.days || []) {
      const k = `${d.employeeId}|${d.weekStart}`
      m.set(k, [...(m.get(k) || []), d])
    }
    return m
  }, [wfh])
  const stdHours = wfh?.standardHours || 8
  const [actionError, setActionError] = useState('')
  const [savingSetting, setSavingSetting] = useState('')
  const saveSetting = async (employeeId: string, value: string) => {
    setSavingSetting(employeeId); setActionError('')
    try {
      const res = await fetch('/api/payroll/wfh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, wfhDaysPerWeek: value ? Number(value) : null }) })
      if (!res.ok) setActionError((await res.json().catch(() => ({}))).error || 'Could not save the WFH setting')
      await loadWfh()
    } finally { setSavingSetting('') }
  }

  // The week being edited: which days are WFH and the hours each is paid.
  const [edit, setEdit] = useState<{ staffId: string; employeeId: string; weekStart: string; allowed: number; picks: Record<string, string>; locked: Set<string> } | null>(null)
  const [savingWeek, setSavingWeek] = useState(false)
  const openWeek = (p: Person, weekStart: string) => {
    const e = empByStaff.get(p.staffId)
    if (!e) return
    const existing = daysBy.get(`${e.employeeId}|${weekStart}`) || []
    setActionError('')
    setEdit({
      staffId: p.staffId, employeeId: e.employeeId, weekStart, allowed: e.wfhDaysPerWeek || 0,
      picks: Object.fromEntries(existing.map(d => [d.date, String(d.hours)])),
      locked: new Set(existing.filter(d => d.payslipId).map(d => d.date)),
    })
  }
  const togglePick = (date: string) => setEdit(ed => {
    if (!ed || ed.locked.has(date)) return ed
    const picks = { ...ed.picks }
    if (date in picks) delete picks[date]
    else {
      if (Object.keys(picks).length >= ed.allowed) return ed
      picks[date] = String(stdHours)
    }
    return { ...ed, picks }
  })
  const saveWeek = async () => {
    if (!edit) return
    setSavingWeek(true); setActionError('')
    try {
      const days = Object.entries(edit.picks).map(([date, hours]) => ({ date, hours: Number(hours) }))
      const res = await fetch('/api/payroll/wfh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: edit.employeeId, weekStart: edit.weekStart, days }) })
      if (!res.ok) { setActionError((await res.json().catch(() => ({}))).error || 'Could not save the WFH days'); return }
      setEdit(null)
      await loadWfh()
    } finally { setSavingWeek(false) }
  }
  /** How a set WFH day stands for pay. */
  const dayStatus = (d: WfhDayRow, w: Week | undefined) => d.paidCutoff
    ? { text: `paid · ${cutoffLabel(d.paidCutoff)}`, color: '#065F46' }
    : w?.state === 'approved'
      ? { text: 'approved · paid on the next payslip generated', color: '#0F766E' }
      : { text: 'paid once the report is approved', color: '#92400E' }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
        <AlertCircle size={15} className="shrink-0 mt-0.5" />
        <p>
          <b>WFH is paid only once that week&apos;s accomplishment report is submitted and approved.</b>{' '}
          Employees submit in the HR Hub, and reports are approved there. Set each person&apos;s WFH days a week below, then click a week to
          pick its WFH day(s) and the hours paid. The payslip adds them (hours × hourly rate) as soon as the week is approved — a week approved
          after its cutoff goes on the next payslip. Don&apos;t edit timekeeping for WFH.
        </p>
      </div>

      {people.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}><Settings2 size={14} /> WFH settings</h2>
          <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>How many days a week each employee works from home. It caps the WFH days you can pick per week below.</p>
          {wfhError && <p className="text-xs mb-2" style={{ color: '#dc2626' }}>Could not load WFH days: {wfhError}</p>}
          {actionError && !edit && <p className="text-xs mb-2" style={{ color: '#dc2626' }}>{actionError}</p>}
          <div className="flex flex-wrap gap-2">
            {people.map(p => {
              const e = empByStaff.get(p.staffId)
              return (
                <label key={p.staffId} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{p.name}</span>
                  {e ? (
                    <select value={e.wfhDaysPerWeek ?? ''} disabled={!canWrite || savingSetting === e.employeeId}
                      onChange={ev => saveSetting(e.employeeId, ev.target.value)} aria-label={`WFH days a week for ${p.name}`}
                      className="px-2 py-1 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">Not WFH</option>
                      {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} day{n === 1 ? '' : 's'} a week</option>)}
                    </select>
                  ) : <span style={{ color: 'var(--mid-gray)' }}>not on hub payroll</span>}
                  {savingSetting === e?.employeeId && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
                </label>
              )
            })}
          </div>
        </div>
      )}

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
            <button onClick={() => { void load(); void loadWfh() }} title="Refresh (re-reads HR approvals)" aria-label="Refresh" className="p-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
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
                  {people.map(p => {
                    const e = empByStaff.get(p.staffId)
                    const editing = edit?.staffId === p.staffId ? edit : null
                    return (
                    <Fragment key={p.staffId}>
                    <tr className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="py-2.5 pr-3 font-medium whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{p.name}</td>
                      <td className="py-2.5 pr-3" style={{ color: 'var(--mid-gray)' }}>{p.branches.map(b => BRANCH_LABELS[b] || b).join(', ')}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {p.weeks.map(w => {
                            const s = WEEK_STYLE[w.state]
                            const set = e ? (daysBy.get(`${e.employeeId}|${w.week}`) || []) : []
                            const canEdit = canWrite && !!e && (e.wfhDaysPerWeek || 0) > 0
                            const chip = (
                              <span className="inline-block px-2 py-0.5 rounded-md font-semibold whitespace-nowrap"
                                style={{ background: s.bg, color: s.color, border: editing?.weekStart === w.week ? '1.5px solid var(--teal)' : (s.border || '1px solid transparent') }}>
                                {s.mark} {shortDate(w.week)}–{shortDate(weekEnd(w.week))}
                              </span>
                            )
                            return (
                              <div key={w.week} className="flex flex-col items-start gap-0.5">
                                {canEdit ? (
                                  <button type="button" onClick={() => (editing?.weekStart === w.week ? setEdit(null) : openWeek(p, w.week))}
                                    title={`${shortDate(w.week)} to ${shortDate(weekEnd(w.week))}: ${s.label} — click to set the WFH day(s)`}>
                                    {chip}
                                  </button>
                                ) : <span title={`${shortDate(w.week)} to ${shortDate(weekEnd(w.week))}: ${s.label}`}>{chip}</span>}
                                {set.map(d => {
                                  const st = dayStatus(d, w)
                                  return (
                                    <span key={d.id} className="text-[10.5px] whitespace-nowrap" style={{ color: st.color }} title={st.text}>
                                      <Home size={10} className="inline -mt-0.5 mr-0.5" />{dowOf(d.date)} {shortDate(d.date)} · {fmtHours(d.hours)} · {st.text}
                                    </span>
                                  )
                                })}
                                {canEdit && !set.length && (
                                  <button type="button" onClick={() => openWeek(p, w.week)} className="text-[10.5px] underline" style={{ color: 'var(--mid-gray)' }}>+ WFH day</button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {e && !e.wfhDaysPerWeek && canWrite && (
                          <p className="text-[10.5px] mt-1" style={{ color: 'var(--mid-gray)' }}>Set WFH days a week in WFH settings to pick WFH days.</p>
                        )}
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
                    {editing && (
                      <tr style={{ background: 'var(--off-white)' }}>
                        <td colSpan={4} className="px-3 py-3">
                          <div className="flex flex-wrap items-start gap-3">
                            <div>
                              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                                WFH day{editing.allowed === 1 ? '' : 's'} for the week of {shortDate(editing.weekStart)}–{shortDate(weekEnd(editing.weekStart))}
                                <span className="font-normal" style={{ color: 'var(--mid-gray)' }}> · pick up to {editing.allowed}</span>
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {Array.from({ length: 7 }, (_, i) => addDays(editing.weekStart, i)).map(date => {
                                  const on = date in editing.picks
                                  const locked = editing.locked.has(date)
                                  const full = !on && Object.keys(editing.picks).length >= editing.allowed
                                  return (
                                    <div key={date} className="flex flex-col items-center gap-1">
                                      <button type="button" onClick={() => togglePick(date)} disabled={locked || full} aria-pressed={on}
                                        title={locked ? 'Already paid on a payslip' : full ? `Only ${editing.allowed} WFH day${editing.allowed === 1 ? '' : 's'} a week` : undefined}
                                        className="w-14 py-1.5 rounded-lg border text-[11px] font-semibold leading-tight disabled:opacity-40"
                                        style={on ? { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' } : { background: '#fff', color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
                                        {dowOf(date)}<br /><span className="font-normal">{shortDate(date)}</span>
                                      </button>
                                      {on && (
                                        <label className="flex items-center gap-0.5 text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>
                                          <input type="number" min={0.5} max={24} step={0.5} value={editing.picks[date]} disabled={locked}
                                            onChange={ev => setEdit(ed => (ed ? { ...ed, picks: { ...ed.picks, [date]: ev.target.value } } : ed))}
                                            aria-label={`Hours paid on ${date}`}
                                            className="w-12 px-1 py-0.5 rounded border text-center text-[11px] bg-white" style={{ borderColor: 'var(--light-gray)' }} />h
                                        </label>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-end">
                              <button type="button" onClick={saveWeek} disabled={savingWeek}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1 disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                                {savingWeek && <Loader2 size={12} className="animate-spin" />} Save
                              </button>
                              <button type="button" onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                            </div>
                          </div>
                          <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>
                            Hours default to a full day ({fmtHours(stdHours)}). Pay = hours × hourly rate, on the payslip once this week&apos;s report is approved in HR Hub. A day that has timekeeping hours is already paid, so it&apos;s skipped.
                          </p>
                          {actionError && <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{actionError}</p>}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  })}
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
