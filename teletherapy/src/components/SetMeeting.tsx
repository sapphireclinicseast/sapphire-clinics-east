'use client'

// "Set a Meeting" — book a 1-on-1 with someone who published availability.
// Pick a person → see their weekly availability → choose a date + time. Creates
// a meeting inviting them (both get a host link, so either can record).

import { useEffect, useState } from 'react'
import { Loader2, Video, Calendar, Clock, Check, User } from 'lucide-react'

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

export default function SetMeeting({ context, onBooked }: { context: 'INTERNSHIP' | 'MENTORSHIP'; onBooked?: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [selected, setSelected] = useState<Person | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [hour, setHour] = useState('2')
  const [minute, setMinute] = useState('00')
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/bookable-staff', { cache: 'no-store' }).then((r) => r.json()).then((d) => setPeople(d.staff ?? [])).catch(() => setPeople([]))
  }, [])

  const pick = async (p: Person) => {
    setSelected(p); setSlots(null)
    try {
      const r = await fetch(`/api/availability/staff/${p.staffId}`, { cache: 'no-store' })
      const d = await r.json()
      setSlots(r.ok ? (d.slots ?? []) : [])
    } catch { setSlots([]) }
  }

  const book = async () => {
    setError(null)
    if (!selected) { setError('Pick someone to meet.'); return }
    if (!date) { setError('Pick a date.'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/intern-supervision/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, title, date, timeLabel: `${hour}:${minute} ${ampm}`, invitees: [{ staffId: selected.staffId, name: selected.name }] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not set the meeting.')
      setDone(true)
      onBooked?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the meeting.')
    } finally { setSubmitting(false) }
  }

  if (done) {
    return (
      <div className="card-static text-center py-10">
        <div className="w-12 h-12 rounded-full bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-3"><Check size={22} className="text-[var(--teal)]" /></div>
        <p className="font-semibold text-[var(--charcoal)]">Meeting set with {selected?.name}</p>
        <p className="text-[13px] text-[var(--mid-gray)] mt-1">They&apos;ve been notified. Find it under <strong>Meeting Schedule</strong>.</p>
        <button onClick={() => { setDone(false); setSelected(null); setSlots(null); setDate(''); setTitle('') }} className="mt-4 text-[13px] text-[var(--teal)] font-semibold hover:underline">Set another meeting</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <Video size={18} className="text-[var(--teal)]" /> Set a Meeting
        </h3>
        <p className="text-[12px] text-[var(--mid-gray)]">Book a 1-on-1 with someone who has published their availability.</p>
      </div>

      {/* Person picker */}
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
          {/* Their availability */}
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

          {/* When */}
          <div className="card-static !p-4 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">Purpose (optional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Case discussion" className="w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white" />
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
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button onClick={book} disabled={submitting} className="inline-flex items-center gap-2 bg-[var(--narra)] text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Video size={15} />} Set meeting
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
