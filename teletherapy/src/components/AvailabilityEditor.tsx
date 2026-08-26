'use client'

// "My Availability" — a Calendly-style weekly availability editor. The owner
// publishes day+time windows so mentees / interns know when they can book a
// 1-on-1 (see SetMeeting). Shown for supervisors / mentors only.

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, Clock } from 'lucide-react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
interface Slot { id: string; dayFrom: number; dayTo: number; timeStart: string; timeEnd: string }

function to12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  const ap = h < 12 ? 'AM' : 'PM'
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`
}
const dayRange = (f: number, t: number) => (f === t ? DAYS[f] : `${DAYS[f]}–${DAYS[t]}`)

export default function AvailabilityEditor() {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [dayFrom, setDayFrom] = useState(1)
  const [dayTo, setDayTo] = useState(5)
  const [timeStart, setTimeStart] = useState('09:00')
  const [timeEnd, setTimeEnd] = useState('17:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await fetch('/api/availability', { cache: 'no-store' })
      const d = await r.json()
      setSlots(r.ok ? (d.slots ?? []) : [])
    } catch { setSlots([]) }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    setError(null)
    setSaving(true)
    try {
      const r = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayFrom, dayTo, timeStart, timeEnd }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not add availability.')
      setSlots((s) => [...(s ?? []), d.slot])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add availability.')
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    try {
      const r = await fetch(`/api/availability/${id}`, { method: 'DELETE' })
      if (r.ok) setSlots((s) => (s ?? []).filter((x) => x.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <Clock size={18} className="text-[var(--teal)]" /> My Availability
        </h3>
        <p className="text-[12px] text-[var(--mid-gray)]">Publish the days &amp; times you&apos;re generally free so others can book a 1-on-1 with you.</p>
      </div>

      <div className="card-static !p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">From day</label>
          <select value={dayFrom} onChange={(e) => setDayFrom(Number(e.target.value))} className="px-2 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">To day</label>
          <select value={dayTo} onChange={(e) => setDayTo(Number(e.target.value))} className="px-2 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">From</label>
          <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className="px-2 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--mid-gray)] mb-1">To</label>
          <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className="px-2 py-2 text-[13px] rounded-lg border border-[var(--light-gray)] bg-white" />
        </div>
        <button onClick={add} disabled={saving} className="inline-flex items-center gap-2 bg-[var(--narra)] text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />} Add
        </button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}

      {slots === null ? (
        <p className="text-[13px] text-[var(--mid-gray)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : slots.length === 0 ? (
        <div className="card-static text-center py-8">
          <Clock size={22} className="text-[var(--light-gray)] mx-auto mb-2" />
          <p className="text-[13px] text-[var(--mid-gray)]">No availability set yet. Add a window above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map((s) => (
            <div key={s.id} className="card-static !p-3 flex items-center gap-3">
              <Clock size={15} className="text-[var(--teal)] shrink-0" />
              <span className="text-[13px] font-semibold text-[var(--charcoal)]">{dayRange(s.dayFrom, s.dayTo)}</span>
              <span className="text-[12px] text-[var(--mid-gray)]">{to12(s.timeStart)} – {to12(s.timeEnd)}</span>
              <button onClick={() => remove(s.id)} title="Remove" className="ml-auto text-[var(--mid-gray)] hover:text-red-600 p-1"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
