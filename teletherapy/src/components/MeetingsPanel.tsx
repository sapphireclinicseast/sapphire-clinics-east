'use client'

// Meeting Schedule list for the Internship "Meetings" tab and the Mentorship
// section (same component, `context` prop). This is now READ-ONLY: it shows the
// upcoming/past meetings and lets the creator cancel one. All meeting creation
// lives in the "Set a Meeting" sub-tab (SetMeeting) — either book someone with
// published availability, or just create a link with ticked invitees.

import { useCallback, useEffect, useState } from 'react'
import { Video, Calendar, Clock, Users, Trash2 } from 'lucide-react'
import {
  BTN_PRIMARY, BTN_SM, CARD_STYLE, EmptyState, PRIMARY_STYLE, PillTabs, RowsSkeleton, StatusPill,
} from '@/components/hub/ui'

interface Meeting {
  id: string
  title: string | null
  date: string
  timeLabel: string
  meetLink: string
  createdByAccountId: string
  createdByName: string
  inviteeNames: string[]
  paidAt?: string | null
  paidCutoffLabel?: string | null
}

export default function MeetingsPanel({
  context,
}: {
  context: 'INTERNSHIP' | 'MENTORSHIP'
}) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [currentAccountId, setCurrentAccountId] = useState('')
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/intern-supervision/meetings?context=${context}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) { setMeetings(data.meetings ?? []); setCurrentAccountId(data.currentAccountId ?? '') }
      else setMeetings([])
    } catch { setMeetings([]) }
  }, [context])

  useEffect(() => { load() }, [load])

  const cancel = async (id: string) => {
    if (!confirm('Cancel this meeting?')) return
    try {
      const res = await fetch(`/api/intern-supervision/meetings/${id}`, { method: 'DELETE' })
      if (res.ok) setMeetings((m) => (m ?? []).filter((x) => x.id !== id))
    } catch { /* ignore */ }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Split into upcoming vs past (history) by the meeting day. Upcoming shows
  // soonest first; past (history) shows most-recent first.
  const n = new Date()
  const todayMid = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const list = meetings ?? []
  const isPast = (m: Meeting) => { const t = new Date(m.date).getTime(); return !Number.isNaN(t) && t < todayMid }
  const upcoming = list.filter((m) => !isPast(m)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const past = list.filter(isPast).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const shown = view === 'upcoming' ? upcoming : past

  return (
    <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      {/* One card: Upcoming / Past switch in the header, the list below. */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <PillTabs
          label="Meeting schedule"
          size="sm"
          value={view}
          onChange={(id) => setView(id as 'upcoming' | 'past')}
          tabs={[
            { id: 'upcoming', label: 'Upcoming', count: meetings === null ? undefined : upcoming.length },
            { id: 'past', label: 'Past', count: meetings === null ? undefined : past.length },
          ]}
        />
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Everyone invited can join and record.</p>
      </div>

      {meetings === null ? (
        <RowsSkeleton rows={3} label="Loading meetings" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={view === 'upcoming' ? 'No upcoming meetings' : 'No past meetings yet'}
          hint={view === 'upcoming' ? 'Use “Set a Meeting” to schedule one.' : undefined}
        />
      ) : (
            <ul>
              {shown.map((m, i) => (
            <li key={m.id} className="px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5" style={i ? { borderTop: '1px solid var(--light-gray)' } : undefined}>
              <div className="flex-1 min-w-[200px]">
                <div className="text-[14px] font-semibold flex flex-wrap items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                  {m.title || 'Supervision meeting'}
                  {m.paidAt && (
                    <StatusPill tone="success" title={`Mentorship fee processed in payroll${m.paidCutoffLabel ? ` · ${m.paidCutoffLabel}` : ''}`}>
                      Paid
                    </StatusPill>
                  )}
                </div>
                <div className="text-xs flex items-center gap-3 mt-1 flex-wrap" style={{ color: 'var(--mid-gray)' }}>
                  <span className="inline-flex items-center gap-1"><Calendar size={12} aria-hidden />{fmtDate(m.date)}</span>
                  <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{m.timeLabel}</span>
                </div>
                <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--mid-gray)' }}><Users size={11} className="inline mr-1" aria-hidden />{m.inviteeNames.length ? `${m.inviteeNames.join(', ')} · ` : ''}by {m.createdByName}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <a href={m.meetLink} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                  <Video size={15} aria-hidden /> Join
                </a>
                {m.createdByAccountId === currentAccountId && (
                  <button onClick={() => cancel(m.id)} title="Cancel meeting" aria-label="Cancel meeting" className={`${BTN_SM} hover:!bg-red-50 hover:!text-[#B42318]`} style={{ color: 'var(--mid-gray)' }}><Trash2 size={15} /></button>
                )}
              </div>
            </li>
              ))}
            </ul>
      )}
    </section>
  )
}
