'use client'

// "My Availability" — a Calendly-style weekly availability editor. The owner
// publishes day+time windows so mentees / interns know when they can book a
// 1-on-1 (see SetMeeting). Shown for supervisors / mentors only.

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, Clock } from 'lucide-react'
import {
  BTN_PRIMARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, DANGER, EmptyState, LABEL, LABEL_STYLE, PRIMARY_STYLE, RowsSkeleton,
} from '@/components/hub/ui'

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
        <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Clock size={17} style={{ color: 'var(--teal)' }} aria-hidden /> My Availability
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Publish the days &amp; times you&apos;re generally free so others can book a 1-on-1 with you.</p>
      </div>

      <div className="rounded-xl p-4 flex flex-wrap items-end gap-3" style={CARD_STYLE}>
        <div>
          <label className={LABEL} style={LABEL_STYLE}>From day</label>
          <select value={dayFrom} onChange={(e) => setDayFrom(Number(e.target.value))} className={CONTROL} style={CONTROL_STYLE}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </div>
        <div>
          <label className={LABEL} style={LABEL_STYLE}>To day</label>
          <select value={dayTo} onChange={(e) => setDayTo(Number(e.target.value))} className={CONTROL} style={CONTROL_STYLE}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </div>
        <div>
          <label className={LABEL} style={LABEL_STYLE}>From</label>
          <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className={CONTROL} style={CONTROL_STYLE} />
        </div>
        <div>
          <label className={LABEL} style={LABEL_STYLE}>To</label>
          <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className={CONTROL} style={CONTROL_STYLE} />
        </div>
        <button onClick={add} disabled={saving} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />} Add
        </button>
      </div>
      {error && <p role="alert" className="text-xs" style={{ color: DANGER }}>{error}</p>}

      {slots === null ? (
        <div className="rounded-xl" style={CARD_STYLE}><RowsSkeleton rows={3} label="Loading availability" /></div>
      ) : slots.length === 0 ? (
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState icon="clock" title="No availability set yet" hint="Add a window above." />
        </section>
      ) : (
        <ul className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          {slots.map((s, i) => (
            <li key={s.id} className="px-4 py-2.5 flex items-center gap-3" style={i ? { borderTop: '1px solid var(--light-gray)' } : undefined}>
              <Clock size={15} className="shrink-0" style={{ color: 'var(--teal)' }} aria-hidden />
              <span className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{dayRange(s.dayFrom, s.dayTo)}</span>
              <span className="text-xs" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>{to12(s.timeStart)} – {to12(s.timeEnd)}</span>
              <button onClick={() => remove(s.id)} title="Remove" aria-label="Remove availability window" className={`${BTN_SM} ml-auto hover:!bg-red-50 hover:!text-[#B42318]`} style={{ color: 'var(--mid-gray)' }}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
