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
import {
  BTN_PRIMARY, CARD_STYLE, CONTROL, CONTROL_STYLE, DANGER, FOCUS, LABEL, LABEL_STYLE, PRIMARY_STYLE, PillTabs, SUBTLE_BG,
} from '@/components/hub/ui'

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

  // Mode "link": tick-box invitees, grouped by role and scoped to the caller's
  // department + context (Supervisors/Interns for INTERNSHIP, Mentors/Mentees
  // for MENTORSHIP).
  const [groups, setGroups] = useState<{ key: string; label: string; people: Person[] }[]>([])
  const [picked, setPicked] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`/api/bookable-staff?context=${context}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setPeople(d.staff ?? [])).catch(() => setPeople([]))
  }, [context])

  // Only load the invitee list when the user can actually use the link mode.
  useEffect(() => {
    if (!canCreateLink) return
    fetch(`/api/intern-supervision/meeting-people?context=${context}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setGroups(Array.isArray(d.groups) ? d.groups : []))
      .catch(() => {})
  }, [canCreateLink, context])

  const anyInvitees = groups.some((g) => g.people.length > 0)

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
    // Invitees optional in "just create a link" mode — a link with no one
    // ticked is fine (the creator can share it manually).
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
      <div role="status" className="rounded-xl text-center px-6 py-10" style={CARD_STYLE}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--pale-teal)' }}><Check size={22} style={{ color: 'var(--teal)' }} /></div>
        <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>Meeting set{doneWith ? ` with ${doneWith}` : ''}</p>
        <p className="text-[13px] mt-1" style={{ color: 'var(--mid-gray)' }}>{doneWith ? 'Everyone invited has been notified. ' : 'The link is ready to share. '}Find it under <strong>Meeting Schedule</strong>.</p>
        <button onClick={() => { setDone(false); setSelected(null); setSlots(null); setPicked({}); resetWhen() }} className={`mt-4 text-[13px] font-semibold hover:underline rounded ${FOCUS}`} style={{ color: 'var(--teal)' }}>Set another meeting</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Video size={17} style={{ color: 'var(--teal)' }} aria-hidden /> Set a Meeting
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
          {canCreateLink
            ? 'Book someone with published availability, or just create a link with the people you tick.'
            : 'Book a 1-on-1 with someone who has published their availability.'}
        </p>
      </div>

      {/* Mode toggle — only when the account can create ad-hoc links. */}
      {canCreateLink && (
        <PillTabs
          label="How to set the meeting"
          size="sm"
          value={mode}
          onChange={(id) => { setMode(id as Mode); setError(null) }}
          tabs={[
            { id: 'person', label: <><User size={13} aria-hidden /> With a person</> },
            { id: 'link', label: <><Users size={13} aria-hidden /> Just create a link</> },
          ]}
        />
      )}

      {/* ─────────────── Mode: With a person ─────────────── */}
      {mode === 'person' && (
        <>
          <div>
            <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}>Who do you want to meet?</label>
            {people === null ? (
              <p className="text-[13px] flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="animate-spin" /> Loading…</p>
            ) : people.length === 0 ? (
              <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>No one has published availability yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <button key={p.staffId} onClick={() => pick(p)} aria-pressed={selected?.staffId === p.staffId} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${FOCUS} ${selected?.staffId === p.staffId ? 'bg-[var(--deep-teal)] text-white border-[var(--deep-teal)]' : 'bg-white text-[var(--charcoal)] border-[var(--light-gray)] hover:bg-[#F8FAF2]'}`}>
                    <User size={13} /> {p.name}{p.department ? <span className={selected?.staffId === p.staffId ? 'text-white/70' : 'text-[var(--mid-gray)]'}> · {p.department}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <>
              <div className="rounded-xl p-3.5" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <p className={`${LABEL} !mb-2`} style={LABEL_STYLE}>{selected.name}&apos;s availability</p>
                {slots === null ? (
                  <p className="text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading…</p>
                ) : slots.length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>No availability published — you can still propose a time below.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 text-[12px] font-medium bg-white text-[var(--deep-teal)] border border-[var(--light-gray)] px-2.5 py-1 rounded-lg">
                        <Clock size={12} /> {dayRange(s.dayFrom, s.dayTo)} · {to12(s.timeStart)}–{to12(s.timeEnd)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl p-4 space-y-3" style={CARD_STYLE}>
                <WhenFields
                  title={title} setTitle={setTitle} titlePlaceholder="e.g. Case discussion"
                  date={date} setDate={setDate}
                  hour={hour} setHour={setHour} minute={minute} setMinute={setMinute} ampm={ampm} setAmpm={setAmpm}
                />
                {error && <p role="alert" className="text-xs" style={{ color: DANGER }}>{error}</p>}
                <div className="flex justify-end">
                  <button onClick={bookPerson} disabled={submitting} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
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
        <div className="rounded-xl p-4 space-y-4" style={CARD_STYLE}>
          <WhenFields
            title={title} setTitle={setTitle} titlePlaceholder="e.g. Weekly supervision"
            date={date} setDate={setDate}
            hour={hour} setHour={setHour} minute={minute} setMinute={setMinute} ampm={ampm} setAmpm={setAmpm}
          />

          <div>
            <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}><Users size={12} className="inline mr-1" aria-hidden />Invite <span className="normal-case font-normal tracking-normal">(optional, your department)</span></label>
            {!anyInvitees && (
              <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>No one in your department to invite — you can still create the link.</p>
            )}
            {groups.map((g) => g.people.length > 0 && (
              <PeopleGroup key={g.key} label={g.label} people={g.people} picked={picked} toggle={togglePick} />
            ))}
          </div>

          {error && <p role="alert" className="text-xs" style={{ color: DANGER }}>{error}</p>}
          <div className="flex justify-end">
            <button onClick={createLink} disabled={submitting} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
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
        <label className={LABEL} style={LABEL_STYLE}>Title / purpose (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titlePlaceholder} className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <label className={LABEL} style={LABEL_STYLE}><Calendar size={12} className="inline mr-1" />Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CONTROL} style={CONTROL_STYLE} />
        </div>
        <div>
          <label className={LABEL} style={LABEL_STYLE}><Clock size={12} className="inline mr-1" />Time</label>
          <div className="flex items-center gap-1">
            <select value={hour} onChange={(e) => setHour(e.target.value)} className={CONTROL} style={CONTROL_STYLE}>{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
            <span className="font-bold" style={{ color: 'var(--mid-gray)' }}>:</span>
            <select value={minute} onChange={(e) => setMinute(e.target.value)} className={CONTROL} style={CONTROL_STYLE}>{MINUTES.map((m) => <option key={m}>{m}</option>)}</select>
            <div className="flex h-9 rounded-lg overflow-hidden ml-1" style={{ border: '1px solid var(--light-gray)' }}>
              {(['AM', 'PM'] as const).map((x) => (
                <button key={x} onClick={() => setAmpm(x)} aria-pressed={ampm === x} className={`px-3 text-[12px] font-semibold ${FOCUS} ${ampm === x ? 'bg-[var(--deep-teal)] text-white' : 'bg-white text-[var(--mid-gray)] hover:bg-[#F8FAF2]'}`}>{x}</button>
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
      <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => {
          const on = !!picked[p.staffId]
          return (
            <button
              key={p.staffId}
              onClick={() => toggle(p)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${FOCUS} ${on ? 'bg-[var(--deep-teal)] text-white border-[var(--deep-teal)]' : 'bg-white text-[var(--charcoal)] border-[var(--light-gray)] hover:bg-[#F8FAF2]'}`}
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
