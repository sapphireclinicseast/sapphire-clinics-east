'use client'

// "Set a Meeting" — the single place to create a meeting. Two modes:
//   • With a person — book a 1-on-1 with someone who published availability:
//     pick them → see their weekly slots → choose date + time (invites them).
//   • Just create a link — pick a date/time and tick whoever to invite
//     (interns + supervisors), no availability needed. Only supervisors/mentors
//     see this mode (`canCreateLink`); mentees/interns just book a person.
// Both mint host meet.sapphire links (either side can record) and notify
// invitees via the bell. The result lands under the Meeting Schedule tab.

import { useEffect, useState } from 'react'
import { Loader2, Video, Calendar, Clock, Check, User, Users } from 'lucide-react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = ['00', '15', '30', '45']

interface Person { staffId: string; name: string; department?: string }
interface Slot { id: string; dayFrom: number; dayTo: number; timeStart: string; timeEnd: string }

function to12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  const ap = h < 12 ? 'AM' : 'PM'
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`
}
const dayRange = (f: number, t: number) => (f === t ? DAYS[f] : `${DAYS[f]}–${DAYS[t]}`)

type Mode = 'person' | 'link'

export default function SetMeeting({
  context,
  onBooked,
  canCreateLink = false,
}: {
  context: 'INTERNSHIP' | 'MENTORSHIP'
  onBooked?: () => void
  canCreateLink?: boolean
}) {
  const [mode, setMode] = useState<Mode>('person')

  // Shared "when" fields (used by both modes).
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [hour, setHour] = useState('2')
  const [minute, setMinute] = useState('00')
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [doneWith, setDoneWith] = useState('')

  // Mode "person": bookable staff + their availability.
  const [people, setPeople] = useState<Person[] | null>(null)
  const [selected, setSelected] = useState<Person | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)

  // Mode "link": tick-box invitees (interns + supervisors).
  const [interns, setInterns] = useState<Person[]>([])
  const [supervisors, setSupervisors] = useState<Person[]>([])
  const [picked, setPicked] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/bookable-staff', { cache: 'no-store' }).then((r) => r.json()).then((d) => setPeople(d.staff ?? [])).catch(() => setPeople([]))
  }, [])

  // Only load the invitee list when the user can actually use the link mode.
  useEffect(() => {
    if (!canCreateLink) return
    fetch('/api/intern-supervision/meeting-people', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setInterns(d.interns ?? []); setSupervisors(d.supervisors ?? []) })
      .catch(() => {})
  }, [canCreateLink])

  const resetWhen = () => { setDate(''); setTitle(''); setHour('2'); setMinute('00'); setAmpm('PM') }

  const pick = async (p: Person) => {
    setSelected(p); setSlots(null)
    try {
      const r = await fetch(`/api/availability/staff/${p.staffId}`, { cache: 'no-store' })
      const d = await r.json()
      setSlots(r.ok ? (d.slots ?? []) : [])
    } catch { setSlots([]) }
  }

  const togglePick = (p: Person) => setPicked((prev) => {
    const n = { ...prev }
    if (n[p.staffId]) delete n[p.staffId]; else n[p.staffId] = p.name
    return n
  })

  const create = async (invitees: { staffId: string; name: string }[], withLabel: string) => {
    setError(null)
    if (!date) { setError('Pick a date.'); return }
    if (invitees.length === 0) { setError('Tick at least one person to invite.'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/intern-supervision/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, title, date, timeLabel: `${hour}:${minute} ${ampm}`, invitees }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not set the meeting.')
      setDoneWith(withLabel)
      setDone(true)
      onBooked?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the meeting.')
    } finally { setSubmitting(false) }
  }

  const bookPerson = () => {
    if (!selected) { setError('Pick someone to meet.'); return }
    create([{ staffId: selected.staffId, name: selected.name }], selected.name)
  }
  const createLink = () => {
    const invitees = Object.entries(picked).map(([staffId, name]) => ({ staffId, name }))
    create(invitees, invitees.map((i) => i.name).join(', '))
  }

  if (done) {
    return (
      <div className="card-static text-center py-10">
        <div className="w-12 h-12 rounded-full bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-3"><Check size={22} className="text-[var(--teal)]" /></div>
        <p className="font-semibold text-[var(--charcoal)]">Meeting set{doneWith ? ` with ${doneWith}` : ''}</p>
        <p className="text-[13px] text-[var(--mid-gray)] mt-1">Everyone invited has been notified. Find it under <strong>Meeting Schedule</strong>.</p>
        <button onClick={() => { setDone(false); setSelected(null); setSlots(null); setPicked({}); resetWhen() }} className="mt-4 text-[13px] text-[var(--teal)] font-semibold hover:underline">Set another meeting</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <Video size={18} className="text-[var(--teal)]" /> Set a Meeting
        </h3>
        <p className="text-[12px] text-[var(--mid-gray)]">
          {canCreateLink
            ? 'Book someone with published availability, or just create a link with the people you tick.'
            : 'Book a 1-on-1 with someone who has published their availability.'}
        </p>
      </div>

      {/* Mode toggle — only when the account can create ad-hoc links. */}
      {canCreateLink && (
        <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-[var(--off-white)] border border-[var(--light-gray)] w-fit">
          {([
            { k: 'person' as Mode, label: 'With a person', icon: User },
            { k: 'link' as Mode, label: 'Just create a link', icon: Users },
          ]).map((t) => (
            <button
              key={t.k}
              onClick={() => { setMode(t.k); setError(null) }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${mode === t.k ? 'bg-white text-[var(--teal)] shadow-sm' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'}`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ─────────────── Mode: With a person ─────────────── */}
      {mode === 'person' && (
        <>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-2">Who do you want to meet?</label>
            {people === null ? (
              <p className="text-[13px] text-[var(--mid-gray)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
            ) : people.length === 0 ? (
              <p className="text-[13px] text-[var(--mid-gray)] italic">No one has published availability yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <button key={p.staffId} onClick={() => pick(p)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-colors ${selected?.staffId === p.staffId ? 'bg-[var(--narra)] text-white border-[var(--narra)]' : 'bg-white text-[var(--charcoal)] border-[var(--light-gray)]'}`}>
                    <User size={13} /> {p.name}{p.department ? <span className={selected?.staffId === p.staffId ? 'text-white/70' : 'text-[var(--mid-gray)]'}> · {p.department}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <>
              <div className="card-static !p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-2">{selected.name}&apos;s availability</p>
                {slots === null ? (
                  <p className="text-[12px] text-[var(--mid-gray)] flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading…</p>
                ) : slots.length === 0 ? (
                  <p className="text-[12px] text-[var(--mid-gray)] italic">No availability published — you can still propose a time below.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 text-[12px] bg-[var(--pale-teal)] text-[var(--deep-teal)] px-2.5 py-1 rounded-lg">
                        <Clock size={12} /> {dayRange(s.dayFrom, s.dayTo)} · {to12(s.timeStart)}–{to12(s.timeEnd)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-static !p-4 space-y-3">
                <WhenFields
                  title={title} setTitle={setTitle} titlePlaceholder="e.g. Case discussion"
                  date={date} setDate={setDate}
                  hour={hour} setHour={setHour} minute={minute} setMinute={setMinute} ampm={ampm} setAmpm={setAmpm}
                />
                {error && <p className="text-[12px] text-red-600">{error}</p>}
                <div className="flex justify-end">
                  <button onClick={bookPerson} disabled={submitting} className="inline-flex items-center gap-2 bg-[var(--narra)] text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Video size={15} />} Set meeting
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ─────────────── Mode: Just create a link ─────────────── */}
      {mode === 'link' && canCreateLink && (
        <div className="card-static !p-4 space-y-4">
          <WhenFields
            title={title} setTitle={setTitle} titlePlaceholder="e.g. Weekly supervision"
            date={date} setDate={setDate}
            hour={hour} setHour={setHour} minute={minute} setMinute={setMinute} ampm={ampm} setAmpm={setAmpm}
          />

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-2"><Users size={12} className="inline mr-1" />Invite</label>
            {interns.length === 0 && supervisors.length === 0 && (
              <p className="text-[12px] text-[var(--mid-gray)] italic">No interns or supervisors available to invite.</p>
            )}
            {supervisors.length > 0 && <PeopleGroup label="Supervisors" people={supervisors} picked={picked} toggle={togglePick} />}
            {interns.length > 0 && <PeopleGroup label="Interns" people={interns} picked={picked} toggle={togglePick} />}
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button onClick={createLink} disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-[var(--narra)] text-white disabled:opacity-50">
              {submitting && <Loader2 size={14} className="animate-spin" />} Create meeting
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Shared date/time/title block used by both modes.
function WhenFields({
  title, setTitle, titlePlaceholder,
  date, setDate, hour, setHour, minute, setMinute, ampm, setAmpm,
}: {
  title: string; setTitle: (v: string) => void; titlePlaceholder: string
  date: string; setDate: (v: string) => void
  hour: string; setHour: (v: string) => void
  minute: string; setMinute: (v: string) => void
  ampm: 'AM' | 'PM'; setAmpm: (v: 'AM' | 'PM') => void
}) {
  return (
    <>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">Title / purpose (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titlePlaceholder} className="w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white" />
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
    </>
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
