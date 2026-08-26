'use client'

// Schedule + list video meetings for the Intern Supervision "Meeting" tab and
// the Mentorship section (same component, `context` prop). Each meeting mints a
// HOST meet.sapphire link (so either intern or supervisor can record), invites
// ticked interns/supervisors, and notifies them via the bell.

import { useCallback, useEffect, useState } from 'react'
import { Video, Plus, X, Calendar, Clock, Users, Trash2, Loader2 } from 'lucide-react'

interface Person { staffId: string; name: string }
interface Meeting {
  id: string
  title: string | null
  date: string
  timeLabel: string
  meetLink: string
  createdByAccountId: string
  createdByName: string
  inviteeNames: string[]
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = ['00', '15', '30', '45']

export default function MeetingsPanel({
  context,
  title = 'Meetings',
}: {
  context: 'INTERNSHIP' | 'MENTORSHIP'
  title?: string
}) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [currentAccountId, setCurrentAccountId] = useState('')
  const [interns, setInterns] = useState<Person[]>([])
  const [supervisors, setSupervisors] = useState<Person[]>([])
  const [showForm, setShowForm] = useState(false)

  const [mtitle, setMtitle] = useState('')
  const [date, setDate] = useState('')
  const [hour, setHour] = useState('2')
  const [minute, setMinute] = useState('00')
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  useEffect(() => {
    fetch('/api/intern-supervision/meeting-people', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setInterns(d.interns ?? []); setSupervisors(d.supervisors ?? []) })
      .catch(() => {})
  }, [])

  const toggle = (p: Person) => setPicked((prev) => {
    const n = { ...prev }
    if (n[p.staffId]) delete n[p.staffId]; else n[p.staffId] = p.name
    return n
  })

  const submit = async () => {
    setError(null)
    const invitees = Object.entries(picked).map(([staffId, name]) => ({ staffId, name }))
    if (!date) { setError('Pick a date.'); return }
    if (invitees.length === 0) { setError('Tick at least one person to invite.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/intern-supervision/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, title: mtitle, date, timeLabel: `${hour}:${minute} ${ampm}`, invitees }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Could not create the meeting.')
      setMeetings((m) => [data.meeting, ...(m ?? [])])
      setShowForm(false); setMtitle(''); setDate(''); setPicked({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the meeting.')
    } finally {
      setSubmitting(false)
    }
  }

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <Video size={18} className="text-[var(--teal)]" /> {title}
          </h2>
          <p className="text-[12px] text-[var(--mid-gray)]">Schedule a video meeting — everyone invited can join and record.</p>
        </div>
        <button onClick={() => { setShowForm((v) => !v); setError(null) }} className="inline-flex items-center gap-2 bg-[var(--narra)] text-white text-[13px] font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
          <Plus size={16} /> Add meeting
        </button>
      </div>

      {showForm && (
        <div className="card-static !p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-[var(--charcoal)]">New meeting</span>
            <button onClick={() => setShowForm(false)} className="text-[var(--mid-gray)] hover:text-[var(--charcoal)]"><X size={16} /></button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">Title (optional)</label>
            <input value={mtitle} onChange={(e) => setMtitle(e.target.value)} placeholder="e.g. Weekly supervision" className="w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white" />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1"><Calendar size={12} className="inline mr-1" />Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1"><Clock size={12} className="inline mr-1" />Time</label>
              <div className="flex items-center gap-1">
                <select value={hour} onChange={(e) => setHour(e.target.value)} className="px-2 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white">{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                <span className="font-bold text-[var(--mid-gray)]">:</span>
                <select value={minute} onChange={(e) => setMinute(e.target.value)} className="px-2 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white">{MINUTES.map((m) => <option key={m}>{m}</option>)}</select>
                <div className="flex rounded-lg border border-[var(--light-gray)] overflow-hidden ml-1">
                  {(['AM', 'PM'] as const).map((x) => (
                    <button key={x} onClick={() => setAmpm(x)} className={`px-3 py-2 text-[12px] font-semibold ${ampm === x ? 'bg-[var(--narra)] text-white' : 'bg-white text-[var(--mid-gray)]'}`}>{x}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-2"><Users size={12} className="inline mr-1" />Invite</label>
            {interns.length === 0 && supervisors.length === 0 && (
              <p className="text-[12px] text-[var(--mid-gray)] italic">No interns or supervisors available to invite.</p>
            )}
            {supervisors.length > 0 && <PeopleGroup label="Supervisors" people={supervisors} picked={picked} toggle={toggle} />}
            {interns.length > 0 && <PeopleGroup label="Interns" people={interns} picked={picked} toggle={toggle} />}
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] text-[var(--mid-gray)]">Cancel</button>
            <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-[var(--narra)] text-white disabled:opacity-50">
              {submitting && <Loader2 size={14} className="animate-spin" />} Create meeting
            </button>
          </div>
        </div>
      )}

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
              <p className="text-[13px] text-[var(--mid-gray)]">{view === 'upcoming' ? 'No upcoming meetings. Click Add meeting to schedule one.' : 'No past meetings yet.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((m) => (
            <div key={m.id} className="card-static !p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[var(--charcoal)]">{m.title || 'Supervision meeting'}</div>
                <div className="text-[12px] text-[var(--mid-gray)] flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Calendar size={12} />{fmtDate(m.date)}</span>
                  <span className="inline-flex items-center gap-1"><Clock size={12} />{m.timeLabel}</span>
                </div>
                <div className="text-[11px] text-[var(--mid-gray)] mt-1 truncate"><Users size={11} className="inline mr-1" />{m.inviteeNames.join(', ')} · by {m.createdByName}</div>
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

function PeopleGroup({
  label, people, picked, toggle,
}: {
  label: string
  people: { staffId: string; name: string }[]
  picked: Record<string, string>
  toggle: (p: { staffId: string; name: string }) => void
}) {
  return (
    <div className="mb-2">
      <p className="text-[11px] font-bold text-[var(--mid-gray)] mb-1">{label}</p>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => {
          const on = !!picked[p.staffId]
          return (
            <button
              key={p.staffId}
              onClick={() => toggle(p)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-colors ${on ? 'bg-[var(--narra)] text-white border-[var(--narra)]' : 'bg-white text-[var(--charcoal)] border-[var(--light-gray)]'}`}
            >
              <span className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${on ? 'bg-white border-white' : 'border-[var(--mid-gray)]'}`}>
                {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#244952" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              {p.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
