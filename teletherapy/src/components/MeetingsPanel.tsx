'use client'

// Meeting Schedule list for the Internship "Meetings" tab and the Mentorship
// section (same component, `context` prop). This is now READ-ONLY: it shows the
// upcoming/past meetings and lets the creator cancel one. All meeting creation
// lives in the "Set a Meeting" sub-tab (SetMeeting) — either book someone with
// published availability, or just create a link with ticked invitees.

import { useCallback, useEffect, useState } from 'react'
import { Video, Calendar, Clock, Users, Trash2, Loader2 } from 'lucide-react'

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
  title = 'Meetings',
}: {
  context: 'INTERNSHIP' | 'MENTORSHIP'
  title?: string
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
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <Video size={18} className="text-[var(--teal)]" /> {title}
        </h2>
        <p className="text-[12px] text-[var(--mid-gray)]">Everyone invited can join and record. Use <strong>Set a Meeting</strong> to schedule one.</p>
      </div>

      {meetings === null ? (
        <p className="text-[13px] text-[var(--mid-gray)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : (
        <>
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--off-white)] border border-[var(--light-gray)] w-fit mb-1">
            {(['upcoming', 'past'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${view === v ? 'bg-white text-[var(--teal)] shadow-sm' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'}`}>
                {v === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="card-static text-center py-10">
              <Video size={26} className="text-[var(--light-gray)] mx-auto mb-2" />
              <p className="text-[13px] text-[var(--mid-gray)]">{view === 'upcoming' ? 'No upcoming meetings. Use “Set a Meeting” to schedule one.' : 'No past meetings yet.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((m) => (
            <div key={m.id} className="card-static !p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[var(--charcoal)] flex items-center gap-2">
                  {m.title || 'Supervision meeting'}
                  {m.paidAt && (
                    <span title={`Mentorship fee processed in payroll${m.paidCutoffLabel ? ` · ${m.paidCutoffLabel}` : ''}`}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Paid
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[var(--mid-gray)] flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Calendar size={12} />{fmtDate(m.date)}</span>
                  <span className="inline-flex items-center gap-1"><Clock size={12} />{m.timeLabel}</span>
                </div>
                <div className="text-[11px] text-[var(--mid-gray)] mt-1 truncate"><Users size={11} className="inline mr-1" />{m.inviteeNames.length ? `${m.inviteeNames.join(', ')} · ` : ''}by {m.createdByName}</div>
              </div>
              <a href={m.meetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[var(--teal)] text-white text-[13px] font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
                <Video size={15} /> Join
              </a>
              {m.createdByAccountId === currentAccountId && (
                <button onClick={() => cancel(m.id)} title="Cancel meeting" className="text-[var(--mid-gray)] hover:text-red-600 p-1"><Trash2 size={16} /></button>
              )}
            </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
